import { getSupabaseClient } from '../client'
import { getCurrentUserEmail } from '../auth'

// ============================================
// File Checkout Operations
// ============================================

/**
 * Checkout a file using atomic RPC to prevent race conditions
 */
export async function checkoutFile(
  fileId: string, 
  userId: string, 
  userEmail: string,
  options?: {
    message?: string
    // Pre-computed values to avoid redundant IPC calls in batch operations
    machineId?: string
    machineName?: string
  }
) {
  const client = getSupabaseClient()
  
  // Use pre-computed values if provided, otherwise fetch (for single-file calls)
  let machineId = options?.machineId
  let machineName = options?.machineName
  if (!machineId || !machineName) {
    const { getMachineId, getMachineName } = await import('../../backup')
    machineId = machineId || await getMachineId()
    machineName = machineName || await getMachineName()
  }
  
  // Use atomic RPC to prevent race conditions
  const { data, error } = await client.rpc('checkout_file', {
    p_file_id: fileId,
    p_user_id: userId,
    p_machine_id: machineId,
    p_machine_name: machineName,
    p_lock_message: options?.message
  })
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  // RPC returns JSONB with { success, error?, file? }
  const result = data as { success: boolean; error?: string; file?: any }
  
  if (!result.success) {
    return { success: false, error: result.error }
  }
  
  // Log activity synchronously with try/catch
  try {
    await client.from('activity').insert({
      org_id: result.file.org_id,
      file_id: fileId,
      user_id: userId,
      user_email: userEmail,
      action: 'checkout',
      details: options?.message ? { message: options.message } : {}
    })
  } catch (activityError) {
    console.warn('[Checkout] Failed to log activity:', activityError)
  }
  
  return { success: true, file: result.file, error: null }
}

export async function checkinFile(
  fileId: string, 
  userId: string, 
  options?: {
    newContentHash?: string
    newFileSize?: number
    comment?: string
    newFilePath?: string  // For moved files - update the server path
    newFileName?: string  // For renamed files - update the server name
    localActiveVersion?: number  // If user rolled to a different version locally, track it to force version increment
    pendingMetadata?: {
      part_number?: string | null
      description?: string | null
      revision?: string
      config_tabs?: Record<string, string>  // Per-configuration tab numbers
      config_descriptions?: Record<string, string>  // Per-configuration descriptions
    }
  }
): Promise<{ success: boolean; file?: any; error?: string | null; contentChanged?: boolean; metadataChanged?: boolean; machineMismatchWarning?: string | null }> {
  const client = getSupabaseClient()
  
  // First verify the user has the file checked out
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  if (file.checked_out_by !== userId) {
    return { success: false, error: 'You do not have this file checked out' }
  }
  
  // Check if checking in from a different machine
  const { getMachineId } = await import('../../backup')
  const currentMachineId = await getMachineId()
  const checkoutMachineId = file.checked_out_by_machine_id
  
  // Warn if checking in from a different machine (but allow it)
  let machineMismatchWarning: string | null = null
  if (checkoutMachineId && checkoutMachineId !== currentMachineId) {
    const checkoutMachineName = file.checked_out_by_machine_name || 'another computer'
    machineMismatchWarning = `Warning: This file was checked out on ${checkoutMachineName}. You are checking it in from a different computer.`
  }
  
  // Prepare update data
  const updateData: Record<string, any> = {
    checked_out_by: null,
    checked_out_at: null,
    lock_message: null,
    checked_out_by_machine_id: null,
    checked_out_by_machine_name: null,
    updated_at: new Date().toISOString(),
    updated_by: userId
  }
  
  // Handle file path/name changes (for moved/renamed files)
  if (options?.newFilePath && options.newFilePath !== file.file_path) {
    updateData.file_path = options.newFilePath
  }
  if (options?.newFileName && options.newFileName !== file.file_name) {
    updateData.file_name = options.newFileName
  }
  
  // Apply pending metadata changes if any
  const hasPendingMetadata = options?.pendingMetadata && (
    options.pendingMetadata.part_number !== undefined ||
    options.pendingMetadata.description !== undefined ||
    options.pendingMetadata.revision !== undefined ||
    options.pendingMetadata.config_tabs !== undefined ||
    options.pendingMetadata.config_descriptions !== undefined
  )
  
  if (hasPendingMetadata && options?.pendingMetadata) {
    if (options.pendingMetadata.part_number !== undefined) {
      updateData.part_number = options.pendingMetadata.part_number
    }
    if (options.pendingMetadata.description !== undefined) {
      updateData.description = options.pendingMetadata.description
    }
    if (options.pendingMetadata.revision !== undefined) {
      updateData.revision = options.pendingMetadata.revision
    }
    // Save per-configuration data to custom_properties
    if (options.pendingMetadata.config_tabs !== undefined || options.pendingMetadata.config_descriptions !== undefined) {
      const existingCustomProps = (file.custom_properties || {}) as Record<string, unknown>
      updateData.custom_properties = {
        ...existingCustomProps,
        ...(options.pendingMetadata.config_tabs !== undefined && { _config_tabs: options.pendingMetadata.config_tabs }),
        ...(options.pendingMetadata.config_descriptions !== undefined && { _config_descriptions: options.pendingMetadata.config_descriptions })
      }
    }
  }
  
  // Check if content changed OR metadata changed OR user switched versions locally
  const contentChanged = !!(options?.newContentHash && options.newContentHash !== file.content_hash)
  const metadataChanged = hasPendingMetadata
  // If user rolled to a different version locally (localActiveVersion set and differs from server), we need to increment
  // This handles cases where version 7 has same hash as version 6 but user intentionally switched versions
  const versionSwitched = options?.localActiveVersion !== undefined && options.localActiveVersion !== file.version
  const shouldIncrementVersion = contentChanged || metadataChanged || versionSwitched
  
  console.debug('[Checkin] Version decision:', {
    fileId,
    serverVersion: file.version,
    localActiveVersion: options?.localActiveVersion,
    contentChanged,
    metadataChanged,
    versionSwitched,
    shouldIncrementVersion
  })
  
  if (shouldIncrementVersion) {
    // Get max version from history - new version should be max + 1
    // This handles the case where you rollback from v5 to v3, then check in -> should be v6
    // Use maybeSingle() since file might not have version history yet (first version)
    const { data: maxVersionData, error: maxVersionError } = await client
      .from('file_versions')
      .select('version')
      .eq('file_id', fileId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    if (maxVersionError) {
      console.warn('[Checkin] Failed to get max version from history:', maxVersionError.message)
    }
    
    const maxVersionInHistory = maxVersionData?.version || file.version
    const newVersion = maxVersionInHistory + 1
    updateData.version = newVersion
    
    console.debug('[Checkin] Incrementing version:', {
      fileId,
      currentVersion: file.version,
      maxVersionInHistory,
      newVersion,
      reason: versionSwitched ? 'version_switched' : contentChanged ? 'content_changed' : 'metadata_changed'
    })
    
    if (contentChanged) {
      updateData.content_hash = options!.newContentHash
      if (options!.newFileSize !== undefined) {
        updateData.file_size = options!.newFileSize
      }
    }
    
    // Create version record for changes
    const { error: versionInsertError } = await client.from('file_versions').insert({
      file_id: fileId,
      version: newVersion,
      revision: updateData.revision || file.revision,
      content_hash: updateData.content_hash || file.content_hash,
      file_size: updateData.file_size || file.file_size,
      workflow_state_id: file.workflow_state_id,
      state: file.state || 'not_tracked',
      created_by: userId,
      comment: options?.comment || null
    })
    
    if (versionInsertError) {
      console.error('[Checkin] Failed to insert version record:', versionInsertError.message)
      // If version insert fails, don't update the file to the new version
      // This prevents version mismatch between files and file_versions tables
      return { success: false, error: `Failed to create version record: ${versionInsertError.message}` }
    }
    
    // Log revision change activity if revision changed
    if (options?.pendingMetadata?.revision && options.pendingMetadata.revision !== file.revision) {
      try {
        const userEmail = await getCurrentUserEmail()
        await client.from('activity').insert({
          org_id: file.org_id,
          file_id: fileId,
          user_id: userId,
          user_email: userEmail,
          action: 'revision_change',
          details: { from: file.revision, to: options.pendingMetadata.revision }
        })
      } catch (activityError) {
        console.warn('[Checkin] Failed to log revision change activity:', activityError)
      }
    }
  }
  
  // Update the file
  const { data, error } = await client
    .from('files')
    .update(updateData)
    .eq('id', fileId)
    .select()
    .single()
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  // Log activity synchronously with try/catch
  try {
    const userEmail = await getCurrentUserEmail()
    await client.from('activity').insert({
      org_id: data.org_id,
      file_id: fileId,
      user_id: userId,
      user_email: userEmail,
      action: 'checkin',
      details: { 
        ...(options?.comment ? { comment: options.comment } : {}),
        contentChanged,
        metadataChanged
      }
    })
  } catch (activityError) {
    console.warn('[Checkin] Failed to log activity:', activityError)
  }
  
  return { success: true, file: data, error: null, contentChanged, metadataChanged, machineMismatchWarning }
}

/**
 * Sync SolidWorks file metadata and create a new version
 * This can be called without having the file checked out (for metadata-only updates from SW properties)
 */
export async function syncSolidWorksFileMetadata(
  fileId: string,
  userId: string,
  metadata: {
    part_number?: string | null
    description?: string | null
    revision?: string | null
    custom_properties?: Record<string, string | number | null>
  }
): Promise<{ success: boolean; file?: any; error?: string | null }> {
  const client = getSupabaseClient()
  
  // Get current file data
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  // Check if any metadata actually changed
  const partNumberChanged = metadata.part_number !== undefined && 
    (metadata.part_number || null) !== (file.part_number || null)
  const descriptionChanged = metadata.description !== undefined && 
    (metadata.description || null) !== (file.description || null)
  const revisionChanged = metadata.revision !== undefined && 
    (metadata.revision || null) !== (file.revision || null)
  const customPropsChanged = metadata.custom_properties !== undefined
  
  if (!partNumberChanged && !descriptionChanged && !revisionChanged && !customPropsChanged) {
    // No changes - return current file
    return { success: true, file, error: null }
  }
  
  // Build update data
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
    updated_by: userId
  }
  
  if (metadata.part_number !== undefined) {
    updateData.part_number = metadata.part_number
  }
  if (metadata.description !== undefined) {
    updateData.description = metadata.description
  }
  if (metadata.revision !== undefined && metadata.revision !== null) {
    updateData.revision = metadata.revision
  }
  if (metadata.custom_properties !== undefined) {
    updateData.custom_properties = metadata.custom_properties
  }
  
  // Create a new version for metadata changes
  const { data: maxVersionData } = await client
    .from('file_versions')
    .select('version')
    .eq('file_id', fileId)
    .order('version', { ascending: false })
    .limit(1)
    .single()
  
  const maxVersionInHistory = maxVersionData?.version || file.version
  const newVersion = maxVersionInHistory + 1
  updateData.version = newVersion
  
  // Create version record
  await client.from('file_versions').insert({
    file_id: fileId,
    version: newVersion,
    revision: updateData.revision || file.revision || 'A',
    content_hash: file.content_hash || '',
    file_size: file.file_size,
    workflow_state_id: file.workflow_state_id,
    state: file.state || 'not_tracked',
    created_by: userId,
    comment: 'Metadata updated from SolidWorks file properties'
  })
  
  // Update the file
  const { data, error } = await client
    .from('files')
    .update(updateData)
    .eq('id', fileId)
    .select()
    .single()
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  // Log activity
  const changedFields: string[] = []
  if (partNumberChanged) changedFields.push('part_number')
  if (descriptionChanged) changedFields.push('description')
  if (revisionChanged) changedFields.push('revision')
  if (customPropsChanged) changedFields.push('custom_properties')
  
  // Log activity synchronously with try/catch
  try {
    const userEmail = await getCurrentUserEmail()
    await client.from('activity').insert({
      org_id: file.org_id,
      file_id: fileId,
      user_id: userId,
      user_email: userEmail,
      action: 'checkin',
      details: { 
        metadataSync: true,
        changedFields,
        source: 'solidworks'
      }
    })
  } catch (activityError) {
    console.warn('[SyncMetadata] Failed to log activity:', activityError)
  }
  
  return { success: true, file: data, error: null }
}

export async function undoCheckout(fileId: string, userId: string) {
  const client = getSupabaseClient()
  
  // Verify the user has the file checked out (or is admin)
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('*, org_id')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  if (file.checked_out_by !== userId) {
    // Note: Admins should use adminForceDiscardCheckout() instead
    return { success: false, error: 'You do not have this file checked out' }
  }
  
  // Release the checkout without saving changes
  const { data, error } = await client
    .from('files')
    .update({
      checked_out_by: null,
      checked_out_at: null,
      lock_message: null,
      checked_out_by_machine_id: null,
      checked_out_by_machine_name: null
    })
    .eq('id', fileId)
    .select()
    .single()
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true, file: data, error: null }
}

// ============================================
// Admin Force Check-In Operations
// ============================================

/**
 * Admin force discard checkout - discards the checkout without saving changes
 * Use this when the user is offline or unresponsive
 */
export async function adminForceDiscardCheckout(
  fileId: string,
  adminUserId: string
): Promise<{ success: boolean; file?: any; error?: string }> {
  const client = getSupabaseClient()
  
  // Verify admin
  const { data: adminUser, error: adminError } = await client
    .from('users')
    .select('role, org_id')
    .eq('id', adminUserId)
    .single()
  
  if (adminError || adminUser?.role !== 'admin') {
    return { success: false, error: 'Only admins can force discard checkouts' }
  }
  
  // Get the file info
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  if (!file.checked_out_by) {
    return { success: false, error: 'File is not checked out' }
  }
  
  // Get the checked out user info separately
  let checkedOutUser: { id: string; email: string; full_name: string | null } | null = null
  const { data: userData } = await client
    .from('users')
    .select('id, email, full_name')
    .eq('id', file.checked_out_by)
    .single()
  
  if (userData) {
    checkedOutUser = userData
  }
  
  // Release the checkout without saving changes
  const { data, error } = await client
    .from('files')
    .update({
      checked_out_by: null,
      checked_out_at: null,
      lock_message: null,
      checked_out_by_machine_id: null,
      checked_out_by_machine_name: null
    })
    .eq('id', fileId)
    .select()
    .single()
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  // Log activity synchronously with try/catch
  try {
    const adminEmail = await getCurrentUserEmail()
    await client.from('activity').insert({
      org_id: file.org_id,
      file_id: fileId,
      user_id: adminUserId,
      user_email: adminEmail,
      action: 'update' as const,
      details: { 
        admin_action: 'force_discard',
        previousCheckoutUser: checkedOutUser?.email || checkedOutUser?.id,
        previousCheckoutUserName: checkedOutUser?.full_name
      }
    })
  } catch (activityError) {
    console.warn('[AdminForceDiscard] Failed to log activity:', activityError)
  }
  
  return { success: true, file: data }
}
