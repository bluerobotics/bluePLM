import { beforeEach, describe, expect, it, vi } from 'vitest'

import { activateBackend, clearBackendProfile } from '@/lib/backend'
import type { OrgSettings } from '@/types/pdm'

const mocks = vi.hoisted(() => ({
  setCommunityDocumentManagerLicense: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/community', () => ({
  setCommunityDocumentManagerLicense: mocks.setCommunityDocumentManagerLicense,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
}))

import { persistDocumentManagerLicense } from './documentManagerLicense'

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
})

const settings = {
  require_checkout: true,
  auto_increment_part_numbers: false,
  part_number_prefix: '',
  part_number_digits: 6,
  allowed_extensions: [],
  require_description: false,
  require_approval_for_release: false,
  max_file_size_mb: 400,
} satisfies OrgSettings

describe('Document Manager license persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    clearBackendProfile()
  })

  it('uses the MDB endpoint without touching Supabase in MDB mode', async () => {
    activateBackend('community')

    const result = await persistDocumentManagerLicense({
      organizationId: 'org-1',
      currentSettings: settings,
      licenseKey: 'dm-license',
    })

    expect(mocks.setCommunityDocumentManagerLicense).toHaveBeenCalledWith('dm-license')
    expect(mocks.from).not.toHaveBeenCalled()
    expect(result.solidworks_dm_license_key).toBe('dm-license')
  })

  it('clears the MDB key without touching Supabase', async () => {
    activateBackend('community')

    const result = await persistDocumentManagerLicense({
      organizationId: 'org-1',
      currentSettings: { ...settings, solidworks_dm_license_key: 'old-license' },
      licenseKey: null,
    })

    expect(mocks.setCommunityDocumentManagerLicense).toHaveBeenCalledWith(null)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(result.solidworks_dm_license_key).toBeUndefined()
  })

  it('keeps the existing Supabase persistence path in Supabase mode', async () => {
    activateBackend('supabase')

    const fetchSingle = vi.fn().mockResolvedValue({ data: { settings }, error: null })
    const updateSingle = vi.fn().mockResolvedValue({
      data: { settings: { ...settings, solidworks_dm_license_key: 'dm-license' } },
      error: null,
    })
    mocks.from
      .mockReturnValueOnce({
        select: () => ({ eq: () => ({ single: fetchSingle }) }),
      })
      .mockReturnValueOnce({
        update: () => ({
          eq: () => ({ select: () => ({ single: updateSingle }) }),
        }),
      })

    const result = await persistDocumentManagerLicense({
      organizationId: 'org-1',
      currentSettings: settings,
      licenseKey: 'dm-license',
    })

    expect(mocks.setCommunityDocumentManagerLicense).not.toHaveBeenCalled()
    expect(mocks.from).toHaveBeenNthCalledWith(1, 'organizations')
    expect(mocks.from).toHaveBeenNthCalledWith(2, 'organizations')
    expect(result.solidworks_dm_license_key).toBe('dm-license')
  })
})
