import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkinMdbFile = vi.fn()

vi.mock('@/lib/backendAdapter', () => ({
  routeBackend: (routes: { mdb: () => unknown }) => routes.mdb(),
}))

vi.mock('@/lib/mdb', () => ({
  cancelMdbCheckout: vi.fn(),
  checkoutMdbFile: vi.fn(),
  checkinMdbFile,
}))

vi.mock('../client', () => ({
  getSupabaseClient: vi.fn(() => {
    throw new Error('The Supabase client must stay inactive for an MDB check-in.')
  }),
}))

vi.mock('../auth', () => ({ getCurrentUserEmail: vi.fn() }))

const { checkinFile } = await import('./checkout')

describe('checkinFile with the MDB backend', () => {
  beforeEach(() => {
    checkinMdbFile.mockReset()
    checkinMdbFile.mockResolvedValue({ revision: 2 })
  })

  it('persists a changed part number with the new network-vault revision', async () => {
    const result = await checkinFile('file-1', 'user-1', {
      mdbStorageRelativePath: 'revisions/file-1/2.sldprt',
      newContentHash: 'a'.repeat(64),
      newFileSize: 42,
      comment: 'Revision with metadata',
      pendingMetadata: { part_number: 'PN-00043' },
    })

    expect(checkinMdbFile).toHaveBeenCalledWith('file-1', {
      storageRelativePath: 'revisions/file-1/2.sldprt',
      contentHash: 'a'.repeat(64),
      sizeBytes: 42,
      comment: 'Revision with metadata',
      partNumber: 'PN-00043',
    })
    expect(result).toMatchObject({
      success: true,
      metadataChanged: true,
      file: { part_number: 'PN-00043', version: 2 },
    })
  })

  it('omits untouched metadata instead of clearing the existing part number', async () => {
    await checkinFile('file-1', 'user-1', {
      mdbStorageRelativePath: 'revisions/file-1/2.sldprt',
    })

    expect(checkinMdbFile).toHaveBeenCalledWith('file-1', {
      storageRelativePath: 'revisions/file-1/2.sldprt',
      contentHash: undefined,
      sizeBytes: undefined,
      comment: undefined,
      partNumber: undefined,
    })
  })
})
