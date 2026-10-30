/**
 * A simulated organization for server backup tests and the sandbox: database
 * rows and content-addressed vault objects in memory, served through the same
 * `BackupSource` interface production uses, with the faults a real vault meets.
 *
 * - `checkIn(path, bytes)` adds a file or a new version: a `files` row, a
 *   `file_versions` row and an object named `<org>/<hh>/<sha256>`, as
 *   src/lib/storage.ts names them.
 * - `corrupt(path)` changes an object's bytes in place, keeping its name: what
 *   bit rot or a bad write looks like from outside.
 * - `failReads(name, n)` makes the next n opens of an object fail (a network
 *   blip); `failTable(table)` makes a table export fail.
 * - `dropModule(table)` answers a table as not installed.
 */

import crypto from 'node:crypto'
import { Readable } from 'node:stream'

import { BACKUP_TABLES, type BackupSource, type BackupTable, type SourceObject, type TablePage } from '../src/backup/source.js'

type Row = Record<string, unknown>

/** Deterministic bytes, so a run can be reproduced from its seed. */
export function seededBytes(seed: string, size: number): Buffer {
  const out = Buffer.alloc(size)
  let block = crypto.createHash('sha256').update(seed).digest()
  for (let offset = 0; offset < size; offset += block.length) {
    block.copy(out, offset, 0, Math.min(block.length, size - offset))
    block = crypto.createHash('sha256').update(block).digest()
  }
  return out
}

let counter = 0
function uuid(): string {
  counter++
  const hex = counter.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}

export class SimulatedOrg implements BackupSource {
  readonly description = 'simulated'
  readonly orgId = uuid()
  readonly vaultId = uuid()
  readonly tables = new Map<string, Row[]>()
  readonly objects = new Map<string, Buffer>()
  private readonly failingReads = new Map<string, number>()
  private readonly failingTables = new Set<string>()
  private readonly droppedTables = new Set<string>()
  reads = 0
  now = () => new Date()

  constructor(readonly name = 'Simulated Robotics', vaultName = 'Main Vault') {
    for (const table of BACKUP_TABLES) this.tables.set(table, [])
    this.rows('organization').push({ id: this.orgId, name })
    this.rows('vault').push({ id: this.vaultId, org_id: this.orgId, name: vaultName })
    this.rows('app_user').push({ id: uuid(), org_id: this.orgId, email: 'admin@example.test', role: 'admin' })
  }

  rows(table: string): Row[] {
    const rows = this.tables.get(table)
    if (!rows) throw new Error(`unknown table ${table}`)
    return rows
  }

  objectName(hash: string): string {
    return `${this.orgId}/${hash.slice(0, 2)}/${hash}`
  }

  file(path: string): Row | undefined {
    return this.rows('file').find((f) => f.file_path === path && !f.deleted_at)
  }

  /** Adds a file, or a new version of one. Returns the content hash. */
  checkIn(path: string, bytes: Buffer): string {
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    this.objects.set(this.objectName(hash), Buffer.from(bytes))
    let file = this.file(path)
    const at = this.now().toISOString()
    if (!file) {
      file = {
        id: uuid(),
        org_id: this.orgId,
        vault_id: this.vaultId,
        file_path: path,
        file_name: path.split('/').pop(),
        content_hash: hash,
        file_size: bytes.length,
        version: 1,
        deleted_at: null,
        updated_at: at,
      }
      this.rows('file').push(file)
    } else {
      file.version = Number(file.version) + 1
      file.content_hash = hash
      file.file_size = bytes.length
      file.updated_at = at
    }
    this.rows('file_version').push({
      id: uuid(),
      file_id: file.id,
      version: file.version,
      content_hash: hash,
      file_size: bytes.length,
      created_at: at,
    })
    this.rows('activity').push({ id: uuid(), org_id: this.orgId, file_id: file.id, action: 'checkin', created_at: at })
    return hash
  }

  delete(path: string): void {
    const file = this.file(path)
    if (file) file.deleted_at = this.now().toISOString()
  }

  /** Deletes the object behind a hash from storage (a purge), leaving the rows. */
  purgeObject(hash: string): void {
    this.objects.delete(this.objectName(hash))
  }

  corrupt(path: string): string {
    const hash = this.file(path)?.content_hash as string
    const bytes = this.objects.get(this.objectName(hash))!
    bytes[Math.floor(bytes.length / 2)] ^= 0xff
    return hash
  }

  failReads(name: string, times: number): void {
    this.failingReads.set(name, times)
  }

  failTable(table: string): void {
    this.failingTables.add(table)
  }

  healTable(table: string): void {
    this.failingTables.delete(table)
  }

  dropModule(table: string): void {
    this.droppedTables.add(table)
  }

  async orgName(): Promise<string> {
    return this.name
  }

  async exportTable(table: BackupTable, after: string | null, limit: number): Promise<TablePage> {
    if (this.failingTables.has(table)) throw new Error(`Could not export ${table}: simulated failure`)
    if (this.droppedTables.has(table)) return { missing: true }
    const rows = [...this.rows(table)]
      .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
      .filter((r) => after === null || String(r.id) > after)
      .slice(0, limit)
    return { missing: false, rows: structuredClone(rows) }
  }

  async listObjects(after: string | null, limit: number): Promise<SourceObject[]> {
    return [...this.objects.entries()]
      .map(([name, bytes]) => ({ name, size: bytes.length }))
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .filter((o) => after === null || o.name > after)
      .slice(0, limit)
  }

  async openObject(name: string): Promise<Readable> {
    this.reads++
    const failures = this.failingReads.get(name) ?? 0
    if (failures > 0) {
      this.failingReads.set(name, failures - 1)
      throw new Error(`simulated network failure reading ${name}`)
    }
    const bytes = this.objects.get(name)
    if (!bytes) throw new Error(`no object ${name}`)
    // Several chunks, so streaming code paths see more than one.
    const chunks: Buffer[] = []
    for (let i = 0; i < bytes.length; i += 7000) chunks.push(Buffer.from(bytes.subarray(i, i + 7000)))
    return Readable.from(chunks)
  }
}
