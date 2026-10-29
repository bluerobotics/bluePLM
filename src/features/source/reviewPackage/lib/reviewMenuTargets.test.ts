import { describe, expect, it } from 'vitest'

import type { OpenReviewForFiles } from '@/types/reviews'

import { reviewMenuTargets } from './reviewMenuTargets'

function review(id: string, patch: Partial<OpenReviewForFiles> = {}): OpenReviewForFiles {
  return {
    reviewId: id,
    title: id,
    outcome: 'open',
    itemCount: 3,
    requestedByMe: true,
    canAdd: true,
    containedFileIds: [],
    ...patch,
  }
}

describe('reviewMenuTargets', () => {
  it('offers the unsent package only when it exists and lacks one of the files', () => {
    expect(reviewMenuTargets(['a'], [], []).addToDraft).toBe(false)
    expect(reviewMenuTargets(['a'], [{ fileId: 'a' }], []).addToDraft).toBe(false)
    expect(reviewMenuTargets(['a', 'b'], [{ fileId: 'a' }], []).addToDraft).toBe(true)
  })

  it('counts the files the unsent package holds', () => {
    expect(
      reviewMenuTargets(['a', 'b', 'c'], [{ fileId: 'a' }, { fileId: 'c' }], []).removeFromDraft,
    ).toBe(2)
  })

  it('adds only to open rounds that are missing a file', () => {
    const t = reviewMenuTargets(
      ['a', 'b'],
      [],
      [
        review('open'),
        review('has-both', { containedFileIds: ['a', 'b'] }),
        review('has-one', { containedFileIds: ['a'] }),
        review('awaiting-resubmit', { canAdd: false, outcome: 'changes_requested' }),
      ],
    )
    expect(t.addTo.map((r) => r.reviewId)).toEqual(['open', 'has-one'])
  })

  it('removes only from reviews holding a file, and never their last file', () => {
    const t = reviewMenuTargets(
      ['a', 'b'],
      [],
      [
        review('none'),
        review('one-of-three', { containedFileIds: ['a'] }),
        review('only-file', { itemCount: 1, containedFileIds: ['a'] }),
        review('every-file', { itemCount: 2, containedFileIds: ['a', 'b'] }),
        review('awaiting-resubmit', { canAdd: false, containedFileIds: ['b'] }),
      ],
    )
    expect(t.removeFrom.map((r) => r.reviewId)).toEqual(['one-of-three', 'awaiting-resubmit'])
  })
})
