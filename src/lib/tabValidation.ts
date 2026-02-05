/**
 * Tab number validation utilities
 * 
 * Provides input validation and sanitization for tab number fields
 * with configurable character settings (letters, numbers, special characters).
 */

/**
 * Options for tab number validation
 */
export interface TabValidationOptions {
  /** Maximum length of tab number */
  maxLength: number
  /** Allow letters (A-Z, case-insensitive) */
  allowLetters: boolean
  /** Allow numbers (0-9) */
  allowNumbers: boolean
  /** Allow special characters */
  allowSpecial: boolean
  /** Which special characters are allowed (e.g., "-_") */
  specialChars: string
}

/**
 * Default validation options (backwards compatible - numbers only)
 */
export const DEFAULT_TAB_VALIDATION_OPTIONS: TabValidationOptions = {
  maxLength: 3,
  allowLetters: false,
  allowNumbers: true,
  allowSpecial: false,
  specialChars: '-_'
}

/**
 * Build a regex pattern for allowed characters based on options
 */
function buildAllowedPattern(options: TabValidationOptions): RegExp {
  let pattern = ''
  
  if (options.allowNumbers) {
    pattern += '0-9'
  }
  
  if (options.allowLetters) {
    pattern += 'A-Za-z'
  }
  
  if (options.allowSpecial && options.specialChars) {
    // Escape special regex characters in the special chars string
    const escapedChars = options.specialChars.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
    pattern += escapedChars
  }
  
  // If no characters allowed, return pattern that matches nothing
  if (!pattern) {
    return /(?!)/  // Matches nothing
  }
  
  return new RegExp(`[^${pattern}]`, 'g')
}

/**
 * Validate and sanitize tab number input
 * 
 * Filters input based on allowed character settings and limits to max length.
 * Used in onChange handlers to prevent invalid characters from being entered.
 * 
 * @param value - Raw input value from user
 * @param options - Validation options (or maxLength for backwards compatibility)
 * @returns Sanitized value containing only allowed characters, limited to maxLength
 * 
 * @example
 * // With options object
 * validateTabInput('abc123', { maxLength: 6, allowLetters: true, allowNumbers: true, allowSpecial: false, specialChars: '' })
 * // returns 'abc123'
 * 
 * // With just maxLength (backwards compatible, numbers only)
 * validateTabInput('abc123', 3) // returns '123'
 * 
 * @example
 * validateTabInput('A-01', { maxLength: 4, allowLetters: true, allowNumbers: true, allowSpecial: true, specialChars: '-' })
 * // returns 'A-01'
 */
export function validateTabInput(value: string, options: TabValidationOptions | number = DEFAULT_TAB_VALIDATION_OPTIONS): string {
  // Handle backwards compatibility: if options is a number, treat it as maxLength with defaults
  const opts: TabValidationOptions = typeof options === 'number'
    ? { ...DEFAULT_TAB_VALIDATION_OPTIONS, maxLength: options }
    : options
  
  // Build regex to match disallowed characters
  const disallowedPattern = buildAllowedPattern(opts)
  
  // Remove disallowed characters
  let sanitized = value.replace(disallowedPattern, '')
  
  // Convert to uppercase if only letters are allowed (for consistency)
  if (opts.allowLetters && !opts.allowNumbers && !opts.allowSpecial) {
    sanitized = sanitized.toUpperCase()
  }
  
  // Limit to max length
  return sanitized.slice(0, opts.maxLength)
}

/**
 * Sanitize tab number for writing to SOLIDWORKS properties
 * 
 * Secondary protection layer that filters characters based on settings
 * before the value is written to file properties. This prevents
 * accidental corruption even if validation was bypassed.
 * 
 * @param value - Tab number value to sanitize
 * @param options - Validation options (optional, defaults to numbers only for backwards compatibility)
 * @returns Sanitized value with only allowed characters, or empty string if invalid
 * 
 * @example
 * sanitizeTabNumber('001') // returns '001'
 * sanitizeTabNumber('A-01', { maxLength: 4, allowLetters: true, allowNumbers: true, allowSpecial: true, specialChars: '-' })
 * // returns 'A-01'
 * sanitizeTabNumber(null) // returns ''
 */
export function sanitizeTabNumber(value: string | null | undefined, options?: TabValidationOptions): string {
  if (!value) return ''
  
  const opts = options ?? DEFAULT_TAB_VALIDATION_OPTIONS
  
  // Build regex to match disallowed characters
  const disallowedPattern = buildAllowedPattern(opts)
  
  // Remove disallowed characters (no length limit for sanitization)
  return value.replace(disallowedPattern, '')
}

/**
 * Generate a placeholder string for tab input
 * 
 * @param options - Validation options (or paddingDigits for backwards compatibility)
 * @returns Placeholder string based on allowed characters
 */
export function getTabPlaceholder(options: TabValidationOptions | number = DEFAULT_TAB_VALIDATION_OPTIONS): string {
  // Handle backwards compatibility
  const opts: TabValidationOptions = typeof options === 'number'
    ? { ...DEFAULT_TAB_VALIDATION_OPTIONS, maxLength: options }
    : options
  
  // Generate a helpful placeholder based on what's allowed
  const parts: string[] = []
  
  if (opts.allowNumbers) parts.push('0-9')
  if (opts.allowLetters) parts.push('A-Z')
  if (opts.allowSpecial && opts.specialChars) parts.push(opts.specialChars)
  
  if (parts.length === 0) return 'tab'
  if (parts.length === 1 && opts.allowNumbers && !opts.allowLetters && !opts.allowSpecial) {
    // Numbers only - show example like "001"
    return 'tab'
  }
  
  return 'tab'
}

/**
 * Create TabValidationOptions from serialization settings
 * 
 * Helper function to extract tab validation options from the organization's
 * serialization settings object.
 * 
 * @param settings - Partial serialization settings (from org or defaults)
 * @returns TabValidationOptions for use with validateTabInput/sanitizeTabNumber
 */
export function getTabValidationOptions(settings: {
  tab_padding_digits?: number
  tab_allow_letters?: boolean
  tab_allow_numbers?: boolean
  tab_allow_special?: boolean
  tab_special_chars?: string
} | null | undefined): TabValidationOptions {
  return {
    maxLength: settings?.tab_padding_digits ?? DEFAULT_TAB_VALIDATION_OPTIONS.maxLength,
    allowLetters: settings?.tab_allow_letters ?? DEFAULT_TAB_VALIDATION_OPTIONS.allowLetters,
    allowNumbers: settings?.tab_allow_numbers ?? DEFAULT_TAB_VALIDATION_OPTIONS.allowNumbers,
    allowSpecial: settings?.tab_allow_special ?? DEFAULT_TAB_VALIDATION_OPTIONS.allowSpecial,
    specialChars: settings?.tab_special_chars ?? DEFAULT_TAB_VALIDATION_OPTIONS.specialChars
  }
}
