import { describe, expect, it } from 'vitest'
import { resolveCommunityStorageRelativePath } from './download'

describe('Community downloads', () => {
  it('uses the persisted database storage path when an older local cache has no Community alias', () => {
    expect(resolveCommunityStorageRelativePath({
      storage_relative_path: '.blueplm/objects/ab/abcdef',
    })).toBe('.blueplm/objects/ab/abcdef')
  })

  it('repairs legacy metadata from its immutable SHA-256 content address', () => {
    const hash = 'cd'.repeat(32)

    expect(resolveCommunityStorageRelativePath({ content_hash: hash }))
      .toBe(`.blueplm/objects/cd/${hash}`)
  })
})
