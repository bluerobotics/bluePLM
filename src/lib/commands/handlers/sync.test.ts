/**
 * Incident: barxt600 (`.cursor/plans/barxt-move-download-incident-report.md`). First
 * Check-In (`syncFile`) has no move awareness - it looks up an existing row only by the
 * exact path it is given, so uploading a file that was actually moved (rather than
 * created) inserts a brand-new server row and leaves the file at its old path
 * completely untouched. That is the root mechanism behind the report's "still there at
 * the original location" and "MORE files only on server" observations.
 *
 * These tests cover:
 * 1. `findLikelyMovedFiles` (pure): the name+size heuristic that flags a file about to
 *    be uploaded as looking like a move rather than new content - deliberately never a
 *    content hash (`.cursor/plans/orphaned-file-rows-report.md`).
 * 2. `syncCommand.execute`'s use of that heuristic: it must ask before uploading a
 *    likely-moved file, must honor a decline by excluding it from the upload (while
 *    still uploading the rest), and must proceed normally when nothing looks moved.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommandContext, LocalFile } from '../types'
import type { PDMFile } from '../../../types/pdm'
import { findLikelyMovedFiles } from './sync'

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const hashFile = vi.fn(() => Promise.resolve({ success: true, hash: 'hash-1', size: 100 }))
const setReadonly = vi.fn(() => Promise.resolve({ success: true }))
vi.stubGlobal('window', { electronAPI: { hashFile, setReadonly } })

const syncFile = vi.fn((..._args: unknown[]) =>
  Promise.resolve({
    error: null,
    file: { id: 'row-new', version: 1 },
  }),
)
vi.mock('../../supabase', () => ({
  syncFile: (...args: unknown[]) => syncFile(...args),
  upsertFileReferences: vi.fn(),
}))

let storeState: { ignoreSolidworksTempFiles: boolean }
vi.mock('../../../stores/pdmStore', () => ({
  usePDMStore: { getState: () => storeState },
}))

// FileOperationTracker's DevTools bookkeeping is orthogonal to what these tests cover
// and otherwise requires a much larger pdmStore mock (addOperation/updateOperation/etc).
vi.mock('../../fileOperationTracker', () => ({
  FileOperationTracker: {
    start: () => ({
      startStep: () => 'step-1',
      endStep: () => {},
      endOperation: () => {},
    }),
  },
}))

const { syncCommand } = await import('./sync')

/** A local file that has never been synced (no pdmData), the "new" upload candidate. */
function unsynced(relativePath: string, options: { size?: number } = {}): LocalFile {
  const name = relativePath.split('/').pop()!
  return {
    name,
    path: `C:/vault/${relativePath}`,
    relativePath,
    isDirectory: false,
    extension: `.${name.split('.').pop()}`,
    size: options.size ?? 100,
    modifiedTime: new Date().toISOString(),
  } as LocalFile
}

/** A file the vault already knows about, at `relativePath`, with a server row. */
function synced(relativePath: string, options: { size?: number } = {}): LocalFile {
  const name = relativePath.split('/').pop()!
  return {
    ...unsynced(relativePath, options),
    pdmData: {
      id: `row-${name}`,
      file_path: relativePath,
      file_name: name,
      content_hash: 'hash-existing',
      checked_out_by: null,
      checked_out_user: null,
    } as unknown as PDMFile,
  } as LocalFile
}

describe('findLikelyMovedFiles', () => {
  it('flags a file whose name and size match a synced file at a different path', () => {
    const moved = unsynced('New/gizmo.sldprt', { size: 500 })
    const allFiles = [moved, synced('Old/gizmo.sldprt', { size: 500 })]

    const result = findLikelyMovedFiles([moved], allFiles)

    expect(result).toEqual([{ file: moved, existingServerPath: 'Old/gizmo.sldprt' }])
  })

  it('does not flag a file with no name+size match anywhere', () => {
    const brandNew = unsynced('New/widget.sldprt', { size: 500 })
    const allFiles = [brandNew, synced('Old/gizmo.sldprt', { size: 500 })]

    expect(findLikelyMovedFiles([brandNew], allFiles)).toEqual([])
  })

  it('does not flag a same-named file of a different size (genuinely new content)', () => {
    const revised = unsynced('New/gizmo.sldprt', { size: 999 })
    const allFiles = [revised, synced('Old/gizmo.sldprt', { size: 500 })]

    expect(findLikelyMovedFiles([revised], allFiles)).toEqual([])
  })

  it('does not flag a match against a bare stub with no pdmData', () => {
    const moved = unsynced('New/gizmo.sldprt', { size: 500 })
    const stub = { ...unsynced('Old/gizmo.sldprt', { size: 500 }) } as LocalFile
    // no pdmData - not a server-known row, so it cannot be "the same file elsewhere"
    expect(findLikelyMovedFiles([moved], [moved, stub])).toEqual([])
  })

  it('ignores directories when scanning for a match', () => {
    const moved = unsynced('New/gizmo.sldprt', { size: 500 })
    const folderMatch = {
      ...synced('Old/gizmo.sldprt', { size: 500 }),
      isDirectory: true,
    } as LocalFile

    expect(findLikelyMovedFiles([moved], [moved, folderMatch])).toEqual([])
  })

  it('does not flag two files being uploaded in the same batch against each other', () => {
    // Two brand-new files that happen to share a name and size (e.g. a template
    // copied into two folders) - neither has a server row yet, so this is not the
    // "already exists elsewhere on the server" signature this heuristic looks for.
    const a = unsynced('New/gizmo.sldprt', { size: 500 })
    const b = unsynced('New2/gizmo.sldprt', { size: 500 })

    expect(findLikelyMovedFiles([a, b], [a, b])).toEqual([])
  })

  it('is case-insensitive on both name and path comparisons', () => {
    const moved = unsynced('New/GIZMO.SLDPRT', { size: 500 })
    const allFiles = [moved, synced('old/gizmo.sldprt', { size: 500 })]

    expect(findLikelyMovedFiles([moved], allFiles)).toHaveLength(1)
  })
})

function makeContext(files: LocalFile[], overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    user: { id: 'user-1' },
    organization: { id: 'org-1' },
    isOfflineMode: false,
    activeVaultId: 'vault-1',
    vaultPath: 'C:/vault',
    files,
    serverFiles: [],
    confirm: vi.fn(() => Promise.resolve(true)),
    addToast: vi.fn(),
    addProgressToast: vi.fn(),
    updateProgressToast: vi.fn(),
    removeToast: vi.fn(),
    addProcessingFoldersSync: vi.fn(),
    removeProcessingFolders: vi.fn(),
    updateFilesAndClearProcessing: vi.fn(),
    setLastOperationCompletedAt: vi.fn(),
    ...overrides,
  } as unknown as CommandContext
}

describe('syncCommand.execute - likely-moved warning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hashFile.mockResolvedValue({ success: true, hash: 'hash-1', size: 100 })
    syncFile.mockResolvedValue({ error: null, file: { id: 'row-new', version: 1 } })
    storeState = { ignoreSolidworksTempFiles: false }
  })

  it('asks for confirmation and still uploads when the user confirms', async () => {
    const moved = unsynced('New/gizmo.sldprt', { size: 500 })
    const existing = synced('Old/gizmo.sldprt', { size: 500 })
    const ctx = makeContext([moved, existing], { confirm: vi.fn(() => Promise.resolve(true)) })

    const result = await syncCommand.execute({ files: [moved] }, ctx)

    expect(ctx.confirm).toHaveBeenCalledTimes(1)
    expect(syncFile).toHaveBeenCalledTimes(1)
    expect(result.succeeded).toBe(1)
  })

  it('excludes the file from upload when the user declines, without touching unrelated files', async () => {
    const moved = unsynced('New/gizmo.sldprt', { size: 500 })
    const brandNew = unsynced('New/widget.sldprt', { size: 900 })
    const existing = synced('Old/gizmo.sldprt', { size: 500 })
    const ctx = makeContext([moved, brandNew, existing], {
      confirm: vi.fn(() => Promise.resolve(false)),
    })

    const result = await syncCommand.execute({ files: [moved, brandNew] }, ctx)

    expect(ctx.confirm).toHaveBeenCalledTimes(1)
    expect(syncFile).toHaveBeenCalledTimes(1)
    expect(syncFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'New/widget.sldprt',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined,
      expect.anything(),
      undefined,
      'C:/vault/New/widget.sldprt',
    )
    expect(result.succeeded).toBe(1)
    expect(result.total).toBe(1)
    expect(ctx.addToast).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('looked like a move'),
    )
  })

  it('never prompts when nothing being uploaded looks like a move', async () => {
    const brandNew = unsynced('New/widget.sldprt', { size: 900 })
    const ctx = makeContext([brandNew])

    const result = await syncCommand.execute({ files: [brandNew] }, ctx)

    expect(ctx.confirm).not.toHaveBeenCalled()
    expect(syncFile).toHaveBeenCalledTimes(1)
    expect(result.succeeded).toBe(1)
  })

  it('uploads without prompting when no confirm dialog is available, but logs a warning', async () => {
    const moved = unsynced('New/gizmo.sldprt', { size: 500 })
    const existing = synced('Old/gizmo.sldprt', { size: 500 })
    const ctx = makeContext([moved, existing], { confirm: undefined })

    const result = await syncCommand.execute({ files: [moved] }, ctx)

    expect(syncFile).toHaveBeenCalledTimes(1)
    expect(result.succeeded).toBe(1)
  })
})
