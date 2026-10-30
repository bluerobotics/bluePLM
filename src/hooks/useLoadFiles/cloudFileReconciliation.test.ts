import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { reconcileCloudFiles } from './cloudFileReconciliation'
import type { CachedServerFile } from '@/lib/cache/vaultFileCache'
import type { LocalFile } from '@/stores/types'

const VAULT_PATH = 'C:/vault'

function serverFile(overrides: Partial<CachedServerFile> = {}): CachedServerFile {
  return {
    id: 'file-1',
    file_path: 'Fixed Lens Models/part.sldprt',
    file_name: 'part.sldprt',
    extension: '.sldprt',
    file_type: 'part',
    part_number: null,
    description: null,
    revision: 'A',
    version: 1,
    content_hash: 'hash-1',
    file_size: 1024,
    state: null,
    checked_out_by: null,
    checked_out_at: null,
    updated_at: '2026-01-01T00:00:00Z',
    custom_properties: null,
    checked_out_file_path: null,
    checked_out_file_name: null,
    ...overrides,
  }
}

function movedLocalFile(overrides: Partial<LocalFile> = {}): LocalFile {
  return {
    name: 'part.sldprt',
    path: 'C:/vault/athom/part.sldprt',
    relativePath: 'athom/part.sldprt',
    isDirectory: false,
    extension: '.sldprt',
    size: 1024,
    modifiedTime: '2026-01-01T00:00:00Z',
    diffStatus: 'moved',
    isSynced: true,
    ino: 42,
    ...overrides,
  }
}

const YIELD_NOOP = async () => {}

describe('reconcileCloudFiles', () => {
  it('emits exactly one moved_away stub, naming the destination, for an inode-matched rename', async () => {
    const movedFile = movedLocalFile({ pdmData: serverFile() as unknown as LocalFile['pdmData'] })
    const serverPathLower = 'fixed lens models/part.sldprt'

    const result = await reconcileCloudFiles({
      pdmFiles: [serverFile()],
      localFiles: [movedFile],
      localPathSet: new Set(['athom/part.sldprt']),
      inodeMatchedServerPaths: new Set([serverPathLower]),
      inodeMatchedServerPathToLocalPath: new Map([[serverPathLower, 'athom/part.sldprt']]),
      existingCheckedOutUsers: new Map(),
      userId: 'user-1',
      vaultPath: VAULT_PATH,
      yieldIfSlow: YIELD_NOOP,
      yieldCheckStride: 256,
    })

    const stubs = result.localFiles.filter((f) => f.diffStatus === 'moved_away')
    expect(stubs).toHaveLength(1)
    expect(stubs[0].relativePath).toBe('Fixed Lens Models/part.sldprt')
    expect(stubs[0].movedToRelativePath).toBe('athom/part.sldprt')
    expect(stubs[0].isSynced).toBe(false)
    expect(stubs[0].pdmData?.id).toBe('file-1')

    // The 'moved' row at the new location is untouched.
    const movedRows = result.localFiles.filter((f) => f.diffStatus === 'moved')
    expect(movedRows).toHaveLength(1)
    expect(movedRows[0].relativePath).toBe('athom/part.sldprt')
  })

  it('keeps the stub once the renamed file has been re-hashed at its new path', async () => {
    // A rename keeps the bytes, so once the main process hashes the file at its new path the
    // content hash matches too. The inode names the destination; the stub must stay.
    const movedFile = movedLocalFile({
      pdmData: serverFile() as unknown as LocalFile['pdmData'],
      localHash: 'hash-1',
    })
    const serverPathLower = 'fixed lens models/part.sldprt'

    const result = await reconcileCloudFiles({
      pdmFiles: [serverFile()],
      localFiles: [movedFile],
      localPathSet: new Set(['athom/part.sldprt']),
      inodeMatchedServerPaths: new Set([serverPathLower]),
      inodeMatchedServerPathToLocalPath: new Map([[serverPathLower, 'athom/part.sldprt']]),
      existingCheckedOutUsers: new Map(),
      userId: 'user-1',
      vaultPath: VAULT_PATH,
      yieldIfSlow: YIELD_NOOP,
      yieldCheckStride: 256,
    })

    const stubs = result.localFiles.filter((f) => f.diffStatus === 'moved_away')
    expect(stubs).toHaveLength(1)
    expect(stubs[0].movedToRelativePath).toBe('athom/part.sldprt')
  })

  it('a hash-only move (no inode evidence) emits one stub naming the moved file and no cloud row', async () => {
    // The merge gives a hash-matched move its server row, so the moved file carries it.
    const movedFile = movedLocalFile({
      ino: undefined,
      localHash: 'hash-1',
      pdmData: serverFile() as unknown as LocalFile['pdmData'],
    })
    const result = await reconcileCloudFiles({
      pdmFiles: [serverFile()],
      localFiles: [movedFile],
      localPathSet: new Set(['athom/part.sldprt']),
      inodeMatchedServerPaths: new Set(),
      inodeMatchedServerPathToLocalPath: new Map(),
      existingCheckedOutUsers: new Map(),
      userId: 'user-1',
      vaultPath: VAULT_PATH,
      yieldIfSlow: YIELD_NOOP,
      yieldCheckStride: 256,
    })
    const stubs = result.localFiles.filter((f) => f.diffStatus === 'moved_away')
    expect(stubs.map((f) => f.movedToRelativePath)).toEqual(['athom/part.sldprt'])
    expect(result.localFiles.filter((f) => f.diffStatus === 'cloud')).toHaveLength(0)
  })

  it('produces neither a moved row nor a moved_away stub once the paths are reconciled', async () => {
    // The local file already sits at the server's path - no move to report.
    const result = await reconcileCloudFiles({
      pdmFiles: [serverFile()],
      localFiles: [],
      localPathSet: new Set(['fixed lens models/part.sldprt']),
      inodeMatchedServerPaths: new Set(),
      inodeMatchedServerPathToLocalPath: new Map(),
      existingCheckedOutUsers: new Map(),
      userId: 'user-1',
      vaultPath: VAULT_PATH,
      yieldIfSlow: YIELD_NOOP,
      yieldCheckStride: 256,
    })

    expect(result.localFiles).toHaveLength(0)
    expect(result.cloudFolders.size).toBe(0)
  })

  it('gives a hash-only move a stub naming the file that claimed it', async () => {
    // The merge already gave the moved file its server row (a checked-out-by-me hash match).
    const hashMovedFile: LocalFile = {
      name: 'part.sldprt',
      path: 'C:/vault/new-name/part.sldprt',
      relativePath: 'new-name/part.sldprt',
      isDirectory: false,
      extension: '.sldprt',
      size: 1024,
      modifiedTime: '2026-01-01T00:00:00Z',
      localHash: 'hash-1',
      pdmData: serverFile() as unknown as LocalFile['pdmData'],
      diffStatus: 'moved',
    }

    const result = await reconcileCloudFiles({
      pdmFiles: [serverFile()],
      localFiles: [hashMovedFile],
      localPathSet: new Set(['new-name/part.sldprt']),
      inodeMatchedServerPaths: new Set(),
      inodeMatchedServerPathToLocalPath: new Map(),
      existingCheckedOutUsers: new Map(),
      userId: 'user-1',
      vaultPath: VAULT_PATH,
      yieldIfSlow: YIELD_NOOP,
      yieldCheckStride: 256,
    })

    // The hash-matched local file passes through untouched, and the old server path holds a
    // stub pointing at it, as an inode-matched move gets.
    expect(result.localFiles[0]).toEqual(hashMovedFile)
    const stub = result.localFiles.find((f) => f.relativePath === serverFile().file_path)
    expect(stub?.diffStatus).toBe('moved_away')
    expect(stub?.movedToRelativePath).toBe('new-name/part.sldprt')
    expect(result.localFiles).toHaveLength(2)
  })

  it('lists a server row as cloud when the same bytes are on disk but no local file carries it', async () => {
    // A local-only file with the same content (a copy, say) is not the server file.
    const copy: LocalFile = {
      name: 'part.sldprt',
      path: 'C:/vault/copies/part.sldprt',
      relativePath: 'copies/part.sldprt',
      isDirectory: false,
      extension: '.sldprt',
      size: 1024,
      modifiedTime: '2026-01-01T00:00:00Z',
      localHash: 'hash-1',
      diffStatus: 'added',
    }

    const result = await reconcileCloudFiles({
      pdmFiles: [serverFile()],
      localFiles: [copy],
      localPathSet: new Set(['copies/part.sldprt']),
      inodeMatchedServerPaths: new Set(),
      inodeMatchedServerPathToLocalPath: new Map(),
      existingCheckedOutUsers: new Map(),
      userId: 'user-1',
      vaultPath: VAULT_PATH,
      yieldIfSlow: YIELD_NOOP,
      yieldCheckStride: 256,
    })

    const listed = result.localFiles.find((f) => f.relativePath === serverFile().file_path)
    expect(listed?.diffStatus).toBe('cloud')
  })

  it('takes an orphan holding the bytes of a row at another path for a server-side move', async () => {
    // This machine synced the file at old/part.sldprt; another machine moved it on the server.
    const orphan: LocalFile = {
      name: 'part.sldprt',
      path: 'C:/vault/old/part.sldprt',
      relativePath: 'old/part.sldprt',
      isDirectory: false,
      extension: '.sldprt',
      size: 1024,
      modifiedTime: '2026-01-01T00:00:00Z',
      localHash: 'hash-1',
      diffStatus: 'deleted_remote',
    }

    const result = await reconcileCloudFiles({
      pdmFiles: [serverFile()],
      localFiles: [orphan],
      localPathSet: new Set(['old/part.sldprt']),
      inodeMatchedServerPaths: new Set(),
      inodeMatchedServerPathToLocalPath: new Map(),
      existingCheckedOutUsers: new Map(),
      userId: 'user-1',
      vaultPath: VAULT_PATH,
      yieldIfSlow: YIELD_NOOP,
      yieldCheckStride: 256,
    })

    const holder = result.localFiles.find((f) => f.relativePath === 'old/part.sldprt')
    const stub = result.localFiles.find((f) => f.relativePath === serverFile().file_path)
    expect(holder?.diffStatus).toBe('moved')
    expect(holder?.pdmData?.id).toBe(serverFile().id)
    expect(stub?.diffStatus).toBe('moved_away')
    expect(stub?.movedToRelativePath).toBe('old/part.sldprt')
  })

  it('does not count a moved_away stub as cloud', async () => {
    const serverPathLower = 'fixed lens models/part.sldprt'

    const result = await reconcileCloudFiles({
      pdmFiles: [serverFile()],
      localFiles: [],
      localPathSet: new Set(),
      inodeMatchedServerPaths: new Set([serverPathLower]),
      inodeMatchedServerPathToLocalPath: new Map([[serverPathLower, 'athom/part.sldprt']]),
      existingCheckedOutUsers: new Map(),
      userId: 'user-1',
      vaultPath: VAULT_PATH,
      yieldIfSlow: YIELD_NOOP,
      yieldCheckStride: 256,
    })

    expect(result.localFiles.filter((f) => f.diffStatus === 'cloud')).toHaveLength(0)
    expect(result.localFiles.filter((f) => f.diffStatus === 'moved_away')).toHaveLength(1)
  })

  it('still adds a genuine cloud-only file as "cloud" when neither move signal fires', async () => {
    const result = await reconcileCloudFiles({
      pdmFiles: [serverFile({ file_path: 'Parts/new-file.sldprt', content_hash: 'hash-2' })],
      localFiles: [],
      localPathSet: new Set(),
      inodeMatchedServerPaths: new Set(),
      inodeMatchedServerPathToLocalPath: new Map(),
      existingCheckedOutUsers: new Map(),
      userId: 'user-1',
      vaultPath: VAULT_PATH,
      yieldIfSlow: YIELD_NOOP,
      yieldCheckStride: 256,
    })

    expect(result.localFiles).toHaveLength(1)
    expect(result.localFiles[0].diffStatus).toBe('cloud')
    expect(result.cloudFolders.has('Parts')).toBe(true)
  })

  it('falls back to the pre-4.3.3 suppress-only behaviour if the reverse map is missing an entry', async () => {
    // Defensive case: inodeMatchedServerPaths says this path was claimed, but the
    // reverse map (built alongside it) somehow has no destination for it.
    const serverPathLower = 'fixed lens models/part.sldprt'

    const result = await reconcileCloudFiles({
      pdmFiles: [serverFile()],
      localFiles: [],
      localPathSet: new Set(),
      inodeMatchedServerPaths: new Set([serverPathLower]),
      inodeMatchedServerPathToLocalPath: new Map(),
      existingCheckedOutUsers: new Map(),
      userId: 'user-1',
      vaultPath: VAULT_PATH,
      yieldIfSlow: YIELD_NOOP,
      yieldCheckStride: 256,
    })

    expect(result.localFiles).toHaveLength(0)
  })
})

// Pinned by mutation testing (.cursor/plans/test-mutation-report.md): the ghost/orphan safety
// net had no test at all, and the cloud-folder and placeholder fields were only reached in passing.
function reconcile(pdmFiles: CachedServerFile[], localFiles: LocalFile[], localPaths: string[] = []) {
  return reconcileCloudFiles({
    pdmFiles,
    localFiles,
    localPathSet: new Set([...localPaths, ...localFiles.map((f) => f.relativePath)].map((p) => p.toLowerCase())),
    inodeMatchedServerPaths: new Set(),
    inodeMatchedServerPathToLocalPath: new Map(),
    existingCheckedOutUsers: new Map(),
    userId: 'user-1',
    vaultPath: VAULT_PATH,
    yieldIfSlow: YIELD_NOOP,
    yieldCheckStride: 256,
  })
}

/** A local file whose server row is gone: what a rename the inode pass missed leaves behind. */
function orphan(relativePath: string, overrides: Partial<LocalFile> = {}): LocalFile {
  return movedLocalFile({
    name: relativePath.split('/').pop() ?? relativePath,
    path: `${VAULT_PATH}/${relativePath}`,
    relativePath,
    diffStatus: 'deleted_remote',
    isSynced: false,
    ino: undefined,
    ...overrides,
  })
}

/** A server row checked out by this user with nothing on disk: the ghost of a local rename. */
function myGhost(filePath: string, overrides: Partial<CachedServerFile> = {}): CachedServerFile {
  return serverFile({
    id: `id-${filePath}`,
    file_path: filePath,
    file_name: filePath.split('/').pop() ?? filePath,
    checked_out_by: 'user-1',
    ...overrides,
  })
}

describe('reconcileCloudFiles placeholders', () => {
  it('marks a missing file I have checked out as deleted, and one another user holds as cloud', async () => {
    // The desktop: the bridge is present, so a checked-out file missing from disk was removed here.
    vi.stubGlobal('window', { electronAPI: {} })
    try {
      const result = await reconcile(
        [myGhost('A/mine.sldprt'), serverFile({ id: 'theirs', file_path: 'A/theirs.sldprt', checked_out_by: 'user-2' })],
        [],
      )

      const status = Object.fromEntries(result.localFiles.map((f) => [f.relativePath, f.diffStatus]))
      expect(status).toEqual({ 'A/mine.sldprt': 'deleted', 'A/theirs.sldprt': 'cloud' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('on the web, where nothing is on disk, shows a file I have checked out as cloud', async () => {
    const result = await reconcile(
      [myGhost('A/mine.sldprt'), serverFile({ id: 'theirs', file_path: 'A/theirs.sldprt', checked_out_by: 'user-2' })],
      [],
    )

    const status = Object.fromEntries(result.localFiles.map((f) => [f.relativePath, f.diffStatus]))
    expect(status).toEqual({ 'A/mine.sldprt': 'cloud', 'A/theirs.sldprt': 'cloud' })
  })

  it('fills a placeholder from the server row, with safe defaults for missing fields', async () => {
    const result = await reconcile(
      [
        serverFile({ file_path: 'A/full.sldprt', file_size: 2048, updated_at: '2026-02-02T00:00:00Z' }),
        serverFile({ id: 'bare', file_path: 'A/bare', extension: null as unknown as string, file_size: null as unknown as number, updated_at: null as unknown as string }),
      ],
      [],
    )

    expect(result.localFiles[0]).toMatchObject({
      extension: '.sldprt',
      size: 2048,
      modifiedTime: '2026-02-02T00:00:00Z',
      isSynced: false,
    })
    expect(result.localFiles[1]).toMatchObject({ extension: '', size: 0, modifiedTime: '' })
  })

  it('names every folder a placeholder needs that is not already on disk, matching case-insensitively', async () => {
    const result = await reconcile([serverFile({ file_path: 'Parts/Brackets/Steel/b.sldprt' })], [], ['parts'])

    expect([...result.cloudFolders].sort()).toEqual(['Parts/Brackets', 'Parts/Brackets/Steel'])
  })

  it('names no folder for a placeholder at the vault root', async () => {
    const result = await reconcile([serverFile({ file_path: 'root.sldprt' })], [])

    expect([...result.cloudFolders]).toEqual([])
  })
})

describe('reconcileCloudFiles ghost/orphan matching', () => {
  // A match is logged through window.electronAPI, which the renderer always has.
  beforeEach(() => {
    vi.stubGlobal('window', { electronAPI: { log: vi.fn() } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pairs a ghost with the one orphan in its folder and extension as a move', async () => {
    const ghost = myGhost('Parts/Old.SLDPRT')
    const renamed = orphan('Parts/New.sldprt')

    const result = await reconcile([ghost], [renamed])

    expect(result.localFiles).toHaveLength(1)
    expect(result.localFiles[0]).toMatchObject({
      relativePath: 'Parts/New.sldprt',
      diffStatus: 'moved',
      isSynced: true,
    })
    expect(result.localFiles[0].pdmData?.id).toBe('id-Parts/Old.SLDPRT')
  })

  it('matches the folder case-insensitively', async () => {
    const result = await reconcile([myGhost('PARTS/Old.sldprt')], [orphan('parts/New.sldprt')])

    expect(result.localFiles.map((f) => f.diffStatus)).toEqual(['moved'])
  })

  it('pairs nothing when two orphans could be the rename', async () => {
    const result = await reconcile(
      [myGhost('Parts/Old.sldprt')],
      [orphan('Parts/New1.sldprt'), orphan('Parts/New2.sldprt')],
    )

    const status = Object.fromEntries(result.localFiles.map((f) => [f.relativePath, f.diffStatus]))
    expect(status).toEqual({
      'Parts/New1.sldprt': 'deleted_remote',
      'Parts/New2.sldprt': 'deleted_remote',
      'Parts/Old.sldprt': 'deleted',
    })
  })

  it('gives one orphan to one ghost only', async () => {
    const result = await reconcile(
      [myGhost('Parts/Old1.sldprt'), myGhost('Parts/Old2.sldprt')],
      [orphan('Parts/New.sldprt')],
    )

    expect(result.localFiles.filter((f) => f.diffStatus === 'moved')).toHaveLength(1)
    expect(result.localFiles.filter((f) => f.diffStatus === 'deleted')).toHaveLength(1)
  })

  it.each([
    ['another folder', orphan('Other/New.sldprt')],
    ['another extension', orphan('Parts/New.sldasm', { extension: '.sldasm' })],
    ['a folder', orphan('Parts/New.sldprt', { isDirectory: true })],
  ])('does not pair a ghost with an orphan in %s', async (_label, candidate) => {
    const result = await reconcile([myGhost('Parts/Old.sldprt')], [candidate])

    expect(result.localFiles.find((f) => f.relativePath === 'Parts/Old.sldprt')?.diffStatus).toBe('deleted')
    expect(result.localFiles.find((f) => f.diffStatus === 'moved')).toBeUndefined()
  })

  it('does not treat a cloud file another user holds as a ghost', async () => {
    const result = await reconcile(
      [serverFile({ id: 'theirs', file_path: 'Parts/Old.sldprt', checked_out_by: 'user-2' })],
      [orphan('Parts/New.sldprt')],
    )

    expect(result.localFiles.map((f) => f.diffStatus).sort()).toEqual(['cloud', 'deleted_remote'])
  })
})
