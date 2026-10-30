// 5.0 audit R4: names the compiler cannot check must not keep a 4.x schema name.
//
// A Realtime `table:` that names a table that no longer exists subscribes to nothing and reports no error; an
// embed or `!fkey` hint inside a select string, a `.from()` or `.rpc()` behind `as any`, and the table prefix of a
// filter on an embedded table are all plain strings to `tsc`. This scans every TypeScript file of the renderer,
// the Electron main process and the API for a string literal in one of those database positions that equals an
// old table, view or function name (or an old constraint name in an fkey hint) from
// `supabase/rename-map-5.0.json`, and fails with file:line for each.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SELF = fileURLToPath(import.meta.url)
const ROOT = join(dirname(SELF), '..', '..', '..')
const SCAN_ROOTS = ['src', 'api', 'electron', join('web', 'src')]
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-electron', 'dist-web', 'release', 'coverage', '.git'])

interface RenameMap {
  tables: Record<string, { to: string }>
  views: Record<string, { to: string }>
  functions: Record<string, { name: string; to: string }>
  constraints: Record<string, { to: string }>
  derivedConstraints: Record<string, { to: string }>
}

const map = JSON.parse(readFileSync(join(ROOT, 'supabase', 'rename-map-5.0.json'), 'utf8')) as RenameMap

function renamed(entries: Array<[string, string]>): Map<string, string> {
  return new Map(entries.filter(([from, to]) => from !== to))
}

const OLD_RELATIONS = renamed([
  ...Object.entries(map.tables).map(([from, v]): [string, string] => [from, v.to]),
  ...Object.entries(map.views).map(([from, v]): [string, string] => [from, v.to]),
])
/**
 * Kept under their 4.x names by the release decision (a 4.10 client must still read the version and be told to
 * update), even while the map lists a rename for them.
 */
const KEPT_FUNCTIONS = new Set(['schema_release_version', 'schema_release_description', 'verify_and_stamp_schema'])
const OLD_FUNCTIONS = renamed(
  Object.values(map.functions)
    .filter((v) => !KEPT_FUNCTIONS.has(v.name))
    .map((v): [string, string] => [v.name, v.to]),
)
const OLD_CONSTRAINTS = renamed(
  [...Object.entries(map.constraints), ...Object.entries(map.derivedConstraints)].map(
    ([from, v]): [string, string] => [from, v.to],
  ),
)

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.(ts|tsx|mts|cts)$/.test(name) && !name.endsWith('.d.ts') && path !== SELF) out.push(path)
  }
  return out
}

/** Blanks comments but keeps line numbers, so a doc comment quoting an old name is not a hit. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead: string) => lead + ' '.repeat(m.length - lead.length))
}

interface Hit {
  where: string
  kind: string
  name: string
  expected: string
}

const Q = `['"\`]`
const SIMPLE_POSITIONS: Array<{ kind: string; re: RegExp; names: Map<string, string> }> = [
  { kind: '.from()', re: new RegExp(`\\.from(?:\\s+as\\s+\\w+\\))?\\s*(?:<[^>]*>)?\\(\\s*${Q}([a-z0-9_]+)${Q}`, 'g'), names: OLD_RELATIONS },
  { kind: '.rpc()', re: new RegExp(`\\.rpc(?:\\s+as\\s+\\w+\\))?\\s*(?:<[^>]*>)?\\(\\s*${Q}([a-z0-9_]+)${Q}`, 'g'), names: OLD_FUNCTIONS },
  { kind: 'Realtime table', re: new RegExp(`\\btable:\\s*${Q}([a-z0-9_]+)${Q}`, 'g'), names: OLD_RELATIONS },
  {
    kind: 'embedded-table filter',
    re: new RegExp(
      `\\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|order|not|filter|match)\\(\\s*${Q}([a-z0-9_]+)\\.`,
      'g',
    ),
    names: OLD_RELATIONS,
  },
  // Raw PostgREST calls made without the client (organizations.ts, auth.ts): `/rest/v1/<table>?` and `/rest/v1/rpc/<fn>`.
  { kind: 'REST path', re: /\/rest\/v1\/(?!rpc\/)([a-z0-9_]+)(?=[?/`'"]|$)/g, names: OLD_RELATIONS },
  { kind: 'REST rpc path', re: /\/rest\/v1\/rpc\/([a-z0-9_]+)/g, names: OLD_FUNCTIONS },
  { kind: 'REST embed', re: /[?&]select=[^`'"&]*?[,:(]([a-z0-9_]+)\(/g, names: OLD_RELATIONS },
  { kind: 'referenced table', re:new RegExp(`\\b(?:foreignTable|referencedTable):\\s*${Q}([a-z0-9_]+)${Q}`, 'g'), names: OLD_RELATIONS },
]

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

function scan(file: string): Hit[] {
  const text = stripComments(readFileSync(file, 'utf8'))
  const rel = relative(ROOT, file).split(sep).join('/')
  const hits: Hit[] = []
  const add = (index: number, kind: string, name: string, expected: string) =>
    hits.push({ where: `${rel}:${lineOf(text, index)}`, kind, name, expected })

  for (const { kind, re, names } of SIMPLE_POSITIONS) {
    for (const m of text.matchAll(re)) {
      const to = names.get(m[1])
      if (to) add(m.index ?? 0, kind, m[1], to)
    }
  }

  // Select strings: embeds `name(`, `alias:name(`, `name!hint(`, and the hint itself.
  for (const m of text.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)) {
    const body = m[2]
    const start = (m.index ?? 0) + m[0].indexOf(body)
    for (const e of body.matchAll(/(?:^|[\s,(])(?:[a-z0-9_]+\s*:\s*)?([a-z0-9_]+)(?:\s*!\s*([a-z0-9_]+))?\s*\(/g)) {
      const at = start + (e.index ?? 0)
      const table = OLD_RELATIONS.get(e[1])
      if (table) add(at, 'select embed', e[1], table)
      const hint = e[2]
      if (hint) {
        const to = OLD_CONSTRAINTS.get(hint) ?? OLD_RELATIONS.get(hint)
        if (to) add(at, 'fkey hint', hint, to)
      }
    }
  }
  return hits
}

describe('no 4.x schema name in a database position (5.0 audit R4)', () => {
  it('the map has names to look for', () => {
    expect(OLD_RELATIONS.get('users')).toBe('app_user')
    expect(OLD_FUNCTIONS.size).toBeGreaterThan(50)
    expect(OLD_CONSTRAINTS.size).toBeGreaterThan(50)
  })

  it('finds an old name in each position it guards', () => {
    const sample = [
      "supabase.from('files')",
      "(client.rpc as any)('checkout_file', {})",
      "{ event: '*', schema: 'public', table: 'team_members' }",
      ".select('id, users!file_versions_created_by_fkey(email)')",
      ".eq('workflow_roles.org_id', x)",
      'fetch(`${url}/rest/v1/users?select=id&id=eq.1`)',
      'fetch(`${url}/rest/v1/rpc/join_org_by_slug`)',
      '/rest/v1/supplier_contact?select=*,supplier:suppliers(id)',
    ]
    const names = sample.flatMap((line) => {
      const out: string[] = []
      for (const { re, names: n } of SIMPLE_POSITIONS) for (const m of line.matchAll(re)) if (n.has(m[1])) out.push(m[1])
      return out
    })
    expect(names).toEqual(['files', 'checkout_file', 'team_members', 'workflow_roles', 'users', 'join_org_by_slug', 'suppliers'])
  })

  it('src, api, electron and web/src use only 5.0 names', () => {
    const files = SCAN_ROOTS.map((r) => join(ROOT, r)).flatMap((r) => {
      try {
        return sourceFiles(r)
      } catch {
        return []
      }
    })
    expect(files.length).toBeGreaterThan(500)
    const hits = files.flatMap(scan).map((h) => `${h.where}  ${h.kind}: ${h.name} -> ${h.expected}`)
    expect(hits).toEqual([])
  })
})
