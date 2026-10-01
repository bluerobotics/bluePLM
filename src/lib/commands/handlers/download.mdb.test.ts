import { describe, expect, it } from 'vitest'
import { resolveMdbStorageRelativePath } from './download'

describe('MDB downloads', () => {
  it('uses the persisted database storage path when an older local cache has no MDB alias', () => {
    expect(resolveMdbStorageRelativePath({
      storage_relative_path: '.blueplm/objects/ab/abcdef',
    })).toBe('.blueplm/objects/ab/abcdef')
  })

  it('reads the pre-rename MDB storage-path alias from an existing local cache', () => {
    expect(resolveMdbStorageRelativePath({
      _communityStorageRelativePath: '.blueplm/objects/ef/legacy',
    })).toBe('.blueplm/objects/ef/legacy')
  })

  it('repairs legacy metadata from its immutable SHA-256 content address', () => {
    const hash = 'cd'.repeat(32)

    expect(resolveMdbStorageRelativePath({ content_hash: hash }))
      .toBe(`.blueplm/objects/cd/${hash}`)
  })
})
