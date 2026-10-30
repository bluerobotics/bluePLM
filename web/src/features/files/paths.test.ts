import { describe, expect, it } from 'vitest'
import {
  addFolderName,
  breadcrumbs,
  childFolderName,
  folderPatterns,
  joinPath,
  normalizeFolderPath,
  parentFolder,
  subtreePattern,
} from './paths'

describe('normalizeFolderPath', () => {
  it('trims separators, converts backslashes and drops empty and dot parts', () => {
    expect(normalizeFolderPath('/A//B/')).toBe('A/B')
    expect(normalizeFolderPath('A\\B\\C')).toBe('A/B/C')
    expect(normalizeFolderPath('./A/./B')).toBe('A/B')
    expect(normalizeFolderPath('')).toBe('')
    expect(normalizeFolderPath(null)).toBe('')
  })
})

describe('joinPath / parentFolder', () => {
  it('joins at the root and below it', () => {
    expect(joinPath('', 'A')).toBe('A')
    expect(joinPath('A/B/', 'C')).toBe('A/B/C')
  })
  it('finds the folder of a file', () => {
    expect(parentFolder('a.sldprt')).toBe('')
    expect(parentFolder('A/B/a.sldprt')).toBe('A/B')
  })
})

describe('breadcrumbs', () => {
  it('lists each level outermost first', () => {
    expect(breadcrumbs('A/B/C')).toEqual([
      { name: 'A', path: 'A' },
      { name: 'B', path: 'A/B' },
      { name: 'C', path: 'A/B/C' },
    ])
    expect(breadcrumbs('')).toEqual([])
  })
})

describe('folderPatterns', () => {
  it('matches the root level with bare wildcards', () => {
    expect(folderPatterns('')).toEqual({ direct: '*', nested: '*/*' })
  })
  it('escapes LIKE metacharacters in folder names', () => {
    expect(folderPatterns('Part_Files/100%')).toEqual({
      direct: 'Part\\_Files/100\\%/*',
      nested: 'Part\\_Files/100\\%/*/*',
    })
  })
  it('builds a subtree pattern for one child folder', () => {
    expect(subtreePattern('A', 'B_1')).toBe('A/B\\_1/*')
    expect(subtreePattern('', 'Top')).toBe('Top/*')
  })
})

describe('childFolderName', () => {
  it('names the child folder a file lies in', () => {
    expect(childFolderName('', 'A/b.sldprt')).toBe('A')
    expect(childFolderName('', 'A/B/c.sldprt')).toBe('A')
    expect(childFolderName('A', 'A/B/c.sldprt')).toBe('B')
    expect(childFolderName('A', 'A/B/C/d.sldprt')).toBe('B')
  })
  it('returns null for files directly in the folder or elsewhere', () => {
    expect(childFolderName('', 'b.sldprt')).toBeNull()
    expect(childFolderName('A', 'A/b.sldprt')).toBeNull()
    expect(childFolderName('A', 'AB/c/d.sldprt')).toBeNull()
    expect(childFolderName('A', 'X/A/c.sldprt')).toBeNull()
  })
  it('matches the folder case-insensitively and keeps the row spelling', () => {
    expect(childFolderName('Parts', 'parts/Sub/x.sldprt')).toBe('Sub')
  })
  it('treats a folder row as its own child', () => {
    expect(childFolderName('A', 'A/B', true)).toBe('B')
    expect(childFolderName('', 'Top', true)).toBe('Top')
    expect(childFolderName('A', 'A', true)).toBeNull()
  })
})

describe('addFolderName', () => {
  it('dedupes case-insensitively, keeping the first spelling', () => {
    const map = new Map<string, string>()
    expect(addFolderName(map, 'Parts')).toBe(true)
    expect(addFolderName(map, 'PARTS')).toBe(false)
    expect([...map.values()]).toEqual(['Parts'])
  })
})
