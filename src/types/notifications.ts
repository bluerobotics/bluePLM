/**
 * Notification Preferences Types
 * 
 * Types for configuring in-app toast notifications, sounds, and quiet hours.
 */

// ============================================================================
// Notification Categories
// ============================================================================

/**
 * Categories of notifications that can be individually enabled/disabled.
 * Each category groups related events that users may want to control together.
 */
export type NotificationCategory = 
  | 'fileOperations'   // checkout, checkin, version change, file added
  | 'workflow'         // state changes, approval requests
  | 'reviews'          // review requests, approvals, rejections
  | 'changeControl'    // ECO/ECR submissions, approvals
  | 'purchasing'       // PO approvals, RFQ responses
  | 'quality'          // NCR, CAPA alerts, calibration due
  | 'system'           // permission changes, org settings, vault changes
  | 'collaboration'    // mentions, checkout requests, comments

/**
 * All notification categories as an array for iteration.
 */
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'fileOperations',
  'workflow',
  'reviews',
  'changeControl',
  'purchasing',
  'quality',
  'system',
  'collaboration',
]

/**
 * Human-readable labels for each notification category.
 */
export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  fileOperations: 'File Operations',
  workflow: 'Workflow',
  reviews: 'Reviews',
  changeControl: 'Change Control',
  purchasing: 'Purchasing',
  quality: 'Quality',
  system: 'System',
  collaboration: 'Collaboration',
}

/**
 * Descriptions for each notification category explaining what events it covers.
 */
export const NOTIFICATION_CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
  fileOperations: 'Checkout, check-in, version changes, and file additions',
  workflow: 'State changes and approval requests',
  reviews: 'Review requests, approvals, and rejections',
  changeControl: 'ECO/ECR submissions and approvals',
  purchasing: 'Purchase order approvals and RFQ responses',
  quality: 'NCR, CAPA alerts, and calibration reminders',
  system: 'Permission changes, org settings, and vault changes',
  collaboration: 'Mentions, checkout requests, and comments',
}

/**
 * Lucide icon names for each notification category.
 */
export const NOTIFICATION_CATEGORY_ICONS: Record<NotificationCategory, string> = {
  fileOperations: 'FileCheck',
  workflow: 'GitBranch',
  reviews: 'CheckSquare',
  changeControl: 'FileEdit',
  purchasing: 'ShoppingCart',
  quality: 'Shield',
  system: 'Settings',
  collaboration: 'Users',
}

// ============================================================================
// Category Preferences
// ============================================================================

/**
 * Per-category notification preference settings.
 */
export interface CategoryPreference {
  /** Whether toast notifications are enabled for this category */
  toastEnabled: boolean
  /** Whether sound is enabled for this category (when global sound is on) */
  soundEnabled: boolean
}

/**
 * Map of category preferences keyed by category.
 */
export type CategoryPreferences = Record<NotificationCategory, CategoryPreference>

// ============================================================================
// Quiet Hours Configuration
// ============================================================================

/**
 * Quiet hours configuration for suppressing notifications during specific times.
 */
export interface QuietHoursConfig {
  /** Whether quiet hours are enabled */
  enabled: boolean
  /** Start time in 24-hour format (e.g., "22:00") */
  startTime: string
  /** End time in 24-hour format (e.g., "07:00") */
  endTime: string
}

// ============================================================================
// Sound Settings
// ============================================================================

/**
 * Global sound settings for notifications.
 */
export interface SoundSettings {
  /** Master toggle for notification sounds */
  enabled: boolean
  /** Volume level (0-100) */
  volume: number
}

// ============================================================================
// Complete Preferences Interface
// ============================================================================

/**
 * Complete notification preferences configuration.
 */
export interface NotificationPreferences {
  /** Per-category notification settings */
  categories: CategoryPreferences
  /** Quiet hours configuration */
  quietHours: QuietHoursConfig
  /** Sound settings */
  sound: SoundSettings
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default category preference (all enabled).
 */
export const DEFAULT_CATEGORY_PREFERENCE: CategoryPreference = {
  toastEnabled: true,
  soundEnabled: true,
}

/**
 * Default preferences for all categories.
 */
export function getDefaultCategoryPreferences(): CategoryPreferences {
  return NOTIFICATION_CATEGORIES.reduce((acc, category) => {
    acc[category] = { ...DEFAULT_CATEGORY_PREFERENCE }
    return acc
  }, {} as CategoryPreferences)
}

/**
 * Default quiet hours configuration.
 */
export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  enabled: false,
  startTime: '22:00',
  endTime: '07:00',
}

/**
 * Default sound settings.
 */
export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 50,
}

/**
 * Default notification preferences.
 */
export function getDefaultNotificationPreferences(): NotificationPreferences {
  return {
    categories: getDefaultCategoryPreferences(),
    quietHours: { ...DEFAULT_QUIET_HOURS },
    sound: { ...DEFAULT_SOUND_SETTINGS },
  }
}
