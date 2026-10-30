import { describe, expect, it } from 'vitest'
import type { ReviewDetail, ReviewerAssignment, ReviewItemDetail, ReviewItemRound, ReviewQueueRow } from '@/types/reviews'
import {
  activeReviewers,
  canApproveAll,
  daysBetween,
  defaultResubmitSelection,
  dueChip,
  owedByItem,
  parseBucket,
  planItemPreview,
  planResubmit,
  queueRowChips,
  readGateDecisionResult,
  requestBlockers,
  splitRequestTargets,
  usersById,
  validateDecision,
  validateGateDecision,
  vaultStoragePaths,
  whoOwesItem,
  withdrawnReviewers,
} from './reviewLogic'

const HASH = 'a'.repeat(64)
const PDF_HASH = 'b'.repeat(64)

function user(id: string) {
  return { id, email: `${id}@x.test`, fullName: id.toUpperCase(), avatarUrl: null }
}

function reviewer(id: string, round: number, extra: Partial<ReviewerAssignment> = {}): ReviewerAssignment {
  return { user: user(id), roundNumber: round, status: 'pending', viaTeamId: null, respondedAt: null, withdrawnReason: null, ...extra }
}

function round(roundNumber: number, extra: Partial<ReviewItemRound> = {}): ReviewItemRound {
  return {
    roundNumber,
    fileVersionId: `fv${roundNumber}`,
    version: roundNumber,
    revision: null,
    carriedForward: false,
    outcome: 'pending',
    decidedAt: null,
    decisions: [],
    ...extra,
  }
}

function item(id: string, extra: Partial<ReviewItemDetail> = {}): ReviewItemDetail {
  return {
    id,
    fileId: `file-${id}`,
    vaultId: 'v1',
    sortOrder: 0,
    outcome: 'pending',
    addedInRound: 1,
    file: {
      fileName: `${id}.SLDDRW`,
      filePath: `A/${id}.SLDDRW`,
      extension: '.slddrw',
      partNumber: null,
      description: null,
      latestVersion: 3,
      deleted: false,
    },
    version: {
      fileVersionId: `fv-${id}`,
      version: 3,
      revision: 'A',
      contentHash: HASH,
      fileSize: 10,
      state: null,
      createdAt: null,
      createdBy: null,
      referencesRecorded: true,
    },
    pdf: null,
    rounds: [round(1)],
    ...extra,
  }
}

function detail(extra: Partial<ReviewDetail> = {}, header: Partial<ReviewDetail['review']> = {}): ReviewDetail {
  return {
    review: {
      id: 'r1',
      title: 'T',
      rawTitle: null,
      message: null,
      status: 'open',
      priority: 'normal',
      dueDate: null,
      overdue: false,
      mode: 'all',
      currentRound: 1,
      teamId: null,
      requestedBy: user('req'),
      requestedAt: null,
      completedAt: null,
      cancelledBy: null,
      cancelledAt: null,
      cancelReason: null,
      ...header,
    },
    items: [item('i1')],
    rounds: [],
    reviewers: [reviewer('alice', 1), reviewer('bob', 1)],
    me: {
      userId: 'alice',
      isRequester: false,
      isReviewer: true,
      isAdmin: false,
      owedItemIds: ['i1'],
      canRespond: true,
      canCancel: false,
      canResubmit: false,
      canEditMeta: false,
    },
    ...extra,
  }
}

describe('parseBucket', () => {
  it('accepts known buckets and defaults to waiting on me', () => {
    expect(parseBucket('done')).toBe('done')
    expect(parseBucket('requested_by_me')).toBe('requested_by_me')
    expect(parseBucket(null)).toBe('awaiting_me')
    expect(parseBucket('nonsense')).toBe('awaiting_me')
  })
})

describe('decision validation', () => {
  it('needs a comment for everything but a plain approval', () => {
    expect(validateDecision('approved', '')).toEqual({ ok: true, comment: null })
    expect(validateDecision('approved', '  ok ')).toEqual({ ok: true, comment: 'ok' })
    for (const d of ['approved_with_comments', 'changes_requested', 'rejected'] as const) {
      expect(validateDecision(d, '   ')).toEqual({ ok: false, reason: 'comment_required' })
      expect(validateDecision(d, ' fix it ')).toEqual({ ok: true, comment: 'fix it' })
    }
  })

  it('gate decisions: kick back and reject need a comment', () => {
    expect(validateGateDecision('approved', null).ok).toBe(true)
    expect(validateGateDecision('kicked_back', '').ok).toBe(false)
    expect(validateGateDecision('rejected', 'no').ok).toBe(true)
  })

  it('reads the gate RPC result defensively', () => {
    expect(readGateDecisionResult({ success: true, new_state_name: 'Released' })).toEqual({
      success: true,
      newStateName: 'Released',
      errorMessage: null,
    })
    expect(readGateDecisionResult(null)).toEqual({ success: false, newStateName: null, errorMessage: null })
    expect(readGateDecisionResult({ success: 'yes', error_message: 'nope' }).success).toBe(false)
  })
})

describe('who owes what', () => {
  it('everyone in the round who has not decided owes a pending item', () => {
    expect(whoOwesItem(detail(), item('i1'))).toEqual(['alice', 'bob'])
  })

  it('leaves out reviewers who decided', () => {
    const it1 = item('i1', {
      rounds: [round(1, { decisions: [{ reviewerId: 'alice', decision: 'approved', comment: null, decidedAt: 'x', legacy: false }] })],
    })
    expect(whoOwesItem(detail({ items: [it1] }), it1)).toEqual(['bob'])
  })

  it('leaves out withdrawn reviewers and earlier rounds', () => {
    const d = detail({
      reviewers: [
        reviewer('alice', 2),
        reviewer('bob', 2, { withdrawnReason: 'left_org', status: 'cancelled' }),
        reviewer('carol', 1),
      ],
    }, { currentRound: 2 })
    const it2 = item('i1', { rounds: [round(1), round(2)] })
    expect(whoOwesItem(d, it2)).toEqual(['alice'])
    expect(activeReviewers(d).map((r) => r.user?.id)).toEqual(['alice'])
    expect(withdrawnReviewers(d).map((r) => r.user?.id)).toEqual(['bob'])
  })

  it('nobody owes a carried-forward, decided, or closed item', () => {
    const carried = item('i1', { rounds: [round(1, { carriedForward: true })] })
    expect(whoOwesItem(detail(), carried)).toEqual([])
    const decided = item('i1', { rounds: [round(1, { outcome: 'approved' })] })
    expect(whoOwesItem(detail(), decided)).toEqual([])
    expect(whoOwesItem(detail({}, { status: 'cancelled' }), item('i1'))).toEqual([])
    const noRound = item('i1', { rounds: [] })
    expect(whoOwesItem(detail(), noRound)).toEqual([])
  })

  it('owedByItem drops items nobody owes', () => {
    const d = detail({ items: [item('i1'), item('i2', { rounds: [round(1, { outcome: 'rejected' })] })] })
    expect(owedByItem(d)).toEqual({ i1: ['alice', 'bob'] })
  })

  it('names every user in the detail, and approve-all follows the server context', () => {
    expect(Array.from(usersById(detail()).keys()).sort()).toEqual(['alice', 'bob', 'req'])
    expect(canApproveAll(detail())).toBe(true)
    const d = detail()
    expect(canApproveAll({ ...d, me: { ...d.me, owedItemIds: [] } })).toBe(false)
    expect(canApproveAll({ ...d, me: { ...d.me, canRespond: false } })).toBe(false)
  })
})

describe('planItemPreview and storage paths', () => {
  it('a drawing without a render is pending, with one shows the render', () => {
    expect(planItemPreview(item('i1'))).toEqual({ kind: 'pending' })
    const withPdf = item('i1', {
      pdf: { fileVersionId: 'fv-i1', fileId: 'file-i1', storageHash: PDF_HASH, fileSize: 1, closureExact: true, generatedBy: null, generatedAt: 'x' },
    })
    expect(planItemPreview(withPdf)).toEqual({ kind: 'render', storageHash: PDF_HASH })
  })

  it('a PDF item shows its own content; other types are unsupported', () => {
    const pdf = item('p', { file: { ...item('p').file, fileName: 'spec.PDF' } })
    expect(planItemPreview(pdf)).toEqual({ kind: 'pdfFile', storageHash: HASH })
    const part = item('q', { file: { ...item('q').file, fileName: 'part.SLDPRT' } })
    expect(planItemPreview(part)).toEqual({ kind: 'unsupported' })
  })

  it('a malformed hash never reaches a storage path', () => {
    const bad = item('i1', {
      pdf: { fileVersionId: 'fv', fileId: 'f', storageHash: '../x', fileSize: 1, closureExact: null, generatedBy: null, generatedAt: 'x' },
    })
    expect(planItemPreview(bad)).toEqual({ kind: 'unsupported' })
    expect(vaultStoragePaths('org', '../../etc')).toEqual([])
    expect(vaultStoragePaths('a/b', HASH)).toEqual([])
    expect(vaultStoragePaths('org', HASH)).toEqual([`org/aa/${HASH}`, `org/${HASH}`])
  })
})

describe('due chips', () => {
  it('compares calendar dates, not instants', () => {
    expect(daysBetween('2026-10-29', '2026-10-30')).toBe(1)
    expect(daysBetween('2026-10-29', 'bad')).toBeNull()
    expect(dueChip('2026-10-28', '2026-10-29')).toEqual({ tone: 'overdue', days: -1 })
    expect(dueChip('2026-10-29', '2026-10-29')).toEqual({ tone: 'today', days: 0 })
    expect(dueChip('2026-10-31', '2026-10-29')).toEqual({ tone: 'soon', days: 2 })
    expect(dueChip('2026-11-10', '2026-10-29')?.tone).toBe('later')
    expect(dueChip('2026-11-10', '2026-10-29', true)?.tone).toBe('overdue')
    expect(dueChip(null, '2026-10-29')).toBeNull()
  })

  it('closed rows show no due or priority chip; gate rows show no progress', () => {
    const row = {
      kind: 'package',
      status: 'approved',
      priority: 'urgent',
      dueDate: '2026-10-01',
      overdue: true,
      itemsDecided: 2,
      itemCount: 3,
    } as ReviewQueueRow
    expect(queueRowChips(row, '2026-10-29')).toEqual({ due: null, priority: null, progress: { decided: 2, total: 3 } })
    const open = { ...row, status: 'open', kind: 'gate' } as ReviewQueueRow
    const chips = queueRowChips(open, '2026-10-29')
    expect(chips.priority).toBe('urgent')
    expect(chips.due?.tone).toBe('overdue')
    expect(chips.progress).toBeNull()
  })
})

describe('resubmit planning', () => {
  const approved = item('ok', { outcome: 'approved' })
  const changed = item('ch', { outcome: 'changes_requested' })
  const versions = {
    'file-ch': [
      { fileVersionId: 'v2', version: 2, revision: null, createdAt: null },
      { fileVersionId: 'v4', version: 4, revision: null, createdAt: null },
      { fileVersionId: 'v5', version: 5, revision: 'B', createdAt: null },
    ],
  }

  it('picks the newest newer version for items not approved, and carries approved ones', () => {
    const selection = defaultResubmitSelection([approved, changed], versions)
    expect(selection).toEqual({ ch: 'v5' })
    expect(planResubmit([approved, changed], selection)).toEqual({
      ready: true,
      missing: [],
      payload: [{ itemId: 'ch', fileVersionId: 'v5' }],
    })
  })

  it('is not ready while an item has no newer version or the same one', () => {
    expect(planResubmit([changed], { ch: null }).ready).toBe(false)
    expect(planResubmit([changed], { ch: 'fv-ch' }).missing).toEqual(['ch'])
    expect(defaultResubmitSelection([changed], {})).toEqual({ ch: null })
  })
})

describe('request review', () => {
  it('lists what blocks a request', () => {
    expect(requestBlockers(0, 0)).toEqual(['no_items', 'no_reviewers'])
    expect(requestBlockers(501, 2)).toEqual(['too_many_items'])
    expect(requestBlockers(3, 1)).toEqual([])
  })

  it('de-duplicates targets', () => {
    expect(splitRequestTargets({ fileIds: ['a', 'a', 'b'] })).toEqual({ fileIds: ['a', 'b'], fileVersionIds: [] })
    expect(splitRequestTargets({ fileVersionIds: ['v'] })).toEqual({ fileIds: [], fileVersionIds: ['v'] })
  })
})
