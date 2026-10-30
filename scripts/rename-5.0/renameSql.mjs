// SQL mode of the 5.0 rename codemod: rewrites identifiers in DDL, DML, plpgsql bodies, policies and
// comments from the rename map. It never touches auth.*, storage.* or other schemas, and changes a
// string literal only where the literal is an identifier (see renameLiteral). Anything it cannot place
// is reported in `ambiguous` and left as it was.

import { lexSql, codeOnly, lineOf } from './sqlLexer.mjs'

const FOREIGN_SCHEMAS = new Set(['auth', 'storage', 'extensions', 'pg_catalog', 'information_schema', 'cron', 'net', 'realtime', 'supabase_functions', 'graphql', 'pgsodium', 'vault'])
const NOT_ALIAS = new Set(('where set on using join left right inner outer full cross group order limit returning values select for with as and or not is in ' +
  'default from union except intersect offset having window loop then else end when case add drop alter owner rename replica to execute before after instead of each ' +
  'row statement natural lateral only all do nothing conflict into update delete insert begin if exists cascade restrict null true false like ilike between fetch ' +
  'enable disable force level security policy table index trigger function references check unique primary foreign key constraint column returns language strict ' +
  'tablesample nulls first last asc desc partition over filter within').split(' '))
const CATALOG_BEFORE = /(relname|tablename|table_name|typname|proname|tgname|polname|policyname|conname|indexname|indexrelname|attname|column_name|routine_name|event_object_table|to_regclass|to_regprocedure|to_regproc|to_regtype|has_table_privilege|has_function_privilege|has_column_privilege)\s*(=|<>|!=|\(|\bIN\s*\()[^;]{0,80}$/i
const CATALOG_AFTER = /^\s*::\s*(regclass|regprocedure|regproc|regtype)\b/i
const MANIFEST_KINDS = new Set(['table', 'function', 'view', 'trigger', 'policy', 'index', 'type', 'relation'])
const SQL_TEXT = /\b(SELECT|FROM|UPDATE|INSERT INTO|DELETE FROM|ALTER TABLE|CREATE|DROP|JOIN|EXECUTE|GRANT|REVOKE|TRUNCATE)\b/
const IDENT = /[A-Za-z_][A-Za-z0-9_]*/g

/**
 * @param {string} src
 * @param {ReturnType<import('./maps.mjs').buildLookups>} L
 * @param {{ triggerTables?: Map<string, Set<string>> }} [opts] old trigger function name -> old tables it fires on
 */
export function renameSql(src, L, opts = {}) {
  const triggerTables = opts.triggerTables ?? new Map()
  const spans = lexSql(src)
  const code = codeOnly(src)
  const edits = []
  const counts = { relation: 0, function: 0, column: 0, object: 0, policy: 0, literal: 0, comment: 0 }
  const ambiguous = []
  const amb = (pos, token, reason) => ambiguous.push({ line: lineOf(src, pos), token, reason })

  // ---- statements and their table scope (old table names) ----
  const stmts = []
  {
    let start = 0
    for (let k = 0; k <= code.length; k++) {
      if (k === code.length || code[k] === ';') { stmts.push({ start, end: k }); start = k + 1 }
    }
  }
  // Tables a stretch of code names (old names), and the aliases it gives them. A table after
  // REFERENCES is not in scope for unqualified columns; one after a non-public qualifier is not ours.
  const scanTables = (text, aliases) => {
    const tables = new Set()
    const re = /([A-Za-z_][A-Za-z0-9_]*)(\s*\.\s*)?/g
    const words = []
    let m
    while ((m = re.exec(text))) words.push({ w: m[1], dot: !!m[2], prev: text[m.index - 1] })
    for (let i = 0; i < words.length; i++) {
      const { w, dot, prev } = words[i]
      if (dot || prev === '$' || (prev && /[A-Za-z0-9_]/.test(prev))) continue
      if (!L.isTable(w)) continue
      if (i > 0 && words[i - 1].dot && words[i - 1].w.toLowerCase() !== 'public') continue
      const kw = words[i - 1]?.w.toLowerCase() === 'public' ? words[i - 2] : words[i - 1]
      if (kw && kw.w.toLowerCase() === 'references') continue
      // A new name can also be a column (file_version, review_round): count it only where a table goes.
      if (!L.relations.has(w) && L.oldTableOf(w) !== w && !/^(from|join|update|into|table|on|exists|only)$/i.test(kw?.w ?? '')) continue
      const old = L.oldTableOf(w)
      tables.add(old)
      if (aliases) {
        let j = i + 1
        if (words[j]?.w.toLowerCase() === 'as') j++
        const al = words[j]
        if (al && /^[a-z_][a-z0-9_]*$/.test(al.w) && !NOT_ALIAS.has(al.w) && !L.isTable(al.w) && !al.dot) aliases.set(al.w, old)
      }
    }
    return tables
  }
  // parenthesis pairs over the code (strings and comments are blank in `code`)
  const pairs = []
  {
    const stack = []
    for (let k = 0; k < code.length; k++) {
      if (code[k] === '(') stack.push(k)
      else if (code[k] === ')' && stack.length) pairs.push([stack.pop(), k])
    }
    pairs.sort((x, y) => x[0] - y[0])
  }
  const blankNested = (from, to) => {
    let t = code.slice(from, to).split('')
    for (const [o, c] of pairs) {
      if (o < from || c >= to) continue
      for (let k = o; k <= c; k++) t[k - from] = ' '
    }
    return t.join('')
  }
  for (const s of stmts) {
    s.aliases = new Map()
    s.tables = scanTables(code.slice(s.start, s.end), s.aliases)
  }
  /** Tables in scope for an unqualified column at pos: innermost enclosing parentheses that name a table. */
  const scopeAt = (pos, stmt) => {
    const enclosing = pairs.filter(([o, c]) => o < pos && c > pos && o >= stmt.start && c <= stmt.end).sort((x, y) => y[0] - x[0])
    for (const [o, c] of enclosing) {
      const lead = code.slice(Math.max(stmt.start, o - 80), o)
      const ins = lead.match(/INSERT\s+INTO\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:AS\s+\w+\s*)?$/i)
      if (ins && L.isTable(ins[1])) return new Set([L.oldTableOf(ins[1])])
      if (/ON\s+CONFLICT\s*$/i.test(lead)) {
        const tgt = code.slice(stmt.start, stmt.end).match(/INSERT\s+INTO\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)/i)
        if (tgt && L.isTable(tgt[1])) return new Set([L.oldTableOf(tgt[1])])
      }
      const t = scanTables(blankNested(o + 1, c))
      if (t.size) return t
    }
    return scanTables(blankNested(stmt.start, stmt.end))
  }
  let si = 0
  const stmtAt = (pos) => {
    while (si > 0 && stmts[si].start > pos) si--
    while (si < stmts.length - 1 && stmts[si].end < pos) si++
    return stmts[si]
  }

  // ---- RETURNS TABLE (...) ranges: names there are API output columns ----
  const returnsTable = []
  for (const m of code.matchAll(/\bRETURNS\s+TABLE\s*\(/gi)) {
    let depth = 0
    for (let k = m.index + m[0].length - 1; k < code.length; k++) {
      if (code[k] === '(') depth++
      else if (code[k] === ')' && --depth === 0) { returnsTable.push([m.index, k]); break }
    }
  }
  const inReturnsTable = (pos) => returnsTable.some(([a, b]) => pos > a && pos < b)

  // ---- function bodies, for NEW./OLD. in trigger functions ----
  const bodies = []
  for (const m of code.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    const rest = code.slice(m.index)
    const d = rest.match(/\bAS\s+(\$[A-Za-z_]*\$)/i)
    if (!d) continue
    const bodyStart = m.index + d.index + d[0].length
    const bodyEnd = code.indexOf(d[1], bodyStart)
    if (bodyEnd > 0) bodies.push({ name: m[1], start: bodyStart, end: bodyEnd })
  }
  const triggerTablesAt = (pos) => {
    const b = bodies.find((x) => pos >= x.start && pos < x.end)
    if (!b) return null
    return triggerTables.get(b.name) ?? triggerTables.get(L.functions.get(b.name)) ?? null
  }

  const resolveQualifier = (q, stmt, pos) => {
    if (stmt.aliases.has(q)) return [stmt.aliases.get(q)]
    const old = L.oldTableOf(q)
    if (L.relations.has(old) || L.tableColumns.has(old) || stmt.tables.has(old)) return [old]
    if (q.toLowerCase() === 'new' || q.toLowerCase() === 'old') {
      const t = triggerTablesAt(pos)
      return t ? [...t] : null
    }
    return null
  }

  const prevWord = (pos) => {
    const m = code.slice(Math.max(0, pos - 40), pos).match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/)
    return m ? m[1] : ''
  }

  /** Decide the replacement for an identifier token in code. */
  const codeToken = (w, pos) => {
    const before = code[pos - 1]
    if (before === '$' || (before && /[A-Za-z0-9_]/.test(before))) return null
    const qm = code.slice(Math.max(0, pos - 80), pos).match(/([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/)
    const q = qm ? qm[1] : null
    const qLower = q?.toLowerCase()
    if (q && FOREIGN_SCHEMAS.has(qLower)) return null
    const qualified = q && qLower !== 'public'
    const stmt = stmtAt(pos)

    if (L.relations.has(w)) {
      if (qualified) { amb(pos, `${q}.${w}`, 'relation name after a qualifier (record field or column?)'); return null }
      if (prevWord(pos).toLowerCase() === 'as') { amb(pos, w, 'relation name used as an alias'); return null }
      if (inReturnsTable(pos)) { amb(pos, w, 'relation name as a RETURNS TABLE column'); return null }
      counts.relation++
      return L.relations.get(w)
    }
    if (L.functions.has(w)) {
      if (qualified) { amb(pos, `${q}.${w}`, 'function name after a qualifier'); return null }
      counts.function++
      return L.functions.get(w)
    }
    if (L.objects.has(w)) { counts.object++; return L.objects.get(w) }

    const isGlobal = L.globalColumns.has(w)
    const scopedTables = L.scopedColumns.get(w)
    if (!isGlobal && !scopedTables) return null
    if (inReturnsTable(pos)) { amb(pos, w, 'column name as a RETURNS TABLE column (API output)'); return null }
    if (!qualified && prevWord(pos).toLowerCase() === 'as') { amb(pos, w, 'column name used as an output alias'); return null }
    if (isGlobal) { counts.column++; return L.globalColumns.get(w) }
    // scoped column: the table must be known
    if (qualified) {
      const ts = resolveQualifier(q, stmt, pos)
      if (!ts) { amb(pos, `${q}.${w}`, 'column of an unresolved record'); return null }
      const hits = ts.filter((t) => scopedTables.has(t))
      if (hits.length === 0) return null
      if (hits.length !== ts.length) { amb(pos, `${q}.${w}`, 'qualifier resolves to tables that disagree'); return null }
      counts.column++
      return L.columnFor(hits[0], w)
    }
    const scope = scopeAt(pos, stmt)
    const inScope = [...scope].filter((t) => scopedTables.has(t))
    if (inScope.length === 0) return null
    const keepers = [...scope].filter((t) => L.columnKeepers.get(w)?.has(t))
    const targets = new Set(inScope.map((t) => L.columnFor(t, w)))
    if (keepers.length === 0 && targets.size === 1) { counts.column++; return [...targets][0] }
    amb(pos, w, `unqualified column in a statement over ${[...scope].join(', ')}`)
    return null
  }

  /** Rename tokens with an underscore (and `table.column`) inside prose: comments and non-SQL literals. */
  const proseTokens = (text, kind) => {
    let out = ''
    let last = 0
    for (const m of text.matchAll(/(`?)([A-Za-z_][A-Za-z0-9_]*)(`?)(?:\.([A-Za-z_][A-Za-z0-9_]*))?/g)) {
      const [all, bt1, w, bt2, col] = m
      const at = m.index
      const prevCh = text[at - 1]
      // part of a word, a path or a file name (10-source-files.sql, supabase/modules/...)
      if (prevCh && /[A-Za-z0-9_$\-/\\]/.test(prevCh)) continue
      if (col && /^(sql|ts|tsx|mjs|cjs|js|json|md|mdc)$/.test(col)) continue
      const backticked = bt1 === '`' && bt2 === '`'
      const lookup = (x) => L.relations.get(x) ?? L.functions.get(x) ?? L.objects.get(x) ?? L.globalColumns.get(x) ?? null
      let rep = null
      let colRep = null
      if (w === 'public' && col) {
        colRep = lookup(col)
      } else {
        if (w.includes('_') || backticked) rep = lookup(w)
        if (col) {
          const isRel = L.relations.has(w) || L.tableColumns.has(L.oldTableOf(w))
          if (isRel) {
            colRep = L.columnFor(w, col) ?? (col.includes('_') ? L.globalColumns.get(col) ?? null : null)
            if (!rep && L.relations.has(w)) rep = L.relations.get(w)
          } else if (col.includes('_')) colRep = lookup(col)
        }
      }
      if (!rep && !colRep) continue
      const newText = `${bt1}${rep ?? w}${bt2}${col ? '.' + (colRep ?? col) : ''}`
      if (newText === all) continue
      out += text.slice(last, at) + newText
      last = at + all.length
      counts[kind]++
    }
    return out + text.slice(last)
  }

  const prevSpanContent = (idx) => {
    // the string literal just before this one, separated by a comma only
    for (let k = idx - 1; k >= 0; k--) {
      const s = spans[k]
      if (s.kind === 'code') { if (!/^\s*,\s*$/.test(s.text)) return null; continue }
      if (s.kind === 'string') return s.text.slice(1, -1)
      return null
    }
    return null
  }

  const nextSpanContent = (idx) => {
    for (let k = idx + 1; k < spans.length; k++) {
      const s = spans[k]
      if (s.kind === 'code') { if (!/^\s*,\s*$/.test(s.text)) return null; continue }
      if (s.kind === 'string') return s.text.slice(1, -1)
      return null
    }
    return null
  }

  /** @returns {string|null} new literal text (with quotes) or null to keep */
  const renameLiteral = (span, idx) => {
    const isE = /^[eE]/.test(span.text)
    const raw = span.text.slice(isE ? 2 : 1, -1)
    const c = raw.replace(/''/g, "'")
    const quote = (s) => (isE ? 'E' : '') + "'" + s.replace(/'/g, "''") + "'"
    const pos = span.start
    const before = code.slice(Math.max(0, pos - 120), pos)
    const after = code.slice(pos + span.text.length, pos + span.text.length + 30)
    const prevLit = prevSpanContent(idx)
    const nextLit = nextSpanContent(idx)
    const isObjectName = (x) => x !== null && (L.functions.has(x) || L.objects.has(x) || /^[a-z_]+\([^()]*\)$/.test(x))
    const inner = pairs.filter(([o, cl]) => o < pos && cl > pos).sort((x, y) => y[0] - x[0])[0]
    const listLead = inner ? code.slice(Math.max(0, inner[0] - 60), inner[0]) : ''
    const body = bodies.find((b) => pos >= b.start && pos < b.end)
    const catalog = CATALOG_BEFORE.test(before) || CATALOG_AFTER.test(after) ||
      MANIFEST_KINDS.has(prevLit ?? '') || MANIFEST_KINDS.has(nextLit ?? '') ||
      // ('users', 'review_withdraw_on_user_change'): a tuple pairing a table with one of its objects
      isObjectName(prevLit) || isObjectName(nextLit) ||
      // tablename IN ('files', 'file_versions', ...)
      /(relname|tablename|table_name|typname|proname|tgname|polname|policyname|conname|indexname)\s+(NOT\s+)?IN\s*$/i.test(listLead) ||
      // the release manifest lists object names only
      (body !== undefined && /^(schema_release_manifest|schema_get_release_manifest)$/.test(body.name))

    if (L.policies.has(c)) {
      const opts = L.policies.get(c)
      if (opts.length === 1) { counts.policy++; return quote(opts[0].to) }
      amb(pos, c, 'policy name shared by several tables'); return null
    }
    let m
    if ((m = c.match(/^(public\.)?([a-z_][a-z0-9_]*)$/))) {
      const w = m[2]
      if (L.functions.has(w) || L.objects.has(w)) { counts.literal++; return quote((m[1] ?? '') + (L.functions.get(w) ?? L.objects.get(w))) }
      if (L.relations.has(w)) {
        if (catalog || m[1]) { counts.literal++; return quote((m[1] ?? '') + L.relations.get(w)) }
        amb(pos, `'${c}'`, 'literal equal to a table name outside a catalog lookup (JSON key, label?)'); return null
      }
      if (L.globalColumns.has(w)) {
        if (catalog) { counts.literal++; return quote(L.globalColumns.get(w)) }
        amb(pos, `'${c}'`, 'literal equal to a renamed column (JSON key?)'); return null
      }
      if (L.scopedColumns.has(w) && catalog) { amb(pos, `'${c}'`, 'catalog literal naming a column whose table is unknown'); return null }
      return null
    }
    if ((m = c.match(/^(public\.)?([a-z_][a-z0-9_]*)\s*\(([^()]*)\)$/)) && L.functions.has(m[2])) {
      counts.literal++
      return quote(`${m[1] ?? ''}${L.functions.get(m[2])}(${m[3]})`)
    }
    if (/^\s*[{[]/.test(c)) {
      for (const t of c.matchAll(IDENT)) {
        if (L.relations.has(t[0]) || L.globalColumns.has(t[0]) || L.functions.has(t[0])) { amb(pos, t[0], 'identifier inside a JSON literal'); break }
      }
      return null
    }
    if (SQL_TEXT.test(c)) {
      // dynamic SQL: rename like code, without statement scope
      let out = ''
      let last = 0
      for (const t of c.matchAll(IDENT)) {
        const w = t[0]
        const pc = c[t.index - 1]
        if (pc && /[A-Za-z0-9_$%]/.test(pc)) continue
        const q = c.slice(0, t.index).match(/([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/)
        if (q && FOREIGN_SCHEMAS.has(q[1].toLowerCase())) continue
        const rep = L.relations.get(w) ?? L.functions.get(w) ?? L.objects.get(w) ?? L.globalColumns.get(w)
        if (!rep) {
          if (L.scopedColumns.has(w)) amb(pos, w, 'column inside dynamic SQL; table not resolved')
          continue
        }
        if (q && q[1].toLowerCase() !== 'public' && L.relations.has(w)) { amb(pos, `${q[1]}.${w}`, 'relation after a qualifier in dynamic SQL'); continue }
        out += c.slice(last, t.index) + rep
        last = t.index + w.length
        counts.literal++
      }
      return last ? quote(out + c.slice(last)) : null
    }
    const r = proseTokens(c, 'literal')
    return r !== c ? quote(r) : null
  }

  spans.forEach((span, idx) => {
    if (span.kind === 'code') {
      for (const m of span.text.matchAll(IDENT)) {
        const pos = span.start + m.index
        const rep = codeToken(m[0], pos)
        if (rep && rep !== m[0]) edits.push({ start: pos, end: pos + m[0].length, text: rep })
      }
    } else if (span.kind === 'quoted') {
      const c = span.text.slice(1, -1).replace(/""/g, '"')
      let rep = null
      if (L.policies.has(c)) {
        const opts = L.policies.get(c)
        const stmt = stmtAt(span.start)
        const pick = opts.length === 1 ? opts[0] : opts.find((o) => stmt.tables.has(o.table))
        if (pick) { rep = pick.to; counts.policy++ } else amb(span.start, c, 'policy name shared by several tables; ON table not found')
      } else if (L.relations.has(c)) { rep = L.relations.get(c); counts.relation++ }
      else if (L.functions.has(c)) { rep = L.functions.get(c); counts.function++ }
      else if (L.objects.has(c)) { rep = L.objects.get(c); counts.object++ }
      else if (L.globalColumns.has(c)) { rep = L.globalColumns.get(c); counts.column++ }
      if (rep) edits.push({ start: span.start, end: span.start + span.text.length, text: '"' + rep.replace(/"/g, '""') + '"' })
    } else if (span.kind === 'string') {
      const rep = renameLiteral(span, idx)
      if (rep && rep !== span.text) edits.push({ start: span.start, end: span.start + span.text.length, text: rep })
    } else if (span.kind === 'comment') {
      const r = proseTokens(span.text, 'comment')
      if (r !== span.text) edits.push({ start: span.start, end: span.start + span.text.length, text: r })
    }
  })

  edits.sort((a, b) => a.start - b.start)
  let out = ''
  let last = 0
  for (const e of edits) {
    if (e.start < last) continue
    out += src.slice(last, e.start) + e.text
    last = e.end
  }
  out += src.slice(last)
  return { text: out, counts, changes: edits.length, ambiguous }
}

/** old trigger function -> Set(old tables) from the map's triggers. */
export function triggerTablesFromMap(map) {
  const out = new Map()
  for (const t of map.triggers) {
    if (!out.has(t.function)) out.set(t.function, new Set())
    out.get(t.function).add(t.table)
  }
  return out
}
