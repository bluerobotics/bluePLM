// Settings feature constants

export const SETTINGS_CATEGORIES = [
  { id: 'account', label: 'Account' },
  { id: 'organization', label: 'Organization' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'system', label: 'System' },
] as const

export type SettingsCategory = typeof SETTINGS_CATEGORIES[number]['id']
