// Settings-related type definitions

/** Canonical runtime list used by navigation events and SettingsTab. */
export const SETTINGS_TABS = [
  'profile',
  'preferences',
  'keybindings',
  'modules',
  'vaults',
  'team-members',
  'module-access',
  'company-profile',
  'auth-providers',
  'serialization',
  'export',
  'rfq',
  'metadata-columns',
  'file-workflows',
  'item-designations',
  'backup',
  'solidworks',
  'google-drive',
  'odoo',
  'webhooks',
  'api',
  'supabase',
  'recovery-codes',
  'security-monitoring',
  'performance',
  'logs',
  'dev-tools',
  'about',
  'delete-account',
  'extensions',
] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]

// Keybinding action identifiers
export type KeybindingAction =
  | 'navigateUp'
  | 'navigateDown'
  | 'expandFolder'
  | 'collapseFolder'
  | 'selectAll'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'delete'
  | 'escape'
  | 'openFile'
  | 'toggleDetailsPanel'
  | 'refresh'

// Keybinding configuration
export interface Keybinding {
  key: string // e.g., 'ArrowUp', 'a', 'Delete'
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
}

export type KeybindingsConfig = Record<KeybindingAction, Keybinding>

// ============================================
// SOLIDWORKS Template Settings
// ============================================

/**
 * Organization-level SOLIDWORKS template folder configuration.
 * Paths are relative to the vault root.
 */
export interface SolidWorksTemplateSettings {
  /** Relative path in vault for document templates, e.g., "_templates/Documents" */
  documentTemplates?: string
  /** Relative path in vault for sheet formats, e.g., "_templates/SheetFormats" */
  sheetFormats?: string
  /** Relative path in vault for BOM templates, e.g., "_templates/BOM" */
  bomTemplates?: string
  /** Relative path in vault for custom property files, e.g., "_templates/CustomProperties" */
  customPropertyFolders?: string
  /** Whether SOLIDWORKS should prompt user to select a template when creating new documents */
  promptForTemplate?: boolean
  /** ISO timestamp of last push to all users */
  lastPushedAt?: string
  /** User ID who performed the last push */
  lastPushedBy?: string
}

/**
 * User-local SOLIDWORKS template overrides (stored in localStorage).
 */
export interface SolidWorksLocalTemplateSettings {
  /** Whether user has personal overrides enabled */
  usePersonalOverrides: boolean
  /** User's personal template paths (absolute paths) */
  documentTemplates?: string
  sheetFormats?: string
  bomTemplates?: string
  /** When settings were last synced from org */
  lastSyncedAt?: string
}
