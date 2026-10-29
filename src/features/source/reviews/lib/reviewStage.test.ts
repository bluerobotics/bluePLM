import { describe, expect, it } from 'vitest'

import { fileWorkflowsEnabled } from '@/lib/fileWorkflows'
import type { ReviewWorkflowItem, ReviewWorkflowStatus } from '@/types/reviews'

import { summarizeReviewStage } from './reviewStage'

function item(id: string, patch: Partial<ReviewWorkflowItem> = {}): ReviewWorkflowItem {
  return {
    itemId: id,
    fileId: `f-${id}`,
    outcome: 'pending',
    stateName: 'In Review',
    stateColor: null,
    inReviewStage: true,
    nextStateName: 'Released',
    advancedAt: null,
    advancedToStateName: null,
    ...patch,
  }
}

function status(
  items: ReviewWorkflowItem[],
  patch: Partial<ReviewWorkflowStatus> = {},
): ReviewWorkflowStatus {
  return { workflowsEnabled: true, onApproval: 'hold', packagePolicy: 'together', items, ...patch }
}

describe('summarizeReviewStage', () => {
  it('counts waiting and approved-waiting files, ignoring files outside a review stage', () => {
    const s = summarizeReviewStage(
      status([
        item('a', { outcome: 'approved' }),
        item('b'),
        item('c', { outcome: 'approved', inReviewStage: false, nextStateName: null }),
      ]),
      'open',
    )
    expect(s.inStage).toBe(2)
    expect(s.approvedWaiting).toBe(1)
    expect(s.packageReady).toBe(false)
    expect(s.nextStates).toEqual(['Released'])
    expect(s.relevant).toBe(true)
  })

  it('offers the package move only once the whole review is approved', () => {
    const items = [item('a', { outcome: 'approved' }), item('b', { outcome: 'approved' })]
    expect(summarizeReviewStage(status(items), 'approved').packageReady).toBe(true)
    expect(summarizeReviewStage(status(items), 'changes_requested').packageReady).toBe(false)
  })

  it('groups moved files by the state they went to and stops counting them as waiting', () => {
    const s = summarizeReviewStage(
      status([
        item('a', {
          outcome: 'approved',
          inReviewStage: false,
          advancedAt: 't',
          advancedToStateName: 'Released',
        }),
        item('b', {
          outcome: 'approved',
          inReviewStage: false,
          advancedAt: 't',
          advancedToStateName: 'Released',
        }),
      ]),
      'approved',
    )
    expect(s.moved).toEqual([{ state: 'Released', count: 2 }])
    expect(s.inStage).toBe(0)
    expect(s.packageReady).toBe(false)
    expect(s.relevant).toBe(true)
  })

  it('is not relevant when workflows are off or nothing touches a review stage', () => {
    expect(
      summarizeReviewStage(status([item('a')], { workflowsEnabled: false }), 'open').relevant,
    ).toBe(false)
    expect(
      summarizeReviewStage(status([item('a', { inReviewStage: false })]), 'open').relevant,
    ).toBe(false)
  })
})

describe('fileWorkflowsEnabled', () => {
  it('is on unless the organization set it to false', () => {
    expect(fileWorkflowsEnabled(null)).toBe(true)
    expect(fileWorkflowsEnabled({ settings: {} as never })).toBe(true)
    expect(fileWorkflowsEnabled({ settings: { file_workflows_enabled: true } as never })).toBe(true)
    expect(fileWorkflowsEnabled({ settings: { file_workflows_enabled: false } as never })).toBe(
      false,
    )
  })
})
