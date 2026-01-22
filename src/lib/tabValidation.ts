/**
 * Tab number validation utilities
 * 
 * Provides input validation and sanitization for tab number fields
 * to ensure only valid digits are accepted and prevent corruption
 * of SOLIDWORKS properties.
 */

/**
 * Validate and sanitize tab number input
 * 
 * Filters input to digits only and limits to the configured max digits.
 * Used in onChange handlers to prevent invalid characters from being entered.
 * 
 * @param value - Raw input value from user
 * @param maxDigits - Maximum number of digits allowed (from tab_padding_digits setting)
 * @returns Sanitized value containing only digits, limited to maxDigits length
 * 
 * @example
 * validateTabInput('1-23', 3) // returns '123'
 * validateTabInput('-001', 3) // returns '001'
 * validateTabInput('12345', 3) // returns '123'
 * validateTabInput('abc', 3) // returns ''
 */
export function validateTabInput(value: string, maxDigits: number = 3): string {
  // Remove any non-digit characters
  const digitsOnly = value.replace(/[^0-9]/g, '')
  // Limit to max digits
  return digitsOnly.slice(0, maxDigits)
}

/**
 * Sanitize tab number for writing to SOLIDWORKS properties
 * 
 * Secondary protection layer that strips any non-digit characters
 * before the value is written to file properties. This prevents
 * accidental corruption even if validation was bypassed.
 * 
 * @param value - Tab number value to sanitize
 * @returns Sanitized value with only digits, or empty string if invalid
 * 
 * @example
 * sanitizeTabNumber('001') // returns '001'
 * sanitizeTabNumber('-001') // returns '001'
 * sanitizeTabNumber('1-2-3') // returns '123'
 * sanitizeTabNumber('') // returns ''
 * sanitizeTabNumber(null) // returns ''
 */
export function sanitizeTabNumber(value: string | null | undefined): string {
  if (!value) return ''
  // Strip everything except digits
  return value.replace(/[^0-9]/g, '')
}

/**
 * Generate a placeholder string for tab input
 * 
 * @param _paddingDigits - Number of digits in tab number (unused, kept for API compatibility)
 * @returns Placeholder string "tab"
 */
export function getTabPlaceholder(_paddingDigits: number = 3): string {
  return 'tab'
}
