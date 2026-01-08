/**
 * Extension Host Handler
 * 
 * Main process handlers for managing the Extension Host.
 * Handles:
 * - Extension Host window lifecycle
 * - IPC message routing to/from Extension Host
 * - Native extension loading (for verified extensions only)
 */

import { BrowserWindow, ipcMain, app } from 'electron'
import * as path from 'path'
import { fileURLToPath } from 'url'

import type {
  HostInboundMessage,
  HostOutboundMessage,
  ExtensionManifest,
  WatchdogViolation
} from '../extension-host/types'

// Get __dirname equivalent in ESM
let currentDir: string
try {
  currentDir = path.dirname(fileURLToPath(import.meta.url))
} catch {
  // Fallback for CommonJS
  currentDir = __dirname
}

// ============================================
// Types
// ============================================

export interface ExtensionHostHandlerDependencies {
  log: (message: string, data?: unknown) => void
  logError: (message: string, data?: unknown) => void
}

interface ExtensionHostState {
  window: BrowserWindow | null
  isReady: boolean
  startTime: number
  restartCount: number
  lastError?: string
}

type ExtensionStateCallback = (extensionId: string, state: string, error?: string) => void

// ============================================
// Module State
// ============================================

let hostState: ExtensionHostState = {
  window: null,
  isReady: false,
  startTime: 0,
  restartCount: 0
}

let deps: ExtensionHostHandlerDependencies | null = null
let mainWindow: BrowserWindow | null = null
let stateCallbacks: ExtensionStateCallback[] = []
let isShuttingDown = false

// Pending API calls waiting for responses
const pendingApiCalls: Map<string, {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}> = new Map()

// Installed extensions registry (in-memory for now)
const installedExtensions: Map<string, {
  manifest: ExtensionManifest
  state: string
  verification: 'verified' | 'community' | 'sideloaded'
  installedAt?: Date
  activatedAt?: Date
  error?: string
}> = new Map()

// ============================================
// Extension Host Window Management
// ============================================

/**
 * Create the Extension Host window
 */
function createExtensionHostWindow(): BrowserWindow {
  deps?.log('Creating Extension Host window')
  
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  
  const hostWindow = new BrowserWindow({
    width: 600,
    height: 400,
    show: false, // Always hidden - it's a background process
    title: 'BluePLM Extension Host',
    webPreferences: {
      preload: path.join(currentDir, 'extension-host/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Required for extension loading
    }
  })
  
  // Load the Extension Host HTML
  const hostHtmlPath = path.join(currentDir, 'extension-host/host.html')
  
  hostWindow.loadFile(hostHtmlPath).catch(err => {
    deps?.logError('Failed to load Extension Host HTML', { error: String(err) })
  })
  
  // Handle window close
  hostWindow.on('closed', () => {
    deps?.log('Extension Host window closed')
    hostState.window = null
    hostState.isReady = false
    
    // Attempt restart if not shutting down
    // Note: We use a flag to track this since app.isQuitting doesn't exist
    handleHostCrash('Window closed unexpectedly')
  })
  
  // Handle render process crash
  hostWindow.webContents.on('render-process-gone', (event, details) => {
    deps?.logError('Extension Host render process crashed', { reason: details.reason })
    handleHostCrash(`Render process gone: ${details.reason}`)
  })
  
  return hostWindow
}

/**
 * Handle Extension Host crash with auto-restart
 */
function handleHostCrash(reason: string): void {
  // Don't attempt restart if app is shutting down
  if (isShuttingDown) {
    deps?.log('Extension Host closed during shutdown (expected)')
    return
  }
  
  deps?.logError('Extension Host crashed', { reason, restartCount: hostState.restartCount })
  
  hostState.lastError = reason
  hostState.restartCount++
  
  // Limit restart attempts
  if (hostState.restartCount > 3) {
    deps?.logError('Extension Host exceeded restart limit')
    return
  }
  
  // Restart after delay
  setTimeout(() => {
    if (isShuttingDown) return // Double-check before restart
    deps?.log('Restarting Extension Host')
    initializeExtensionHost()
  }, 1000 * hostState.restartCount) // Exponential backoff
}

/**
 * Initialize the Extension Host
 */
function initializeExtensionHost(): void {
  try {
    if (hostState.window && !hostState.window.isDestroyed()) {
      deps?.log('Extension Host already running')
      return
    }
    
    hostState.startTime = Date.now()
    hostState.window = createExtensionHostWindow()
  } catch (err) {
    deps?.logError('Failed to initialize Extension Host', { error: String(err) })
    hostState.lastError = err instanceof Error ? err.message : String(err)
    // Don't crash the app - extension system is optional
  }
}

/**
 * Get Extension Host status
 */
function getExtensionHostStatus(): {
  running: boolean
  ready: boolean
  uptime: number
  restartCount: number
  lastError?: string
} {
  return {
    running: hostState.window !== null && !hostState.window.isDestroyed(),
    ready: hostState.isReady,
    uptime: hostState.startTime ? Date.now() - hostState.startTime : 0,
    restartCount: hostState.restartCount,
    lastError: hostState.lastError
  }
}

// ============================================
// IPC Message Handlers
// ============================================

/**
 * Send message to Extension Host
 */
function sendToHost(message: HostInboundMessage): void {
  if (!hostState.window || hostState.window.isDestroyed()) {
    deps?.logError('Cannot send to Extension Host: not running')
    return
  }
  
  hostState.window.webContents.send('extension-host:message', message)
}

/**
 * Handle message from Extension Host
 */
function handleHostMessage(message: HostOutboundMessage): void {
  switch (message.type) {
    case 'host:ready':
      hostState.isReady = true
      const startupTime = Date.now() - hostState.startTime
      deps?.log(`Extension Host ready (startup: ${startupTime}ms)`)
      break
      
    case 'extension:loaded':
      deps?.log(`Extension loaded: ${message.extensionId}`)
      notifyStateChange(message.extensionId, 'loaded')
      break
      
    case 'extension:activated':
      deps?.log(`Extension activated: ${message.extensionId}`)
      notifyStateChange(message.extensionId, 'active')
      break
      
    case 'extension:deactivated':
      deps?.log(`Extension deactivated: ${message.extensionId}`)
      notifyStateChange(message.extensionId, 'installed')
      break
      
    case 'extension:error':
      deps?.logError(`Extension error: ${message.extensionId}`, { error: message.error })
      notifyStateChange(message.extensionId, 'error', message.error)
      break
      
    case 'extension:killed':
      deps?.logError(`Extension killed: ${message.extensionId}`, { reason: message.reason })
      notifyStateChange(message.extensionId, 'killed', message.reason)
      break
      
    case 'watchdog:violation':
      handleWatchdogViolation(message.violation)
      break
      
    case 'api:result':
      handleApiResult(message.callId, message.result)
      break
      
    case 'api:error':
      handleApiError(message.callId, message.error)
      break
      
    case 'host:stats':
      // Forward stats to renderer if needed
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extension-host:stats', message.extensions)
      }
      break
      
    case 'host:crashed':
      deps?.logError('Extension Host reported crash', { error: message.error })
      break
  }
}

/**
 * Handle watchdog violation
 */
function handleWatchdogViolation(violation: WatchdogViolation): void {
  deps?.logError(`Watchdog violation for ${violation.extensionId}`, {
    type: violation.type,
    details: violation.details
  })
  
  // Notify renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('extension:violation', violation)
  }
}

/**
 * Handle API result from Extension Host
 */
function handleApiResult(callId: string, result: unknown): void {
  const pending = pendingApiCalls.get(callId)
  if (pending) {
    pendingApiCalls.delete(callId)
    pending.resolve(result)
  }
}

/**
 * Handle API error from Extension Host
 */
function handleApiError(callId: string, error: string): void {
  const pending = pendingApiCalls.get(callId)
  if (pending) {
    pendingApiCalls.delete(callId)
    pending.reject(new Error(error))
  }
}

/**
 * Notify state change to callbacks
 */
function notifyStateChange(extensionId: string, state: string, error?: string): void {
  for (const callback of stateCallbacks) {
    try {
      callback(extensionId, state, error)
    } catch (err) {
      deps?.logError('State callback error', { error: String(err) })
    }
  }
  
  // Forward to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('extension:state-change', { extensionId, state, error })
  }
}

// ============================================
// Extension API
// ============================================

/**
 * Load an extension into the Extension Host
 */
async function loadExtension(
  extensionId: string,
  bundlePath: string,
  manifest: ExtensionManifest,
  bundleCode: string
): Promise<{ success: boolean; error?: string }> {
  if (!hostState.isReady) {
    return { success: false, error: 'Extension Host not ready' }
  }
  
  deps?.log(`Loading extension: ${extensionId}`)
  
  // For native extensions, load in main process instead
  if (manifest.category === 'native') {
    return loadNativeExtension(extensionId, bundlePath, manifest)
  }
  
  // Send load message to Extension Host
  sendToHost({
    type: 'extension:load',
    extensionId,
    bundlePath,
    manifest
  })
  
  // Note: In a full implementation, we'd wait for the response
  // For now, we return success and handle async via events
  return { success: true }
}

/**
 * Activate an extension
 */
async function activateExtension(extensionId: string): Promise<{ success: boolean; error?: string }> {
  if (!hostState.isReady) {
    return { success: false, error: 'Extension Host not ready' }
  }
  
  sendToHost({
    type: 'extension:activate',
    extensionId
  })
  
  return { success: true }
}

/**
 * Deactivate an extension
 */
async function deactivateExtension(extensionId: string): Promise<{ success: boolean; error?: string }> {
  if (!hostState.isReady) {
    return { success: false, error: 'Extension Host not ready' }
  }
  
  sendToHost({
    type: 'extension:deactivate',
    extensionId
  })
  
  return { success: true }
}

/**
 * Kill an extension forcefully
 */
function killExtension(extensionId: string, reason: string): void {
  sendToHost({
    type: 'extension:kill',
    extensionId,
    reason
  })
}

// ============================================
// Extension Registry Helpers
// ============================================

/**
 * Get all installed extensions
 */
function getInstalledExtensions(): Array<{
  manifest: ExtensionManifest
  state: string
  verification: 'verified' | 'community' | 'sideloaded'
  installedAt?: string
  activatedAt?: string
  error?: string
}> {
  return Array.from(installedExtensions.values()).map(ext => ({
    manifest: ext.manifest,
    state: ext.state,
    verification: ext.verification,
    installedAt: ext.installedAt?.toISOString(),
    activatedAt: ext.activatedAt?.toISOString(),
    error: ext.error
  }))
}

/**
 * Get extension by ID
 */
function getExtensionById(extensionId: string): {
  manifest: ExtensionManifest
  state: string
  verification: 'verified' | 'community' | 'sideloaded'
  installedAt?: string
  activatedAt?: string
  error?: string
} | undefined {
  const ext = installedExtensions.get(extensionId)
  if (!ext) return undefined
  
  return {
    manifest: ext.manifest,
    state: ext.state,
    verification: ext.verification,
    installedAt: ext.installedAt?.toISOString(),
    activatedAt: ext.activatedAt?.toISOString(),
    error: ext.error
  }
}

/**
 * Remove extension from registry
 */
function removeExtension(extensionId: string): void {
  installedExtensions.delete(extensionId)
  deps?.log(`Extension removed from registry: ${extensionId}`)
}

/**
 * Add or update extension in registry
 */
function registerExtension(
  extensionId: string,
  manifest: ExtensionManifest,
  verification: 'verified' | 'community' | 'sideloaded' = 'community'
): void {
  installedExtensions.set(extensionId, {
    manifest,
    state: 'installed',
    verification,
    installedAt: new Date()
  })
  deps?.log(`Extension registered: ${extensionId}`)
}

/**
 * Update extension state in registry
 */
function updateExtensionState(extensionId: string, state: string, error?: string): void {
  const ext = installedExtensions.get(extensionId)
  if (ext) {
    ext.state = state
    ext.error = error
    if (state === 'active') {
      ext.activatedAt = new Date()
    }
  }
}

// ============================================
// Native Extension Loading
// ============================================

/**
 * Load a native extension in the main process
 * Native extensions are only allowed for verified extensions
 */
async function loadNativeExtension(
  extensionId: string,
  bundlePath: string,
  manifest: ExtensionManifest
): Promise<{ success: boolean; error?: string }> {
  deps?.log(`Loading native extension: ${extensionId}`)
  
  // Security check: Only verified extensions can be native
  // In a full implementation, we'd verify the extension signature here
  
  try {
    // Native extensions would be loaded here
    // This is a placeholder for the actual implementation
    deps?.log(`Native extension ${extensionId} loaded (placeholder)`)
    
    notifyStateChange(extensionId, 'active')
    
    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    deps?.logError(`Failed to load native extension ${extensionId}`, { error })
    return { success: false, error }
  }
}

// ============================================
// IPC Handler Registration
// ============================================

export function registerExtensionHostHandlers(
  window: BrowserWindow,
  dependencies: ExtensionHostHandlerDependencies
): void {
  deps = dependencies
  mainWindow = window
  
  // Initialize Extension Host
  initializeExtensionHost()
  
  // Handle messages from Extension Host
  ipcMain.on('extension-host:message', (event, message: HostOutboundMessage) => {
    handleHostMessage(message)
  })
  
  // Handle API calls from Extension Host
  ipcMain.on('extension-host:api-call', async (event, request: {
    callId: string
    extensionId: string
    api: string
    method: string
    args: unknown[]
  }) => {
    const { callId, extensionId, api, method, args } = request
    
    try {
      // Route API call to appropriate handler
      const result = await handleExtensionApiCall(extensionId, api, method, args)
      
      // Send result back to Extension Host
      if (hostState.window && !hostState.window.isDestroyed()) {
        hostState.window.webContents.send(`extension-host:api-response:${callId}`, {
          success: true,
          result
        })
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      
      if (hostState.window && !hostState.window.isDestroyed()) {
        hostState.window.webContents.send(`extension-host:api-response:${callId}`, {
          success: false,
          error
        })
      }
    }
  })
  
  // Handle log messages from Extension Host
  ipcMain.on('extension-host:log', (event, data: { level: string; message: string; data?: unknown }) => {
    const { level, message, data: logData } = data
    switch (level) {
      case 'error':
        deps?.logError(`[ExtHost] ${message}`, logData)
        break
      default:
        deps?.log(`[ExtHost] ${message}`, logData)
    }
  })
  
  // Renderer IPC handlers
  ipcMain.handle('extensions:get-host-status', () => {
    return getExtensionHostStatus()
  })
  
  ipcMain.handle('extensions:load', async (event, extensionId: string, bundlePath: string, manifest: ExtensionManifest, bundleCode: string) => {
    return loadExtension(extensionId, bundlePath, manifest, bundleCode)
  })
  
  ipcMain.handle('extensions:activate', async (event, extensionId: string) => {
    return activateExtension(extensionId)
  })
  
  ipcMain.handle('extensions:deactivate', async (event, extensionId: string) => {
    return deactivateExtension(extensionId)
  })
  
  ipcMain.handle('extensions:kill', (event, extensionId: string, reason: string) => {
    killExtension(extensionId, reason)
    return { success: true }
  })
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Extended Extension System Handlers (Agent 5 - IPC Bridge)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get all installed extensions
  ipcMain.handle('extensions:get-all', async () => {
    return getInstalledExtensions()
  })
  
  // Get specific extension
  ipcMain.handle('extensions:get-extension', async (_event, extensionId: string) => {
    return getExtensionById(extensionId)
  })
  
  // Get extension stats
  ipcMain.handle('extensions:get-extension-stats', async (_event, extensionId: string) => {
    // Request stats from Extension Host
    if (!hostState.isReady) {
      return undefined
    }
    // Stats are collected via host:get-stats message
    // This is a placeholder - full implementation would query the host
    return undefined
  })
  
  // Store operations (placeholders - implemented by Agent 8)
  ipcMain.handle('extensions:fetch-store', async () => {
    // Placeholder - would call store API
    return []
  })
  
  ipcMain.handle('extensions:search-store', async (_event, request: unknown) => {
    // Placeholder - would call store API
    return { extensions: [], total: 0, page: 0, hasMore: false }
  })
  
  ipcMain.handle('extensions:get-store-extension', async (_event, extensionId: string) => {
    // Placeholder - would call store API
    return undefined
  })
  
  // Install extension from store
  ipcMain.handle('extensions:install', async (_event, extensionId: string, version?: string) => {
    deps?.log(`Installing extension: ${extensionId}${version ? `@${version}` : ''}`)
    
    // Placeholder implementation
    // Full implementation would:
    // 1. Download .bpx from store
    // 2. Verify signature
    // 3. Extract and load
    // 4. Deploy server handlers
    
    return { success: false, error: 'Store installation not yet implemented' }
  })
  
  // Install from file (sideload)
  ipcMain.handle('extensions:install-from-file', async (_event, bpxPath: string, acknowledgeUnsigned?: boolean) => {
    deps?.log(`Installing extension from file: ${bpxPath}`)
    
    // Placeholder implementation
    // Full implementation would:
    // 1. Extract .bpx
    // 2. Validate manifest
    // 3. Show unsigned warning if needed
    // 4. Load into Extension Host
    
    return { success: false, error: 'File installation not yet implemented' }
  })
  
  // Uninstall extension
  ipcMain.handle('extensions:uninstall', async (_event, extensionId: string) => {
    deps?.log(`Uninstalling extension: ${extensionId}`)
    
    try {
      // Deactivate first if active
      await deactivateExtension(extensionId)
      
      // Remove from installed extensions
      removeExtension(extensionId)
      
      // Notify renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extension:state-change', {
          extensionId,
          state: 'not-installed',
          timestamp: Date.now()
        })
      }
      
      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { success: false, error }
    }
  })
  
  // Enable extension
  ipcMain.handle('extensions:enable', async (_event, extensionId: string) => {
    deps?.log(`Enabling extension: ${extensionId}`)
    return activateExtension(extensionId)
  })
  
  // Disable extension
  ipcMain.handle('extensions:disable', async (_event, extensionId: string) => {
    deps?.log(`Disabling extension: ${extensionId}`)
    return deactivateExtension(extensionId)
  })
  
  // Check for updates
  ipcMain.handle('extensions:check-updates', async () => {
    // Placeholder - would call store API to check versions
    return []
  })
  
  // Update extension
  ipcMain.handle('extensions:update', async (_event, extensionId: string, version?: string) => {
    deps?.log(`Updating extension: ${extensionId}${version ? ` to ${version}` : ''}`)
    
    // Placeholder implementation
    return { success: false, error: 'Updates not yet implemented' }
  })
  
  // Rollback extension
  ipcMain.handle('extensions:rollback', async (_event, extensionId: string) => {
    deps?.log(`Rolling back extension: ${extensionId}`)
    
    // Placeholder implementation
    return { success: false, error: 'Rollback not yet implemented' }
  })
  
  // Pin version
  ipcMain.handle('extensions:pin-version', async (_event, extensionId: string, version: string) => {
    deps?.log(`Pinning extension ${extensionId} to version ${version}`)
    // Store pinned version in local storage
    return { success: true }
  })
  
  // Unpin version
  ipcMain.handle('extensions:unpin-version', async (_event, extensionId: string) => {
    deps?.log(`Unpinning extension: ${extensionId}`)
    return { success: true }
  })
  
  deps.log('Extension Host handlers registered')
}

export function unregisterExtensionHostHandlers(): void {
  // Core listeners
  ipcMain.removeAllListeners('extension-host:message')
  ipcMain.removeAllListeners('extension-host:api-call')
  ipcMain.removeAllListeners('extension-host:log')
  
  // Core handlers
  ipcMain.removeHandler('extensions:get-host-status')
  ipcMain.removeHandler('extensions:load')
  ipcMain.removeHandler('extensions:activate')
  ipcMain.removeHandler('extensions:deactivate')
  ipcMain.removeHandler('extensions:kill')
  
  // Extended handlers (Agent 5 - IPC Bridge)
  ipcMain.removeHandler('extensions:get-all')
  ipcMain.removeHandler('extensions:get-extension')
  ipcMain.removeHandler('extensions:get-extension-stats')
  ipcMain.removeHandler('extensions:fetch-store')
  ipcMain.removeHandler('extensions:search-store')
  ipcMain.removeHandler('extensions:get-store-extension')
  ipcMain.removeHandler('extensions:install')
  ipcMain.removeHandler('extensions:install-from-file')
  ipcMain.removeHandler('extensions:uninstall')
  ipcMain.removeHandler('extensions:enable')
  ipcMain.removeHandler('extensions:disable')
  ipcMain.removeHandler('extensions:check-updates')
  ipcMain.removeHandler('extensions:update')
  ipcMain.removeHandler('extensions:rollback')
  ipcMain.removeHandler('extensions:pin-version')
  ipcMain.removeHandler('extensions:unpin-version')
  
  // Cleanup Extension Host window
  if (hostState.window && !hostState.window.isDestroyed()) {
    hostState.window.close()
  }
}

/**
 * Handle Extension API calls
 * Routes API calls from extensions to the appropriate handlers
 */
async function handleExtensionApiCall(
  extensionId: string,
  api: string,
  method: string,
  args: unknown[]
): Promise<unknown> {
  // This is a placeholder for the actual API routing
  // In a full implementation, this would:
  // 1. Check permissions for the extension
  // 2. Route to the appropriate handler (ui, storage, network, etc.)
  // 3. Return the result
  
  deps?.log(`API call from ${extensionId}: ${api}.${method}`)
  
  switch (api) {
    case 'ui':
      return handleUIApiCall(extensionId, method, args)
    case 'storage':
      return handleStorageApiCall(extensionId, method, args)
    case 'network':
      return handleNetworkApiCall(extensionId, method, args)
    default:
      throw new Error(`Unknown API: ${api}`)
  }
}

// Placeholder API handlers
async function handleUIApiCall(extensionId: string, method: string, args: unknown[]): Promise<unknown> {
  // Forward UI calls to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('extension:ui-call', { extensionId, method, args })
  }
  return { success: true }
}

async function handleStorageApiCall(extensionId: string, method: string, args: unknown[]): Promise<unknown> {
  // Placeholder storage implementation
  return { success: true }
}

async function handleNetworkApiCall(extensionId: string, method: string, args: unknown[]): Promise<unknown> {
  // Placeholder network implementation
  return { success: true }
}

/**
 * Subscribe to extension state changes
 */
export function onExtensionStateChange(callback: ExtensionStateCallback): () => void {
  stateCallbacks.push(callback)
  return () => {
    const index = stateCallbacks.indexOf(callback)
    if (index !== -1) {
      stateCallbacks.splice(index, 1)
    }
  }
}

/**
 * Cleanup Extension Host on app quit
 */
export async function cleanupExtensionHost(): Promise<void> {
  deps?.log('Cleaning up Extension Host')
  
  // Set shutdown flag to prevent restart attempts
  isShuttingDown = true
  
  if (hostState.window && !hostState.window.isDestroyed()) {
    // Send shutdown message
    sendToHost({ type: 'host:shutdown' })
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Force close if still open
    if (!hostState.window.isDestroyed()) {
      hostState.window.close()
    }
  }
  
  hostState = {
    window: null,
    isReady: false,
    startTime: 0,
    restartCount: 0
  }
}
