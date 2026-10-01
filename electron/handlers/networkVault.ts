import { spawn } from 'node:child_process'
import { ipcMain } from 'electron'

export interface NetworkVaultCredentialRequest {
  networkRoot: string
  username: string
  password: string
}

export interface NetworkVaultCredentialResult {
  success: boolean
  /** The SMB server whose locally stored credential was updated. Never includes the username or password. */
  target?: string
  error?: string
}

/**
 * Get the Windows Credential Manager target for an SMB UNC path.
 *
 * Credentials belong to the server, not to one share. Restricting this to a
 * UNC path means a renderer cannot ask the main process to store arbitrary
 * Credential Manager entries. Mapped drives intentionally are not accepted:
 * their server name is not recoverable without querying Windows and callers
 * should enter the canonical \\server\share vault root instead.
 */
export function credentialTargetForNetworkRoot(networkRoot: string): string | null {
  const normalized = networkRoot.trim().replaceAll('/', '\\')
  if (!normalized.startsWith('\\\\')) return null

  const segments = normalized.slice(2).split('\\').filter(Boolean)
  const [server, share] = segments
  if (!server || !share) return null

  // Windows server names may be DNS names, NetBIOS names, or IPv4 addresses.
  // Reject shell metacharacters and separators even though execFile never uses
  // a shell: this keeps the Credential Manager target narrowly scoped.
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(server)) return null
  if (server === '.' || server === '..') return null
  return server
}

function isValidRequest(request: NetworkVaultCredentialRequest): boolean {
  return (
    Boolean(credentialTargetForNetworkRoot(request.networkRoot)) &&
    request.username.trim().length > 0 &&
    request.username.length <= 512 &&
    request.password.length > 0 &&
    request.password.length <= 2048
  )
}

async function saveNetworkVaultCredential(
  request: NetworkVaultCredentialRequest,
): Promise<NetworkVaultCredentialResult> {
  const target = credentialTargetForNetworkRoot(request.networkRoot)
  if (!isValidRequest(request) || !target) {
    return {
      success: false,
      error: 'Use a UNC vault path such as \\server\\share and enter both username and password.',
    }
  }

  if (process.platform !== 'win32') {
    return {
      success: false,
      error: 'Saving SMB credentials is currently supported on Windows clients only.',
    }
  }

  try {
    // `net use` reads the password from stdin, so it never appears in the
    // process command line. It also leaves existing connections untouched;
    // Windows returns an error if the server already has incompatible creds.
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'net.exe',
        [
          request.networkRoot.trim().replaceAll('/', '\\'),
          `/user:${request.username.trim()}`,
          '*',
          '/persistent:yes',
        ],
        { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] },
      )
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('timeout'))
      }, 15_000)
      child.once('error', () => {
        clearTimeout(timer)
        reject(new Error('start'))
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) {
          resolve()
        } else {
          reject(new Error('credentials'))
        }
      })
      child.stdin.end(`${request.password}\r\n`)
    })
    return { success: true, target }
  } catch {
    return {
      success: false,
      error: 'Windows could not save the network credential. Verify the server and account.',
    }
  }
}

export function registerNetworkVaultHandlers(): void {
  ipcMain.handle(
    'network-vault:save-credential',
    async (_event, request: NetworkVaultCredentialRequest): Promise<NetworkVaultCredentialResult> =>
      await saveNetworkVaultCredential(request),
  )
}

export function unregisterNetworkVaultHandlers(): void {
  ipcMain.removeHandler('network-vault:save-credential')
}
