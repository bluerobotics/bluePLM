/**
 * Restoring a server snapshot to a folder.
 *
 * Files are written in vault layout, `<target>/<vault name>/<file path>`, at the
 * version the snapshot's `files` row names (its content hash), and every table
 * is written as JSON under `<target>/_blueplm-backup/`, beside the manifest.
 * Each file goes to a temporary name and is renamed only after its content
 * decrypted, authenticated and hashed to what the row says, so a restore never
 * leaves a damaged file under a real name.
 *
 * Restore never writes to the database or to storage. Putting rows back into a
 * live database is a decision for a person with the JSON in hand, not something
 * a tool should do in one step.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'

import type { BackupRepository, SnapshotManifest } from './repository.js'

export interface RestoreOptions {
  snapshotId?: string
  /** Restore only files whose vault path starts with this (forward slashes). */
  pathPrefix?: string
  /** Also restore files the snapshot records as deleted. */
  includeDeleted?: boolean
  /** Write the tables but no file content. */
  metadataOnly?: boolean
}

export interface RestoreResult {
  snapshotId: string
  files: number
  bytes: number
  failed: Array<{ path: string; error: string }>
  tables: number
}

interface FileRow {
  id: string
  vault_id: string | null
  file_path: string
  content_hash: string | null
  deleted_at?: string | null
}

function safeJoin(root: string, ...parts: string[]): string {
  const target = path.resolve(root, ...parts)
  const rel = path.relative(path.resolve(root), target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Refusing to write outside the restore folder: ${parts.join('/')}`)
  return target
}

function sanitizeSegment(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || '_'
}

export async function restoreSnapshot(
  repo: BackupRepository,
  targetDir: string,
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  const { manifests } = await repo.listSnapshots()
  const manifest: SnapshotManifest | undefined = options.snapshotId
    ? manifests.find((m) => m.id === options.snapshotId)
    : manifests[manifests.length - 1]
  if (!manifest) throw new Error(options.snapshotId ? `Snapshot ${options.snapshotId} not found.` : 'The repository has no snapshot.')

  const metaDir = safeJoin(targetDir, '_blueplm-backup')
  await fs.promises.mkdir(metaDir, { recursive: true })
  await fs.promises.writeFile(path.join(metaDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  const tables = new Map<string, Record<string, unknown>[]>()
  for (const table of manifest.tables) {
    const rows = await repo.readTable(manifest, table.name)
    tables.set(table.name, rows)
    await fs.promises.writeFile(path.join(metaDir, `${table.name}.json`), JSON.stringify(rows, null, 2))
  }

  const result: RestoreResult = { snapshotId: manifest.id, files: 0, bytes: 0, failed: [], tables: manifest.tables.length }
  if (options.metadataOnly) return result

  const vaultNames = new Map<string, string>()
  for (const vault of (tables.get('vault') ?? []) as Array<{ id: string; name: string }>) {
    vaultNames.set(vault.id, sanitizeSegment(vault.name))
  }
  const files = (tables.get('file') ?? []) as unknown as FileRow[]
  const prefix = options.pathPrefix?.replace(/\\/g, '/').replace(/^\/+/, '')
  for (const file of files) {
    if (!file.content_hash) continue
    if (file.deleted_at && !options.includeDeleted) continue
    const relPath = file.file_path.replace(/\\/g, '/').replace(/^\/+/, '')
    if (prefix && !relPath.startsWith(prefix)) continue
    const vaultDir = file.vault_id ? (vaultNames.get(file.vault_id) ?? file.vault_id) : '_no-vault'
    const shownPath = `${vaultDir}/${relPath}`
    try {
      const target = safeJoin(targetDir, vaultDir, ...relPath.split('/').map(sanitizeSegment))
      await fs.promises.mkdir(path.dirname(target), { recursive: true })
      const temp = `${target}.${crypto.randomBytes(6).toString('hex')}.restoring`
      try {
        // readBlob fails the stream unless the content authenticates and hashes to content_hash.
        await pipeline(await repo.readBlob(file.content_hash), fs.createWriteStream(temp))
        await fs.promises.rename(temp, target)
      } catch (err) {
        await fs.promises.rm(temp, { force: true })
        throw err
      }
      result.files++
      result.bytes += (await fs.promises.stat(target)).size
    } catch (err) {
      result.failed.push({ path: shownPath, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}
