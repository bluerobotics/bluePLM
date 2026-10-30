/**
 * The top-bar search box and the file pane share one search. The box holds what the user typed,
 * filter prefix included ("folder:bracket"); the pane gets the bare term and a type it can filter
 * on. Before this the pane was handed the raw text and searched for the literal "folder:bracket",
 * which matches nothing. Picking a result goes to it, a 'moved_away' stub included.
 */

import { describe, expect, it, vi } from 'vitest'
import type { LocalFile } from '@/stores/pdmStore'

vi.mock('@/stores/pdmStore', () => ({ usePDMStore: vi.fn() }))

const { parseQuery, toPaneSearch, fromPaneSearch } = await import('./utils')
const { resultTarget } = await import('./hooks/useOpenResult')

function row(relativePath: string, overrides: Partial<LocalFile> = {}): LocalFile {
  return {
    name: relativePath.split('/').pop() ?? relativePath,
    path: `C:/vault/${relativePath}`,
    relativePath,
    isDirectory: false,
    extension: '.sldprt',
    size: 1,
    modifiedTime: '2026-10-29T00:00:00.000Z',
    ...overrides,
  }
}

describe('toPaneSearch', () => {
  it('strips the prefix and keeps a type the pane can filter on', () => {
    expect(toPaneSearch(parseQuery('folder:bracket', 'all'))).toEqual({
      query: 'bracket',
      type: 'folders',
    })
    expect(toPaneSearch(parseQuery('file: bracket', 'all'))).toEqual({
      query: 'bracket',
      type: 'files',
    })
  })

  it('searches every field for prefixes the pane matches anyway', () => {
    expect(toPaneSearch(parseQuery('pn:BR-1001', 'all'))).toEqual({ query: 'BR-1001', type: 'all' })
    expect(toPaneSearch(parseQuery('desc:housing', 'all'))).toEqual({
      query: 'housing',
      type: 'all',
    })
  })

  it('leaves the pane alone for filters it cannot express', () => {
    for (const text of ['by:eldin', 'state:released', 'drive:budget']) {
      expect(toPaneSearch(parseQuery(text, 'all'))).toEqual({ query: '', type: 'all' })
    }
  })

  it('uses the chosen filter when the text has no prefix', () => {
    expect(toPaneSearch(parseQuery('bracket', 'folders'))).toEqual({
      query: 'bracket',
      type: 'folders',
    })
  })
})

describe('fromPaneSearch', () => {
  it('puts the type back as a prefix the box parses to the same search', () => {
    for (const type of ['all', 'files', 'folders'] as const) {
      const text = fromPaneSearch('bracket', type)
      expect(toPaneSearch(parseQuery(text, 'all'))).toEqual({ query: 'bracket', type })
    }
  })

  it('is empty when there is no search', () => {
    expect(fromPaneSearch('', 'folders')).toBe('')
  })
})

describe('resultTarget', () => {
  it('opens a folder result', () => {
    const folder = row('parts/brackets', { isDirectory: true, extension: '' })
    expect(resultTarget(folder, 'open')).toEqual({ folder: 'parts/brackets', select: null })
  })

  it("opens a folder result's parent with it selected for Open file location", () => {
    const folder = row('parts/brackets', { isDirectory: true, extension: '' })
    expect(resultTarget(folder, 'location')).toEqual({
      folder: 'parts',
      select: 'parts/brackets',
    })
  })

  it('opens a file result in its folder with the file selected', () => {
    expect(resultTarget(row('parts/brackets/bracket.sldprt'), 'open')).toEqual({
      folder: 'parts/brackets',
      select: 'parts/brackets/bracket.sldprt',
    })
    expect(resultTarget(row('top.sldasm'), 'open')).toEqual({ folder: '', select: 'top.sldasm' })
  })

  it('goes where a moved_away stub says the content lives', () => {
    const stub = row('old/bracket.sldprt', {
      diffStatus: 'moved_away',
      movedToRelativePath: 'new/place/bracket.sldprt',
    })
    expect(resultTarget(stub, 'open')).toEqual({
      folder: 'new/place',
      select: 'new/place/bracket.sldprt',
    })
  })

  it('normalizes backslashes', () => {
    expect(resultTarget(row('parts\\bracket.sldprt'), 'open')).toEqual({
      folder: 'parts',
      select: 'parts/bracket.sldprt',
    })
  })
})
