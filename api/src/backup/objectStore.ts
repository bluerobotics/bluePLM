/**
 * Where a backup repository's objects live.
 *
 * Production uses S3 (`s3Store.ts`: Backblaze B2, AWS, any S3-compatible
 * endpoint). The memory and filesystem stores here are for the test suites and
 * the isolated sandbox (`api/scripts/backup-sandbox.ts`), and the filesystem one
 * also serves a restore drill on a machine with no bucket at all.
 *
 * Contract every store keeps (the shared contract test checks it):
 * - `put` commits only a body that is read to the end without an error. A
 *   stream that fails part-way leaves no object, not a truncated one.
 * - `put` replaces an existing object.
 * - `list` returns every key under the prefix, with sizes, in key order.
 * - `get` of a missing key throws `ObjectNotFoundError`.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface StoredObjectInfo {
  key: string
  size: number
}

export interface ObjectStore {
  /** A label for reports, never a secret: `s3:host/bucket/prefix`, `fs:/path`, `memory`. */
  readonly description: string
  put(key: string, body: Buffer | Readable): Promise<void>
  get(key: string): Promise<Readable>
  getBuffer(key: string): Promise<Buffer>
  head(key: string): Promise<StoredObjectInfo | null>
  list(prefix: string): Promise<StoredObjectInfo[]>
  delete(keys: string[]): Promise<void>
}

export class ObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`Backup object not found: ${key}`)
    this.name = 'ObjectNotFoundError'
  }
}

export async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export class MemoryObjectStore implements ObjectStore {
  readonly description = 'memory'
  readonly objects = new Map<string, Buffer>()

  async put(key: string, body: Buffer | Readable): Promise<void> {
    const bytes = Buffer.isBuffer(body) ? Buffer.from(body) : await readAll(body)
    this.objects.set(key, bytes)
  }

  async get(key: string): Promise<Readable> {
    return Readable.from([await this.getBuffer(key)])
  }

  async getBuffer(key: string): Promise<Buffer> {
    const bytes = this.objects.get(key)
    if (!bytes) throw new ObjectNotFoundError(key)
    return Buffer.from(bytes)
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const bytes = this.objects.get(key)
    return bytes ? { key, size: bytes.length } : null
  }

  async list(prefix: string): Promise<StoredObjectInfo[]> {
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, bytes]) => ({ key, size: bytes.length }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key)
  }
}

export class FsObjectStore implements ObjectStore {
  readonly description: string

  constructor(private readonly root: string) {
    this.description = `fs:${root}`
  }

  private file(key: string): string {
    if (key.split('/').some((part) => part === '..' || part === '')) {
      throw new Error(`Invalid object key: ${key}`)
    }
    return path.join(this.root, ...key.split('/'))
  }

  async put(key: string, body: Buffer | Readable): Promise<void> {
    const target = this.file(key)
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    const temp = `${target}.${crypto.randomBytes(6).toString('hex')}.partial`
    try {
      if (Buffer.isBuffer(body)) await fs.promises.writeFile(temp, body)
      else await pipeline(body, fs.createWriteStream(temp))
      await fs.promises.rename(temp, target)
    } catch (err) {
      await fs.promises.rm(temp, { force: true })
      throw err
    }
  }

  async get(key: string): Promise<Readable> {
    const target = this.file(key)
    if (!fs.existsSync(target)) throw new ObjectNotFoundError(key)
    return fs.createReadStream(target)
  }

  async getBuffer(key: string): Promise<Buffer> {
    try {
      return await fs.promises.readFile(this.file(key))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new ObjectNotFoundError(key)
      throw err
    }
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const stat = await fs.promises.stat(this.file(key))
      return { key, size: stat.size }
    } catch {
      return null
    }
  }

  async list(prefix: string): Promise<StoredObjectInfo[]> {
    const out: StoredObjectInfo[] = []
    const walk = async (dir: string, keyPrefix: string) => {
      let entries: fs.Dirent[]
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const key = keyPrefix ? `${keyPrefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), key)
        else if (!entry.name.endsWith('.partial') && key.startsWith(prefix)) {
          const stat = await fs.promises.stat(path.join(dir, entry.name))
          out.push({ key, size: stat.size })
        }
      }
    }
    await walk(this.root, '')
    return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) await fs.promises.rm(this.file(key), { force: true })
  }
}
