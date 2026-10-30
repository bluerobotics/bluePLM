/**
 * Drawing reviews: typed wrappers over the review RPCs (schema 107), plus the team helpers the
 * reviewer picker uses.
 *
 * Every write is a SECURITY DEFINER RPC that validates on the server, locks the review and writes
 * notifications in the same transaction; the review tables are SELECT-only to clients. Versions are
 * pinned on the server from `file_versions` ids - never from a cached `pdmData.version`.
 *
 * Wrappers throw `ReviewRpcError` (with the RPC's own `code`) on refusal or failure, and return the
 * canonical types from `@/types/reviews`. Shape mapping lives in `reviewMapping.ts`, which is pure
 * and unit-tested.
 */

import { getSupabaseClient } from './client'
import type { TeamMember, TeamReviewerConfig, TeamWithMembers } from './reviewTeams'
import { log } from '@/lib/logger'
import type { Json } from '@/types/supabase'
import type {
  AddReviewItemsResult,
  AdvanceReviewedFilesResult,
  CancelResult,
  DependencyClosureRow,
  DrawingPdf,
  ItemDecisionInput,
  OpenReviewForFiles,
  RecordDrawingPdfResult,
  RecordVersionReferencesResult,
  RemoveReviewItemsResult,
  RequestReviewInput,
  RequestReviewResult,
  ResubmitItemInput,
  ResubmitResult,
  RespondResult,
  ReviewDetail,
  ReviewMetaPatch,
  ReviewMetaResult,
  ReviewQueuePage,
  ReviewQueueQuery,
  ReviewWorkflowStatus,
  VersionReferenceInput,
} from '@/types/reviews'
import {
  decisionsArg,
  mapAddReviewItemsResult,
  mapAdvanceReviewedFilesResult,
  mapCancelResult,
  mapClosureRows,
  mapDrawingPdf,
  mapOpenReviewsForFiles,
  mapQueuePage,
  mapRecordDrawingPdfResult,
  mapRecordVersionReferencesResult,
  mapRemoveReviewItemsResult,
  mapRequestReviewResult,
  mapRespondResult,
  mapResubmitResult,
  mapReviewDetail,
  mapReviewMetaResult,
  mapReviewWorkflowStatus,
  requestReviewArgs,
  resubmitItemsArg,
  reviewMetaArgs,
  reviewQueueArgs,
  toReviewRpcError,
  versionReferencesArg,
  type RpcErrorLike,
} from './reviewMapping'

export { ReviewRpcError } from './reviewMapping'
export { resolveTeamReviewers, expandReviewerSelection } from './reviewTeams'
export type { TeamMember, TeamReviewerConfig, TeamWithMembers } from './reviewTeams'

// ============================================
// RPC plumbing
// ============================================

/**
 * The review RPCs are not in the generated `Database` type until `npm run gen:types` runs against
 * schema 107, so they are called through this narrow untyped view and their results are mapped
 * from `unknown`.
 */
interface UntypedRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResponse>
}

interface RpcResponse {
  data: unknown
  error: RpcErrorLike | null
}

/**
 * Run one review RPC and unwrap its result. `call` names the function and its argument object
 * literally (`c.rpc('name', { p_x: ... })`) so `rpcContract.test.ts` can check them against the SQL;
 * `fn` is the same name, for the log.
 */
async function callReviewRpc(
  fn: string,
  call: (client: UntypedRpcClient) => PromiseLike<RpcResponse>,
): Promise<unknown> {
  const client = getSupabaseClient() as unknown as UntypedRpcClient
  const { data, error } = await call(client)
  if (error) {
    const rpcError = toReviewRpcError(error)
    log.warn('[Reviews]', `${fn} failed`, {
      code: rpcError.code,
      sqlState: rpcError.sqlState,
      message: rpcError.message,
    })
    throw rpcError
  }
  return data
}

function trimmedOrNull(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

// ============================================
// Writes
// ============================================

/** Ask for a review of a package of file versions. */
export async function requestReview(input: RequestReviewInput): Promise<RequestReviewResult> {
  const a = requestReviewArgs(input)
  return mapRequestReviewResult(
    await callReviewRpc('review_request', (c) =>
      c.rpc('review_request', {
        p_file_version_ids: a.p_file_version_ids,
        p_reviewer_ids: a.p_reviewer_ids,
        p_team_ids: a.p_team_ids,
        p_title: a.p_title,
        p_message: a.p_message,
        p_mode: a.p_mode,
        p_priority: a.p_priority,
        p_due_date: a.p_due_date,
      }),
    ),
  )
}

/** Record the caller's decisions on items they owe in the current round. All or nothing. */
export async function respondToItems(
  reviewId: string,
  decisions: ItemDecisionInput[],
): Promise<RespondResult> {
  return mapRespondResult(
    await callReviewRpc('review_item_respond', (c) =>
      c.rpc('review_item_respond', {
        p_review_id: reviewId,
        p_decisions: decisionsArg(decisions),
      }),
    ),
  )
}

/** Approve every item the caller still owes; a comment makes them `approved_with_comments`. */
export async function approveAllRemaining(
  reviewId: string,
  comment?: string | null,
): Promise<RespondResult> {
  return mapRespondResult(
    await callReviewRpc('review_approve_all_remaining', (c) =>
      c.rpc('review_approve_all_remaining', {
        p_review_id: reviewId,
        p_comment: trimmedOrNull(comment),
      }),
    ),
  )
}

/**
 * Open the next round. Every item that needs changes or was rejected must be listed at a newer
 * version; approved items not listed carry forward.
 */
export async function resubmitReview(
  reviewId: string,
  items: ResubmitItemInput[],
  note?: string | null,
): Promise<ResubmitResult> {
  return mapResubmitResult(
    await callReviewRpc('review_resubmit', (c) =>
      c.rpc('review_resubmit', {
        p_review_id: reviewId,
        p_items: resubmitItemsArg(items),
        p_note: trimmedOrNull(note),
      }),
    ),
  )
}

/** Cancel an open review (requester or administrator). */
export async function cancelReview(
  reviewId: string,
  reason?: string | null,
): Promise<CancelResult> {
  return mapCancelResult(
    await callReviewRpc('review_cancel', (c) =>
      c.rpc('review_cancel', {
        p_review_id: reviewId,
        p_reason: trimmedOrNull(reason),
      }),
    ),
  )
}

/**
 * Open reviews the caller requested (an administrator also sees every open review holding one of
 * the files), with which of `fileIds` each already holds. Feeds Reviews > Add to / Remove from.
 */
export async function listOpenReviewsForFiles(fileIds: string[]): Promise<OpenReviewForFiles[]> {
  return mapOpenReviewsForFiles(
    await callReviewRpc('review_list_open_for_files', (c) =>
      c.rpc('review_list_open_for_files', { p_file_ids: fileIds }),
    ),
  )
}

/** Add file versions to a review whose round is open; reviewers owe a decision on them. */
export async function addReviewItems(
  reviewId: string,
  fileVersionIds: string[],
): Promise<AddReviewItemsResult> {
  return mapAddReviewItemsResult(
    await callReviewRpc('review_item_add', (c) =>
      c.rpc('review_item_add', { p_review_id: reviewId, p_file_version_ids: fileVersionIds }),
    ),
  )
}

/** Take files out of an open review. Refuses to remove the last one (`LAST_ITEM`). */
export async function removeReviewItems(
  reviewId: string,
  fileIds: string[],
): Promise<RemoveReviewItemsResult> {
  return mapRemoveReviewItemsResult(
    await callReviewRpc('review_item_remove', (c) =>
      c.rpc('review_item_remove', { p_review_id: reviewId, p_file_ids: fileIds }),
    ),
  )
}

/** Where each item's file stands in its workflow, with the organization's review-stage settings. */
export async function getReviewWorkflowStatus(reviewId: string): Promise<ReviewWorkflowStatus> {
  return mapReviewWorkflowStatus(
    await callReviewRpc('review_get_workflow_status', (c) =>
      c.rpc('review_get_workflow_status', { p_review_id: reviewId }),
    ),
  )
}

/**
 * Move reviewed files out of their review stage. `onlyApproved: false` moves the whole package and
 * needs the review approved; `true` moves the approved files and leaves the rest.
 */
export async function advanceReviewedFiles(
  reviewId: string,
  onlyApproved: boolean,
): Promise<AdvanceReviewedFilesResult> {
  return mapAdvanceReviewedFilesResult(
    await callReviewRpc('review_advance_files', (c) =>
      c.rpc('review_advance_files', { p_review_id: reviewId, p_only_approved: onlyApproved }),
    ),
  )
}

/** Change priority and/or due date. `dueDate: null` clears it; omit the key to keep it. */
export async function updateReviewMeta(
  reviewId: string,
  patch: ReviewMetaPatch,
): Promise<ReviewMetaResult> {
  const a = reviewMetaArgs(reviewId, patch)
  return mapReviewMetaResult(
    await callReviewRpc('review_update_meta', (c) =>
      c.rpc('review_update_meta', {
        p_review_id: a.p_review_id,
        p_priority: a.p_priority,
        p_due_date: a.p_due_date,
        p_clear_due_date: a.p_clear_due_date,
      }),
    ),
  )
}

// ============================================
// Reads
// ============================================

/** One page of a queue bucket, sorted on the server (overdue, priority, due date, age). */
export async function listReviewQueue(query: ReviewQueueQuery): Promise<ReviewQueuePage> {
  const a = reviewQueueArgs(query)
  return mapQueuePage(
    await callReviewRpc('review_list_queue', (c) =>
      c.rpc('review_list_queue', {
        p_bucket: a.p_bucket,
        p_team_id: a.p_team_id,
        p_search: a.p_search,
        p_limit: a.p_limit,
        p_cursor: a.p_cursor,
      }),
    ),
  )
}

export async function getReviewDetail(reviewId: string): Promise<ReviewDetail> {
  return mapReviewDetail(
    await callReviewRpc('review_get_detail', (c) =>
      c.rpc('review_get_detail', { p_review_id: reviewId }),
    ),
  )
}

/** Package items the caller owes plus gate reviews waiting on them. */
export async function getReviewBadgeCount(): Promise<number> {
  const data = await callReviewRpc('review_count_badge', (c) => c.rpc('review_count_badge'))
  return typeof data === 'number' && Number.isFinite(data) ? data : 0
}

// ============================================
// Version references and drawing PDFs
// ============================================

/** The root version and every reference edge below it, with exact/approximate flags. */
export async function getVersionDependencyClosure(
  fileVersionId: string,
): Promise<DependencyClosureRow[]> {
  return mapClosureRows(
    await callReviewRpc('file_version_get_dependency_closure', (c) =>
      c.rpc('file_version_get_dependency_closure', { p_file_version_id: fileVersionId }),
    ),
  )
}

/** The stored PDF of a file version, or null when none has been generated. */
export async function getDrawingPdf(fileVersionId: string): Promise<DrawingPdf | null> {
  const data = await callReviewRpc('drawing_pdf_render_get', (c) =>
    c.rpc('drawing_pdf_render_get', { p_file_version_id: fileVersionId }),
  )
  const first: unknown = Array.isArray(data) ? data[0] : data
  return mapDrawingPdf(first)
}

/**
 * Record the PDF generated for a file version, after uploading it content-addressed to the vault
 * bucket. First write wins; the same hash again is a no-op; a different hash is refused
 * (`PDF_EXISTS`) unless the caller is an administrator.
 */
export async function recordDrawingPdf(
  fileVersionId: string,
  storageHash: string,
  size: number,
  options?: { closureExact?: boolean | null },
): Promise<RecordDrawingPdfResult> {
  return mapRecordDrawingPdfResult(
    await callReviewRpc('drawing_pdf_render_record', (c) =>
      c.rpc('drawing_pdf_render_record', {
        p_file_version_id: fileVersionId,
        p_storage_hash: storageHash,
        p_file_size: size,
        p_closure_exact: options?.closureExact ?? null,
      }),
    ),
  )
}

/**
 * Record what a just-checked-in version references. The server resolves each child to the version
 * whose hash matches `childContentHash` (exact) or the child's latest version (approximate), and
 * replaces anything recorded for the version before. Called from check-in.
 */
export async function recordVersionReferences(
  fileVersionId: string,
  refs: VersionReferenceInput[],
): Promise<RecordVersionReferencesResult> {
  const p_refs: Json = versionReferencesArg(refs)
  return mapRecordVersionReferencesResult(
    await callReviewRpc('file_version_reference_record', (c) =>
      c.rpc('file_version_reference_record', { p_file_version_id: fileVersionId, p_refs }),
    ),
  )
}

// ============================================
// Versions for the package builder
// ============================================

/** The latest checked-in version of a file, as the server records it. */
export interface LatestFileVersion {
  fileId: string
  fileVersionId: string
  version: number
  revision: string | null
  state: string | null
  fileName: string
  filePath: string
  extension: string | null
  vaultId: string | null
}

const VERSION_LOOKUP_CHUNK = 100

/**
 * The latest checked-in version of each file, read from the server: `files.version` and the
 * `file_versions` row with that number. The renderer's cached `pdmData.version` is never used, so
 * a package always pins what the server holds, not what this machine last saw. Files with no
 * version row, or deleted, are absent from the result.
 */
export async function getLatestCheckedInVersions(
  fileIds: readonly string[],
): Promise<LatestFileVersion[]> {
  const client = getSupabaseClient()
  const unique = Array.from(new Set(fileIds))
  const out: LatestFileVersion[] = []

  for (let i = 0; i < unique.length; i += VERSION_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + VERSION_LOOKUP_CHUNK)
    const { data: files, error: filesError } = await client
      .from('file')
      .select('id, version, file_name, file_path, extension, vault_id, deleted_at')
      .in('id', chunk)
    if (filesError) throw toReviewRpcError(filesError)

    const live = (files ?? []).filter((f) => !f.deleted_at)
    if (live.length === 0) continue
    const { data: versions, error: versionsError } = await client
      .from('file_version')
      .select('id, file_id, version, revision, state')
      .in(
        'file_id',
        live.map((f) => f.id),
      )
      .in('version', Array.from(new Set(live.map((f) => f.version))))
    if (versionsError) throw toReviewRpcError(versionsError)

    const byKey = new Map((versions ?? []).map((v) => [`${v.file_id}:${v.version}`, v]))
    for (const f of live) {
      const v = byKey.get(`${f.id}:${f.version}`)
      if (!v) continue
      out.push({
        fileId: f.id,
        fileVersionId: v.id,
        version: v.version,
        revision: v.revision || null,
        state: v.state || null,
        fileName: f.file_name,
        filePath: f.file_path,
        extension: f.extension || null,
        vaultId: f.vault_id,
      })
    }
  }
  return out
}

/**
 * The content hash of one `file_versions` row, or null when the row is gone or not visible. The
 * review detail carries the hash of each item's current version only; an earlier round's version
 * is looked up here when its PDF is shown.
 */
export async function getFileVersionContentHash(fileVersionId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from('file_version')
    .select('content_hash')
    .eq('id', fileVersionId)
    .maybeSingle()
  if (error) throw toReviewRpcError(error)
  return data?.content_hash || null
}

// ============================================
// Teams with members (for the reviewer picker)
// ============================================

function readTeamMember(raw: unknown): TeamMember | null {
  if (typeof raw !== 'object' || raw === null) return null
  const user: unknown = (raw as { user?: unknown }).user
  if (typeof user !== 'object' || user === null) return null
  const u = user as Record<string, unknown>
  if (typeof u.id !== 'string') return null
  return {
    id: u.id,
    email: typeof u.email === 'string' ? u.email : '',
    full_name: typeof u.full_name === 'string' ? u.full_name : null,
    avatar_url: typeof u.avatar_url === 'string' ? u.avatar_url : null,
    role: typeof u.role === 'string' ? u.role : null,
  }
}

/**
 * Fetch all teams in an organization together with their member details and reviewer
 * configuration. The reviewerConfigs array determines which members a team contributes; if it is
 * empty, all members do - the same rule `request_review` applies on the server.
 */
export async function getOrgTeamsWithMembers(
  orgId: string,
): Promise<{ teams: TeamWithMembers[]; error?: string }> {
  const client = getSupabaseClient()

  const { data, error } = await client
    .from('team')
    .select(
      `
      id,
      name,
      color,
      icon,
      description,
      team_member(
        user:app_user!team_member_user_id_fkey(id, email, full_name, avatar_url, role)
      )
    `,
    )
    .eq('org_id', orgId)
    .order('name')

  if (error) {
    log.error('[Reviews]', 'Loading teams with members failed', {
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    return { teams: [], error: error.message }
  }

  // Fetched separately so the main query does not fail if team_reviewers is unreadable.
  const reviewersByTeam = new Map<string, TeamReviewerConfig[]>()
  const { data: reviewerData, error: reviewerError } = await client
    .from('team_reviewer')
    .select('id, team_id, reviewer_type, user_id, workflow_role_id')
  if (reviewerError) {
    log.warn('[Reviews]', 'Loading team reviewer rules failed; teams contribute all members', {
      message: reviewerError.message,
    })
  }
  for (const r of reviewerData ?? []) {
    if (r.reviewer_type !== 'user' && r.reviewer_type !== 'workflow_role') continue
    const existing = reviewersByTeam.get(r.team_id) ?? []
    existing.push({
      id: r.id,
      reviewer_type: r.reviewer_type,
      user_id: r.user_id,
      workflow_role_id: r.workflow_role_id,
    })
    reviewersByTeam.set(r.team_id, existing)
  }

  // Workflow role assignments, to resolve workflow_role reviewer rules to users.
  const { data: wrAssignments } = await client
    .from('user_workflow_role')
    .select('user_id, workflow_role_id')
  const userWorkflowRoles = new Map<string, Set<string>>()
  for (const a of wrAssignments ?? []) {
    const set = userWorkflowRoles.get(a.user_id) ?? new Set<string>()
    set.add(a.workflow_role_id)
    userWorkflowRoles.set(a.user_id, set)
  }

  const teams: TeamWithMembers[] = (data ?? []).map((team) => {
    const teamMembers: unknown = team.team_member
    const rawMembers: unknown[] = Array.isArray(teamMembers) ? teamMembers : []
    const members = rawMembers
      .map(readTeamMember)
      .filter((m): m is TeamMember => m !== null)
      .map((m) => ({ ...m, workflow_role_ids: Array.from(userWorkflowRoles.get(m.id) ?? []) }))

    return {
      id: team.id,
      name: team.name,
      color: team.color,
      icon: team.icon,
      description: team.description,
      members,
      reviewerConfigs: reviewersByTeam.get(team.id) ?? [],
    }
  })

  return { teams }
}
