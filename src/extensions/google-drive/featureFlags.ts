/**
 * Google Drive Extension Feature Flags
 * 
 * This file controls the gradual rollout of the new extension-based
 * Google Drive integration vs. the legacy built-in integration.
 * 
 * To enable the new extension system:
 * 1. Set USE_EXTENSION_GOOGLE_DRIVE to true
 * 2. The app will use the new extension instead of the legacy integration
 * 
 * The flag can be controlled by:
 * - Environment variable: VITE_USE_EXTENSION_GOOGLE_DRIVE=true
 * - Or by changing the default value below
 * 
 * @module extensions/google-drive/featureFlags
 */

/**
 * Feature flag for new Google Drive extension.
 * 
 * When true: Use the new extension system (this extension)
 * When false: Use the legacy built-in Google Drive integration
 * 
 * @default false - Defaults to legacy for safety during rollout
 */
export const USE_EXTENSION_GOOGLE_DRIVE = 
  import.meta.env.VITE_USE_EXTENSION_GOOGLE_DRIVE === 'true' || false

/**
 * Feature flag to show migration notice to users.
 * 
 * When true: Shows a notice in the legacy integration about the upcoming migration
 */
export const SHOW_MIGRATION_NOTICE =
  import.meta.env.VITE_SHOW_GDRIVE_MIGRATION_NOTICE === 'true' || false

/**
 * Check if the extension system should be used for Google Drive.
 * 
 * This function can be extended to include additional logic such as:
 * - User/org-level rollout
 * - A/B testing groups
 * - Gradual percentage rollout
 * 
 * @returns true if the extension should be used
 */
export function shouldUseExtensionGoogleDrive(): boolean {
  // In the future, this could check:
  // - Organization settings (org opted-in to beta)
  // - User preferences (user opted-in)
  // - Random percentage for gradual rollout
  // - Feature flag from remote config
  
  return USE_EXTENSION_GOOGLE_DRIVE
}

/**
 * Extension ID for the Google Drive extension.
 * Used for referencing the extension in the registry.
 */
export const GOOGLE_DRIVE_EXTENSION_ID = 'blueplm.google-drive'
