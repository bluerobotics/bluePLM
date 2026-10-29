/**
 * Which entries the Reviews context submenu offers for a file selection. Pure, so the rules are
 * tested without a menu.
 */

import type { OpenReviewForFiles } from '@/types/reviews'

export interface ReviewMenuTargets {
  /** The unsent package exists and is missing at least one of the files. */
  addToDraft: boolean
  /** How many of the files the unsent package holds. */
  removeFromDraft: number
  /** Open reviews still taking files that lack at least one of them. */
  addTo: OpenReviewForFiles[]
  /**
   * Open reviews holding at least one of the files, as long as something would be left: the last
   * file of a review is not removed (the server refuses it; cancelling the review is the way).
   */
  removeFrom: OpenReviewForFiles[]
}

export function reviewMenuTargets(
  fileIds: readonly string[],
  draftItems: readonly { fileId: string }[],
  reviews: readonly OpenReviewForFiles[],
): ReviewMenuTargets {
  const inDraft = new Set(draftItems.map((i) => i.fileId))
  return {
    addToDraft: draftItems.length > 0 && fileIds.some((id) => !inDraft.has(id)),
    removeFromDraft: fileIds.filter((id) => inDraft.has(id)).length,
    addTo: reviews.filter((r) => {
      if (!r.canAdd) return false
      const contained = new Set(r.containedFileIds)
      return fileIds.some((id) => !contained.has(id))
    }),
    removeFrom: reviews.filter(
      (r) => r.containedFileIds.length > 0 && r.containedFileIds.length < r.itemCount,
    ),
  }
}
