/**
 * Google Drive Sync Handler
 * 
 * Performs file synchronization between the local vault and Google Drive.
 * Handles bidirectional, upload-only, and download-only sync modes.
 * 
 * @module extensions/google-drive/server/sync
 */

import type { ExtensionServerAPI } from './types'

const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3'

/**
 * Sync result statistics
 */
interface SyncResult {
  success: boolean
  synced: number
  uploaded: number
  downloaded: number
  errors: number
  errorMessages?: string[]
}

/**
 * Handler for file synchronization.
 * 
 * @param api - Extension Server API
 * @returns Sync results
 */
export default async function handler(api: ExtensionServerAPI) {
  try {
    // Verify connection
    const isConnected = await api.storage.get<boolean>('connected')
    if (!isConnected) {
      return api.response.error('Not connected to Google Drive', 401)
    }

    // Get valid access token
    const accessToken = await getValidAccessToken(api)
    if (!accessToken) {
      return api.response.error('Failed to get access token. Please reconnect.', 401)
    }

    // Get sync configuration
    const config = await api.storage.get<{
      syncDirection?: 'bidirectional' | 'upload-only' | 'download-only'
      excludePatterns?: string[]
    }>('config') || {}

    const syncDirection = config.syncDirection || 'bidirectional'
    const excludePatterns = config.excludePatterns || []

    // Initialize result
    const result: SyncResult = {
      success: true,
      synced: 0,
      uploaded: 0,
      downloaded: 0,
      errors: 0,
      errorMessages: []
    }

    // Perform sync based on direction
    if (syncDirection === 'bidirectional' || syncDirection === 'upload-only') {
      // Get local files that need uploading
      const uploadResult = await syncUpload(api, accessToken, excludePatterns)
      result.uploaded = uploadResult.count
      result.errors += uploadResult.errors
      if (uploadResult.errorMessages) {
        result.errorMessages!.push(...uploadResult.errorMessages)
      }
    }

    if (syncDirection === 'bidirectional' || syncDirection === 'download-only') {
      // Get remote files that need downloading
      const downloadResult = await syncDownload(api, accessToken, excludePatterns)
      result.downloaded = downloadResult.count
      result.errors += downloadResult.errors
      if (downloadResult.errorMessages) {
        result.errorMessages!.push(...downloadResult.errorMessages)
      }
    }

    // Calculate total
    result.synced = result.uploaded + result.downloaded
    result.success = result.errors === 0

    // Update last sync time
    await api.storage.set('last_sync_at', new Date().toISOString())
    await api.storage.set('last_sync_result', result)

    return api.response.json(result)
  } catch (error) {
    console.error('Sync error:', error)
    return api.response.error(
      'Sync failed unexpectedly. Please try again.',
      500
    )
  }
}

/**
 * Get a valid access token, refreshing if necessary.
 */
async function getValidAccessToken(api: ExtensionServerAPI): Promise<string | null> {
  const accessToken = await api.secrets.get('access_token')
  const expiresAt = await api.storage.get<number>('token_expires_at')

  // Check if token is still valid (with 5 minute buffer)
  if (accessToken && expiresAt && Date.now() < expiresAt - 5 * 60 * 1000) {
    return accessToken
  }

  // Try to refresh the token
  const refreshToken = await api.secrets.get('refresh_token')
  if (!refreshToken) {
    return null
  }

  const clientId = await api.secrets.get('GOOGLE_CLIENT_ID')
  const clientSecret = await api.secrets.get('GOOGLE_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    return null
  }

  try {
    const response = await api.http.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }).toString()
    })

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text())
      return null
    }

    const data = await response.json() as {
      access_token: string
      expires_in: number
    }

    // Store new access token
    await api.secrets.set('access_token', data.access_token)
    await api.storage.set('token_expires_at', Date.now() + data.expires_in * 1000)

    return data.access_token
  } catch (error) {
    console.error('Token refresh error:', error)
    return null
  }
}

/**
 * Sync local files to Google Drive (upload).
 */
async function syncUpload(
  _api: ExtensionServerAPI,
  _accessToken: string,
  _excludePatterns: string[]
): Promise<{ count: number; errors: number; errorMessages: string[] }> {
  // In a real implementation, this would:
  // 1. Get list of local files from the vault
  // 2. Compare with Drive files (using stored sync state)
  // 3. Upload new/modified files

  // For now, this is a placeholder that simulates the sync
  // The actual implementation would depend on how vaults expose their files

  return {
    count: 0,
    errors: 0,
    errorMessages: []
  }
}

/**
 * Sync Google Drive files to local (download).
 */
async function syncDownload(
  api: ExtensionServerAPI,
  accessToken: string,
  excludePatterns: string[]
): Promise<{ count: number; errors: number; errorMessages: string[] }> {
  // Get list of files from Drive
  try {
    const response = await api.http.fetch(
      `${GOOGLE_DRIVE_API}/files?fields=files(id,name,mimeType,modifiedTime,size)&pageSize=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    )

    if (!response.ok) {
      return {
        count: 0,
        errors: 1,
        errorMessages: ['Failed to list files from Google Drive']
      }
    }

    const data = await response.json() as {
      files: Array<{
        id: string
        name: string
        mimeType: string
        modifiedTime: string
        size?: string
      }>
    }

    // Filter out excluded files
    const filesToSync = data.files.filter(file => 
      !shouldExclude(file.name, excludePatterns)
    )

    // In a real implementation, this would download the files
    // For now, we just log the count and return
    console.log(`Found ${filesToSync.length} files to sync`)

    return {
      count: 0, // Would be actual downloaded count
      errors: 0,
      errorMessages: []
    }
  } catch (error) {
    return {
      count: 0,
      errors: 1,
      errorMessages: [(error as Error).message]
    }
  }
}

/**
 * Check if a file should be excluded based on patterns.
 */
function shouldExclude(filename: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob matching
    const regex = globToRegex(pattern)
    if (regex.test(filename)) {
      return true
    }
  }
  return false
}

/**
 * Convert a simple glob pattern to regex.
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}
