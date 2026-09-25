import { describe, expect, it } from 'vitest'

import { communityObjectStoragePath } from './community'

describe('communityObjectStoragePath', () => {
  it('uses a content-addressed immutable object path', () => {
    const hash = 'AB'.repeat(32)

    expect(communityObjectStoragePath(hash)).toBe(`.blueplm/objects/ab/${hash.toLowerCase()}`)
  })

  it('rejects values that are not SHA-256 hashes', () => {
    expect(() => communityObjectStoragePath('../not-a-hash')).toThrow('SHA-256')
  })
})
