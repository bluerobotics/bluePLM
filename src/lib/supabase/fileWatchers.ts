import { getSupabaseClient } from './client'

/**
 * Get the user who has a file checked out (with their info)
 */
export async function getCheckedOutByUser(
  fileId: string
): Promise<{ user: { id: string; email: string; full_name: string | null; avatar_url: string | null } | null; error?: string }> {
  const client = getSupabaseClient()
  
  const { data: file, error: fileError } = await client
    .from('files')
    .select('checked_out_by')
    .eq('id', fileId)
    .single()
  
  if (fileError) {
    return { user: null, error: fileError.message }
  }
  
  if (!file?.checked_out_by) {
    return { user: null }
  }
  
  const { data: user, error: userError } = await client
    .from('users')
    .select('id, email, full_name, avatar_url')
    .eq('id', file.checked_out_by)
    .single()
  
  if (userError) {
    return { user: null, error: userError.message }
  }
  
  return { user }
}

/**
 * Watch a file to get notified of changes
 */
export async function watchFile(
  orgId: string,
  fileId: string,
  userId: string,
  options?: {
    notifyOnCheckin?: boolean
    notifyOnCheckout?: boolean
    notifyOnStateChange?: boolean
    notifyOnReview?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient()
  
  const { error } = await client
    .from('file_watchers')
    .upsert({
      org_id: orgId,
      file_id: fileId,
      user_id: userId,
      notify_on_checkin: options?.notifyOnCheckin ?? true,
      notify_on_checkout: options?.notifyOnCheckout ?? false,
      notify_on_state_change: options?.notifyOnStateChange ?? true,
      notify_on_review: options?.notifyOnReview ?? true
    }, {
      onConflict: 'file_id,user_id'
    })
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Stop watching a file
 */
export async function unwatchFile(
  fileId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient()
  
  const { error } = await client
    .from('file_watchers')
    .delete()
    .eq('file_id', fileId)
    .eq('user_id', userId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Check if user is watching a file
 */
export async function isWatchingFile(
  fileId: string,
  userId: string
): Promise<{ watching: boolean; error?: string }> {
  const client = getSupabaseClient()
  
  const { data, error } = await client
    .from('file_watchers')
    .select('id')
    .eq('file_id', fileId)
    .eq('user_id', userId)
    .maybeSingle()
  
  if (error) {
    return { watching: false, error: error.message }
  }
  
  return { watching: !!data }
}

/**
 * Get all files a user is watching
 */
export async function getWatchedFiles(
  userId: string
): Promise<{ files: any[]; error?: string }> {
  const client = getSupabaseClient()
  
  const { data, error } = await client
    .from('file_watchers')
    .select(`
      *,
      file:files(id, file_name, file_path, state, version)
    `)
    .eq('user_id', userId)
  
  if (error) {
    return { files: [], error: error.message }
  }
  
  return { files: data || [] }
}
