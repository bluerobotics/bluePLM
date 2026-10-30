import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Every Postgres function the app or the API calls through PostgREST, checked
// against the function definitions in supabase/core.sql and supabase/modules.
//
// PostgREST resolves a call by name *and* by the set of argument keys, so a
// renamed parameter (p_org_id -> p_organization_id) or a dropped function gives
// a runtime "Could not find the function ... in the schema cache" while every
// unit test, which mocks supabase.rpc, stays green.
//
// Covered: `<x>.rpc('name', { ... })` in src/ and api/, and the raw
// `fetch(`${url}/rest/v1/rpc/name`, { body: JSON.stringify({ ... }) })` calls
// used before a session exists.

const REPO = resolve(__dirname, '../../..')
// The 5.0 baseline, then every numbered migration after it, in order: the
// functions a database holds once the runner is done. 0500_from_4x.sql is left
// out because it recreates exactly the baseline's functions (schemaUpgrade.test.ts
// proves the two agree), so reading it would only repeat them.
const SQL_FILES = [
  resolve(REPO, 'supabase/core.sql'),
  ...readdirSync(resolve(REPO, 'supabase/modules'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => resolve(REPO, 'supabase/modules', f)),
  ...readdirSync(resolve(REPO, 'supabase/migrations'))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) > 500)
    .sort()
    .map((f) => resolve(REPO, 'supabase/migrations', f)),
]

// ---------------------------------------------------------------------------
// SQL side

interface Param {
  name: string
  optional: boolean
}

interface Signature {
  params: Param[]
  file: string
}

/** Index of the parenthesis closing the one at `open`, skipping quoted text. */
function closingParen(sql: string, open: number): number {
  let depth = 0
  for (let i = open; i < sql.length; i++) {
    const ch = sql[i]
    if (ch === "'") {
      i = sql.indexOf("'", i + 1)
      while (sql[i + 1] === "'") i = sql.indexOf("'", i + 2)
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')' && --depth === 0) return i
  }
  return -1
}

function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  let quoted = false
  for (let i = 0; i < list.length; i++) {
    const ch = list[i]
    if (ch === "'") quoted = !quoted
    if (quoted) continue
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(list.slice(start, i))
      start = i + 1
    }
  }
  parts.push(list.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

const MODES = new Set(['in', 'out', 'inout', 'variadic'])

function parseParam(text: string): (Param & { out: boolean }) | null {
  const tokens = text.split(/\s+/)
  let out = false
  while (tokens.length && MODES.has(tokens[0].toLowerCase())) {
    const mode = tokens.shift()!.toLowerCase()
    if (mode === 'out') out = true
  }
  // An unnamed parameter is a bare type; PostgREST cannot address it by key.
  if (tokens.length < 2) return null
  const name = tokens[0].replace(/"/g, '')
  const optional = /\sdefault\s|\s=\s/i.test(` ${tokens.slice(1).join(' ')} `)
  return { name, optional, out }
}

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, '')
}

/** name -> every signature defined (and not dropped since) across the schema files, in order. */
function loadFunctions(): Map<string, Signature[]> {
  const fns = new Map<string, Signature[]>()
  const stmt =
    /\b(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION(?:\s+IF\s+EXISTS)?)\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi
  for (const file of SQL_FILES) {
    const sql = stripSqlComments(readFileSync(file, 'utf8'))
    for (let m = stmt.exec(sql); m; m = stmt.exec(sql)) {
      const name = m[2].toLowerCase()
      const open = m.index + m[0].length - 1
      const close = closingParen(sql, open)
      if (close < 0) continue
      if (/^DROP/i.test(m[1])) {
        fns.delete(name)
        continue
      }
      const params = splitTopLevel(sql.slice(open + 1, close))
        .map(parseParam)
        .filter((p): p is Param & { out: boolean } => p !== null && !p.out)
        .map(({ name: n, optional }) => ({ name: n, optional }))
      const list = fns.get(name) ?? []
      list.push({ params, file: relative(REPO, file).replace(/\\/g, '/') })
      fns.set(name, list)
    }
  }
  return fns
}

// ---------------------------------------------------------------------------
// TypeScript side

interface RpcCall {
  name: string
  /** null when the argument object is not a literal the test can read. */
  keys: string[] | null
  at: string
}

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listTsFiles(full))
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  node.forEachChild((child) => walk(child, visit))
}

function unwrap(e: ts.Expression): ts.Expression {
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isTypeAssertionExpression(e)) {
    e = e.expression
  }
  return e
}

function objectKeys(e: ts.Expression | undefined): string[] | null {
  if (!e) return []
  e = unwrap(e)
  if (!ts.isObjectLiteralExpression(e)) return null
  const keys: string[] = []
  for (const p of e.properties) {
    if (ts.isSpreadAssignment(p)) return null
    if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))) keys.push(p.name.text)
    else return null
  }
  return keys
}

function collectCalls(): { calls: RpcCall[]; dynamic: string[] } {
  const calls: RpcCall[] = []
  const dynamic: string[] = []
  const files = [...listTsFiles(resolve(REPO, 'src')), ...listTsFiles(resolve(REPO, 'api'))]
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    if (!text.includes('rpc')) continue
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const at = (n: ts.Node) =>
      `${relative(REPO, file).replace(/\\/g, '/')}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`

    walk(sf, (n) => {
      if (!ts.isCallExpression(n)) return

      // x.rpc('name', { ... })
      if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'rpc') {
        const first = n.arguments[0] && unwrap(n.arguments[0])
        if (!first || !ts.isStringLiteralLike(first)) {
          dynamic.push(at(n))
          return
        }
        calls.push({ name: first.text, keys: objectKeys(n.arguments[1]), at: at(n) })
        return
      }

      // fetch(`${url}/rest/v1/rpc/name`, { body: JSON.stringify({ ... }) })
      if (ts.isIdentifier(n.expression) && n.expression.text === 'fetch' && n.arguments[0]) {
        const urlText = n.arguments[0].getText()
        const m = urlText.match(/\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)/)
        if (!m) return
        let keys: string[] | null = []
        const init = n.arguments[1] && unwrap(n.arguments[1])
        if (init && ts.isObjectLiteralExpression(init)) {
          const body = init.properties.find(
            (p): p is ts.PropertyAssignment =>
              ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'body',
          )
          if (body) {
            const value = unwrap(body.initializer)
            keys =
              ts.isCallExpression(value) && value.expression.getText() === 'JSON.stringify'
                ? objectKeys(value.arguments[0])
                : null
          }
        } else {
          keys = null
        }
        calls.push({ name: m[1], keys, at: at(n) })
      }
    })
  }
  return { calls, dynamic }
}

// ---------------------------------------------------------------------------

/** Why a call cannot bind to this signature, or null when it can. */
function mismatch(keys: string[], sig: Signature): string | null {
  const names = new Set(sig.params.map((p) => p.name))
  const unknown = keys.filter((k) => !names.has(k))
  const missing = sig.params.filter((p) => !p.optional && !keys.includes(p.name)).map((p) => p.name)
  if (!unknown.length && !missing.length) return null
  return [
    unknown.length ? `unknown ${unknown.join(', ')}` : '',
    missing.length ? `missing ${missing.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ')
}

// Calls known not to match, each with the reason it is left as it is. A new
// mismatch fails; fixing one of these fails the stale-entry test until it is
// removed here.
const KNOWN_MISMATCHES: Record<string, string> = {}

describe('supabase .rpc() calls ↔ SQL function signatures', () => {
  const fns = loadFunctions()
  const { calls, dynamic } = collectCalls()

  it('parses the schema and finds the calls', () => {
    expect(fns.size).toBeGreaterThan(100)
    expect(calls.length).toBeGreaterThan(40)
    // Most calls pass a literal argument object; if none parse, nothing is checked.
    expect(calls.filter((c) => c.keys !== null && c.keys.length > 0).length).toBeGreaterThan(30)
    expect(dynamic).toEqual([])
  })

  const failures = new Map<string, string>()
  for (const call of calls) {
    const sigs = fns.get(call.name)
    if (!sigs) {
      failures.set(call.name, `${call.at}: no function ${call.name} in supabase/core.sql or modules`)
      continue
    }
    if (call.keys === null) continue
    const reasons = sigs.map((s) => mismatch(call.keys!, s))
    if (reasons.every((r) => r !== null)) {
      failures.set(
        call.name,
        `${call.at}: ${call.name}(${call.keys.join(', ')}) - ${reasons
          .map((r, i) => `${sigs[i].file}: ${r}`)
          .join(' | ')}`,
      )
    }
  }

  it('every called function exists and accepts the argument keys sent', () => {
    const unexpected = [...failures].filter(([name]) => !(name in KNOWN_MISMATCHES)).map(([, msg]) => msg)
    expect(unexpected).toEqual([])
  })

  it('the known-mismatch list has no stale entries', () => {
    expect(Object.keys(KNOWN_MISMATCHES).filter((name) => !failures.has(name))).toEqual([])
  })
})
