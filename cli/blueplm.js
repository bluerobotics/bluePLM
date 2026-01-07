#!/usr/bin/env node
/**
 * BluePLM External CLI
 * 
 * Sends commands to the running BluePLM Electron app via HTTP.
 * Requires authentication via token file generated when logging into BluePLM.
 * 
 * Usage:
 *   node blueplm.js <command>
 *   node blueplm.js "mkdir test"
 *   node blueplm.js "cd test && mkdir subfolder"
 * 
 * Interactive mode:
 *   node blueplm.js
 */

const http = require('http')
const readline = require('readline')
const fs = require('fs')
const path = require('path')
const os = require('os')

const CLI_PORT = 31337
const CLI_HOST = '127.0.0.1'

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

function colorize(type, text) {
  switch (type) {
    case 'error': return `${colors.red}${text}${colors.reset}`
    case 'success': return `${colors.green}${text}${colors.reset}`
    case 'warning': return `${colors.yellow}${text}${colors.reset}`
    case 'info': return `${colors.cyan}${text}${colors.reset}`
    case 'input': return `${colors.gray}${text}${colors.reset}`
    default: return text
  }
}

/**
 * Get the path to the CLI token file based on platform
 * @returns {string} Path to the token file
 */
function getTokenFilePath() {
  const platform = os.platform()
  
  if (platform === 'win32') {
    // Windows: %APPDATA%\blueplm\cli-token.json
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'blueplm', 'cli-token.json')
  } else {
    // Mac/Linux: ~/.config/blueplm/cli-token.json
    const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    return path.join(configDir, 'blueplm', 'cli-token.json')
  }
}

/**
 * Read the authentication token from file
 * @returns {{ token: string, user_email?: string } | null} Token data or null if not found
 */
function readToken() {
  const tokenPath = getTokenFilePath()
  
  try {
    if (!fs.existsSync(tokenPath)) {
      return null
    }
    
    const content = fs.readFileSync(tokenPath, 'utf8')
    const data = JSON.parse(content)
    
    if (!data.token || typeof data.token !== 'string') {
      return null
    }
    
    return {
      token: data.token,
      user_email: data.user_email
    }
  } catch (err) {
    // Token file exists but is corrupt or unreadable
    return null
  }
}

/**
 * Send a command to the BluePLM app
 * @param {string} command - The command to execute
 * @param {string | null} token - Authentication token
 */
function sendCommand(command, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ command })
    
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
    
    // Add authorization header if token is available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    
    const req = http.request({
      hostname: CLI_HOST,
      port: CLI_PORT,
      path: '/',
      method: 'POST',
      headers,
      timeout: 30000
    }, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        // Handle authentication errors
        if (res.statusCode === 401) {
          reject(new AuthError('Authentication required. Please log in to BluePLM.'))
          return
        }
        
        if (res.statusCode === 403) {
          reject(new AuthError('Invalid or expired token. Please log in to BluePLM again.'))
          return
        }
        
        try {
          const result = JSON.parse(body)
          resolve(result)
        } catch (e) {
          reject(new Error(`Invalid response: ${body}`))
        }
      })
    })
    
    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error('BluePLM is not running or CLI server is disabled.\nMake sure the app is running with npm run dev.'))
      } else {
        reject(err)
      }
    })
    
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Command timed out'))
    })
    
    req.write(data)
    req.end()
  })
}

/**
 * Custom error class for authentication errors
 */
class AuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Execute a command and print results
 * @param {string} command - The command to execute
 * @param {string | null} token - Authentication token
 */
async function executeCommand(command, token) {
  try {
    const result = await sendCommand(command, token)
    
    if (result.success && result.result?.outputs) {
      for (const output of result.result.outputs) {
        console.log(colorize(output.type, output.content))
      }
    } else if (result.error) {
      console.error(colorize('error', `Error: ${result.error}`))
      return false
    }
    return true
  } catch (err) {
    if (err instanceof AuthError) {
      console.error(colorize('error', `Authentication Error: ${err.message}`))
    } else {
      console.error(colorize('error', err.message))
    }
    return false
  }
}

/**
 * Interactive REPL mode
 * @param {string | null} token - Authentication token
 * @param {string | undefined} userEmail - User email for display
 */
async function interactiveMode(token, userEmail) {
  console.log(colorize('info', '🔷 BluePLM CLI'))
  console.log(colorize('gray', `Connected to localhost:${CLI_PORT}`))
  
  if (userEmail) {
    console.log(colorize('success', `Authenticated as: ${userEmail}`))
  } else if (!token) {
    console.log(colorize('warning', '⚠ Not authenticated - commands may fail'))
  }
  
  console.log(colorize('gray', 'Type "help" for commands, "exit" to quit\n'))
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.blue}blueplm>${colors.reset} `
  })
  
  rl.prompt()
  
  rl.on('line', async (line) => {
    const command = line.trim()
    
    if (!command) {
      rl.prompt()
      return
    }
    
    if (command === 'exit' || command === 'quit') {
      console.log(colorize('gray', 'Goodbye!'))
      rl.close()
      process.exit(0)
    }
    
    await executeCommand(command, token)
    console.log() // Empty line for readability
    rl.prompt()
  })
  
  rl.on('close', () => {
    process.exit(0)
  })
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2)
  
  // Read authentication token
  const tokenData = readToken()
  const token = tokenData?.token || null
  const userEmail = tokenData?.user_email
  
  // Show warning if not authenticated (but don't exit - server may allow unauthenticated)
  if (!token) {
    console.error(colorize('warning', '⚠ Not authenticated. Log in to BluePLM to enable CLI access.'))
    console.error(colorize('gray', `  Token file not found: ${getTokenFilePath()}\n`))
  }
  
  if (args.length === 0) {
    // Interactive mode
    await interactiveMode(token, userEmail)
  } else {
    // Single command mode
    const command = args.join(' ')
    const success = await executeCommand(command, token)
    process.exit(success ? 0 : 1)
  }
}

main().catch(err => {
  console.error(colorize('error', err.message))
  process.exit(1)
})
