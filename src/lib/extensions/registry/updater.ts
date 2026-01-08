/**
 * Extension Updater
 * 
 * Handles:
 * - Auto-update checks on app startup
 * - Update notification
 * - One-click update with rollback capability
 * - Version pinning for enterprise orgs
 * - Breaking update detection (major version bump)
 * - Rollback: keeps previous version for 7 days
 * 
 * @module extensions/registry/updater
 */

import type { ExtensionManifest, ExtensionUpdate, StoreExtensionVersion } from '../types'
import { compareVersions, satisfiesVersion } from '../types'
import { getExtensionVersions, DEFAULT_STORE_API_URL } from './discovery'
import { installFromStore, getInstalledVersion, type InstallProgressCallback } from './installer'

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * How long to keep previous versions for rollback (7 days).
 */
const ROLLBACK_RETENTION_DAYS = 7

/**
 * Storage key prefix for rollback data.
 */
const ROLLBACK_STORAGE_PREFIX = 'extension-rollback:'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rollback entry stored for each extension update.
 */
export interface RollbackEntry {
  /** Extension ID */
  extensionId: string
  /** Previous version */
  previousVersion: string
  /** New version (currently installed) */
  currentVersion: string
  /** When the update was performed */
  updatedAt: string
  /** Previous version bundle path (if saved locally) */
  bundlePath?: string
}

/**
 * Version pin entry.
 */
export interface VersionPin {
  /** Extension ID */
  extensionId: string
  /** Pinned version */
  version: string
  /** When the pin was set */
  pinnedAt: string
  /** Who set the pin */
  pinnedBy?: string
  /** Reason for pinning */
  reason?: string
}

/**
 * Update check result.
 */
export interface UpdateCheckResult {
  /** Available updates */
  updates: ExtensionUpdate[]
  /** Extensions that were checked */
  checked: string[]
  /** Extensions that failed to check */
  errors: Array<{ extensionId: string; error: string }>
  /** Timestamp of the check */
  checkedAt: Date
}

/**
 * Update options.
 */
export interface UpdateOptions {
  /** Specific version to update to (otherwise latest) */
  version?: string
  /** Skip breaking version check */
  allowBreaking?: boolean
  /** Create rollback entry */
  createRollback?: boolean
  /** Progress callback */
  onProgress?: InstallProgressCallback
  /** Store API URL */
  storeApiUrl?: string
  /** Org API URL */
  orgApiUrl?: string
  /** Auth token */
  authToken?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE CHECKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check for available updates for installed extensions.
 * 
 * @param installedExtensions - Map of extension ID to manifest
 * @param options - Check options
 * @returns Update check result
 */
export async function checkForUpdates(
  installedExtensions: Map<string, ExtensionManifest>,
  options: {
    storeApiUrl?: string
    versionPins?: Map<string, VersionPin>
    appVersion?: string
  } = {}
): Promise<UpdateCheckResult> {
  const { 
    storeApiUrl = DEFAULT_STORE_API_URL,
    versionPins = new Map(),
    appVersion,
  } = options
  
  const updates: ExtensionUpdate[] = []
  const checked: string[] = []
  const errors: Array<{ extensionId: string; error: string }> = []
  
  for (const [extensionId, manifest] of installedExtensions) {
    checked.push(extensionId)
    
    try {
      // Check if version is pinned
      const pin = versionPins.get(extensionId)
      if (pin) {
        // Pinned extensions don't get update notifications
        continue
      }
      
      // Fetch available versions from store
      const versions = await getExtensionVersions(extensionId, storeApiUrl)
      
      if (versions.length === 0) {
        // Not in store (sideloaded or removed)
        continue
      }
      
      // Sort versions by semver (newest first)
      const sortedVersions = [...versions].sort((a, b) => 
        compareVersions(b.version, a.version)
      )
      
      // Find latest compatible version
      let latestCompatible: StoreExtensionVersion | undefined
      
      for (const version of sortedVersions) {
        // Check app version compatibility
        if (appVersion && version.minAppVersion) {
          if (!satisfiesVersion(appVersion, `>=${version.minAppVersion}`)) {
            continue
          }
        }
        
        latestCompatible = version
        break
      }
      
      if (!latestCompatible) {
        continue
      }
      
      // Check if newer than installed
      const comparison = compareVersions(latestCompatible.version, manifest.version)
      
      if (comparison > 0) {
        // Determine if breaking change
        const [currentMajor] = manifest.version.split('.').map(Number)
        const [newMajor] = latestCompatible.version.split('.').map(Number)
        const breaking = newMajor > currentMajor
        
        updates.push({
          extensionId,
          currentVersion: manifest.version,
          newVersion: latestCompatible.version,
          changelog: latestCompatible.changelog,
          breaking,
          minAppVersion: latestCompatible.minAppVersion,
        })
      }
      
    } catch (error) {
      errors.push({
        extensionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  
  return {
    updates,
    checked,
    errors,
    checkedAt: new Date(),
  }
}

/**
 * Check if a specific extension has an update available.
 */
export async function checkExtensionUpdate(
  extensionId: string,
  currentVersion: string,
  options: {
    storeApiUrl?: string
    appVersion?: string
  } = {}
): Promise<ExtensionUpdate | null> {
  const manifest: ExtensionManifest = {
    id: extensionId,
    name: extensionId,
    version: currentVersion,
    publisher: extensionId.split('.')[0],
    license: 'MIT',
    engines: { blueplm: '*' },
    activationEvents: [],
    contributes: {},
    permissions: {},
  }
  
  const result = await checkForUpdates(
    new Map([[extensionId, manifest]]),
    options
  )
  
  return result.updates[0] || null
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update an extension to a new version.
 * 
 * @param extensionId - Extension to update
 * @param extensionsPath - Local extensions directory
 * @param options - Update options
 * @returns Update result
 */
export async function updateExtension(
  extensionId: string,
  extensionsPath: string,
  options: UpdateOptions = {}
): Promise<{
  success: boolean
  previousVersion?: string
  newVersion?: string
  error?: string
}> {
  const {
    version,
    allowBreaking = false,
    createRollback = true,
    onProgress,
    storeApiUrl = DEFAULT_STORE_API_URL,
    orgApiUrl,
    authToken,
  } = options
  
  try {
    // Get current version
    const currentVersion = await getInstalledVersion(extensionId, extensionsPath)
    
    if (!currentVersion) {
      return {
        success: false,
        error: `Extension ${extensionId} is not installed`,
      }
    }
    
    // Get target version
    let targetVersion = version
    
    if (!targetVersion) {
      // Get latest version from store
      const versions = await getExtensionVersions(extensionId, storeApiUrl)
      if (versions.length === 0) {
        return {
          success: false,
          error: 'No versions available in store',
        }
      }
      
      // Sort and get latest
      const sorted = [...versions].sort((a, b) => 
        compareVersions(b.version, a.version)
      )
      targetVersion = sorted[0].version
    }
    
    // Check if already at this version
    if (compareVersions(currentVersion, targetVersion) === 0) {
      return {
        success: true,
        previousVersion: currentVersion,
        newVersion: targetVersion,
      }
    }
    
    // Check for breaking change
    if (!allowBreaking) {
      const [currentMajor] = currentVersion.split('.').map(Number)
      const [targetMajor] = targetVersion.split('.').map(Number)
      
      if (targetMajor > currentMajor) {
        return {
          success: false,
          previousVersion: currentVersion,
          error: `Version ${targetVersion} is a breaking change. Use allowBreaking option to proceed.`,
        }
      }
    }
    
    // Create rollback entry before update
    if (createRollback) {
      await saveRollbackEntry({
        extensionId,
        previousVersion: currentVersion,
        currentVersion: targetVersion,
        updatedAt: new Date().toISOString(),
      })
    }
    
    // Install new version (will overwrite)
    const result = await installFromStore(extensionId, extensionsPath, {
      version: targetVersion,
      force: true,
      onProgress,
      storeApiUrl,
      orgApiUrl,
      authToken,
    })
    
    if (!result.success) {
      // Remove rollback entry on failure
      if (createRollback) {
        await removeRollbackEntry(extensionId)
      }
      
      return {
        success: false,
        previousVersion: currentVersion,
        error: result.error,
      }
    }
    
    return {
      success: true,
      previousVersion: currentVersion,
      newVersion: targetVersion,
    }
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLLBACK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rollback an extension to its previous version.
 * 
 * @param extensionId - Extension to rollback
 * @param extensionsPath - Local extensions directory
 * @param options - Rollback options
 * @returns Rollback result
 */
export async function rollbackExtension(
  extensionId: string,
  extensionsPath: string,
  options: {
    onProgress?: InstallProgressCallback
    storeApiUrl?: string
    orgApiUrl?: string
    authToken?: string
  } = {}
): Promise<{
  success: boolean
  rolledBackTo?: string
  error?: string
}> {
  const { onProgress, storeApiUrl, orgApiUrl, authToken } = options
  
  try {
    // Get rollback entry
    const entry = await getRollbackEntry(extensionId)
    
    if (!entry) {
      return {
        success: false,
        error: 'No rollback entry found for this extension',
      }
    }
    
    // Check if rollback entry is expired
    const updatedAt = new Date(entry.updatedAt)
    const expiresAt = new Date(updatedAt.getTime() + ROLLBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    
    if (new Date() > expiresAt) {
      await removeRollbackEntry(extensionId)
      return {
        success: false,
        error: 'Rollback entry has expired',
      }
    }
    
    // Install previous version
    const result = await installFromStore(extensionId, extensionsPath, {
      version: entry.previousVersion,
      force: true,
      onProgress,
      storeApiUrl,
      orgApiUrl,
      authToken,
    })
    
    if (!result.success) {
      return {
        success: false,
        error: result.error,
      }
    }
    
    // Remove rollback entry after successful rollback
    await removeRollbackEntry(extensionId)
    
    return {
      success: true,
      rolledBackTo: entry.previousVersion,
    }
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Check if an extension can be rolled back.
 */
export async function canRollback(extensionId: string): Promise<{
  canRollback: boolean
  previousVersion?: string
  expiresAt?: Date
}> {
  const entry = await getRollbackEntry(extensionId)
  
  if (!entry) {
    return { canRollback: false }
  }
  
  const updatedAt = new Date(entry.updatedAt)
  const expiresAt = new Date(updatedAt.getTime() + ROLLBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  
  if (new Date() > expiresAt) {
    return { canRollback: false }
  }
  
  return {
    canRollback: true,
    previousVersion: entry.previousVersion,
    expiresAt,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION PINNING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pin an extension to a specific version.
 * Pinned extensions won't show update notifications.
 */
export async function pinVersion(
  extensionId: string,
  version: string,
  options: {
    pinnedBy?: string
    reason?: string
  } = {}
): Promise<void> {
  const pin: VersionPin = {
    extensionId,
    version,
    pinnedAt: new Date().toISOString(),
    pinnedBy: options.pinnedBy,
    reason: options.reason,
  }
  
  const pins = await getVersionPins()
  pins.set(extensionId, pin)
  await saveVersionPins(pins)
}

/**
 * Unpin an extension (allow updates).
 */
export async function unpinVersion(extensionId: string): Promise<void> {
  const pins = await getVersionPins()
  pins.delete(extensionId)
  await saveVersionPins(pins)
}

/**
 * Get all version pins.
 */
export async function getVersionPins(): Promise<Map<string, VersionPin>> {
  const pins = new Map<string, VersionPin>()
  
  if (typeof localStorage !== 'undefined') {
    const data = localStorage.getItem('extension-version-pins')
    if (data) {
      try {
        const parsed = JSON.parse(data) as Record<string, VersionPin>
        for (const [key, value] of Object.entries(parsed)) {
          pins.set(key, value)
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
  
  return pins
}

/**
 * Check if an extension is pinned.
 */
export async function isPinned(extensionId: string): Promise<VersionPin | undefined> {
  const pins = await getVersionPins()
  return pins.get(extensionId)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLLBACK STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

async function saveRollbackEntry(entry: RollbackEntry): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      `${ROLLBACK_STORAGE_PREFIX}${entry.extensionId}`,
      JSON.stringify(entry)
    )
  }
}

async function getRollbackEntry(extensionId: string): Promise<RollbackEntry | null> {
  if (typeof localStorage !== 'undefined') {
    const data = localStorage.getItem(`${ROLLBACK_STORAGE_PREFIX}${extensionId}`)
    if (data) {
      try {
        return JSON.parse(data) as RollbackEntry
      } catch {
        return null
      }
    }
  }
  return null
}

async function removeRollbackEntry(extensionId: string): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`${ROLLBACK_STORAGE_PREFIX}${extensionId}`)
  }
}

async function saveVersionPins(pins: Map<string, VersionPin>): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    const obj: Record<string, VersionPin> = {}
    for (const [key, value] of pins) {
      obj[key] = value
    }
    localStorage.setItem('extension-version-pins', JSON.stringify(obj))
  }
}

/**
 * Clean up expired rollback entries.
 */
export async function cleanupExpiredRollbacks(): Promise<number> {
  if (typeof localStorage === 'undefined') {
    return 0
  }
  
  let cleaned = 0
  const now = new Date()
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(ROLLBACK_STORAGE_PREFIX)) {
      continue
    }
    
    const data = localStorage.getItem(key)
    if (!data) continue
    
    try {
      const entry = JSON.parse(data) as RollbackEntry
      const updatedAt = new Date(entry.updatedAt)
      const expiresAt = new Date(updatedAt.getTime() + ROLLBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000)
      
      if (now > expiresAt) {
        localStorage.removeItem(key)
        cleaned++
      }
    } catch {
      // Remove invalid entries
      localStorage.removeItem(key)
      cleaned++
    }
  }
  
  return cleaned
}
