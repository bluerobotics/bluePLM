// 5.0 final audit H7: renamed columns in the strings `tsc` cannot check.
//
// A PostgREST column list is a plain string, and so is the key of a filter or an order. When a column was
// renamed for 5.0 (`enabled` -> `is_enabled`, `last_test_success` -> `is_last_test_successful`, ...) a list or
// key that still names the old column compiles, and fails only at runtime with "column does not exist". Three
// such strings survived the codemod (a module-level `ROW_COLUMNS`, `SAVED_CONFIG_COLUMNS` and a concatenated
// `RUN_COLUMNS`), which is what this guards against.
//
// What counts, read from `supabase/rename-map-5.0.json` (old columns) and `src/types/supabase.ts` (the
// columns each 5.0 table has):
// - A string tied to a table through its `.from('<table>')` chain (`.select`, `.eq`/`.order`/... keys,
//   `.update`/`.insert`/`.upsert` object keys): an old column of that table that the table no longer has.
// - A column list that is not tied to a table (a module constant, a concatenation of literals): an old
//   column that a table it belongs to no longer has. A generic one-word name (`enabled`, `read`, ...) counts
//   only when the list also names another column of that table, so `'id, name, enabled'` built for some
//   other purpose is not taken for a database list.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SELF = fileURLToPath(import.meta.url)
const ROOT = join(dirname(SELF), '..', '..', '..')
const SCAN_ROOTS = ['src', 'api', 'electron', join('web', 'src')]
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-electron', 'dist-web', 'release', 'coverage', '.git'])

interface ColumnRename {
  table: string
  newTable: string
  column: string
  to: string
}

const renames = (
  JSON.parse(readFileSync(join(ROOT, 'supabase', 'rename-map-5.0.json'), 'utf8')) as { columns: ColumnRename[] }
).columns.filter((c) => c.column !== c.to)

/** Columns of every 5.0 table and view, from the generated types (`Row`). */
function currentColumns(): Map<string, Set<string>> {
  const file = join(ROOT, 'src', 'types', 'supabase.ts')
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const out = new Map<string, Set<string>>()
  const members = (node: ts.TypeNode | undefined) => (node && ts.isTypeLiteralNode(node) ? node.members : [])
  const nameOf = (m: ts.TypeElement) => (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) ? m.name.text : null)
  const find = (list: readonly ts.TypeElement[], name: string) =>
    list.find((m) => nameOf(m) === name) as ts.PropertySignature | undefined
  ts.forEachChild(sf, (node) => {
    if (!ts.isTypeAliasDeclaration(node) || node.name.text !== 'Database') return
    const pub = find(members(node.type), 'public')
    for (const section of ['Tables', 'Views']) {
      const sec = find(members(pub?.type), section)
      for (const table of members(sec?.type)) {
        const row = find(members((table as ts.PropertySignature).type), 'Row')
        const name = nameOf(table)
        if (name) out.set(name, new Set(members(row?.type).map(nameOf).filter((n): n is string => !!n)))
      }
    }
  })
  return out
}

const CURRENT = currentColumns()

/** newTable -> old column names that table no longer has. */
const OLD_BY_TABLE = new Map<string, Set<string>>()
for (const r of renames) {
  if (CURRENT.get(r.newTable)?.has(r.column)) continue
  if (!OLD_BY_TABLE.has(r.newTable)) OLD_BY_TABLE.set(r.newTable, new Set())
  OLD_BY_TABLE.get(r.newTable)!.add(r.column)
}
/** old column -> tables it was renamed in. */
const TABLES_BY_OLD = new Map<string, string[]>()
for (const [table, cols] of OLD_BY_TABLE) {
  for (const c of cols) TABLES_BY_OLD.set(c, [...(TABLES_BY_OLD.get(c) ?? []), table])
}

const isGeneric = (column: string) => !column.includes('_')

const FILTER_METHODS = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'order', 'not', 'match',
])
const WRITE_METHODS = new Set(['update', 'insert', 'upsert'])

/** The text of a string literal, or of a `+` concatenation of string literals. */
function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isParenthesizedExpression(node)) return literalText(node.expression)
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = literalText(node.left)
    const b = literalText(node.right)
    return a !== null && b !== null ? a + b : null
  }
  return null
}

/** Top-level plain column names of a PostgREST select list (embeds and `*` left out), or null if it is not one. */
function columnList(text: string): string[] | null {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  parts.push(cur.trim())
  if (parts.length < 2) return null
  const cols: string[] = []
  for (const p of parts) {
    if (p === '*' || p.includes('(')) continue
    if (!/^[a-z_][a-z0-9_]*$/.test(p)) return null
    cols.push(p)
  }
  return cols
}

/** The table of the `.from('<table>')` this call chain starts from, if any. */
function chainTable(node: ts.Expression): string | null {
  let n: ts.Node = node
  for (;;) {
    if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) n = n.expression
    else if (ts.isCallExpression(n)) {
      const callee = n.expression
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'from' && n.arguments[0]) {
        const t = literalText(n.arguments[0])
        if (t !== null) return t
      }
      n = callee
    } else if (ts.isPropertyAccessExpression(n)) n = n.expression
    else return null
  }
}

interface ColumnHit {
  line: number
  column: string
  table: string
  where: string
}

function scanColumns(fileName: string, text: string): ColumnHit[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
  const hits: ColumnHit[] = []
  const seen = new Set<ts.Node>()
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
  const tied = (node: ts.Node, table: string, cols: string[], where: string) => {
    seen.add(node)
    const old = OLD_BY_TABLE.get(table)
    for (const c of cols) if (old?.has(c)) hits.push({ line: at(node), column: c, table, where })
  }

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      const table = chainTable(node.expression.expression)
      const arg = node.arguments[0]
      if (table && arg) {
        const text = literalText(arg)
        if (method === 'select' && text !== null) {
          tied(arg, table, columnList(text) ?? (/^[a-z_][a-z0-9_]*$/.test(text.trim()) ? [text.trim()] : []), '.select')
        } else if (FILTER_METHODS.has(method) && text !== null) {
          tied(arg, table, [text.split('->')[0].trim()], `.${method}`)
        } else if (WRITE_METHODS.has(method)) {
          const objects = ts.isArrayLiteralExpression(arg) ? arg.elements : [arg]
          for (const o of objects) {
            if (!ts.isObjectLiteralExpression(o)) continue
            const keys = o.properties
              .map((p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null))
              .filter((k): k is string => !!k)
            tied(o, table, keys, `.${method}`)
          }
        }
      }
    }

    // Untied column lists (module constants, arguments built elsewhere).
    if (!seen.has(node) && (ts.isStringLiteralLike(node) || ts.isBinaryExpression(node))) {
      const parentIsConcat =
        ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
      const text = parentIsConcat ? null : literalText(node)
      const cols = text === null ? null : columnList(text)
      if (cols) {
        for (const c of cols) {
          for (const table of TABLES_BY_OLD.get(c) ?? []) {
            const current = CURRENT.get(table) ?? new Set<string>()
            const sharesAnother = cols.some((o) => o !== c && current.has(o))
            if (isGeneric(c) && !sharesAnother) continue
            hits.push({ line: at(node), column: c, table, where: 'column list' })
          }
        }
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') && path !== SELF && !path.endsWith(join('types', 'supabase.ts'))) {
      out.push(path)
    }
  }
  return out
}

describe('no renamed 4.x column in a PostgREST string (5.0 final audit H7)', () => {
  it('reads the old columns and the 5.0 tables', () => {
    expect(OLD_BY_TABLE.get('org_installed_extension')).toContain('enabled')
    expect(CURRENT.get('org_installed_extension')).toContain('is_enabled')
    expect(CURRENT.size).toBeGreaterThan(100)
  })

  it('catches the three strings the codemod left behind', () => {
    const fixture = [
      `const ROW_COLUMNS =`,
      `  'org_id, extension_id, version, enabled, manifest, installed_at, package_sha256, package_path, category'`,
      `const SAVED_CONFIG_COLUMNS =`,
      `  'id, name, description, url, database, username, color, is_active, last_tested_at, last_test_success, created_at'`,
      `const RUN_COLUMNS =`,
      `  'id, status, phase, phase_index, phase_count, progress_current, progress_total, ' +`,
      `  'started_at, completed_at, heartbeat_at, cancel_requested, error_message, ' +`,
      `  'records_created, records_updated'`,
    ].join('\n')
    expect(scanColumns('fixture.ts', fixture).map((h) => `${h.table}.${h.column}`)).toEqual([
      'org_installed_extension.enabled',
      'odoo_saved_config.last_test_success',
      'integration_sync_log.cancel_requested',
    ])
  })

  it('catches tied select, filter, order and write keys', () => {
    const fixture = [
      `db.from('org_installed_extension').select('enabled').eq('enabled', true).order('enabled')`,
      `db.from('integration_sync_log').update({ cancel_requested: true })`,
      `db.from('integration_sync_log').update({ is_cancel_requested: true })`,
    ].join('\n')
    expect(scanColumns('fixture.ts', fixture).map((h) => `${h.where} ${h.column}`)).toEqual([
      '.order enabled',
      '.eq enabled',
      '.select enabled',
      '.update cancel_requested',
    ])
  })

  it('does not take an unrelated list with a generic name for a database list', () => {
    expect(scanColumns('fixture.ts', `const KEYS = 'alpha, beta, enabled'`)).toEqual([])
  })

  it('src, api, electron and web/src name only 5.0 columns', () => {
    const files = SCAN_ROOTS.map((r) => join(ROOT, r)).flatMap((r) => {
      try {
        return sourceFiles(r)
      } catch {
        return []
      }
    })
    expect(files.length).toBeGreaterThan(500)
    const hits = files.flatMap((f) =>
      scanColumns(f, readFileSync(f, 'utf8')).map(
        (h) => `${relative(ROOT, f).split(sep).join('/')}:${h.line}  ${h.where}: ${h.table}.${h.column}`,
      ),
    )
    expect(hits).toEqual([])
  }, 60_000) // parses every source file: ~3 s alone, far longer under the full suite
})
