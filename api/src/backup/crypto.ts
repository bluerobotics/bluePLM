/**
 * Encryption for the server backup repository.
 *
 * The repository has one random 64-byte master key: 32 bytes encrypt
 * (AES-256-GCM), 32 bytes name blobs (HMAC-SHA256). The master key is stored in
 * the repository's `config.json`, wrapped by a key derived from the backup
 * password with scrypt, so the password can be changed by rewrapping without
 * touching any data.
 *
 * Every stored object is an envelope: a 4-byte magic, a 12-byte random nonce,
 * the ciphertext and the 16-byte GCM tag. The additional data binds an object
 * to the name it is stored under (a blob to its content hash, a snapshot part to
 * its snapshot), so an object copied over another one fails to decrypt instead
 * of restoring the wrong content.
 *
 * Blob object names are an HMAC of the content hash, so the bucket does not
 * reveal which content the organization holds.
 */

import crypto from 'node:crypto'
import { Transform, type TransformCallback } from 'node:stream'

export const MAGIC_BLOB = Buffer.from('BPB1')
export const MAGIC_PART = Buffer.from('BPP1')
const NONCE_BYTES = 12
const TAG_BYTES = 16
const HEADER_BYTES = 4 + NONCE_BYTES
/** Bytes an envelope adds to its plaintext. */
export const ENVELOPE_OVERHEAD = HEADER_BYTES + TAG_BYTES

export interface KdfParams {
  name: 'scrypt'
  salt: string
  N: number
  r: number
  p: number
}

export interface WrappedKey {
  nonce: string
  ciphertext: string
  tag: string
}

export interface RepoKeys {
  encKey: Buffer
  macKey: Buffer
}

export const DEFAULT_KDF: Omit<KdfParams, 'salt'> = { name: 'scrypt', N: 1 << 15, r: 8, p: 1 }

export class BackupPasswordError extends Error {
  constructor() {
    super('The backup password does not open this repository.')
    this.name = 'BackupPasswordError'
  }
}

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvelopeError'
  }
}

function deriveWrappingKey(password: string, kdf: KdfParams): Buffer {
  return crypto.scryptSync(password, Buffer.from(kdf.salt, 'base64'), 32, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: 256 * kdf.N * kdf.r,
  })
}

export function createMasterKey(
  password: string,
  kdfOverrides: Partial<Omit<KdfParams, 'salt' | 'name'>> = {},
): { kdf: KdfParams; key: WrappedKey; keys: RepoKeys } {
  const kdf: KdfParams = { ...DEFAULT_KDF, ...kdfOverrides, salt: crypto.randomBytes(16).toString('base64') }
  const master = crypto.randomBytes(64)
  const wrapping = deriveWrappingKey(password, kdf)
  const nonce = crypto.randomBytes(NONCE_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', wrapping, nonce)
  cipher.setAAD(Buffer.from('blueplm-backup-master-key'))
  const ciphertext = Buffer.concat([cipher.update(master), cipher.final()])
  return {
    kdf,
    key: {
      nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    },
    keys: { encKey: master.subarray(0, 32), macKey: master.subarray(32) },
  }
}

export function openMasterKey(password: string, kdf: KdfParams, key: WrappedKey): RepoKeys {
  const wrapping = deriveWrappingKey(password, kdf)
  const decipher = crypto.createDecipheriv('aes-256-gcm', wrapping, Buffer.from(key.nonce, 'base64'))
  decipher.setAAD(Buffer.from('blueplm-backup-master-key'))
  decipher.setAuthTag(Buffer.from(key.tag, 'base64'))
  try {
    const master = Buffer.concat([decipher.update(Buffer.from(key.ciphertext, 'base64')), decipher.final()])
    return { encKey: master.subarray(0, 32), macKey: master.subarray(32) }
  } catch {
    throw new BackupPasswordError()
  }
}

/** The object name of a blob, from its SHA-256 content hash. */
export function blobName(keys: RepoKeys, contentHash: string): string {
  return crypto.createHmac('sha256', keys.macKey).update(contentHash).digest('hex')
}

export function sealBuffer(keys: RepoKeys, magic: Buffer, aad: string, plaintext: Buffer): Buffer {
  const nonce = crypto.randomBytes(NONCE_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.encKey, nonce)
  cipher.setAAD(Buffer.from(aad))
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([magic, nonce, body, cipher.getAuthTag()])
}

export function openBuffer(keys: RepoKeys, magic: Buffer, aad: string, sealed: Buffer): Buffer {
  if (sealed.length < ENVELOPE_OVERHEAD || !sealed.subarray(0, 4).equals(magic)) {
    throw new EnvelopeError('Not a BluePLM backup object, or truncated.')
  }
  const nonce = sealed.subarray(4, HEADER_BYTES)
  const tag = sealed.subarray(sealed.length - TAG_BYTES)
  const decipher = crypto.createDecipheriv('aes-256-gcm', keys.encKey, nonce)
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(sealed.subarray(HEADER_BYTES, sealed.length - TAG_BYTES)), decipher.final()])
  } catch {
    throw new EnvelopeError('Backup object failed authentication: it was altered, truncated or stored under the wrong name.')
  }
}

/** Streaming seal: header first, ciphertext as it comes, tag at the end. */
export function sealStream(keys: RepoKeys, magic: Buffer, aad: string): Transform {
  const nonce = crypto.randomBytes(NONCE_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.encKey, nonce)
  cipher.setAAD(Buffer.from(aad))
  let started = false
  const header = () => {
    if (started) return null
    started = true
    return Buffer.concat([magic, nonce])
  }
  return new Transform({
    transform(chunk: Buffer, _enc, callback: TransformCallback) {
      const h = header()
      if (h) this.push(h)
      callback(null, cipher.update(chunk))
    },
    flush(callback: TransformCallback) {
      const h = header()
      if (h) this.push(h)
      this.push(cipher.final())
      callback(null, cipher.getAuthTag())
    },
  })
}

/**
 * Streaming open. GCM authenticates only at the end, so the plaintext this
 * emits is unauthenticated until the stream finishes without an error: callers
 * must treat what they wrote as provisional until then (restore writes to a
 * temporary file and renames it on success).
 */
export function openStream(keys: RepoKeys, magic: Buffer, aad: string): Transform {
  let header = Buffer.alloc(0)
  let decipher: crypto.DecipherGCM | null = null
  let held = Buffer.alloc(0)
  return new Transform({
    transform(chunk: Buffer, _enc, callback: TransformCallback) {
      let data = chunk
      if (!decipher) {
        header = Buffer.concat([header, data])
        if (header.length < HEADER_BYTES) return callback()
        if (!header.subarray(0, 4).equals(magic)) {
          return callback(new EnvelopeError('Not a BluePLM backup object.'))
        }
        decipher = crypto.createDecipheriv('aes-256-gcm', keys.encKey, header.subarray(4, HEADER_BYTES))
        decipher.setAAD(Buffer.from(aad))
        data = header.subarray(HEADER_BYTES)
      }
      // Hold back the last TAG_BYTES: they are the tag, not ciphertext.
      held = Buffer.concat([held, data])
      if (held.length <= TAG_BYTES) return callback()
      const body = held.subarray(0, held.length - TAG_BYTES)
      held = held.subarray(held.length - TAG_BYTES)
      callback(null, decipher.update(body))
    },
    flush(callback: TransformCallback) {
      if (!decipher || held.length !== TAG_BYTES) {
        return callback(new EnvelopeError('Backup object is truncated.'))
      }
      decipher.setAuthTag(held)
      try {
        callback(null, decipher.final())
      } catch {
        callback(new EnvelopeError('Backup object failed authentication: it was altered, truncated or stored under the wrong name.'))
      }
    },
  })
}

/**
 * Passes bytes through while hashing them, and fails the stream at the end if
 * the SHA-256 or the size is not what the caller expected. Placed before the
 * upload, a failure here means the object is never committed: the store only
 * commits a stream that ends cleanly.
 */
export function verifyingStream(expected: { sha256?: string; size?: number }): Transform & {
  result: () => { sha256: string; size: number }
} {
  const hash = crypto.createHash('sha256')
  let size = 0
  let digest = ''
  const t = new Transform({
    transform(chunk: Buffer, _enc, callback: TransformCallback) {
      hash.update(chunk)
      size += chunk.length
      callback(null, chunk)
    },
    flush(callback: TransformCallback) {
      digest = hash.digest('hex')
      if (expected.sha256 && digest !== expected.sha256) {
        return callback(new ContentMismatchError('hash', expected.sha256, digest))
      }
      if (expected.size !== undefined && expected.size !== size) {
        return callback(new ContentMismatchError('size', String(expected.size), String(size)))
      }
      callback()
    },
  }) as Transform & { result: () => { sha256: string; size: number } }
  t.result = () => ({ sha256: digest, size })
  return t
}

export class ContentMismatchError extends Error {
  constructor(
    readonly field: 'hash' | 'size',
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`Content ${field} mismatch: expected ${expected}, got ${actual}`)
    this.name = 'ContentMismatchError'
  }
}

export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}
