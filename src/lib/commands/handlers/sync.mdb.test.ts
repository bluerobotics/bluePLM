import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommandContext, LocalFile } from '../types'

const copyFile = vi.fn()
const hashFile = vi.fn()
const setReadonly = vi.fn()
vi.stubGlobal('window', { electronAPI: { copyFile, hashFile, setReadonly } })

const getFiles = vi.fn()
const syncFile = vi.fn()
vi.mock('../../supabase', () => ({
  getFiles: (...args: unknown[]) => getFiles(...args),
  syncFile: (...args: unknown[]) => syncFile(...args),
  upsertFileReferences: vi.fn(),
}))

const getMdbVault = vi.fn()
const importMdbFile = vi.fn()
const mdbObjectStoragePath = vi.fn()
vi.mock('@/lib/mdb', () => ({
  getMdbVault: (...args: unknown[]) => getMdbVault(...args),
  importMdbFile: (...args: unknown[]) => importMdbFile(...args),
  mdbObjectStoragePath: (...args: unknown[]) => mdbObjectStoragePath(...args),
}))
vi.mock('@/lib/backendAdapter', () => ({ isMdbBackendActive: () => true }))

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../stores/pdmStore', () => ({
  usePDMStore: { getState: () => ({ ignoreSolidworksTempFiles: false }) },
}))
vi.mock('../../fileOperationTracker', () => ({
  FileOperationTracker: {
    start: () => ({ startStep: () => 'step', endStep: () => {}, endOperation: () => {} }),
  },
}))
vi.mock('../../cache/localSyncIndex', () => ({ addToSyncIndex: vi.fn(() => Promise.resolve()) }))

const { syncCommand } = await import('./sync')

const hash = 'a'.repeat(64)

function newFile(partNumber?: string): LocalFile {
  return {
    name: 'bracket.sldprt',
    path: 'C:/BluePLM-Work/bracket.sldprt',
    relativePath: 'Parts/bracket.sldprt',
    isDirectory: false,
    extension: '.sldprt',
    size: 42,
    modifiedTime: new Date().toISOString(),
    pendingMetadata: partNumber ? { part_number: partNumber } : undefined,
  } as LocalFile
}

function context(file: LocalFile): CommandContext {
  return {
    user: { id: 'user-1' },
    organization: { id: 'org-1' },
    isOfflineMode: false,
    activeVaultId: 'vault-1',
    vaultPath: 'C:/BluePLM-Work',
    files: [file],
    serverFiles: [],
    addToast: vi.fn(),
    addProgressToast: vi.fn(),
    updateProgressToast: vi.fn(),
    removeToast: vi.fn(),
    addProcessingFoldersSync: vi.fn(),
    removeProcessingFolders: vi.fn(),
    updateFilesAndClearProcessing: vi.fn(),
    setLastOperationCompletedAt: vi.fn(),
  } as unknown as CommandContext
}

describe('syncCommand MDB first check-in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMdbVault.mockResolvedValue({
      storageProvider: 'network',
      networkRoot: '\\\\vault-host\\blueplm',
    })
    mdbObjectStoragePath.mockReturnValue(`.blueplm/objects/aa/${hash}`)
    copyFile.mockResolvedValue({ success: true })
    hashFile.mockResolvedValue({ success: true, hash, size: 42 })
    importMdbFile.mockResolvedValue({ id: 'file-1', created: true })
    getFiles.mockResolvedValue({
      files: [{ id: 'file-1', file_path: 'Parts/bracket.sldprt', content_hash: hash, version: 1 }],
      error: null,
    })
    setReadonly.mockResolvedValue({ success: true })
  })

  it('stages and verifies an immutable network-vault object before registering the file', async () => {
    const file = newFile()
    const ctx = context(file)

    const result = await syncCommand.execute({ files: [file] }, ctx)

    expect(copyFile).toHaveBeenCalledWith(
      'C:/BluePLM-Work/bracket.sldprt',
      `\\\\vault-host\\blueplm\\.blueplm\\objects\\aa\\${hash}`,
    )
    expect(importMdbFile).toHaveBeenCalledWith({
      vaultId: 'vault-1',
      canonicalPath: 'Parts/bracket.sldprt',
      storageRelativePath: `.blueplm/objects/aa/${hash}`,
      fileName: 'bracket.sldprt',
      partNumber: null,
      contentHash: hash,
      sizeBytes: 42,
    })
    expect(syncFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: true, total: 1, succeeded: 1, failed: 0 })
  })

  it('persists the resolved part number with the MDB file record', async () => {
    const file = newFile('PN-00042')

    await syncCommand.execute({ files: [file] }, context(file))

    expect(importMdbFile).toHaveBeenCalledWith(
      expect.objectContaining({ partNumber: 'PN-00042' }),
    )
  })

  it('does not register a file when the staged revision cannot be verified', async () => {
    hashFile
      .mockResolvedValueOnce({ success: true, hash, size: 42 })
      .mockResolvedValueOnce({ success: true, hash: 'b'.repeat(64), size: 42 })
    const file = newFile()

    const result = await syncCommand.execute({ files: [file] }, context(file))

    expect(importMdbFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: false, total: 1, succeeded: 0, failed: 1 })
  })
})
