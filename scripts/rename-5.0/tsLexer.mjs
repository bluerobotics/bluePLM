// Minimal TS/TSX lexer for the rename codemod: finds comments, string literals and template literal
// chunks so the renamer can tell code from text. It is not a parser. Regex literals are recognised by
// the usual heuristic (a `/` where an expression may start); JSX text is treated as code, which is
// harmless because the renamer only rewrites identifiers and literals it recognises.

/**
 * @typedef {{ kind: 'code'|'comment'|'string'|'template', text: string, start: number, quote?: string, group?: number }} TsSpan
 * `template` spans are the literal chunks of a template string, without the backticks or `${`/`}`;
 * chunks of one template literal share `group`.
 */

const REGEX_PREV = /(^|[=(,:;!&|?{}[\]+\-*%<>~^]|\breturn|\btypeof|\bcase|\bdo|\belse|\bin|\bof|\bvoid|\byield|\bawait)\s*$/

/** @param {string} src @returns {TsSpan[]} */
export function lexTs(src) {
  /** @type {TsSpan[]} */
  const spans = []
  const n = src.length
  let i = 0
  let codeStart = 0
  /** brace depth stack for template substitutions: each entry is the brace depth at which `}` resumes the template */
  const tplStack = []
  const groupStack = []
  let groups = 0
  let braceDepth = 0
  const flush = (end) => {
    if (end > codeStart) spans.push({ kind: 'code', text: src.slice(codeStart, end), start: codeStart })
  }
  const readTemplate = (from, group) => {
    // from points just after a backtick or after a `}` closing a substitution; returns index after chunk end
    let j = from
    while (j < n) {
      const ch = src[j]
      if (ch === '\\') { j += 2; continue }
      if (ch === '`') {
        spans.push({ kind: 'template', text: src.slice(from, j), start: from, group })
        return { end: j + 1, closed: true }
      }
      if (ch === '$' && src[j + 1] === '{') {
        spans.push({ kind: 'template', text: src.slice(from, j), start: from, group })
        return { end: j + 2, closed: false }
      }
      j++
    }
    spans.push({ kind: 'template', text: src.slice(from), start: from, group })
    return { end: n, closed: true }
  }
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === '/' && c2 === '/') {
      flush(i)
      let j = src.indexOf('\n', i)
      if (j === -1) j = n
      spans.push({ kind: 'comment', text: src.slice(i, j), start: i })
      i = codeStart = j
      continue
    }
    if (c === '/' && c2 === '*') {
      flush(i)
      let j = src.indexOf('*/', i + 2)
      j = j === -1 ? n : j + 2
      spans.push({ kind: 'comment', text: src.slice(i, j), start: i })
      i = codeStart = j
      continue
    }
    if (c === '/' && REGEX_PREV.test(src.slice(Math.max(codeStart, i - 30), i))) {
      // regex literal: skip to the closing slash (honouring classes and escapes)
      let j = i + 1
      let inClass = false
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '[') inClass = true
        else if (src[j] === ']') inClass = false
        else if (src[j] === '/' && !inClass) break
        j++
      }
      if (src[j] === '/') {
        flush(i)
        spans.push({ kind: 'regex', text: src.slice(i, j + 1), start: i })
        i = codeStart = j + 1
        continue
      }
    }
    if (c === "'" || c === '"') {
      flush(i)
      let j = i + 1
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      spans.push({ kind: 'string', text: src.slice(i, j + 1), start: i, quote: c })
      i = codeStart = j + 1
      continue
    }
    if (c === '`') {
      flush(i)
      const group = ++groups
      const r = readTemplate(i + 1, group)
      i = codeStart = r.end
      if (!r.closed) { tplStack.push(braceDepth); groupStack.push(group) }
      continue
    }
    if (c === '{') braceDepth++
    if (c === '}') {
      if (tplStack.length && tplStack[tplStack.length - 1] === braceDepth) {
        flush(i)
        tplStack.pop()
        const group = groupStack.pop()
        const r = readTemplate(i + 1, group)
        i = codeStart = r.end
        if (!r.closed) { tplStack.push(braceDepth); groupStack.push(group) }
        continue
      }
      braceDepth--
    }
    i++
  }
  flush(n)
  return spans
}
