/**
 * Extension Installer
 * 
 * Handles the one-click install flow:
 * 1. Download .bpx from store
 * 2. Verify hash and signature
 * 3. Check revocation list
 * 4. Extract client code to Extension Host
 * 5. Deploy server handlers to org's API
 * 6. Record in local registry
 * 
 * Also handles sideloading from local .bpx files.
 * 
 * @module extensions/registry/installer
 */

import type { 
  PackageContents, 
  VerificationStatus,
} from '../types'
import { 
  extractPackage, 
  verifyPackageHash,
  verifyPackageSignature,
  checkRevocationList,
  fetchRevocationList,
  fetchSigningKeys,
} from '../package'
import { isNativeExtension, hasServerComponent } from '../types'
import { getExtensionDownloadUrl, DEFAULT_STORE_API_URL } from './discovery'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Installation progress callback.
 */
export type InstallProgressCallback = (progress: InstallProgress) => void

/**
 * Installation progress event.
 */
export interface InstallProgress {
  /** Current step */
  step: InstallStep
  /** Progress percentage (0-100) */
  percentage: number
  /** Status message */
  message: string
}

/**
 * Installation steps.
 */
export type InstallStep = 
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'deploying-server'
  | 'installing'
  | 'complete'
  | 'error'

/**
 * Installation result.
 */
export interface InstallResult {
  /** Whether installation was successful */
  success: boolean
  /** Extension ID */
  extensionId: string
  /** Installed version */
  version: string
  /** Verification status */
  verification: VerificationStatus
  /** Error message (if failed) */
  error?: string
  /** Warnings (non-fatal issues) */
  warnings?: string[]
}

/**
 * Installation options.
 */
export interface InstallOptions {
  /** Specific version to install */
  version?: string
  /** Skip signature verification */
  skipVerification?: boolean
  /** Force install even if already installed */
  force?: boolean
  /** Progress callback */
  onProgress?: InstallProgressCallback
  /** Store API URL */
  storeApiUrl?: string
  /** Org API URL (for server handler deployment) */
  orgApiUrl?: string
  /** Auth token for org API */
  authToken?: string
}

/**
 * Sideload options.
 */
export interface SideloadOptions {
  /** Accept sideload warning (required) */
  acceptWarning: boolean
  /** Progress callback */
  onProgress?: InstallProgressCallback
  /** Force install even if already installed */
  force?: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALLATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Install an extension from the store.
 * 
 * @param extensionId - Extension ID to install (e.g., "blueplm.google-drive")
 * @param extensionsPath - Local extensions directory path
 * @param options - Installation options
 * @returns Installation result
 */
export async function installFromStore(
  extensionId: string,
  extensionsPath: string,
  options: InstallOptions = {}
): Promise<InstallResult> {
  const {
    version,
    skipVerification = false,
    force = false,
    onProgress,
    storeApiUrl = DEFAULT_STORE_API_URL,
    orgApiUrl,
    authToken,
  } = options
  
  const warnings: string[] = []
  
  try {
    // Step 1: Download .bpx
    onProgress?.({
      step: 'downloading',
      percentage: 10,
      message: `Downloading ${extensionId}...`,
    })
    
    const downloadUrl = getExtensionDownloadUrl(extensionId, version, storeApiUrl)
    const response = await fetch(downloadUrl)
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Extension not found: ${extensionId}`)
      }
      throw new Error(`Download failed: ${response.statusText}`)
    }
    
    // Get expected hash from headers
    const expectedHash = response.headers.get('X-Content-SHA256')
    const bpxData = await response.arrayBuffer()
    
    onProgress?.({
      step: 'downloading',
      percentage: 30,
      message: 'Download complete',
    })
    
    // Step 2: Extract and verify
    onProgress?.({
      step: 'verifying',
      percentage: 40,
      message: 'Verifying package...',
    })
    
    const contents = await extractPackage(bpxData)
    
    // Verify hash if provided
    if (expectedHash && !verifyPackageHash(contents, expectedHash)) {
      throw new Error('Package hash mismatch - file may be corrupted')
    }
    
    // Verify signature (unless skipped)
    let verification: VerificationStatus = 'community'
    
    if (!skipVerification && contents.signature) {
      try {
        const [signingKeys, revocationList] = await Promise.all([
          fetchSigningKeys(storeApiUrl),
          fetchRevocationList(storeApiUrl),
        ])
        
        // Try each signing key
        for (const key of signingKeys) {
          // Check if key is revoked
          const revoked = checkRevocationList(key.keyId, revocationList)
          if (revoked) {
            warnings.push(`Signing key ${key.keyId} was revoked: ${revoked.reason}`)
            continue
          }
          
          const result = await verifyPackageSignature(contents, key)
          if (result.valid) {
            verification = 'verified'
            break
          }
        }
        
        if (verification !== 'verified') {
          warnings.push('Package signature could not be verified')
        }
      } catch (error) {
        warnings.push(`Signature verification failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    onProgress?.({
      step: 'verifying',
      percentage: 50,
      message: 'Verification complete',
    })
    
    // Step 3: Check for native extension
    const manifest = contents.manifest
    
    if (isNativeExtension(manifest)) {
      if (verification !== 'verified') {
        throw new Error('Native extensions require verified signature')
      }
      
      // Check platform compatibility
      const currentPlatform = typeof process !== 'undefined' ? process.platform : 'unknown'
      if (!manifest.native?.platforms.includes(currentPlatform as 'win32' | 'darwin' | 'linux')) {
        throw new Error(`Native extension not supported on ${currentPlatform}`)
      }
    }
    
    // Step 4: Deploy server handlers (if present)
    if (hasServerComponent(manifest) && orgApiUrl && authToken) {
      onProgress?.({
        step: 'deploying-server',
        percentage: 60,
        message: 'Deploying server handlers...',
      })
      
      await deployServerHandlers(contents, orgApiUrl, authToken)
      
      onProgress?.({
        step: 'deploying-server',
        percentage: 70,
        message: 'Server handlers deployed',
      })
    } else if (hasServerComponent(manifest) && !orgApiUrl) {
      warnings.push('Extension has server component but org API URL not configured')
    }
    
    // Step 5: Install locally
    onProgress?.({
      step: 'installing',
      percentage: 80,
      message: 'Installing extension...',
    })
    
    await installLocally(contents, extensionsPath, { verification, force })
    
    onProgress?.({
      step: 'complete',
      percentage: 100,
      message: 'Installation complete!',
    })
    
    return {
      success: true,
      extensionId: manifest.id,
      version: manifest.version,
      verification,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    
    onProgress?.({
      step: 'error',
      percentage: 0,
      message: `Installation failed: ${message}`,
    })
    
    return {
      success: false,
      extensionId,
      version: version || 'unknown',
      verification: 'community',
      error: message,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }
}

/**
 * Sideload an extension from a local .bpx file.
 * 
 * @param bpxPath - Path to .bpx file
 * @param extensionsPath - Local extensions directory path
 * @param options - Sideload options
 * @returns Installation result
 */
export async function sideloadFromFile(
  bpxPath: string,
  extensionsPath: string,
  options: SideloadOptions
): Promise<InstallResult> {
  const { acceptWarning, force = false, onProgress } = options
  
  if (!acceptWarning) {
    return {
      success: false,
      extensionId: 'unknown',
      version: 'unknown',
      verification: 'sideloaded',
      error: 'Sideload warning must be accepted',
    }
  }
  
  try {
    onProgress?.({
      step: 'extracting',
      percentage: 20,
      message: 'Reading package...',
    })
    
    // Read file via Electron
    if (typeof window === 'undefined' || !window.electronAPI?.readFile) {
      throw new Error('Sideloading requires Electron environment')
    }
    
    const result = await window.electronAPI.readFile(bpxPath)
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to read file')
    }
    
    // Convert base64 to ArrayBuffer
    const binaryString = atob(result.data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const bpxData = bytes.buffer
    
    onProgress?.({
      step: 'extracting',
      percentage: 40,
      message: 'Extracting package...',
    })
    
    const contents = await extractPackage(bpxData)
    
    // Check for native extension - sideloaded native extensions not allowed
    if (isNativeExtension(contents.manifest)) {
      throw new Error('Native extensions cannot be sideloaded - must be installed from store')
    }
    
    onProgress?.({
      step: 'installing',
      percentage: 70,
      message: 'Installing extension...',
    })
    
    // Install with sideloaded flag
    await installLocally(contents, extensionsPath, { 
      verification: 'sideloaded',
      force,
      markSideloaded: true,
    })
    
    onProgress?.({
      step: 'complete',
      percentage: 100,
      message: 'Sideload complete!',
    })
    
    return {
      success: true,
      extensionId: contents.manifest.id,
      version: contents.manifest.version,
      verification: 'sideloaded',
      warnings: ['This extension was sideloaded and has not been verified'],
    }
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    
    onProgress?.({
      step: 'error',
      percentage: 0,
      message: `Sideload failed: ${message}`,
    })
    
    return {
      success: false,
      extensionId: 'unknown',
      version: 'unknown',
      verification: 'sideloaded',
      error: message,
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNINSTALLATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Uninstall options.
 */
export interface UninstallOptions {
  /** Remove server handlers */
  removeServerHandlers?: boolean
  /** Org API URL (for server handler removal) */
  orgApiUrl?: string
  /** Auth token for org API */
  authToken?: string
  /** Progress callback */
  onProgress?: InstallProgressCallback
}

/**
 * Uninstall an extension.
 * 
 * @param extensionId - Extension ID to uninstall
 * @param extensionsPath - Local extensions directory path
 * @param options - Uninstall options
 * @returns Whether uninstallation was successful
 */
export async function uninstallExtension(
  extensionId: string,
  extensionsPath: string,
  options: UninstallOptions = {}
): Promise<{ success: boolean; error?: string }> {
  const { removeServerHandlers = true, orgApiUrl, authToken, onProgress } = options
  
  try {
    const extensionPath = `${extensionsPath}/${extensionId.replace(/\./g, '-')}`
    
    // Check if extension exists
    if (typeof window === 'undefined' || !window.electronAPI?.fileExists) {
      throw new Error('Uninstall requires Electron environment')
    }
    
    const exists = await window.electronAPI.fileExists(extensionPath)
    if (!exists) {
      return { success: true } // Already uninstalled
    }
    
    onProgress?.({
      step: 'installing',
      percentage: 20,
      message: 'Removing extension...',
    })
    
    // Remove server handlers if configured
    if (removeServerHandlers && orgApiUrl && authToken) {
      try {
        await removeServerHandlersFromOrg(extensionId, orgApiUrl, authToken)
      } catch (error) {
        console.warn('[Installer] Failed to remove server handlers:', error)
        // Continue with local removal
      }
    }
    
    onProgress?.({
      step: 'installing',
      percentage: 60,
      message: 'Removing files...',
    })
    
    // Remove local files
    // Note: deleteDirectory will be added by Agent 5 (IPC Bridge)
    // @ts-expect-error - deleteDirectory will be added by Agent 5
    if (window.electronAPI?.deleteDirectory) {
      // @ts-expect-error - deleteDirectory will be added by Agent 5
      const result = await window.electronAPI.deleteDirectory(extensionPath) as { success: boolean; error?: string }
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete extension directory')
      }
    } else {
      throw new Error('deleteDirectory not available')
    }
    
    onProgress?.({
      step: 'complete',
      percentage: 100,
      message: 'Uninstall complete',
    })
    
    return { success: true }
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    
    onProgress?.({
      step: 'error',
      percentage: 0,
      message: `Uninstall failed: ${message}`,
    })
    
    return { success: false, error: message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Install package contents locally.
 */
async function installLocally(
  contents: PackageContents,
  extensionsPath: string,
  options: {
    verification: VerificationStatus
    force?: boolean
    markSideloaded?: boolean
  }
): Promise<void> {
  const { manifest } = contents
  const extensionDir = `${extensionsPath}/${manifest.id.replace(/\./g, '-')}`
  
  if (typeof window === 'undefined' || !window.electronAPI) {
    throw new Error('Local installation requires Electron environment')
  }
  
  // Check if already installed
  const exists = await window.electronAPI.fileExists(extensionDir)
  if (exists && !options.force) {
    throw new Error(`Extension ${manifest.id} is already installed. Use force option to reinstall.`)
  }
  
  // Create directory
  // Note: createDirectory will be added by Agent 5 (IPC Bridge)
  // @ts-expect-error - createDirectory will be added by Agent 5
  if (window.electronAPI.createDirectory) {
    // @ts-expect-error - createDirectory will be added by Agent 5
    const result = await window.electronAPI.createDirectory(extensionDir) as { success: boolean; error?: string }
    if (!result.success) {
      throw new Error(result.error || 'Failed to create extension directory')
    }
  }
  
  // Write manifest
  if (window.electronAPI.writeFile) {
    await window.electronAPI.writeFile(
      `${extensionDir}/extension.json`,
      JSON.stringify(manifest, null, 2)
    )
  }
  
  // Write client bundle
  if (contents.clientBundle && manifest.main) {
    const clientPath = `${extensionDir}/${manifest.main}`
    const clientDir = clientPath.substring(0, clientPath.lastIndexOf('/'))
    
    // @ts-expect-error - createDirectory will be added by Agent 5
    if (window.electronAPI.createDirectory) {
      // @ts-expect-error - createDirectory will be added by Agent 5
      await window.electronAPI.createDirectory(clientDir)
    }
    if (window.electronAPI.writeFile) {
      await window.electronAPI.writeFile(clientPath, contents.clientBundle)
    }
  }
  
  // Write server handlers
  if (contents.serverHandlers) {
    for (const [path, code] of Object.entries(contents.serverHandlers)) {
      const handlerPath = `${extensionDir}/${path}`
      const handlerDir = handlerPath.substring(0, handlerPath.lastIndexOf('/'))
      
      // @ts-expect-error - createDirectory will be added by Agent 5
      if (window.electronAPI.createDirectory) {
        // @ts-expect-error - createDirectory will be added by Agent 5
        await window.electronAPI.createDirectory(handlerDir)
      }
      if (window.electronAPI.writeFile) {
        await window.electronAPI.writeFile(handlerPath, code)
      }
    }
  }
  
  // Write signature if present
  if (contents.signature && window.electronAPI.writeFile) {
    await window.electronAPI.writeFile(`${extensionDir}/SIGNATURE`, contents.signature)
  }
  
  // Write README if present
  if (contents.readme && window.electronAPI.writeFile) {
    await window.electronAPI.writeFile(`${extensionDir}/README.md`, contents.readme)
  }
  
  // Write metadata
  const metadata = {
    installedAt: new Date().toISOString(),
    version: manifest.version,
    verification: options.verification,
    hash: contents.hash,
  }
  
  if (window.electronAPI.writeFile) {
    await window.electronAPI.writeFile(
      `${extensionDir}/.metadata.json`,
      JSON.stringify(metadata, null, 2)
    )
  }
  
  // Mark as sideloaded if applicable
  if (options.markSideloaded && window.electronAPI.writeFile) {
    await window.electronAPI.writeFile(`${extensionDir}/.sideloaded`, '')
  }
}

/**
 * Deploy server handlers to org's API.
 */
async function deployServerHandlers(
  contents: PackageContents,
  orgApiUrl: string,
  authToken: string
): Promise<void> {
  const { manifest, serverHandlers } = contents
  
  if (!serverHandlers || Object.keys(serverHandlers).length === 0) {
    return
  }
  
  // Build routes configuration
  const routes = manifest.contributes.apiRoutes?.map(route => ({
    method: route.method,
    path: route.path,
    handler: route.handler,
    public: route.public,
    rateLimit: route.rateLimit,
  })) || []
  
  // Get allowed domains from permissions
  const allowedDomains = manifest.permissions.server
    ?.filter(p => p.startsWith('http:domain:'))
    .map(p => p.replace('http:domain:', '')) || []
  
  const response = await fetch(`${orgApiUrl}/admin/extensions/install`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      extensionId: manifest.id,
      version: manifest.version,
      handlers: serverHandlers,
      routes,
      allowedDomains,
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to deploy server handlers: ${error}`)
  }
}

/**
 * Remove server handlers from org's API.
 */
async function removeServerHandlersFromOrg(
  extensionId: string,
  orgApiUrl: string,
  authToken: string
): Promise<void> {
  const response = await fetch(`${orgApiUrl}/admin/extensions/${encodeURIComponent(extensionId)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  })
  
  if (!response.ok && response.status !== 404) {
    const error = await response.text()
    throw new Error(`Failed to remove server handlers: ${error}`)
  }
}

/**
 * Check if an extension is installed locally.
 */
export async function isExtensionInstalled(
  extensionId: string,
  extensionsPath: string
): Promise<boolean> {
  const extensionDir = `${extensionsPath}/${extensionId.replace(/\./g, '-')}`
  
  if (typeof window !== 'undefined' && window.electronAPI?.fileExists) {
    return window.electronAPI.fileExists(extensionDir)
  }
  
  return false
}

/**
 * Get installed extension version.
 */
export async function getInstalledVersion(
  extensionId: string,
  extensionsPath: string
): Promise<string | null> {
  const extensionDir = `${extensionsPath}/${extensionId.replace(/\./g, '-')}`
  const metadataPath = `${extensionDir}/.metadata.json`
  
  if (typeof window === 'undefined' || !window.electronAPI?.readFile) {
    return null
  }
  
  const result = await window.electronAPI.readFile(metadataPath)
  if (!result.success || !result.data) {
    return null
  }
  
  try {
    const metadata = JSON.parse(atob(result.data)) as { version?: string }
    return metadata.version || null
  } catch {
    return null
  }
}
