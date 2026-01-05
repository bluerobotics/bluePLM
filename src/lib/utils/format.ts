/**
 * Formatting utilities for display
 *
 * Pure utility functions for formatting numbers, sizes, durations, etc.
 * No side effects, no API calls, no store access.
 */

/**
 * Format bytes to human-readable string (B, KB, MB, GB, TB)
 *
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string with unit
 *
 * @example
 * formatFileSize(1024) // "1.0 KB"
 * formatFileSize(1536000) // "1.5 MB"
 * formatFileSize(0) // "0 B"
 */
export function formatFileSize(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  if (bytes < 0) return '-' + formatFileSize(-bytes, decimals)

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const index = Math.min(i, sizes.length - 1)

  return parseFloat((bytes / Math.pow(k, index)).toFixed(decimals)) + ' ' + sizes[index]
}

/**
 * Format bytes to human-readable string (alias for formatFileSize)
 * Preserved for backward compatibility with existing code
 *
 * @param bytes - Number of bytes
 * @returns Formatted string with unit
 *
 * @example
 * formatBytes(1536000) // "1.5 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

/**
 * Format speed in bytes per second to human-readable string
 *
 * @param bytesPerSecond - Transfer speed in bytes/second
 * @returns Formatted speed string (e.g., "1.5 MB/s")
 *
 * @example
 * formatSpeed(1536000) // "1.5 MB/s"
 * formatSpeed(512) // "512 B/s"
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  }
  if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`
  }
  return `${bytesPerSecond.toFixed(0)} B/s`
}

/**
 * Format a number with locale-specific thousand separators
 *
 * @param num - Number to format
 * @returns Formatted string with separators
 *
 * @example
 * formatNumber(1234567) // "1,234,567" (in en-US)
 */
export function formatNumber(num: number): string {
  return num.toLocaleString()
}

/**
 * Format a decimal as percentage
 *
 * @param value - Decimal value (0.0 to 1.0)
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted percentage string
 *
 * @example
 * formatPercent(0.756) // "76%"
 * formatPercent(0.756, 1) // "75.6%"
 */
export function formatPercent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Format duration in milliseconds to human-readable string
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration string
 *
 * @example
 * formatDuration(500) // "500ms"
 * formatDuration(5000) // "5s"
 * formatDuration(90000) // "1m 30s"
 * formatDuration(7200000) // "2h 0m"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return '-' + formatDuration(-ms)
  if (ms < 1000) return `${Math.round(ms)}ms`

  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours < 24) return `${hours}h ${remainingMinutes}m`

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days}d ${remainingHours}h`
}

/**
 * Format a compact number (1K, 1M, 1B, etc.)
 *
 * @param num - Number to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Compact formatted string
 *
 * @example
 * formatCompactNumber(1500) // "1.5K"
 * formatCompactNumber(2500000) // "2.5M"
 */
export function formatCompactNumber(num: number, decimals = 1): string {
  if (num < 0) return '-' + formatCompactNumber(-num, decimals)
  if (num < 1000) return String(num)

  const units = ['', 'K', 'M', 'B', 'T']
  const i = Math.floor(Math.log10(num) / 3)
  const index = Math.min(i, units.length - 1)

  return parseFloat((num / Math.pow(1000, index)).toFixed(decimals)) + units[index]
}

/**
 * Format currency with locale-specific formatting
 *
 * @param amount - Monetary amount
 * @param currency - ISO 4217 currency code (default: "USD")
 * @param locale - Locale for formatting (default: undefined for user's locale)
 * @returns Formatted currency string
 *
 * @example
 * formatCurrency(1234.56) // "$1,234.56"
 * formatCurrency(1234.56, "EUR", "de-DE") // "1.234,56 €"
 */
export function formatCurrency(
  amount: number,
  currency = 'USD',
  locale?: string
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * Pad a number with leading zeros
 *
 * @param num - Number to pad
 * @param width - Minimum width of result
 * @returns Zero-padded string
 *
 * @example
 * padNumber(5, 3) // "005"
 * padNumber(42, 2) // "42"
 */
export function padNumber(num: number, width: number): string {
  return String(num).padStart(width, '0')
}

/**
 * Format a decimal to fixed precision, removing trailing zeros
 *
 * @param num - Number to format
 * @param maxDecimals - Maximum decimal places
 * @returns Formatted number string
 *
 * @example
 * formatDecimal(3.14159, 2) // "3.14"
 * formatDecimal(3.10000, 2) // "3.1"
 * formatDecimal(3.00000, 2) // "3"
 */
export function formatDecimal(num: number, maxDecimals: number): string {
  return parseFloat(num.toFixed(maxDecimals)).toString()
}
