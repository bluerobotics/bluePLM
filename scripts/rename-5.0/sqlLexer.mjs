// Small SQL lexer shared by the 5.0 schema inventory, the rename codemod and the naming test.
//
// It does not parse SQL. It splits text into spans the callers treat differently:
//   code     - everything outside comments and quotes (dollar-quoted bodies count as code,
//              because plpgsql bodies are code; the `$tag$` delimiters themselves are skipped)
//   comment  - `-- ...` and `/* ... */`
//   string   - '...' (with '' escapes) and E'...' (with backslash escapes)
//   quoted   - "..." identifiers
// Concatenating every span's text gives back the input unchanged.

/**
 * @typedef {{ kind: 'code'|'comment'|'string'|'quoted', text: string, start: number }} Span
 */

/** @param {string} src @returns {Span[]} */
export function lexSql(src) {
  /** @type {Span[]} */
  const spans = []
  let i = 0
  let codeStart = 0
  const n = src.length
  const flushCode = (end) => {
    if (end > codeStart) spans.push({ kind: 'code', text: src.slice(codeStart, end), start: codeStart })
  }
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === '-' && c2 === '-') {
      flushCode(i)
      let j = src.indexOf('\n', i)
      if (j === -1) j = n
      spans.push({ kind: 'comment', text: src.slice(i, j), start: i })
      i = j
      codeStart = i
      continue
    }
    if (c === '/' && c2 === '*') {
      flushCode(i)
      let depth = 1
      let j = i + 2
      while (j < n && depth > 0) {
        if (src[j] === '/' && src[j + 1] === '*') { depth++; j += 2; continue }
        if (src[j] === '*' && src[j + 1] === '/') { depth--; j += 2; continue }
        j++
      }
      spans.push({ kind: 'comment', text: src.slice(i, j), start: i })
      i = j
      codeStart = i
      continue
    }
    if (c === "'") {
      const isE = i > 0 && /[eE]/.test(src[i - 1]) && (i < 2 || !/[A-Za-z0-9_]/.test(src[i - 2]))
      flushCode(isE ? i - 1 : i)
      const s = isE ? i - 1 : i
      let j = i + 1
      while (j < n) {
        if (isE && src[j] === '\\') { j += 2; continue }
        if (src[j] === "'") {
          if (src[j + 1] === "'") { j += 2; continue }
          j++
          break
        }
        j++
      }
      spans.push({ kind: 'string', text: src.slice(s, j), start: s })
      i = j
      codeStart = i
      continue
    }
    if (c === '"') {
      flushCode(i)
      let j = i + 1
      while (j < n) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') { j += 2; continue }
          j++
          break
        }
        j++
      }
      spans.push({ kind: 'quoted', text: src.slice(i, j), start: i })
      i = j
      codeStart = i
      continue
    }
    i++
  }
  flushCode(n)
  return spans
}

/** Replace comments with spaces (newlines kept) so offsets and line numbers survive. */
export function stripComments(src) {
  return lexSql(src)
    .map((s) => (s.kind === 'comment' ? s.text.replace(/[^\n]/g, ' ') : s.text))
    .join('')
}

/** Replace comments and string contents with spaces; quoted identifiers stay. */
export function codeOnly(src) {
  return lexSql(src)
    .map((s) => {
      if (s.kind === 'comment') return s.text.replace(/[^\n]/g, ' ')
      if (s.kind === 'string') return "'" + s.text.slice(1, -1).replace(/[^\n]/g, ' ') + "'"
      return s.text
    })
    .join('')
}

/** 1-based line number of an offset. */
export function lineOf(src, offset) {
  let line = 1
  for (let k = 0; k < offset && k < src.length; k++) if (src.charCodeAt(k) === 10) line++
  return line
}

/** Index just past the parenthesis that closes the one at `open` (string/comment aware text expected). */
export function matchParen(text, open) {
  let depth = 0
  for (let k = open; k < text.length; k++) {
    const ch = text[k]
    if (ch === "'") {
      k = skipString(text, k)
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return k + 1
    }
  }
  return -1
}

/** Split on commas at paren depth 0 (strings skipped). */
export function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let last = 0
  for (let k = 0; k < text.length; k++) {
    const ch = text[k]
    if (ch === "'") {
      k = skipString(text, k)
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(last, k))
      last = k + 1
    }
  }
  parts.push(text.slice(last))
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** Offset of the quote that closes the string opening at `open`. */
function skipString(text, open) {
  let k = open + 1
  while (k < text.length) {
    if (text[k] === "'") {
      if (text[k + 1] === "'") { k += 2; continue }
      return k
    }
    k++
  }
  return k
}
