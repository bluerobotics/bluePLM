// Reads and the gate decision the Reviews section needs beyond `src/lib/supabase/reviews.ts`.
//
// The package review RPCs are used from the shared module directly. What lives here: the file
// versions a resubmit can pick from, version lookups for the request dialog, organization users for
// the reviewer picker, storage access for PDFs and downloads, and `complete_gate_review` (the
// desktop wrapper in src/lib/workflows.ts imports the whole supabase barrel, so the one call is
// repeated here). Nothing here writes a review table.
import { getSupabaseClient } from '@/lib/supabase/client'
import type { LatestFileVersion } from '@/lib/supabase/reviews'
import { readGateDecisionResult, vaultStoragePaths, type GateDecision, type GateDecisionResult, type VersionOption } from './reviewLogic'

const VAULT_BUCKET = 'vault'
/** Signed download URLs live this long (seconds); they are used at once. */
const SIGNED_URL_SECONDS = 60
const CHUNK = 100

/** Every checked-in version of a file, newest first. */
export async function getFileVersionOptions(fileId: string): Promise<VersionOption[]> {
  const { data, error } = await getSupabaseClient()
    .from('file_versions')
    .select('id, version, revision, created_at')
    .eq('file_id', fileId)
    .order('version', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((v) => ({
    fileVersionId: v.id,
    version: v.version,
    revision: v.revision || null,
    createdAt: v.created_at ?? null,
  }))
}

/** Specific `file_versions` rows with their file's name, for a request made from version ids. */
export async function getVersionsByIds(fileVersionIds: readonly string[]): Promise<LatestFileVersion[]> {
  const client = getSupabaseClient()
  const unique = Array.from(new Set(fileVersionIds))
  const out: LatestFileVersion[] = []
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    const { data: versions, error } = await client
      .from('file_versions')
      .select('id, file_id, version, revision, state')
      .in('id', chunk)
    if (error) throw new Error(error.message)
    const fileIds = Array.from(new Set((versions ?? []).map((v) => v.file_id)))
    if (fileIds.length === 0) continue
    const { data: files, error: filesError } = await client
      .from('files')
      .select('id, file_name, file_path, extension, vault_id, deleted_at')
      .in('id', fileIds)
    if (filesError) throw new Error(filesError.message)
    const fileById = new Map((files ?? []).filter((f) => !f.deleted_at).map((f) => [f.id, f]))
    for (const v of versions ?? []) {
      const f = fileById.get(v.file_id)
      if (!f) continue
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

export interface OrgUser {
  id: string
  email: string
  fullName: string | null
}

/** People in the organization, for the reviewer picker. */
export async function getOrgUserDirectory(orgId: string): Promise<OrgUser[]> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .select('id, email, full_name')
    .eq('org_id', orgId)
    .order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((u) => ({ id: u.id, email: u.email, fullName: u.full_name || null }))
}

/** Download content-addressed bytes from the vault bucket (sharded path, then legacy flat). */
export async function downloadVaultBlob(orgId: string, hash: string): Promise<Blob> {
  const paths = vaultStoragePaths(orgId, hash)
  if (paths.length === 0) throw new Error('Invalid content hash')
  const storage = getSupabaseClient().storage.from(VAULT_BUCKET)
  let lastError = 'Not found'
  for (const path of paths) {
    const { data, error } = await storage.download(path)
    if (data) return data
    lastError = error?.message ?? lastError
  }
  throw new Error(lastError)
}

/** A short-lived signed URL that downloads the content under `fileName`. */
export async function signedVaultDownloadUrl(orgId: string, hash: string, fileName: string): Promise<string> {
  const paths = vaultStoragePaths(orgId, hash)
  if (paths.length === 0) throw new Error('Invalid content hash')
  const storage = getSupabaseClient().storage.from(VAULT_BUCKET)
  let lastError = 'Not found'
  for (const path of paths) {
    const { data, error } = await storage.createSignedUrl(path, SIGNED_URL_SECONDS, { download: fileName })
    if (data?.signedUrl) return data.signedUrl
    lastError = error?.message ?? lastError
  }
  throw new Error(lastError)
}

/**
 * Decide a workflow gate review. `complete_gate_review` records the decision and, when it clears
 * the last blocking gate, moves the file in the same transaction.
 */
export async function completeGateReview(
  pendingReviewId: string,
  decision: GateDecision,
  comment: string | null,
): Promise<GateDecisionResult> {
  const { data, error } = await getSupabaseClient().rpc('complete_gate_review', {
    p_pending_review_id: pendingReviewId,
    p_decision: decision,
    p_comment: comment ?? undefined,
    p_checklist_responses: {},
  })
  if (error) throw new Error(error.message)
  return readGateDecisionResult(data)
}
