// SolidWorks handlers for Electron main process
import { app, ipcMain, BrowserWindow, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess, execSync } from 'child_process'
import * as CFB from 'cfb'

// ============================================
// Configuration Constants
// ============================================

/** Maximum time to wait for service startup (ms) */
const SERVICE_STARTUP_TIMEOUT_MS = 10000

/** Interval between ping attempts during startup (ms) */
const SERVICE_STARTUP_POLL_INTERVAL_MS = 500

/** Maximum concurrent SW commands to prevent service overload */
const SW_MAX_CONCURRENT_COMMANDS = 3

/** Ping timeout for status checks (ms) - short to avoid blocking */
const STATUS_PING_TIMEOUT_MS = 2000

/** Ping cache TTL (ms) - avoid redundant status checks */
const PING_CACHE_TTL_MS = 1000

// ============================================
// Module State
// ============================================

let mainWindow: BrowserWindow | null = null

// External log function reference
let log: (message: string, data?: unknown) => void = console.log

// SolidWorks service state
let swServiceProcess: ChildProcess | null = null
let swServiceBuffer = ''
let swPendingRequests: Map<number, { resolve: (value: SWServiceResult) => void; reject: (err: Error) => void }> = new Map()
let swRequestId = 0
let solidWorksInstalled: boolean | null = null

/**
 * Track the last known PID separately from the process reference.
 * This allows us to detect if the process is still alive even if
 * the Node.js ChildProcess reference was lost (e.g., due to IPC errors).
 */
let lastKnownServicePid: number | null = null

// Thumbnail extraction tracking
const thumbnailsInProgress = new Set<string>()

// ============================================
// Request Queue State
// ============================================

/** Queue of pending commands waiting to be sent */
interface QueuedCommand {
  command: Record<string, unknown>
  options?: { timeoutMs?: number }
  resolve: (value: SWServiceResult) => void
  queuedAt: number
}

const commandQueue: QueuedCommand[] = []
let activeCommandCount = 0

// ============================================
// Ping Cache State
// ============================================

interface PingCacheEntry {
  result: SWServiceResult
  timestamp: number
}

let pingCache: PingCacheEntry | null = null

interface SWServiceResult {
  success: boolean
  data?: unknown
  error?: string
  errorDetails?: string
}

// ============================================
// Process Management Helpers
// ============================================

/**
 * Checks if a process exists at the OS level using signal 0.
 * This does not kill the process, just checks if it's alive.
 * @param pid - Process ID to check
 * @returns true if process exists, false otherwise
 */
function checkProcessExists(pid: number): boolean {
  try {
    // Signal 0 just checks if process exists without killing it
    process.kill(pid, 0)
    return true
  } catch {
    // Process doesn't exist or we don't have permission
    return false
  }
}

/**
 * Clears the SolidWorks service process state and rejects all pending requests.
 * Call this whenever the process exits, errors, or disconnects.
 * @param reason - The reason for clearing state (for logging and error messages)
 * @param force - If true, clear state even if process appears alive (use for confirmed exits)
 */
function clearServiceState(reason: string, force: boolean = false): void {
  // Before clearing, verify the process is actually dead (unless forced)
  // This prevents clearing state when stdio errors occur but process is still alive
  if (!force && lastKnownServicePid) {
    const stillAlive = checkProcessExists(lastKnownServicePid)
    if (stillAlive) {
      log(`[SolidWorks] NOT clearing service state - process ${lastKnownServicePid} is still alive (reason was: ${reason})`)
      // Don't clear the reference - the process is still running
      // Just log the issue for debugging
      return
    }
  }
  
  log(`[SolidWorks] Clearing service state: ${reason}`)
  swServiceProcess = null
  swServiceBuffer = ''
  lastKnownServicePid = null
  
  // Reject all pending requests with descriptive error
  for (const [id, req] of swPendingRequests) {
    log(`[SolidWorks] Rejecting pending request ${id}: ${reason}`)
    req.reject(new Error(reason))
  }
  swPendingRequests.clear()
  
  // Clear queued commands
  for (const queued of commandQueue) {
    queued.resolve({ success: false, error: reason })
  }
  commandQueue.length = 0
  activeCommandCount = 0
  
  // Invalidate ping cache
  pingCache = null
}

// ============================================
// Request Queue Management
// ============================================

/**
 * Returns current queue statistics for debugging and status reporting.
 */
function getQueueStats(): { queueDepth: number; activeCommands: number } {
  return {
    queueDepth: commandQueue.length,
    activeCommands: activeCommandCount
  }
}

/**
 * Processes the next command in the queue if capacity is available.
 * Called after each command completes or when new commands are queued.
 */
function processQueue(): void {
  while (activeCommandCount < SW_MAX_CONCURRENT_COMMANDS && commandQueue.length > 0) {
    const queued = commandQueue.shift()!
    const waitTime = Date.now() - queued.queuedAt
    
    if (waitTime > 100) {
      log(`[SolidWorks Queue] Command waited ${waitTime}ms in queue (active: ${activeCommandCount + 1}, remaining: ${commandQueue.length})`)
    }
    
    activeCommandCount++
    
    // Execute the command directly (bypassing queue since we're already processing)
    executeCommandDirect(queued.command, queued.options)
      .then((result) => {
        activeCommandCount--
        queued.resolve(result)
        // Continue processing queue
        processQueue()
      })
      .catch(() => {
        activeCommandCount--
        queued.resolve({ success: false, error: 'Command execution failed' })
        processQueue()
      })
  }
}

/**
 * Internal function that directly sends a command to the service.
 * Use sendSWCommand for queued execution.
 */
async function executeCommandDirect(
  command: Record<string, unknown>,
  options?: { timeoutMs?: number }
): Promise<SWServiceResult> {
  if (!swServiceProcess?.stdin) {
    return { success: false, error: 'SolidWorks service not running. Start it first.' }
  }
  
  const timeoutMs = options?.timeoutMs ?? 300000 // Default 5 min
  const startTime = Date.now()
  
  return new Promise((resolve) => {
    const id = ++swRequestId
    
    const timeout = setTimeout(() => {
      swPendingRequests.delete(id)
      const elapsed = Date.now() - startTime
      log(`[SolidWorks] Command ${command.action} timed out after ${elapsed}ms`)
      resolve({ success: false, error: 'Command timed out' })
    }, timeoutMs)
    
    swPendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout)
        const elapsed = Date.now() - startTime
        if (elapsed > 1000) {
          log(`[SolidWorks] Command ${command.action} completed in ${elapsed}ms`)
        }
        resolve(result)
      },
      reject: () => {
        clearTimeout(timeout)
        resolve({ success: false, error: 'Request rejected' })
      }
    })
    
    // Include requestId in command for response correlation
    const commandWithId = { ...command, requestId: id }
    const json = JSON.stringify(commandWithId) + '\n'
    swServiceProcess!.stdin!.write(json)
  })
}

/**
 * Polls the service with ping commands until it responds or timeout is reached.
 * @param timeoutMs - Maximum time to wait (default: SERVICE_STARTUP_TIMEOUT_MS)
 * @param pollIntervalMs - Time between ping attempts (default: SERVICE_STARTUP_POLL_INTERVAL_MS)
 * @returns Promise resolving to ping result or timeout error
 */
async function pollServiceUntilReady(
  timeoutMs: number = SERVICE_STARTUP_TIMEOUT_MS,
  pollIntervalMs: number = SERVICE_STARTUP_POLL_INTERVAL_MS
): Promise<SWServiceResult> {
  const startTime = Date.now()
  let attemptCount = 0
  
  log(`[SolidWorks] Starting service startup polling (timeout: ${timeoutMs}ms, interval: ${pollIntervalMs}ms)`)
  
  while (Date.now() - startTime < timeoutMs) {
    attemptCount++
    
    // Check if process is still alive
    if (!swServiceProcess) {
      const elapsed = Date.now() - startTime
      log(`[SolidWorks] Service process died during startup after ${elapsed}ms (${attemptCount} attempts)`)
      return {
        success: false,
        error: 'Service process terminated unexpectedly',
        errorDetails: `The SolidWorks service process exited during startup after ${attemptCount} ping attempts over ${elapsed}ms.`
      }
    }
    
    try {
      // Quick ping with short timeout (slightly less than poll interval)
      const pingResult = await sendSWCommand({ action: 'ping' }, { timeoutMs: pollIntervalMs - 50 })
      
      if (pingResult.success) {
        const elapsed = Date.now() - startTime
        log(`[SolidWorks] Service ready after ${elapsed}ms (${attemptCount} ping attempts)`)
        return pingResult
      }
      
      log(`[SolidWorks] Ping attempt ${attemptCount} failed, retrying...`)
    } catch (err) {
      log(`[SolidWorks] Ping attempt ${attemptCount} threw error: ${String(err)}`)
    }
    
    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }
  
  // Timeout reached
  const elapsed = Date.now() - startTime
  log(`[SolidWorks] Service startup timed out after ${elapsed}ms (${attemptCount} attempts)`)
  
  return {
    success: false,
    error: 'Service startup timed out',
    errorDetails: `The SolidWorks service did not respond to ping within ${timeoutMs / 1000} seconds (${attemptCount} attempts). The service may have failed to initialize properly.`
  }
}

// Detect if SolidWorks is installed
function isSolidWorksInstalled(): boolean {
  if (solidWorksInstalled !== null) {
    return solidWorksInstalled
  }

  if (process.platform !== 'win32') {
    solidWorksInstalled = false
    return false
  }

  try {
    const result = execSync(
      'reg query "HKEY_CLASSES_ROOT\\SldWorks.Application" /ve',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    solidWorksInstalled = result.includes('SldWorks.Application')
    log('[SolidWorks] Installation detected: ' + solidWorksInstalled)
    return solidWorksInstalled
  } catch {
    const commonPaths = [
      'C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\SLDWORKS.exe',
      'C:\\Program Files\\SolidWorks Corp\\SolidWorks\\SLDWORKS.exe',
      'C:\\Program Files (x86)\\SOLIDWORKS Corp\\SOLIDWORKS\\SLDWORKS.exe',
    ]
    
    for (const swPath of commonPaths) {
      if (fs.existsSync(swPath)) {
        solidWorksInstalled = true
        log('[SolidWorks] Installation detected at: ' + swPath)
        return true
      }
    }
    
    solidWorksInstalled = false
    log('[SolidWorks] Not installed on this machine')
    return false
  }
}

// Get the path to the SolidWorks service executable
function getSWServicePath(): { path: string; isProduction: boolean } {
  const isPackaged = app.isPackaged
  
  const possiblePaths = [
    { path: path.join(process.resourcesPath || '', 'bin', 'BluePLM.SolidWorksService.exe'), isProduction: true },
    { path: path.join(app.getAppPath(), 'solidworks-service', 'BluePLM.SolidWorksService', 'bin', 'Release', 'BluePLM.SolidWorksService.exe'), isProduction: false },
    { path: path.join(app.getAppPath(), 'solidworks-service', 'BluePLM.SolidWorksService', 'bin', 'Debug', 'BluePLM.SolidWorksService.exe'), isProduction: false },
  ]
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p.path)) {
      return p
    }
  }
  
  return isPackaged ? possiblePaths[0] : possiblePaths[1]
}

// Handle output from the service
function handleSWServiceOutput(data: string): void {
  swServiceBuffer += data
  
  const lines = swServiceBuffer.split('\n')
  swServiceBuffer = lines.pop() || ''
  
  for (const line of lines) {
    if (!line.trim()) continue
    
    try {
      const result = JSON.parse(line) as SWServiceResult & { requestId?: number }
      
      // Match response to request by requestId (if present) or fall back to FIFO
      const requestId = result.requestId
      if (requestId !== undefined && swPendingRequests.has(requestId)) {
        const handlers = swPendingRequests.get(requestId)!
        swPendingRequests.delete(requestId)
        handlers.resolve(result)
      } else {
        // Fallback to FIFO for backwards compatibility
        const entry = swPendingRequests.entries().next().value
        if (entry) {
          const [id, handlers] = entry
          swPendingRequests.delete(id)
          handlers.resolve(result)
        }
      }
    } catch {
      log('[SolidWorks Service] Failed to parse output: ' + line)
    }
  }
}

/**
 * Send a command to the SolidWorks service with queue management.
 * Commands are queued to prevent overwhelming the service.
 * @param command - Command object to send
 * @param options - Optional settings including timeout and queue bypass
 * @returns Promise resolving to command result
 */
async function sendSWCommand(
  command: Record<string, unknown>,
  options?: { timeoutMs?: number; bypassQueue?: boolean }
): Promise<SWServiceResult> {
  if (!swServiceProcess?.stdin) {
    return { success: false, error: 'SolidWorks service not running. Start it first.' }
  }
  
  // Ping commands bypass queue for immediate status checks
  const bypassQueue = options?.bypassQueue || command.action === 'ping'
  
  if (bypassQueue) {
    return executeCommandDirect(command, options)
  }
  
  // Queue the command and process
  return new Promise((resolve) => {
    const stats = getQueueStats()
    
    if (stats.queueDepth > 10) {
      log(`[SolidWorks Queue] High queue depth: ${stats.queueDepth} pending, ${stats.activeCommands} active`)
    }
    
    commandQueue.push({
      command,
      options,
      resolve,
      queuedAt: Date.now()
    })
    
    // Trigger queue processing
    processQueue()
  })
}

/**
 * Start the SolidWorks service process.
 * Uses polling-based startup confirmation instead of fixed delay.
 * @param dmLicenseKey - Optional Document Manager license key
 * @returns Promise resolving to service start result
 */
async function startSWService(dmLicenseKey?: string): Promise<SWServiceResult> {
  const startTime = Date.now()
  log('[SolidWorks] startSWService called')
  
  if (!isSolidWorksInstalled()) {
    log('[SolidWorks] SolidWorks not installed')
    return { 
      success: false, 
      error: 'SolidWorks not installed',
      errorDetails: 'SolidWorks is not installed on this machine. Please install SolidWorks to use this feature.'
    }
  }

  if (swServiceProcess) {
    // First check if the process is still alive at the OS level
    const pid = swServiceProcess.pid
    const processAlive = pid && !swServiceProcess.killed && checkProcessExists(pid)
    
    if (processAlive) {
      log('[SolidWorks] Process with PID ' + pid + ' is alive at OS level')
    } else if (pid) {
      log('[SolidWorks] Process with PID ' + pid + ' no longer exists')
    }
    
    if (!processAlive) {
      // Process is truly dead - clean up state (force since we verified it's dead)
      log('[SolidWorks] Process is dead, cleaning up state')
      clearServiceState('Process no longer exists', true)
    } else {
      // Process exists - verify it's responsive with a health ping (15 second timeout for busy service)
      log('[SolidWorks] Checking existing process health...')
      const pingResult = await sendSWCommand({ action: 'ping' }, { timeoutMs: 15000 })
      
      if (!pingResult.success) {
        // Ping failed but process is alive - service may be busy, not stale
        // Don't kill it! Just log a warning and return
        log('[SolidWorks] Service process alive but not responding to ping (may be busy)')
        log('[SolidWorks] Returning success to avoid killing busy service')
        return { 
          success: true, 
          data: { 
            message: 'Service running but busy, please wait',
            busy: true
          } 
        }
      } else {
        // Process is alive and responsive
        log('[SolidWorks] Service already running and healthy')
        if (dmLicenseKey) {
          const result = await sendSWCommand({ action: 'setDmLicense', licenseKey: dmLicenseKey })
          if (result.success) {
            return { success: true, data: { message: 'Service running, license key updated' } }
          }
        }
        return { success: true, data: { message: 'Service already running' } }
      }
    }
  }
  
  const serviceInfo = getSWServicePath()
  const servicePath = serviceInfo.path
  log('[SolidWorks] Service path: ' + servicePath)
  
  if (!fs.existsSync(servicePath)) {
    if (serviceInfo.isProduction) {
      return { 
        success: false, 
        error: 'SolidWorks service not bundled',
        errorDetails: 'The SolidWorks service executable was not included in this build. Please reinstall the application.'
      }
    } else {
      return { 
        success: false, 
        error: 'SolidWorks service not built',
        errorDetails: `Expected at: ${servicePath}\n\nBuild it with: dotnet build solidworks-service/BluePLM.SolidWorksService -c Release`
      }
    }
  }
  
  const args: string[] = []
  if (dmLicenseKey) {
    args.push('--dm-license', dmLicenseKey)
  }
  
  return new Promise((resolve) => {
    try {
      log('[SolidWorks] Spawning service process...')
      swServiceProcess = spawn(servicePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      
      const pid = swServiceProcess.pid
      // Save PID separately so we can detect if process is alive even if reference is lost
      lastKnownServicePid = pid ?? null
      log(`[SolidWorks] Service process spawned with PID: ${pid}`)
      
      swServiceProcess.stdout?.on('data', (data: Buffer) => {
        handleSWServiceOutput(data.toString())
      })
      
      swServiceProcess.stderr?.on('data', (data: Buffer) => {
        const stderr = data.toString().trim()
        if (stderr) {
          log('[SolidWorks Service stderr] ' + stderr)
        }
      })
      
      swServiceProcess.on('error', (err) => {
        // Error event can fire for IPC issues without the process dying
        // Don't force clear - let clearServiceState verify process is dead
        log('[SolidWorks Service] Process error: ' + String(err))
        clearServiceState(`Process error: ${String(err)}`, false)
      })
      
      swServiceProcess.on('close', (code, signal) => {
        // Close event means process actually exited - force clear state
        log(`[SolidWorks Service] Process exited with code: ${code}, signal: ${signal}`)
        clearServiceState(`Process exited (code: ${code}, signal: ${signal})`, true)
      })
      
      swServiceProcess.on('disconnect', () => {
        // Disconnect can happen due to stdio issues without process dying
        // Don't force clear - let clearServiceState verify process is dead
        log('[SolidWorks Service] Process disconnected')
        clearServiceState('Process disconnected', false)
      })
      
      // Use polling to wait for service readiness instead of fixed delay
      pollServiceUntilReady().then((result) => {
        const totalTime = Date.now() - startTime
        if (result.success) {
          log(`[SolidWorks] Service started successfully in ${totalTime}ms`)
        } else {
          log(`[SolidWorks] Service failed to start after ${totalTime}ms: ${result.error}`)
        }
        resolve(result)
      }).catch((err) => {
        const totalTime = Date.now() - startTime
        log(`[SolidWorks] Service startup error after ${totalTime}ms: ${String(err)}`)
        resolve({ 
          success: false, 
          error: 'Service startup failed',
          errorDetails: `An unexpected error occurred while starting the service: ${String(err)}`
        })
      })
      
    } catch (err) {
      const errorMsg = String(err)
      log('[SolidWorks] Failed to spawn service process: ' + errorMsg)
      resolve({ 
        success: false, 
        error: 'Failed to start service',
        errorDetails: `Could not spawn service process: ${errorMsg}`
      })
    }
  })
}

// Stop the SolidWorks service
async function stopSWService(): Promise<void> {
  if (!swServiceProcess) return
  
  try {
    await sendSWCommand({ action: 'quit' })
  } catch {
    // Ignore
  }
  
  swServiceProcess.kill()
  swServiceProcess = null
}

// Extract SolidWorks thumbnail from file
async function extractSolidWorksThumbnail(filePath: string): Promise<{ success: boolean; data?: string; error?: string }> {
  const fileName = path.basename(filePath)
  
  thumbnailsInProgress.add(filePath)
  
  try {
    const fileBuffer = fs.readFileSync(filePath)
    const cfb = CFB.read(fileBuffer, { type: 'buffer' })
    
    // Look for preview streams
    for (const entry of cfb.FileIndex) {
      if (!entry || !entry.content || entry.content.length < 100) continue
      
      // Check for PNG signature
      const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      const contentBuffer = Buffer.from(entry.content as number[] | Uint8Array)
      if (contentBuffer.slice(0, 8).equals(pngSignature)) {
        log(`[SWThumbnail] Found PNG in entry "${entry.name}"`)
        const base64 = Buffer.from(entry.content).toString('base64')
        return { success: true, data: `data:image/png;base64,${base64}` }
      }
      
      // Check for JPEG signature
      if (entry.content[0] === 0xFF && entry.content[1] === 0xD8 && entry.content[2] === 0xFF) {
        log(`[SWThumbnail] Found JPEG in entry "${entry.name}"`)
        const base64 = Buffer.from(entry.content).toString('base64')
        return { success: true, data: `data:image/jpeg;base64,${base64}` }
      }
      
      // Check for BMP
      if (entry.content[0] === 0x42 && entry.content[1] === 0x4D) {
        log(`[SWThumbnail] Found BMP in entry "${entry.name}"`)
        const base64 = Buffer.from(entry.content).toString('base64')
        return { success: true, data: `data:image/bmp;base64,${base64}` }
      }
    }
    
    log(`[SWThumbnail] No thumbnail found in ${fileName}`)
    return { success: false, error: 'No thumbnail found' }
  } catch (err) {
    log(`[SWThumbnail] Failed to extract thumbnail from ${fileName}: ${err}`)
    return { success: false, error: String(err) }
  } finally {
    thumbnailsInProgress.delete(filePath)
  }
}

// Extract high-quality preview from SolidWorks file
async function extractSolidWorksPreview(filePath: string): Promise<{ success: boolean; data?: string; error?: string }> {
  const fileName = path.basename(filePath)
  log(`[SWPreview] Extracting preview from: ${fileName}`)
  
  try {
    const fileBuffer = fs.readFileSync(filePath)
    const cfb = CFB.read(fileBuffer, { type: 'buffer' })
    
    const previewStreamNames = [
      'PreviewPNG',
      'Preview',
      'PreviewBitmap',
      '\\x05PreviewMetaFile',
      'Thumbnails/thumbnail.png',
      'PackageContents',
    ]
    
    // Try named streams first
    for (const streamName of previewStreamNames) {
      try {
        const entry = CFB.find(cfb, streamName)
        if (entry && entry.content && entry.content.length > 100) {
          log(`[SWPreview] Found stream "${streamName}" with ${entry.content.length} bytes`)
          
          // Check PNG
          const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
          const contentBuf = Buffer.from(entry.content as number[] | Uint8Array)
          if (contentBuf.slice(0, 8).equals(pngSignature)) {
            log(`[SWPreview] Found PNG preview in "${streamName}"!`)
            const base64 = contentBuf.toString('base64')
            return { success: true, data: `data:image/png;base64,${base64}` }
          }
          
          // Check BMP
          if (contentBuf[0] === 0x42 && contentBuf[1] === 0x4D) {
            log(`[SWPreview] Found BMP preview in "${streamName}"!`)
            const base64 = contentBuf.toString('base64')
            return { success: true, data: `data:image/bmp;base64,${base64}` }
          }
          
          // Check DIB (convert to BMP)
          if (contentBuf[0] === 0x28 && contentBuf[1] === 0x00 && contentBuf[2] === 0x00 && contentBuf[3] === 0x00) {
            log(`[SWPreview] Found DIB preview in "${streamName}", converting to BMP...`)
            const dibData = contentBuf
            const headerSize = dibData.readInt32LE(0)
            const pixelOffset = 14 + headerSize
            const fileSize = 14 + dibData.length
            
            const bmpHeader = Buffer.alloc(14)
            bmpHeader.write('BM', 0)
            bmpHeader.writeInt32LE(fileSize, 2)
            bmpHeader.writeInt32LE(0, 6)
            bmpHeader.writeInt32LE(pixelOffset, 10)
            
            const bmpData = Buffer.concat([bmpHeader, Buffer.from(dibData)])
            const base64 = bmpData.toString('base64')
            return { success: true, data: `data:image/bmp;base64,${base64}` }
          }
        }
      } catch {
        // Stream doesn't exist
      }
    }
    
    // Try all entries
    for (const entry of cfb.FileIndex) {
      if (!entry || !entry.content || entry.content.length < 100) continue
      
      const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      if (Buffer.from(entry.content.slice(0, 8)).equals(pngSignature)) {
        log(`[SWPreview] Found PNG in entry "${entry.name}"!`)
        const base64 = Buffer.from(entry.content).toString('base64')
        return { success: true, data: `data:image/png;base64,${base64}` }
      }
      
      if (entry.content[0] === 0xFF && entry.content[1] === 0xD8 && entry.content[2] === 0xFF) {
        log(`[SWPreview] Found JPEG in entry "${entry.name}"!`)
        const base64 = Buffer.from(entry.content).toString('base64')
        return { success: true, data: `data:image/jpeg;base64,${base64}` }
      }
    }
    
    log(`[SWPreview] No preview stream found in ${fileName}`)
    return { success: false, error: 'No preview stream found in file' }
    
  } catch (err) {
    log(`[SWPreview] Failed to extract preview from ${fileName}: ${err}`)
    return { success: false, error: String(err) }
  }
}

// Export functions for use by fs handlers
export function isFileBeingThumbnailed(filePath: string): boolean {
  return thumbnailsInProgress.has(filePath)
}

export function getThumbnailsInProgress(): Set<string> {
  return thumbnailsInProgress
}

export interface SolidWorksHandlerDependencies {
  log: (message: string, data?: unknown) => void
}

export function registerSolidWorksHandlers(window: BrowserWindow, deps: SolidWorksHandlerDependencies): void {
  mainWindow = window
  log = deps.log

  // Thumbnail extraction
  ipcMain.handle('solidworks:extract-thumbnail', async (_, filePath: string) => {
    return extractSolidWorksThumbnail(filePath)
  })

  // Preview extraction
  ipcMain.handle('solidworks:extract-preview', async (_, filePath: string) => {
    return extractSolidWorksPreview(filePath)
  })

  // Service management
  ipcMain.handle('solidworks:start-service', async (_, dmLicenseKey?: string) => {
    log('[SolidWorks] IPC: start-service received')
    return startSWService(dmLicenseKey)
  })

  ipcMain.handle('solidworks:stop-service', async () => {
    await stopSWService()
    return { success: true }
  })

  ipcMain.handle('solidworks:force-restart', async (_, dmLicenseKey?: string) => {
    log('[SolidWorks] Force restart requested')
    
    // Kill existing process if any
    if (swServiceProcess) {
      try {
        swServiceProcess.kill('SIGKILL')
      } catch { /* ignore */ }
      swServiceProcess = null
    }
    
    // Reject all pending requests
    for (const [, req] of swPendingRequests) {
      req.reject(new Error('Service force-restarted'))
    }
    swPendingRequests.clear()
    
    // Start fresh
    return startSWService(dmLicenseKey)
  })

  ipcMain.handle('solidworks:service-status', async () => {
    const swInstalled = isSolidWorksInstalled()
    const queueStats = getQueueStats()
    
    if (!swInstalled) {
      return { success: true, data: { running: false, installed: false, ...queueStats } }
    }
    
    // If we don't have a process reference, check if we have a saved PID
    // This handles the case where the reference was lost but process is still running
    if (!swServiceProcess) {
      if (lastKnownServicePid && checkProcessExists(lastKnownServicePid)) {
        log(`[SolidWorks] Status: No process reference but PID ${lastKnownServicePid} is alive - service is running but reference lost`)
        // Process is alive but we lost the reference (likely due to IPC errors)
        // Report as running but busy (we can't communicate with it reliably)
        return { 
          success: true, 
          data: { 
            running: true, 
            busy: true, 
            installed: true,
            referenceRecoveryNeeded: true,
            message: 'Service running but IPC connection lost - restart recommended',
            ...queueStats 
          } 
        }
      }
      return { success: true, data: { running: false, installed: true, ...queueStats } }
    }
    
    // First check if process is alive at OS level
    const pid = swServiceProcess.pid
    const processAlive = pid ? checkProcessExists(pid) : false
    
    if (!processAlive) {
      log('[SolidWorks] Status check: process not alive at OS level, cleaning up')
      clearServiceState('Process no longer exists (detected during status check)', true)
      return { success: true, data: { running: false, installed: true, ...queueStats } }
    }
    
    // Check ping cache to avoid redundant checks
    const now = Date.now()
    if (pingCache && (now - pingCache.timestamp) < PING_CACHE_TTL_MS) {
      const cachedData = pingCache.result.data as Record<string, unknown> | undefined
      return { 
        success: true, 
        data: { 
          running: pingCache.result.success,
          busy: !pingCache.result.success,
          installed: true,
          cached: true,
          version: cachedData?.version,
          swInstalled: cachedData?.swInstalled,
          documentManagerAvailable: cachedData?.documentManagerAvailable,
          documentManagerError: cachedData?.documentManagerError,
          fastModeEnabled: cachedData?.fastModeEnabled,
          ...queueStats
        } 
      }
    }
    
    // Ping with short timeout (2s) to avoid blocking status checks
    const result = await sendSWCommand(
      { action: 'ping' }, 
      { timeoutMs: STATUS_PING_TIMEOUT_MS, bypassQueue: true }
    )
    
    // Cache the ping result
    pingCache = { result, timestamp: now }
    
    const data = result.data as Record<string, unknown> | undefined
    
    // If ping failed but process is alive, it's busy - not offline
    const isBusy = !result.success && processAlive
    
    if (isBusy) {
      log(`[SolidWorks] Status check: process alive but ping failed - marking as busy (queue: ${queueStats.queueDepth}, active: ${queueStats.activeCommands})`)
    }
    
    return { 
      success: true, 
      data: { 
        running: result.success,
        busy: isBusy,
        installed: true, 
        version: data?.version,
        swInstalled: data?.swInstalled,
        documentManagerAvailable: data?.documentManagerAvailable,
        documentManagerError: data?.documentManagerError,
        fastModeEnabled: data?.fastModeEnabled,
        ...queueStats
      } 
    }
  })

  ipcMain.handle('solidworks:is-installed', async () => {
    return { success: true, data: { installed: isSolidWorksInstalled() } }
  })

  // Document operations
  ipcMain.handle('solidworks:get-bom', async (_, filePath: string, options?: { includeChildren?: boolean; configuration?: string }) => {
    return sendSWCommand({ action: 'getBom', filePath, ...options })
  })

  ipcMain.handle('solidworks:get-properties', async (_, filePath: string, configuration?: string) => {
    return sendSWCommand({ action: 'getProperties', filePath, configuration })
  })

  ipcMain.handle('solidworks:set-properties', async (_, filePath: string, properties: Record<string, string>, configuration?: string) => {
    return sendSWCommand({ action: 'setProperties', filePath, properties, configuration })
  })

  ipcMain.handle('solidworks:set-properties-batch', async (_, filePath: string, configProperties: Record<string, Record<string, string>>) => {
    return sendSWCommand({ action: 'setPropertiesBatch', filePath, configProperties })
  })

  ipcMain.handle('solidworks:get-configurations', async (_, filePath: string) => {
    return sendSWCommand({ action: 'getConfigurations', filePath })
  })

  ipcMain.handle('solidworks:get-references', async (_, filePath: string) => {
    return sendSWCommand({ action: 'getReferences', filePath })
  })

  ipcMain.handle('solidworks:get-preview', async (_, filePath: string, configuration?: string) => {
    return sendSWCommand({ action: 'getPreview', filePath, configuration })
  })

  ipcMain.handle('solidworks:get-mass-properties', async (_, filePath: string, configuration?: string) => {
    return sendSWCommand({ action: 'getMassProperties', filePath, configuration })
  })

  // Export operations
  ipcMain.handle('solidworks:export-pdf', async (_, filePath: string, outputPath?: string) => {
    return sendSWCommand({ action: 'exportPdf', filePath, outputPath })
  })

  ipcMain.handle('solidworks:export-step', async (_, filePath: string, options?: { outputPath?: string; configuration?: string; exportAllConfigs?: boolean; configurations?: string[]; filenamePattern?: string; pdmMetadata?: { partNumber?: string; revision?: string; description?: string } }) => {
    return sendSWCommand({ action: 'exportStep', filePath, ...options })
  })

  ipcMain.handle('solidworks:export-dxf', async (_, filePath: string, outputPath?: string) => {
    return sendSWCommand({ action: 'exportDxf', filePath, outputPath })
  })

  ipcMain.handle('solidworks:export-iges', async (_, filePath: string, outputPath?: string) => {
    return sendSWCommand({ action: 'exportIges', filePath, outputPath })
  })

  ipcMain.handle('solidworks:export-image', async (_, filePath: string, options?: { outputPath?: string; width?: number; height?: number }) => {
    return sendSWCommand({ action: 'exportImage', filePath, ...options })
  })

  ipcMain.handle('solidworks:replace-component', async (_, assemblyPath: string, oldComponent: string, newComponent: string) => {
    return sendSWCommand({ action: 'replaceComponent', filePath: assemblyPath, oldComponent, newComponent })
  })

  ipcMain.handle('solidworks:pack-and-go', async (_, filePath: string, outputFolder: string, options?: { prefix?: string; suffix?: string }) => {
    return sendSWCommand({ action: 'packAndGo', filePath, outputFolder, ...options })
  })

  // Open document management
  ipcMain.handle('solidworks:get-open-documents', async () => {
    return sendSWCommand({ action: 'getOpenDocuments' })
  })

  ipcMain.handle('solidworks:is-document-open', async (_, filePath: string) => {
    return sendSWCommand({ action: 'isDocumentOpen', filePath })
  })

  ipcMain.handle('solidworks:get-document-info', async (_, filePath: string) => {
    return sendSWCommand({ action: 'getDocumentInfo', filePath })
  })

  ipcMain.handle('solidworks:set-document-readonly', async (_, filePath: string, readOnly: boolean) => {
    return sendSWCommand({ action: 'setDocumentReadOnly', filePath, readOnly })
  })

  ipcMain.handle('solidworks:save-document', async (_, filePath: string) => {
    return sendSWCommand({ action: 'saveDocument', filePath })
  })

  // eDrawings handlers
  ipcMain.handle('edrawings:check-installed', async () => {
    const paths = [
      'C:\\Program Files\\SOLIDWORKS Corp\\eDrawings\\eDrawings.exe',
      'C:\\Program Files\\eDrawings\\eDrawings.exe',
      'C:\\Program Files (x86)\\eDrawings\\eDrawings.exe',
      'C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\eDrawings\\eDrawings.exe'
    ]
    
    for (const ePath of paths) {
      if (fs.existsSync(ePath)) {
        return { installed: true, path: ePath }
      }
    }
    
    return { installed: false, path: null }
  })

  ipcMain.handle('edrawings:native-available', () => {
    return false // Native module not available in refactored version
  })

  ipcMain.handle('edrawings:open-file', async (_, filePath: string) => {
    const eDrawingsPaths = [
      'C:\\Program Files\\SOLIDWORKS Corp\\eDrawings\\eDrawings.exe',
      'C:\\Program Files\\eDrawings\\eDrawings.exe',
      'C:\\Program Files (x86)\\eDrawings\\eDrawings.exe',
      'C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\eDrawings\\eDrawings.exe'
    ]
    
    let eDrawingsPath: string | null = null
    for (const ePath of eDrawingsPaths) {
      if (fs.existsSync(ePath)) {
        eDrawingsPath = ePath
        break
      }
    }
    
    if (!eDrawingsPath) {
      try {
        await shell.openPath(filePath)
        return { success: true, fallback: true }
      } catch {
        return { success: false, error: 'eDrawings not found' }
      }
    }
    
    try {
      spawn(eDrawingsPath, [filePath], { 
        detached: true,
        stdio: 'ignore'
      }).unref()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('edrawings:get-window-handle', () => {
    if (!mainWindow) return null
    const handle = mainWindow.getNativeWindowHandle()
    return Array.from(handle)
  })

  // Placeholder handlers for eDrawings preview (native module not loaded)
  ipcMain.handle('edrawings:create-preview', () => {
    return { success: false, error: 'Native module not available' }
  })

  ipcMain.handle('edrawings:attach-preview', () => {
    return { success: false, error: 'Preview not created' }
  })

  ipcMain.handle('edrawings:load-file', async () => {
    return { success: false, error: 'Preview not attached' }
  })

  ipcMain.handle('edrawings:set-bounds', async () => {
    return { success: false }
  })

  ipcMain.handle('edrawings:show-preview', () => {
    return { success: false }
  })

  ipcMain.handle('edrawings:hide-preview', () => {
    return { success: false }
  })

  ipcMain.handle('edrawings:destroy-preview', () => {
    return { success: true }
  })
}

export function unregisterSolidWorksHandlers(): void {
  const handlers = [
    'solidworks:extract-thumbnail', 'solidworks:extract-preview',
    'solidworks:start-service', 'solidworks:stop-service', 'solidworks:force-restart', 'solidworks:service-status', 'solidworks:is-installed',
    'solidworks:get-bom', 'solidworks:get-properties', 'solidworks:set-properties', 'solidworks:set-properties-batch',
    'solidworks:get-configurations', 'solidworks:get-references', 'solidworks:get-preview', 'solidworks:get-mass-properties',
    'solidworks:export-pdf', 'solidworks:export-step', 'solidworks:export-dxf', 'solidworks:export-iges', 'solidworks:export-image',
    'solidworks:replace-component', 'solidworks:pack-and-go',
    'solidworks:get-open-documents', 'solidworks:is-document-open', 'solidworks:get-document-info',
    'solidworks:set-document-readonly', 'solidworks:save-document',
    'edrawings:check-installed', 'edrawings:native-available', 'edrawings:open-file', 'edrawings:get-window-handle',
    'edrawings:create-preview', 'edrawings:attach-preview', 'edrawings:load-file', 'edrawings:set-bounds',
    'edrawings:show-preview', 'edrawings:hide-preview', 'edrawings:destroy-preview'
  ]
  
  for (const handler of handlers) {
    ipcMain.removeHandler(handler)
  }
}

/**
 * Cleanup function to be called on app quit.
 * Gracefully stops the SolidWorks service and clears all state.
 * Should be registered with app.on('before-quit').
 */
export async function cleanupSolidWorksService(): Promise<void> {
  log('[SolidWorks] Cleaning up service on app quit...')
  
  if (!swServiceProcess) {
    log('[SolidWorks] No service process to clean up')
    return
  }
  
  try {
    // Try to send quit command gracefully (short timeout)
    log('[SolidWorks] Sending quit command to service...')
    await sendSWCommand({ action: 'quit' }, { timeoutMs: 2000 })
  } catch {
    log('[SolidWorks] Quit command failed or timed out, will kill process')
  }
  
  // Force kill if still running
  if (swServiceProcess) {
    try {
      log('[SolidWorks] Killing service process...')
      swServiceProcess.kill('SIGKILL')
    } catch (err) {
      log('[SolidWorks] Error killing process: ' + String(err))
    }
  }
  
  clearServiceState('App quit cleanup', true)
  log('[SolidWorks] Service cleanup complete')
}
