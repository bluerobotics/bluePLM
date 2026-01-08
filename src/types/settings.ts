// Settings-related type definitions

export type SettingsTab = 
  | 'profile' 
  | 'preferences' 
  | 'keybindings'
  | 'modules'           // Displays as "Sidebar" in UI
  | 'vaults'
  | 'team-members'
  | 'company-profile' 
  | 'auth-providers'
  | 'serialization'
  | 'export'
  | 'rfq' 
  | 'metadata-columns' 
  | 'backup' 
  | 'solidworks' 
  | 'google-drive' 
  | 'odoo' 
  | 'slack'             // Hidden from nav, coming soon
  | 'woocommerce'       // Hidden from nav, coming soon
  | 'webhooks' 
  | 'api' 
  | 'supabase' 
  | 'recovery-codes'
  | 'performance'
  | 'logs' 
  | 'dev-tools'
  | 'about'
  | 'delete-account'
  | 'extension-store'

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
  key: string        // e.g., 'ArrowUp', 'a', 'Delete'
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
}

export type KeybindingsConfig = Record<KeybindingAction, Keybinding>

