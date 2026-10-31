// The database connection the migration runner uses in the app: node-postgres over TLS with the
// certificate verified. The connection string is parsed here into explicit settings, so nothing
// in it (sslmode=disable, a host override) can turn TLS or verification off.
//
// Secret hygiene: the string, its password and the parsed config never leave the main process.
// redactSecret() strips them from any message before it is returned or logged.
import tls from 'tls'
import { Client, type ClientConfig } from 'pg'

import type { SqlClient } from './dbMigrationsRunner'

export interface ParsedConnection {
  host: string
  port: number
  user: string
  password: string
  database: string
  /** Supabase project ref named by the user (`postgres.<ref>`) or host (`db.<ref>.supabase.co`). */
  projectRef: string | null
}

export type ParseResult =
  | { ok: true; connection: ParsedConnection }
  | {
      ok: false
      reason: 'format' | 'transaction-pooler' | 'no-password' | 'password-brackets' | 'project-mismatch'
    }

const SUPABASE_POOLER_TRANSACTION_PORT = 6543

/** The project ref in a Supabase project URL (`https://<ref>.supabase.co`), or null. */
export function projectRefFromSupabaseUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    const match = /^([a-z0-9]+)\.supabase\.(co|in)$/i.exec(host)
    return match ? match[1].toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * Parses a `postgresql://user:password@host:port/database` string. Refuses the transaction
 * pooler (port 6543): it hands each transaction to a different server session, so the advisory
 * lock and the session-scoped work of a migration would not hold. When `expectedProjectRef` is
 * known and the string names a different Supabase project, it is refused too: an upgrade must
 * run against the database this app is signed in to.
 */
export function parseConnectionString(
  input: string,
  expectedProjectRef: string | null,
): ParseResult {
  const text = input.trim()
  if (!/^postgres(ql)?:\/\//i.test(text)) return { ok: false, reason: 'format' }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, reason: 'format' }
  }
  if (!url.hostname || !url.username) return { ok: false, reason: 'format' }
  let user: string
  let password: string
  try {
    user = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
  } catch {
    return { ok: false, reason: 'format' }
  }
  if (!password) return { ok: false, reason: 'no-password' }
  // The dashboard's placeholder is [YOUR-PASSWORD]; pasting a password inside its brackets is the
  // usual mistake, and the server only answers with a bare authentication failure.
  if (/^\[.*\]$/.test(password)) return { ok: false, reason: 'password-brackets' }
  const port = url.port ? Number(url.port) : 5432
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return { ok: false, reason: 'format' }
  if (port === SUPABASE_POOLER_TRANSACTION_PORT) return { ok: false, reason: 'transaction-pooler' }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres'

  const fromUser = /^[a-z_]+\.([a-z0-9]+)$/i.exec(user)?.[1] ?? null
  const fromHost = /^db\.([a-z0-9]+)\.supabase\.(co|in)$/i.exec(host)?.[1] ?? null
  const projectRef = (fromUser ?? fromHost)?.toLowerCase() ?? null
  if (expectedProjectRef && projectRef && projectRef !== expectedProjectRef.toLowerCase()) {
    return { ok: false, reason: 'project-mismatch' }
  }
  return { ok: true, connection: { host, port, user, password, database, projectRef } }
}

/** Removes the connection string and its password from a message. */
export function redactSecret(text: string, secrets: ReadonlyArray<string>): string {
  let out = text
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join('[redacted]')
  }
  // Any URL-shaped credential that slipped through (e.g. from a driver message).
  return out.replace(/postgres(ql)?:\/\/[^\s@]*@/gi, 'postgresql://[redacted]@')
}

export function secretsOf(connectionString: string, parsed: ParsedConnection | null): string[] {
  const out = [connectionString.trim()]
  if (parsed) {
    out.push(parsed.password)
    try {
      out.push(encodeURIComponent(parsed.password))
    } catch {
      // ignore
    }
  }
  return out
}

/**
 * TLS is required and the server certificate is verified against the system roots plus the CA
 * certificates bundled with the app (Supabase signs its database certificates with its own root).
 */
export function pgConfig(connection: ParsedConnection, caCertificates: string[]): ClientConfig {
  return {
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    ssl: {
      rejectUnauthorized: true,
      ca: [...tls.rootCertificates, ...caCertificates],
      servername: /^[\d.:]+$/.test(connection.host) ? undefined : connection.host,
    },
    connectionTimeoutMillis: 20_000,
    // Statements may run for minutes (the 0500 rename); no statement timeout from the client.
    application_name: 'BluePLM schema upgrade',
  }
}

export interface PgSession {
  client: SqlClient
  close: () => Promise<void>
}

export async function openPgSession(
  connection: ParsedConnection,
  caCertificates: string[],
): Promise<PgSession> {
  const client = new Client(pgConfig(connection, caCertificates))
  // An idle-connection error after a failure must not crash the main process.
  client.on('error', () => {})
  await client.connect()
  const sqlClient: SqlClient = {
    async query<T>(sql: string, params?: unknown[]) {
      const result = await client.query(sql, params as unknown[] | undefined)
      return { rows: result.rows as T[] }
    },
    async exec(sql: string) {
      // No parameters: the simple query protocol, which takes a whole script.
      await client.query(sql)
    },
  }
  return {
    client: sqlClient,
    close: async () => {
      try {
        await client.end()
      } catch {
        // already closed
      }
    },
  }
}
