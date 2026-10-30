// Writes the baseline function list into 0502's schema_function_inventory backfill.
//
// The list is every function the 5.0 baseline (supabase/core.sql and modules 10-50) defines, read
// statically with the rename tooling's schema reader. 0502 inserts it; check_function_inventory()
// then refuses any exposed public function no release registered.
//
//   node scripts/security/function-inventory.mjs [--root <repo>] [--check]
//
// --check exits 1 when the file is out of date instead of writing it.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SCHEMA_FILES, readSchema, inventory } from '../rename-5.0/schemaInventory.mjs'

const MIGRATION = 'supabase/migrations/0502_security_hardening.sql'
const START = '  -- @inventory:baseline:start\n'
const END = '  -- @inventory:baseline:end\n'

/** The baseline's function signatures, sorted, as to_regprocedure() reads them. */
export function baselineSignatures(root) {
  const { functions } = inventory(readSchema(root, (f) => readFileSync(path.join(root, f), 'utf8')))
  return [...functions.values()].map((f) => `${f.name}(${f.args})`).sort()
}

/** The migration text with the baseline block replaced by `signatures`. */
export function withInventory(sql, signatures) {
  const a = sql.indexOf(START)
  const b = sql.indexOf(END)
  if (a < 0 || b < a) throw new Error(`${MIGRATION}: inventory markers not found`)
  const body = signatures.map((s, i) => `  '${s}'${i < signatures.length - 1 ? ',' : ''}\n`).join('')
  return sql.slice(0, a + START.length) + body + sql.slice(b)
}

if (process.argv[1]?.endsWith('function-inventory.mjs')) {
  const args = process.argv.slice(2)
  const rootAt = args.indexOf('--root')
  const root = rootAt >= 0 ? path.resolve(args[rootAt + 1]) : process.cwd()
  const file = path.join(process.cwd(), MIGRATION)
  const sql = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const next = withInventory(sql, baselineSignatures(root))
  if (args.includes('--check')) {
    if (next !== sql) {
      console.error(`${MIGRATION} is out of date: run node scripts/security/function-inventory.mjs`)
      process.exit(1)
    }
  } else {
    writeFileSync(file, next)
    console.error(`${MIGRATION}: ${SCHEMA_FILES.length} files read`)
  }
}
