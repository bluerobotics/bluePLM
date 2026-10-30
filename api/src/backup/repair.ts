/**
 * Repairing damaged or missing vault content (schema 503).
 *
 * Vault content is stored under the SHA-256 of its bytes, and no client may overwrite a stored
 * object (module 10's storage policies), so only the API's service role can put good bytes back.
 * Every repair here re-hashes the bytes it is given against the name before writing anything,
 * writes, reads the object back and hashes it again, and only then closes the finding. A copy that
 * does not hash to the name is refused, whoever sent it.
 *
 * Two sources of good bytes:
 * - the organization's server backup, which stores each content once (restoreFromBackup);
 * - a desktop's local copy of the file, uploaded by an admin (writeVaultObject with its bytes).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { sha256Hex } from './crypto.js'
import { BackupRepository, streamToBuffer } from './repository.js'

export class RepairError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'RepairError'
  }
}

/** The object name content is stored under: `<org>/<hh>/<hash>`. */
export function vaultObjectPath(orgId: string, contentHash: string): string {
  return `${orgId}/${contentHash.slice(0, 2)}/${contentHash}`
}

/**
 * Writes `bytes` as the vault object for `contentHash`, replacing a damaged object at
 * `existingName` (or the sharded path). Refuses bytes that do not hash to the name, and confirms
 * the stored object hashes to it after writing.
 */
export async function writeVaultObject(
  admin: SupabaseClient,
  orgId: string,
  contentHash: string,
  bytes: Buffer,
  existingName: string | null,
): Promise<{ path: string; size: number }> {
  if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new RepairError('Not a content hash.', 400, 'INVALID_HASH')
  const actual = sha256Hex(bytes)
  if (actual !== contentHash) {
    throw new RepairError(
      `These bytes hash to ${actual}, not ${contentHash}; nothing was written.`,
      422,
      'HASH_MISMATCH',
    )
  }
  const path = existingName && existingName.startsWith(`${orgId}/`) ? existingName : vaultObjectPath(orgId, contentHash)
  const bucket = admin.storage.from('vault')

  // The damaged object's bytes are some other content (in the January case, the next version's).
  // Keep them under their own hash before removing them, unless that object already exists.
  const { data: damaged } = await bucket.download(path)
  if (damaged) {
    const damagedBytes = Buffer.from(await damaged.arrayBuffer())
    const damagedHash = sha256Hex(damagedBytes)
    if (damagedHash !== contentHash) {
      const keep = vaultObjectPath(orgId, damagedHash)
      const { data: existing } = await bucket.download(keep)
      if (!existing) {
        const { error: keepError } = await bucket.upload(keep, damagedBytes, {
          contentType: 'application/octet-stream',
          upsert: false,
        })
        if (keepError) {
          throw new RepairError(`Could not keep the damaged object's bytes: ${keepError.message}`, 502, 'STORAGE_ERROR')
        }
      }
    }
  }

  const { error: removeError } = await bucket.remove([path])
  if (removeError) throw new RepairError(`Could not remove the damaged object: ${removeError.message}`, 502, 'STORAGE_ERROR')
  const { error: uploadError } = await bucket.upload(path, bytes, { contentType: 'application/octet-stream', upsert: false })
  if (uploadError) throw new RepairError(`Could not store the repaired object: ${uploadError.message}`, 502, 'STORAGE_ERROR')

  const { data, error: readError } = await bucket.download(path)
  if (readError || !data) throw new RepairError('The repaired object could not be read back.', 502, 'STORAGE_ERROR')
  const stored = Buffer.from(await data.arrayBuffer())
  if (sha256Hex(stored) !== contentHash) {
    throw new RepairError('The repaired object did not read back intact; the finding stays open.', 502, 'READBACK_MISMATCH')
  }
  return { path, size: stored.length }
}

/** The good bytes for `contentHash` from the backup, or null when the backup does not hold them. */
export async function readBackupCopy(repo: BackupRepository, contentHash: string): Promise<Buffer | null> {
  if (!(await repo.store.head(repo.blobKey(contentHash)))) return null
  // readBlob fails unless the blob authenticates and hashes to contentHash.
  return streamToBuffer(await repo.readBlob(contentHash))
}

/** Committed snapshots (oldest first) whose object list holds `contentHash`. */
export async function snapshotsHolding(
  repo: BackupRepository,
  contentHash: string,
): Promise<Array<{ id: string; createdAt: string }>> {
  const { manifests } = await repo.listSnapshots()
  const out: Array<{ id: string; createdAt: string }> = []
  for (const manifest of manifests) {
    const entries = await repo.readObjects(manifest)
    if (entries.some((e) => e.hash === contentHash)) out.push({ id: manifest.id, createdAt: manifest.createdAt })
  }
  return out
}

interface IssueRow {
  content_hash: string
  status: string
  storage_name: string | null
}

async function loadIssue(admin: SupabaseClient, orgId: string, contentHash: string): Promise<IssueRow> {
  const { data, error } = await admin
    .from('vault_object_issue')
    .select('content_hash, status, storage_name')
    .eq('org_id', orgId)
    .eq('content_hash', contentHash)
    .maybeSingle()
  if (error) throw new RepairError(`Could not read the finding: ${error.message}`, 502, 'DATABASE_ERROR')
  if (!data) throw new RepairError('No damaged or missing file with that content hash.', 404, 'NOT_FOUND')
  const issue = data as IssueRow
  if (issue.status === 'repaired') throw new RepairError('This file is already repaired.', 409, 'ALREADY_REPAIRED')
  return issue
}

async function closeIssue(
  admin: SupabaseClient,
  orgId: string,
  contentHash: string,
  resolution: 'restored_from_backup' | 'uploaded_from_desktop',
  actorId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.rpc('backup_issue_record_repair', {
    p_org_id: orgId,
    p_content_hash: contentHash,
    p_resolution: resolution,
    p_actor_id: actorId,
    p_detail: detail,
  })
  if (error) throw new RepairError(`Repaired, but the finding could not be closed: ${error.message}`, 502, 'DATABASE_ERROR')
}

/** Restores the content from the organization's server backup and closes the finding. */
export async function restoreFromBackup(
  admin: SupabaseClient,
  repo: BackupRepository,
  orgId: string,
  contentHash: string,
  actorId: string,
): Promise<{ path: string; size: number }> {
  const issue = await loadIssue(admin, orgId, contentHash)
  const bytes = await readBackupCopy(repo, contentHash)
  if (!bytes) {
    throw new RepairError('The server backup does not hold this content.', 404, 'NO_BACKUP_COPY')
  }
  const written = await writeVaultObject(admin, orgId, contentHash, bytes, issue.storage_name)
  await closeIssue(admin, orgId, contentHash, 'restored_from_backup', actorId, { path: written.path, size: written.size })
  return written
}

/** Stores a desktop's copy of the content, if it hashes to the name, and closes the finding. */
export async function repairFromUpload(
  admin: SupabaseClient,
  orgId: string,
  contentHash: string,
  bytes: Buffer,
  actorId: string,
): Promise<{ path: string; size: number }> {
  const issue = await loadIssue(admin, orgId, contentHash)
  const written = await writeVaultObject(admin, orgId, contentHash, bytes, issue.storage_name)
  await closeIssue(admin, orgId, contentHash, 'uploaded_from_desktop', actorId, { path: written.path, size: written.size })
  return written
}
