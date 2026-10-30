import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDownloadUrl = vi.fn()
vi.mock('./storage', () => ({
  getDownloadUrl: (...args: unknown[]) => getDownloadUrl(...args),
}))
const saveUrlAs = vi.fn()
// Content checks (schema 503): the stubbed storage answers each signed URL with the content hash as
// the body, so "hashing" the body (identity here) gives back the hash unless a test changes the body.
const blocked = new Set<string>()
vi.mock('@/lib/vaultObjectIssues', () => ({
  blockedContentHashes: async (hashes: string[]) => new Set(hashes.filter((h) => blocked.has(h))),
  sha256Hex: async (bytes: ArrayBuffer) => new TextDecoder().decode(bytes),
}))
const saveBlobAs = vi.fn()
vi.mock('./browserDownload', () => ({
  saveUrlAs: (...args: unknown[]) => saveUrlAs(...args),
  saveBlobAs: (...args: unknown[]) => saveBlobAs(...args),
}))
const JSZip = (await import('jszip')).default

const {
  planWebDownload,
  saveItemsInBrowser,
  saveStoredFileInBrowser,
  zipLayout,
  WEB_DOWNLOAD_MAX_BYTES,
  WEB_DOWNLOAD_MAX_FILES,
  WEB_DOWNLOAD_URL_TTL_SECONDS,
} = await import('./webDownload')

function row(relativePath: string, hash: string | null = `hash-${relativePath}`, size = 0) {
  return {
    name: relativePath.split('/').pop()!,
    relativePath,
    isDirectory: false,
    pdmData: { content_hash: hash, file_size: size },
  }
}

describe('planWebDownload', () => {
  it('downloads each file under its own name and hash', () => {
    const plan = planWebDownload([row('Parts/a.sldprt'), row('b.pdf')])
    expect(plan).toEqual({
      kind: 'download',
      skippedNoHash: 0,
      items: [
        { name: 'a.sldprt', contentHash: 'hash-Parts/a.sldprt', relativePath: 'Parts/a.sldprt', size: 0 },
        { name: 'b.pdf', contentHash: 'hash-b.pdf', relativePath: 'b.pdf', size: 0 },
      ],
    })
  })

  it('skips folders and counts files without a hash instead of failing them', () => {
    const plan = planWebDownload([
      { name: 'Parts', relativePath: 'Parts', isDirectory: true },
      row('Parts/ghost.sldprt', null),
      row('Parts/a.sldprt'),
    ])
    expect(plan.kind).toBe('download')
    if (plan.kind !== 'download') return
    expect(plan.items.map((i) => i.relativePath)).toEqual(['Parts/a.sldprt'])
    expect(plan.skippedNoHash).toBe(1)
  })

  it('collapses the same path selected twice', () => {
    const plan = planWebDownload([row('a.pdf'), row('A.PDF', 'hash-a.pdf')])
    expect(plan.kind === 'download' && plan.items).toHaveLength(1)
  })

  it('is empty when nothing has bytes to fetch', () => {
    expect(planWebDownload([row('a.pdf', null)])).toEqual({ kind: 'empty', skippedNoHash: 1 })
    expect(planWebDownload([])).toEqual({ kind: 'empty', skippedNoHash: 0 })
  })

  it('refuses a selection above the limit as a whole', () => {
    const files = Array.from({ length: WEB_DOWNLOAD_MAX_FILES + 1 }, (_, i) => row(`f${i}.pdf`))
    expect(planWebDownload(files)).toEqual({
      kind: 'too-many',
      count: WEB_DOWNLOAD_MAX_FILES + 1,
      max: WEB_DOWNLOAD_MAX_FILES,
    })
    expect(planWebDownload(files.slice(1)).kind).toBe('download')
  })

  it('refuses a zip above the size limit, but never a single file', () => {
    const half = WEB_DOWNLOAD_MAX_BYTES / 2 + 1
    expect(planWebDownload([row('a.bin', 'h1', half), row('b.bin', 'h2', half)])).toEqual({
      kind: 'too-large',
      bytes: half * 2,
      maxBytes: WEB_DOWNLOAD_MAX_BYTES,
    })
    expect(planWebDownload([row('a.bin', 'h1', WEB_DOWNLOAD_MAX_BYTES * 2)]).kind).toBe('download')
  })
})

describe('zipLayout', () => {
  it('names the zip after the deepest shared folder and keeps paths below it', () => {
    expect(zipLayout([{ relativePath: 'Proj/Parts/a.sldprt' }, { relativePath: 'Proj/Parts/Sub/b.sldprt' }])).toEqual({
      zipName: 'Parts.zip',
      entries: ['a.sldprt', 'Sub/b.sldprt'],
    })
  })

  it('falls back to a generic name when the files share no folder', () => {
    expect(zipLayout([{ relativePath: 'A/a.pdf' }, { relativePath: 'B/b.pdf' }])).toEqual({
      zipName: 'BluePLM files.zip',
      entries: ['A/a.pdf', 'B/b.pdf'],
    })
  })
})

describe('saveStoredFileInBrowser', () => {
  beforeEach(() => {
    getDownloadUrl.mockReset()
    saveUrlAs.mockReset()
  })

  it('asks for a short-lived attachment URL named after the file and hands it to the browser', async () => {
    getDownloadUrl.mockResolvedValue({ url: 'https://signed/x' })
    const result = await saveStoredFileInBrowser('org-1', 'hash-1', 'part.sldprt')
    expect(result).toEqual({ success: true })
    expect(getDownloadUrl).toHaveBeenCalledWith('org-1', 'hash-1', WEB_DOWNLOAD_URL_TTL_SECONDS, {
      downloadName: 'part.sldprt',
    })
    expect(saveUrlAs).toHaveBeenCalledWith('https://signed/x', 'part.sldprt')
  })

  it('reports a missing URL and saves nothing', async () => {
    getDownloadUrl.mockResolvedValue({ url: null, error: 'not found' })
    expect(await saveStoredFileInBrowser('org-1', 'hash-1', 'a.pdf')).toEqual({
      success: false,
      error: 'not found',
    })
    expect(saveUrlAs).not.toHaveBeenCalled()
  })

  it('saves one file without a zip, after checking its bytes against its hash', async () => {
    saveBlobAs.mockReset()
    getDownloadUrl.mockResolvedValue({ url: 'https://signed/h1' })
    vi.stubGlobal('fetch', async (url: string) => new Response(url.slice('https://signed/'.length)))
    try {
      const result = await saveItemsInBrowser('org-1', [
        { name: 'a.pdf', contentHash: 'h1', relativePath: 'Docs/a.pdf', size: 3 },
      ])
      expect(result).toEqual({ succeeded: 1, failures: [], cancelled: false })
      expect(saveUrlAs).not.toHaveBeenCalled()
      expect(saveBlobAs.mock.calls.map((c) => c[0])).toEqual(['a.pdf'])

      // Bytes that do not hash to the name are refused, not saved.
      saveBlobAs.mockReset()
      vi.stubGlobal('fetch', async () => new Response('something else'))
      const damaged = await saveItemsInBrowser('org-1', [
        { name: 'a.pdf', contentHash: 'h1', relativePath: 'Docs/a.pdf', size: 3 },
      ])
      expect(damaged.succeeded).toBe(0)
      expect(damaged.failures[0].error).toMatch(/damaged/)
      expect(saveBlobAs).not.toHaveBeenCalled()

      // Content an admin marked unrecoverable is not fetched at all.
      blocked.add('h1')
      const refused = await saveItemsInBrowser('org-1', [
        { name: 'a.pdf', contentHash: 'h1', relativePath: 'Docs/a.pdf', size: 3 },
      ])
      expect(refused.failures[0].error).toMatch(/unrecoverable/)
    } finally {
      blocked.clear()
      vi.unstubAllGlobals()
    }
  })

  it('zips several files under their folder paths and lists the failures by name', async () => {
    saveBlobAs.mockReset()
    getDownloadUrl.mockImplementation(async (_org: string, hash: string) =>
      hash === 'h3' ? { url: null, error: 'gone' } : { url: `https://signed/${hash}` },
    )
    vi.stubGlobal('fetch', async (url: string) => new Response(url.slice('https://signed/'.length)))
    try {
      const result = await saveItemsInBrowser('org-1', [
        { name: 'a.pdf', contentHash: 'h1', relativePath: 'Proj/Docs/a.pdf', size: 1 },
        { name: 'b.pdf', contentHash: 'h2', relativePath: 'Proj/Docs/Sub/b.pdf', size: 1 },
        { name: 'c.pdf', contentHash: 'h3', relativePath: 'Proj/Docs/c.pdf', size: 1 },
      ])
      expect(result).toEqual({ succeeded: 2, failures: [{ name: 'c.pdf', error: 'gone' }], cancelled: false })
      expect(saveBlobAs).toHaveBeenCalledTimes(1)
      const [zipName, blob] = saveBlobAs.mock.calls[0] as [string, Blob]
      expect(zipName).toBe('Docs.zip')
      const zip = await JSZip.loadAsync(await blob.arrayBuffer())
      expect(Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort()).toEqual(['Sub/b.pdf', 'a.pdf'])
      expect(await zip.file('a.pdf')!.async('string')).toBe('h1')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('saves nothing when the download is cancelled', async () => {
    saveBlobAs.mockReset()
    getDownloadUrl.mockResolvedValue({ url: 'https://signed/x' })
    vi.stubGlobal('fetch', async () => new Response('x'))
    try {
      const result = await saveItemsInBrowser(
        'org-1',
        [
          { name: 'a.pdf', contentHash: 'h1', relativePath: 'a.pdf', size: 1 },
          { name: 'b.pdf', contentHash: 'h2', relativePath: 'b.pdf', size: 1 },
        ],
        undefined,
        () => true,
      )
      expect(result.cancelled).toBe(true)
      expect(saveBlobAs).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
