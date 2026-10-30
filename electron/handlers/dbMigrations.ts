// IPC for in-app database upgrades (desktop only). The renderer hands over the connection string
// once; the main process keeps it in memory for this run of the app (and, if asked, encrypted on
// disk through dbMigrationsCredential.ts), connects, plans and applies. The string is never sent
// back to the renderer, never logged and never sent anywhere but the database it names.
//
// Channels:
//   db-upgrade:bundle             what SQL this app carries (no database)
//   db-upgrade:credential-status  whether a string is held for this user and project
//   db-upgrade:set-credential     validate and hold a string (optionally remember it)
//   db-upgrade:forget-credential  drop the held and the remembered string
//   db-upgrade:plan               connect and report what the database needs (reads only)
//   db-upgrade:apply              connect, apply, verify; progress on db-upgrade:progress
import { app, ipcMain, type BrowserWindow } from 'electron'
import path from 'path'

import { BASELINE_VERSION, LEGACY_VERSION, loadSqlBundle, type SqlBundle } from './dbMigrationsBundle'
import {
  canRememberCredential,
  forgetCredential,
  hasRememberedCredential,
  loadRememberedCredential,
  rememberCredential,
} from './dbMigrationsCredential'
import {
  openPgSession,
  parseConnectionString,
  projectRefFromSupabaseUrl,
  redactSecret,
  secretsOf,
  type ParsedConnection,
} from './dbMigrationsPg'
import {
  applyMigrations,
  planMigrations,
  type ApplyProgress,
  type ApplyResult,
  type MigrationPlan,
} from './dbMigrationsRunner'

export interface DbMigrationsHandlerDependencies {
  log: (message: string, data?: unknown) => void
  logError: (message: string, data?: unknown) => void
}

/**
 * Which Supabase project the renderer is signed in to. The only thing taken from the renderer:
 * it keeps a string for one project from being used against another. No user identity is taken
 * from the renderer; the connection string is a database credential and the database decides.
 */
interface DbContext {
  supabaseUrl: string | null
}

interface HeldCredential {
  connectionString: string
  projectRef: string | null
}

const CHANNELS = [
  'db-upgrade:bundle',
  'db-upgrade:credential-status',
  'db-upgrade:set-credential',
  'db-upgrade:forget-credential',
  'db-upgrade:plan',
  'db-upgrade:apply',
] as const

let held: HeldCredential | null = null
let running = false

export function sqlRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'sql')
    : path.join(app.getAppPath(), 'supabase')
}

function readContext(input: unknown): DbContext | null {
  if (!input || typeof input !== 'object') return null
  const { supabaseUrl } = input as Record<string, unknown>
  if (supabaseUrl !== null && supabaseUrl !== undefined && typeof supabaseUrl !== 'string') return null
  return { supabaseUrl: typeof supabaseUrl === 'string' ? supabaseUrl.slice(0, 2048) : null }
}

/** The string for this project: the one handed over this run, else the remembered one. */
function credentialFor(ctx: DbContext): string | null {
  const projectRef = projectRefFromSupabaseUrl(ctx.supabaseUrl)
  if (held && held.projectRef === projectRef) return held.connectionString
  return loadRememberedCredential(projectRef)
}

function connectionFor(ctx: DbContext):
  | { ok: true; connection: ParsedConnection; secrets: string[] }
  | { ok: false; error: string } {
  const connectionString = credentialFor(ctx)
  if (!connectionString) return { ok: false, error: 'no-credential' }
  const parsed = parseConnectionString(connectionString, projectRefFromSupabaseUrl(ctx.supabaseUrl))
  if (!parsed.ok) return { ok: false, error: parsed.reason }
  return {
    ok: true,
    connection: parsed.connection,
    secrets: secretsOf(connectionString, parsed.connection),
  }
}

function connectError(err: unknown, secrets: string[]): string {
  const e = err as { message?: unknown; code?: unknown }
  const message = typeof e?.message === 'string' ? e.message : String(err)
  const code = typeof e?.code === 'string' ? ` (${e.code})` : ''
  return redactSecret(`${message}${code}`, secrets)
}

export function registerDbMigrationsHandlers(
  window: BrowserWindow,
  deps: DbMigrationsHandlerDependencies,
): void {
  let bundleCache: SqlBundle | null = null
  const bundle = (): SqlBundle => {
    bundleCache ??= loadSqlBundle(sqlRoot())
    return bundleCache
  }

  ipcMain.handle('db-upgrade:bundle', () => {
    try {
      const b = bundle()
      return {
        success: true,
        baselineVersion: BASELINE_VERSION,
        legacyVersion: LEGACY_VERSION,
        hasBaseline: b.baseline.length > 0,
        hasLegacy: b.legacy !== null,
        migrations: b.migrations.map((m) => ({ version: m.version, name: m.name })),
      }
    } catch (err) {
      deps.logError('[DbUpgrade] Could not read the bundled SQL', { error: String(err) })
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('db-upgrade:credential-status', (_e, input: unknown) => {
    const ctx = readContext(input)
    if (!ctx) return { held: false, remembered: false, canRemember: canRememberCredential() }
    const projectRef = projectRefFromSupabaseUrl(ctx.supabaseUrl)
    return {
      held: !!held && held.projectRef === projectRef,
      remembered: hasRememberedCredential(projectRef),
      canRemember: canRememberCredential(),
    }
  })

  ipcMain.handle('db-upgrade:set-credential', (_e, input: unknown) => {
    const ctx = readContext(input)
    const { connectionString, remember } = (input ?? {}) as Record<string, unknown>
    if (!ctx || typeof connectionString !== 'string' || connectionString.length > 4096) {
      return { success: false, error: 'format' }
    }
    const projectRef = projectRefFromSupabaseUrl(ctx.supabaseUrl)
    const parsed = parseConnectionString(connectionString, projectRef)
    if (!parsed.ok) return { success: false, error: parsed.reason }
    held = { connectionString: connectionString.trim(), projectRef }
    let remembered = false
    if (remember === true) {
      try {
        remembered = rememberCredential(held.connectionString, projectRef)
      } catch (err) {
        deps.logError('[DbUpgrade] Could not remember the connection', {
          error: redactSecret(String(err), secretsOf(connectionString, parsed.connection)),
        })
      }
    } else {
      forgetCredential()
    }
    deps.log('[DbUpgrade] Connection details received', { remembered })
    return { success: true, remembered }
  })

  ipcMain.handle('db-upgrade:forget-credential', () => {
    held = null
    forgetCredential()
    deps.log('[DbUpgrade] Connection details forgotten')
    return { success: true }
  })

  ipcMain.handle('db-upgrade:plan', async (_e, input: unknown) => {
    const ctx = readContext(input)
    if (!ctx) return { success: false, error: 'format' }
    const conn = connectionFor(ctx)
    if (!conn.ok) return { success: false, error: conn.error }
    let session: Awaited<ReturnType<typeof openPgSession>> | null = null
    try {
      const b = bundle()
      session = await openPgSession(conn.connection, b.caCertificates)
      const plan: MigrationPlan = await planMigrations(session.client, b)
      return { success: true, plan }
    } catch (err) {
      const error = connectError(err, conn.secrets)
      deps.logError('[DbUpgrade] Planning failed', { error })
      return { success: false, error: 'connect', message: error }
    } finally {
      await session?.close()
    }
  })

  ipcMain.handle('db-upgrade:apply', async (_e, input: unknown) => {
    const ctx = readContext(input)
    if (!ctx) return { success: false, error: 'format' }
    if (running) return { success: false, error: 'running' }
    const { appliedBy, automatic } = (input ?? {}) as Record<string, unknown>
    const conn = connectionFor(ctx)
    if (!conn.ok) return { success: false, error: conn.error }

    running = true
    let session: Awaited<ReturnType<typeof openPgSession>> | null = null
    try {
      const b = bundle()
      try {
        session = await openPgSession(conn.connection, b.caCertificates)
      } catch (err) {
        const error = connectError(err, conn.secrets)
        deps.logError('[DbUpgrade] Could not connect', { error })
        return { success: false, error: 'connect', message: error }
      }
      deps.log('[DbUpgrade] Applying database upgrade', { automatic: automatic === true })
      const result: ApplyResult = await applyMigrations(session.client, b, {
        // A label for schema_migration.applied_by, not an identity anything is decided on; the
        // database session user is recorded beside it.
        appliedBy: typeof appliedBy === 'string' ? appliedBy.slice(0, 320) : null,
        appVersion: app.getVersion(),
        redact: (text) => redactSecret(text, conn.secrets),
        onProgress: (progress: ApplyProgress) => {
          if (!window.isDestroyed()) window.webContents.send('db-upgrade:progress', progress)
        },
      })
      if (result.success) {
        deps.log('[DbUpgrade] Database upgrade finished', {
          steps: result.appliedSteps.map((s) => s.name),
          finalVersion: result.finalVersion,
        })
      } else {
        deps.logError('[DbUpgrade] Database upgrade failed', {
          step: result.error?.step?.name ?? null,
          file: result.error?.file ?? null,
          line: result.error?.line ?? null,
          code: result.error?.code ?? null,
          message: result.error?.message ?? null,
        })
      }
      return { success: result.success, result }
    } finally {
      running = false
      await session?.close()
    }
  })
}

export function unregisterDbMigrationsHandlers(): void {
  for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  held = null
}
