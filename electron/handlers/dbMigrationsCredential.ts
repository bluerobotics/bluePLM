// "Remember on this computer" for the database connection string. Encrypted with Electron
// safeStorage (DPAPI on Windows, Keychain on macOS, libsecret on Linux), so it belongs to the
// operating-system user profile, and bound to the Supabase project it is for: a remembered string
// is only used while this app is pointed at the same project. Nothing here trusts an identity the
// renderer sends; the string is a database credential and the database is the authority on what
// it may do. It is never returned to the renderer.
import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'

interface StoredCredential {
  projectRef: string | null
  encrypted: string
}

function credentialFile(): string {
  return path.join(app.getPath('userData'), 'db-upgrade-credential.json')
}

function readStored(): StoredCredential | null {
  try {
    const raw = JSON.parse(fs.readFileSync(credentialFile(), 'utf8')) as Partial<StoredCredential>
    if (typeof raw.encrypted !== 'string') return null
    return {
      projectRef: typeof raw.projectRef === 'string' ? raw.projectRef : null,
      encrypted: raw.encrypted,
    }
  } catch {
    return null
  }
}

export function canRememberCredential(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function rememberCredential(connectionString: string, projectRef: string | null): boolean {
  if (!canRememberCredential()) return false
  const stored: StoredCredential = {
    projectRef,
    encrypted: safeStorage.encryptString(connectionString).toString('base64'),
  }
  fs.writeFileSync(credentialFile(), JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 })
  return true
}

/** Whether a remembered string exists for this project (no decryption). */
export function hasRememberedCredential(projectRef: string | null): boolean {
  const stored = readStored()
  return !!stored && stored.projectRef === projectRef
}

export function loadRememberedCredential(projectRef: string | null): string | null {
  const stored = readStored()
  if (!stored || stored.projectRef !== projectRef) return null
  if (!canRememberCredential()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'))
  } catch {
    return null
  }
}

export function forgetCredential(): void {
  try {
    fs.rmSync(credentialFile(), { force: true })
  } catch {
    // nothing to forget
  }
}
