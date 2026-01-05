// Re-export the SettingsTab type from the main types module
export type { SettingsTab } from '@/types/settings'

// Additional settings-specific types
export interface SettingsNavItem {
  id: string
  label: string
  icon?: React.ComponentType<{ size?: number; className?: string }>
  category: 'account' | 'organization' | 'integrations' | 'system'
  requiresAdmin?: boolean
  requiresFeature?: string
}

export interface SettingsSection {
  category: string
  items: { id: string; label: string }[]
}
