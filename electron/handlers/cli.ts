// CLI Server and Token Authentication Handler
// Provides secure token-based authentication for the external CLI

import { app, ipcMain, BrowserWindow } from 'electron'
import http from 'http'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// ============================================
// Types
// ============================================

interface CliToken {
  token: string
  created_at: string
  user_email: string
}

interface CliCommandResult {
  outputs?: Array<{ type: string; content: string }>
  [key: string]: unknown
}

interface PendingRequest {
  resolve: (result: CliCommandResult) => void
  reject: (err: Error) => void
}

export interface CliHandlerDependencies {
  log: (message: string, data?: unknown) => void
  logError: (message: string, data?: unknown) => void
}

// ============================================
// Module State
// ============================================

let mainWindow: BrowserWindow | null = null
let log: (message: string, data?: unknown) => void = console.log
let logError: (message: string, data?: unknown) => void = console.error

let cliServer: http.Server | null = null
let currentToken: string | null = null
const pendingCliRequests: Map<string, PendingRequest> = new Map()
const activeConnections: Set<import('net').Socket> = new Set()

const CLI_PORT = 31337
const TOKEN_LENGTH = 32 // 32 bytes = 64 hex characters

// ============================================
// Token File Path
// ============================================

/**
 * Get the platform-appropriate token file path.
 * - Windows: %APPDATA%\blueplm\cli-token.json
 * - Mac/Linux: ~/.config/blueplm/cli-token.json
 */
function getTokenFilePath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'blueplm', 'cli-token.json')
  } else {
    const home = require('os').homedir()
    return path.join(home, '.config', 'blueplm', 'cli-token.json')
  }
}

/**
 * Ensure the parent directory exists for the token file.
 */
function ensureTokenDir(): void {
  const tokenPath = getTokenFilePath()
  const dir = path.dirname(tokenPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
}

// ============================================
// Token Management
// ============================================

/**
 * Generate a new CLI token and write it to the token file.
 * @param userEmail The email of the authenticated user
 * @returns The generated token or null on error
 */
export function generateCliToken(userEmail: string): string | null {
  try {
    ensureTokenDir()
    
    const token = crypto.randomBytes(TOKEN_LENGTH).toString('hex')
    const tokenData: CliToken = {
      token,
      created_at: new Date().toISOString(),
      user_email: userEmail
    }
    
    const tokenPath = getTokenFilePath()
    const content = JSON.stringify(tokenData, null, 2)
    
    // Write with restricted permissions
    fs.writeFileSync(tokenPath, content, { 
      encoding: 'utf-8',
      mode: 0o600 // Owner read/write only (ignored on Windows but good practice)
    })
    
    // Store in memory for validation
    currentToken = token
    
    log('[CLI] Token generated for user', { email: userEmail, path: tokenPath })
    return token
  } catch (err) {
    logError('[CLI] Failed to generate token', { error: String(err) })
    return null
  }
}

/**
 * Revoke the current CLI token by deleting the token file.
 * @returns true if successful, false otherwise
 */
export function revokeCliToken(): boolean {
  try {
    const tokenPath = getTokenFilePath()
    
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath)
      log('[CLI] Token revoked', { path: tokenPath })
    }
    
    // Clear from memory
    currentToken = null
    
    return true
  } catch (err) {
    logError('[CLI] Failed to revoke token', { error: String(err) })
    return false
  }
}

/**
 * Load and validate the token from file (for cold start scenarios).
 * @returns The loaded token or null if invalid/missing
 */
function loadTokenFromFile(): string | null {
  try {
    const tokenPath = getTokenFilePath()
    
    if (!fs.existsSync(tokenPath)) {
      return null
    }
    
    const content = fs.readFileSync(tokenPath, 'utf-8')
    const data = JSON.parse(content) as CliToken
    
    if (!data.token || typeof data.token !== 'string') {
      return null
    }
    
    return data.token
  } catch {
    return null
  }
}

/**
 * Validate a token against the current stored token.
 * @param providedToken The token from the CLI request
 * @returns true if valid, false otherwise
 */
export function validateCliToken(providedToken: string): boolean {
  // First check memory cache
  if (currentToken) {
    return crypto.timingSafeEqual(
      Buffer.from(currentToken),
      Buffer.from(providedToken)
    )
  }
  
  // Fall back to file check (e.g., app was restarted but user still logged in)
  const storedToken = loadTokenFromFile()
  if (storedToken) {
    currentToken = storedToken // Cache for next time
    try {
      return crypto.timingSafeEqual(
        Buffer.from(storedToken),
        Buffer.from(providedToken)
      )
    } catch {
      // Length mismatch
      return false
    }
  }
  
  return false
}

/**
 * Extract bearer token from Authorization header.
 * @param authHeader The Authorization header value
 * @returns The token or null if invalid format
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null
  }
  
  return parts[1]
}

/**
 * Get CLI authentication status (whether a token is active).
 */
export function getCliStatus(): { authenticated: boolean; serverRunning: boolean } {
  const hasToken = !!(currentToken || loadTokenFromFile())
  return {
    authenticated: hasToken,
    serverRunning: cliServer !== null
  }
}

// ============================================
// CLI Server
// ============================================

/**
 * Start the CLI server with token authentication.
 */
export function startCliServer(): void {
  if (cliServer) {
    log('[CLI Server] Already running')
    return
  }
  
  cliServer = http.createServer(async (req, res) => {
    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Content-Type', 'application/json')
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }
    
    // Only accept POST requests
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }
    
    // Validate authentication
    const token = extractBearerToken(req.headers.authorization)
    
    if (!token) {
      res.writeHead(401)
      res.end(JSON.stringify({ 
        error: 'Authentication required',
        message: 'Missing Authorization header. Please log in to BluePLM first.'
      }))
      return
    }
    
    if (!validateCliToken(token)) {
      res.writeHead(403)
      res.end(JSON.stringify({ 
        error: 'Invalid token',
        message: 'Token is invalid or expired. Please log in to BluePLM again.'
      }))
      return
    }
    
    // Parse request body
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { command } = JSON.parse(body)
        
        if (!command || typeof command !== 'string') {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Missing command' }))
          return
        }
        
        log(`[CLI Server] Received command: ${command}`)
        
        // Handle built-in commands
        if (command === 'reload-app' || command === 'restart') {
          log('[CLI Server] Reloading app...')
          if (mainWindow) {
            mainWindow.webContents.reload()
            res.writeHead(200)
            res.end(JSON.stringify({ 
              success: true, 
              result: { outputs: [{ type: 'info', content: 'Reloading app...' }] } 
            }))
          } else {
            res.writeHead(503)
            res.end(JSON.stringify({ error: 'No window' }))
          }
          return
        }
        
        // Forward command to renderer for execution
        const requestId = `cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        
        const resultPromise = new Promise<CliCommandResult>((resolve, reject) => {
          pendingCliRequests.set(requestId, { resolve, reject })
          
          // Timeout after 30 seconds
          setTimeout(() => {
            if (pendingCliRequests.has(requestId)) {
              pendingCliRequests.delete(requestId)
              reject(new Error('Command timeout'))
            }
          }, 30000)
        })
        
        if (mainWindow?.webContents) {
          mainWindow.webContents.send('cli-command', { requestId, command })
        } else {
          res.writeHead(503)
          res.end(JSON.stringify({ error: 'App not ready' }))
          return
        }
        
        const result = await resultPromise
        res.writeHead(200)
        res.end(JSON.stringify({ success: true, result }))
        
      } catch (err) {
        log(`[CLI Server] Error: ${err}`)
        res.writeHead(500)
        res.end(JSON.stringify({ error: String(err) }))
      }
    })
  })
  
  // Track connections so we can forcefully destroy them on shutdown
  cliServer.on('connection', (socket) => {
    activeConnections.add(socket)
    socket.on('close', () => {
      activeConnections.delete(socket)
    })
  })
  
  cliServer.listen(CLI_PORT, '127.0.0.1', () => {
    log(`[CLI Server] Listening on http://127.0.0.1:${CLI_PORT}`)
    console.log(`\n📟 BluePLM CLI Server running on port ${CLI_PORT}`)
    console.log(`   Use: node cli/blueplm.js <command>\n`)
  })
  
  cliServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      log(`[CLI Server] Port ${CLI_PORT} already in use`)
    } else {
      logError('[CLI Server] Error', { error: String(err) })
    }
  })
}

/**
 * Stop the CLI server.
 * Destroys all active connections to ensure immediate shutdown.
 */
export function stopCliServer(): void {
  if (cliServer) {
    // Destroy all active connections immediately
    for (const socket of activeConnections) {
      socket.destroy()
    }
    activeConnections.clear()
    
    cliServer.close()
    cliServer = null
    log('[CLI Server] Stopped')
  }
}

// ============================================
// IPC Handlers
// ============================================

export function registerCliHandlers(window: BrowserWindow, deps: CliHandlerDependencies): void {
  mainWindow = window
  log = deps.log
  logError = deps.logError
  
  // Generate a new CLI token (called when user logs in)
  ipcMain.handle('cli:generate-token', (_event, userEmail: string) => {
    const token = generateCliToken(userEmail)
    return { success: !!token, token }
  })
  
  // Revoke the current CLI token (called when user logs out)
  ipcMain.handle('cli:revoke-token', () => {
    const success = revokeCliToken()
    return { success }
  })
  
  // Get CLI server status
  ipcMain.handle('cli:get-status', () => {
    return getCliStatus()
  })
  
  // Handle CLI command responses from renderer
  ipcMain.on('cli-response', (_, { requestId, result }: { requestId: string; result: CliCommandResult }) => {
    const pending = pendingCliRequests.get(requestId)
    if (pending) {
      pendingCliRequests.delete(requestId)
      pending.resolve(result)
    }
  })
  
  log('[CLI] Handlers registered')
}

export function unregisterCliHandlers(): void {
  ipcMain.removeHandler('cli:generate-token')
  ipcMain.removeHandler('cli:revoke-token')
  ipcMain.removeHandler('cli:get-status')
  ipcMain.removeAllListeners('cli-response')
}

// ============================================
// Cleanup
// ============================================

/**
 * Clean up CLI resources (call on app quit).
 * - Stops CLI server
 * - Revokes token
 */
export function cleanupCli(): void {
  stopCliServer()
  revokeCliToken()
  log('[CLI] Cleanup complete')
}
