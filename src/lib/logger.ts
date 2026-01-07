/**
 * Unified Logger for BluePLM
 *
 * Provides dual-output logging to both DevTools console and Electron's app log file.
 * Supports log levels (error, warn, info, debug) and category prefixes for filtering.
 *
 * Usage:
 * ```typescript
 * import { log } from '@/lib/logger'
 *
 * log.error('[Auth]', 'Failed to authenticate', { userId, error })
 * log.warn('[Session]', 'Token expiring soon', { expiresIn })
 * log.info('[Realtime]', 'Connected to channel', { channel })
 * log.debug('[PathMatch]', 'Checking path', { path }) // Only when debug enabled
 * ```
 *
 * Debug mode can be enabled via:
 * - localStorage.setItem('debug', 'true')
 * - localStorage.setItem('debug', '*') // Enable all
 * - localStorage.setItem('debug', '[Auth]') // Enable specific category
 */

// ============================================
// Types
// ============================================

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

interface LogData {
  [key: string]: unknown
}

// ============================================
// Configuration
// ============================================

/**
 * Check if debug logging is enabled.
 * Supports patterns:
 * - 'true' or '*' - enable all debug logs
 * - '[Category]' - enable debug logs for specific category
 */
function isDebugEnabled(category?: string): boolean {
  try {
    const debugSetting = localStorage.getItem('debug')
    if (!debugSetting) return false

    // Enable all debug logs
    if (debugSetting === 'true' || debugSetting === '*') return true

    // Check for category-specific debug
    if (category && debugSetting.includes(category)) return true

    return false
  } catch {
    // localStorage may not be available (e.g., in tests)
    return false
  }
}

/**
 * Extract category from the first argument if it matches [Category] pattern.
 */
function extractCategory(firstArg: string): string | undefined {
  const match = firstArg.match(/^\[([^\]]+)\]$/)
  return match ? match[1] : undefined
}

// ============================================
// Electron Integration
// ============================================

/**
 * Send log to Electron's app log file.
 * Gracefully handles cases where electronAPI is unavailable (web mode, tests).
 */
function sendToElectron(level: LogLevel, message: string, data?: LogData): void {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.log) {
      window.electronAPI.log(level, message, data)
    }
  } catch {
    // Silently ignore if electron API is unavailable
  }
}

// ============================================
// Formatting
// ============================================

/**
 * Format log arguments into a single message string.
 */
function formatMessage(category: string, message: string): string {
  return `${category} ${message}`
}

/**
 * Format data object for console output.
 * Returns undefined if data is empty or undefined.
 */
function formatData(data?: LogData): LogData | undefined {
  if (!data || Object.keys(data).length === 0) return undefined
  return data
}

// ============================================
// Core Logger Implementation
// ============================================

/**
 * Internal log function that handles dual output.
 */
function logMessage(
  level: LogLevel,
  category: string,
  message: string,
  data?: LogData
): void {
  const formattedMessage = formatMessage(category, message)
  const formattedData = formatData(data)

  // Check debug level filtering
  if (level === 'debug') {
    const categoryName = extractCategory(category)
    if (!isDebugEnabled(categoryName)) return
  }

  // Console output with appropriate method
  const consoleMethod = console[level] || console.log
  if (formattedData) {
    consoleMethod(formattedMessage, formattedData)
  } else {
    consoleMethod(formattedMessage)
  }

  // Electron app log output
  sendToElectron(level, formattedMessage, formattedData)
}

// ============================================
// Public API
// ============================================

/**
 * Logger instance with methods for each log level.
 *
 * Each method accepts:
 * - category: A bracketed category prefix (e.g., '[Auth]', '[Realtime]')
 * - message: The log message
 * - data: Optional structured data object
 */
export const log = {
  /**
   * Log an error message.
   * Always outputs to both console and Electron log.
   */
  error(category: string, message: string, data?: LogData): void {
    logMessage('error', category, message, data)
  },

  /**
   * Log a warning message.
   * Always outputs to both console and Electron log.
   */
  warn(category: string, message: string, data?: LogData): void {
    logMessage('warn', category, message, data)
  },

  /**
   * Log an info message.
   * Always outputs to both console and Electron log.
   */
  info(category: string, message: string, data?: LogData): void {
    logMessage('info', category, message, data)
  },

  /**
   * Log a debug message.
   * Only outputs when debug mode is enabled via localStorage.
   *
   * Enable with:
   * - localStorage.setItem('debug', 'true') - all debug logs
   * - localStorage.setItem('debug', '[Auth]') - specific category
   */
  debug(category: string, message: string, data?: LogData): void {
    logMessage('debug', category, message, data)
  },

  /**
   * Check if debug mode is currently enabled.
   */
  isDebugEnabled,

  /**
   * Enable debug logging programmatically.
   * @param pattern - 'true' for all, or '[Category]' for specific
   */
  enableDebug(pattern: string = 'true'): void {
    try {
      localStorage.setItem('debug', pattern)
    } catch {
      // Ignore if localStorage unavailable
    }
  },

  /**
   * Disable debug logging.
   */
  disableDebug(): void {
    try {
      localStorage.removeItem('debug')
    } catch {
      // Ignore if localStorage unavailable
    }
  },
}

// Export types for consumers
export type { LogLevel, LogData }
