/**
 * The S3 object store: Backblaze B2, AWS S3 or any S3-compatible endpoint.
 *
 * Endpoints follow the desktop's restic repository (electron/handlers/backup.ts
 * `buildResticRepo`), so the server repository sits in the same bucket as the
 * desktop's restic repository, under its own prefix.
 *
 * Only the worker and the CLI import this file; the test suites use the memory
 * and filesystem stores, so the AWS SDK is an API dependency and not a root one.
 */

import { Readable } from 'node:stream'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'

import { ObjectNotFoundError, readAll, type ObjectStore, type StoredObjectInfo } from './objectStore.js'

export interface S3Target {
  provider: string
  bucket: string
  region?: string | null
  endpoint?: string | null
  accessKey: string
  secretKey: string
  /** Key prefix inside the bucket, without a trailing slash. */
  prefix: string
}

/** Endpoint URL and region for a provider, as the desktop's restic repository resolves them. */
export function resolveS3Endpoint(target: Pick<S3Target, 'provider' | 'region' | 'endpoint'>): {
  endpoint: string | undefined
  region: string
} {
  const withScheme = (host: string) => (/^https?:\/\//.test(host) ? host : `https://${host}`)
  if (target.provider === 'backblaze_b2') {
    const host = target.endpoint || 's3.us-west-004.backblazeb2.com'
    const region = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/.exec(host.replace(/^https?:\/\//, ''))?.[1]
    return { endpoint: withScheme(host), region: target.region || region || 'us-west-004' }
  }
  if (target.provider === 'aws_s3') {
    return { endpoint: target.endpoint ? withScheme(target.endpoint) : undefined, region: target.region || 'us-east-1' }
  }
  if (target.provider === 'google_cloud') {
    return { endpoint: withScheme(target.endpoint || 'storage.googleapis.com'), region: target.region || 'auto' }
  }
  return { endpoint: target.endpoint ? withScheme(target.endpoint) : undefined, region: target.region || 'us-east-1' }
}

export class S3ObjectStore implements ObjectStore {
  readonly description: string
  private readonly client: S3Client
  private readonly bucket: string
  private readonly prefix: string

  constructor(target: S3Target) {
    const { endpoint, region } = resolveS3Endpoint(target)
    this.client = new S3Client({
      region,
      endpoint,
      // MinIO and most S3-compatible services need path-style addressing.
      forcePathStyle: target.provider !== 'aws_s3',
      credentials: { accessKeyId: target.accessKey, secretAccessKey: target.secretKey },
    })
    this.bucket = target.bucket
    this.prefix = target.prefix.replace(/\/+$/, '')
    this.description = `s3:${endpoint ?? `s3.${region}.amazonaws.com`}/${this.bucket}/${this.prefix}`
  }

  private full(key: string): string {
    return `${this.prefix}/${key}`
  }

  async put(key: string, body: Buffer | Readable): Promise<void> {
    // Upload switches to multipart for large bodies and aborts the multipart
    // upload when the body stream errors, so a failed stream commits nothing.
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: this.full(key), Body: body },
      queueSize: 4,
      partSize: 16 * 1024 * 1024,
      leavePartsOnError: false,
    })
    await upload.done()
  }

  async get(key: string): Promise<Readable> {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.full(key) }))
      if (!out.Body) throw new ObjectNotFoundError(key)
      return out.Body as Readable
    } catch (err) {
      if (isNotFound(err)) throw new ObjectNotFoundError(key)
      throw err
    }
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readAll(await this.get(key))
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.full(key) }))
      return { key, size: Number(out.ContentLength ?? 0) }
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  async list(prefix: string): Promise<StoredObjectInfo[]> {
    const out: StoredObjectInfo[] = []
    let token: string | undefined
    const strip = this.prefix.length + 1
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.full(prefix), ContinuationToken: token }),
      )
      for (const item of page.Contents ?? []) {
        if (item.Key) out.push({ key: item.Key.slice(strip), size: Number(item.Size ?? 0) })
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }

  async delete(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000)
      const out = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((key) => ({ Key: this.full(key) })), Quiet: true },
        }),
      )
      if (out.Errors && out.Errors.length > 0) {
        throw new Error(`Could not delete ${out.Errors.length} backup objects: ${out.Errors[0].Message ?? out.Errors[0].Code}`)
      }
    }
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404
}
