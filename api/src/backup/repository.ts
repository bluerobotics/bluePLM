/**
 * The server backup repository: an encrypted, content-addressed store of an
 * organization's vault content plus point-in-time snapshots of its database
 * rows, kept in the organization's own bucket.
 *
 * Layout (under the store's prefix, `blueplm-server-backup/` in S3):
 *
 *   config.json                         format, KDF parameters, wrapped master key
 *   blobs/<n0n1>/<n>                    one per distinct content hash; n = HMAC(hash)
 *   snapshots/<id>/tables/<table>.bin   one part per database table
 *   snapshots/<id>/objects.bin          the storage objects the snapshot holds
 *   snapshots/<id>/manifest.bin         written last: a snapshot exists once this does
 *
 * Vault content in Supabase Storage is already content-addressed (the object
 * name is the SHA-256 of its bytes) and never rewritten, so a blob is uploaded
 * once and every later snapshot refers to it. That makes each backup
 * incremental without re-reading the vault, which is what lets it run on a
 * server with no disk to stage the vault on.
 *
 * Snapshot parts are gzip'd JSON, sealed like blobs, and the manifest records
 * each part's SHA-256, so a verify can prove a snapshot is whole.
 */

import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import {
  blobName,
  createMasterKey,
  ENVELOPE_OVERHEAD,
  MAGIC_BLOB,
  MAGIC_PART,
  openBuffer,
  openMasterKey,
  openStream,
  sealBuffer,
  sealStream,
  sha256Hex,
  verifyingStream,
  type KdfParams,
  type RepoKeys,
  type WrappedKey,
} from './crypto.js'
import type { ObjectStore, StoredObjectInfo } from './objectStore.js'

export const REPOSITORY_FORMAT = 'blueplm-server-backup'
export const REPOSITORY_VERSION = 1
/** Prefix of the server repository inside the organization's bucket. */
export const SERVER_REPOSITORY_PREFIX = 'blueplm-server-backup'

interface RepositoryConfig {
  format: typeof REPOSITORY_FORMAT
  version: number
  id: string
  createdAt: string
  kdf: KdfParams
  key: WrappedKey
}

export type SnapshotTrigger = 'scheduled' | 'manual' | 'sandbox'

export interface SnapshotTablePart {
  name: string
  rows: number
  part: string
  sha256: string
}

export interface SnapshotObjectEntry {
  /** Storage object name inside the `vault` bucket. */
  name: string
  hash: string
  size: number
}

export interface SnapshotProblem {
  kind: 'corrupt_source' | 'unreadable_source' | 'not_content_addressed' | 'table_missing'
  name: string
  detail: string
}

export interface SnapshotManifest {
  format: 'blueplm-server-snapshot'
  version: 1
  id: string
  createdAt: string
  orgId: string
  orgName: string
  trigger: SnapshotTrigger
  scheduledSlot: string | null
  source: string
  tables: SnapshotTablePart[]
  tablesMissing: string[]
  objects: { part: string; sha256: string; count: number; bytes: number }
  problems: SnapshotProblem[]
}

export class RepositoryNotFoundError extends Error {
  constructor(description: string) {
    super(`No BluePLM server backup repository at ${description}.`)
    this.name = 'RepositoryNotFoundError'
  }
}

export function newSnapshotId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  return `${stamp}-${crypto.randomBytes(4).toString('hex')}`
}

export class BackupRepository {
  private constructor(
    readonly store: ObjectStore,
    readonly config: RepositoryConfig,
    private readonly keys: RepoKeys,
  ) {}

  static async exists(store: ObjectStore): Promise<boolean> {
    return (await store.head('config.json')) !== null
  }

  static async init(
    store: ObjectStore,
    password: string,
    kdf: Partial<Pick<KdfParams, 'N' | 'r' | 'p'>> = {},
  ): Promise<BackupRepository> {
    if (await BackupRepository.exists(store)) {
      throw new Error(`A backup repository already exists at ${store.description}.`)
    }
    if (!password) throw new Error('A backup password is required.')
    const master = createMasterKey(password, kdf)
    const config: RepositoryConfig = {
      format: REPOSITORY_FORMAT,
      version: REPOSITORY_VERSION,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kdf: master.kdf,
      key: master.key,
    }
    await store.put('config.json', Buffer.from(JSON.stringify(config, null, 2)))
    return new BackupRepository(store, config, master.keys)
  }

  static async open(store: ObjectStore, password: string): Promise<BackupRepository> {
    if (!(await BackupRepository.exists(store))) throw new RepositoryNotFoundError(store.description)
    const config = JSON.parse((await store.getBuffer('config.json')).toString('utf8')) as RepositoryConfig
    if (config.format !== REPOSITORY_FORMAT) throw new Error(`Not a BluePLM server backup repository: ${store.description}`)
    if (config.version > REPOSITORY_VERSION) {
      throw new Error(`Repository format ${config.version} is newer than this server understands (${REPOSITORY_VERSION}).`)
    }
    return new BackupRepository(store, config, openMasterKey(password, config.kdf, config.key))
  }

  static async openOrInit(store: ObjectStore, password: string): Promise<{ repo: BackupRepository; created: boolean }> {
    if (await BackupRepository.exists(store)) return { repo: await BackupRepository.open(store, password), created: false }
    return { repo: await BackupRepository.init(store, password), created: true }
  }

  // --- blobs ---------------------------------------------------------------

  blobKey(contentHash: string): string {
    const n = blobName(this.keys, contentHash)
    return `blobs/${n.slice(0, 2)}/${n}`
  }

  /** Stored size of a blob holding `plainSize` bytes. */
  static storedSize(plainSize: number): number {
    return plainSize + ENVELOPE_OVERHEAD
  }

  /** Every blob in the repository: object key to stored size. */
  async listBlobs(): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    for (const item of await this.store.list('blobs/')) out.set(item.key, item.size)
    return out
  }

  /**
   * Stores a blob from a source stream, checking on the way that the bytes hash
   * to `contentHash` and, when given, number `size`. A mismatch fails the stream
   * before the store commits it, so a corrupt source object is never stored as
   * if it were the content it is named after. Returns the plaintext size.
   */
  async putBlob(contentHash: string, size: number | undefined, source: Readable): Promise<number> {
    const check = verifyingStream({ sha256: contentHash, size })
    const seal = sealStream(this.keys, MAGIC_BLOB, contentHash)
    // pipeline() owns every stream's errors: a failed source or check destroys
    // the sealed stream, which the store treats as "do not commit". (A bare
    // pipe() left the sealed stream's error unhandled when the check failed
    // before the store began reading, and that crashed the process: found by
    // the sandbox's corrupt-object check.)
    const feeding = pipeline(source, check, seal)
    const committed = this.store.put(this.blobKey(contentHash), seal).catch((err) => {
      // The store gave up: stop reading the source too.
      seal.destroy(err)
      throw err
    })
    await Promise.all([feeding, committed])
    return check.result().size
  }

  /** A blob's plaintext. The stream errors if the blob is altered or is not the content it is named for. */
  async readBlob(contentHash: string): Promise<Readable> {
    const sealed = await this.store.get(this.blobKey(contentHash))
    const open = openStream(this.keys, MAGIC_BLOB, contentHash)
    const check = verifyingStream({ sha256: contentHash })
    sealed.on('error', (err) => open.destroy(err))
    open.on('error', (err) => check.destroy(err))
    return sealed.pipe(open).pipe(check)
  }

  /** Reads a blob to the end and confirms its content hash. */
  async checkBlob(contentHash: string): Promise<{ size: number }> {
    let size = 0
    const stream = await this.readBlob(contentHash)
    for await (const chunk of stream) size += (chunk as Buffer).length
    return { size }
  }

  // --- snapshots -----------------------------------------------------------

  async writePart(snapshotId: string, part: string, value: unknown): Promise<{ key: string; sha256: string }> {
    const key = `snapshots/${snapshotId}/${part}`
    const sealed = sealBuffer(this.keys, MAGIC_PART, key, zlib.gzipSync(Buffer.from(JSON.stringify(value))))
    await this.store.put(key, sealed)
    return { key, sha256: sha256Hex(sealed) }
  }

  async readPart<T>(key: string, expectedSha256?: string): Promise<T> {
    const sealed = await this.store.getBuffer(key)
    if (expectedSha256 && sha256Hex(sealed) !== expectedSha256) {
      throw new Error(`Snapshot part ${key} does not match the hash its manifest recorded.`)
    }
    return JSON.parse(zlib.gunzipSync(openBuffer(this.keys, MAGIC_PART, key, sealed)).toString('utf8')) as T
  }

  async commitManifest(manifest: SnapshotManifest): Promise<void> {
    await this.writePart(manifest.id, 'manifest.bin', manifest)
  }

  async readManifest(snapshotId: string): Promise<SnapshotManifest> {
    return this.readPart<SnapshotManifest>(`snapshots/${snapshotId}/manifest.bin`)
  }

  async readObjects(manifest: SnapshotManifest): Promise<SnapshotObjectEntry[]> {
    return this.readPart<SnapshotObjectEntry[]>(manifest.objects.part, manifest.objects.sha256)
  }

  async readTable(manifest: SnapshotManifest, table: string): Promise<Record<string, unknown>[]> {
    const part = manifest.tables.find((t) => t.name === table)
    if (!part) throw new Error(`Snapshot ${manifest.id} has no table ${table}.`)
    return this.readPart<Record<string, unknown>[]>(part.part, part.sha256)
  }

  /** Every snapshot id with its keys, committed (has a manifest) or not. */
  async listSnapshotKeys(): Promise<Map<string, { committed: boolean; keys: StoredObjectInfo[] }>> {
    const out = new Map<string, { committed: boolean; keys: StoredObjectInfo[] }>()
    for (const item of await this.store.list('snapshots/')) {
      const id = item.key.split('/')[1]
      const entry = out.get(id) ?? { committed: false, keys: [] }
      entry.keys.push(item)
      if (item.key.endsWith('/manifest.bin')) entry.committed = true
      out.set(id, entry)
    }
    return out
  }

  /**
   * Committed snapshots, oldest first. A manifest that cannot be read is
   * reported in `unreadable`, never skipped silently: retention must not
   * prune blobs on the strength of a partial list.
   */
  async listSnapshots(): Promise<{ manifests: SnapshotManifest[]; unreadable: Array<{ id: string; error: string }> }> {
    const manifests: SnapshotManifest[] = []
    const unreadable: Array<{ id: string; error: string }> = []
    for (const [id, entry] of await this.listSnapshotKeys()) {
      if (!entry.committed) continue
      try {
        manifests.push(await this.readManifest(id))
      } catch (err) {
        unreadable.push({ id, error: err instanceof Error ? err.message : String(err) })
      }
    }
    manifests.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    return { manifests, unreadable }
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    const keys = (await this.store.list(`snapshots/${snapshotId}/`)).map((k) => k.key)
    // The manifest first: once it is gone the snapshot no longer exists, even
    // if deleting the parts is interrupted.
    const manifest = keys.filter((k) => k.endsWith('/manifest.bin'))
    await this.store.delete(manifest)
    await this.store.delete(keys.filter((k) => !k.endsWith('/manifest.bin')))
  }
}

/** Collects a stream into a buffer; a helper for small reads in tests and the CLI. */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}
