import { getSupabaseClient } from '../client'

// ============================================
// Soft Delete / Restore Operations
// ============================================

/**
 * Soft delete a file (move to trash)
 */
export async function softDeleteFile(
  fileId: string,
  userId: string
): Promise<{ success: boolean; file?: any; error?: string }> {
  const client = getSupabaseClient()
  
  // Get current file to validate
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('id, org_id, file_name, file_path, checked_out_by')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  // Don't allow deleting checked-out files
  if (file.checked_out_by) {
    return { success: false, error: 'Cannot delete a checked-out file. Please check it in first.' }
  }
  
  // Soft delete - set deleted_at and deleted_by
  const { data: deletedFile, error } = await client
    .from('files')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId
    })
    .eq('id', fileId)
    .select()
    .single()
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  // Log activity
  try {
    await client.from('activity').insert({
      org_id: file.org_id,
      file_id: fileId,
      user_id: userId,
      user_email: '',
      action: 'delete' as const,
      details: {
        file_name: file.file_name,
        file_path: file.file_path,
        soft_delete: true
      }
    })
  } catch (activityError) {
    console.warn('[softDeleteFile] Failed to log activity:', activityError)
  }
  
  return { success: true, file: deletedFile }
}

/**
 * Soft delete multiple files at once
 */
export async function softDeleteFiles(
  fileIds: string[],
  userId: string
): Promise<{ success: boolean; deleted: number; failed: number; errors: string[] }> {
  const errors: string[] = []
  let deleted = 0
  let failed = 0
  
  for (const fileId of fileIds) {
    const result = await softDeleteFile(fileId, userId)
    if (result.success) {
      deleted++
    } else {
      failed++
      errors.push(result.error || 'Unknown error')
    }
  }
  
  return { success: failed === 0, deleted, failed, errors }
}

/**
 * Restore a file from trash
 */
export async function restoreFile(
  fileId: string,
  userId: string
): Promise<{ success: boolean; file?: any; error?: string }> {
  const client = getSupabaseClient()
  
  // Get current file to validate
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('id, org_id, file_name, file_path, deleted_at, vault_id')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  if (!file.deleted_at) {
    return { success: false, error: 'File is not in trash' }
  }
  
  if (!file.vault_id) {
    return { success: false, error: 'File has no vault assigned' }
  }
  
  // Check if a file with the same path already exists (not deleted)
  const { data: existingFile } = await client
    .from('files')
    .select('id')
    .eq('vault_id', file.vault_id)
    .eq('file_path', file.file_path)
    .is('deleted_at', null)
    .single()
  
  if (existingFile) {
    return { 
      success: false, 
      error: 'A file with the same path already exists. Rename or delete the existing file first.' 
    }
  }
  
  // Restore - clear deleted_at and deleted_by
  const { data: restoredFile, error } = await client
    .from('files')
    .update({
      deleted_at: null,
      deleted_by: null
    })
    .eq('id', fileId)
    .select()
    .single()
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  // Log activity
  try {
    await client.from('activity').insert({
      org_id: file.org_id,
      file_id: fileId,
      user_id: userId,
      user_email: '',
      action: 'restore',
      details: {
        file_name: file.file_name,
        file_path: file.file_path
      }
    })
  } catch (activityError) {
    console.warn('[restoreFile] Failed to log activity:', activityError)
  }
  
  return { success: true, file: restoredFile }
}

/**
 * Restore multiple files from trash
 */
export async function restoreFiles(
  fileIds: string[],
  userId: string
): Promise<{ success: boolean; restored: number; failed: number; errors: string[] }> {
  const errors: string[] = []
  let restored = 0
  let failed = 0
  
  for (const fileId of fileIds) {
    const result = await restoreFile(fileId, userId)
    if (result.success) {
      restored++
    } else {
      failed++
      errors.push(result.error || 'Unknown error')
    }
  }
  
  return { success: failed === 0, restored, failed, errors }
}

/**
 * Permanently delete a file (cannot be undone)
 * Only for files already in trash
 */
export async function permanentlyDeleteFile(
  fileId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient()
  
  // Get current file to validate
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('id, org_id, file_name, file_path, deleted_at')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  if (!file.deleted_at) {
    return { success: false, error: 'File must be in trash before permanent deletion' }
  }
  
  // Log activity BEFORE delete
  try {
    await client.from('activity').insert({
      org_id: file.org_id,
      file_id: null, // Set to null since file will be deleted
      user_id: userId,
      user_email: '',
      action: 'delete' as const,
      details: {
        file_name: file.file_name,
        file_path: file.file_path,
        permanent: true
      }
    })
  } catch (activityError) {
    console.warn('[permanentlyDeleteFile] Failed to log activity:', activityError)
  }
  
  // Delete file versions
  await client
    .from('file_versions')
    .delete()
    .eq('file_id', fileId)
  
  // Delete file references
  await client
    .from('file_references')
    .delete()
    .or(`parent_file_id.eq.${fileId},child_file_id.eq.${fileId}`)
  
  // Permanently delete the file
  const { error } = await client
    .from('files')
    .delete()
    .eq('id', fileId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Permanently delete multiple files in batch (cannot be undone)
 * Much faster than calling permanentlyDeleteFile individually
 * Processes in chunks to avoid timeouts
 */
export async function permanentlyDeleteFiles(
  fileIds: string[],
  userId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<{ success: boolean; deleted: number; failed: number; errors: string[] }> {
  if (fileIds.length === 0) {
    return { success: true, deleted: 0, failed: 0, errors: [] }
  }

  const client = getSupabaseClient()
  const CHUNK_SIZE = 100 // Process 100 files at a time
  const errors: string[] = []
  let deleted = 0
  let failed = 0

  // Get all file info in batches (for validation and activity logging)
  const allFiles: { id: string; org_id: string; file_name: string; file_path: string; deleted_at: string | null }[] = []
  
  for (let i = 0; i < fileIds.length; i += CHUNK_SIZE) {
    const chunkIds = fileIds.slice(i, i + CHUNK_SIZE)
    const { data: files, error: fetchError } = await client
      .from('files')
      .select('id, org_id, file_name, file_path, deleted_at')
      .in('id', chunkIds)
    
    if (fetchError) {
      errors.push(`Failed to fetch files: ${fetchError.message}`)
      continue
    }
    
    if (files) {
      allFiles.push(...files)
    }
  }

  // Filter to only files that are actually in trash
  const validFiles = allFiles.filter(f => f.deleted_at !== null)
  const invalidCount = allFiles.length - validFiles.length
  if (invalidCount > 0) {
    failed += invalidCount
    errors.push(`${invalidCount} file(s) were not in trash`)
  }

  // Also count files we couldn't find
  const notFoundCount = fileIds.length - allFiles.length
  if (notFoundCount > 0) {
    failed += notFoundCount
    errors.push(`${notFoundCount} file(s) not found`)
  }

  if (validFiles.length === 0) {
    return { success: failed === 0, deleted: 0, failed, errors }
  }

  const validFileIds = validFiles.map(f => f.id)

  // Process in chunks for actual deletion
  for (let i = 0; i < validFileIds.length; i += CHUNK_SIZE) {
    const chunkIds = validFileIds.slice(i, i + CHUNK_SIZE)
    const chunkFiles = validFiles.filter(f => chunkIds.includes(f.id))

    try {
      // 1. Batch insert activity logs
      const activityLogs = chunkFiles.map(file => ({
        org_id: file.org_id,
        file_id: null, // Set to null since file will be deleted
        user_id: userId,
        user_email: '',
        action: 'delete' as const,
        details: {
          file_name: file.file_name,
          file_path: file.file_path,
          permanent: true,
          batch_delete: true
        }
      }))
      
      await client.from('activity').insert(activityLogs)

      // 2. Batch delete file versions
      await client
        .from('file_versions')
        .delete()
        .in('file_id', chunkIds)

      // 3. Batch delete file references (both parent and child)
      await client
        .from('file_references')
        .delete()
        .in('parent_file_id', chunkIds)
      
      await client
        .from('file_references')
        .delete()
        .in('child_file_id', chunkIds)

      // 4. Batch delete the files
      const { error: deleteError } = await client
        .from('files')
        .delete()
        .in('id', chunkIds)

      if (deleteError) {
        errors.push(`Batch delete failed: ${deleteError.message}`)
        failed += chunkIds.length
      } else {
        deleted += chunkIds.length
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`Chunk deletion error: ${errorMsg}`)
      failed += chunkIds.length
    }

    // Report progress
    onProgress?.(i + chunkIds.length, validFileIds.length)
  }

  return { 
    success: failed === 0, 
    deleted, 
    failed,
    errors: errors.length > 5 ? [...errors.slice(0, 5), `...and ${errors.length - 5} more errors`] : errors
  }
}

/**
 * Get deleted files (trash) for an organization
 * Optionally filter by vault or folder path
 * Returns empty array if deleted_at column doesn't exist (migration not run)
 */
export async function getDeletedFiles(
  orgId: string,
  options?: {
    vaultId?: string
    folderPath?: string  // Get deleted files that were in this folder
  }
): Promise<{ files: any[]; error?: string }> {
  const client = getSupabaseClient()
  
  try {
    let query = client
      .from('files')
      .select(`
        id,
        file_path,
        file_name,
        extension,
        file_type,
        part_number,
        description,
        revision,
        version,
        content_hash,
        file_size,
        state,
        deleted_at,
        deleted_by,
        vault_id,
        org_id,
        updated_at,
        deleted_by_user:users!deleted_by(email, full_name, avatar_url)
      `)
      .eq('org_id', orgId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    
    if (options?.vaultId) {
      query = query.eq('vault_id', options.vaultId)
    }
    
    if (options?.folderPath) {
      // Match files that were in this folder or subfolders
      query = query.ilike('file_path', `${options.folderPath}%`)
    }
    
    const { data, error } = await query
    
    if (error) {
      // If column doesn't exist, return empty (trash feature not available)
      if (error.message?.includes('deleted_at') || error.message?.includes('column')) {
        console.warn('Trash feature not available - run migration to enable')
        return { files: [] }
      }
      return { files: [], error: error.message }
    }
    
    return { files: data || [] }
  } catch (err) {
    console.error('Error fetching deleted files:', err)
    return { files: [] }
  }
}

/**
 * Get count of deleted files (for badge display)
 * Returns 0 if deleted_at column doesn't exist (migration not run)
 */
export async function getDeletedFilesCount(
  orgId: string,
  vaultId?: string
): Promise<{ count: number; error?: string }> {
  const client = getSupabaseClient()
  
  try {
    let query = client
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .not('deleted_at', 'is', null)
    
    if (vaultId) {
      query = query.eq('vault_id', vaultId)
    }
    
    const { count, error } = await query
    
    if (error) {
      // If column doesn't exist, return 0 (trash feature not available)
      if (error.message?.includes('deleted_at') || error.message?.includes('column')) {
        return { count: 0 }
      }
      return { count: 0, error: error.message }
    }
    
    return { count: count || 0 }
  } catch (err) {
    return { count: 0 }
  }
}

/**
 * Empty the trash - permanently delete all trashed files
 * Admin only operation
 * Uses batch deletion for performance
 */
export async function emptyTrash(
  orgId: string,
  userId: string,
  vaultId?: string
): Promise<{ success: boolean; deleted: number; error?: string }> {
  const client = getSupabaseClient()
  
  // First get all trashed files
  let query = client
    .from('files')
    .select('id')
    .eq('org_id', orgId)
    .not('deleted_at', 'is', null)
  
  if (vaultId) {
    query = query.eq('vault_id', vaultId)
  }
  
  const { data: trashedFiles, error: fetchError } = await query
  
  if (fetchError) {
    return { success: false, deleted: 0, error: fetchError.message }
  }
  
  if (!trashedFiles || trashedFiles.length === 0) {
    return { success: true, deleted: 0 }
  }
  
  // Use batch deletion for performance
  const fileIds = trashedFiles.map(f => f.id)
  const result = await permanentlyDeleteFiles(fileIds, userId)
  
  if (!result.success && result.errors.length > 0) {
    return { success: false, deleted: result.deleted, error: result.errors[0] }
  }
  
  return { success: true, deleted: result.deleted }
}
