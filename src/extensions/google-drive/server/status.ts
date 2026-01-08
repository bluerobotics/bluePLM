/**
 * Google Drive Status Handler
 * 
 * Returns the current connection status and user information.
 * 
 * @module extensions/google-drive/server/status
 */

import type { ExtensionServerAPI } from './types'

/**
 * Connection status response
 */
interface ConnectionStatus {
  connected: boolean
  userEmail?: string
  userName?: string
  userPicture?: string
  connectedAt?: string
  lastSyncAt?: string
  quotaUsed?: number
  quotaTotal?: number
}

/**
 * Handler to get Google Drive connection status.
 * 
 * @param api - Extension Server API
 * @returns Connection status
 */
export default async function handler(api: ExtensionServerAPI) {
  try {
    // Check if connected
    const isConnected = await api.storage.get<boolean>('connected')

    if (!isConnected) {
      return api.response.json({
        connected: false
      } as ConnectionStatus)
    }

    // Get user info from storage
    const userEmail = await api.storage.get<string>('user_email')
    const userName = await api.storage.get<string>('user_name')
    const userPicture = await api.storage.get<string>('user_picture')
    const connectedAt = await api.storage.get<string>('connected_at')
    const lastSyncAt = await api.storage.get<string>('last_sync_at')

    // Optionally verify the connection is still valid by checking token
    const accessToken = await api.secrets.get('access_token')
    const expiresAt = await api.storage.get<number>('token_expires_at')

    // If token is expired, try to refresh it
    if (accessToken && expiresAt && Date.now() >= expiresAt - 60000) {
      const refreshed = await refreshAccessToken(api)
      if (!refreshed) {
        // Token refresh failed, mark as disconnected
        await api.storage.set('connected', false)
        return api.response.json({
          connected: false
        } as ConnectionStatus)
      }
    }

    // Get quota info (optional, skip if it fails)
    let quotaInfo: { used?: number; total?: number } = {}
    try {
      quotaInfo = await getQuotaInfo(api, accessToken!)
    } catch {
      // Ignore quota errors
    }

    return api.response.json({
      connected: true,
      userEmail,
      userName,
      userPicture,
      connectedAt,
      lastSyncAt,
      quotaUsed: quotaInfo.used,
      quotaTotal: quotaInfo.total
    } as ConnectionStatus)
  } catch (error) {
    console.error('Status check error:', error)
    return api.response.error('Failed to check connection status', 500)
  }
}

/**
 * Refresh the access token using the refresh token.
 */
async function refreshAccessToken(api: ExtensionServerAPI): Promise<boolean> {
  const refreshToken = await api.secrets.get('refresh_token')
  if (!refreshToken) {
    return false
  }

  const clientId = await api.secrets.get('GOOGLE_CLIENT_ID')
  const clientSecret = await api.secrets.get('GOOGLE_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    return false
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
      return false
    }

    const data = await response.json() as {
      access_token: string
      expires_in: number
    }

    await api.secrets.set('access_token', data.access_token)
    await api.storage.set('token_expires_at', Date.now() + data.expires_in * 1000)

    return true
  } catch {
    return false
  }
}

/**
 * Get Drive storage quota information.
 */
async function getQuotaInfo(
  api: ExtensionServerAPI,
  accessToken: string
): Promise<{ used?: number; total?: number }> {
  const response = await api.http.fetch(
    'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  )

  if (!response.ok) {
    return {}
  }

  const data = await response.json() as {
    storageQuota?: {
      usage?: string
      limit?: string
    }
  }

  return {
    used: data.storageQuota?.usage ? parseInt(data.storageQuota.usage) : undefined,
    total: data.storageQuota?.limit ? parseInt(data.storageQuota.limit) : undefined
  }
}
