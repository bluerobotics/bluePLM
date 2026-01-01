/**
 * Shared utility functions used across the application
 * This file should have no internal dependencies to avoid circular imports
 */

/**
 * Build full path from vault path and relative path
 * Handles cross-platform path separators (Windows vs macOS/Linux)
 */
export function buildFullPath(vaultPath: string, relativePath: string): string {
  if (!relativePath) return vaultPath
  const isWindows = vaultPath.includes('\\')
  const sep = isWindows ? '\\' : '/'
  const normalizedRelative = relativePath.replace(/[/\\]/g, sep)
  return `${vaultPath}${sep}${normalizedRelative}`
}

/**
 * Format bytes to human-readable string (B, KB, MB, GB)
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

/**
 * Format speed in bytes per second to human-readable string
 */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${bytesPerSec.toFixed(0)} B/s`
}

/**
 * Get parent directory from a path
 */
export function getParentDir(fullPath: string): string {
  const lastSlash = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'))
  return lastSlash > 0 ? fullPath.substring(0, lastSlash) : fullPath
}
