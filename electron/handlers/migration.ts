// Migration handler for major version upgrades
// Handles clean install when upgrading from 2.x to 3.0+

import { app, session } from 'electron'
import fs from 'fs'
import path from 'path'

// ============================================
// Types
// ============================================

interface VersionInfo {
  version: string
  lastRun: string
  migratedFrom?: string
}

interface MigrationResult {
  performed: boolean
  fromVersion: string | null
  toVersion: string
  cleanedPaths: string[]
  errors: string[]
}

// ============================================
// Module State
// ============================================

let migrationResult: MigrationResult | null = null

// ============================================
// Paths
// ============================================

function getVersionFilePath(): string {
  return path.join(app.getPath('userData'), 'app-version.json')
}

function getTempUpdatePath(): string {
  return path.join(app.getPath('temp'), 'blueplm-updates')
}

// ============================================
// Version Management
// ============================================

function loadStoredVersion(): VersionInfo | null {
  try {
    const versionFile = getVersionFilePath()
    if (fs.existsSync(versionFile)) {
      const data = fs.readFileSync(versionFile, 'utf-8')
      return JSON.parse(data)
    }
  } catch {
    // File doesn't exist or is corrupted
  }
  return null
}

function saveVersion(version: string, migratedFrom?: string): void {
  try {
    const versionInfo: VersionInfo = {
      version,
      lastRun: new Date().toISOString(),
      ...(migratedFrom && { migratedFrom })
    }
    
    // Ensure userData directory exists
    const userDataPath = app.getPath('userData')
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    
    fs.writeFileSync(getVersionFilePath(), JSON.stringify(versionInfo, null, 2))
  } catch (err) {
    console.error('[Migration] Failed to save version info:', err)
  }
}

// ============================================
// Version Comparison
// ============================================

function getMajorVersion(version: string): number {
  const match = version.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function shouldPerformCleanInstall(fromVersion: string | null, toVersion: string): boolean {
  // If no previous version stored, this might be:
  // 1. A fresh install (no migration needed)
  // 2. An upgrade from an older version that didn't track versions
  // For safety, we check if userData has old data patterns
  if (!fromVersion) {
    // Check for telltale signs of a pre-3.0 installation (no version tracking)
    const userDataPath = app.getPath('userData')
    const hasLegacyData = (
      fs.existsSync(path.join(userDataPath, 'window-state.json')) ||
      fs.existsSync(path.join(userDataPath, 'analytics-settings.json')) ||
      fs.existsSync(path.join(userDataPath, 'logs'))
    )
    
    // If we have legacy data but no version file, assume it's a pre-3.0 upgrade
    if (hasLegacyData) {
      console.log('[Migration] Found legacy data without version file - treating as pre-3.0 upgrade')
      return getMajorVersion(toVersion) >= 3
    }
    
    return false
  }
  
  const fromMajor = getMajorVersion(fromVersion)
  const toMajor = getMajorVersion(toVersion)
  
  // Clean install on ANY major version upgrade (2→3, 3→4, 4→5, etc.)
  // This ensures a fresh start with each major release
  return toMajor > fromMajor
}

// ============================================
// Data Cleanup
// ============================================

function deleteRecursive(targetPath: string): boolean {
  try {
    if (!fs.existsSync(targetPath)) {
      return false
    }
    
    const stats = fs.statSync(targetPath)
    if (stats.isDirectory()) {
      const entries = fs.readdirSync(targetPath)
      for (const entry of entries) {
        deleteRecursive(path.join(targetPath, entry))
      }
      fs.rmdirSync(targetPath)
    } else {
      fs.unlinkSync(targetPath)
    }
    return true
  } catch (err) {
    console.error(`[Migration] Failed to delete ${targetPath}:`, err)
    return false
  }
}

function cleanUserData(): { cleaned: string[]; errors: string[] } {
  const userDataPath = app.getPath('userData')
  const cleaned: string[] = []
  const errors: string[] = []
  
  // Files/folders to delete in userData
  const itemsToDelete = [
    'window-state.json',
    'analytics-settings.json',
    'log-settings.json',
    'log-recording-state.json',
    'update-reminder.json',
    'logs',
    'Crashpad',
    // Electron's internal storage
    'Local Storage',
    'Session Storage',
    'IndexedDB',
    'Cache',
    'Code Cache',
    'GPUCache',
    'blob_storage',
    'databases',
    'Network',
    'Preferences',
    'TransportSecurity',
    'Service Worker',
    // Don't delete app-version.json - we need to write to it after
  ]
  
  for (const item of itemsToDelete) {
    const itemPath = path.join(userDataPath, item)
    try {
      if (deleteRecursive(itemPath)) {
        cleaned.push(itemPath)
        console.log(`[Migration] Deleted: ${item}`)
      }
    } catch (err) {
      errors.push(`Failed to delete ${item}: ${String(err)}`)
    }
  }
  
  return { cleaned, errors }
}

function cleanTempFiles(): { cleaned: string[]; errors: string[] } {
  const cleaned: string[] = []
  const errors: string[] = []
  
  // Clean BluePLM temp folder
  const tempPath = getTempUpdatePath()
  try {
    if (deleteRecursive(tempPath)) {
      cleaned.push(tempPath)
      console.log('[Migration] Deleted temp updates folder')
    }
  } catch (err) {
    errors.push(`Failed to delete temp folder: ${String(err)}`)
  }
  
  return { cleaned, errors }
}

// ============================================
// Main Migration Function
// ============================================

/**
 * Check and perform migration if needed.
 * This should be called BEFORE the window is created.
 * Returns information about what was done.
 */
export async function performMigrationCheck(): Promise<MigrationResult> {
  const currentVersion = app.getVersion()
  const storedVersionInfo = loadStoredVersion()
  const previousVersion = storedVersionInfo?.version ?? null
  
  console.log(`[Migration] Current version: ${currentVersion}`)
  console.log(`[Migration] Previous version: ${previousVersion ?? 'none (first run or legacy)'}`)
  
  const result: MigrationResult = {
    performed: false,
    fromVersion: previousVersion,
    toVersion: currentVersion,
    cleanedPaths: [],
    errors: []
  }
  
  if (shouldPerformCleanInstall(previousVersion, currentVersion)) {
    const fromMajor = previousVersion ? getMajorVersion(previousVersion) : 'legacy'
    const toMajor = getMajorVersion(currentVersion)
    console.log('[Migration] ===== PERFORMING CLEAN INSTALL MIGRATION =====')
    console.log(`[Migration] Major version upgrade: ${fromMajor} → ${toMajor}`)
    console.log(`[Migration] Upgrading from ${previousVersion ?? 'pre-3.0 (legacy)'} to ${currentVersion}`)
    
    result.performed = true
    
    // Clean user data
    const userDataResult = cleanUserData()
    result.cleanedPaths.push(...userDataResult.cleaned)
    result.errors.push(...userDataResult.errors)
    
    // Clean temp files
    const tempResult = cleanTempFiles()
    result.cleanedPaths.push(...tempResult.cleaned)
    result.errors.push(...tempResult.errors)
    
    // Clear session storage (localStorage, IndexedDB, cookies, etc.)
    // This needs to happen after app is ready
    try {
      await session.defaultSession.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'websql',
          'serviceworkers',
          'cachestorage'
        ]
      })
      console.log('[Migration] Cleared Electron session storage')
    } catch (err) {
      console.error('[Migration] Failed to clear session storage:', err)
      result.errors.push(`Failed to clear session storage: ${String(err)}`)
    }
    
    console.log(`[Migration] Clean install complete. Cleaned ${result.cleanedPaths.length} items.`)
    if (result.errors.length > 0) {
      console.warn(`[Migration] Encountered ${result.errors.length} errors:`, result.errors)
    }
    
    // Save new version (with migration info)
    saveVersion(currentVersion, previousVersion ?? 'pre-3.0')
  } else {
    // Just update the version file
    saveVersion(currentVersion)
    console.log('[Migration] No migration needed')
  }
  
  migrationResult = result
  return result
}

/**
 * Get the migration result from the last check.
 * Useful for showing a notification to the user.
 */
export function getMigrationResult(): MigrationResult | null {
  return migrationResult
}

/**
 * Check if a migration was performed on this startup.
 */
export function wasMigrationPerformed(): boolean {
  return migrationResult?.performed ?? false
}
