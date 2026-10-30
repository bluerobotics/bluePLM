import { supabase } from '@/lib/supabase'

export interface OdooSettingsData {
  configured: boolean
  settings?: {
    url: string
    database: string
    username: string
    config_id?: string
    config_name?: string
  }
  /** Whether a key is on file. The key itself is never sent to the client. */
  has_api_key?: boolean
  is_connected: boolean
  last_sync_at: string | null
  last_sync_status: string | null
  last_sync_count: number | null
  is_auto_sync: boolean
}

export interface SavedConfig {
  id: string
  name: string
  description: string | null
  url: string
  database: string
  username: string
  color: string | null
  is_active: boolean
  last_tested_at: string | null
  is_last_test_successful: boolean | null
  created_at: string
}

// Preset colors for saved connections
export const CONFIG_COLORS = [
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Red', value: '#ef4444' },
]

export function getApiUrl(organization: { settings?: { api_url?: string } } | null): string | null {
  return organization?.settings?.api_url || null
}

export async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token || null
}

/**
 * The API keeps the stored key when `api_key` is absent, so an untouched field
 * must send nothing at all. An empty string would read as a deliberate change.
 */
export interface ConnectionIdentity {
  url: string
  database: string
  username: string
}

/**
 * Whether the form still describes the connection a stored key belongs to.
 *
 * The API refuses to send a saved key to a different url, database or
 * username, so the form has to stop treating it as available the moment one of
 * those is edited. A trailing slash is ignored to match how the API normalises
 * a URL, so a cosmetic difference does not demand a key needlessly.
 */
export function sameConnection(saved: ConnectionIdentity | null, current: ConnectionIdentity): boolean {
  if (!saved) return false
  const clean = (v: string) => v.trim().replace(/\/+$/, '')
  return (
    clean(saved.url) === clean(current.url) &&
    clean(saved.database) === clean(current.database) &&
    clean(saved.username) === clean(current.username)
  )
}

export function apiKeyPayload(apiKey: string): { api_key?: string } {
  const typed = apiKey.trim()
  return typed ? { api_key: typed } : {}
}
