// TS/TSX mode of the 5.0 rename codemod. Rewrites what names the database in client, API and test code:
//   .from('x') and the test fake's table methods, .rpc('x'), Realtime `table: 'x'` and its `filter`,
//   PostgREST select strings (embeds, `!hint`s, columns), filter and order column arguments, `.or()`
//   strings, onConflict lists, insert/update/upsert payload keys, Database['public']['Tables']['x']
//   style type references, renamed columns used as identifiers (only the distinctive, `global` ones),
//   and the generated src/types/supabase.ts (see renameGeneratedTypes).
// Literals equal to a table or column name in any other position are reported, not changed.

import { lexTs } from './tsLexer.mjs'

const TABLE_METHODS = 'from|seed|row|rows|removeRows|insertRow|applyUpdate|updateAndEmit|failNext|emitRealtime|assertTable'
const RPC_METHODS = 'rpc|defineRpc'
const FILTER_METHODS = 'eq|neq|gt|gte|lt|lte|like|ilike|likeAllOf|likeAnyOf|ilikeAllOf|ilikeAnyOf|is|in|contains|containedBy|overlaps|rangeGt|rangeGte|rangeLt|rangeLte|rangeAdjacent|textSearch|not|filter|order'
const PAYLOAD_METHODS = 'insert|update|upsert'
const FAKE_PAYLOAD_METHODS = 'seed|insertRow|updateAndEmit|applyUpdate'
// `.rpc(`, `.rpc<T>(`, and the untyped `(supabase.rpc as any)(` form
const CALL_TAIL = String.raw`\s*(?:as\s+[\w<>\[\]]+\s*\))?\s*(?:<[^>]*>)?\(\s*$`
const EMBED_HINT_KEYWORDS =new Set(['inner', 'left', 'right'])

const lineOf = (src, off) => {
  let n = 1
  for (let k = 0; k < off; k++) if (src.charCodeAt(k) === 10) n++
  return n
}

/**
 * @param {string} src
 * @param {ReturnType<import('./maps.mjs').buildLookups>} L
 * @param {{ file?: string }} [opts]
 */
export function renameTs(src, L, opts = {}) {
  if (/(^|[\\/])types[\\/]supabase\.ts$/.test(opts.file ?? '') || /__InternalSupabase/.test(src.slice(0, 2000))) {
    return renameGeneratedTypes(src, L)
  }
  const spans = lexTs(src)
  const counts = { table: 0, function: 0, column: 0, select: 0, type: 0 }
  const ambiguous = []
  const edits = []
  const amb = (pos, token, reason) => ambiguous.push({ line: lineOf(src, pos), token, reason })
  const edit = (start, end, text, kind) => {
    if (src.slice(start, end) === text) return
    edits.push({ start, end, text })
    counts[kind]++
  }

  // code with comments, string and template contents blanked (quotes kept), for context checks
  const codeArr = src.split('')
  for (const s of spans) {
    if (s.kind === 'comment' || s.kind === 'regex') for (let k = s.start; k < s.start + s.text.length; k++) if (codeArr[k] !== '\n') codeArr[k] = ' '
    if (s.kind === 'string') for (let k = s.start + 1; k < s.start + s.text.length - 1; k++) if (codeArr[k] !== '\n') codeArr[k] = ' '
    if (s.kind === 'template') for (let k = s.start; k < s.start + s.text.length; k++) if (codeArr[k] !== '\n') codeArr[k] = ' '
  }
  const code = codeArr.join('')

  // ---- literal units: a quoted string, or all chunks of one template literal ----
  /** @type {{ start: number, end: number, chunks: {start: number, text: string}[], text: string, offsets: number[] }[]} */
  const units = []
  const seenGroups = new Set()
  for (let k = 0; k < spans.length; k++) {
    const s = spans[k]
    if (s.kind === 'string') {
      const text = s.text.slice(1, -1)
      units.push({ start: s.start, end: s.start + s.text.length, text, offsets: [...text].map((_, i) => s.start + 1 + i), hasSubst: false })
    } else if (s.kind === 'template') {
      // gather the chunks of this group (they are contiguous in `spans` apart from code in substitutions)
      if (seenGroups.has(s.group)) continue
      seenGroups.add(s.group)
      const chunks = spans.filter((x) => x.kind === 'template' && x.group === s.group)
      let text = ''
      const offsets = []
      chunks.forEach((ch, ci) => {
        for (let i = 0; i < ch.text.length; i++) { text += ch.text[i]; offsets.push(ch.start + i) }
        if (ci < chunks.length - 1) { text += '\u0001'; offsets.push(-1) }
      })
      const last = chunks[chunks.length - 1]
      units.push({ start: chunks[0].start - 1, end: last.start + last.text.length + 1, text, offsets, group: s.group, hasSubst: chunks.length > 1 })
    }
  }
  /** Replace [a, b) of a unit's text (positions in unit text) with `rep`. */
  const unitEdit = (u, a, b, rep, kind) => {
    const sa = u.offsets[a]
    const sb = u.offsets[b - 1]
    if (sa < 0 || sb < 0) return
    edit(sa, sb + 1, rep, kind)
  }

  /** Old table named by the nearest `.from('x')` in the same statement before pos. */
  const chainTable = (pos) => {
    const from = Math.max(0, pos - 1500)
    const seg = src.slice(from, pos)
    let best = null
    for (const m of seg.matchAll(/\.from\s*(?:<[^>]*>)?\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\)/g)) best = { at: from + m.index, name: m[2] }
    if (!best) return null
    const between = code.slice(best.at, pos)
    if (/;\s*\n|\n\s*\n\s*(const|let|var|return|await|export|function|if)\b/.test(between)) return null
    return L.oldTableOf(best.name)
  }

  const renameColumn = (table, col) => {
    if (L.globalColumns.has(col)) return L.globalColumns.get(col)
    if (table) return L.columnFor(table, col) ?? null
    return null
  }
  const scopedUnknown = (table, col) => !table && L.scopedColumns.has(col)

  /** Rename the columns, embeds and hints of a PostgREST select string. */
  const renameSelect = (u, table) => {
    const t = u.text
    let i = 0
    const stack = [table]
    const ident = /[A-Za-z_][A-Za-z0-9_]*/y
    const skipWs = () => { while (i < t.length && /\s/.test(t[i])) i++ }
    while (i < t.length) {
      skipWs()
      if (i >= t.length) break
      const ch = t[i]
      if (ch === ',' ) { i++; continue }
      if (ch === ')') { stack.pop(); i++; continue }
      if (ch === '*' || ch === '\u0001') { i++; continue }
      if (t.startsWith('...', i)) { i += 3; continue }
      ident.lastIndex = i
      const m1 = ident.exec(t)
      if (!m1) { i++; continue }
      let nameStart = i
      let name = m1[0]
      i = ident.lastIndex
      skipWs()
      // alias:name
      if (t[i] === ':' && t[i + 1] !== ':') {
        i++
        skipWs()
        ident.lastIndex = i
        const m2 = ident.exec(t)
        if (!m2) continue
        nameStart = i
        name = m2[0]
        i = ident.lastIndex
        skipWs()
      }
      // hints
      const hints = []
      while (t[i] === '!') {
        i++
        ident.lastIndex = i
        const mh = ident.exec(t)
        if (!mh) break
        hints.push({ start: i, name: mh[0] })
        i = ident.lastIndex
        skipWs()
      }
      const outer = stack[stack.length - 1]
      if (t[i] === '(') {
        // embedded resource
        let rel = L.oldTableOf(name)
        if (L.relations.has(name)) unitEdit(u, nameStart, nameStart + name.length, L.relations.get(name), 'select')
        else if (!L.isTable(name)) {
          // embedded through a foreign-key column: `assignee:assigned_to(email)`
          const c = renameColumn(outer, name)
          if (c) unitEdit(u, nameStart, nameStart + name.length, c, 'select')
          rel = null
        }
        for (const h of hints) {
          if (EMBED_HINT_KEYWORDS.has(h.name)) continue
          if (L.objects.has(h.name)) unitEdit(u, h.start, h.start + h.name.length, L.objects.get(h.name), 'select')
          else {
            const c = renameColumn(outer, h.name)
            if (c) unitEdit(u, h.start, h.start + h.name.length, c, 'select')
            else if (scopedUnknown(outer, h.name)) amb(u.offsets[h.start], h.name, 'embed hint column; outer table unknown')
          }
        }
        stack.push(rel)
        i++
        continue
      }
      // a column, possibly with ::cast or ->json path
      const c = renameColumn(outer, name)
      if (c) unitEdit(u, nameStart, nameStart + name.length, c, 'select')
      else if (scopedUnknown(outer, name)) amb(u.offsets[nameStart], name, 'select column; table unknown')
      while (i < t.length && t[i] !== ',' && t[i] !== ')' && t[i] !== '(') i++
    }
  }

  /** `col.op.value,col2.op.value` (also nested and/or groups) */
  const renameOrFilter = (u, table) => {
    for (const m of u.text.matchAll(/(^|[,(])\s*([A-Za-z_][A-Za-z0-9_]*)\.(?=[a-z]+[.(])/g)) {
      const col = m[2]
      if (/^(and|or|not)$/.test(col)) continue
      const at = m.index + m[0].length - col.length - 1
      const c = renameColumn(table, col)
      if (c) unitEdit(u, at, at + col.length, c, 'column')
      else if (scopedUnknown(table, col)) amb(u.offsets[at], col, 'filter column; table unknown')
    }
  }

  const literalIs = (u, re) => !u.hasSubst && re.test(u.text)
  const IDENT_ONLY = /^[A-Za-z_][A-Za-z0-9_]*$/

  for (const u of units) {
    const before = code.slice(Math.max(0, u.start - 200), u.start)
    const beforeSrc = src.slice(Math.max(0, u.start - 200), u.start)
    const w = u.text
    let m
    if (new RegExp(`\\.(?:${TABLE_METHODS})${CALL_TAIL}`).test(before) && literalIs(u, IDENT_ONLY)) {
      if (L.relations.has(w)) unitEdit(u, 0, w.length, L.relations.get(w), 'table')
      continue
    }
    if (new RegExp(`\\.(?:${RPC_METHODS})${CALL_TAIL}`).test(before) && literalIs(u, IDENT_ONLY)) {
      if (L.functions.has(w)) unitEdit(u, 0, w.length, L.functions.get(w), 'function')
      continue
    }
    if (/(?:\btable|\bforeignTable|\breferencedTable)\s*:\s*$/.test(before) || /\.table\s*[!=]==?\s*$/.test(before)) {
      if (literalIs(u, IDENT_ONLY) && L.relations.has(w)) unitEdit(u, 0, w.length, L.relations.get(w), 'table')
      continue
    }
    // Database['public']['Tables']['x'] / Tables<'x'> / Functions['x']
    if (/(?:\[\s*['"](?:Tables|Views)['"]\s*\]|\b(?:Tables|Views))\s*\[\s*$/.test(beforeSrc) || /\b(?:Tables|TablesInsert|TablesUpdate|RowOf|TableRow|TableName)\s*<\s*$/.test(beforeSrc)) {
      if (literalIs(u, IDENT_ONLY) && L.relations.has(w)) unitEdit(u, 0, w.length, L.relations.get(w), 'type')
      continue
    }
    if (/(?:\[\s*['"]Functions['"]\s*\]|\bFunctions)\s*\[\s*$/.test(beforeSrc)) {
      if (literalIs(u, IDENT_ONLY) && L.functions.has(w)) unitEdit(u, 0, w.length, L.functions.get(w), 'type')
      continue
    }
    if ((m = beforeSrc.match(/\[\s*['"](?:Tables|Views)['"]\s*\]\s*\[\s*['"]([A-Za-z_]\w*)['"]\s*\]\s*\[\s*['"](?:Row|Insert|Update)['"]\s*\]\s*\[\s*$/))) {
      const c = literalIs(u, IDENT_ONLY) ? L.columnFor(m[1], w) : null
      if (c) unitEdit(u, 0, w.length, c, 'type')
      continue
    }
    if (/\.select\s*(?:<[^>]*>)?\(\s*$/.test(before)) {
      renameSelect(u, chainTable(u.start))
      continue
    }
    if (new RegExp(`\\.(?:${FILTER_METHODS})\\s*\\(\\s*$`).test(before) && literalIs(u, /^[A-Za-z_][A-Za-z0-9_]*(->>?.*)?$/)) {
      const col = w.match(/^[A-Za-z_][A-Za-z0-9_]*/)[0]
      const table = chainTable(u.start)
      const c = renameColumn(table, col)
      if (c) unitEdit(u, 0, col.length, c, 'column')
      else if (scopedUnknown(table, col)) amb(u.start, col, 'filter column; table unknown')
      continue
    }
    if (/\.or\s*\(\s*$/.test(before)) { renameOrFilter(u, chainTable(u.start)); continue }
    if (/\bonConflict\s*:\s*$/.test(before)) {
      const table = chainTable(u.start)
      for (const mm of w.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
        const c = renameColumn(table, mm[0])
        if (c) unitEdit(u, mm.index, mm.index + mm[0].length, c, 'column')
      }
      continue
    }
    if (/\bfilter\s*:\s*$/.test(before)) {
      // Realtime filter: `col=eq.value`; the table is the `table:` in the same object
      const near = src.slice(Math.max(0, u.start - 300), Math.min(src.length, u.end + 300))
      const tm = near.match(/\btable\s*:\s*['"`]([A-Za-z_]\w*)['"`]/)
      const table = tm ? L.oldTableOf(tm[1]) : null
      const cm = w.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)
      if (cm) {
        const c = renameColumn(table, cm[1])
        if (c) unitEdit(u, 0, cm[1].length, c, 'column')
        else if (scopedUnknown(table, cm[1])) amb(u.start, cm[1], 'realtime filter column; table unknown')
      }
      continue
    }
    // a select list kept in a constant: it embeds a known relation
    if (/^[\w\s,:!()*.>\-\u0001]+$/.test(w) && [...w.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:![A-Za-z_]\w*\s*)*\(/g)].some((x) => L.isTable(x[1]))) {
      renameSelect(u, null)
      continue
    }
    if (literalIs(u, IDENT_ONLY)) {
      if (L.relations.has(w)) {
        // A snake_case table name with an underscore is a database name wherever it appears (realtime
        // change keys, test fakes, table lists); a one-word name (files, users, reviews) is also a module
        // id, a search scope or a label, so it changes only where it is compared with a table.
        if (w.includes('_') || /\b(?:table|tableName|relation|name)\s*[!=]==?\s*$/.test(before)) unitEdit(u, 0, w.length, L.relations.get(w), 'table')
        else amb(u.start, `'${w}'`, 'literal equal to a table name in an unrecognised position')
      } else if (L.functions.has(w)) unitEdit(u, 0, w.length, L.functions.get(w), 'function')
      else if (L.globalColumns.has(w)) amb(u.start, `'${w}'`, 'literal equal to a renamed column outside a query')
      else if (L.objects.has(w)) unitEdit(u, 0, w.length, L.objects.get(w), 'select')
      continue
    }
    if (!u.hasSubst && L.policies.has(w)) {
      const p = L.policies.get(w)
      if (p.length === 1) unitEdit(u, 0, w.length, p[0].to, 'table')
      else amb(u.start, `'${w}'`, 'policy name shared by several tables')
      continue
    }
    if (/\b(SELECT|FROM|UPDATE|INSERT INTO|CREATE|ALTER TABLE|DROP|POLICY|FUNCTION)\b/.test(w)) {
      const hit = [...w.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].find((x) => L.relations.has(x[0]) || L.functions.has(x[0]) || L.globalColumns.has(x[0]) || L.objects.has(x[0]))
      if (hit) amb(u.start, hit[0], 'SQL text inside a TS string (a test reading the schema?)')
    }
  }

  // ---- payload object keys: .insert({...}) / .update({...}) / .upsert([...]) and the fake's seed('t', {...}) ----
  const payloadRanges = []
  for (const m of code.matchAll(new RegExp(`\\.(${PAYLOAD_METHODS}|${FAKE_PAYLOAD_METHODS})\\s*(?:<[^>]*>)?\\(`, 'g'))) {
    let k = m.index + m[0].length
    let table
    if (new RegExp(`^(${FAKE_PAYLOAD_METHODS})$`).test(m[1])) {
      const lit = src.slice(k).match(/^\s*(['"])([A-Za-z_]\w*)\1\s*,\s*/)
      if (!lit) continue
      table = L.oldTableOf(lit[2])
      k += lit[0].length
      if (m[1] !== 'seed' && m[1] !== 'insertRow') {
        // updateAndEmit('t', id, patch) / applyUpdate('t', row, patch): the patch is the last argument
        const close = matchClose(code, m.index + m[0].length - 1)
        const lastComma = code.lastIndexOf(',', close)
        k = lastComma + 1
      }
    } else table = chainTable(m.index)
    while (/\s/.test(code[k])) k++
    if (code[k] !== '{' && code[k] !== '[') continue
    const end = matchClose(code, k)
    if (end < 0) continue
    payloadRanges.push({ start: k, end, table })
  }
  const objectKeyAt = (pos, len) => {
    // `key:` or shorthand `{ key }` / `, key,`
    let a = pos - 1
    while (a >= 0 && /[ \t\r\n]/.test(code[a])) a--
    let b = pos + len
    while (b < code.length && /[ \t\r\n]/.test(code[b])) b++
    const prevCh = code[a]
    if (prevCh !== '{' && prevCh !== ',') return null
    if (code[b] === ':' && code[b + 1] !== ':') return 'key'
    if (code[b] === ',' || code[b] === '}') return 'shorthand'
    return null
  }
  const depthIn = (range, pos) => {
    let d = 0
    for (let k = range.start; k < pos; k++) {
      const ch = code[k]
      if (ch === '{' || ch === '[' || ch === '(') d++
      else if (ch === '}' || ch === ']' || ch === ')') d--
    }
    return d
  }

  // ---- identifiers in code ----
  const scopedTablesMentioned = new Set()
  for (const u of units) if (literalIs(u, IDENT_ONLY) && L.isTable(u.text)) scopedTablesMentioned.add(L.oldTableOf(u.text))
  for (const s of spans) {
    if (s.kind !== 'code') continue
    for (const m of s.text.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
      const w = m[0]
      const pos = s.start + m.index
      const prev = src[pos - 1]
      if (prev && /[A-Za-z0-9_$]/.test(prev)) continue
      const isGlobal = L.globalColumns.has(w)
      const scoped = L.scopedColumns.get(w)
      if (!isGlobal && !scoped) continue
      const range = payloadRanges.find((r) => pos > r.start && pos < r.end && depthIn(r, pos) === 1)
      const keyKind = objectKeyAt(pos, w.length)
      let rep = null
      if (range && keyKind) rep = renameColumn(range.table, w)
      else if (isGlobal) rep = L.globalColumns.get(w)
      if (rep) {
        if (keyKind === 'shorthand') edit(pos, pos + w.length, `${rep}: ${w}`, 'column')
        else edit(pos, pos + w.length, rep, 'column')
        continue
      }
      if (scoped && [...scoped].some((t) => scopedTablesMentioned.has(t)) && (prev === '.' || keyKind)) {
        amb(pos, w, `property or key that may be ${[...scoped].join('/')}.${w}`)
      }
    }
  }

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

function matchClose(code, open) {
  const pairs = { '{': '}', '[': ']', '(': ')' }
  const stack = []
  for (let k = open; k < code.length; k++) {
    const ch = code[k]
    if (pairs[ch]) stack.push(pairs[ch])
    else if (ch === '}' || ch === ']' || ch === ')') {
      if (stack.pop() !== ch) return -1
      if (!stack.length) return k
    }
  }
  return -1
}

/**
 * The generated src/types/supabase.ts, rewritten by structure: table, view and function keys, column
 * keys per table, relationship metadata and Database["public"][...] references.
 */
export function renameGeneratedTypes(src, L) {
  const counts = { table: 0, function: 0, column: 0, select: 0, type: 0 }
  const lines = src.split('\n')
  let section = null
  let table = null
  let inCols = false
  let refTable = null
  let inPublic = false
  const out = lines.map((line) => {
    let m
    if ((m = line.match(/^  (\w+): \{/))) { inPublic = m[1] === 'public'; section = null; return line }
    if (!inPublic) return line
    if ((m = line.match(/^    (Tables|Views|Functions|Enums|CompositeTypes): \{/))) { section = m[1]; table = null; return line }
    if ((section === 'Tables' || section === 'Views') && (m = line.match(/^      (\w+): \{/))) {
      table = m[1]
      inCols = false
      if (L.relations.has(table)) { counts.table++; return line.replace(`      ${table}:`, `      ${L.relations.get(table)}:`) }
      return line
    }
    if (section === 'Functions' && (m = line.match(/^      (\w+):/))) {
      if (L.functions.has(m[1])) { counts.function++; return line.replace(`      ${m[1]}:`, `      ${L.functions.get(m[1])}:`) }
      return line
    }
    if ((section === 'Tables' || section === 'Views') && table) {
      if ((m = line.match(/^        (Row|Insert|Update): \{/))) { inCols = true; return line }
      if (/^        (Relationships): \[/.test(line)) { inCols = false; return line }
      if (inCols && (m = line.match(/^          (\w+)(\??):/))) {
        const c = L.columnFor(table, m[1])
        if (c) { counts.column++; return line.replace(`          ${m[1]}${m[2]}:`, `          ${c}${m[2]}:`) }
        return line
      }
      if ((m = line.match(/^(\s+)foreignKeyName: "(\w+)"/))) {
        if (L.objects.has(m[2])) { counts.type++; return line.replace(`"${m[2]}"`, `"${L.objects.get(m[2])}"`) }
        return line
      }
      if ((m = line.match(/^(\s+)referencedRelation: "(\w+)"/))) {
        refTable = m[2]
        if (L.relations.has(m[2])) { counts.table++; return line.replace(`"${m[2]}"`, `"${L.relations.get(m[2])}"`) }
        return line
      }
      if ((m = line.match(/^(\s+)(columns|referencedColumns): \[(.*)\]/))) {
        const t = m[2] === 'columns' ? table : refTable
        return line.replace(/"(\w+)"/g, (all, c) => {
          const r = L.columnFor(t, c)
          if (r) { counts.column++; return `"${r}"` }
          return all
        })
      }
    }
    if (section === 'Functions' && (m = line.match(/^(\s+)(from|to): "(\w+)"/)) && L.relations.has(m[3])) {
      counts.table++
      return line.replace(`"${m[3]}"`, `"${L.relations.get(m[3])}"`)
    }
    return line
  })
  let text = out.join('\n')
  // Database["public"]["Tables"]["x"](["Row"]["col"])
  text = text.replace(/(\[\s*"(?:Tables|Views)"\s*\]\s*\[\s*")(\w+)("\s*\])/g, (all, a, t, b) => {
    if (!L.relations.has(t)) return all
    counts.type++
    return a + L.relations.get(t) + b
  })
  return { text, counts, changes: Object.values(counts).reduce((a, b) => a + b, 0), ambiguous: [] }
}
