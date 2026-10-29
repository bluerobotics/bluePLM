/**
 * A sentence for a failed review call. Codes the user can act on get their own translation;
 * anything else shows the server's message.
 */

import { t } from '@/lib/i18n'
import { ReviewRpcError } from '@/lib/supabase/reviewMapping'
import type { ReviewErrorCode } from '@/types/reviews'

const TRANSLATED: ReadonlySet<ReviewErrorCode> = new Set<ReviewErrorCode>([
  'FORBIDDEN',
  'REVIEW_NOT_FOUND',
  'REVIEW_CLOSED',
  'NOT_A_REVIEWER',
  'NOT_RESUBMITTABLE',
  'COMMENT_REQUIRED',
  'ITEM_NOT_OWED',
  'ITEM_NEEDS_NEW_VERSION',
  'SAME_VERSION',
  'VERSION_NOT_FOUND',
  'NO_ITEMS',
  'TOO_MANY_ITEMS',
  'NO_REVIEWERS',
  'NOTHING_OWED',
  'NOTHING_TO_RESUBMIT',
  'REVIEWER_NOT_FOUND',
  'REVIEWER_NO_VAULT_ACCESS',
  'TEAM_NOT_FOUND',
  'DUPLICATE_FILE',
  'REVIEW_NOT_OPEN',
  'LAST_ITEM',
  'WORKFLOWS_DISABLED',
  'NOT_APPROVED',
])

export function describeReviewError(error: unknown): string {
  if (error instanceof ReviewRpcError && TRANSLATED.has(error.code)) {
    return t(`reviewQueue.errors.${error.code}`)
  }
  return error instanceof Error ? error.message : String(error)
}
