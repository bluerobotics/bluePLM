/**
 * Input validation utilities
 *
 * Pure utility functions for validating user input and data.
 * No side effects, no API calls, no store access.
 */

/**
 * Check if a string is a valid email address
 *
 * @param email - Email string to validate
 * @returns True if valid email format
 *
 * @example
 * isValidEmail("user@example.com") // true
 * isValidEmail("invalid-email") // false
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false
  // RFC 5322 simplified pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Check if a string is empty, null, undefined, or whitespace only
 *
 * @param str - String to check
 * @returns True if string is blank
 *
 * @example
 * isBlank("") // true
 * isBlank("   ") // true
 * isBlank(null) // true
 * isBlank("hello") // false
 */
export function isBlank(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0
}

/**
 * Check if a string is NOT blank (has content)
 *
 * @param str - String to check
 * @returns True if string has non-whitespace content
 *
 * @example
 * isNotBlank("hello") // true
 * isNotBlank("  ") // false
 */
export function isNotBlank(str: string | null | undefined): str is string {
  return !isBlank(str)
}

/**
 * Check if a string is a valid URL
 *
 * @param url - URL string to validate
 * @returns True if valid URL format
 *
 * @example
 * isValidUrl("https://example.com") // true
 * isValidUrl("not-a-url") // false
 */
export function isValidUrl(url: string): boolean {
  if (!url) return false
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Sanitize a filename by removing invalid characters
 * Removes characters that are invalid on Windows: \ / : * ? " < > |
 *
 * @param name - File name to sanitize
 * @param replacement - Character to replace invalid chars with (default: '_')
 * @returns Sanitized file name
 *
 * @example
 * sanitizeFileName("my:file?.txt") // "my_file_.txt"
 * sanitizeFileName("path/to/file", "-") // "path-to-file"
 */
export function sanitizeFileName(name: string, replacement = '_'): string {
  if (!name) return name
  // Characters invalid on Windows: \ / : * ? " < > |
  return name.replace(/[\\/:*?"<>|]/g, replacement)
}

/**
 * Check if a path is safe (no directory traversal attacks)
 *
 * @param path - Path to validate
 * @returns True if path doesn't contain traversal patterns
 *
 * @example
 * isSafePath("docs/file.txt") // true
 * isSafePath("../../../etc/passwd") // false
 * isSafePath("folder/../file.txt") // false
 */
export function isSafePath(path: string): boolean {
  if (!path) return true
  const normalized = path.replace(/\\/g, '/')
  // Check for directory traversal
  if (normalized.includes('../') || normalized.includes('/..')) return false
  // Check for absolute path in Windows
  if (/^[a-zA-Z]:/.test(path)) return false
  // Check for root path
  if (path.startsWith('/')) return false
  return true
}

/**
 * Validate that a string matches a specific length range
 *
 * @param str - String to validate
 * @param minLength - Minimum length (inclusive)
 * @param maxLength - Maximum length (inclusive)
 * @returns True if string length is within range
 *
 * @example
 * isValidLength("hello", 1, 10) // true
 * isValidLength("hi", 3, 10) // false
 */
export function isValidLength(
  str: string | null | undefined,
  minLength: number,
  maxLength: number
): boolean {
  if (str === null || str === undefined) return minLength === 0
  return str.length >= minLength && str.length <= maxLength
}

/**
 * Check if a string contains only alphanumeric characters
 *
 * @param str - String to check
 * @returns True if string is alphanumeric only
 *
 * @example
 * isAlphanumeric("abc123") // true
 * isAlphanumeric("abc-123") // false
 */
export function isAlphanumeric(str: string): boolean {
  if (!str) return false
  return /^[a-zA-Z0-9]+$/.test(str)
}

/**
 * Check if a string is a valid identifier (starts with letter/underscore, alphanumeric)
 *
 * @param str - String to check
 * @returns True if valid identifier format
 *
 * @example
 * isValidIdentifier("myVariable") // true
 * isValidIdentifier("_private") // true
 * isValidIdentifier("123invalid") // false
 */
export function isValidIdentifier(str: string): boolean {
  if (!str) return false
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str)
}

/**
 * Check if a value is a valid number (not NaN, not Infinity)
 *
 * @param value - Value to check
 * @returns True if value is a finite number
 *
 * @example
 * isValidNumber(42) // true
 * isValidNumber(NaN) // false
 * isValidNumber(Infinity) // false
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Check if a string is a valid UUID v4
 *
 * @param str - String to check
 * @returns True if valid UUID v4 format
 *
 * @example
 * isValidUUID("123e4567-e89b-12d3-a456-426614174000") // true
 * isValidUUID("not-a-uuid") // false
 */
export function isValidUUID(str: string): boolean {
  if (!str) return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

/**
 * Validate file extension against an allowed list
 *
 * @param filename - File name or path
 * @param allowedExtensions - Array of allowed extensions (with or without dot)
 * @returns True if file extension is in allowed list
 *
 * @example
 * isAllowedExtension("file.pdf", [".pdf", ".doc"]) // true
 * isAllowedExtension("file.exe", ["pdf", "doc"]) // false
 */
export function isAllowedExtension(filename: string, allowedExtensions: string[]): boolean {
  if (!filename || !allowedExtensions.length) return false

  const ext = filename.toLowerCase().split('.').pop()
  if (!ext) return false

  return allowedExtensions.some((allowed) => {
    const normalizedAllowed = allowed.toLowerCase().replace(/^\./, '')
    return ext === normalizedAllowed
  })
}
