/**
 * Damaged and missing vault content (schema 503): reading the findings, deciding on them, the
 * repairs that go through the API, and the check downloads make before handing content out.
 *
 * Findings are recorded by the server backup worker; see api/src/backup/repair.ts for why
 * repairs that write storage go through the API (only its service role may replace a vault
 * object) and how they check the bytes.
 */
import { getApiUrl } from '@/lib/apiVersion'
import { log } from '@/lib/logger'
import { getCurrentAccessToken } from '@/lib/supabase/auth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { checkinFile, checkoutFile } from '@/lib/supabase/files/checkout'

export type VaultObjectIssueStatus = 'open' | 'repaired' | 'unrecoverable' | 'accepted'

export interface VaultObjectIssueRef {
  file_id: string
  file_version_id: string
  vault_id: string
  file_path: string
  version: number
  revision: string | null
  file_size: number | null
  created_at: string | null
  created_by_email: string | null
  /** This version is the file's current content. */
  is_latest: boolean
  file_deleted: boolean
  checked_out_by: string | null
}

export interface VaultObjectIssue {
  id: string
  content_hash: string
  kind: 'damaged' | 'missing'
  storage_name: string | null
  actual_hash: string | null
  actual_size: number | null
  found_by: 'backup' | 'verify' | 'live_audit'
  first_seen_at: string
  last_seen_at: string
  status: VaultObjectIssueStatus
  resolution: string | null
  resolved_at: string | null
  resolved_by_email: string | null
  note: string | null
  refs: VaultObjectIssueRef[]
}

// The schema-503 functions are not in the generated Database type until gen:types runs against 503.
type UntypedRpc = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>
}
const untyped = () => getSupabaseClient() as unknown as UntypedRpc

/** Every finding of the organization with the file versions that name its content (admins). */
export async function listVaultObjectIssues(): Promise<{
  issues: VaultObjectIssue[]
  error?: string
}> {
  const { data, error } = await untyped().rpc('vault_object_issue_list')
  if (error) return { issues: [], error: error.message }
  return { issues: (data ?? []) as VaultObjectIssue[] }
}

/** An admin's decision: accept (note required), mark unrecoverable, or reopen. */
export async function resolveVaultObjectIssue(
  issueId: string,
  status: 'accepted' | 'unrecoverable' | 'rolled_back' | 'open',
  note: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await untyped().rpc('vault_object_issue_resolve', {
    p_issue_id: issueId,
    p_status: status,
    p_note: note,
  })
  return error ? { success: false, error: error.message } : { success: true }
}

/**
 * Which of these content hashes an admin marked unrecoverable. Any member may ask. A database
 * before 503 answers an error, which reads as "none" so downloads keep working.
 */
export async function blockedContentHashes(hashes: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(hashes.filter(Boolean))]
  if (unique.length === 0) return new Set()
  try {
    const { data, error } = await untyped().rpc('vault_object_blocked', { p_hashes: unique })
    if (error) {
      log.debug('[VaultObjectIssues]', 'blocked-content check unavailable', {
        error: error.message,
      })
      return new Set()
    }
    return new Set((data ?? []) as string[])
  } catch (err) {
    log.debug('[VaultObjectIssues]', 'blocked-content check failed', { error: String(err) })
    return new Set()
  }
}

async function callApi<T>(path: string, init: RequestInit): Promise<{ data?: T; error?: string }> {
  const base = getApiUrl()
  const token = getCurrentAccessToken()
  if (!base) return { error: 'No BluePLM API is configured (Settings > REST API).' }
  if (!token) return { error: 'Not signed in.' }
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string } & T
    if (!response.ok) return { error: body.message ?? `The API answered ${response.status}` }
    return { data: body }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Whether the server backup holds good bytes for this content, and in which snapshots. */
export function backupCopiesOf(contentHash: string) {
  return callApi<{ stored: boolean; snapshots: Array<{ id: string; createdAt: string }> }>(
    `/backup/issues/${contentHash}/copies`,
    { method: 'GET' },
  )
}

/** Restore the content from the server backup (the API checks the bytes before and after writing). */
export function restoreFromServerBackup(contentHash: string) {
  return callApi<{ success: boolean; path: string; size: number }>(
    `/backup/issues/${contentHash}/restore`,
    {
      method: 'POST',
    },
  )
}

/** Store this computer's copy of the content, which the API stores only if it hashes to the name. */
export function uploadLocalCopy(contentHash: string, bytes: Uint8Array) {
  return callApi<{ success: boolean; path: string; size: number }>(
    `/backup/issues/${contentHash}/upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Blob([bytes as BlobPart]),
    },
  )
}

/** SHA-256 of bytes, hex, in the browser or the renderer. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Makes the last good version current again when the current version's content is damaged or
 * missing: check out (unless the caller already holds it) and check in that version's content,
 * with a comment, so the history shows what happened. The damaged version stays in history. Then
 * the finding is closed as rolled back.
 */
export async function rollBackToLastGoodVersion(
  issue: VaultObjectIssue,
  ref: VaultObjectIssueRef,
  user: { id: string; email: string },
  damagedHashes: ReadonlySet<string>,
): Promise<{ success: boolean; version?: number; error?: string }> {
  if (ref.checked_out_by && ref.checked_out_by !== user.id) {
    return { success: false, error: 'Someone else has this file checked out.' }
  }
  const { data, error } = await getSupabaseClient()
    .from('file_version')
    .select('version, content_hash, file_size')
    .eq('file_id', ref.file_id)
    .lt('version', ref.version)
    .order('version', { ascending: false })
  if (error) return { success: false, error: error.message }
  const good = (data ?? []).find((v) => v.content_hash && !damagedHashes.has(v.content_hash))
  if (!good) return { success: false, error: 'There is no earlier version to roll back to.' }

  if (!ref.checked_out_by) {
    const out = await checkoutFile(ref.file_id, user.id, user.email, {
      message: 'Rolling back a damaged version',
    })
    if (!out.success) return { success: false, error: out.error ?? 'Could not check the file out.' }
  }
  const comment = `Rolled back to version ${good.version}: the stored content of version ${ref.version} is damaged.`
  const back = await checkinFile(ref.file_id, user.id, {
    newContentHash: good.content_hash,
    newFileSize: good.file_size ?? undefined,
    comment,
  })
  if (!back.success) return { success: false, error: back.error ?? 'Could not check the file in.' }
  const resolved = await resolveVaultObjectIssue(issue.id, 'rolled_back', comment)
  if (!resolved.success) return { success: false, error: resolved.error }
  return { success: true, version: good.version }
}
