/**
 * Date and time utilities
 *
 * Pure utility functions for date formatting, parsing, and comparison.
 * No side effects, no API calls, no store access.
 */

/**
 * Format a date for display in a localized short format
 *
 * @param date - Date object, ISO string, null, or undefined
 * @returns Formatted date string (e.g., "Jan 3, 2026") or '-' if invalid
 *
 * @example
 * formatDate(new Date()) // "Jan 3, 2026"
 * formatDate("2026-01-03T12:00:00Z") // "Jan 3, 2026"
 * formatDate(null) // "-"
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a date with time in a localized format
 *
 * @param date - Date object, ISO string, null, or undefined
 * @returns Formatted date-time string (e.g., "Jan 3, 2026, 02:30 PM") or '-' if invalid
 *
 * @example
 * formatDateTime(new Date()) // "Jan 3, 2026, 02:30 PM"
 * formatDateTime("2026-01-03T14:30:00Z") // "Jan 3, 2026, 02:30 PM"
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 *
 * @param date - Date object, ISO string, null, or undefined
 * @returns Relative time string or formatted date if older than 7 days
 *
 * @example
 * formatRelativeTime(new Date(Date.now() - 5000)) // "just now"
 * formatRelativeTime(new Date(Date.now() - 120000)) // "2m ago"
 * formatRelativeTime(new Date(Date.now() - 7200000)) // "2h ago"
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDate(d)
}

/**
 * Check if two dates represent the same calendar day
 *
 * @param date1 - First date to compare
 * @param date2 - Second date to compare
 * @returns True if both dates are on the same day
 *
 * @example
 * isSameDay(new Date('2026-01-03T10:00'), new Date('2026-01-03T22:00')) // true
 * isSameDay(new Date('2026-01-03'), new Date('2026-01-04')) // false
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Get the start of a day (midnight) for a given date
 *
 * @param date - Input date
 * @returns New Date object set to midnight of the same day
 *
 * @example
 * startOfDay(new Date('2026-01-03T14:30:00')) // Date('2026-01-03T00:00:00')
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get the end of a day (23:59:59.999) for a given date
 *
 * @param date - Input date
 * @returns New Date object set to end of the same day
 *
 * @example
 * endOfDay(new Date('2026-01-03T14:30:00')) // Date('2026-01-03T23:59:59.999')
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * Format a date as ISO date string (YYYY-MM-DD)
 *
 * @param date - Date object or ISO string
 * @returns ISO date string in YYYY-MM-DD format
 *
 * @example
 * toISODateString(new Date('2026-01-03T14:30:00')) // "2026-01-03"
 */
export function toISODateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

/**
 * Check if a date is in the past
 *
 * @param date - Date to check
 * @returns True if the date is before the current time
 */
export function isPast(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.getTime() < Date.now()
}

/**
 * Check if a date is in the future
 *
 * @param date - Date to check
 * @returns True if the date is after the current time
 */
export function isFuture(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.getTime() > Date.now()
}
