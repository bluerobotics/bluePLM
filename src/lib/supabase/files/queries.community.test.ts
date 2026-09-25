import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCommunityFiles, getCommunityVaults } = vi.hoisted(() => ({
  getCommunityFiles: vi.fn(),
  getCommunityVaults: vi.fn(),
}))

vi.mock('../client', () => ({ getSupabaseClient: vi.fn() }))
vi.mock('@/lib/community', () => ({
  getCommunityFileReferences: vi.fn(),
  getCommunityFileRevisions: vi.fn(),
  getCommunityFiles,
  getCommunityVaults,
}))
vi.mock('@/lib/backendAdapter', () => ({
  routeBackend: <TMdb, TSupabase>(routes: { mdb: () => TMdb; supabase: () => TSupabase }) =>
    routes.mdb(),
}))

import { getFilesLightweight } from './queries'

describe('Community lightweight file loading', () => {
  beforeEach(() => {
    getCommunityVaults.mockResolvedValue([{ id: 'vault-1' }])
    getCommunityFiles.mockResolvedValue([
      {
        id: 'file-1',
        canonicalPath: 'Rollenlager/04er_Rolle_V.3mf',
        fileName: '04er_Rolle_V.3mf',
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

  it('retains the immutable Community storage path in cacheable lightweight rows', async () => {
    const result = await getFilesLightweight('organization-1', 'vault-1')

    expect(result.files?.[0]).toMatchObject({
      storage_relative_path: '.blueplm/objects/ab/abcdef',
      _communityStorageRelativePath: '.blueplm/objects/ab/abcdef',
    })
  })
})
