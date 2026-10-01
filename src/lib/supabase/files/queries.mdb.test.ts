import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMdbFileReferences, getMdbFiles, getMdbVaults, getSupabaseClient } = vi.hoisted(() => ({
  getMdbFileReferences: vi.fn(),
  getMdbFiles: vi.fn(),
  getMdbVaults: vi.fn(),
  getSupabaseClient: vi.fn(),
}))

vi.mock('../client', () => ({ getSupabaseClient }))
vi.mock('@/lib/mdb', () => ({
  getMdbFileReferences,
  getMdbFileRevisions: vi.fn(),
  getMdbFiles,
  getMdbVaults,
}))
vi.mock('@/lib/backendAdapter', () => ({
  routeBackend: <TMdb, TSupabase>(routes: { mdb: () => TMdb; supabase: () => TSupabase }) =>
    routes.mdb(),
}))

import {
  getFileReferenceDiagnostics,
  getFilesLightweight,
  getVaultFilesForDiagnostics,
} from './queries'

describe('MDB lightweight file loading', () => {
  beforeEach(() => {
    getMdbVaults.mockResolvedValue([{ id: 'vault-1' }])
    getMdbFileReferences.mockResolvedValue([])
    getMdbFiles.mockResolvedValue([
      {
        id: 'file-1',
        canonicalPath: 'Rollenlager/04er_Rolle_V.3mf',
        fileName: '04er_Rolle_V.3mf',
        partNumber: 'PN-00042',
        storageRelativePath: '.blueplm/objects/ab/abcdef',
        currentRevision: 1,
        state: 'released',
        contentHash: 'a'.repeat(64),
        sizeBytes: 42,
        createdAt: '2026-09-20T00:00:00Z',
        updatedAt: '2026-09-20T00:00:00Z',
        checkedOutByUserId: null,
        checkedOutBy: null,
        checkoutExpiresAt: null,
      },
    ])
  })

  it('retains the immutable MDB storage path in cacheable lightweight rows', async () => {
    const result = await getFilesLightweight('organization-1', 'vault-1')

    expect(result.files?.[0]).toMatchObject({
      storage_relative_path: '.blueplm/objects/ab/abcdef',
      _mdbStorageRelativePath: '.blueplm/objects/ab/abcdef',
      part_number: 'PN-00042',
    })
  })

  it('loads reference diagnostics through the MDB backend', async () => {
    getMdbFileReferences.mockResolvedValue([
      {
        id: 'reference-1',
        parent_file_id: 'assembly-1',
        child_file_id: 'part-1',
        reference_type: 'component',
        quantity: 2,
        configuration: 'Default',
        child: {
          id: 'part-1',
          file_name: 'part.sldprt',
          file_path: 'part.sldprt',
          part_number: 'PN-1',
        },
      },
    ])

    const result = await getFileReferenceDiagnostics('assembly-1')

    expect(result.error).toBeNull()
    expect(result.references).toMatchObject([
      {
        id: 'reference-1',
        parent_file_id: 'assembly-1',
        child_file_id: 'part-1',
        quantity: 2,
        child: { file_name: 'part.sldprt' },
      },
    ])
    expect(getMdbFileReferences).toHaveBeenCalledWith('assembly-1', 'contains')
    expect(getSupabaseClient).not.toHaveBeenCalled()
  })

  it('loads vault path candidates through the MDB backend', async () => {
    const result = await getVaultFilesForDiagnostics('organization-1', 'vault-1')

    expect(result.error).toBeNull()
    expect(result.files).toMatchObject([
      {
        id: 'file-1',
        file_name: '04er_Rolle_V.3mf',
        file_path: 'Rollenlager/04er_Rolle_V.3mf',
        extension: '.3mf',
      },
    ])
  })
})
