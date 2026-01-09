/**
 * Extension Discovery
 * 
 * Discovers extensions from:
 * - Local file system (installed extensions)
 * - Extension Store (marketplace)
 * 
 * @module extensions/registry/discovery
 */

import type { 
  StoreExtension, 
  StoreExtensionVersion,
  LoadedExtension,
  VerificationStatus,
} from '../types'
import { parseManifest } from '../manifest'

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default Extension Store API URL.
 */
export const DEFAULT_STORE_API_URL = 'https://extensions.blueplm.io/api'

/**
 * Cache duration for store listings (5 minutes).
 */
const STORE_CACHE_DURATION_MS = 5 * 60 * 1000

/**
 * Extension manifest filename.
 */
const MANIFEST_FILENAME = 'extension.json'

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of local extension discovery.
 */
export interface LocalDiscoveryResult {
  /** Successfully discovered extensions */
  extensions: LoadedExtension[]
  /** Errors encountered during discovery */
  errors: Array<{ path: string; error: string }>
}

/**
 * Options for local discovery.
 */
export interface LocalDiscoveryOptions {
  /** Include sideloaded extensions */
  includeSideloaded?: boolean
  /** Verify signatures */
  verifySignatures?: boolean
}

/**
 * Discover locally installed extensions.
 * 
 * Extensions are stored in:
 * - Windows: %APPDATA%/BluePLM/extensions/
 * - macOS: ~/Library/Application Support/BluePLM/extensions/
 * - Linux: ~/.config/BluePLM/extensions/
 * 
 * @param extensionsPath - Base path where extensions are installed
 * @param options - Discovery options
 * @returns Discovery result with extensions and errors
 */
export async function discoverLocalExtensions(
  extensionsPath: string,
  options: LocalDiscoveryOptions = {}
): Promise<LocalDiscoveryResult> {
  const extensions: LoadedExtension[] = []
  const errors: Array<{ path: string; error: string }> = []
  
  // Check if we're in Electron with file API
  // Note: listDirectory will be added by Agent 5 (IPC Bridge)
  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined
  // @ts-expect-error - listDirectory will be added by Agent 5
  if (!electronAPI?.listDirectory) {
    console.warn('[Discovery] Local discovery requires Electron environment')
    return { extensions, errors }
  }
  
  try {
    // List extension directories
    // @ts-expect-error - listDirectory will be added by Agent 5
    const result = await electronAPI.listDirectory(extensionsPath) as { 
      success: boolean
      entries?: Array<{ name: string; isDirectory: boolean }>
    }
    
    if (!result.success || !result.entries) {
      return { extensions, errors }
    }
    
    // Filter to directories only
    const extensionDirs = result.entries.filter((e: { isDirectory: boolean }) => e.isDirectory)
    
    // Load each extension
    for (const dir of extensionDirs) {
      const extPath = `${extensionsPath}/${dir.name}`
      const manifestPath = `${extPath}/${MANIFEST_FILENAME}`
      
      try {
        // Read manifest
        const manifestResult = await window.electronAPI.readFile(manifestPath)
        
        if (!manifestResult.success || !manifestResult.data) {
          errors.push({ 
            path: extPath, 
            error: manifestResult.error || 'Failed to read manifest' 
          })
          continue
        }
        
        // Parse manifest (it comes as base64)
        const manifestJson = atob(manifestResult.data)
        const manifest = parseManifest(JSON.parse(manifestJson))
        
        // Determine verification status
        let verification: VerificationStatus = 'community'
        
        // Check for signature file
        const signaturePath = `${extPath}/SIGNATURE`
        const signatureResult = await window.electronAPI.fileExists(signaturePath)
        
        if (signatureResult) {
          // Has signature - would need to verify with store
          // For now, mark as verified (full verification happens elsewhere)
          verification = 'verified'
        }
        
        // Check if sideloaded (no registry entry)
        const registryPath = `${extPath}/.sideloaded`
        const isSideloaded = await window.electronAPI.fileExists(registryPath)
        
        if (isSideloaded) {
          if (!options.includeSideloaded) {
            continue
          }
          verification = 'sideloaded'
        }
        
        // Read installation metadata
        const metaPath = `${extPath}/.metadata.json`
        const metaResult = await window.electronAPI.readFile(metaPath)
        
        let installedAt: Date | undefined
        if (metaResult.success && metaResult.data) {
          try {
            const metadata = JSON.parse(atob(metaResult.data)) as { installedAt?: string }
            if (metadata.installedAt) {
              installedAt = new Date(metadata.installedAt)
            }
          } catch {
            // Ignore metadata parsing errors
          }
        }
        
        extensions.push({
          manifest,
          state: 'installed',
          verification,
          installedAt,
        })
        
      } catch (error) {
        errors.push({
          path: extPath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  } catch (error) {
    console.error('[Discovery] Failed to discover local extensions:', error)
    errors.push({
      path: extensionsPath,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  
  return { extensions, errors }
}

/**
 * Get the extensions directory path for the current platform.
 */
export function getExtensionsPath(): string {
  // Will be set by Electron main process
  // Note: getExtensionsPath will be added by Agent 5 (IPC Bridge)
  // @ts-expect-error - getExtensionsPath will be added by Agent 5
  if (typeof window !== 'undefined' && window.electronAPI?.getExtensionsPath) {
    // This would be async, but for synchronous access we use a cached value
    // The actual path is typically set during app initialization
  }
  
  // Default paths (will be overridden by Electron)
  if (typeof process !== 'undefined') {
    const platform = process.platform
    const home = process.env.HOME || process.env.USERPROFILE || ''
    
    switch (platform) {
      case 'win32':
        return `${process.env.APPDATA}/BluePLM/extensions`
      case 'darwin':
        return `${home}/Library/Application Support/BluePLM/extensions`
      default:
        return `${home}/.config/BluePLM/extensions`
    }
  }
  
  return 'extensions'
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORE DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Store discovery cache.
 */
interface StoreCache {
  extensions: StoreExtension[]
  timestamp: number
}

let storeCache: StoreCache | null = null

/**
 * Options for store discovery.
 */
export interface StoreDiscoveryOptions {
  /** Override store API URL */
  storeApiUrl?: string
  /** Force refresh (ignore cache) */
  forceRefresh?: boolean
  /** Category filter */
  categories?: string[]
  /** Only verified extensions */
  verifiedOnly?: boolean
  /** Search query */
  query?: string
  /** Number of results to fetch */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * Store discovery result.
 */
export interface StoreDiscoveryResult {
  /** Found extensions */
  extensions: StoreExtension[]
  /** Total count (for pagination) */
  total: number
  /** Whether result came from cache */
  cached: boolean
}

/**
 * Fetch extensions from the Extension Store.
 * 
 * @param options - Discovery options
 * @returns Store discovery result
 */
export async function discoverStoreExtensions(
  options: StoreDiscoveryOptions = {}
): Promise<StoreDiscoveryResult> {
  const {
    storeApiUrl = DEFAULT_STORE_API_URL,
    forceRefresh = false,
    categories,
    verifiedOnly,
    query,
    limit = 50,
    offset = 0,
  } = options
  
  // Check cache for non-filtered requests
  if (!forceRefresh && !categories && !verifiedOnly && !query && offset === 0 && storeCache) {
    const age = Date.now() - storeCache.timestamp
    if (age < STORE_CACHE_DURATION_MS) {
      return {
        extensions: storeCache.extensions.slice(0, limit),
        total: storeCache.extensions.length,
        cached: true,
      }
    }
  }
  
  try {
    // Build query params
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    
    if (categories?.length) {
      params.set('categories', categories.join(','))
    }
    if (verifiedOnly) {
      params.set('verified', 'true')
    }
    if (query) {
      params.set('q', query)
    }
    
    const response = await fetch(`${storeApiUrl}/store/extensions?${params}`)
    
    if (!response.ok) {
      throw new Error(`Store API returned ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json() as {
      extensions: StoreExtension[]
      total: number
    }
    
    // Transform dates
    const extensions = data.extensions.map(ext => ({
      ...ext,
      createdAt: new Date(ext.createdAt),
      updatedAt: new Date(ext.updatedAt),
      deprecation: ext.deprecation ? {
        ...ext.deprecation,
        deprecatedAt: new Date(ext.deprecation.deprecatedAt),
        sunsetDate: ext.deprecation.sunsetDate ? new Date(ext.deprecation.sunsetDate) : undefined,
      } : undefined,
    }))
    
    // Cache unfiltered results
    if (!categories && !verifiedOnly && !query && offset === 0) {
      storeCache = {
        extensions,
        timestamp: Date.now(),
      }
    }
    
    return {
      extensions,
      total: data.total,
      cached: false,
    }
    
  } catch (error) {
    console.error('[Discovery] Failed to fetch store extensions:', error)
    
    // Return cached data if available, even if stale
    if (storeCache) {
      console.warn('[Discovery] Using stale cache due to error')
      return {
        extensions: storeCache.extensions.slice(offset, offset + limit),
        total: storeCache.extensions.length,
        cached: true,
      }
    }
    
    throw error
  }
}

/**
 * Get featured extensions from the store.
 */
export async function getFeaturedExtensions(
  storeApiUrl: string = DEFAULT_STORE_API_URL
): Promise<StoreExtension[]> {
  try {
    const response = await fetch(`${storeApiUrl}/store/featured`)
    
    if (!response.ok) {
      throw new Error(`Store API returned ${response.status}`)
    }
    
    const data = await response.json() as { extensions: StoreExtension[] }
    
    return data.extensions.map(ext => ({
      ...ext,
      createdAt: new Date(ext.createdAt),
      updatedAt: new Date(ext.updatedAt),
    }))
    
  } catch (error) {
    console.error('[Discovery] Failed to fetch featured extensions:', error)
    return []
  }
}

/**
 * Get extension details from the store.
 */
export async function getStoreExtension(
  extensionId: string,
  storeApiUrl: string = DEFAULT_STORE_API_URL
): Promise<StoreExtension | null> {
  try {
    const response = await fetch(`${storeApiUrl}/store/extensions/${encodeURIComponent(extensionId)}`)
    
    if (response.status === 404) {
      return null
    }
    
    if (!response.ok) {
      throw new Error(`Store API returned ${response.status}`)
    }
    
    const ext = await response.json() as StoreExtension
    
    return {
      ...ext,
      createdAt: new Date(ext.createdAt),
      updatedAt: new Date(ext.updatedAt),
      deprecation: ext.deprecation ? {
        ...ext.deprecation,
        deprecatedAt: new Date(ext.deprecation.deprecatedAt),
        sunsetDate: ext.deprecation.sunsetDate ? new Date(ext.deprecation.sunsetDate) : undefined,
      } : undefined,
    }
    
  } catch (error) {
    console.error('[Discovery] Failed to fetch extension:', error)
    return null
  }
}

/**
 * Get versions for an extension from the store.
 */
export async function getExtensionVersions(
  extensionId: string,
  storeApiUrl: string = DEFAULT_STORE_API_URL
): Promise<StoreExtensionVersion[]> {
  try {
    const response = await fetch(`${storeApiUrl}/store/extensions/${encodeURIComponent(extensionId)}/versions`)
    
    if (!response.ok) {
      throw new Error(`Store API returned ${response.status}`)
    }
    
    const data = await response.json() as { versions: StoreExtensionVersion[] }
    
    return data.versions.map(v => ({
      ...v,
      publishedAt: new Date(v.publishedAt),
    }))
    
  } catch (error) {
    console.error('[Discovery] Failed to fetch versions:', error)
    return []
  }
}

/**
 * Get download URL for an extension.
 */
export function getExtensionDownloadUrl(
  extensionId: string,
  version?: string,
  storeApiUrl: string = DEFAULT_STORE_API_URL
): string {
  const base = `${storeApiUrl}/store/extensions/${encodeURIComponent(extensionId)}/download`
  return version ? `${base}/${encodeURIComponent(version)}` : base
}

/**
 * Clear the store cache.
 */
export function clearStoreCache(): void {
  storeCache = null
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search both local and store extensions.
 */
export async function searchExtensions(
  query: string,
  extensionsPath: string,
  options: {
    includeLocal?: boolean
    includeStore?: boolean
    storeApiUrl?: string
  } = {}
): Promise<{
  local: LoadedExtension[]
  store: StoreExtension[]
}> {
  const { 
    includeLocal = true, 
    includeStore = true,
    storeApiUrl = DEFAULT_STORE_API_URL,
  } = options
  
  const normalizedQuery = query.toLowerCase()
  
  const [localResult, storeResult] = await Promise.all([
    includeLocal ? discoverLocalExtensions(extensionsPath) : { extensions: [] },
    includeStore ? discoverStoreExtensions({ query, storeApiUrl }) : { extensions: [] },
  ])
  
  // Filter local extensions
  const local = localResult.extensions.filter(ext => {
    const manifest = ext.manifest
    return (
      manifest.id.toLowerCase().includes(normalizedQuery) ||
      manifest.name.toLowerCase().includes(normalizedQuery) ||
      manifest.description?.toLowerCase().includes(normalizedQuery) ||
      manifest.keywords?.some(k => k.toLowerCase().includes(normalizedQuery))
    )
  })
  
  return {
    local,
    store: storeResult.extensions,
  }
}
