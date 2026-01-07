/**
 * Path matching utilities for SolidWorks integration.
 * 
 * Provides functions to normalize and match SolidWorks file paths to database records.
 * Handles the complexity of different path formats, drive letters, and vault structures.
 */

import type { PathMatchResult, VaultFileSummary } from './types'

/**
 * Normalize a file path for comparison.
 * 
 * Transforms paths to a canonical format:
 * - Converts to lowercase for case-insensitive comparison
 * - Converts backslashes to forward slashes
 * - Removes leading and trailing slashes
 * 
 * @param path - The file path to normalize
 * @returns Normalized path string
 * 
 * @example
 * normalizePath("C:\\Users\\Vault\\Parts\\Widget.SLDPRT")
 * // Returns: "c:/users/vault/parts/widget.sldprt"
 */
export function normalizePath(path: string): string {
  return path
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/g, '')
}

/**
 * Get the last N segments of a path.
 * 
 * Useful for matching paths that may have different root directories
 * but share the same relative structure.
 * 
 * @param path - The file path (should be normalized with forward slashes)
 * @param segments - Number of path segments to return from the end
 * @returns The last N segments joined by forward slashes
 * 
 * @example
 * getPathSuffix("vault/parts/mechanical/widget.sldprt", 2)
 * // Returns: "mechanical/widget.sldprt"
 */
export function getPathSuffix(path: string, segments: number): string {
  const parts = path.split('/').filter(s => s.length > 0)
  if (parts.length <= segments) return parts.join('/')
  return parts.slice(-segments).join('/')
}

/**
 * Match a SolidWorks file path to a database file.
 * 
 * Uses a multi-strategy approach to find the best match:
 * 
 * 1. **Exact match**: After stripping vault root, paths match exactly
 * 2. **Suffix match**: SW path ends with DB path, or last 2 segments match
 * 3. **Filename match**: Filename is unique in the vault
 * 
 * @param swPath - Full file path from SolidWorks
 * @param dbFiles - Array of vault files to match against
 * @param vaultRootPath - Optional vault root path to strip from SW path
 * @returns PathMatchResult with match details
 * 
 * @example
 * const result = matchSwPathToDb(
 *   "C:\\Vault\\Parts\\Widget.SLDPRT",
 *   vaultFiles,
 *   "C:\\Vault"
 * )
 * // result.matchMethod could be 'exact' if "Parts/Widget.SLDPRT" exists
 */
export function matchSwPathToDb(
  swPath: string,
  dbFiles: VaultFileSummary[],
  vaultRootPath?: string
): PathMatchResult {
  const normalizedSwPath = normalizePath(swPath)
  const fileName = normalizedSwPath.split('/').pop() || ''
  const suffix2 = getPathSuffix(normalizedSwPath, 2)
  
  // Try to strip vault root if provided
  let relativePath = normalizedSwPath
  if (vaultRootPath) {
    const normalizedRoot = normalizePath(vaultRootPath)
    if (normalizedSwPath.startsWith(normalizedRoot + '/')) {
      relativePath = normalizedSwPath.substring(normalizedRoot.length + 1)
    } else if (normalizedSwPath.startsWith(normalizedRoot)) {
      relativePath = normalizedSwPath.substring(normalizedRoot.length).replace(/^\//, '')
    }
  }
  
  // Strategy 1: Exact relative path match
  for (const dbFile of dbFiles) {
    const normalizedDbPath = normalizePath(dbFile.file_path)
    if (normalizedDbPath === relativePath) {
      return {
        swPath,
        swFileName: fileName,
        matchedDbFile: dbFile,
        matchMethod: 'exact',
        normalizedSwPath,
        normalizedDbPath
      }
    }
  }
  
  // Strategy 2: SW path ends with DB path
  for (const dbFile of dbFiles) {
    const normalizedDbPath = normalizePath(dbFile.file_path)
    if (normalizedSwPath.endsWith('/' + normalizedDbPath) || normalizedSwPath === normalizedDbPath) {
      return {
        swPath,
        swFileName: fileName,
        matchedDbFile: dbFile,
        matchMethod: 'suffix',
        normalizedSwPath,
        normalizedDbPath
      }
    }
  }
  
  // Strategy 3: Path suffix matching (last 2 segments)
  for (const dbFile of dbFiles) {
    const normalizedDbPath = normalizePath(dbFile.file_path)
    const dbSuffix = getPathSuffix(normalizedDbPath, 2)
    if (suffix2 === dbSuffix) {
      return {
        swPath,
        swFileName: fileName,
        matchedDbFile: dbFile,
        matchMethod: 'suffix',
        normalizedSwPath,
        normalizedDbPath
      }
    }
  }
  
  // Strategy 4: Filename-only (check if unique)
  const matchingByName = dbFiles.filter(f => f.file_name.toLowerCase() === fileName)
  if (matchingByName.length === 1) {
    return {
      swPath,
      swFileName: fileName,
      matchedDbFile: matchingByName[0],
      matchMethod: 'filename',
      normalizedSwPath,
      normalizedDbPath: normalizePath(matchingByName[0].file_path)
    }
  }
  
  // No match found
  return {
    swPath,
    swFileName: fileName,
    matchedDbFile: null,
    matchMethod: 'none',
    normalizedSwPath,
    normalizedDbPath: null
  }
}

/**
 * Determine the path status and generate a user-friendly tooltip.
 * 
 * @param matchResult - Result from matchSwPathToDb
 * @returns Object with status and tooltip for UI display
 */
export function getPathStatusFromMatch(matchResult: PathMatchResult): {
  status: 'valid' | 'broken'
  tooltip: string
} {
  if (matchResult.matchMethod === 'none') {
    return {
      status: 'broken',
      tooltip: `Path not found in vault: ${matchResult.swFileName}`
    }
  }
  
  const methodDescriptions: Record<string, string> = {
    exact: 'Path matches exactly',
    suffix: 'Path matched by suffix',
    filename: 'Matched by filename (path may differ)'
  }
  
  return {
    status: 'valid',
    tooltip: methodDescriptions[matchResult.matchMethod] || 'Path validated'
  }
}
