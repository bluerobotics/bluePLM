/**
 * What the review's workflow bar shows and offers, from `get_review_workflow_status`. Pure, so the
 * rules are tested without the pane. The server decides again when a move runs
 * (`advance_reviewed_files`); these only decide which buttons to show.
 */

import type { ReviewOutcome, ReviewWorkflowStatus } from '@/types/reviews'

export interface ReviewStageSummary {
  /** Files still sitting in a review stage. */
  inStage: number
  /** Of those, approved ones: what "Move approved files" would move. */
  approvedWaiting: number
  /** The whole review is approved and something is still in a review stage. */
  packageReady: boolean
  /** Files already moved by this review, per state they went to. */
  moved: { state: string; count: number }[]
  /** Distinct next stages of the files still waiting. */
  nextStates: string[]
  /** Something in this review touches a review stage: the bar is worth showing. */
  relevant: boolean
}

export function summarizeReviewStage(
  status: ReviewWorkflowStatus,
  reviewOutcome: ReviewOutcome,
): ReviewStageSummary {
  const waiting = status.items.filter((i) => i.inReviewStage && !i.advancedAt)
  const approvedWaiting = waiting.filter((i) => i.outcome === 'approved').length
  const movedBy = new Map<string, number>()
  for (const i of status.items) {
    if (!i.advancedAt) continue
    const state = i.advancedToStateName ?? '?'
    movedBy.set(state, (movedBy.get(state) ?? 0) + 1)
  }
  const nextStates = [
    ...new Set(waiting.map((i) => i.nextStateName).filter((s): s is string => !!s)),
  ]
  return {
    inStage: waiting.length,
    approvedWaiting,
    packageReady: reviewOutcome === 'approved' && waiting.length > 0,
    moved: [...movedBy].map(([state, count]) => ({ state, count })),
    nextStates,
    relevant: status.workflowsEnabled && (waiting.length > 0 || movedBy.size > 0),
  }
}
