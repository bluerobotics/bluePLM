import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDownloadUrl = vi.fn()
vi.mock('./storage', () => ({
  getDownloadUrl: (...args: unknown[]) => getDownloadUrl(...args),
}))
const saveUrlAs = vi.fn()
vi.mock('./browserDownload', () => ({
  saveUrlAs: (...args: unknown[]) => saveUrlAs(...args),
}))

const {
  planWebDownload,
  saveItemsInBrowser,
  saveStoredFileInBrowser,
  WEB_DOWNLOAD_MAX_FILES,
  WEB_DOWNLOAD_URL_TTL_SECONDS,
} = await import('./webDownload')

function row(relativePath: string, hash: string | null = `hash-${relativePath}`) {
  return {
    name: relativePath.split('/').pop()!,
    relativePath,
    isDirectory: false,
    pdmData: { content_hash: hash },
  }
}

describe('planWebDownload', () => {
  it('downloads each file under its own name and hash', () => {
    const plan = planWebDownload([row('Parts/a.sldprt'), row('b.pdf')])
    expect(plan).toEqual({
      kind: 'download',
      skippedNoHash: 0,
      items: [
        { name: 'a.sldprt', contentHash: 'hash-Parts/a.sldprt', relativePath: 'Parts/a.sldprt' },
        { name: 'b.pdf', contentHash: 'hash-b.pdf', relativePath: 'b.pdf' },
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

  it('saves every item and lists the failures by name', async () => {
    vi.useFakeTimers()
    getDownloadUrl
      .mockResolvedValueOnce({ url: 'https://signed/1' })
      .mockResolvedValueOnce({ url: null, error: 'gone' })
    const run = saveItemsInBrowser('org-1', [
      { name: 'a.pdf', contentHash: 'h1', relativePath: 'a.pdf' },
      { name: 'b.pdf', contentHash: 'h2', relativePath: 'b.pdf' },
    ])
    await vi.runAllTimersAsync()
    expect(await run).toEqual({ succeeded: 1, failures: [{ name: 'b.pdf', error: 'gone' }] })
    vi.useRealTimers()
  })
})
