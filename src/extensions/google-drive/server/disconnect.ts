/**
 * Google Drive Disconnect Handler
 * 
 * Disconnects from Google Drive by revoking tokens and clearing stored data.
 * 
 * @module extensions/google-drive/server/disconnect
 */

import type { ExtensionServerAPI } from './types'

/**
 * Handler to disconnect from Google Drive.
 * 
 * @param api - Extension Server API
 * @returns Success response
 */
export default async function handler(api: ExtensionServerAPI) {
  try {
    // Get the access token to revoke it
    const accessToken = await api.secrets.get('access_token')

    // Attempt to revoke the token with Google
    if (accessToken) {
      try {
        await api.http.fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        )
        // Don't fail if revocation fails - we still want to clear local data
      } catch (revokeError) {
        console.warn('Token revocation failed:', revokeError)
      }
    }

    // Clear all stored secrets
    await api.secrets.delete('access_token')
    await api.secrets.delete('refresh_token')

    // Clear all stored data
    const keysToDelete = [
      'connected',
      'connected_at',
      'token_expires_at',
      'user_email',
      'user_name',
      'user_picture',
      'last_sync_at',
      'last_sync_result',
      'sync_cursor'
    ]

    for (const key of keysToDelete) {
      await api.storage.delete(key)
    }

    // Also clean up any OAuth state tokens that might be lingering
    const allKeys = await api.storage.list('oauth_state_')
    for (const key of allKeys) {
      await api.storage.delete(key)
    }

    return api.response.json({
      success: true,
      message: 'Successfully disconnected from Google Drive'
    })
  } catch (error) {
    console.error('Disconnect error:', error)
    
    // Even if there's an error, try to clear local data
    try {
      await api.storage.set('connected', false)
    } catch {
      // Ignore
    }

    return api.response.error(
      'Failed to fully disconnect. Please try again.',
      500
    )
  }
}
