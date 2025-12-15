/**
 * BluePLM Storage Service
 * 
 * Handles file storage using Supabase Storage with content-addressable storage.
 * Each file version is stored by its SHA-256 hash, enabling deduplication.
 * 
 * Storage structure:
 *   vault/{org_id}/{hash}           - Actual file content (deduplicated)
 *   
 * Database tracks:
 *   files table                     - Current file metadata
 *   file_versions table             - All versions with hash references
 */
// @ts-nocheck - TODO: Fix Supabase type inference issues

import { supabase } from './supabase'

const BUCKET_NAME = 'vault'

// Comprehensive logging helper for storage operations
interface StorageLogContext {
  operation: string
  orgId?: string
  hash?: string
  path?: string
  fileName?: string
  fileSize?: number
  startTime?: number
}

function logStorageOperation(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: StorageLogContext, error?: unknown) {
  const timestamp = new Date().toISOString()
  const duration = context.startTime ? `${Date.now() - context.startTime}ms` : undefined
  
  const logData = {
    timestamp,
    level,
    message,
    ...context,
    duration,
    error: error ? {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      raw: error instanceof Error ? undefined : error
    } : undefined
  }
  
  // Log to console with formatting
  const prefix = `[Storage:${context.operation}]`
  if (level === 'error') {
    console.error(prefix, message, logData)
  } else if (level === 'warn') {
    console.warn(prefix, message, logData)
  } else if (level === 'debug') {
    console.debug(prefix, message, logData)
  } else {
    console.log(prefix, message, logData)
  }
  
  // Also log to electron main process for persistent logging
  try {
    window.electronAPI?.log(level, `${prefix} ${message}`, logData)
  } catch {
    // Ignore if electronAPI not available (e.g., in tests)
  }
}

// Hash a file using SHA-256
export async function hashFile(file: File | Blob | ArrayBuffer): Promise<string> {
  let buffer: ArrayBuffer
  
  if (file instanceof ArrayBuffer) {
    buffer = file
  } else {
    buffer = await file.arrayBuffer()
  }
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Get storage path for a content hash
function getStoragePath(orgId: string, hash: string): string {
  // Store in subdirectories based on first 2 chars of hash (like Git)
  // This prevents having millions of files in one directory
  return `${orgId}/${hash.substring(0, 2)}/${hash}`
}

/**
 * Upload a file to storage
 * Returns the content hash
 */
export async function uploadFile(
  orgId: string,
  fileData: File | Blob | ArrayBuffer,
  _onProgress?: (progress: number) => void
): Promise<{ hash: string; size: number; error?: string }> {
  const startTime = Date.now()
  const size = fileData instanceof ArrayBuffer 
    ? fileData.byteLength 
    : (fileData as Blob).size
  const fileName = fileData instanceof File ? fileData.name : undefined
  
  const ctx: StorageLogContext = {
    operation: 'upload',
    orgId,
    fileName,
    fileSize: size,
    startTime
  }
  
  try {
    logStorageOperation('debug', 'Starting upload', ctx)
    
    // Calculate hash
    const hash = await hashFile(fileData)
    ctx.hash = hash
    const storagePath = getStoragePath(orgId, hash)
    ctx.path = storagePath
    
    logStorageOperation('debug', 'Hash calculated, checking for duplicates', ctx)
    
    // Check if this content already exists (deduplication)
    const { data: existing, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(`${orgId}/${hash.substring(0, 2)}`, {
        search: hash
      })
    
    if (listError) {
      logStorageOperation('warn', 'Error checking for existing file (continuing with upload)', ctx, listError)
    }
    
    if (existing && existing.length > 0) {
      // File already exists, no need to upload again
      logStorageOperation('info', 'File already exists (deduplication)', ctx)
      return { hash, size }
    }
    
    // Convert to Blob if needed
    let blob: Blob
    if (fileData instanceof ArrayBuffer) {
      blob = new Blob([fileData])
    } else if (fileData instanceof File) {
      blob = fileData
    } else {
      blob = fileData
    }
    
    logStorageOperation('debug', 'Uploading to storage', ctx)
    
    // Upload to storage
    const { error, data } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, blob, {
        cacheControl: '31536000', // Cache for 1 year (content-addressed = immutable)
        upsert: false // Don't overwrite (shouldn't happen with content-addressing)
      })
    
    if (error) {
      // Ignore "already exists" errors (race condition)
      if (!error.message.includes('already exists')) {
        logStorageOperation('error', 'Upload failed', ctx, {
          message: error.message,
          statusCode: (error as any).statusCode,
          error: (error as any).error,
          details: error
        })
        return { hash: '', size: 0, error: `Upload failed: ${error.message}` }
      }
      logStorageOperation('debug', 'File already exists (race condition)', ctx)
    } else {
      logStorageOperation('info', 'Upload successful', { ...ctx, uploadedPath: data?.path })
    }
    
    return { hash, size: blob.size }
  } catch (err) {
    logStorageOperation('error', 'Upload exception', ctx, err)
    return { hash: '', size: 0, error: `Upload exception: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Download a file from storage by hash
 */
export async function downloadFile(
  orgId: string,
  hash: string
): Promise<{ data: Blob | null; error?: string }> {
  const startTime = Date.now()
  const ctx: StorageLogContext = {
    operation: 'download',
    orgId,
    hash,
    startTime
  }
  
  try {
    // Validate inputs
    if (!orgId) {
      const errorMsg = 'Missing organization ID'
      logStorageOperation('error', errorMsg, ctx)
      return { data: null, error: errorMsg }
    }
    
    if (!hash) {
      const errorMsg = 'Missing content hash'
      logStorageOperation('error', errorMsg, ctx)
      return { data: null, error: errorMsg }
    }
    
    logStorageOperation('debug', 'Starting download', ctx)
    
    // Try old flat structure first (most existing files use this)
    const flatPath = `${orgId}/${hash}`
    ctx.path = flatPath
    logStorageOperation('debug', 'Trying flat path', ctx)
    
    let { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(flatPath)
    
    // If not found, try new subdirectory structure
    if (error) {
      logStorageOperation('debug', 'Flat path failed, trying subdirectory structure', ctx, {
        message: error.message,
        statusCode: (error as any).statusCode,
        error: (error as any).error,
        cause: (error as any).cause
      })
      
      const storagePath = getStoragePath(orgId, hash)
      ctx.path = storagePath
      
      const result = await supabase.storage
        .from(BUCKET_NAME)
        .download(storagePath)
      
      if (!result.error && result.data) {
        logStorageOperation('info', 'Downloaded from subdirectory path', { ...ctx, fileSize: result.data.size })
        return { data: result.data }
      }
      
      // Both paths failed - log detailed error
      const combinedError = {
        flatPathError: {
          message: error.message,
          statusCode: (error as any).statusCode,
          error: (error as any).error
        },
        subDirError: result.error ? {
          message: result.error.message,
          statusCode: (result.error as any).statusCode,
          error: (result.error as any).error
        } : null
      }
      
      logStorageOperation('error', 'Download failed - file not found in storage', ctx, combinedError)
      
      // Provide more helpful error message
      const statusCode = (error as any).statusCode || (result.error as any)?.statusCode
      let errorMsg = `File not found in storage (hash: ${hash.substring(0, 8)}...)`
      if (statusCode === 404) {
        errorMsg = `File not found in cloud storage. It may have been deleted or the hash is incorrect. Hash: ${hash.substring(0, 12)}...`
      } else if (statusCode === 403) {
        errorMsg = `Access denied to storage. Check storage bucket permissions. Hash: ${hash.substring(0, 12)}...`
      } else if (statusCode === 400) {
        errorMsg = `Invalid storage request. Hash: ${hash.substring(0, 12)}... Error: ${error.message}`
      }
      
      return { data: null, error: errorMsg }
    }
    
    logStorageOperation('info', 'Downloaded from flat path', { ...ctx, fileSize: data?.size })
    return { data }
  } catch (err) {
    logStorageOperation('error', 'Download exception', ctx, err)
    return { data: null, error: `Download exception: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Progress callback for download
 */
export interface DownloadProgress {
  loaded: number
  total: number
  speed: number // bytes per second
}

/**
 * Download a file with real-time progress tracking
 * Uses signed URLs and fetch with readable streams for progress
 */
export async function downloadFileWithProgress(
  orgId: string,
  hash: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ data: Blob | null; error?: string }> {
  const startTime = Date.now()
  const ctx: StorageLogContext = {
    operation: 'download-progress',
    orgId,
    hash,
    startTime
  }
  
  try {
    if (!orgId || !hash) {
      const errorMsg = `Missing required parameters: ${!orgId ? 'orgId' : ''} ${!hash ? 'hash' : ''}`
      logStorageOperation('error', errorMsg, ctx)
      return { data: null, error: errorMsg }
    }
    
    logStorageOperation('debug', 'Starting download with progress', ctx)
    
    // Try flat path first for signed URL
    const flatPath = `${orgId}/${hash}`
    ctx.path = flatPath
    let signedUrlResult = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(flatPath, 3600) // 1 hour expiry
    
    // If flat path fails, try subdirectory structure
    if (signedUrlResult.error) {
      logStorageOperation('debug', 'Flat path signed URL failed, trying subdirectory', ctx, {
        message: signedUrlResult.error.message,
        statusCode: (signedUrlResult.error as any).statusCode
      })
      
      const storagePath = getStoragePath(orgId, hash)
      ctx.path = storagePath
      signedUrlResult = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(storagePath, 3600)
      
      if (signedUrlResult.error) {
        logStorageOperation('error', 'Failed to create signed URL', ctx, {
          message: signedUrlResult.error.message,
          statusCode: (signedUrlResult.error as any).statusCode,
          error: (signedUrlResult.error as any).error
        })
        return { data: null, error: `Failed to get download URL: ${signedUrlResult.error.message}` }
      }
    }
    
    const url = signedUrlResult.data.signedUrl
    logStorageOperation('debug', 'Got signed URL, starting fetch', ctx)
    
    // Use fetch with readable stream for progress tracking
    const response = await fetch(url)
    
    if (!response.ok) {
      logStorageOperation('error', 'HTTP fetch failed', ctx, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      })
      return { data: null, error: `HTTP ${response.status}: ${response.statusText}` }
    }
    
    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : 0
    ctx.fileSize = total
    
    if (!response.body) {
      // Fallback if no body (shouldn't happen)
      logStorageOperation('warn', 'Response has no body, using blob fallback', ctx)
      const blob = await response.blob()
      return { data: blob }
    }
    
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    let lastProgressTime = startTime
    let lastLoaded = 0
    
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break
      
      chunks.push(value)
      loaded += value.length
      
      // Calculate speed (use rolling average over last 500ms for smoother display)
      const now = Date.now()
      const timeSinceLastProgress = now - lastProgressTime
      
      if (timeSinceLastProgress >= 100 && onProgress) { // Update every 100ms
        const bytesSinceLastProgress = loaded - lastLoaded
        const speed = timeSinceLastProgress > 0 
          ? (bytesSinceLastProgress / timeSinceLastProgress) * 1000 
          : 0
        
        onProgress({
          loaded,
          total,
          speed
        })
        
        lastProgressTime = now
        lastLoaded = loaded
      }
    }
    
    // Final progress update
    if (onProgress) {
      const elapsed = Date.now() - startTime
      const speed = elapsed > 0 ? (loaded / elapsed) * 1000 : 0
      onProgress({ loaded, total: loaded, speed })
    }
    
    // Combine chunks into blob
    const blob = new Blob(chunks)
    logStorageOperation('info', 'Download with progress completed', { ...ctx, fileSize: blob.size })
    return { data: blob }
  } catch (err) {
    logStorageOperation('error', 'Download with progress exception', ctx, err)
    return { data: null, error: `Download failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Get a signed URL for direct download (faster for large files)
 * Tries flat path first, then subdirectory structure
 */
export async function getDownloadUrl(
  orgId: string,
  hash: string,
  expiresInSeconds: number = 3600
): Promise<{ url: string | null; error?: string }> {
  const startTime = Date.now()
  const ctx: StorageLogContext = {
    operation: 'get-url',
    orgId,
    hash,
    startTime
  }
  
  try {
    if (!orgId) {
      const errorMsg = 'Missing organization ID for signed URL'
      logStorageOperation('error', errorMsg, ctx)
      return { url: null, error: errorMsg }
    }
    
    if (!hash) {
      const errorMsg = 'Missing content hash for signed URL'
      logStorageOperation('error', errorMsg, ctx)
      return { url: null, error: errorMsg }
    }
    
    logStorageOperation('debug', 'Getting signed URL', ctx)
    
    // Try flat path first (most existing files use this)
    const flatPath = `${orgId}/${hash}`
    ctx.path = flatPath
    let result = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(flatPath, expiresInSeconds)
    
    if (!result.error && result.data) {
      logStorageOperation('debug', 'Got signed URL from flat path', ctx)
      return { url: result.data.signedUrl }
    }
    
    // Log flat path failure
    logStorageOperation('debug', 'Flat path failed, trying subdirectory', ctx, {
      message: result.error?.message,
      statusCode: (result.error as any)?.statusCode
    })
    
    // Try subdirectory structure
    const storagePath = getStoragePath(orgId, hash)
    ctx.path = storagePath
    result = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, expiresInSeconds)
    
    if (result.error) {
      logStorageOperation('error', 'Failed to get signed URL from both paths', ctx, {
        message: result.error.message,
        statusCode: (result.error as any)?.statusCode,
        error: (result.error as any)?.error,
        hint: 'File may not exist in storage bucket or bucket permissions may be incorrect'
      })
      
      // Provide more descriptive error
      const statusCode = (result.error as any)?.statusCode
      let errorMsg = `Cannot get download URL: ${result.error.message}`
      if (statusCode === 400 && result.error.message.includes('not found')) {
        errorMsg = `File not found in cloud storage (hash: ${hash.substring(0, 12)}...). The file may have been deleted or never uploaded.`
      } else if (statusCode === 403) {
        errorMsg = `Access denied to storage bucket. Please check your permissions.`
      }
      
      return { url: null, error: errorMsg }
    }
    
    logStorageOperation('debug', 'Got signed URL from subdirectory path', ctx)
    return { url: result.data.signedUrl }
  } catch (err) {
    logStorageOperation('error', 'Exception getting signed URL', ctx, err)
    return { url: null, error: `Failed to get download URL: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Check if a file exists in storage
 */
export async function fileExists(orgId: string, hash: string): Promise<boolean> {
  const dir = `${orgId}/${hash.substring(0, 2)}`
  
  const { data } = await supabase.storage
    .from(BUCKET_NAME)
    .list(dir, { search: hash })
  
  return data !== null && data.length > 0
}

/**
 * Delete a file from storage (admin only, use with caution)
 * Only delete if no file_versions reference this hash
 */
export async function deleteFile(
  orgId: string,
  hash: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const storagePath = getStoragePath(orgId, hash)
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath])
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Get storage usage for an organization
 */
export async function getStorageUsage(orgId: string): Promise<{
  totalBytes: number
  fileCount: number
  error?: string
}> {
  try {
    // List all files in org's storage
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(orgId, {
        limit: 10000,
        sortBy: { column: 'created_at', order: 'desc' }
      })
    
    if (error) {
      return { totalBytes: 0, fileCount: 0, error: error.message }
    }
    
    // This only lists directories at first level, need to go deeper
    // For accurate count, query the database instead
    const { data: dbData, error: dbError } = await supabase
      .from('file_versions')
      .select('file_size')
      .eq('org_id', orgId)
    
    if (dbError) {
      return { totalBytes: 0, fileCount: 0, error: dbError.message }
    }
    
    const totalBytes = dbData?.reduce((sum, v) => sum + (v.file_size || 0), 0) || 0
    const fileCount = dbData?.length || 0
    
    return { totalBytes, fileCount }
  } catch (err) {
    return { totalBytes: 0, fileCount: 0, error: String(err) }
  }
}

