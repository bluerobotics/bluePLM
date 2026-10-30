// Pure rules behind the Reviews section: queue filters, who owes what, decision validation, what
// the viewer can show for an item, due chips and resubmit planning. No React, no Supabase, so all
// of it is unit-tested (reviewLogic.test.ts).
//
// The server is the authority on every rule here (review_owed_item_ids, respond_to_review_items,
// resubmit_review, complete_gate_review). These mirrors only decide what the page offers; a write
// the server refuses still shows its error.
import type {
  ResubmitItemInput,
  ReviewDecision,
  ReviewDetail,
  ReviewerAssignment,
  ReviewItemDetail,
  ReviewPriority,
  ReviewQueueBucket,
  ReviewQueueRow,
  ReviewUser,
} from '@/types/reviews'

// ---------------------------------------------------------------------------
// Queue filters
// ---------------------------------------------------------------------------

export const QUEUE_BUCKETS: readonly ReviewQueueBucket[] = ['awaiting_me', 'requested_by_me', 'my_teams', 'done']

/** The `?filter=` query value as a bucket; anything unknown is the default, waiting on me. */
export function parseBucket(value: string | null | undefined): ReviewQueueBucket {
  return (QUEUE_BUCKETS as readonly string[]).includes(value ?? '') ? (value as ReviewQueueBucket) : 'awaiting_me'
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export const DECISIONS: readonly ReviewDecision[] = [
  'approved',
  'approved_with_comments',
  'changes_requested',
  'rejected',
]

/** Every decision but a plain approval needs a comment (the server raises COMMENT_REQUIRED). */
export function decisionNeedsComment(decision: ReviewDecision): boolean {
  return decision !== 'approved'
}

export type DecisionCheck = { ok: true; comment: string | null } | { ok: false; reason: 'comment_required' }

/** Validate one decision before sending it; the comment is trimmed, an empty one is null. */
export function validateDecision(decision: ReviewDecision, comment: string | null | undefined): DecisionCheck {
  const trimmed = comment?.trim() ?? ''
  if (decisionNeedsComment(decision) && !trimmed) return { ok: false, reason: 'comment_required' }
  return { ok: true, comment: trimmed || null }
}

export type GateDecision = 'approved' | 'kicked_back' | 'rejected'

export const GATE_DECISIONS: readonly GateDecision[] = ['approved', 'kicked_back', 'rejected']

/** Gate reviews: kick back and reject need a comment, as package decisions do. */
export function validateGateDecision(decision: GateDecision, comment: string | null | undefined): DecisionCheck {
  const trimmed = comment?.trim() ?? ''
  if (decision !== 'approved' && !trimmed) return { ok: false, reason: 'comment_required' }
  return { ok: true, comment: trimmed || null }
}

/** The jsonb `complete_gate_review` returns; every field is optional on the wire. */
export interface GateDecisionResult {
  success: boolean
  newStateName: string | null
  errorMessage: string | null
}

export function readGateDecisionResult(value: unknown): GateDecisionResult {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    success: raw.success === true,
    newStateName: typeof raw.new_state_name === 'string' ? raw.new_state_name : null,
    errorMessage: typeof raw.error_message === 'string' ? raw.error_message : null,
  }
}

// ---------------------------------------------------------------------------
// Who owes what
// ---------------------------------------------------------------------------

/** Reviewers of the current round who have not been withdrawn (schema 108). */
export function activeReviewers(detail: ReviewDetail): ReviewerAssignment[] {
  return detail.reviewers.filter(
    (r) => r.roundNumber === detail.review.currentRound && r.withdrawnReason === null,
  )
}

/** Reviewers of the current round who were withdrawn: they left the org or lost vault access. */
export function withdrawnReviewers(detail: ReviewDetail): ReviewerAssignment[] {
  return detail.reviewers.filter(
    (r) => r.roundNumber === detail.review.currentRound && r.withdrawnReason !== null,
  )
}

/**
 * User ids that still owe a decision on an item, mirroring `review_owed_item_ids`: the review is
 * open, the item is reviewed (not carried forward) in the current round and still pending there,
 * the reviewer is assigned to the round and not withdrawn, and has not decided it yet.
 */
export function whoOwesItem(detail: ReviewDetail, item: ReviewItemDetail): string[] {
  if (detail.review.status !== 'open') return []
  const round = item.rounds.find((r) => r.roundNumber === detail.review.currentRound)
  if (!round || round.carriedForward || round.outcome !== 'pending') return []
  const decided = new Set(round.decisions.map((d) => d.reviewerId))
  return activeReviewers(detail)
    .map((r) => r.user?.id)
    .filter((id): id is string => !!id && !decided.has(id))
}

/** Per item, who still owes it; items nobody owes are left out. */
export function owedByItem(detail: ReviewDetail): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const item of detail.items) {
    const owers = whoOwesItem(detail, item)
    if (owers.length > 0) out[item.id] = owers
  }
  return out
}

/** Every user the detail names, by id, so decisions can show a name. */
export function usersById(detail: ReviewDetail): Map<string, ReviewUser> {
  const map = new Map<string, ReviewUser>()
  const add = (user: ReviewUser | null) => {
    if (user) map.set(user.id, user)
  }
  add(detail.review.requestedBy)
  add(detail.review.cancelledBy)
  for (const r of detail.reviewers) add(r.user)
  return map
}

export function displayName(user: ReviewUser | null | undefined): string | null {
  if (!user) return null
  return user.fullName?.trim() || user.email || null
}

/** Whether "approve all remaining" applies: the viewer can respond and owes at least one item. */
export function canApproveAll(detail: ReviewDetail): boolean {
  return detail.me.canRespond && detail.me.owedItemIds.length > 0
}

// ---------------------------------------------------------------------------
// What the viewer shows for an item
// ---------------------------------------------------------------------------

export type ItemPreviewPlan =
  /** The item is itself a PDF: show the pinned version's content. */
  | { kind: 'pdfFile'; storageHash: string }
  /** A drawing with a stored render. */
  | { kind: 'render'; storageHash: string }
  /** A drawing without a render yet: generated from the desktop app. */
  | { kind: 'pending' }
  | { kind: 'unsupported' }

export function isDrawingName(name: string): boolean {
  return /\.slddrw$/i.test(name)
}

export function isPdfName(name: string): boolean {
  return /\.pdf$/i.test(name)
}

/** A content hash safe to put in a storage path: letters and digits only. */
export function isStorageHash(value: string): boolean {
  return /^[A-Za-z0-9]{16,128}$/.test(value)
}

/** Same rule as the desktop's `resolveReviewItemPreview`, for the pinned version. */
export function planItemPreview(item: ReviewItemDetail): ItemPreviewPlan {
  const name = item.file.fileName || item.file.filePath
  if (isPdfName(name)) {
    return isStorageHash(item.version.contentHash)
      ? { kind: 'pdfFile', storageHash: item.version.contentHash }
      : { kind: 'unsupported' }
  }
  if (!isDrawingName(name)) return { kind: 'unsupported' }
  if (!item.pdf) return { kind: 'pending' }
  return isStorageHash(item.pdf.storageHash) ? { kind: 'render', storageHash: item.pdf.storageHash } : { kind: 'unsupported' }
}

/**
 * Storage paths to try for a content hash in the `vault` bucket: the sharded layout first, then the
 * legacy flat one (src/lib/storage.ts). Empty when the input is not a valid hash or org id.
 */
export function vaultStoragePaths(orgId: string, hash: string): string[] {
  if (!orgId || /[/\\]/.test(orgId) || !isStorageHash(hash)) return []
  return [`${orgId}/${hash.slice(0, 2)}/${hash}`, `${orgId}/${hash}`]
}

// ---------------------------------------------------------------------------
// Dates and chips (date-only due dates, never parsed as UTC instants)
// ---------------------------------------------------------------------------

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000
export const DUE_SOON_DAYS = 2

export function localDateString(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isDateOnly(value: string | null | undefined): boolean {
  return !!value && DATE_ONLY.test(value)
}

export function daysBetween(today: string, due: string): number | null {
  const a = DATE_ONLY.exec(today)
  const b = DATE_ONLY.exec(due)
  if (!a || !b) return null
  const ta = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
  const tb = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
  return Math.round((tb - ta) / MS_PER_DAY)
}

/** A `YYYY-MM-DD` date formatted for display without shifting it a day. */
export function formatDateOnly(value: string | null | undefined, locale?: string): string {
  const match = value ? DATE_ONLY.exec(value) : null
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later'

export interface DueChip {
  tone: DueTone
  days: number
}

/** Either the server's `overdue` or the local calendar saying overdue wins. */
export function dueChip(dueDate: string | null, today: string, serverOverdue = false): DueChip | null {
  if (!dueDate) return null
  const days = daysBetween(today, dueDate)
  if (days === null) return null
  if (days < 0 || serverOverdue) return { tone: 'overdue', days: Math.min(days, -1) }
  if (days === 0) return { tone: 'today', days }
  if (days <= DUE_SOON_DAYS) return { tone: 'soon', days }
  return { tone: 'later', days }
}

export function isOpenStatus(status: string): boolean {
  return status === 'open' || status === 'changes_requested'
}

export interface QueueRowChips {
  due: DueChip | null
  /** `normal` shows nothing. */
  priority: ReviewPriority | null
  progress: { decided: number; total: number } | null
}

export function queueRowChips(row: ReviewQueueRow, today: string): QueueRowChips {
  const open = isOpenStatus(row.status)
  return {
    due: open ? dueChip(row.dueDate, today, row.overdue) : null,
    priority: open && row.priority !== 'normal' ? row.priority : null,
    progress: row.kind === 'package' ? { decided: row.itemsDecided, total: row.itemCount } : null,
  }
}

// ---------------------------------------------------------------------------
// Resubmit (server rule: every item not approved moves to a newer version)
// ---------------------------------------------------------------------------

export interface VersionOption {
  fileVersionId: string
  version: number
  revision: string | null
  createdAt: string | null
}

export function itemsNeedingNewVersion(items: readonly ReviewItemDetail[]): ReviewItemDetail[] {
  return items.filter((item) => item.outcome !== 'approved')
}

export function newerVersionOptions(item: ReviewItemDetail, versions: readonly VersionOption[]): VersionOption[] {
  return versions.filter((v) => v.version > item.version.version).sort((a, b) => b.version - a.version)
}

export function defaultResubmitSelection(
  items: readonly ReviewItemDetail[],
  versionsByFile: Readonly<Record<string, readonly VersionOption[]>>,
): Record<string, string | null> {
  const selection: Record<string, string | null> = {}
  for (const item of itemsNeedingNewVersion(items)) {
    selection[item.id] = newerVersionOptions(item, versionsByFile[item.fileId] ?? [])[0]?.fileVersionId ?? null
  }
  return selection
}

export interface ResubmitPlan {
  ready: boolean
  missing: string[]
  payload: ResubmitItemInput[]
}

export function planResubmit(
  items: readonly ReviewItemDetail[],
  selection: Readonly<Record<string, string | null>>,
): ResubmitPlan {
  const missing: string[] = []
  const payload: ResubmitItemInput[] = []
  for (const item of itemsNeedingNewVersion(items)) {
    const fileVersionId = selection[item.id]
    if (!fileVersionId || fileVersionId === item.version.fileVersionId) missing.push(item.id)
    else payload.push({ itemId: item.id, fileVersionId })
  }
  return { ready: missing.length === 0 && payload.length > 0, missing, payload }
}

// ---------------------------------------------------------------------------
// Requesting a review
// ---------------------------------------------------------------------------

/** The server's cap on items per review (TOO_MANY_ITEMS). */
export const MAX_REVIEW_ITEMS = 500

export type RequestBlocker = 'no_items' | 'no_reviewers' | 'too_many_items'

/** What stops a request from being sent, in the order the dialog shows them. */
export function requestBlockers(itemCount: number, reachedReviewerCount: number): RequestBlocker[] {
  const out: RequestBlocker[] = []
  if (itemCount === 0) out.push('no_items')
  if (itemCount > MAX_REVIEW_ITEMS) out.push('too_many_items')
  if (reachedReviewerCount === 0) out.push('no_reviewers')
  return out
}

/**
 * Split the ids the dialog was given into file ids and file version ids. A version id is kept as
 * is; a file id is resolved to its latest checked-in version by the caller.
 */
export function splitRequestTargets(input: { fileIds?: readonly string[]; fileVersionIds?: readonly string[] }): {
  fileIds: string[]
  fileVersionIds: string[]
} {
  return {
    fileIds: Array.from(new Set(input.fileIds ?? [])),
    fileVersionIds: Array.from(new Set(input.fileVersionIds ?? [])),
  }
}
