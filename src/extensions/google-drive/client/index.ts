/**
 * Google Drive Extension - Client Entry Point
 * 
 * This is the reference implementation for BluePLM extensions.
 * All operations go through the ExtensionClientAPI - no direct store or Supabase access.
 * 
 * @module extensions/google-drive/client
 */

import type { ExtensionContext } from '@/lib/extensions/types'
import type { ExtensionClientAPI } from '@/lib/extensions/api/types'

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

/** Sync interval timer handle */
let syncIntervalId: ReturnType<typeof setInterval> | null = null

/** File change debounce timer */
let fileChangeDebounceId: ReturnType<typeof setTimeout> | null = null

/** Track if currently syncing to prevent overlapping syncs */
let isSyncing = false

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Activate the Google Drive extension.
 * 
 * Called by the Extension Host when the extension is enabled or when
 * an activation event fires (e.g., navigation to settings).
 * 
 * @param context - Extension context with lifecycle utilities
 * @param api - Client API for UI, storage, network operations
 */
export async function activate(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  context.log.info('Google Drive extension activating')

  // ─────────────────────────────────────────────────────────────────────────────
  // Register Commands
  // ─────────────────────────────────────────────────────────────────────────────

  context.subscriptions.push(
    api.commands.registerCommand('google-drive.sync', async () => {
      await syncWithDrive(context, api)
    })
  )

  context.subscriptions.push(
    api.commands.registerCommand('google-drive.connect', async () => {
      await connectDrive(context, api)
    })
  )

  context.subscriptions.push(
    api.commands.registerCommand('google-drive.disconnect', async () => {
      await disconnectDrive(context, api)
    })
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // Load Configuration
  // ─────────────────────────────────────────────────────────────────────────────

  const config = await loadConfiguration(api)

  // ─────────────────────────────────────────────────────────────────────────────
  // Set Up File Change Listener
  // ─────────────────────────────────────────────────────────────────────────────

  if (config.syncOnFileChange) {
    context.subscriptions.push(
      api.workspace.onFileChanged((events) => {
        context.log.debug(`File changes detected: ${events.length} events`)
        
        // Debounce file changes to avoid excessive syncing
        if (fileChangeDebounceId) {
          clearTimeout(fileChangeDebounceId)
        }
        fileChangeDebounceId = setTimeout(() => {
          syncWithDrive(context, api)
        }, 2000) // 2 second debounce
      })
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Set Up Automatic Sync Interval
  // ─────────────────────────────────────────────────────────────────────────────

  const syncIntervalMs = (config.syncInterval || 300) * 1000
  syncIntervalId = setInterval(() => {
    syncWithDrive(context, api)
  }, syncIntervalMs)

  // Clean up interval on deactivate
  context.subscriptions.push({
    dispose: () => {
      if (syncIntervalId) {
        clearInterval(syncIntervalId)
        syncIntervalId = null
      }
    }
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // Check Connection Status
  // ─────────────────────────────────────────────────────────────────────────────

  await checkConnectionStatus(context, api)

  // ─────────────────────────────────────────────────────────────────────────────
  // Listen for Config Changes
  // ─────────────────────────────────────────────────────────────────────────────

  context.subscriptions.push(
    api.events.on('config:changed', async () => {
      context.log.debug('Configuration changed, reloading...')
      const newConfig = await loadConfiguration(api)
      
      // Update sync interval if changed
      if (syncIntervalId) {
        clearInterval(syncIntervalId)
      }
      const newIntervalMs = (newConfig.syncInterval || 300) * 1000
      syncIntervalId = setInterval(() => {
        syncWithDrive(context, api)
      }, newIntervalMs)
    })
  )

  context.log.info('Google Drive extension activated')
}

/**
 * Deactivate the Google Drive extension.
 * 
 * Called when the extension is disabled or the app is closing.
 * Subscriptions in context.subscriptions are automatically disposed.
 */
export function deactivate(): void {
  // Clear any pending debounce timers
  if (fileChangeDebounceId) {
    clearTimeout(fileChangeDebounceId)
    fileChangeDebounceId = null
  }

  // Note: syncIntervalId is cleaned up via subscriptions
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Google Drive extension configuration */
interface GoogleDriveConfig {
  syncInterval: number
  syncOnFileChange: boolean
  excludePatterns: string[]
  syncDirection: 'bidirectional' | 'upload-only' | 'download-only'
}

/** Default configuration values */
const DEFAULT_CONFIG: GoogleDriveConfig = {
  syncInterval: 300,
  syncOnFileChange: true,
  excludePatterns: [],
  syncDirection: 'bidirectional'
}

/**
 * Load extension configuration from storage.
 */
async function loadConfiguration(api: ExtensionClientAPI): Promise<GoogleDriveConfig> {
  const stored = await api.storage.get<Partial<GoogleDriveConfig>>('config')
  return {
    ...DEFAULT_CONFIG,
    ...stored
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sync files with Google Drive.
 * Shows progress indicator and handles errors gracefully.
 */
async function syncWithDrive(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  // Prevent overlapping syncs
  if (isSyncing) {
    context.log.debug('Sync already in progress, skipping...')
    return
  }

  isSyncing = true

  try {
    await api.ui.showProgress(
      { title: 'Syncing with Google Drive...', cancellable: true },
      async (progress, token) => {
        progress.report({ message: 'Checking connection...' })

        // Check if cancelled
        if (token.isCancellationRequested) {
          return
        }

        progress.report({ message: 'Syncing files...', increment: 20 })

        const response = await api.callOrgApi<{
          success: boolean
          synced: number
          uploaded: number
          downloaded: number
          errors: number
        }>('/extensions/blueplm.google-drive/sync', { method: 'POST' })

        if (token.isCancellationRequested) {
          return
        }

        progress.report({ message: 'Completing...', increment: 60 })

        if (response.ok && response.data.success) {
          const { synced, uploaded, downloaded } = response.data
          
          if (synced === 0) {
            api.ui.showToast('Already up to date', 'info')
          } else {
            const parts: string[] = []
            if (uploaded > 0) parts.push(`${uploaded} uploaded`)
            if (downloaded > 0) parts.push(`${downloaded} downloaded`)
            api.ui.showToast(`Synced: ${parts.join(', ') || `${synced} files`}`, 'success')
          }
          
          api.ui.setStatus('online')
        } else {
          api.ui.showToast('Sync failed. Check your connection.', 'error')
          api.ui.setStatus('partial')
        }
      }
    )
  } catch (error) {
    context.log.error('Sync failed', error)
    api.ui.showToast('Sync failed. Please try again.', 'error')
    api.ui.setStatus('offline')
  } finally {
    isSyncing = false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initiate Google Drive connection (OAuth flow).
 */
async function connectDrive(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  context.log.info('Initiating Google Drive connection...')
  
  try {
    api.ui.setStatus('checking')
    
    const response = await api.callOrgApi<{ authUrl: string }>(
      '/extensions/blueplm.google-drive/connect',
      { method: 'POST' }
    )

    if (response.ok && response.data.authUrl) {
      // The auth URL should be opened by the main process
      // In the extension context, we emit an event that the app handles
      api.ui.showToast('Opening Google sign-in...', 'info')
      
      // Store that we're awaiting auth completion
      await api.storage.set('awaitingAuth', true)
      await api.storage.set('authStartedAt', Date.now())
      
      // Note: The actual browser opening is handled by the host process
      // which listens for this event and opens the URL
      api.events.emit('google-drive:open-auth-url', response.data.authUrl)
    } else {
      api.ui.showToast('Failed to start Google sign-in', 'error')
      api.ui.setStatus('offline')
    }
  } catch (error) {
    context.log.error('Failed to connect', error)
    api.ui.showToast('Connection failed. Please try again.', 'error')
    api.ui.setStatus('offline')
  }
}

/**
 * Disconnect from Google Drive.
 */
async function disconnectDrive(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  context.log.info('Disconnecting from Google Drive...')

  const result = await api.ui.showDialog({
    title: 'Disconnect Google Drive',
    message: 'Are you sure you want to disconnect? Your sync settings will be preserved, but you will need to sign in again to resume syncing.',
    type: 'confirm',
    confirmText: 'Disconnect',
    cancelText: 'Cancel'
  })

  if (!result.confirmed) {
    return
  }

  try {
    const response = await api.callOrgApi(
      '/extensions/blueplm.google-drive/disconnect',
      { method: 'POST' }
    )

    if (response.ok) {
      // Clear local auth state
      await api.storage.delete('connected')
      await api.storage.delete('userEmail')
      await api.storage.delete('userName')
      
      api.ui.setStatus('offline')
      api.ui.showToast('Google Drive disconnected', 'info')
    } else {
      api.ui.showToast('Failed to disconnect', 'error')
    }
  } catch (error) {
    context.log.error('Failed to disconnect', error)
    api.ui.showToast('Disconnect failed. Please try again.', 'error')
  }
}

/**
 * Check current connection status with Google Drive.
 */
async function checkConnectionStatus(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  context.log.debug('Checking connection status...')
  api.ui.setStatus('checking')

  try {
    const response = await api.callOrgApi<{
      connected: boolean
      userEmail?: string
      userName?: string
      lastSyncAt?: string
    }>('/extensions/blueplm.google-drive/status')

    if (response.ok && response.data.connected) {
      // Store connection info locally for quick access
      await api.storage.set('connected', true)
      if (response.data.userEmail) {
        await api.storage.set('userEmail', response.data.userEmail)
      }
      if (response.data.userName) {
        await api.storage.set('userName', response.data.userName)
      }
      
      api.ui.setStatus('online')
      context.log.info(`Connected as ${response.data.userEmail}`)
    } else {
      await api.storage.set('connected', false)
      api.ui.setStatus('offline')
    }
  } catch (error) {
    context.log.warn('Failed to check connection status', error)
    api.ui.setStatus('offline')
  }
}
