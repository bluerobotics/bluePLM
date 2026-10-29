/**
 * Fuzzy matching for interactive search boxes.
 *
 * `fuzzyMatch` scores one query against one string with an optimal-alignment dynamic program in
 * the style of fzf's v2 algorithm: every query character must appear in order, and among all
 * the ways to place them the highest-scoring one wins. Matches earn bonuses at word starts
 * (after a space, punctuation or a camelCase hump) and for consecutive runs, and pay for gaps,
 * so "dm" ranks "Dark mode" above "random", and "autoref" finds "Auto-refresh".
 *
 * When the in-order match fails, a token of four or more characters may still match a whole
 * word within a small Damerau-Levenshtein distance, so "prefrences" and "seiral" still find
 * their settings. Those matches score well below a clean one.
 *
 * `fuzzySearch` ranks records with several weighted fields: the query is split on whitespace,
 * every token has to match some field, and the full query is also tried as one phrase.
 */

const SCORE_MATCH = 16
const GAP_START = -3
const GAP_EXTENSION = -1
const BONUS_BOUNDARY = 8
const BONUS_CAMEL = 7
const BONUS_CONSECUTIVE = -(GAP_START + GAP_EXTENSION)
const BONUS_FIRST_CHAR_MULTIPLIER = 2
const BONUS_EXACT = 24
const BONUS_PREFIX = 12
const NEG = -1e9

export interface FuzzyMatch {
  score: number
  /** Indices into the original text of every matched character, ascending. */
  positions: number[]
}

/** Lowercase and strip diacritics while keeping a one-to-one index map to the original text. */
function fold(text: string): string {
  let out = ''
  for (const ch of text) {
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    // Keep the length identical to the original so positions map straight back.
    out += base.length === ch.length ? base : ch.toLowerCase().slice(0, ch.length).padEnd(ch.length)
  }
  return out
}

function isAlphaNum(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch)
}

function isUpper(ch: string): boolean {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase()
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

/** Bonus for a match at index `j`, based on what precedes it in the original text. */
function positionBonus(text: string, j: number): number {
  const cur = text[j]
  if (!isAlphaNum(cur)) return 0
  if (j === 0) return BONUS_BOUNDARY
  const prev = text[j - 1]
  if (!isAlphaNum(prev)) return BONUS_BOUNDARY
  if (isUpper(cur) && !isUpper(prev)) return BONUS_CAMEL
  if (isDigit(cur) && !isDigit(prev)) return BONUS_CAMEL
  return 0
}

/**
 * Best in-order alignment of `query` inside `text`, or null when the characters do not all
 * appear in order. Queries of one or two characters only match at word starts (see
 * `isShortQueryMatch`), so a single keystroke does not light up every string with that letter.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = fold(query.trim())
  const t = fold(text)
  const m = q.length
  const n = t.length
  if (m === 0 || m > n) return null

  const bonus = new Array<number>(n)
  for (let j = 0; j < n; j++) bonus[j] = positionBonus(text, j)

  // M[i][j]: best score with query[i] matched at text[j]. B: bonus carried by the run that
  // ends at (i, j). From: -1 for a consecutive step, else the text index of query[i - 1].
  const M: number[][] = []
  const B: number[][] = []
  const from: number[][] = []

  for (let i = 0; i < m; i++) {
    const row = new Array<number>(n).fill(NEG)
    const runBonus = new Array<number>(n).fill(0)
    const fromRow = new Array<number>(n).fill(-2)
    const prevRow = i > 0 ? M[i - 1] : null
    const prevBonus = i > 0 ? B[i - 1] : null

    // Best predecessor reachable through a gap of at least one character.
    let gapScore = NEG
    let gapFrom = -2

    for (let j = i; j < n; j++) {
      if (prevRow && j >= 2) {
        const opened = prevRow[j - 2] + GAP_START
        const extended = gapScore + GAP_EXTENSION
        if (opened >= extended) {
          gapScore = opened
          gapFrom = j - 2
        } else {
          gapScore = extended
        }
      }
      if (t[j] !== q[i]) continue

      if (i === 0) {
        row[j] = SCORE_MATCH + bonus[j] * BONUS_FIRST_CHAR_MULTIPLIER
        runBonus[j] = bonus[j]
        fromRow[j] = -2
        continue
      }

      let best = NEG
      if (prevRow && prevBonus && j >= 1 && prevRow[j - 1] > NEG) {
        const carried = Math.max(prevBonus[j - 1], BONUS_CONSECUTIVE)
        const stepBonus = bonus[j] >= BONUS_BOUNDARY && bonus[j] > carried ? bonus[j] : carried
        best = prevRow[j - 1] + SCORE_MATCH + stepBonus
        runBonus[j] = stepBonus
        fromRow[j] = -1
      }
      if (gapScore > NEG) {
        const viaGap = gapScore + SCORE_MATCH + bonus[j]
        if (viaGap > best) {
          best = viaGap
          runBonus[j] = bonus[j]
          fromRow[j] = gapFrom
        }
      }
      row[j] = best
    }
    M.push(row)
    B.push(runBonus)
    from.push(fromRow)
  }

  let end = -1
  let score = NEG
  for (let j = m - 1; j < n; j++) {
    if (M[m - 1][j] > score) {
      score = M[m - 1][j]
      end = j
    }
  }
  if (end < 0 || score <= NEG / 2) return null

  const positions = new Array<number>(m)
  let j = end
  for (let i = m - 1; i >= 0; i--) {
    positions[i] = j
    const f = from[i][j]
    j = f === -1 ? j - 1 : f
  }

  if (m <= 2 && !isShortQueryMatch(text, positions)) return null
  return { score: score + wholeStringBonus(q, t), positions }
}

/**
 * One or two characters are kept when they read as a word prefix ("da" in "Dark mode") or an
 * acronym ("dm", "sw" in "SolidWorks"): every character starts a word or continues a run.
 */
function isShortQueryMatch(text: string, positions: readonly number[]): boolean {
  return positions.every(
    (p, k) => positionBonus(text, p) >= BONUS_CAMEL || (k > 0 && p === positions[k - 1] + 1),
  )
}

function wholeStringBonus(q: string, t: string): number {
  if (t === q) return BONUS_EXACT + BONUS_PREFIX
  if (t.startsWith(q)) return BONUS_PREFIX
  return 0
}

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent transpositions). */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev2 = new Array<number>(b.length + 1).fill(0)
  let prev = Array.from({ length: b.length + 1 }, (_, k) => k)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1)
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prev2[j - 2] + 1)
      }
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    for (let k = 0; k <= b.length; k++) prev2[k] = prev[k]
    prev = cur
  }
  return prev[b.length]
}

/**
 * Typo-tolerant word match: the token against each word of `text` (and each word's prefix of
 * the token's length, so a partly typed word with a typo still matches). One edit is allowed
 * from four characters, two from eight, and the first letter must be right.
 */
export function typoMatch(token: string, text: string): FuzzyMatch | null {
  const q = fold(token.trim())
  if (q.length < 4) return null
  const maxEdits = q.length >= 8 ? 2 : 1
  const t = fold(text)
  let best: FuzzyMatch | null = null
  const wordRe = /[\p{L}\p{N}]+/gu
  for (const word of t.matchAll(wordRe)) {
    const start = word.index ?? 0
    const w = word[0]
    const candidates = w.length > q.length ? [w, w.slice(0, q.length)] : [w]
    for (const candidate of candidates) {
      // People rarely mistype the first letter, and allowing it lets "dark" find "mark".
      if (candidate[0] !== q[0]) continue
      const d = editDistance(q, candidate, maxEdits)
      if (d > maxEdits) continue
      const score = (SCORE_MATCH + BONUS_BOUNDARY) * q.length * 0.5 - d * SCORE_MATCH
      if (!best || score > best.score) {
        best = {
          score,
          positions: Array.from({ length: candidate.length }, (_, k) => start + k),
        }
      }
    }
  }
  return best
}

/**
 * A clean match must average at least this much per query character. Substrings (about 20 per
 * character) and abbreviations that land on word starts (about 21) pass; letters scattered
 * mid-word across a long string (about 12) do not.
 */
const MIN_SCORE_PER_CHAR = 14

/** `fuzzyMatch`, then `typoMatch`, with the quality floor applied to the in-order match. */
export function matchToken(token: string, text: string): FuzzyMatch | null {
  const exact = fuzzyMatch(token, text)
  const length = token.trim().length
  if (exact && exact.score >= length * MIN_SCORE_PER_CHAR) return exact
  return typoMatch(token, text)
}

export interface FuzzyField<T> {
  /** Text of this field for a record; an array means several alternatives (keywords). */
  get: (item: T) => string | readonly string[]
  /** Multiplier on the field's score. The primary field should be 1. */
  weight: number
}

export interface FuzzyFieldHit {
  field: number
  /** Which alternative of an array field matched (0 for a string field). */
  index: number
  positions: number[]
}

export interface FuzzyResult<T> {
  item: T
  score: number
  /** Matched characters per field alternative, for highlighting. */
  hits: FuzzyFieldHit[]
}

function fieldTexts<T>(field: FuzzyField<T>, item: T): readonly string[] {
  const value = field.get(item)
  return typeof value === 'string' ? [value] : value
}

function mergePositions(a: number[], b: number[]): number[] {
  return [...new Set([...a, ...b])].sort((x, y) => x - y)
}

function addHit(hits: FuzzyFieldHit[], hit: FuzzyFieldHit): void {
  const existing = hits.find((h) => h.field === hit.field && h.index === hit.index)
  if (existing) existing.positions = mergePositions(existing.positions, hit.positions)
  else hits.push({ ...hit, positions: [...hit.positions] })
}

function bestFieldMatch<T>(
  item: T,
  fields: readonly FuzzyField<T>[],
  match: (text: string) => FuzzyMatch | null,
): { score: number; hit: FuzzyFieldHit } | null {
  let best: { score: number; hit: FuzzyFieldHit } | null = null
  for (const [f, field] of fields.entries()) {
    for (const [index, text] of fieldTexts(field, item).entries()) {
      const m = match(text)
      if (!m) continue
      const score = m.score * field.weight
      if (!best || score > best.score) {
        best = { score, hit: { field: f, index, positions: m.positions } }
      }
    }
  }
  return best
}

/**
 * Rank `items` against `query`. Every whitespace-separated token must match at least one field;
 * a record's score is the sum of each token's best weighted field score, or the whole query
 * matched as one phrase in a single field when that scores higher (each token must also match
 * that field on its own). Ties go to the shorter
 * primary text, then to the original order.
 */
export function fuzzySearch<T>(
  items: readonly T[],
  query: string,
  fields: readonly FuzzyField<T>[],
): FuzzyResult<T>[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const phrase = tokens.join(' ')

  const results: (FuzzyResult<T> & { order: number; length: number })[] = []

  items.forEach((item, order) => {
    let tokenTotal = 0
    const tokenHits: FuzzyFieldHit[] = []
    for (const token of tokens) {
      const best = bestFieldMatch(item, fields, (text) => matchToken(token, text))
      if (!best) return
      tokenTotal += best.score
      addHit(tokenHits, best.hit)
    }

    // The phrase rewards tokens that sit together. It must not admit a token that would not
    // match that text on its own ("sw" is not in "Show revision"), so it never adds a record
    // the tokens rejected; it only re-scores one.
    const phraseHit =
      tokens.length > 1
        ? bestFieldMatch(item, fields, (text) => {
            const match = fuzzyMatch(phrase, text)
            if (!match || match.score < phrase.length * MIN_SCORE_PER_CHAR) return null
            return tokens.every((token) => matchToken(token, text)) ? match : null
          })
        : null

    const usePhrase = phraseHit !== null && phraseHit.score >= tokenTotal
    const primary = fieldTexts(fields[0], item)[0] ?? ''
    results.push({
      item,
      score: usePhrase ? phraseHit.score : tokenTotal,
      hits: usePhrase ? [phraseHit.hit] : tokenHits,
      order,
      length: primary.length,
    })
  })

  results.sort((a, b) => b.score - a.score || a.length - b.length || a.order - b.order)
  return results.map(({ item, score, hits }) => ({ item, score, hits }))
}

/** Split `text` into plain and matched runs for rendering highlights. */
export function highlightSegments(
  text: string,
  positions: readonly number[],
): { text: string; match: boolean }[] {
  const marked = new Set(positions)
  const segments: { text: string; match: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const match = marked.has(i)
    const last = segments[segments.length - 1]
    if (last && last.match === match) last.text += text[i]
    else segments.push({ text: text[i], match })
  }
  return segments
}
