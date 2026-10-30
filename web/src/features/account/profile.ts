// The signed-in user's own profile. users."Users can update their own profile" lets a user write
// their own row as long as role and org_id stay the same, so only full_name is sent.
import { getSupabaseClient } from '@/lib/supabase/client'

export const DISPLAY_NAME_MAX = 100

export type DisplayNameProblem = 'empty' | 'tooLong' | null

/** Collapse runs of whitespace and trim. */
export function normalizeDisplayName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function checkDisplayName(value: string): DisplayNameProblem {
  const name = normalizeDisplayName(value)
  if (!name) return 'empty'
  if (name.length > DISPLAY_NAME_MAX) return 'tooLong'
  return null
}

export async function updateDisplayName(userId: string, value: string): Promise<{ error: string | null }> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .update({ full_name: normalizeDisplayName(value) })
    .eq('id', userId)
    .select('id')
  if (error) return { error: error.message }
  // RLS turns a refused update into zero rows, not an error.
  if (!data || data.length === 0) return { error: 'refused' }
  return { error: null }
}

/** End this browser's session only, or every session of this account everywhere. */
export async function signOutEverywhere(): Promise<{ error: string | null }> {
  const { error } = await getSupabaseClient().auth.signOut({ scope: 'global' })
  return { error: error?.message ?? null }
}
