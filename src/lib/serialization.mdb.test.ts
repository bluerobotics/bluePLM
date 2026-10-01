import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mdbSerialNumberExists, getMdbSerialInventory, getOrganizationSetting } =
  vi.hoisted(() => ({
    mdbSerialNumberExists: vi.fn(),
    getMdbSerialInventory: vi.fn(),
    getOrganizationSetting: vi.fn(),
  }))

vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./mdb', () => ({
  allocateMdbSerialNumber: vi.fn(),
  previewMdbSerialNumber: vi.fn(),
  mdbSerialNumberExists,
  getMdbSerialInventory,
}))
vi.mock('./organizationSettings', () => ({
  getOrganizationSetting,
  setOrganizationSetting: vi.fn(),
}))

import { activateBackend, clearBackendProfile } from './backend'
import { detectHighestSerialNumber, serialNumberExists } from './serialization'

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
})

describe('MDB serialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    clearBackendProfile()
    activateBackend('mdb')
    getOrganizationSetting.mockResolvedValue({
      enabled: true,
      prefix: 'PN-',
      suffix: '',
      letter_prefix: '',
      padding_digits: 5,
    })
  })

  it('checks uniqueness through MDB without initializing Supabase', async () => {
    mdbSerialNumberExists.mockResolvedValue(true)

    await expect(serialNumberExists('org-1', 'PN-00042')).resolves.toBe(true)
    expect(mdbSerialNumberExists).toHaveBeenCalledWith('PN-00042')
  })

  it('finds the highest persisted MDB part number', async () => {
    getMdbSerialInventory.mockResolvedValue([
      { partNumber: 'PN-00007', filePath: 'parts/a.sldprt' },
      { partNumber: 'PN-00042', filePath: 'parts/b.sldprt' },
      { partNumber: 'OTHER', filePath: 'parts/c.sldprt' },
    ])

    await expect(detectHighestSerialNumber('org-1')).resolves.toEqual({
      highestCounter: 42,
      highestPartNumber: 'PN-00042',
      totalScanned: 3,
      skippedHidden: 0,
    })
  })
})
