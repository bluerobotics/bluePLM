// Inventory of the objects the BluePLM schema files define, read statically from the SQL.
//
// Used by the 5.0 rename map builder, the codemod and src/lib/supabase/schemaNaming.test.ts.
// Files are read in apply order (core, then modules 10..50); an object dropped later in that
// order without being created again is left out, which is what a fresh database would hold.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { stripComments, matchParen, splitTopLevel, lineOf } from './sqlLexer.mjs'

export const SCHEMA_FILES = [
  'supabase/core.sql',
  'supabase/modules/10-source-files.sql',
  'supabase/modules/15-inspection.sql',
  'supabase/modules/20-change-control.sql',
  'supabase/modules/30-supply-chain.sql',
  'supabase/modules/40-integrations.sql',
  'supabase/modules/50-extensions.sql',
]

const ID = '(?:public\\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)'
// Table reference that may name a Supabase schema (auth.users, storage.objects); kept qualified.
const TID = '((?:auth\\.|storage\\.)?(?:public\\.)?"?[A-Za-z_][A-Za-z0-9_]*"?)'
const unq = (s) => s.replace(/^"|"$/g, '')
const lc = (s) => unq(s.replace(/^public\./i, '')).toLowerCase()

const TABLE_CONSTRAINT_START = /^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|EXCLUDE|LIKE)\b/i

/** Normalize a function argument list to its type signature: `(p_a UUID, p_b TEXT DEFAULT NULL)` -> `uuid, text`. */
export function argTypes(argText) {
  const out = []
  for (let a of splitTopLevel(argText)) {
    a = a.replace(/\s+(DEFAULT\b|=).*$/is, '').trim()
    let mode = 'in'
    const m = a.match(/^(IN|OUT|INOUT|VARIADIC)\s+/i)
    if (m) {
      mode = m[1].toLowerCase()
      a = a.slice(m[0].length)
    }
    if (mode === 'out') continue
    // `name type` or bare `type`. A type can be several words (`timestamp with time zone`, `character varying`).
    const words = a.split(/\s+/)
    const typeStarts = /^(uuid|text|int|integer|bigint|smallint|boolean|bool|jsonb?|timestamptz|timestamp|date|numeric|real|double|character|varchar|bytea|inet|interval|time|setof|anyelement|record|trigger|regclass|regprocedure|oid|name|public\.|[a-z_]+\[\])/i
    let type = a
    if (words.length > 1 && !typeStarts.test(words[0])) type = words.slice(1).join(' ')
    out.push(normType(type))
  }
  return out.join(', ')
}

function normType(t) {
  t = t.toLowerCase().replace(/^public\./, '').replace(/\s+/g, ' ').trim()
  const map = {
    int: 'integer', int4: 'integer', int8: 'bigint', bool: 'boolean', 'timestamp with time zone': 'timestamptz',
    'character varying': 'varchar', 'double precision': 'double precision',
  }
  return map[t] ?? t
}

/**
 * @param {string} root repository root
 * @param {(file: string) => string} [read]
 */
export function readSchema(root, read = (f) => readFileSync(path.join(root, f), 'utf8')) {
  return SCHEMA_FILES.map((file) => ({ file, text: read(file) }))
}

/**
 * @param {{file: string, text: string}[]} files in apply order
 */
export function inventory(files) {
  /** @type {Map<string, any>} */ const tables = new Map()
  /** @type {Map<string, any>} */ const functions = new Map() // key name(argtypes)
  /** @type {Map<string, any>} */ const triggers = new Map() // key table.name
  /** @type {Map<string, any>} */ const policies = new Map() // key table."name"
  /** @type {Map<string, any>} */ const indexes = new Map()
  /** @type {Map<string, any>} */ const constraints = new Map() // key table.name
  /** @type {Map<string, any>} */ const types = new Map()
  /** @type {Map<string, any>} */ const views = new Map()
  /** @type {Map<string, any>} */ const sequences = new Map()
  const publication = new Set()

  const events = [] // ordered by (file order, offset)
  files.forEach(({ file, text }, fileIndex) => {
    const src = stripComments(text)
    const at = (off) => ({ file, line: lineOf(text, off), order: fileIndex * 1e8 + off })
    let m

    const reTable = new RegExp(`\\bCREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${ID}\\s*\\(`, 'gi')
    while ((m = reTable.exec(src))) {
      const open = m.index + m[0].length - 1
      const close = matchParen(src, open)
      if (close < 0) continue
      events.push({ kind: 'createTable', name: lc(m[1]), body: src.slice(open + 1, close - 1), ...at(m.index) })
    }

    const reAlter = new RegExp(`\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${ID}\\s+([^;]*?)(?=;|\\bEXCEPTION\\b|\\bEND\\b)`, 'gis')
    while ((m = reAlter.exec(src))) {
      const table = lc(m[1])
      for (const clause of splitTopLevel(m[2])) {
        let c
        if ((c = clause.match(/^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?\w+"?)\s+(.*)$/is))) {
          events.push({ kind: 'addColumn', table, name: lc(c[1]), def: c[2], ...at(m.index) })
        } else if ((c = clause.match(/^DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?("?\w+"?)/i))) {
          events.push({ kind: 'dropColumn', table, name: lc(c[1]), ...at(m.index) })
        } else if ((c = clause.match(/^RENAME\s+COLUMN\s+("?\w+"?)\s+TO\s+("?\w+"?)/i))) {
          events.push({ kind: 'renameColumn', table, from: lc(c[1]), to: lc(c[2]), ...at(m.index) })
        } else if ((c = clause.match(/^ADD\s+CONSTRAINT\s+("?\w+"?)\s+(.*)$/is))) {
          events.push({ kind: 'addConstraint', table, name: lc(c[1]), def: c[2], ...at(m.index) })
        } else if ((c = clause.match(/^DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?("?\w+"?)/i))) {
          events.push({ kind: 'dropConstraint', table, name: lc(c[1]), ...at(m.index) })
        }
      }
    }

    const reFn = new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(FUNCTION|PROCEDURE)\\s+${ID}\\s*\\(`, 'gi')
    while ((m = reFn.exec(src))) {
      const open = m.index + m[0].length - 1
      const close = matchParen(src, open)
      const args = src.slice(open + 1, close - 1)
      const after = src.slice(close, close + 400)
      const ret = (after.match(/^\s*RETURNS\s+(SETOF\s+)?([\w.]+(?:\s*\[\])?|TABLE)/i) || [])[0] ?? ''
      events.push({
        kind: 'createFunction', name: lc(m[2]), procedure: /PROCEDURE/i.test(m[1]),
        args: argTypes(args), argText: args.replace(/\s+/g, ' ').trim(), returns: ret.replace(/\s+/g, ' ').trim(), ...at(m.index),
      })
    }
    const reDropFn = new RegExp(`\\bDROP\\s+(FUNCTION|PROCEDURE)\\s+(?:IF\\s+EXISTS\\s+)?${ID}\\s*(\\()?`, 'gi')
    while ((m = reDropFn.exec(src))) {
      let args = null
      if (m[3]) {
        const open = m.index + m[0].length - 1
        args = argTypes(src.slice(open + 1, matchParen(src, open) - 1))
      }
      events.push({ kind: 'dropFunction', name: lc(m[2]), args, ...at(m.index) })
    }

    const reTrig = new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:CONSTRAINT\\s+)?TRIGGER\\s+${ID}\\s+([^;]*?)\\bON\\s+${TID}([^;]*?)EXECUTE\\s+(?:FUNCTION|PROCEDURE)\\s+${ID}`, 'gis')
    while ((m = reTrig.exec(src))) {
      events.push({ kind: 'createTrigger', name: lc(m[1]), timing: m[2].trim().replace(/\s+/g, ' '), table: lc(m[3]), fn: lc(m[5]), ...at(m.index) })
    }
    const reDropTrig = new RegExp(`\\bDROP\\s+TRIGGER\\s+(?:IF\\s+EXISTS\\s+)?${ID}\\s+ON\\s+${TID}`, 'gi')
    while ((m = reDropTrig.exec(src))) events.push({ kind: 'dropTrigger', name: lc(m[1]), table: lc(m[2]), ...at(m.index) })

    const rePol = new RegExp(`\\bCREATE\\s+POLICY\\s+("(?:[^"]|"")*"|\\w+)\\s+ON\\s+${TID}([^;]*)`, 'gi')
    while ((m = rePol.exec(src))) {
      const cmd = (m[3].match(/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i) || [, 'ALL'])[1].toUpperCase()
      const roles = (m[3].match(/\bTO\s+([\w\s,]+?)(?=\bUSING\b|\bWITH\b|$)/i) || [, 'public'])[1].trim()
      events.push({ kind: 'createPolicy', name: unq(m[1]).replace(/""/g, '"'), table: lc(m[2]), cmd, roles, ...at(m.index) })
    }
    const reDropPol = new RegExp(`\\bDROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?("(?:[^"]|"")*"|\\w+)\\s+ON\\s+${TID}`, 'gi')
    while ((m = reDropPol.exec(src))) events.push({ kind: 'dropPolicy', name: unq(m[1]).replace(/""/g, '"'), table: lc(m[2]), ...at(m.index) })

    const reIdx = new RegExp(`\\bCREATE\\s+(UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?${ID}\\s+ON\\s+(?:ONLY\\s+)?${ID}([^;]*)`, 'gi')
    while ((m = reIdx.exec(src))) {
      events.push({ kind: 'createIndex', name: lc(m[2]), table: lc(m[3]), unique: !!m[1], def: m[4].trim().replace(/\s+/g, ' '), ...at(m.index) })
    }
    const reDropIdx = new RegExp(`\\bDROP\\s+INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+EXISTS\\s+)?${ID}`, 'gi')
    while ((m = reDropIdx.exec(src))) events.push({ kind: 'dropIndex', name: lc(m[1]), ...at(m.index) })

    const reType = new RegExp(`\\bCREATE\\s+TYPE\\s+${ID}\\s+AS\\s+(ENUM\\s*)?\\(`, 'gi')
    while ((m = reType.exec(src))) {
      const open = m.index + m[0].length - 1
      const body = src.slice(open + 1, matchParen(src, open) - 1)
      events.push({ kind: 'createType', name: lc(m[1]), enum: !!m[2], values: m[2] ? [...body.matchAll(/'([^']*)'/g)].map((v) => v[1]) : undefined, ...at(m.index) })
    }
    const reDropType = new RegExp(`\\bDROP\\s+TYPE\\s+(?:IF\\s+EXISTS\\s+)?${ID}`, 'gi')
    while ((m = reDropType.exec(src))) events.push({ kind: 'dropType', name: lc(m[1]), ...at(m.index) })

    const reView = new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?(MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${ID}`, 'gi')
    while ((m = reView.exec(src))) events.push({ kind: 'createView', name: lc(m[2]), materialized: !!m[1], ...at(m.index) })
    const reDropView = new RegExp(`\\bDROP\\s+(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+EXISTS\\s+)?${ID}`, 'gi')
    while ((m = reDropView.exec(src))) events.push({ kind: 'dropView', name: lc(m[1]), ...at(m.index) })

    const reSeq = new RegExp(`\\bCREATE\\s+SEQUENCE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${ID}`, 'gi')
    while ((m = reSeq.exec(src))) events.push({ kind: 'createSequence', name: lc(m[1]), ...at(m.index) })

    const reDropTable = new RegExp(`\\bDROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${ID}`, 'gi')
    while ((m = reDropTable.exec(src))) events.push({ kind: 'dropTable', name: lc(m[1]), ...at(m.index) })

    const rePub = new RegExp(`\\bALTER\\s+PUBLICATION\\s+supabase_realtime\\s+ADD\\s+TABLE\\s+${ID}`, 'gi')
    while ((m = rePub.exec(src))) {
      // Skip ones inside string literals (remediation hints): stripComments keeps strings, so check the quote balance.
      const lineStart = src.lastIndexOf('\n', m.index) + 1
      const before = src.slice(lineStart, m.index)
      if ((before.match(/'/g) || []).length % 2 === 1) continue
      events.push({ kind: 'publish', name: lc(m[1]), ...at(m.index) })
    }
  })

  events.sort((a, b) => a.order - b.order)

  const colFromDef = (table, name, def, where) => {
    const type = (def.match(/^([\w.]+(?:\s+(?:with(?:out)?\s+time\s+zone|precision|varying))?(?:\s*\([^)]*\))?(?:\s*\[\])?)/i) || [, ''])[1]
    const ref = def.match(/\bREFERENCES\s+(?:public\.|auth\.)?("?\w+"?)\s*(?:\(\s*("?\w+"?)\s*\))?/i)
    const authRef = /\bREFERENCES\s+auth\./i.test(def)
    return {
      table, name, type: normType(type.replace(/\s*\(.*\)$/, '')), def: def.replace(/\s+/g, ' ').trim(),
      references: ref ? { table: (authRef ? 'auth.' : '') + lc(ref[1]), column: ref[2] ? lc(ref[2]) : 'id' } : null,
      unique: /\bUNIQUE\b/i.test(def), primaryKey: /\bPRIMARY\s+KEY\b/i.test(def), check: /\bCHECK\b/i.test(def),
      ...where,
    }
  }

  for (const e of events) {
    const where = { file: e.file, line: e.line }
    switch (e.kind) {
      case 'createTable': {
        if (tables.has(e.name)) break
        const t = { name: e.name, ...where, columns: new Map(), tableConstraints: [], published: false }
        for (const item of splitTopLevel(e.body)) {
          if (TABLE_CONSTRAINT_START.test(item)) {
            const cn = item.match(/^CONSTRAINT\s+("?\w+"?)\s+(.*)$/is)
            t.tableConstraints.push({ name: cn ? lc(cn[1]) : null, def: (cn ? cn[2] : item).replace(/\s+/g, ' ').trim() })
            if (cn) constraints.set(`${e.name}.${lc(cn[1])}`, { name: lc(cn[1]), table: e.name, def: cn[2].replace(/\s+/g, ' ').trim(), ...where })
            continue
          }
          const c = item.match(/^("?\w+"?)\s+([\s\S]*)$/)
          if (!c) continue
          const col = colFromDef(e.name, lc(c[1]), c[2], where)
          const inline = c[2].match(/\bCONSTRAINT\s+("?\w+"?)/i)
          if (inline) constraints.set(`${e.name}.${lc(inline[1])}`, { name: lc(inline[1]), table: e.name, def: c[2].trim(), ...where })
          t.columns.set(col.name, col)
        }
        tables.set(e.name, t)
        break
      }
      case 'addColumn': {
        const t = tables.get(e.table)
        if (t && !t.columns.has(e.name)) t.columns.set(e.name, colFromDef(e.table, e.name, e.def, where))
        break
      }
      case 'dropColumn': tables.get(e.table)?.columns.delete(e.name); break
      case 'renameColumn': {
        const t = tables.get(e.table)
        const c = t?.columns.get(e.from)
        if (c) { t.columns.delete(e.from); t.columns.set(e.to, { ...c, name: e.to }) }
        break
      }
      case 'addConstraint': constraints.set(`${e.table}.${e.name}`, { name: e.name, table: e.table, def: e.def.replace(/\s+/g, ' ').trim(), ...where }); break
      case 'dropConstraint': constraints.delete(`${e.table}.${e.name}`); break
      case 'createFunction': {
        const key = `${e.name}(${e.args})`
        const prev = functions.get(key)
        functions.set(key, { name: e.name, args: e.args, signature: key, argText: e.argText, returns: e.returns, procedure: e.procedure, file: prev?.file ?? e.file, line: prev?.line ?? e.line, files: [...new Set([...(prev?.files ?? []), e.file])] })
        break
      }
      case 'dropFunction': {
        for (const k of [...functions.keys()]) {
          const f = functions.get(k)
          if (f.name === e.name && (e.args === null || f.args === e.args)) functions.delete(k)
        }
        break
      }
      case 'createTrigger': triggers.set(`${e.table}.${e.name}`, { name: e.name, table: e.table, fn: e.fn, timing: e.timing, ...where }); break
      case 'dropTrigger': triggers.delete(`${e.table}.${e.name}`); break
      case 'createPolicy': policies.set(`${e.table}.${e.name}`, { name: e.name, table: e.table, cmd: e.cmd, roles: e.roles, ...where }); break
      case 'dropPolicy': policies.delete(`${e.table}.${e.name}`); break
      case 'createIndex': if (!indexes.has(e.name)) indexes.set(e.name, { name: e.name, table: e.table, unique: e.unique, def: e.def, ...where }); break
      case 'dropIndex': indexes.delete(e.name); break
      case 'createType': if (!types.has(e.name)) types.set(e.name, { name: e.name, enum: e.enum, values: e.values, ...where }); break
      case 'dropType': types.delete(e.name); break
      case 'createView': views.set(e.name, { name: e.name, materialized: e.materialized, ...where }); break
      case 'dropView': views.delete(e.name); break
      case 'createSequence': sequences.set(e.name, { name: e.name, ...where }); break
      case 'dropTable': tables.delete(e.name); break
      case 'publish': publication.add(e.name); break
    }
  }
  for (const name of publication) if (tables.has(name)) tables.get(name).published = true
  // Indexes and triggers on dropped tables go with them.
  for (const [k, v] of indexes) if (!tables.has(v.table) && !views.has(v.table)) indexes.delete(k)
  for (const [k, v] of triggers) if (!tables.has(v.table) && !v.table.includes('.')) triggers.delete(k)
  for (const [k, v] of policies) if (!tables.has(v.table) && !v.table.includes('.')) policies.delete(k)
  for (const [k, v] of constraints) if (!tables.has(v.table)) constraints.delete(k)

  return { tables, functions, triggers, policies, indexes, constraints, types, views, sequences, publication: [...publication].filter((p) => tables.has(p)).sort() }
}
