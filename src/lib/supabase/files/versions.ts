/**
 * File Version Operations
 * 
 * Functions for version rollback, history, and state transitions.
 */
import { getSupabaseClient } from '../client'
import { getCurrentUserEmail } from '../auth'
import { getNextRevision } from '../../../types/pdm'
import type { PDMFile } from '../../../types/pdm'

/**
 * Rollback file to a previous version (LOCAL ONLY)
 * Switches to a different version (rollback or roll forward)
 * Does NOT update the server - the server only updates on check-in
 * Returns the target version info so the caller can download the content
 */
export async function rollbackToVersion(
  fileId: string,
  userId: string,
  targetVersion: number,
  comment?: string
): Promise<{ success: boolean; targetVersionRecord?: any; maxVersion?: number; error?: string }> {
  const client = getSupabaseClient()
  
  // Get current file
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  // File must be checked out by user
  if (file.checked_out_by !== userId) {
    return { success: false, error: 'You must check out the file before switching versions' }
  }
  
  // Get target version
  const { data: targetVersionRecord, error: versionError } = await client
    .from('file_versions')
    .select('*')
    .eq('file_id', fileId)
    .eq('version', targetVersion)
    .single()
  
  if (versionError) {
    return { success: false, error: `Version ${targetVersion} not found` }
  }
  
  // Get max version for reference
  const { data: maxVersionData } = await client
    .from('file_versions')
    .select('version')
    .eq('file_id', fileId)
    .order('version', { ascending: false })
    .limit(1)
    .single()
  
  const maxVersion = maxVersionData?.version || file.version
  
  // Log activity (fire-and-forget)
  const isRollback = targetVersion < file.version
  getCurrentUserEmail().then(userEmail => {
    client.from('activity').insert({
      org_id: file.org_id,
      file_id: fileId,
      user_id: userId,
      user_email: userEmail,
      action: 'revision_change',
      details: { 
        version_action: isRollback ? 'rollback' : 'roll_forward',
        from_version: file.version, 
        to_version: targetVersion,
        comment: comment || null
      }
    })
  })
  
  return { success: true, targetVersionRecord, maxVersion }
}

/**
 * Transition file to a new workflow state
 */
export async function transitionFileState(
  fileId: string,
  userId: string,
  targetStateId: string,
  options: {
    incrementRevision?: boolean
    comment?: string
  } = {}
): Promise<{ success: boolean; file?: PDMFile; error?: string }> {
  const client = getSupabaseClient()
  
  // Get current file
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('*, workflow_state:workflow_states(*)')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  // Get the target state
  const { data: targetState, error: targetError } = await client
    .from('workflow_states')
    .select('*')
    .eq('id', targetStateId)
    .single()
  
  if (targetError || !targetState) {
    return { success: false, error: 'Target state not found' }
  }
  
  // Calculate new revision if auto-increment is enabled on target state
  const shouldIncrementRevision = options.incrementRevision || targetState.auto_increment_revision
  const newRevision = shouldIncrementRevision 
    ? getNextRevision(file.revision, 'letter')
    : file.revision
  
  const { data: updated, error: updateError } = await client
    .from('files')
    .update({
      workflow_state_id: targetStateId,
      state_changed_at: new Date().toISOString(),
      state_changed_by: userId,
      revision: newRevision,
      updated_at: new Date().toISOString(),
      updated_by: userId
    })
    .eq('id', fileId)
    .select('*, workflow_state:workflow_states(*)')
    .single()
  
  if (updateError) {
    return { success: false, error: updateError.message }
  }
  
  // Map workflow_state to expected PDMFile structure
  const mappedFile: PDMFile = {
    ...updated,
    workflow_state: updated.workflow_state ? {
      id: updated.workflow_state.id,
      name: updated.workflow_state.name,
      label: updated.workflow_state.label ?? null,
      color: updated.workflow_state.color ?? '#888888',
      icon: updated.workflow_state.icon ?? 'file',
      is_editable: updated.workflow_state.is_editable ?? true,
      requires_checkout: updated.workflow_state.requires_checkout ?? false
    } : null
  }
  
  return { success: true, file: mappedFile }
}
