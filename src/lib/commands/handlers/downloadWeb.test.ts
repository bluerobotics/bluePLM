/**
 * The download command on BluePLM Web (no Electron bridge): one cloud file goes to the browser's
 * own download, several are saved as one zip. Nothing is written to a vault folder, so no folder is
 * created, nothing is made read-only, the sync index is untouched and the store rows stay `cloud`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommandContext, LocalFile } from '../types'
import type { PDMFile } from '../../../types/pdm'

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const getDownloadUrl = vi.fn()
vi.mock('../../storage', () => ({
  getDownloadUrl: (...args: unknown[]) => getDownloadUrl(...args),
}))
const saveUrlAs = vi.fn()
const saveBlobAs = vi.fn()
vi.mock('../../browserDownload', () => ({
  saveUrlAs: (...args: unknown[]) => saveUrlAs(...args),
  saveBlobAs: (...args: unknown[]) => saveBlobAs(...args),
}))
const addToSyncIndex = vi.fn()
vi.mock('../../cache/localSyncIndex', () => ({
  addToSyncIndex: () => addToSyncIndex(),
}))
vi.mock('../../../stores/pdmStore', () => ({
  usePDMStore: { getState: () => ({}) },
}))

// No bridge: the web. Storage answers each signed URL with the URL as the body.
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
vi.stubGlobal('fetch', async (url: string) => new Response(`bytes of ${url}`))

const { downloadCommand } = await import('./download')

const VAULT = '/main'

function cloudFile(relativePath: string, hash: string | null = `hash-${relativePath}`): LocalFile {
  const name = relativePath.split('/').pop()!
  return {
    name,
    path: `${VAULT}/${relativePath}`,
    relativePath,
    isDirectory: false,
    extension: '',
    size: 100,
    modifiedTime: '',
    diffStatus: 'cloud',
    isSynced: false,
    pdmData: {
      id: `row-${name}`,
      file_path: relativePath,
      file_name: name,
      content_hash: hash,
      version: 1,
    } as unknown as PDMFile,
  } as LocalFile
}

function cloudFolder(relativePath: string): LocalFile {
  return {
    name: relativePath.split('/').pop()!,
    path: `${VAULT}/${relativePath}`,
    relativePath,
    isDirectory: true,
    extension: '',
    size: 0,
    modifiedTime: '',
    diffStatus: 'cloud',
  } as LocalFile
}

function makeContext(files: LocalFile[]): CommandContext {
  return {
    user: { id: 'user-1' },
    organization: { id: 'org-1' },
    isOfflineMode: false,
    activeVaultId: 'vault-1',
    vaultPath: VAULT,
    files,
    serverFiles: [],
    addToast: vi.fn(),
    addProgressToast: vi.fn(),
    updateProgressToast: vi.fn(),
    removeToast: vi.fn(),
    isProgressToastCancelled: vi.fn(() => false),
    addProcessingFoldersSync: vi.fn(),
    addExpectedFileChanges: vi.fn(),
    updateFilesAndClearProcessing: vi.fn(),
    updateFilesInStore: vi.fn(),
    removeFilesFromStore: vi.fn(),
    onRefresh: vi.fn(),
  } as unknown as CommandContext
}

describe('downloadCommand.execute on the web', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDownloadUrl.mockImplementation(async (_org: string, hash: string) => ({
      url: `https://signed/${hash}`,
    }))
  })

  it('saves one selected file through the browser under its own name', async () => {
    const a = cloudFile('Parts/a.sldprt')
    const ctx = makeContext([a])

    const result = await downloadCommand.execute({ files: [a] }, ctx)

    expect(result).toMatchObject({ success: true, total: 1, succeeded: 1, failed: 0 })
    expect(getDownloadUrl).toHaveBeenCalledWith('org-1', 'hash-Parts/a.sldprt', 300, {
      downloadName: 'a.sldprt',
    })
    expect(saveUrlAs.mock.calls).toEqual([['https://signed/hash-Parts/a.sldprt', 'a.sldprt']])
    expect(saveBlobAs).not.toHaveBeenCalled()
  })

  it('saves the files of a selected folder as one zip named after the folder', async () => {
    const folder = cloudFolder('Parts')
    const a = cloudFile('Parts/a.sldprt')
    const b = cloudFile('Parts/b.sldprt')
    const ctx = makeContext([folder, a, b])

    const result = await downloadCommand.execute({ files: [folder] }, ctx)

    expect(result).toMatchObject({ success: true, total: 2, succeeded: 2, failed: 0 })
    expect(saveUrlAs).not.toHaveBeenCalled()
    expect(saveBlobAs).toHaveBeenCalledTimes(1)
    expect(saveBlobAs.mock.calls[0][0]).toBe('Parts.zip')
    // A progress toast while the zip builds, gone afterwards.
    expect(ctx.addProgressToast).toHaveBeenCalled()
    expect(ctx.removeToast).toHaveBeenCalled()
    // Nothing local: no store updates, no sync index, no refresh.
    expect(ctx.updateFilesAndClearProcessing).not.toHaveBeenCalled()
    expect(ctx.updateFilesInStore).not.toHaveBeenCalled()
    expect(ctx.removeFilesFromStore).not.toHaveBeenCalled()
    expect(ctx.addProcessingFoldersSync).not.toHaveBeenCalled()
    expect(ctx.onRefresh).not.toHaveBeenCalled()
    expect(addToSyncIndex).not.toHaveBeenCalled()
  })

  it('does nothing for an empty cloud folder', async () => {
    const folder = cloudFolder('Empty')
    const ctx = makeContext([folder])
    const result = await downloadCommand.execute({ files: [folder] }, ctx)
    expect(result).toMatchObject({ success: true, total: 0 })
    expect(saveUrlAs).not.toHaveBeenCalled()
    expect(ctx.onRefresh).not.toHaveBeenCalled()
  })

  it('reports a file whose URL could not be signed and keeps going', async () => {
    getDownloadUrl.mockImplementation(async (_org: string, hash: string) =>
      hash.includes('bad') ? { url: null, error: 'missing' } : { url: `https://signed/${hash}` },
    )
    const good = cloudFile('good.pdf')
    const bad = cloudFile('bad.pdf')
    const ctx = makeContext([good, bad])

    const result = await downloadCommand.execute({ files: [good, bad] }, ctx)

    expect(result).toMatchObject({ success: false, succeeded: 1, failed: 1 })
    expect(result.errors).toEqual(['bad.pdf: missing'])
    // The good file is still zipped and saved.
    expect(saveBlobAs).toHaveBeenCalledTimes(1)
  })

  it('refuses a selection over the browser limit without saving anything', async () => {
    const files = Array.from({ length: 2001 }, (_, i) => cloudFile(`f${i}.pdf`))
    const ctx = makeContext(files)
    const result = await downloadCommand.execute({ files }, ctx)
    expect(result).toMatchObject({ success: false, total: 2001, succeeded: 0 })
    expect(saveUrlAs).not.toHaveBeenCalled()
    expect(saveBlobAs).not.toHaveBeenCalled()
    expect(ctx.addToast).toHaveBeenCalledWith('error', expect.any(String))
  })
})
