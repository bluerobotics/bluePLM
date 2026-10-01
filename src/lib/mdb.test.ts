import { describe, expect, it } from 'vitest'

import { mdbObjectStoragePath, normalizeMdbOrgVaultAccess } from './mdb'

describe('mdbObjectStoragePath', () => {
  it('uses a content-addressed immutable object path', () => {
    const hash = 'AB'.repeat(32)

    expect(mdbObjectStoragePath(hash)).toBe(`.blueplm/objects/ab/${hash.toLowerCase()}`)
  })

  it('rejects values that are not SHA-256 hashes', () => {
    expect(() => mdbObjectStoragePath('../not-a-hash')).toThrow('SHA-256')
  })
})

describe('normalizeMdbOrgVaultAccess', () => {
  it('converts the legacy user-to-vault response into the client vault-to-user contract', () => {
    expect(
      normalizeMdbOrgVaultAccess(
        {
          'user-1': ['vault-a', 'vault-b'],
          'user-2': ['vault-b'],
        },
        ['vault-a', 'vault-b'],
      ),
    ).toEqual({
      'vault-a': ['user-1'],
      'vault-b': ['user-1', 'user-2'],
    })
  })

  it('keeps a corrected vault-to-user response unchanged', () => {
    const accessMap = {
      'vault-a': ['user-1'],
      'vault-b': ['user-1', 'user-2'],
    }

    expect(normalizeMdbOrgVaultAccess(accessMap, ['vault-a', 'vault-b'])).toEqual(accessMap)
  })
})
