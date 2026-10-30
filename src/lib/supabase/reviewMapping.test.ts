/**
 * The review RPCs return snake_case JSON that the generated Supabase types do not describe, so
 * every field the UI reads passes through these mappers. They are the contract between the SQL in
 * 20-change-control.sql / 10-source-files.sql and the renderer: a renamed key or a new enum value
 * on either side shows up here.
 */

import { describe, expect, it } from 'vitest'

import {
  ReviewRpcError,
  decisionNeedsComment,
  decisionsArg,
  mapClosureRows,
  mapDrawingPdf,
  mapQueuePage,
  mapRequestReviewResult,
  mapRespondResult,
  mapReviewDetail,
  requestReviewArgs,
  resubmitItemsArg,
  reviewMetaArgs,
  reviewOutcomeFromStatus,
  reviewQueueArgs,
  toReviewRpcError,
  versionReferencesArg,
} from './reviewMapping'

const HASH = 'a'.repeat(64)

describe('reviewOutcomeFromStatus', () => {
  it('reads both the RPC vocabulary and the raw reviews.status a Realtime payload carries', () => {
    expect(reviewOutcomeFromStatus('open')).toBe('open')
    expect(reviewOutcomeFromStatus('pending')).toBe('open')
    expect(reviewOutcomeFromStatus('kicked_back')).toBe('changes_requested')
    expect(reviewOutcomeFromStatus('changes_requested')).toBe('changes_requested')
    expect(reviewOutcomeFromStatus('approved')).toBe('approved')
    expect(reviewOutcomeFromStatus('cancelled')).toBe('cancelled')
  })

  it('treats anything unknown as open rather than as a closed state', () => {
    expect(reviewOutcomeFromStatus('something_new')).toBe('open')
    expect(reviewOutcomeFromStatus(undefined)).toBe('open')
  })
})

describe('decisionNeedsComment', () => {
  it('requires a comment for every decision except a plain approval', () => {
    expect(decisionNeedsComment('approved')).toBe(false)
    expect(decisionNeedsComment('approved_with_comments')).toBe(true)
    expect(decisionNeedsComment('changes_requested')).toBe(true)
    expect(decisionNeedsComment('rejected')).toBe(true)
  })
})

describe('toReviewRpcError', () => {
  it('takes the code from the hint and the culprit id from details', () => {
    const err = toReviewRpcError({
      message: 'This item is not awaiting your decision',
      code: '55000',
      details: 'item-7',
      hint: 'ITEM_NOT_OWED',
    })
    expect(err).toBeInstanceOf(ReviewRpcError)
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('ITEM_NOT_OWED')
    expect(err.sqlState).toBe('55000')
    expect(err.subjectId).toBe('item-7')
    expect(err.message).toBe('This item is not awaiting your decision')
  })

  it('reports UNKNOWN for an error the RPC did not classify', () => {
    const err = toReviewRpcError({ message: 'fetch failed' })
    expect(err.code).toBe('UNKNOWN')
    expect(err.sqlState).toBeNull()
    expect(err.subjectId).toBeNull()
  })

  it('does not trust an unrecognised hint', () => {
    expect(toReviewRpcError({ message: 'x', hint: 'Run core.sql first' }).code).toBe('UNKNOWN')
    expect(toReviewRpcError({ message: 'x', details: '   ' }).subjectId).toBeNull()
  })
})

describe('argument builders', () => {
  it('requestReviewArgs dedupes ids, trims text and applies the defaults', () => {
    expect(
      requestReviewArgs({
        fileVersionIds: ['v1', 'v2', 'v1'],
        reviewerIds: ['u1', 'u1'],
        title: '  Bracket rev B  ',
        message: '   ',
        dueDate: '',
      }),
    ).toEqual({
      p_file_version_ids: ['v1', 'v2'],
      p_reviewer_ids: ['u1'],
      p_team_ids: [],
      p_title: 'Bracket rev B',
      p_message: null,
      p_mode: 'all',
      p_priority: 'normal',
      p_due_date: null,
    })
  })

  it('requestReviewArgs passes mode, priority, teams and a calendar due date through', () => {
    const args = requestReviewArgs({
      fileVersionIds: ['v1'],
      teamIds: ['t1'],
      mode: 'any',
      priority: 'urgent',
      dueDate: '2026-11-03',
    })
    expect(args.p_mode).toBe('any')
    expect(args.p_priority).toBe('urgent')
    expect(args.p_team_ids).toEqual(['t1'])
    expect(args.p_due_date).toBe('2026-11-03')
  })

  it('decisionsArg sends a blank comment as null so the server, not the client, enforces it', () => {
    expect(
      decisionsArg([
        { itemId: 'i1', decision: 'approved' },
        { itemId: 'i2', decision: 'changes_requested', comment: '  hole too close to edge ' },
        { itemId: 'i3', decision: 'rejected', comment: '   ' },
      ]),
    ).toEqual([
      { item_id: 'i1', decision: 'approved', comment: null },
      { item_id: 'i2', decision: 'changes_requested', comment: 'hole too close to edge' },
      { item_id: 'i3', decision: 'rejected', comment: null },
    ])
  })

  it('resubmitItemsArg names each item and its new version', () => {
    expect(resubmitItemsArg([{ itemId: 'i1', fileVersionId: 'v9' }])).toEqual([
      { item_id: 'i1', file_version_id: 'v9' },
    ])
  })

  it('reviewMetaArgs keeps the due date when the key is absent', () => {
    expect(reviewMetaArgs('r1', { priority: 'high' })).toEqual({
      p_review_id: 'r1',
      p_priority: 'high',
      p_due_date: null,
      p_clear_due_date: false,
    })
  })

  it('reviewMetaArgs clears the due date when it is null, and sets it when given', () => {
    expect(reviewMetaArgs('r1', { dueDate: null })).toMatchObject({ p_due_date: null, p_clear_due_date: true })
    expect(reviewMetaArgs('r1', { dueDate: '2026-12-01' })).toMatchObject({
      p_due_date: '2026-12-01',
      p_clear_due_date: false,
      p_priority: null,
    })
  })

  it('reviewQueueArgs defaults the page size and drops a blank search', () => {
    expect(reviewQueueArgs({ bucket: 'awaiting_me', search: '  ' })).toEqual({
      p_bucket: 'awaiting_me',
      p_team_id: null,
      p_search: null,
      p_limit: 50,
      p_cursor: null,
    })
  })

  it('versionReferencesArg defaults the type and quantity and keeps out-of-vault paths', () => {
    expect(
      versionReferencesArg([
        { childFileId: 'f2', childContentHash: ` ${HASH} `, configuration: 'Default' },
        { childPath: 'C:/toolbox/screw.sldprt', referenceType: 'reference', quantity: 4 },
      ]),
    ).toEqual([
      {
        child_file_id: 'f2',
        child_content_hash: HASH,
        child_path: null,
        configuration: 'Default',
        reference_type: 'component',
        quantity: 1,
      },
      {
        child_file_id: null,
        child_content_hash: null,
        child_path: 'C:/toolbox/screw.sldprt',
        configuration: null,
        reference_type: 'reference',
        quantity: 4,
      },
    ])
  })
})

describe('result mappers', () => {
  it('mapRequestReviewResult reads reviewers and skipped team members', () => {
    expect(
      mapRequestReviewResult({
        review_id: 'r1',
        item_count: 3,
        reviewer_ids: ['u1', 'u2', 7],
        skipped: [{ user_id: 'u3', reason: 'no_vault_access' }, { user_id: 'u0', reason: 'requester' }],
      }),
    ).toEqual({
      reviewId: 'r1',
      itemCount: 3,
      reviewerIds: ['u1', 'u2'],
      skipped: [
        { userId: 'u3', reason: 'no_vault_access' },
        { userId: 'u0', reason: 'requester' },
      ],
    })
  })

  it('mapRespondResult maps the reported status', () => {
    expect(mapRespondResult({ review_id: 'r1', decided: 2, status: 'changes_requested', owed_remaining: 0 })).toEqual({
      reviewId: 'r1',
      decided: 2,
      status: 'changes_requested',
      owedRemaining: 0,
    })
  })

  it('mapQueuePage maps package and gate rows and the next cursor', () => {
    const page = mapQueuePage({
      rows: [
        {
          kind: 'package',
          id: 'r1',
          title: 'BR-1001 drawings',
          status: 'open',
          priority: 'urgent',
          due_date: '2026-10-27',
          overdue: true,
          mode: 'all',
          round: 2,
          requested_by: { id: 'u1', email: 'a@x.com', full_name: 'Ada', avatar_url: null },
          requested_at: '2026-10-20T10:00:00Z',
          completed_at: null,
          team_id: 't1',
          item_count: 20,
          items_decided: 18,
          items_owed_by_me: 2,
          preview: { file_id: 'f1', file_name: 'BR-1001.SLDDRW', extension: '.slddrw', file_version_id: 'v1', version: 4, revision: 'B' },
          gate: null,
          cursor: '00...r1',
        },
        {
          kind: 'gate',
          id: 'pr1',
          title: 'BR-2002.SLDPRT - Release approval',
          status: 'open',
          priority: 'normal',
          due_date: null,
          overdue: false,
          mode: null,
          round: null,
          requested_by: null,
          requested_at: '2026-10-21T10:00:00Z',
          item_count: 1,
          items_decided: 0,
          items_owed_by_me: 1,
          preview: { file_id: 'f2', file_name: 'BR-2002.SLDPRT', extension: '.sldprt', file_version_id: null, version: 7, revision: 'C' },
          gate: {
            pending_review_id: 'pr1',
            file_id: 'f2',
            file_name: 'BR-2002.SLDPRT',
            file_path: 'parts/BR-2002.SLDPRT',
            gate_id: 'g1',
            gate_name: 'Release approval',
            gate_type: 'approval',
            transition_id: 'tr1',
            transition_name: 'Release',
            from_state_name: 'In Review',
            to_state_name: 'Released',
            checklist_items: [{ id: 'c1', label: 'Tolerances checked' }],
          },
          cursor: '12...pr1',
        },
      ],
      next_cursor: '12...pr1',
    })

    expect(page.nextCursor).toBe('12...pr1')
    expect(page.rows).toHaveLength(2)

    const [pkg, gate] = page.rows
    expect(pkg).toMatchObject({
      kind: 'package',
      status: 'open',
      priority: 'urgent',
      overdue: true,
      mode: 'all',
      round: 2,
      itemsOwedByMe: 2,
      requestedBy: { id: 'u1', fullName: 'Ada', avatarUrl: null },
      preview: { fileVersionId: 'v1', version: 4, revision: 'B' },
      gate: null,
    })
    expect(gate).toMatchObject({
      kind: 'gate',
      mode: null,
      round: null,
      requestedBy: null,
      completedAt: null,
      preview: { fileVersionId: null, version: 7 },
      gate: { pendingReviewId: 'pr1', gateName: 'Release approval', toStateName: 'Released' },
    })
    expect(gate.gate?.checklistItems).toEqual([{ id: 'c1', label: 'Tolerances checked' }])
  })

  it('mapQueuePage survives an empty or malformed payload', () => {
    expect(mapQueuePage(null)).toEqual({ rows: [], nextCursor: null })
    expect(mapQueuePage({ rows: 'nope' })).toEqual({ rows: [], nextCursor: null })
  })

  it('mapReviewDetail maps items with their pinned version, PDF and round history', () => {
    const detail = mapReviewDetail({
      review: {
        id: 'r1',
        title: 'BR-1001 drawings',
        raw_title: null,
        message: 'Please check the hole callouts',
        status: 'changes_requested',
        priority: 'high',
        due_date: '2026-11-01',
        overdue: false,
        mode: 'any',
        current_round: 1,
        team_id: null,
        requested_by: { id: 'u1', email: 'a@x.com', full_name: 'Ada', avatar_url: null },
        requested_at: '2026-10-20T10:00:00Z',
        completed_at: null,
        cancelled_by: null,
        cancelled_at: null,
        cancel_reason: null,
      },
      items: [
        {
          id: 'i1',
          file_id: 'f1',
          vault_id: 'vault-1',
          sort_order: 1,
          outcome: 'changes_requested',
          added_in_round: 1,
          file: {
            file_name: 'BR-1001.SLDDRW',
            file_path: 'drawings/BR-1001.SLDDRW',
            extension: '.slddrw',
            part_number: 'BR-1001',
            description: 'Bracket',
            latest_version: 5,
            deleted: false,
          },
          version: {
            file_version_id: 'v4',
            version: 4,
            revision: 'B',
            content_hash: 'h4',
            file_size: 123456,
            state: 'In Review',
            created_at: '2026-10-19T10:00:00Z',
            created_by: 'u1',
            references_recorded: true,
          },
          pdf: { storage_hash: HASH, file_size: 2048, is_closure_exact: false, generated_by: 'u1', generated_at: '2026-10-20T10:01:00Z' },
          rounds: [
            {
              round_number: 1,
              file_version_id: 'v4',
              version: 4,
              revision: 'B',
              is_carried_forward: false,
              outcome: 'changes_requested',
              decided_at: '2026-10-21T09:00:00Z',
              decisions: [
                { reviewer_id: 'u2', decision: 'changes_requested', comment: 'Hole too close', decided_at: '2026-10-21T09:00:00Z', legacy: false },
              ],
            },
          ],
        },
      ],
      rounds: [
        { round_number: 1, opened_by: 'u1', opened_at: '2026-10-20T10:00:00Z', note: null, closed_at: '2026-10-21T09:00:00Z', outcome: 'changes_requested' },
      ],
      reviewers: [
        {
          user: { id: 'u2', email: 'b@x.com', full_name: 'Bo', avatar_url: null },
          round_number: 1,
          status: 'kicked_back',
          via_team_id: 't1',
          responded_at: '2026-10-21T09:00:00Z',
        },
        { user: { id: 'u3', email: 'c@x.com', full_name: null, avatar_url: null }, round_number: 1, status: 'cancelled', via_team_id: 't1', responded_at: null },
      ],
      me: {
        user_id: 'u1',
        is_requester: true,
        is_reviewer: false,
        is_admin: false,
        owed_item_ids: [],
        can_respond: false,
        can_cancel: true,
        can_resubmit: true,
        can_edit_meta: true,
      },
    })

    expect(detail.review).toMatchObject({ status: 'changes_requested', mode: 'any', priority: 'high', currentRound: 1 })
    const item = detail.items[0]
    expect(item.version).toEqual({
      fileVersionId: 'v4',
      version: 4,
      revision: 'B',
      contentHash: 'h4',
      fileSize: 123456,
      state: 'In Review',
      createdAt: '2026-10-19T10:00:00Z',
      createdBy: 'u1',
      referencesRecorded: true,
    })
    expect(item.file.latestVersion).toBe(5)
    // The detail's pdf object omits the ids; they come from the item.
    expect(item.pdf).toEqual({
      fileVersionId: 'v4',
      fileId: 'f1',
      storageHash: HASH,
      fileSize: 2048,
      closureExact: false,
      generatedBy: 'u1',
      generatedAt: '2026-10-20T10:01:00Z',
    })
    expect(item.rounds[0].decisions[0]).toEqual({
      reviewerId: 'u2',
      decision: 'changes_requested',
      comment: 'Hole too close',
      decidedAt: '2026-10-21T09:00:00Z',
      legacy: false,
    })
    expect(detail.rounds[0].outcome).toBe('changes_requested')
    expect(detail.reviewers.map((r) => r.status)).toEqual(['changes_requested', 'cancelled'])
    expect(detail.me).toMatchObject({ isRequester: true, canResubmit: true, canRespond: false, owedItemIds: [] })
  })

  it('mapReviewDetail gives an item without a PDF a null pdf, and unknown enums safe defaults', () => {
    const detail = mapReviewDetail({
      review: { id: 'r1', mode: 'sometimes', priority: 'critical', status: 'pending' },
      items: [{ id: 'i1', file_id: 'f1', outcome: 'maybe', file: {}, version: { file_version_id: 'v1' }, pdf: null, rounds: [] }],
      rounds: [{ round_number: 1, outcome: null }],
      reviewers: [],
      me: {},
    })
    expect(detail.review).toMatchObject({ mode: 'all', priority: 'normal', status: 'open', currentRound: 1 })
    expect(detail.items[0].pdf).toBeNull()
    expect(detail.items[0].outcome).toBe('pending')
    expect(detail.rounds[0].outcome).toBeNull()
    expect(detail.me.owedItemIds).toEqual([])
  })

  it('mapDrawingPdf reads a get_drawing_pdf row and rejects a row without a hash', () => {
    expect(
      mapDrawingPdf({
        file_version_id: 'v1',
        file_id: 'f1',
        storage_hash: HASH,
        file_size: '4096',
        is_closure_exact: null,
        generated_by: null,
        generated_at: '2026-10-20T10:01:00Z',
      }),
    ).toEqual({
      fileVersionId: 'v1',
      fileId: 'f1',
      storageHash: HASH,
      fileSize: 4096,
      closureExact: null,
      generatedBy: null,
      generatedAt: '2026-10-20T10:01:00Z',
    })
    expect(mapDrawingPdf(undefined)).toBeNull()
    expect(mapDrawingPdf({ file_version_id: 'v1' })).toBeNull()
  })

  it('mapClosureRows keeps the root, exact and missing rows apart', () => {
    const rows = mapClosureRows([
      { depth: 0, parent_version_id: null, file_id: 'f1', file_version_id: 'v1', edge_source: 'root', is_exact: true, missing: false, quantity: 1, version: 4, file_size: '100', deleted: false },
      { depth: 1, parent_version_id: 'v1', file_id: 'f2', file_version_id: 'v2', reference_path: 'parts/a.sldprt', configuration: 'Default', reference_type: 'component', quantity: 2, is_exact: true, edge_source: 'recorded', missing: false, version: 3 },
      { depth: 1, parent_version_id: 'v1', file_id: null, file_version_id: null, reference_path: 'C:/toolbox/screw.sldprt', reference_type: 'reference', quantity: 1, is_exact: false, edge_source: 'recorded', missing: true, version: null, file_size: null },
      { depth: 2, parent_version_id: 'v2', file_id: 'f3', file_version_id: 'v3', is_exact: false, edge_source: 'fallback', missing: false, reference_type: 'weird' },
    ])

    expect(rows.map((r) => [r.depth, r.edgeSource, r.exact, r.missing])).toEqual([
      [0, 'root', true, false],
      [1, 'recorded', true, false],
      [1, 'recorded', false, true],
      [2, 'fallback', false, false],
    ])
    expect(rows[0].fileSize).toBe(100)
    expect(rows[1]).toMatchObject({ quantity: 2, configuration: 'Default', referenceType: 'component' })
    expect(rows[2]).toMatchObject({ fileId: null, fileVersionId: null, fileSize: null, referencePath: 'C:/toolbox/screw.sldprt' })
    expect(rows[3].referenceType).toBeNull()
    expect(mapClosureRows(null)).toEqual([])
  })
})
