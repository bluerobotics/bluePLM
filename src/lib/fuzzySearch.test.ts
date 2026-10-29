import { describe, expect, it } from 'vitest'
import {
  editDistance,
  fuzzyMatch,
  fuzzySearch,
  highlightSegments,
  matchToken,
  typoMatch,
} from './fuzzySearch'

describe('fuzzyMatch', () => {
  it('matches characters in order and reports their positions', () => {
    expect(fuzzyMatch('autoref', 'Auto-refresh')?.positions).toEqual([0, 1, 2, 3, 5, 6, 7])
    expect(fuzzyMatch('xyz', 'Preferences')).toBeNull()
    expect(fuzzyMatch('ecnerefer', 'Preferences')).toBeNull()
  })

  it('is case- and accent-insensitive', () => {
    expect(fuzzyMatch('DARK', 'dark mode')).not.toBeNull()
    expect(fuzzyMatch('resume', 'Résumé')?.positions).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('prefers word starts and consecutive runs over scattered letters', () => {
    const wordStart = fuzzyMatch('dm', 'Dark mode')
    const scattered = fuzzyMatch('dmo', 'random words')
    expect(wordStart?.positions).toEqual([0, 5])
    // The optimal alignment lands on the word start, not the first "m" it meets.
    expect(fuzzyMatch('mode', 'commode mode')?.positions).toEqual([8, 9, 10, 11])
    expect(fuzzyMatch('dmo', 'Dark mode')!.score).toBeGreaterThan(scattered?.score ?? 0)
  })

  it('treats camelCase humps as word starts', () => {
    expect(fuzzyMatch('sw', 'SolidWorks')?.positions).toEqual([0, 5])
  })

  it('only matches one or two characters at word starts', () => {
    expect(fuzzyMatch('dm', 'random')).toBeNull()
    expect(fuzzyMatch('o', 'Dark mode')).toBeNull()
    expect(fuzzyMatch('mo', 'Dark mode')?.positions).toEqual([5, 6])
  })

  it('ranks an exact match above a prefix above a substring', () => {
    const exact = fuzzyMatch('theme', 'Theme')!.score
    const prefix = fuzzyMatch('theme', 'Themes and colours')!.score
    const inner = fuzzyMatch('theme', 'Seasonal theme')!.score
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(inner)
  })
})

describe('typo tolerance', () => {
  it('computes optimal string alignment distance with transpositions', () => {
    expect(editDistance('serial', 'serial')).toBe(0)
    expect(editDistance('seiral', 'serial')).toBe(1)
    expect(editDistance('vualt', 'vault')).toBe(1)
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })

  it('matches a misspelled word, but not short tokens or far-off words', () => {
    expect(typoMatch('seiral', 'Serial Number Settings')?.positions).toEqual([0, 1, 2, 3, 4, 5])
    expect(typoMatch('vualt', 'Add Vault')).not.toBeNull()
    expect(typoMatch('teh', 'The theme')).toBeNull()
    expect(typoMatch('banana', 'Serial Number')).toBeNull()
  })

  it('matches a misspelled prefix of a longer word', () => {
    expect(typoMatch('serail', 'Serialization')).not.toBeNull()
  })

  it('falls back to typos only when the in-order match fails or is weak', () => {
    const clean = matchToken('serial', 'Serial')!.score
    const typo = matchToken('seiral', 'Serial')!.score
    expect(clean).toBeGreaterThan(typo)
  })
})

describe('fuzzySearch', () => {
  const items = [
    { label: 'Dark', keywords: ['theme', 'dark mode'] },
    { label: 'Language', keywords: ['locale'] },
    { label: 'Random seed', keywords: [] },
    { label: 'Theme', keywords: ['appearance'] },
  ]
  const fields = [
    { get: (i: (typeof items)[number]) => i.label, weight: 1 },
    { get: (i: (typeof items)[number]) => i.keywords, weight: 0.8 },
  ]
  const labels = (q: string) => fuzzySearch(items, q, fields).map((r) => r.item.label)

  it('returns nothing for an empty query', () => {
    expect(labels('   ')).toEqual([])
  })

  it('ranks a label hit above a keyword hit', () => {
    expect(labels('theme')).toEqual(['Theme', 'Dark'])
  })

  it('requires every token to match some field', () => {
    expect(labels('dark theme')).toEqual(['Dark'])
    expect(labels('dark banana')).toEqual([])
  })

  it('finds a record through a synonym', () => {
    expect(labels('locale')).toEqual(['Language'])
  })

  it('reports which field and alternative matched', () => {
    const [hit] = fuzzySearch(items, 'appearance', fields)
    expect(hit.hits).toEqual([{ field: 1, index: 0, positions: [...Array(10).keys()] }])
  })
})

describe('highlightSegments', () => {
  it('splits text into matched and plain runs', () => {
    expect(highlightSegments('Dark mode', [0, 5, 6])).toEqual([
      { text: 'D', match: true },
      { text: 'ark ', match: false },
      { text: 'mo', match: true },
      { text: 'de', match: false },
    ])
  })
})
