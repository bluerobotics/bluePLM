// The SQL the app carries, read from disk: the 5.0 baseline, the forward migrations, the 4.10
// snapshot for databases below schema 112 and the verify scripts. Pure Node (fs, crypto), no
// Electron and no database, so the runner tests read the same loader the app does.
//
// Layout (relative to the SQL root: `supabase/` in a checkout, `resources/sql/` when packaged):
//   core.sql, modules/*.sql             the baseline, applied in that order (modules by name)
//   migrations/NNNN_<name>.sql          forward migrations; NNNN is the schema version it brings
//                                       the database to (0500_from_4x.sql -> 500)
//   tools/verify-schema.sql             verifies and stamps the current release
//   legacy-4.10/core.sql, modules/*.sql, tools/verify-schema.sql
//                                       tag v4.10.0's supabase/ (schema 112), frozen
//   certs/*.crt|*.pem                   extra CA certificates trusted for the database TLS
//
// Text is normalized to LF before it is hashed or run, so a Windows checkout with autocrlf and
// a packaged Linux build agree on every checksum.
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

/** The schema version the 5.0 baseline (core.sql + modules) installs. Fixed from 5.0 on. */
export const BASELINE_VERSION = 500
/** The schema version tag v4.10.0 stamps; the 0500 migration starts from it. */
export const LEGACY_VERSION = 112

export interface SqlFile {
  /** Path relative to the SQL root, forward slashes (shown to the admin, never a full path). */
  relPath: string
  sql: string
  checksum: string
}

export interface MigrationFile extends SqlFile {
  version: number
  /** File name without the extension, e.g. `0500_from_4x`. */
  name: string
  /**
   * First line is `-- blueplm:no-transaction`: the file holds statements Postgres refuses inside
   * a transaction block (ALTER TYPE ... ADD VALUE whose value is used later, CREATE INDEX
   * CONCURRENTLY). The runner sends it one statement at a time with no transaction and records
   * it only once every statement succeeded, so such a file must be idempotent: a failure part-way
   * leaves the statements before it applied, and the next run starts the file again from the top.
   */
  noTransaction: boolean
}

export const NO_TRANSACTION_MARKER = '-- blueplm:no-transaction'

export interface SqlBundle {
  baseline: SqlFile[]
  verify: SqlFile | null
  migrations: MigrationFile[]
  legacy: { files: SqlFile[]; verify: SqlFile } | null
  /** PEM text of every bundled CA certificate. */
  caCertificates: string[]
}

const MIGRATION_NAME = /^(\d{4})_([a-z0-9_]+)\.sql$/

export function normalizeSql(text: string): string {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  return body.replace(/\r\n/g, '\n')
}

export function checksumOf(sql: string): string {
  return createHash('sha256').update(normalizeSql(sql), 'utf8').digest('hex')
}

function readSql(root: string, relPath: string): SqlFile {
  const sql = normalizeSql(fs.readFileSync(path.join(root, relPath), 'utf8'))
  return { relPath, sql, checksum: checksumOf(sql) }
}

function listSql(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function baselineFiles(root: string, prefix: string): SqlFile[] {
  const base = prefix ? path.join(root, prefix) : root
  if (!fs.existsSync(path.join(base, 'core.sql'))) return []
  const join = (p: string) => (prefix ? `${prefix}/${p}` : p)
  return [
    readSql(root, join('core.sql')),
    ...listSql(path.join(base, 'modules')).map((f) => readSql(root, join(`modules/${f}`))),
  ]
}

/**
 * Reads the bundle. Throws on a migration file whose name breaks the layout or on two files
 * with the same number: either would make "which migrations are applied" ambiguous.
 */
export function loadSqlBundle(root: string): SqlBundle {
  const migrations: MigrationFile[] = []
  const seen = new Map<number, string>()
  for (const file of listSql(path.join(root, 'migrations'))) {
    const match = MIGRATION_NAME.exec(file)
    if (!match) throw new Error(`Migration file name does not match NNNN_name.sql: ${file}`)
    const version = Number(match[1])
    const other = seen.get(version)
    if (other) throw new Error(`Two migrations share number ${version}: ${other} and ${file}`)
    seen.set(version, file)
    const sqlFile = readSql(root, `migrations/${file}`)
    migrations.push({
      ...sqlFile,
      version,
      name: file.replace(/\.sql$/, ''),
      noTransaction: sqlFile.sql.split('\n', 1)[0].trim() === NO_TRANSACTION_MARKER,
    })
  }
  migrations.sort((a, b) => a.version - b.version)

  const verifyPath = path.join(root, 'tools', 'verify-schema.sql')
  const legacyFiles = baselineFiles(root, 'legacy-4.10')
  const legacyVerify = path.join(root, 'legacy-4.10', 'tools', 'verify-schema.sql')

  const certDir = path.join(root, 'certs')
  const caCertificates = fs.existsSync(certDir)
    ? fs
        .readdirSync(certDir)
        .filter((f) => /\.(crt|pem)$/i.test(f))
        .sort()
        .map((f) => fs.readFileSync(path.join(certDir, f), 'utf8'))
    : []

  return {
    baseline: baselineFiles(root, ''),
    verify: fs.existsSync(verifyPath) ? readSql(root, 'tools/verify-schema.sql') : null,
    migrations,
    legacy:
      legacyFiles.length > 0 && fs.existsSync(legacyVerify)
        ? { files: legacyFiles, verify: readSql(root, 'legacy-4.10/tools/verify-schema.sql') }
        : null,
    caCertificates,
  }
}

// ---------------------------------------------------------------------------
// Locating the failing statement

export interface StatementSpan {
  start: number
  end: number
}

/**
 * Splits a script into statements by top-level semicolons, skipping quoted strings, quoted
 * identifiers, dollar-quoted bodies and comments. Only used to name the statement an error
 * position points into; the script itself is always sent whole.
 */
export function splitStatements(sql: string): StatementSpan[] {
  const spans: StatementSpan[] = []
  let start = 0
  let i = 0
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === '-' && next === '-') {
      const eol = sql.indexOf('\n', i)
      i = eol === -1 ? n : eol + 1
    } else if (c === '/' && next === '*') {
      let depth = 1
      i += 2
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--
          i += 2
        } else i++
      }
    } else if (c === "'" || c === '"') {
      // E'...' strings take backslash escapes; a plain string does not.
      const escapes =
        c === "'" && /[eE]/.test(sql[i - 1] ?? '') && !/[A-Za-z0-9_]/.test(sql[i - 2] ?? '')
      i++
      while (i < n) {
        if (sql[i] === c && sql[i + 1] === c) i += 2
        else if (sql[i] === c) {
          i++
          break
        } else if (escapes && sql[i] === '\\') i += 2
        else i++
      }
    } else if (c === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i, i + 64))
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length)
        i = close === -1 ? n : close + tag[0].length
      } else i++
    } else if (c === ';') {
      spans.push({ start, end: i + 1 })
      i++
      start = i
    } else i++
  }
  if (sql.slice(start).trim()) spans.push({ start, end: n })
  return spans
}

export interface StatementLocation {
  line: number
  statement: string
}

/** Line number (1-based) and statement text for a Postgres error position (1-based character offset). */
export function locateStatement(sql: string, position: number): StatementLocation | null {
  if (!Number.isFinite(position) || position < 1 || position > sql.length + 1) return null
  const offset = position - 1
  const line = sql.slice(0, offset).split('\n').length
  const span = splitStatements(sql).find((s) => offset >= s.start && offset < s.end)
  if (!span) return { line, statement: '' }
  // Drop the comment lines and blank lines a statement span starts with.
  const raw = sql.slice(span.start, span.end)
  const lines = raw.split('\n')
  while (lines.length > 0 && (lines[0].trim() === '' || lines[0].trim().startsWith('--'))) {
    lines.shift()
  }
  const statement = lines.join('\n').trim()
  const MAX = 1200
  return { line, statement: statement.length > MAX ? `${statement.slice(0, MAX)}\n...` : statement }
}
