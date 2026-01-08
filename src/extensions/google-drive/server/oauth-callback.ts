/**
 * Google Drive OAuth Callback Handler
 * 
 * Handles the OAuth 2.0 callback from Google, exchanges the authorization
 * code for tokens, and stores them securely.
 * 
 * This is a PUBLIC endpoint (no auth required) because Google redirects here.
 * 
 * @module extensions/google-drive/server/oauth-callback
 */

import type { ExtensionServerAPI } from './types'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

/**
 * Handler for Google OAuth callback.
 * 
 * @param api - Extension Server API
 * @returns Redirect response or error
 */
export default async function handler(api: ExtensionServerAPI) {
  try {
    const { code, state, error: oauthError, error_description } = api.request.query

    // Handle OAuth error
    if (oauthError) {
      console.error('OAuth error:', oauthError, error_description)
      return api.response.redirect(
        `/settings/extensions/google-drive?error=${encodeURIComponent(error_description || oauthError)}`
      )
    }

    // Validate required parameters
    if (!code) {
      return api.response.error('Missing authorization code', 400)
    }

    if (!state) {
      return api.response.error('Missing state parameter', 400)
    }

    // Verify state token (CSRF protection)
    const storedState = await api.storage.get<{ createdAt: number; userId?: string }>(
      `oauth_state_${state}`
    )

    if (!storedState) {
      return api.response.error('Invalid or expired state token', 400)
    }

    // Check state token age (max 10 minutes)
    const stateAge = Date.now() - storedState.createdAt
    if (stateAge > 10 * 60 * 1000) {
      await api.storage.delete(`oauth_state_${state}`)
      return api.response.error('State token expired. Please try again.', 400)
    }

    // Clean up state token
    await api.storage.delete(`oauth_state_${state}`)

    // Get OAuth credentials
    const clientId = await api.secrets.get('GOOGLE_CLIENT_ID')
    const clientSecret = await api.secrets.get('GOOGLE_CLIENT_SECRET')

    if (!clientId || !clientSecret) {
      return api.response.error('OAuth credentials not configured', 500)
    }

    // Build redirect URI (must match the one used in /connect)
    const origin = api.request.headers['origin'] || api.request.headers['host'] || ''
    const callbackPath = '/extensions/blueplm.google-drive/oauth-callback'
    const redirectUri = origin.startsWith('http')
      ? `${origin}${callbackPath}`
      : `https://${origin}${callbackPath}`

    // Exchange authorization code for tokens
    const tokenResponse = await api.http.fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange failed:', errorText)
      return api.response.redirect(
        `/settings/extensions/google-drive?error=${encodeURIComponent('Failed to exchange authorization code')}`
      )
    }

    const tokens = await tokenResponse.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      token_type: string
    }

    // Store tokens securely
    await api.secrets.set('access_token', tokens.access_token)
    if (tokens.refresh_token) {
      await api.secrets.set('refresh_token', tokens.refresh_token)
    }

    // Calculate and store expiry time
    const expiresAt = Date.now() + (tokens.expires_in * 1000)
    await api.storage.set('token_expires_at', expiresAt)

    // Fetch user info
    const userInfoResponse = await api.http.fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    })

    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json() as {
        email: string
        name: string
        picture?: string
      }

      // Store user info
      await api.storage.set('user_email', userInfo.email)
      await api.storage.set('user_name', userInfo.name)
      if (userInfo.picture) {
        await api.storage.set('user_picture', userInfo.picture)
      }
    }

    // Mark as connected
    await api.storage.set('connected', true)
    await api.storage.set('connected_at', new Date().toISOString())

    // Redirect to settings page with success message
    return api.response.redirect('/settings/extensions/google-drive?connected=true')
  } catch (error) {
    console.error('OAuth callback error:', error)
    return api.response.redirect(
      `/settings/extensions/google-drive?error=${encodeURIComponent('An unexpected error occurred')}`
    )
  }
}
