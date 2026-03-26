/**
 * Logger for the Extension Host process (hidden BrowserWindow).
 *
 * Wraps console.* to provide structured logging. Uses console.* internally
 * because the extension host runs in a renderer context without direct
 * access to the main process writeLog.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function write(level: LogLevel, message: string, data?: unknown): void {
  const logLine = data !== undefined ? `${message}` : message
  switch (level) {
    case 'debug':
      console.debug(logLine, data ?? '')
      break
    case 'warn':
      console.warn(logLine, data ?? '')
      break
    case 'error':
      console.error(logLine, data ?? '')
      break
    default:
      console.log(logLine, data ?? '')
  }
}

export const hostLog = {
  debug(prefix: string, message: string, data?: unknown): void {
    write('debug', `${prefix} ${message}`, data)
  },
  info(prefix: string, message: string, data?: unknown): void {
    write('info', `${prefix} ${message}`, data)
  },
  warn(prefix: string, message: string, data?: unknown): void {
    write('warn', `${prefix} ${message}`, data)
  },
  error(prefix: string, message: string, data?: unknown): void {
    write('error', `${prefix} ${message}`, data)
  },
}
