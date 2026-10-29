/**
 * Pure mapping between the review RPCs' snake_case JSON and the canonical types in
 * `@/types/reviews`. No I/O, so it is unit-tested directly (`reviewMapping.test.ts`).
 *
 * RPC results arrive as `unknown` (the generated Supabase types do not know these functions until
 * they are regenerated against schema 107), so every reader checks the type it is given and falls
 * back to a safe default instead of trusting a cast.
 */

import type { Json } from '@/types/supabase'
import type {
  AddReviewItemsResult,
  AdvanceReviewedFilesResult,
  CancelResult,
  ClosureEdgeSource,
  DependencyClosureRow,
  DrawingPdf,
  GateReviewSummary,
  ItemDecisionInput,
  RecordDrawingPdfResult,
  RecordVersionReferencesResult,
  ReferenceType,
  RequestReviewInput,
  RequestReviewResult,
  ResubmitItemInput,
  ResubmitResult,
  RespondResult,
  ReviewDecision,
  ReviewDetail,
  ReviewErrorCode,
  ReviewerAssignment,
  ReviewerRoundStatus,
  ReviewerSkipReason,
  ReviewerWithdrawnReason,
  ReviewHeader,
  ReviewItemDecision,
  ReviewItemDetail,
  ReviewItemOutcome,
  ReviewItemRound,
  ReviewMetaPatch,
  ReviewMetaResult,
  ReviewMode,
  ReviewOutcome,
  ReviewPriority,
  ReviewQueueBucket,
  ReviewQueueKind,
  ReviewQueuePage,
  ReviewQueuePreview,
  ReviewQueueQuery,
  ReviewQueueRow,
  ReviewRound,
  ReviewRoundOutcome,
  ReviewUser,
  ReviewViewerContext,
  VersionReferenceInput,
  OpenReviewForFiles,
  RemoveReviewItemsResult,
  ReviewStageSkipReason,
  ReviewWorkflowStatus,
} from '@/types/reviews'

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function obj(v: unknown): Obj {
  return isObj(v) ? v : {}
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return fallback
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = num(v, Number.NaN)
  return Number.isNaN(n) ? null : n
}

function bool(v: unknown): boolean {
  return v === true
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function oneOfOrNull<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null
}

function toJson(v: unknown): Json {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.map(toJson)
  if (isObj(v)) {
    const out: { [key: string]: Json | undefined } = {}
    for (const [k, val] of Object.entries(v)) out[k] = toJson(val)
    return out
  }
  return null
}

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

export const REVIEW_PRIORITIES: readonly ReviewPriority[] = ['low', 'normal', 'high', 'urgent']
export const REVIEW_MODES: readonly ReviewMode[] = ['all', 'any']
export const REVIEW_DECISIONS: readonly ReviewDecision[] = [
  'approved',
  'approved_with_comments',
  'changes_requested',
  'rejected',
]
export const REVIEW_QUEUE_BUCKETS: readonly ReviewQueueBucket[] = [
  'awaiting_me',
  'requested_by_me',
  'my_teams',
  'done',
]
const OUTCOMES: readonly ReviewOutcome[] = ['open', 'approved', 'changes_requested', 'rejected', 'cancelled']
const ITEM_OUTCOMES: readonly ReviewItemOutcome[] = ['pending', 'approved', 'changes_requested', 'rejected']
const ROUND_OUTCOMES: readonly ReviewRoundOutcome[] = ['approved', 'changes_requested', 'rejected', 'cancelled']
const WITHDRAWN_REASONS: readonly ReviewerWithdrawnReason[] = ['left_org', 'lost_vault_access']
const REVIEWER_STATUSES: readonly ReviewerRoundStatus[] = [
  'pending',
  'approved',
  'changes_requested',
  'rejected',
  'cancelled',
]
const QUEUE_KINDS: readonly ReviewQueueKind[] = ['package', 'gate']
const SKIP_REASONS: readonly ReviewerSkipReason[] = ['requester', 'no_vault_access']
const REFERENCE_TYPES: readonly ReferenceType[] = ['component', 'derived', 'reference']
const EDGE_SOURCES: readonly ClosureEdgeSource[] = ['root', 'recorded', 'fallback']
const ERROR_CODES: readonly ReviewErrorCode[] = [
  'FORBIDDEN',
  'REVIEW_NOT_FOUND',
  'REVIEW_CLOSED',
  'NOT_A_REVIEWER',
  'NOT_RESUBMITTABLE',
  'BAD_MODE',
  'BAD_PRIORITY',
  'BAD_BUCKET',
  'BAD_DECISION',
  'BAD_DECISIONS',
  'COMMENT_REQUIRED',
  'ITEM_NOT_OWED',
  'ITEM_NOT_FOUND',
  'ITEM_NEEDS_NEW_VERSION',
  'DUPLICATE_ITEM',
  'DUPLICATE_FILE',
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
  'PDF_EXISTS',
  'REVIEW_NOT_OPEN',
  'LAST_ITEM',
  'WORKFLOWS_DISABLED',
  'NOT_APPROVED',
  'UNKNOWN',
]

/**
 * A review outcome from either vocabulary: the RPCs' (`open`, `changes_requested`) or the raw
 * `reviews.status` a Realtime payload carries (`pending`, `kicked_back`).
 */
export function reviewOutcomeFromStatus(status: unknown): ReviewOutcome {
  if (status === 'pending') return 'open'
  if (status === 'kicked_back') return 'changes_requested'
  return oneOf(status, OUTCOMES, 'open')
}

/** Whether an item decision needs a comment (every decision except a plain approval). */
export function decisionNeedsComment(decision: ReviewDecision): boolean {
  return decision !== 'approved'
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** The PostgREST error shape supabase-js returns. */
export interface RpcErrorLike {
  message: string
  code?: string | null
  details?: string | null
  hint?: string | null
}

/** A refused or failed review RPC. `code` is the RPC's own reason (its `hint`), when it gave one. */
export class ReviewRpcError extends Error {
  readonly code: ReviewErrorCode
  /** Postgres SQLSTATE, e.g. 42501 for a refusal. */
  readonly sqlState: string | null
  /** The id the RPC named as the culprit (an item, version or user), when it named one. */
  readonly subjectId: string | null

  constructor(message: string, code: ReviewErrorCode, sqlState: string | null, subjectId: string | null) {
    super(message)
    this.name = 'ReviewRpcError'
    this.code = code
    this.sqlState = sqlState
    this.subjectId = subjectId
  }
}

export function toReviewRpcError(error: RpcErrorLike): ReviewRpcError {
  const code = oneOf(error.hint ?? undefined, ERROR_CODES, 'UNKNOWN')
  const details = typeof error.details === 'string' && error.details.trim() !== '' ? error.details.trim() : null
  return new ReviewRpcError(error.message || 'Review request failed', code, error.code ?? null, details)
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function trimmedOrNull(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

export function requestReviewArgs(input: RequestReviewInput) {
  return {
    p_file_version_ids: Array.from(new Set(input.fileVersionIds)),
    p_reviewer_ids: Array.from(new Set(input.reviewerIds ?? [])),
    p_team_ids: Array.from(new Set(input.teamIds ?? [])),
    p_title: trimmedOrNull(input.title),
    p_message: trimmedOrNull(input.message),
    p_mode: input.mode ?? 'all',
    p_priority: input.priority ?? 'normal',
    p_due_date: trimmedOrNull(input.dueDate),
  }
}

export function decisionsArg(decisions: ItemDecisionInput[]): Json {
  return decisions.map((d) => ({
    item_id: d.itemId,
    decision: d.decision,
    comment: trimmedOrNull(d.comment),
  }))
}

export function resubmitItemsArg(items: ResubmitItemInput[]): Json {
  return items.map((i) => ({ item_id: i.itemId, file_version_id: i.fileVersionId }))
}

/** `dueDate: null` means clear; an absent `dueDate` leaves the date unchanged. */
export function reviewMetaArgs(reviewId: string, patch: ReviewMetaPatch) {
  const hasDue = Object.prototype.hasOwnProperty.call(patch, 'dueDate')
  const due = hasDue ? trimmedOrNull(patch.dueDate) : null
  return {
    p_review_id: reviewId,
    p_priority: patch.priority ?? null,
    p_due_date: due,
    p_clear_due_date: hasDue && due === null,
  }
}

export function reviewQueueArgs(query: ReviewQueueQuery) {
  return {
    p_bucket: query.bucket,
    p_team_id: query.teamId ?? null,
    p_search: trimmedOrNull(query.search),
    p_limit: query.limit ?? 50,
    p_cursor: query.cursor ?? null,
  }
}

export function versionReferencesArg(refs: VersionReferenceInput[]): Json {
  return refs.map((r) => ({
    child_file_id: r.childFileId ?? null,
    child_content_hash: trimmedOrNull(r.childContentHash),
    child_path: trimmedOrNull(r.childPath),
    configuration: r.configuration ?? null,
    reference_type: r.referenceType ?? 'component',
    quantity: r.quantity ?? 1,
  }))
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export function mapReviewUser(v: unknown): ReviewUser | null {
  if (!isObj(v) || typeof v.id !== 'string') return null
  return {
    id: v.id,
    email: str(v.email),
    fullName: strOrNull(v.full_name),
    avatarUrl: strOrNull(v.avatar_url),
  }
}

export function mapRequestReviewResult(v: unknown): RequestReviewResult {
  const o = obj(v)
  return {
    reviewId: str(o.review_id),
    itemCount: num(o.item_count),
    reviewerIds: arr(o.reviewer_ids).filter((x): x is string => typeof x === 'string'),
    skipped: arr(o.skipped).map((s) => {
      const so = obj(s)
      return { userId: str(so.user_id), reason: oneOf(so.reason, SKIP_REASONS, 'no_vault_access') }
    }),
  }
}

export function mapRespondResult(v: unknown): RespondResult {
  const o = obj(v)
  return {
    reviewId: str(o.review_id),
    decided: num(o.decided),
    status: reviewOutcomeFromStatus(o.status),
    owedRemaining: num(o.owed_remaining),
  }
}

export function mapResubmitResult(v: unknown): ResubmitResult {
  const o = obj(v)
  return {
    reviewId: str(o.review_id),
    round: num(o.round),
    itemsToReview: num(o.items_to_review),
    carriedForward: num(o.carried_forward),
  }
}

export function mapCancelResult(v: unknown): CancelResult {
  return { reviewId: str(obj(v).review_id), status: 'cancelled' }
}

export function mapReviewMetaResult(v: unknown): ReviewMetaResult {
  const o = obj(v)
  return {
    reviewId: str(o.review_id),
    priority: oneOf(o.priority, REVIEW_PRIORITIES, 'normal'),
    dueDate: strOrNull(o.due_date),
  }
}

function mapPreview(v: unknown): ReviewQueuePreview | null {
  if (!isObj(v) || typeof v.file_id !== 'string') return null
  return {
    fileId: v.file_id,
    fileName: str(v.file_name),
    extension: strOrNull(v.extension),
    fileVersionId: strOrNull(v.file_version_id),
    version: numOrNull(v.version),
    revision: strOrNull(v.revision),
  }
}

function mapGate(v: unknown): GateReviewSummary | null {
  if (!isObj(v) || typeof v.pending_review_id !== 'string') return null
  return {
    pendingReviewId: v.pending_review_id,
    fileId: str(v.file_id),
    fileName: str(v.file_name),
    filePath: str(v.file_path),
    gateId: str(v.gate_id),
    gateName: str(v.gate_name),
    gateType: strOrNull(v.gate_type),
    transitionId: str(v.transition_id),
    transitionName: strOrNull(v.transition_name),
    fromStateName: strOrNull(v.from_state_name),
    toStateName: strOrNull(v.to_state_name),
    checklistItems: toJson(v.checklist_items ?? []),
  }
}

export function mapQueueRow(v: unknown): ReviewQueueRow {
  const o = obj(v)
  return {
    kind: oneOf(o.kind, QUEUE_KINDS, 'package'),
    id: str(o.id),
    title: str(o.title),
    status: reviewOutcomeFromStatus(o.status),
    priority: oneOf(o.priority, REVIEW_PRIORITIES, 'normal'),
    dueDate: strOrNull(o.due_date),
    overdue: bool(o.overdue),
    mode: oneOfOrNull(o.mode, REVIEW_MODES),
    round: numOrNull(o.round),
    requestedBy: mapReviewUser(o.requested_by),
    requestedAt: strOrNull(o.requested_at),
    completedAt: strOrNull(o.completed_at),
    teamId: strOrNull(o.team_id),
    itemCount: num(o.item_count),
    itemsDecided: num(o.items_decided),
    itemsOwedByMe: num(o.items_owed_by_me),
    preview: mapPreview(o.preview),
    gate: mapGate(o.gate),
    cursor: str(o.cursor),
  }
}

export function mapQueuePage(v: unknown): ReviewQueuePage {
  const o = obj(v)
  return {
    rows: arr(o.rows).map(mapQueueRow),
    nextCursor: strOrNull(o.next_cursor),
  }
}

function mapHeader(v: unknown): ReviewHeader {
  const o = obj(v)
  return {
    id: str(o.id),
    title: str(o.title),
    rawTitle: strOrNull(o.raw_title),
    message: strOrNull(o.message),
    status: reviewOutcomeFromStatus(o.status),
    priority: oneOf(o.priority, REVIEW_PRIORITIES, 'normal'),
    dueDate: strOrNull(o.due_date),
    overdue: bool(o.overdue),
    mode: oneOf(o.mode, REVIEW_MODES, 'all'),
    currentRound: num(o.current_round, 1),
    teamId: strOrNull(o.team_id),
    requestedBy: mapReviewUser(o.requested_by),
    requestedAt: strOrNull(o.requested_at),
    completedAt: strOrNull(o.completed_at),
    cancelledBy: mapReviewUser(o.cancelled_by),
    cancelledAt: strOrNull(o.cancelled_at),
    cancelReason: strOrNull(o.cancel_reason),
  }
}

function mapItemDecision(v: unknown): ReviewItemDecision {
  const o = obj(v)
  return {
    reviewerId: str(o.reviewer_id),
    decision: oneOf(o.decision, REVIEW_DECISIONS, 'approved'),
    comment: strOrNull(o.comment),
    decidedAt: str(o.decided_at),
    legacy: bool(o.legacy),
  }
}

function mapItemRound(v: unknown): ReviewItemRound {
  const o = obj(v)
  return {
    roundNumber: num(o.round_number, 1),
    fileVersionId: str(o.file_version_id),
    version: numOrNull(o.version),
    revision: strOrNull(o.revision),
    carriedForward: bool(o.carried_forward),
    outcome: oneOf(o.outcome, ITEM_OUTCOMES, 'pending'),
    decidedAt: strOrNull(o.decided_at),
    decisions: arr(o.decisions).map(mapItemDecision),
  }
}

/** A `drawing_pdf_renders` row, or the `pdf` object of a detail item (which omits the ids). */
export function mapDrawingPdf(v: unknown, fallbackIds?: { fileVersionId: string; fileId: string }): DrawingPdf | null {
  if (!isObj(v) || typeof v.storage_hash !== 'string') return null
  return {
    fileVersionId: str(v.file_version_id, fallbackIds?.fileVersionId ?? ''),
    fileId: str(v.file_id, fallbackIds?.fileId ?? ''),
    storageHash: v.storage_hash,
    fileSize: num(v.file_size),
    closureExact: boolOrNull(v.closure_exact),
    generatedBy: strOrNull(v.generated_by),
    generatedAt: str(v.generated_at),
  }
}

function mapItem(v: unknown): ReviewItemDetail {
  const o = obj(v)
  const file = obj(o.file)
  const version = obj(o.version)
  const fileId = str(o.file_id)
  const fileVersionId = str(version.file_version_id)
  return {
    id: str(o.id),
    fileId,
    vaultId: strOrNull(o.vault_id),
    sortOrder: num(o.sort_order),
    outcome: oneOf(o.outcome, ITEM_OUTCOMES, 'pending'),
    addedInRound: num(o.added_in_round, 1),
    file: {
      fileName: str(file.file_name),
      filePath: str(file.file_path),
      extension: strOrNull(file.extension),
      partNumber: strOrNull(file.part_number),
      description: strOrNull(file.description),
      latestVersion: numOrNull(file.latest_version),
      deleted: bool(file.deleted),
    },
    version: {
      fileVersionId,
      version: num(version.version),
      revision: strOrNull(version.revision),
      contentHash: str(version.content_hash),
      fileSize: num(version.file_size),
      state: strOrNull(version.state),
      createdAt: strOrNull(version.created_at),
      createdBy: strOrNull(version.created_by),
      referencesRecorded: bool(version.references_recorded),
    },
    pdf: mapDrawingPdf(o.pdf, { fileVersionId, fileId }),
    rounds: arr(o.rounds).map(mapItemRound),
  }
}

function mapRound(v: unknown): ReviewRound {
  const o = obj(v)
  return {
    roundNumber: num(o.round_number, 1),
    openedBy: strOrNull(o.opened_by),
    openedAt: str(o.opened_at),
    note: strOrNull(o.note),
    closedAt: strOrNull(o.closed_at),
    outcome: oneOfOrNull(o.outcome, ROUND_OUTCOMES),
  }
}

function mapReviewer(v: unknown): ReviewerAssignment {
  const o = obj(v)
  return {
    user: mapReviewUser(o.user),
    roundNumber: num(o.round_number, 1),
    status: o.status === 'kicked_back' ? 'changes_requested' : oneOf(o.status, REVIEWER_STATUSES, 'pending'),
    viaTeamId: strOrNull(o.via_team_id),
    respondedAt: strOrNull(o.responded_at),
    withdrawnReason: oneOfOrNull(o.withdrawn_reason, WITHDRAWN_REASONS),
  }
}

function mapMe(v: unknown): ReviewViewerContext {
  const o = obj(v)
  return {
    userId: str(o.user_id),
    isRequester: bool(o.is_requester),
    isReviewer: bool(o.is_reviewer),
    isAdmin: bool(o.is_admin),
    owedItemIds: arr(o.owed_item_ids).filter((x): x is string => typeof x === 'string'),
    canRespond: bool(o.can_respond),
    canCancel: bool(o.can_cancel),
    canResubmit: bool(o.can_resubmit),
    canEditMeta: bool(o.can_edit_meta),
  }
}

export function mapReviewDetail(v: unknown): ReviewDetail {
  const o = obj(v)
  return {
    review: mapHeader(o.review),
    items: arr(o.items).map(mapItem),
    rounds: arr(o.rounds).map(mapRound),
    reviewers: arr(o.reviewers).map(mapReviewer),
    me: mapMe(o.me),
  }
}

export function mapClosureRow(v: unknown): DependencyClosureRow {
  const o = obj(v)
  return {
    depth: num(o.depth),
    parentVersionId: strOrNull(o.parent_version_id),
    fileId: strOrNull(o.file_id),
    fileVersionId: strOrNull(o.file_version_id),
    referencePath: strOrNull(o.reference_path),
    configuration: strOrNull(o.configuration),
    referenceType: oneOfOrNull(o.reference_type, REFERENCE_TYPES),
    quantity: num(o.quantity, 1),
    exact: bool(o.exact),
    edgeSource: oneOf(o.edge_source, EDGE_SOURCES, 'fallback'),
    missing: bool(o.missing),
    version: numOrNull(o.version),
    revision: strOrNull(o.revision),
    contentHash: strOrNull(o.content_hash),
    fileSize: numOrNull(o.file_size),
    fileName: strOrNull(o.file_name),
    filePath: strOrNull(o.file_path),
    extension: strOrNull(o.extension),
    vaultId: strOrNull(o.vault_id),
    deleted: bool(o.deleted),
  }
}

export function mapClosureRows(v: unknown): DependencyClosureRow[] {
  return arr(v).map(mapClosureRow)
}

export function mapRecordDrawingPdfResult(v: unknown): RecordDrawingPdfResult {
  const o = obj(v)
  return { recorded: bool(o.recorded), replaced: bool(o.replaced), storageHash: str(o.storage_hash) }
}

export function mapRecordVersionReferencesResult(v: unknown): RecordVersionReferencesResult {
  const o = obj(v)
  return {
    written: num(o.written),
    exact: num(o.exact),
    approximate: num(o.approximate),
    unresolved: num(o.unresolved),
  }
}

// ============================================
// Open reviews: add / remove files (schema 110)
// ============================================

export function mapOpenReviewsForFiles(v: unknown): OpenReviewForFiles[] {
  return arr(v)
    .filter(isObj)
    .map((o) => ({
      reviewId: str(o.review_id),
      title: str(o.title),
      outcome: reviewOutcomeFromStatus(o.status),
      itemCount: num(o.item_count),
      requestedByMe: bool(o.requested_by_me),
      canAdd: bool(o.can_add),
      containedFileIds: arr(o.contained_file_ids).filter(
        (id): id is string => typeof id === 'string',
      ),
    }))
}

export function mapAddReviewItemsResult(v: unknown): AddReviewItemsResult {
  const o = obj(v)
  return { reviewId: str(o.review_id), added: num(o.added) }
}

export function mapRemoveReviewItemsResult(v: unknown): RemoveReviewItemsResult {
  const o = obj(v)
  return {
    reviewId: str(o.review_id),
    removed: num(o.removed),
    outcome: reviewOutcomeFromStatus(o.status),
  }
}

// ============================================
// Review stages (schema 110)
// ============================================

const STAGE_SKIP_REASONS: readonly ReviewStageSkipReason[] = [
  'not_approved',
  'deleted',
  'not_in_review_stage',
  'changed_since_review',
  'checked_out',
  'no_next_stage',
  'gated',
  'checkout_required',
  'transition_failed',
]

export function mapAdvanceReviewedFilesResult(v: unknown): AdvanceReviewedFilesResult {
  const o = obj(v)
  return {
    moved: num(o.moved),
    skipped: arr(o.skipped)
      .filter(isObj)
      .map((s) => ({
        itemId: str(s.item_id),
        fileId: str(s.file_id),
        fileName: str(s.file_name),
        reason: oneOf(s.reason, STAGE_SKIP_REASONS, 'transition_failed'),
      })),
  }
}

export function mapReviewWorkflowStatus(v: unknown): ReviewWorkflowStatus {
  const o = obj(v)
  return {
    // Absent means on, as on the server.
    workflowsEnabled: o.workflows_enabled !== false,
    onApproval: oneOf(o.on_approval, ['hold', 'advance'] as const, 'hold'),
    packagePolicy: oneOf(o.package_policy, ['together', 'approved_only'] as const, 'together'),
    items: arr(o.items)
      .filter(isObj)
      .map((i) => ({
        itemId: str(i.item_id),
        fileId: str(i.file_id),
        outcome: oneOf(i.outcome, ITEM_OUTCOMES, 'pending'),
        stateName: strOrNull(i.state_name),
        stateColor: strOrNull(i.state_color),
        inReviewStage: bool(i.in_review_stage),
        nextStateName: strOrNull(i.next_state_name),
        advancedAt: strOrNull(i.advanced_at),
        advancedToStateName: strOrNull(i.advanced_to_state_name),
      })),
  }
}
