/**
 * Every review UI key (`reviewBuilder`, `reviewQueue`, `reviewDetail`, `markups`) exists in all 7
 * locales, and each locale keeps English's placeholders. A missing key renders as the dotted key
 * itself, so this compares each locale's flattened keys with English's rather than listing them.
 */

import { describe, expect, it } from 'vitest'

import { reviewsUiStrings } from './locales/reviewsUi'
import { getTranslation } from './index'
import type { Language } from './types'
import { flattenTranslations } from './utils'

const LOCALES: Array<[Language, keyof typeof reviewsUiStrings]> = [
  ['en', 'en'],
  ['de', 'de'],
  ['es', 'es'],
  ['fr', 'fr'],
  ['pt', 'pt'],
  ['zh-CN', 'zhCN'],
  ['zh-TW', 'zhTW'],
]

const english = flattenTranslations(reviewsUiStrings.en)
const englishKeys = Object.keys(english).sort()

function placeholders(text: string): string[] {
  return (text.match(/\{\{\w+\}\}/g) ?? []).sort()
}

/** Keys the code builds from values (`t(\`reviewQueue.status.${status}\`)`), which must all exist. */
const DYNAMIC = [
  'reviewQueue.status.open',
  'reviewQueue.status.approved',
  'reviewQueue.status.changes_requested',
  'reviewQueue.status.rejected',
  'reviewQueue.status.cancelled',
  'reviewQueue.priority.low',
  'reviewQueue.priority.normal',
  'reviewQueue.priority.high',
  'reviewQueue.priority.urgent',
  'reviewQueue.bucket.awaiting_me',
  'reviewQueue.bucket.requested_by_me',
  'reviewQueue.bucket.my_teams',
  'reviewQueue.bucket.done',
  'reviewQueue.empty.awaiting_me',
  'reviewQueue.empty.done',
  'reviewDetail.decision.approved',
  'reviewDetail.decision.approved_with_comments',
  'reviewDetail.decision.changes_requested',
  'reviewDetail.decision.rejected',
  'reviewDetail.prompt.approved_with_comments',
  'reviewDetail.prompt.changes_requested',
  'reviewDetail.prompt.rejected',
  'reviewDetail.prompt.approve_all',
  'reviewDetail.itemOutcome.pending',
  'reviewDetail.reviewerStatus.cancelled',
  'reviewDetail.reviewerWithdrawn.left_org',
  'reviewDetail.reviewerWithdrawn.lost_vault_access',
  'reviewDetail.workflowReason.not_approved',
  'reviewDetail.workflowReason.deleted',
  'reviewDetail.workflowReason.not_in_review_stage',
  'reviewDetail.workflowReason.changed_since_review',
  'reviewDetail.workflowReason.checked_out',
  'reviewDetail.workflowReason.no_next_stage',
  'reviewDetail.workflowReason.gated',
  'reviewDetail.workflowReason.checkout_required',
  'reviewDetail.workflowReason.transition_failed',
  'reviewQueue.errors.REVIEW_NOT_OPEN',
  'reviewQueue.errors.LAST_ITEM',
  'reviewQueue.errors.WORKFLOWS_DISABLED',
  'reviewQueue.errors.NOT_APPROVED',
  'reviewDetail.mode.all',
  'reviewDetail.mode.any',
  'reviewBuilder.mode.any',
  'reviewBuilder.modeHint.all',
  'reviewBuilder.pickerTab.people',
  'reviewBuilder.pickerTab.teams',
  'reviewBuilder.blocker.no_items',
  'reviewBuilder.blocker.no_reviewers',
  'reviewBuilder.blocker.too_many_items',
  'reviewBuilder.warning.checked_out_by_me',
  'reviewBuilder.warning.checked_out_by_other',
  'reviewBuilder.warning.modified',
  'reviewBuilder.warning.older_version',
  'reviewQueue.errors.COMMENT_REQUIRED',
  'markups.showResolved',
  'markups.hideResolved',
]

describe('review UI keys exist in every locale', () => {
  it('English has every key the code builds from values', () => {
    for (const key of DYNAMIC) expect(english[key], key).toBeTruthy()
  })

  it.each(LOCALES)('%s has exactly English’s keys, with the same placeholders', (_language, key) => {
    const flat = flattenTranslations(reviewsUiStrings[key])
    expect(Object.keys(flat).sort()).toEqual(englishKeys)
    for (const k of englishKeys) {
      expect(flat[k].trim().length, `${key}: ${k}`).toBeGreaterThan(0)
      expect(placeholders(flat[k]), `${key}: ${k}`).toEqual(placeholders(english[k]))
    }
  })

  it.each(LOCALES)('%s resolves the keys through getTranslation', (language) => {
    for (const k of DYNAMIC) {
      const text = getTranslation(language, k, { count: 3 })
      expect(text, `${language}: ${k}`).not.toBe(k)
    }
  })

  it('the English-only context menu keys exist', () => {
    for (const k of [
      'contextMenu.review.request',
      'contextMenu.review.requestMany',
      'contextMenu.review.addToPackage',
      'contextMenu.review.addToPackageHint',
    ]) {
      expect(getTranslation('en', k, { count: 2 })).not.toBe(k)
    }
  })
})
