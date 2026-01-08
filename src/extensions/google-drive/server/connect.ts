/**
 * Google Drive Connect Handler
 * 
 * Initiates the OAuth 2.0 flow with Google.
 * Returns an authorization URL that the client should open in a browser.
 * 
 * @module extensions/google-drive/server/connect
 */

import type { ExtensionServerAPI } from './types'

/**
 * Google OAuth configuration
 */
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',      // Access to files created/opened by the app
  'https://www.googleapis.com/auth/drive.metadata.readonly', // Read metadata
  'https://www.googleapis.com/auth/userinfo.email',  // User's email
  'https://www.googleapis.com/auth/userinfo.profile' // User's profile info
].join(' ')

/**
 * Handler to initiate Google OAuth flow.
 * 
 * @param api - Extension Server API
 * @returns Response with auth URL or error
 */
export default async function handler(api: ExtensionServerAPI) {
  try {
    // Get OAuth credentials from secrets
    const clientId = await api.secrets.get('GOOGLE_CLIENT_ID')
    
    if (!clientId) {
      return api.response.error(
        'Google Drive is not configured. Please set up OAuth credentials in the organization settings.',
        400
      )
    }

    // Build the OAuth callback URL
    // The callback URL should point to our oauth-callback handler
    const origin = api.request.headers['origin'] || api.request.headers['host'] || ''
    const callbackPath = '/extensions/blueplm.google-drive/oauth-callback'
    const redirectUri = origin.startsWith('http') 
      ? `${origin}${callbackPath}`
      : `https://${origin}${callbackPath}`

    // Generate a state token for CSRF protection
    const state = generateStateToken()
    
    // Store state for verification in callback
    await api.storage.set(`oauth_state_${state}`, {
      createdAt: Date.now(),
      userId: api.user?.id
    })

    // Build the authorization URL
    const authUrl = new URL(GOOGLE_AUTH_URL)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', SCOPES)
    authUrl.searchParams.set('access_type', 'offline')  // Request refresh token
    authUrl.searchParams.set('prompt', 'consent')        // Always show consent screen for refresh token
    authUrl.searchParams.set('state', state)

    return api.response.json({
      authUrl: authUrl.toString(),
      state
    })
  } catch (error) {
    console.error('Connect error:', error)
    return api.response.error(
      'Failed to initiate Google sign-in. Please try again.',
      500
    )
  }
}

/**
 * Generate a cryptographically random state token.
 */
function generateStateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}
