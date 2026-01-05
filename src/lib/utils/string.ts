/**
 * String manipulation utilities
 *
 * Pure utility functions for string operations.
 * No side effects, no API calls, no store access.
 */

/**
 * Truncate a string to a maximum length with ellipsis
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length including ellipsis
 * @returns Truncated string with '...' if exceeds maxLength
 *
 * @example
 * truncate("Hello World", 8) // "Hello..."
 * truncate("Hi", 10) // "Hi"
 */
export function truncate(str: string, maxLength: number): string {
  if (!str || str.length <= maxLength) return str
  if (maxLength <= 3) return '...'
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Capitalize the first letter of a string
 *
 * @param str - String to capitalize
 * @returns String with first letter uppercase
 *
 * @example
 * capitalize("hello") // "Hello"
 * capitalize("WORLD") // "WORLD"
 */
export function capitalize(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Convert a string to title case (capitalize each word)
 *
 * @param str - String to convert
 * @returns Title-cased string
 *
 * @example
 * toTitleCase("hello world") // "Hello World"
 * toTitleCase("THE QUICK FOX") // "The Quick Fox"
 */
export function toTitleCase(str: string): string {
  if (!str) return str
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => capitalize(word))
    .join(' ')
}

/**
 * Convert a string to a URL/ID-friendly slug
 *
 * @param str - String to slugify
 * @returns Lowercase string with special chars replaced by hyphens
 *
 * @example
 * slugify("Hello World!") // "hello-world"
 * slugify("Product #123") // "product-123"
 */
export function slugify(str: string): string {
  if (!str) return str
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Escape HTML special characters to prevent XSS
 *
 * @param str - String to escape
 * @returns String with HTML entities escaped
 *
 * @example
 * escapeHtml("<script>alert('xss')</script>") // "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
 */
export function escapeHtml(str: string): string {
  if (!str) return str
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char])
}

/**
 * Generate a random alphanumeric ID
 *
 * @param prefix - Optional prefix for the ID
 * @param length - Length of random part (default: 7)
 * @returns Random ID string
 *
 * @example
 * generateId() // "k8m2x9p"
 * generateId("user") // "user-k8m2x9p"
 */
export function generateId(prefix = '', length = 7): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let random = ''
  for (let i = 0; i < length; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return prefix ? `${prefix}-${random}` : random
}

/**
 * Convert camelCase to kebab-case
 *
 * @param str - camelCase string
 * @returns kebab-case string
 *
 * @example
 * camelToKebab("backgroundColor") // "background-color"
 * camelToKebab("XMLHttpRequest") // "xml-http-request"
 */
export function camelToKebab(str: string): string {
  if (!str) return str
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Convert kebab-case to camelCase
 *
 * @param str - kebab-case string
 * @returns camelCase string
 *
 * @example
 * kebabToCamel("background-color") // "backgroundColor"
 */
export function kebabToCamel(str: string): string {
  if (!str) return str
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Pluralize a word based on count
 *
 * @param word - Singular word
 * @param count - Number to check
 * @param plural - Optional custom plural form (defaults to word + 's')
 * @returns Pluralized string with count
 *
 * @example
 * pluralize("file", 1) // "1 file"
 * pluralize("file", 5) // "5 files"
 * pluralize("person", 3, "people") // "3 people"
 */
export function pluralize(word: string, count: number, plural?: string): string {
  const pluralWord = count === 1 ? word : (plural || `${word}s`)
  return `${count} ${pluralWord}`
}

/**
 * Remove leading/trailing whitespace and collapse internal whitespace
 *
 * @param str - String to normalize
 * @returns Normalized string
 *
 * @example
 * normalizeWhitespace("  hello   world  ") // "hello world"
 */
export function normalizeWhitespace(str: string): string {
  if (!str) return str
  return str.trim().replace(/\s+/g, ' ')
}

/**
 * Get selection count label for context menus
 *
 * @param fileCount - Number of files selected
 * @param folderCount - Number of folders selected
 * @returns Formatted count label or empty string
 *
 * @example
 * getCountLabel(3, 2) // "(3 files, 2 folders)"
 * getCountLabel(1, 0) // "(1 file)"
 * getCountLabel(0, 0) // ""
 */
export function getCountLabel(fileCount: number, folderCount: number): string {
  if (fileCount === 0 && folderCount === 0) return ''
  const parts: string[] = []
  if (fileCount > 0) {
    parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`)
  }
  if (folderCount > 0) {
    parts.push(`${folderCount} folder${folderCount > 1 ? 's' : ''}`)
  }
  return `(${parts.join(', ')})`
}

/**
 * Get plural suffix based on count
 *
 * @param count - Number to check
 * @param singular - Suffix for singular (default: '')
 * @param pluralSuffix - Suffix for plural (default: 's')
 * @returns Appropriate suffix
 *
 * @example
 * plural(1) // ''
 * plural(2) // 's'
 * plural(1, '', 'es') // ''
 * plural(2, '', 'es') // 'es'
 */
export function plural(count: number, singular = '', pluralSuffix = 's'): string {
  return count === 1 ? singular : pluralSuffix
}