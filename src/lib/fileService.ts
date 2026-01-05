/**
 * BluePLM File Service
 * 
 * High-level file operations combining Supabase database + storage.
 * Handles versioning, check-in/check-out, conflict detection.
 */
import { supabase } from './supabase'
import { uploadFile, downloadFile } from './storage'
import { getNextRevision } from '../types/pdm'
import { getFileType } from './utils'
import type { PDMFile, FileVersion } from '../types/pdm'

/**
 * Check out a file for editing
 * Creates an exclusive lock so no one else can edit
 */
export async function checkoutFile(
  fileId: string,
  userId: string,
  message?: string
): Promise<{ success: boolean; file?: PDMFile; error?: string }> {
  // First, check current lock status
  const { data: fileData, error: fetchError } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  const file = fileData as any
  
  // Check if already checked out by someone else
  if (file.checked_out_by && file.checked_out_by !== userId) {
    const { data: lockUser } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', file.checked_out_by)
      .single()
    
    const user = lockUser as any
    return { 
      success: false, 
      error: `File is checked out by ${user?.full_name || user?.email || 'another user'} since ${new Date(file.checked_out_at).toLocaleString()}`
    }
  }
  
  // Get machine ID and name for tracking
  const { getMachineId, getMachineName } = await import('./backup')
  const machineId = await getMachineId()
  const machineName = await getMachineName()
  
  // Acquire the lock
  const { data: updated, error: updateError } = await supabase
    .from('files')
    .update({
      checked_out_by: userId,
      checked_out_at: new Date().toISOString(),
      lock_message: message || null,
      checked_out_by_machine_id: machineId,
      checked_out_by_machine_name: machineName
    } as any)
    .eq('id', fileId)
    .eq('checked_out_by', file.checked_out_by) // Optimistic lock
    .select()
    .single()
  
  if (updateError) {
    return { success: false, error: updateError.message }
  }
  
  if (!updated) {
    return { success: false, error: 'File was checked out by someone else. Please refresh.' }
  }
  
  return { success: true, file: updated as any }
}

/**
 * Check in a file after editing
 * Uploads new version and releases lock
 */
export async function checkinFile(
  fileId: string,
  userId: string,
  fileData: File | Blob | ArrayBuffer,
  options: {
    comment?: string
    incrementRevision?: boolean
  } = {}
): Promise<{ success: boolean; file?: PDMFile; version?: FileVersion; error?: string; machineMismatchWarning?: string | null }> {
  // Get current file info
  const { data: file, error: fetchError } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  // Verify user has the lock
  if (file.checked_out_by !== userId) {
    return { success: false, error: 'You do not have this file checked out' }
  }
  
  // Check if checking in from a different machine
  const { getMachineId } = await import('./backup')
  const currentMachineId = await getMachineId()
  const checkoutMachineId = file.checked_out_by_machine_id
  
  // Warn if checking in from a different machine (but allow it)
  let machineMismatchWarning: string | null = null
  if (checkoutMachineId && checkoutMachineId !== currentMachineId) {
    const checkoutMachineName = file.checked_out_by_machine_name || 'another computer'
    machineMismatchWarning = `Warning: This file was checked out on ${checkoutMachineName}. You are checking it in from a different computer.`
  }
  
  // Upload file content
  const { hash, size, error: uploadError } = await uploadFile(file.org_id, fileData)
  
  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError}` }
  }
  
  // Calculate new version/revision
  const newVersion = file.version + 1
  const newRevision = options.incrementRevision 
    ? getNextRevision(file.revision, 'letter')
    : file.revision
  
  // Create version record
  const { data: versionRecord, error: versionError } = await supabase
    .from('file_versions')
    .insert({
      file_id: fileId,
      version: newVersion,
      revision: newRevision,
      content_hash: hash,
      file_size: size,
      comment: options.comment || null,
      workflow_state_id: file.workflow_state_id,
      created_by: userId
    })
    .select()
    .single()
  
  if (versionError) {
    return { success: false, error: versionError.message }
  }
  
  // Update file record
  const { data: updated, error: updateError } = await supabase
    .from('files')
    .update({
      version: newVersion,
      revision: newRevision,
      content_hash: hash,
      file_size: size,
      checked_out_by: null,
      checked_out_at: null,
      lock_message: null,
      checked_out_by_machine_id: null,
      checked_out_by_machine_name: null,
      updated_at: new Date().toISOString(),
      updated_by: userId
    })
    .eq('id', fileId)
    .select()
    .single()
  
  if (updateError) {
    return { success: false, error: updateError.message }
  }
  
  return { success: true, file: updated, version: versionRecord, machineMismatchWarning }
}

/**
 * Undo checkout (discard changes, release lock)
 */
export async function undoCheckout(
  fileId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('files')
    .update({
      checked_out_by: null,
      checked_out_at: null,
      lock_message: null,
      checked_out_by_machine_id: null,
      checked_out_by_machine_name: null
    })
    .eq('id', fileId)
    .eq('checked_out_by', userId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Force unlock a file (admin only)
 */
export async function forceUnlock(
  fileId: string,
  adminUserId: string
): Promise<{ success: boolean; error?: string }> {
  // Verify user is admin
  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('id', adminUserId)
    .single()
  
  if (user?.role !== 'admin') {
    return { success: false, error: 'Only admins can force unlock files' }
  }
  
  const { error } = await supabase
    .from('files')
    .update({
      checked_out_by: null,
      checked_out_at: null,
      lock_message: null,
      checked_out_by_machine_id: null,
      checked_out_by_machine_name: null
    })
    .eq('id', fileId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Add a new file to the vault
 */
export async function addFile(
  orgId: string,
  userId: string,
  filePath: string,
  fileData: File | Blob | ArrayBuffer,
  metadata: {
    partNumber?: string
    description?: string
    customProperties?: Record<string, string | number | null>
  } = {}
): Promise<{ success: boolean; file?: PDMFile; error?: string }> {
  // Get filename and extension
  const fileName = filePath.split('/').pop() || filePath
  const extension = '.' + fileName.split('.').pop()?.toLowerCase() || ''
  const fileType = getFileType(extension)
  
  // Upload content
  const { hash, size, error: uploadError } = await uploadFile(orgId, fileData)
  
  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError}` }
  }
  
  // Create file record
  const { data: file, error: insertError } = await supabase
    .from('files')
    .insert({
      org_id: orgId,
      file_path: filePath,
      file_name: fileName,
      extension: extension,
      file_type: fileType,
      part_number: metadata.partNumber || null,
      description: metadata.description || null,
      revision: 'A',
      version: 1,
      state: 'not_tracked',
      content_hash: hash,
      file_size: size,
      created_by: userId,
      updated_by: userId,
      custom_properties: metadata.customProperties || {}
    })
    .select()
    .single()
  
  if (insertError) {
    return { success: false, error: insertError.message }
  }
  
  // Create initial version record
  await supabase
    .from('file_versions')
    .insert({
      file_id: file.id,
      version: 1,
      revision: 'A',
      content_hash: hash,
      file_size: size,
      state: 'not_tracked',
      created_by: userId,
      comment: 'Initial version'
    })
  
  return { success: true, file }
}

/**
 * Get a specific version of a file
 */
export async function getFileVersion(
  orgId: string,
  fileId: string,
  version: number
): Promise<{ data: Blob | null; version?: FileVersion; error?: string }> {
  // Get version record
  const { data: versionRecord, error: fetchError } = await supabase
    .from('file_versions')
    .select('*')
    .eq('file_id', fileId)
    .eq('version', version)
    .single()
  
  if (fetchError) {
    return { data: null, error: fetchError.message }
  }
  
  // Download content
  const { data, error: downloadError } = await downloadFile(orgId, versionRecord.content_hash)
  
  if (downloadError) {
    return { data: null, error: downloadError }
  }
  
  return { data, version: versionRecord }
}

/**
 * Get file version history
 */
export async function getFileHistory(
  fileId: string
): Promise<{ versions: FileVersion[]; error?: string }> {
  const { data, error } = await supabase
    .from('file_versions')
    .select('*, created_by_user:users!created_by(email, full_name)')
    .eq('file_id', fileId)
    .order('version', { ascending: false })
  
  if (error) {
    return { versions: [], error: error.message }
  }
  
  return { versions: data || [] }
}

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
  // Get current file
  const { data: file, error: fetchError } = await supabase
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
  const { data: targetVersionRecord, error: versionError } = await supabase
    .from('file_versions')
    .select('*')
    .eq('file_id', fileId)
    .eq('version', targetVersion)
    .single()
  
  if (versionError) {
    return { success: false, error: `Version ${targetVersion} not found` }
  }
  
  // Get max version for reference (the total number of versions)
  const { data: maxVersionData } = await supabase
    .from('file_versions')
    .select('version')
    .eq('file_id', fileId)
    .order('version', { ascending: false })
    .limit(1)
    .single()
  
  const maxVersion = maxVersionData?.version || file.version
  
  // DO NOT update the server's files table - this is a local operation only
  // The server will be updated on check-in
  
  // Log activity (this is just for history, doesn't change file state on server)
  // Fire-and-forget to avoid blocking the rollback operation
  const isRollback = targetVersion < file.version
  import('./supabase').then(({ getCurrentUserEmail }) => {
    getCurrentUserEmail().then(userEmail => {
      supabase.from('activity').insert({
        org_id: file.org_id,
        file_id: fileId,
        user_id: userId,
        user_email: userEmail,
        action: 'revision_change' as const,  // Use revision_change for rollback/roll_forward
        details: { 
          version_action: isRollback ? 'rollback' : 'roll_forward',
          from_version: file.version, 
          to_version: targetVersion,
          comment: comment || null
        }
      }).then(({ error: activityError }) => {
        if (activityError) {
          console.warn('[Rollback] Failed to log activity:', activityError.message)
        }
      })
    })
  })
  
  // Return the target version info so caller can download content
  return { success: true, targetVersionRecord, maxVersion }
}

/**
 * Transition file to a new workflow state
 * State changes are now managed through workflow transitions
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
  // Get current file
  const { data: file, error: fetchError } = await supabase
    .from('files')
    .select('*, workflow_state:workflow_states(*)')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  // Get the target state
  const { data: targetState, error: targetError } = await supabase
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
  
  const { data: updated, error: updateError } = await supabase
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

