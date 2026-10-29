import * as fs from 'node:fs/promises'
import { renameSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { MdbAuthPersistence, MdbAuthSnapshot } from './mdbAuthAuthority'
import { parsePrincipal, parseOrganization } from './mdbAuthParsers'
import { normalizeMdbServerUrl } from './mdbAuthTransport'

/** Auth-only record storage extracted from c8eb49c5 mdbDurableEncryptedRecordStore. */
export interface MdbEncryptedAuthRecordStore {
  read(): Promise<Uint8Array | null>
  write(value: Uint8Array, canCommit: () => boolean): Promise<boolean>
  clear(): Promise<void>
}

export function createMdbEncryptedAuthRecordStore(
  filePath: string,
  options: { writeTemporary?: (path: string, value: Uint8Array) => Promise<void> } = {},
): MdbEncryptedAuthRecordStore {
  return {
    async read() {
      try {
        return new Uint8Array(await fs.readFile(filePath))
      } catch (error) {
        if (isMissingFile(error)) return null
        throw error
      }
    },
    async write(value, canCommit) {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      const temporaryPath = `${filePath}.${randomUUID()}.tmp`
      let published = false
      try {
        if (options.writeTemporary) await options.writeTemporary(temporaryPath, value)
        else await fs.writeFile(temporaryPath, value, { mode: 0o600, flag: 'wx' })
        // No event-loop callback can invalidate this authority between the guard
        // and renameSync. The rename is the filesystem publication point; it is
        // not a power-loss or cross-process transaction guarantee.
        if (!canCommit()) return false
        renameSync(temporaryPath, filePath)
        published = true
        return true
      } finally {
        if (!published) await fs.rm(temporaryPath, { force: true })
      }
    },
    async clear() {
      try {
        await fs.unlink(filePath)
      } catch (error) {
        if (!isMissingFile(error)) throw error
      }
      try {
        await fs.access(filePath)
      } catch (error) {
        if (isMissingFile(error)) return
        throw error
      }
      throw new Error('MDB encrypted auth record remains after clear')
    },
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

/** Electron safeStorage boundary based on f86da500 createSafeStorageMdbTrustedContextPersistence. */
export function createSafeStorageMdbAuthPersistence(
  safeStorage: {
    isEncryptionAvailable(): boolean
    encryptString(value: string): Buffer
    decryptString(value: Buffer): string
  },
  store: MdbEncryptedAuthRecordStore,
): MdbAuthPersistence {
  return {
    async load() {
      if (!safeStorage.isEncryptionAvailable()) return null
      const bytes = await store.read()
      if (bytes === null) return null
      try {
        const value: unknown = JSON.parse(safeStorage.decryptString(Buffer.from(bytes)))
        if (typeof value !== 'object' || value === null || Array.isArray(value))
          throw new Error('invalid snapshot')
        const record = value as Record<string, unknown>
        if (
          typeof record.serverUrl !== 'string' ||
          typeof record.bearerToken !== 'string' ||
          !record.bearerToken.trim() ||
          typeof record.expiresAt !== 'string' ||
          !Number.isFinite(Date.parse(record.expiresAt))
        )
          throw new Error('invalid snapshot')
        const result: MdbAuthSnapshot = {
          serverUrl: normalizeMdbServerUrl(record.serverUrl).toString(),
          bearerToken: record.bearerToken,
          expiresAt: record.expiresAt,
          principal: parsePrincipal({ user: record.principal }),
          organization: parseOrganization({ organization: record.organization }),
        }
        if (result.organization.id !== result.principal.organizationId)
          throw new Error('invalid identity')
        return result
      } catch {
        await store.clear()
        return null
      }
    },
    async save(snapshot, canCommit) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('encryption unavailable')
      return store.write(safeStorage.encryptString(JSON.stringify(snapshot)), canCommit)
    },
    clear: () => store.clear(),
  }
}
