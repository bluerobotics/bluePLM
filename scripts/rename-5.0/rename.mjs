#!/usr/bin/env node
// BluePLM 5.0 rename codemod, driven by supabase/rename-map-5.0.json.
//
//   node scripts/rename-5.0/rename.mjs --mode sql [--write] [paths...]
//   node scripts/rename-5.0/rename.mjs --mode ts  [--write] [paths...]
//
// Dry run by default: prints per-file change counts and every ambiguous hit it refused to change.
// --write          rewrite the files in place
// --map <file>     another map (default supabase/rename-map-5.0.json)
// --json <file>    also write the full report (counts and ambiguous hits) as JSON
// --quiet          totals and ambiguous hits only, no per-file lines
//
// Default paths: sql = supabase/core.sql and supabase/modules/*.sql (never supabase/legacy-4.10/);
// ts = src, api/src, electron, web/src. A directory is walked for .sql (sql mode) or .ts/.tsx/.mts/.cts
// (ts mode), skipping node_modules, dist*, release, coverage, legacy-4.10 and this folder (its tests
// hold old names on purpose).

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLookups } from './maps.mjs'
import { renameSql, triggerTablesFromMap } from './renameSql.mjs'
import { renameTs } from './renameTs.mjs'
import { SCHEMA_FILES } from './schemaInventory.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const SKIP_DIRS = new Set(['node_modules', 'release', 'coverage', 'legacy-4.10', '.git'])

function parseArgs(argv) {
  const o = { mode: null, write: false, map: path.join(ROOT, 'supabase/rename-map-5.0.json'), json: null, quiet: false, paths: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--mode') o.mode = argv[++i]
    else if (a === '--write') o.write = true
    else if (a === '--map') o.map = path.resolve(argv[++i])
    else if (a === '--json') o.json = path.resolve(argv[++i])
    else if (a === '--quiet') o.quiet = true
    else if (a === '--help' || a === '-h') o.help = true
    else o.paths.push(a)
  }
  return o
}

function walk(p, exts, out) {
  const st = statSync(p)
  if (st.isFile()) {
    if (exts.test(p)) out.push(p)
    return out
  }
  for (const n of readdirSync(p)) {
    if (SKIP_DIRS.has(n) || n.startsWith('dist')) continue
    const full = path.join(p, n)
    if (path.resolve(full) === HERE) continue
    walk(full, exts, out)
  }
  return out
}

export function run(argv) {
  const o = parseArgs(argv)
  if (o.help || (o.mode !== 'sql' && o.mode !== 'ts')) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 17).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
    return o.help ? 0 : 2
  }
  const map = JSON.parse(readFileSync(o.map, 'utf8'))
  const L = buildLookups(map)
  const triggerTables = triggerTablesFromMap(map)
  const exts = o.mode === 'sql' ? /\.sql$/ : /\.(ts|tsx|mts|cts)$/
  const roots = o.paths.length
    ? o.paths.map((p) => path.resolve(p))
    : (o.mode === 'sql' ? SCHEMA_FILES : ['src', 'api/src', 'electron', 'web/src']).map((p) => path.join(ROOT, p)).filter((p) => existsSync(p))
  const files = [...new Set(roots.flatMap((r) => walk(r, exts, [])))].filter((f) => !/[\\/]legacy-4\.10[\\/]/.test(f)).sort()

  const totals = {}
  const report = { mode: o.mode, write: o.write, files: [], ambiguous: [] }
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const r = o.mode === 'sql' ? renameSql(src, L, { triggerTables }) : renameTs(src, L, { file })
    const rel = path.relative(process.cwd(), file)
    for (const [k, v] of Object.entries(r.counts)) totals[k] = (totals[k] ?? 0) + v
    if (r.changes) {
      report.files.push({ file: rel, changes: r.changes, counts: r.counts })
      if (!o.quiet) console.log(`${rel}  ${r.changes} change(s)  ${Object.entries(r.counts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}`)
      if (o.write && r.text !== src) writeFileSync(file, r.text)
    }
    for (const a of r.ambiguous) report.ambiguous.push({ file: rel, ...a })
  }

  if (report.ambiguous.length) {
    console.log(`\nAmbiguous hits left unchanged (${report.ambiguous.length}):`)
    const byReason = new Map()
    for (const a of report.ambiguous) {
      if (!byReason.has(a.reason)) byReason.set(a.reason, [])
      byReason.get(a.reason).push(a)
    }
    for (const [reason, list] of byReason) {
      console.log(`\n  ${reason} (${list.length})`)
      for (const a of list) console.log(`    ${a.file}:${a.line}  ${a.token}`)
    }
  }
  console.log(`\n${o.write ? 'Wrote' : 'Dry run:'} ${report.files.length} of ${files.length} file(s) ${o.write ? 'changed' : 'would change'}; ` +
    `${Object.entries(totals).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}; ${report.ambiguous.length} ambiguous.`)
  if (o.json) writeFileSync(o.json, JSON.stringify({ ...report, totals }, null, 2) + '\n')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2))
}
