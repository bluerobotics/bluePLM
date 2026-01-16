import { getSupabaseClient } from '../client'

// ============================================
// File Move Operations
// ============================================

/**
 * Move a file to a new location on the server using atomic RPC.
 * 
 * This function:
 * - Validates the file exists
 * - Blocks if file is checked out by another user
 * - Updates file_path and file_name atomically
 * - Logs a 'move' activity
 * 
 * @param fileId - UUID of the file to move
 * @param userId - UUID of the user performing the move
 * @param newFilePath - New relative path for the file (e.g., "folder/subfolder/file.sldprt")
 * @param newFileName - Optional new file name (if not provided, keeps current name)
 */
export async function moveFileOnServer(
  fileId: string,
  userId: string,
  newFilePath: string,
  newFileName?: string
): Promise<{ success: boolean; file?: unknown; error?: string }> {
  const client = getSupabaseClient()
  
  // Use atomic RPC to prevent race conditions and ensure proper validation
  // Note: Using 'as any' for rpc name since move_file is a new RPC not yet in generated types
  const { data, error } = await (client.rpc as any)('move_file', {
    p_file_id: fileId,
    p_user_id: userId,
    p_new_file_path: newFilePath,
    p_new_file_name: newFileName || null
  })
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  // RPC returns JSONB with { success, error?, file? }
  const result = (data ?? { success: false }) as { success: boolean; error?: string; file?: unknown }
  
  if (!result.success) {
    return { success: false, error: result.error }
  }
  
  return { success: true, file: result.file }
}

/**
 * Move multiple files to a new folder on the server.
 * 
 * @param files - Array of { fileId, newFilePath, newFileName? } objects
 * @param userId - UUID of the user performing the moves
 * @returns Object with success count, failure count, and any errors
 */
export async function moveFilesOnServer(
  files: Array<{ fileId: string; newFilePath: string; newFileName?: string }>,
  userId: string
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const errors: string[] = []
  let succeeded = 0
  let failed = 0
  
  for (const file of files) {
    const result = await moveFileOnServer(file.fileId, userId, file.newFilePath, file.newFileName)
    
    if (result.success) {
      succeeded++
    } else {
      failed++
      if (result.error) {
        errors.push(`${file.fileId}: ${result.error}`)
      }
    }
  }
  
  return { succeeded, failed, errors }
}
