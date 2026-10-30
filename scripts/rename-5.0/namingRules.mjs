// The BluePLM schema naming rules (.cursor/rules/database.mdc, "Naming"), as a check over the
// inventory of the SQL. Used by src/lib/supabase/schemaNaming.test.ts and by the codemod's self-check.

// Postgres reserved key words (SQL Key Words appendix: "reserved" and "reserved (can be function or type)").
export const RESERVED = new Set(('all analyse analyze and any array as asc asymmetric authorization binary both case cast check collate collation column ' +
  'concurrently constraint create cross current_catalog current_date current_role current_schema current_time current_timestamp current_user ' +
  'default deferrable desc distinct do else end except false fetch for foreign freeze from full grant group having ilike in initially inner ' +
  'intersect into is isnull join lateral leading left like limit localtime localtimestamp natural not notnull null offset on only or order ' +
  'outer overlaps placing primary references returning right select session_user similar some symmetric system_user table tablesample then ' +
  'to trailing true union unique user using variadic verbose when where window with').split(' '))

/** Verbs a function name may carry after its entity (`<entity>_<verb>[_<qualifier>]`). */
export const VERBS = new Set(('get list count create update delete set add remove upsert reset clear force complete ' +
  'checkout checkin move rename approve settle advance request respond resubmit cancel withdraw notify record consume validate admit ' +
  'generate import instantiate assign unassign activate deactivate apply block unblock join regenerate ensure require use ' +
  'verify stamp escape strip enforce revoke migrate drop remediate merge repair preview execute calculate cleanup log sync').split(' '))

/** Prefixes that stand in for `<entity>_<verb>`. */
export const KEPT_PREFIXES = ['is_', 'has_', 'can_', 'my_', 'check_', 'trg_']

/**
 * Documented exceptions. Each entry is a name the rules would refuse, with the reason it stays.
 * Keep this list short; every entry is read by a reviewer.
 */
export const EXCEPTIONS = {
  // The 4.x client reads `schema_version` to decide that a 5.0 database is newer than it is,
  // so the table and its columns keep their names (see .cursor/plans/release-5.0.plan.md).
  tables: new Set(['schema_version']),
  // Supabase-owned tables carry policies of ours whose names check_release_residue() matches.
  policyTables: new Set(['storage.objects']),
  // Read by 4.x clients and the migration runner against both 4.x and 5.0 databases, so they keep their names.
  // client_min_version is read by every 5.x client before it can trust anything else, so its name is fixed too.
  functions: new Set(['schema_release_version', 'schema_release_description', 'verify_and_stamp_schema', 'client_min_version']),
  columns: new Set(),
}

const lastWord = (name) => name.split('_').pop()
/** A table name is plural when its last word ends in s but not in ss/us/is (access, status, analysis). */
export function looksPlural(name) {
  const w = lastWord(name)
  return /s$/.test(w) && !/(ss|us|is)$/.test(w)
}

/** @returns {{ kind: string, name: string, file?: string, line?: number, rule: string }[]} */
export function checkNaming(inv) {
  const out = []
  const bad = (kind, name, where, rule) => out.push({ kind, name, file: where?.file, line: where?.line, rule })
  const tables = inv.tables
  const tableNames = new Set([...tables.keys(), ...inv.views.keys()])

  for (const t of [...tables.values(), ...inv.views.values()]) {
    const n = t.name
    if (EXCEPTIONS.tables.has(n)) continue
    if (!/^[a-z][a-z0-9_]*$/.test(n)) bad('table', n, t, 'snake_case')
    if (RESERVED.has(n)) bad('table', n, t, 'reserved word')
    if (looksPlural(n)) bad('table', n, t, 'singular')
    if (n.startsWith('organization_')) bad('table', n, t, 'org-owned tables use org_, never organization_')
  }

  for (const t of tables.values()) {
    if (EXCEPTIONS.tables.has(t.name)) continue
    for (const c of t.columns.values()) {
      const id = `${t.name}.${c.name}`
      if (EXCEPTIONS.columns.has(id)) continue
      if (!/^[a-z][a-z0-9_]*$/.test(c.name)) bad('column', id, c, 'snake_case')
      if (RESERVED.has(c.name)) bad('column', id, c, 'reserved word')
      if (c.references && !/(_id|_by)$/.test(c.name) && c.name !== 'id') bad('column', id, c, 'foreign key ends in _id (or _by for an actor)')
      if (c.type === 'boolean' && !/^(is|has|can)_/.test(c.name)) bad('column', id, c, 'boolean starts with is_/has_/can_')
      if (/^timestamp(tz)?$/.test(c.type) && !/_at$/.test(c.name)) bad('column', id, c, 'timestamp ends in _at')
      if (c.name === 'organization_id') bad('column', id, c, 'org_id, as every other table')
    }
  }

  const triggerFns = new Set([...inv.triggers.values()].map((t) => t.fn))
  for (const f of inv.functions.values()) {
    const n = f.name
    if (EXCEPTIONS.functions.has(n)) continue
    if (!/^[a-z][a-z0-9_]*$/.test(n)) { bad('function', f.signature, f, 'snake_case'); continue }
    const isTrigger = /RETURNS\s+TRIGGER/i.test(f.returns) || triggerFns.has(n)
    if (isTrigger) {
      if (!n.startsWith('trg_')) bad('function', f.signature, f, 'trigger functions are trg_<table>_<what>')
      continue
    }
    if (n.startsWith('trg_')) { bad('function', f.signature, f, 'trg_ is for trigger functions'); continue }
    if (KEPT_PREFIXES.some((p) => n.startsWith(p))) continue
    const parts = n.split('_')
    const verbAt = parts.findIndex((p, i) => i > 0 && VERBS.has(p))
    if (verbAt < 1) bad('function', f.signature, f, '<entity>_<verb>[_<qualifier>] or a kept prefix (is_/has_/can_/my_/check_/trg_)')
  }

  for (const tr of inv.triggers.values()) {
    const table = tr.table === 'auth.users' ? 'auth_user' : tr.table
    if (!tr.name.startsWith(`trg_${table}_`)) bad('trigger', `${tr.table}.${tr.name}`, tr, 'trg_<table>_<what>')
  }

  for (const p of inv.policies.values()) {
    if (EXCEPTIONS.policyTables.has(p.table)) continue
    if (!p.name.startsWith(`${p.table}: `)) bad('policy', `${p.table}: "${p.name}"`, p, '"<table>: <who> <action>"')
  }

  for (const i of inv.indexes.values()) {
    if (!i.name.startsWith(`${i.table}_`) || !/_(idx|key|pkey)$/.test(i.name)) bad('index', i.name, i, '<table>_<cols>_idx')
  }

  for (const c of inv.constraints.values()) {
    if (!c.name.startsWith(`${c.table}_`) || !/_(check|key|fkey|pkey|excl)$/.test(c.name)) bad('constraint', `${c.table}.${c.name}`, c, '<table>_<cols>_<check|key|fkey|pkey>')
  }

  for (const t of inv.types.values()) {
    if (!/^[a-z][a-z0-9_]*$/.test(t.name)) bad('type', t.name, t, 'snake_case')
    if (tableNames.has(t.name)) bad('type', t.name, t, 'a type may not share a table name (tables define a row type)')
  }

  for (const n of [...tableNames, ...[...inv.functions.values()].map((f) => f.name)]) {
    if (n.length > 63) bad('name', n, undefined, 'at most 63 bytes')
  }
  return out
}
