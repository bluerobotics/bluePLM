import { describe, expect, it } from 'vitest'
import { discoverSubfolders, MAX_EXCLUDED_SUBFOLDERS, type SubfolderPageRequest } from './subfolders'
import { childFolderName } from './paths'

/** A fake backend over a list of paths that honours exclusions, offset and limit like PostgREST. */
function fakeBackend(folder: string, paths: string[]) {
  const sorted = [...paths].sort()
  const requests: SubfolderPageRequest[] = []
  const fetchPage = async (request: SubfolderPageRequest) => {
    requests.push(request)
    const excluded = new Set(request.excluded.map((name) => name.toLowerCase()))
    const rows = sorted.filter((path) => {
      const name = childFolderName(folder, path)
      return name !== null && !excluded.has(name.toLowerCase())
    })
    return rows.slice(request.offset, request.offset + request.limit)
  }
  return { fetchPage, requests }
}

describe('discoverSubfolders', () => {
  it('finds every child folder with one request per round, not per file', async () => {
    const paths = [
      ...Array.from({ length: 5000 }, (_, i) => `Big/f${i}.sldprt`),
      'Small/a.sldprt',
      'Deep/x/y/z.sldprt',
      'root.sldprt',
    ]
    const { fetchPage, requests } = fakeBackend('', paths)
    const result = await discoverSubfolders('', [], fetchPage)
    expect(result.truncated).toBe(false)
    expect(result.names.sort()).toEqual(['Big', 'Deep', 'Small'])
    expect(requests.length).toBeLessThanOrEqual(4)
  })

  it('works below the root and merges spellings case-insensitively', async () => {
    const { fetchPage } = fakeBackend('A', ['A/B/1.sldprt', 'a/b/2.sldprt', 'A/C/3.sldprt', 'A/4.sldprt'])
    const result = await discoverSubfolders('A', [], fetchPage)
    expect(result.names.sort()).toEqual(['B', 'C'])
  })

  it('keeps seeded folders (empty explicit folders) and excludes them from the first request', async () => {
    const { fetchPage, requests } = fakeBackend('', ['B/1.sldprt'])
    const result = await discoverSubfolders('', ['Empty', 'B'], fetchPage)
    expect(result.names.sort()).toEqual(['B', 'Empty'])
    expect(requests[0].excluded).toEqual(['Empty', 'B'])
  })

  it('switches to paging once the exclusion list is long, and still finds everything', async () => {
    const count = MAX_EXCLUDED_SUBFOLDERS + 50
    const paths = Array.from({ length: count }, (_, i) => `F${String(i).padStart(4, '0')}/a.sldprt`)
    const { fetchPage, requests } = fakeBackend('', paths)
    const result = await discoverSubfolders('', [], fetchPage)
    expect(result.names.length).toBe(count)
    expect(requests.every((request) => request.excluded.length <= MAX_EXCLUDED_SUBFOLDERS)).toBe(true)
  })

  it('stops when the backend ignores the exclusions instead of looping', async () => {
    let calls = 0
    const result = await discoverSubfolders('', [], async () => {
      calls++
      return ['A/x.sldprt']
    })
    expect(result.names).toEqual(['A'])
    expect(calls).toBe(2)
  })
})
