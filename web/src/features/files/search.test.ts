import { describe, expect, it } from 'vitest'
import { buildSearchFilter, normalizeSearch } from './search'
import { downloadFileName, storagePathCandidates } from './storagePath'

describe('normalizeSearch', () => {
  it('collapses whitespace and drops wildcards', () => {
    expect(normalizeSearch('  bracket   6061 ')).toBe('bracket 6061')
    expect(normalizeSearch('a*b')).toBe('a b')
    expect(normalizeSearch(null)).toBe('')
  })
})

describe('buildSearchFilter', () => {
  it('searches name, part number and description as a quoted substring', () => {
    expect(buildSearchFilter('BR-100')).toBe(
      'file_name.ilike."*BR-100*",part_number.ilike."*BR-100*",description.ilike."*BR-100*"',
    )
  })
  it('keeps commas, parentheses and quotes inside the quoted value', () => {
    const filter = buildSearchFilter('a,b) "x"')
    expect(filter).toContain('file_name.ilike."*a,b) \\"x\\"*"')
  })
  it('escapes LIKE metacharacters and backslashes', () => {
    // `_` becomes `\_` for LIKE, then the backslash is doubled for the quoted value.
    expect(buildSearchFilter('a_b')).toContain('file_name.ilike."*a\\\\_b*"')
    expect(buildSearchFilter('50%')).toContain('"*50\\\\%*"')
  })
  it('refuses queries that are too short', () => {
    expect(buildSearchFilter('a')).toBeNull()
    expect(buildSearchFilter('   ')).toBeNull()
  })
})

describe('storagePathCandidates', () => {
  const org = '0d4f6f2e-1c2b-4c5d-9e8f-123456789abc'
  const hash = 'ab'.repeat(32)
  it('tries the sharded layout first, then the flat one', () => {
    expect(storagePathCandidates(org, hash)).toEqual([`${org}/ab/${hash}`, `${org}/${hash}`])
  })
  it('refuses a malformed hash or org id', () => {
    expect(storagePathCandidates(org, '../other-org/x')).toEqual([])
    expect(storagePathCandidates(org, null)).toEqual([])
    expect(storagePathCandidates('../x', hash)).toEqual([])
    expect(storagePathCandidates(null, hash)).toEqual([])
  })
})

describe('downloadFileName', () => {
  it('keeps a plain name and strips separators and control characters', () => {
    expect(downloadFileName('Bracket.SLDPRT', 'x')).toBe('Bracket.SLDPRT')
    expect(downloadFileName('..\\evil/name\u0000.txt', 'x')).toBe('.._evil_name_.txt')
    expect(downloadFileName('', 'fallback')).toBe('fallback')
  })
})
