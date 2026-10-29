/**
 * Canonical types for drawing reviews (schema 107).
 *
 * A review is a package of items, each a file pinned to a `file_versions` row. It runs in rounds;
 * in each round every assigned reviewer decides every item they owe (mode `all`), or the first
 * decision on an item stands (mode `any`). Everything is written by SECURITY DEFINER RPCs in
 * `supabase/modules/20-change-control.sql`; `src/lib/supabase/reviews.ts` wraps them and maps
 * their snake_case JSON to these shapes (`reviewMapping.ts`).
 *
 * Gate reviews (workflow transitions) are a different contract and keep their own RPCs; the queue
 * lists them beside package reviews as `kind: 'gate'` rows.
 */

import type { Json } from './supabase'

export type ReviewPriority = 'low' | 'normal' | 'high' | 'urgent'

/** `all`: every reviewer decides every item. `any`: the first decision on an item stands. */
export type ReviewMode = 'all' | 'any'

/**
 * Review outcome as the RPCs report it. `open` is waiting on reviewers; `changes_requested` is
 * waiting on the requester to resubmit. (The table stores `pending` / `kicked_back` for these.)
 */
export type ReviewOutcome = 'open' | 'approved' | 'changes_requested' | 'rejected' | 'cancelled'

/** One reviewer's decision on one item. A comment is required for all but `approved`. */
export type ReviewDecision = 'approved' | 'approved_with_comments' | 'changes_requested' | 'rejected'

export type ReviewItemOutcome = 'pending' | 'approved' | 'changes_requested' | 'rejected'

export type ReviewRoundOutcome = 'approved' | 'changes_requested' | 'rejected' | 'cancelled'

/** A reviewer's summary for one round. `cancelled`: the round or review ended without them. */
export type ReviewerRoundStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected' | 'cancelled'

export type ReviewQueueBucket = 'awaiting_me' | 'requested_by_me' | 'my_teams' | 'done'

export type ReviewQueueKind = 'package' | 'gate'

/** `notifications.type` values the review RPCs write (entity_type = 'review', entity_id = review id). */
export type ReviewNotificationType =
  | 'review_request'
  | 'review_decision'
  | 'review_round'
  | 'review_approved'
  | 'review_kicked_back'
  | 'review_rejected'
  | 'review_completed'
  | 'review_cancelled'
  | 'review_overdue'

/**
 * Error codes the review RPCs raise (PostgREST `hint`). `UNKNOWN` covers anything without one,
 * such as a network failure or an older schema.
 */
export type ReviewErrorCode =
  | 'FORBIDDEN'
  | 'REVIEW_NOT_FOUND'
  | 'REVIEW_CLOSED'
  | 'NOT_A_REVIEWER'
  | 'NOT_RESUBMITTABLE'
  | 'BAD_MODE'
  | 'BAD_PRIORITY'
  | 'BAD_BUCKET'
  | 'BAD_DECISION'
  | 'BAD_DECISIONS'
  | 'COMMENT_REQUIRED'
  | 'ITEM_NOT_OWED'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_NEEDS_NEW_VERSION'
  | 'DUPLICATE_ITEM'
  | 'DUPLICATE_FILE'
  | 'SAME_VERSION'
  | 'VERSION_NOT_FOUND'
  | 'NO_ITEMS'
  | 'TOO_MANY_ITEMS'
  | 'NO_REVIEWERS'
  | 'NOTHING_OWED'
  | 'NOTHING_TO_RESUBMIT'
  | 'REVIEWER_NOT_FOUND'
  | 'REVIEWER_NO_VAULT_ACCESS'
  | 'TEAM_NOT_FOUND'
  | 'PDF_EXISTS'
  | 'REVIEW_NOT_OPEN'
  | 'LAST_ITEM'
  | 'WORKFLOWS_DISABLED'
  | 'NOT_APPROVED'
  | 'UNKNOWN'

export interface ReviewUser {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface RequestReviewInput {
  /** `file_versions.id` of each item. The server validates them; one per file. */
  fileVersionIds: string[]
  reviewerIds?: string[]
  /** Expanded on the server by the team's reviewer rules (all members when it has none). */
  teamIds?: string[]
  title?: string | null
  message?: string | null
  /** Default `all`. */
  mode?: ReviewMode
  /** Default `normal`. */
  priority?: ReviewPriority
  /** Calendar date `YYYY-MM-DD`, no time zone. */
  dueDate?: string | null
}

export type ReviewerSkipReason = 'requester' | 'no_vault_access'

export interface RequestReviewResult {
  reviewId: string
  itemCount: number
  reviewerIds: string[]
  /** Team members left out (named reviewers are refused instead). */
  skipped: { userId: string; reason: ReviewerSkipReason }[]
}

export interface ItemDecisionInput {
  itemId: string
  decision: ReviewDecision
  comment?: string | null
}

export interface RespondResult {
  reviewId: string
  decided: number
  status: ReviewOutcome
  /** Items the caller still owes in the current round. */
  owedRemaining: number
}

export interface ResubmitItemInput {
  itemId: string
  /** A newer version of the item's file than the one last reviewed. */
  fileVersionId: string
}

export interface ResubmitResult {
  reviewId: string
  round: number
  itemsToReview: number
  carriedForward: number
}

export interface CancelResult {
  reviewId: string
  status: 'cancelled'
}

/** `dueDate: null` clears the due date; an absent key leaves it as it is. */
export interface ReviewMetaPatch {
  priority?: ReviewPriority
  dueDate?: string | null
}

export interface ReviewMetaResult {
  reviewId: string
  priority: ReviewPriority
  dueDate: string | null
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface ReviewQueueQuery {
  bucket: ReviewQueueBucket
  teamId?: string | null
  search?: string | null
  /** 1-200, default 50. */
  limit?: number
  /** `nextCursor` of the previous page. */
  cursor?: string | null
}

export interface ReviewQueuePreview {
  fileId: string
  fileName: string
  extension: string | null
  /** Null for gate rows: a gate review is not pinned to a version. */
  fileVersionId: string | null
  version: number | null
  revision: string | null
}

export interface GateReviewSummary {
  /** `pending_reviews.id`, the argument `complete_gate_review` takes. */
  pendingReviewId: string
  fileId: string
  fileName: string
  filePath: string
  gateId: string
  gateName: string
  gateType: string | null
  transitionId: string
  transitionName: string | null
  fromStateName: string | null
  toStateName: string | null
  checklistItems: Json
}

export interface ReviewQueueRow {
  kind: ReviewQueueKind
  /** Review id for packages, `pending_reviews.id` for gates. */
  id: string
  title: string
  status: ReviewOutcome
  priority: ReviewPriority
  dueDate: string | null
  overdue: boolean
  mode: ReviewMode | null
  round: number | null
  requestedBy: ReviewUser | null
  requestedAt: string | null
  completedAt: string | null
  teamId: string | null
  itemCount: number
  itemsDecided: number
  itemsOwedByMe: number
  preview: ReviewQueuePreview | null
  gate: GateReviewSummary | null
  /** Opaque sort key; the server orders by it. */
  cursor: string
}

export interface ReviewQueuePage {
  rows: ReviewQueueRow[]
  nextCursor: string | null
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export interface ReviewHeader {
  id: string
  /** Display title: the review's own, else its first item's file name. */
  title: string
  rawTitle: string | null
  message: string | null
  status: ReviewOutcome
  priority: ReviewPriority
  dueDate: string | null
  overdue: boolean
  mode: ReviewMode
  currentRound: number
  teamId: string | null
  requestedBy: ReviewUser | null
  requestedAt: string | null
  completedAt: string | null
  cancelledBy: ReviewUser | null
  cancelledAt: string | null
  cancelReason: string | null
}

export interface ReviewItemFile {
  fileName: string
  filePath: string
  extension: string | null
  partNumber: string | null
  description: string | null
  /** `files.version` now, to show "a newer version exists". */
  latestVersion: number | null
  deleted: boolean
}

export interface ReviewPinnedVersion {
  fileVersionId: string
  version: number
  revision: string | null
  contentHash: string
  fileSize: number
  state: string | null
  createdAt: string | null
  createdBy: string | null
  /** Whether the version's references were recorded at check-in (exact closure possible). */
  referencesRecorded: boolean
}

export interface ReviewItemDecision {
  reviewerId: string
  decision: ReviewDecision
  comment: string | null
  decidedAt: string
  /** Migrated from a pre-107 review; may lack a comment. */
  legacy: boolean
}

export interface ReviewItemRound {
  roundNumber: number
  fileVersionId: string
  version: number | null
  revision: string | null
  /** Approved earlier and not re-reviewed in this round. */
  carriedForward: boolean
  outcome: ReviewItemOutcome
  decidedAt: string | null
  decisions: ReviewItemDecision[]
}

export interface DrawingPdf {
  fileVersionId: string
  fileId: string
  /** SHA-256 of the PDF; it is stored content-addressed in the vault bucket. */
  storageHash: string
  fileSize: number
  /** Whether it was rendered against exact reference versions. Null when not stated. */
  closureExact: boolean | null
  generatedBy: string | null
  generatedAt: string
}

export interface ReviewItemDetail {
  id: string
  fileId: string
  vaultId: string | null
  sortOrder: number
  outcome: ReviewItemOutcome
  addedInRound: number
  file: ReviewItemFile
  version: ReviewPinnedVersion
  pdf: DrawingPdf | null
  rounds: ReviewItemRound[]
}

export interface ReviewRound {
  roundNumber: number
  openedBy: string | null
  openedAt: string
  note: string | null
  closedAt: string | null
  outcome: ReviewRoundOutcome | null
}

export interface ReviewerAssignment {
  user: ReviewUser | null
  roundNumber: number
  status: ReviewerRoundStatus
  viaTeamId: string | null
  respondedAt: string | null
  /** Set when the reviewer was withdrawn from the round (schema 108): they left the organization or lost access to a vault the round uses. */
  withdrawnReason: ReviewerWithdrawnReason | null
}

export type ReviewerWithdrawnReason = 'left_org' | 'lost_vault_access'

export interface ReviewViewerContext {
  userId: string
  isRequester: boolean
  isReviewer: boolean
  isAdmin: boolean
  owedItemIds: string[]
  canRespond: boolean
  canCancel: boolean
  canResubmit: boolean
  canEditMeta: boolean
}

export interface ReviewDetail {
  review: ReviewHeader
  items: ReviewItemDetail[]
  rounds: ReviewRound[]
  reviewers: ReviewerAssignment[]
  me: ReviewViewerContext
}

// ---------------------------------------------------------------------------
// Version references and PDFs
// ---------------------------------------------------------------------------

export type ReferenceType = 'component' | 'derived' | 'reference'

/** How a closure edge was found: the version itself, recorded at check-in, or the pre-107 fallback. */
export type ClosureEdgeSource = 'root' | 'recorded' | 'fallback'

export interface DependencyClosureRow {
  /** 0 for the root version. */
  depth: number
  parentVersionId: string | null
  fileId: string | null
  /** Null when no child version could be resolved (`missing`). */
  fileVersionId: string | null
  /** The path the parent referenced (vault-relative for vault files). */
  referencePath: string | null
  configuration: string | null
  referenceType: ReferenceType | null
  quantity: number
  /** False for approximate edges, and below an approximate parent. */
  exact: boolean
  edgeSource: ClosureEdgeSource
  missing: boolean
  version: number | null
  revision: string | null
  contentHash: string | null
  fileSize: number | null
  fileName: string | null
  filePath: string | null
  extension: string | null
  vaultId: string | null
  deleted: boolean
}

export interface RecordDrawingPdfResult {
  /** False when the same hash was already recorded (a retry). */
  recorded: boolean
  /** True when an administrator replaced a different render. */
  replaced: boolean
  storageHash: string
}

/** One reference of a version being checked in, for `recordVersionReferences`. */
export interface VersionReferenceInput {
  /** Vault file id of the child; null/absent for a reference outside the vault. */
  childFileId?: string | null
  /** Content hash of the child on disk at check-in; matched to a child version for `exact`. */
  childContentHash?: string | null
  /** Path as referenced; defaults to the child file's vault path. Required when childFileId is absent. */
  childPath?: string | null
  configuration?: string | null
  referenceType?: ReferenceType
  quantity?: number
}

export interface RecordVersionReferencesResult {
  written: number
  exact: number
  approximate: number
  unresolved: number
}

// ============================================
// Open reviews: add / remove files (schema 110)
// ============================================

/** An open review a file selection can be added to or removed from (file context menu). */
export interface OpenReviewForFiles {
  reviewId: string
  title: string
  /** `open` while reviewers decide; `changes_requested` while it waits on a resubmit. */
  outcome: ReviewOutcome
  itemCount: number
  requestedByMe: boolean
  /** Files can be added only while the round is open. */
  canAdd: boolean
  /** Which of the asked-about files the review already holds. */
  containedFileIds: string[]
}

export interface AddReviewItemsResult {
  reviewId: string
  added: number
}

export interface RemoveReviewItemsResult {
  reviewId: string
  removed: number
  outcome: ReviewOutcome
}

// ============================================
// Review stages: workflow after a review (schema 110)
// ============================================

/** What an approved review does with files in a review stage: move them, or wait for the requester. */
export type ReviewStageOnApproval = 'hold' | 'advance'

/** A package moves as one once fully approved, or each file moves once it is approved. */
export type ReviewStagePackagePolicy = 'together' | 'approved_only'

/** Why an item did not move to its next stage. */
export type ReviewStageSkipReason =
  | 'not_approved'
  | 'deleted'
  | 'not_in_review_stage'
  | 'changed_since_review'
  | 'checked_out'
  | 'no_next_stage'
  | 'gated'
  | 'checkout_required'
  | 'transition_failed'

export interface AdvanceReviewedFilesResult {
  moved: number
  skipped: { itemId: string; fileId: string; fileName: string; reason: ReviewStageSkipReason }[]
}

/** Where one review item's file stands in its workflow. */
export interface ReviewWorkflowItem {
  itemId: string
  fileId: string
  outcome: ReviewItemOutcome
  stateName: string | null
  stateColor: string | null
  inReviewStage: boolean
  /** The stage an approval moves it to; null when the stage names no single exit. */
  nextStateName: string | null
  advancedAt: string | null
  advancedToStateName: string | null
}

export interface ReviewWorkflowStatus {
  workflowsEnabled: boolean
  onApproval: ReviewStageOnApproval
  packagePolicy: ReviewStagePackagePolicy
  items: ReviewWorkflowItem[]
}
