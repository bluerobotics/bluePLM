// Lookup tables built from supabase/rename-map-5.0.json, shared by the SQL and TS renamers.

import { readFileSync } from 'node:fs'

/**
 * @param {any} map parsed rename-map-5.0.json
 */
export function buildLookups(map) {
  /** old relation (table or view) -> new */
  const relations = new Map()
  for (const [from, v] of Object.entries(map.tables)) relations.set(from, v.to)
  for (const [from, v] of Object.entries(map.views ?? {})) relations.set(from, v.to)
  /** old function name -> new */
  const functions = new Map()
  for (const v of Object.values(map.functions)) functions.set(v.name, v.to)
  /** distinctive object names (triggers, indexes, constraints) -> new */
  const objects = new Map()
  for (const t of map.triggers) objects.set(t.name, t.to)
  for (const [from, v] of Object.entries(map.indexes)) objects.set(from, v.to)
  for (const [from, v] of Object.entries(map.constraints)) objects.set(from, v.to)
  for (const [from, v] of Object.entries(map.derivedConstraints ?? {})) objects.set(from, v.to)
  /** policy name -> [{table, to}] */
  const policies = new Map()
  for (const p of map.policies) {
    if (!policies.has(p.name)) policies.set(p.name, [])
    policies.get(p.name).push({ table: p.table, to: p.to })
  }
  /** column renames safe to apply wherever the bare name is an identifier */
  const globalColumns = new Map()
  /** old table -> Map(old column -> new) for every column rename */
  const tableColumns = new Map()
  /** old column -> Set(old tables) for scoped renames */
  const scopedColumns = new Map()
  for (const c of map.columns) {
    if (!tableColumns.has(c.table)) tableColumns.set(c.table, new Map())
    tableColumns.get(c.table).set(c.column, c.to)
    if (c.scope === 'global') globalColumns.set(c.column, c.to)
    else {
      if (!scopedColumns.has(c.column)) scopedColumns.set(c.column, new Set())
      scopedColumns.get(c.column).add(c.table)
    }
  }
  /** every table and view the schema defines, old and new names */
  const tableNames = new Set([...relations.keys(), ...relations.values(), ...(map.unchanged?.tables ?? [])])
  const isTable = (name) => tableNames.has(name)
  /** old column -> Set(old tables) that hold a column of that name and keep it */
  const columnKeepers = new Map()
  for (const c of map.columns) if (c.keptBy?.length) columnKeepers.set(c.column, new Set(c.keptBy))
  /** new relation -> old, so a context named by its new name (already renamed) still resolves */
  const relationsBack = new Map([...relations].map(([a, b]) => [b, a]))
  const oldTableOf = (name) => (relations.has(name) ? name : relationsBack.get(name) ?? name)
  const columnFor = (table, column) => tableColumns.get(oldTableOf(table))?.get(column)
  return { isTable, columnKeepers, relations, functions, objects, policies, globalColumns, tableColumns, scopedColumns, oldTableOf, columnFor }
}

export function loadLookups(mapPath) {
  return buildLookups(JSON.parse(readFileSync(mapPath, 'utf8')))
}
