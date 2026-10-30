/**
 * Incident: a user downloaded a server-only folder.
 * `removeFilesFromStore` prefix-pruned the folder AND its 33 files AND their
 * `serverFiles` rows, so the incremental download updates matched nothing
 * (`matchCount: 0`). The folder vanished; a later folder-scoped Refresh
 * rematerialized the files from disk as local-only.
 *
 * These tests pin the fix: download must never call `removeFilesFromStore` for
 * a path that still exists on disk, and must clear cloud status on the folder
 * (and nested cloud dirs) in the same incremental update as the files.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommandContext, LocalFile } from '../types'
import type { PDMFile } from '../../../types/pdm'
import { cloudFoldersResolvedByDownload, downloadsWhoseRowWasDeleted } from './download'

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const createFolder = vi.fn(() => Promise.resolve({ success: true }))
const downloadUrl = vi.fn()
const setReadonlyBatch = vi.fn(() => Promise.resolve({ success: true, results: [] }))

vi.stubGlobal('window', {
  electronAPI: { createFolder, downloadUrl, setReadonlyBatch },
})

const getDownloadUrl = vi.fn(() => Promise.resolve({ url: 'https://example.com/file' }))
vi.mock('../../storage', () => ({
  getDownloadUrl: () => getDownloadUrl(),
}))

const addToSyncIndex = vi.fn(() => Promise.resolve())
vi.mock('../../cache/localSyncIndex', () => ({
  addToSyncIndex: () => addToSyncIndex(),
}))

vi.mock('../../../stores/pdmStore', () => ({
  usePDMStore: { getState: () => ({}) },
}))

vi.mock('../../fileOperationTracker', () => ({
  FileOperationTracker: {
    start: () => ({
      startStep: () => 'step-1',
      endStep: () => {},
      endOperation: () => {},
    }),
  },
}))

const { downloadCommand } = await import('./download')

const VAULT = 'C:/vault'

function folder(relativePath: string, options: { cloud?: boolean } = {}): LocalFile {
  const name = relativePath.split('/').pop()!
  return {
    name,
    path: `${VAULT}/${relativePath}`,
    relativePath,
    isDirectory: true,
    extension: '',
    size: 0,
    modifiedTime: '',
    diffStatus: options.cloud === false ? undefined : 'cloud',
    isSynced: options.cloud === false,
  } as LocalFile
}

function cloudFile(relativePath: string, options: { version?: number } = {}): LocalFile {
  const name = relativePath.split('/').pop()!
  const extension = name.includes('.') ? `.${name.split('.').pop()}` : ''
  return {
    name,
    path: `${VAULT}/${relativePath}`,
    relativePath,
    isDirectory: false,
    extension,
    size: 100,
    modifiedTime: '',
    diffStatus: 'cloud',
    isSynced: false,
    pdmData: {
      id: `row-${name}`,
      file_path: relativePath,
      file_name: name,
      content_hash: `hash-${name}`,
      version: options.version ?? 3,
      checked_out_by: null,
      checked_out_user: null,
    } as unknown as PDMFile,
  } as LocalFile
}

function makeContext(files: LocalFile[], overrides: Partial<CommandContext> = {}): CommandContext {
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
    clearExpectedFileChanges: vi.fn(),
    updateFilesAndClearProcessing: vi.fn(),
    updateFilesInStore: vi.fn(),
    removeFilesFromStore: vi.fn(),
    setLastOperationCompletedAt: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  } as unknown as CommandContext
}

function updatesFrom(
  ctx: CommandContext,
): Array<{ path: string; updates: Partial<LocalFile> }> {
  const [updates] = (ctx.updateFilesAndClearProcessing as ReturnType<typeof vi.fn>).mock
    .calls[0] as [Array<{ path: string; updates: Partial<LocalFile> }>]
  return updates
}

describe('cloudFoldersResolvedByDownload', () => {
  it('includes the selected cloud folder and nested cloud ancestors of downloaded files', () => {
    const parent = folder('Burn Wire Release')
    const nested = folder('Burn Wire Release/STEP Files')
    const sibling = folder('Other Cloud')
    const localDir = folder('Burn Wire Release/already-local', { cloud: false })

    const resolved = cloudFoldersResolvedByDownload(
      [parent, nested, sibling, localDir],
      [parent],
      ['Burn Wire Release/STEP Files/part.STEP'],
    )

    expect(resolved.map((f) => f.relativePath)).toEqual([
      'Burn Wire Release',
      'Burn Wire Release/STEP Files',
    ])
  })

  it('is case-insensitive and treats backslashes as slashes', () => {
    const parent = folder('Burn Wire Release')
    const nested = {
      ...folder('Burn Wire Release/STEP Files'),
      relativePath: 'Burn Wire Release\\STEP Files',
    }

    const resolved = cloudFoldersResolvedByDownload(
      [parent, nested],
      [parent],
      ['burn wire release/step files/part.STEP'],
    )

    expect(resolved).toHaveLength(2)
  })

  it('returns nothing when nothing was downloaded and no cloud folder was selected', () => {
    expect(cloudFoldersResolvedByDownload([folder('Empty')], [], [])).toEqual([])
  })
})

describe('downloadCommand.execute - cloud folder stays in the store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createFolder.mockResolvedValue({ success: true })
    downloadUrl.mockResolvedValue({ success: true, size: 100, hash: 'hash-downloaded' })
    setReadonlyBatch.mockResolvedValue({ success: true, results: [] })
    getDownloadUrl.mockResolvedValue({ url: 'https://example.com/file' })
  })

  it('clears cloud status on the folder and a nested cloud dir without removing either', async () => {
    const parent = folder('Burn Wire Release')
    const nested = folder('Burn Wire Release/STEP Files')
    const file = cloudFile('Burn Wire Release/nut.sldprt')
    const nestedFile = cloudFile('Burn Wire Release/STEP Files/nut.STEP')
    const ctx = makeContext([parent, nested, file, nestedFile])

    const result = await downloadCommand.execute({ files: [parent] }, ctx)

    expect(result.success).toBe(true)
    expect(result.succeeded).toBe(2)
    expect(ctx.removeFilesFromStore).not.toHaveBeenCalled()

    const updates = updatesFrom(ctx)
    const byPath = new Map(updates.map((u) => [u.path, u.updates]))

    expect(byPath.get(file.path)).toEqual({
      localHash: 'hash-downloaded',
      localVersion: 3,
      diffStatus: undefined,
      isSynced: true,
    })
    expect(byPath.get(nestedFile.path)).toEqual({
      localHash: 'hash-downloaded',
      localVersion: 3,
      diffStatus: undefined,
      isSynced: true,
    })
    expect(byPath.get(parent.path)).toEqual({ diffStatus: undefined, isSynced: true })
    expect(byPath.get(nested.path)).toEqual({ diffStatus: undefined, isSynced: true })
  })

  it('clears the folder even when some files in it fail', async () => {
    const parent = folder('Burn Wire Release')
    const ok = cloudFile('Burn Wire Release/ok.sldprt')
    const fail = cloudFile('Burn Wire Release/fail.sldprt')
    downloadUrl.mockImplementation((...args: unknown[]) => {
      if (String(args[1] ?? '').includes('fail.sldprt')) {
        return Promise.resolve({ success: false, error: 'hash mismatch', size: 0, hash: '' })
      }
      return Promise.resolve({ success: true, size: 100, hash: 'hash-downloaded' })
    })
    const ctx = makeContext([parent, ok, fail])

    const result = await downloadCommand.execute({ files: [parent] }, ctx)

    expect(result.success).toBe(false)
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(1)
    expect(ctx.removeFilesFromStore).not.toHaveBeenCalled()

    const updates = updatesFrom(ctx)
    expect(updates.some((u) => u.path === parent.path)).toBe(true)
    expect(updates.some((u) => u.path === ok.path)).toBe(true)
    expect(updates.some((u) => u.path === fail.path)).toBe(false)
  })

  it('updates an empty cloud folder in place instead of removing it', async () => {
    const empty = folder('Empty Cloud')
    const ctx = makeContext([empty])

    const result = await downloadCommand.execute({ files: [empty] }, ctx)

    expect(result.success).toBe(true)
    expect(result.succeeded).toBe(1)
    expect(ctx.removeFilesFromStore).not.toHaveBeenCalled()
    expect(ctx.updateFilesInStore).toHaveBeenCalledWith([
      { path: empty.path, updates: { diffStatus: undefined, isSynced: true } },
    ])
    expect(ctx.onRefresh).toHaveBeenCalledWith(false)
  })

  it('skips hashless cloud files with one summary toast instead of per-file failures', async () => {
    const parent = folder('0 - SHARED')
    const ok = cloudFile('0 - SHARED/ok.sldprt')
    const ghost = {
      ...cloudFile('0 - SHARED/ghost.sldprt'),
      pdmData: undefined,
    }
    const ctx = makeContext([parent, ok, ghost])

    const result = await downloadCommand.execute({ files: [parent] }, ctx)

    expect(result.success).toBe(true)
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(0)
    expect(ctx.addToast).toHaveBeenCalledWith(
      'warning',
      '1 file had no downloadable hash',
    )
    expect(ctx.addExpectedFileChanges).toHaveBeenCalledWith(
      expect.arrayContaining(['0 - SHARED', ok.relativePath]),
    )
  })

  it('registers parent folders in expected changes, not just the downloaded files', async () => {
    const parent = folder('Burn Wire Release')
    const file = cloudFile('Burn Wire Release/nut.sldprt')
    const ctx = makeContext([parent, file])

    await downloadCommand.execute({ files: [parent] }, ctx)

    expect(ctx.addExpectedFileChanges).toHaveBeenCalledWith(
      expect.arrayContaining(['Burn Wire Release', file.relativePath]),
    )
  })
})

/**
 * 4.7.6 release review: a vault switch (or a reopen) that empties or replaces the
 * store while a download is in flight made every just-downloaded file look
 * deleted, so all of them went to the Recycle Bin. Only a row gone from the same
 * vault's loaded store counts.
 */
describe('downloadsWhoseRowWasDeleted', () => {
  const a = cloudFile('A/a.sldprt')
  const b = cloudFile('A/b.sldprt')
  const updates = [{ path: a.path }, { path: b.path }]
  const deleted = (
    live: LocalFile[] | null,
    startVault: string,
    liveVault: string,
    loaded = true,
  ) => downloadsWhoseRowWasDeleted(updates, [a, b], live, loaded, startVault, liveVault)

  it('recycles a file whose row left the same vault store', () => {
    expect(deleted([a], 'v1', 'v1')).toEqual([{ path: b.path }])
  })

  it('recycles nothing while the store is reset and not yet reloaded', () => {
    expect(deleted([], 'v1', 'v1', false)).toEqual([])
    expect(deleted(null, 'v1', 'v1')).toEqual([])
  })

  it('recycles when the loaded store is empty because the last file was deleted', () => {
    expect(deleted([], 'v1', 'v1')).toEqual(updates)
  })

  it('recycles nothing after a vault switch', () => {
    const other = cloudFile('Other/x.sldprt')
    expect(deleted([other], 'v1', 'v2')).toEqual([])
  })

  it('keeps a file that moved during the download (same id, new path)', () => {
    const moved = { ...b, path: `${VAULT}/B/b.sldprt`, relativePath: 'B/b.sldprt' }
    expect(deleted([a, moved], 'v1', 'v1')).toEqual([])
  })
})
