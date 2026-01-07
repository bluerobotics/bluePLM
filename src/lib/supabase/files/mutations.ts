import { getSupabaseClient } from '../client'
import { getCurrentUserEmail } from '../auth'
import { withRetry } from '../../network'

// ============================================
// Private Helper Functions
// ============================================

function getFileTypeFromExtension(ext: string): 'part' | 'assembly' | 'drawing' | 'pdf' | 'step' | 'other' {
  const lowerExt = ext.toLowerCase()
  
  // CAD Parts (all major CAD software)
  if ([
    '.sldprt', '.prtdot', '.sldlfp', '.sldftp', '.sldblk',  // SolidWorks
    '.ipt',                                                   // Inventor
    '.prt',                                                   // Creo/NX
    '.par', '.psm', '.pwd',                                   // Solid Edge
    '.catpart', '.catshape',                                  // CATIA
    '.3dm', '.gh', '.ghx',                                    // Rhino
    '.skp', '.skb',                                           // SketchUp
    '.fcstd', '.scad', '.brep',                               // Open source CAD
    '.blend', '.max', '.ma', '.mb', '.c4d',                   // 3D viz
    '.x_t', '.x_b', '.xmt_txt', '.xmt_bin',                   // Parasolid
    '.sat', '.sab', '.asat',                                  // ACIS
    '.f3d', '.f3z',                                           // Fusion 360
  ].includes(lowerExt)) return 'part'
  
  // CAD Assemblies
  if ([
    '.sldasm', '.asmdot',   // SolidWorks
    '.iam', '.ipn',         // Inventor
    '.asm',                  // Creo
    '.catproduct',           // CATIA
  ].includes(lowerExt)) return 'assembly'
  
  // CAD Drawings
  if ([
    '.slddrw', '.slddrt', '.drwdot', '.sldstd',              // SolidWorks
    '.idw', '.dwg', '.dwt', '.dws', '.dwf', '.dwfx',         // Inventor/AutoCAD
    '.dxf',                                                   // DXF
    '.drw', '.frm',                                           // Creo
    '.dft',                                                   // Solid Edge
    '.catdrawing',                                            // CATIA
    '.layout',                                                // SketchUp
  ].includes(lowerExt)) return 'drawing'
  
  // PDF
  if (lowerExt === '.pdf') return 'pdf'
  
  // STEP and neutral exchange formats
  if ([
    '.step', '.stp', '.stpz', '.p21',                        // STEP
    '.iges', '.igs',                                          // IGES
    '.jt',                                                    // JT
    '.stl', '.stla', '.stlb',                                // STL
    '.3mf', '.amf',                                           // Additive manufacturing
    '.obj', '.mtl',                                           // OBJ
    '.fbx', '.dae',                                           // Animation exchange
    '.gltf', '.glb',                                          // GL Transmission
    '.usdz', '.usda', '.usdc',                                // USD
    '.ply', '.wrl', '.vrml', '.x3d',                         // Other mesh
  ].includes(lowerExt)) return 'step'
  
  return 'other'
}

// Helper to wrap Supabase DB calls with retry logic
// Uses PromiseLike to accept Supabase's PostgrestBuilder which is thenable
async function dbWithRetry<T>(
  operation: () => PromiseLike<{ data: T | null; error: any }>,
  context: string,
  logFn: (level: string, msg: string, data?: any) => void
): Promise<{ data: T | null; error: any }> {
  let lastResult: { data: T | null; error: any } = { data: null, error: null }
  
  try {
    await withRetry(
      async () => {
        lastResult = await operation()
        if (lastResult.error) {
          throw lastResult.error
        }
        return lastResult
      },
      {
        maxAttempts: 3,
        baseDelay: 500,
        onRetry: (attempt, err) => {
          logFn('warn', `[syncFile] ${context} failed, retrying (${attempt}/3)`, { 
            error: err instanceof Error ? err.message : String(err) 
          })
        }
      }
    )
  } catch {
    // withRetry exhausted - lastResult contains the final error
  }
  
  return lastResult
}

// ============================================
// Sync Operations
// ============================================

export async function syncFile(
  orgId: string,
  vaultId: string,
  userId: string,
  filePath: string,  // relative path in vault
  fileName: string,
  extension: string,
  fileSize: number,
  contentHash: string,
  base64Content: string,
  metadata?: {
    partNumber?: string | null
    description?: string | null
    revision?: string | null
    customProperties?: Record<string, string | number | null>
  }
) {
  const client = getSupabaseClient()
  
  // Debug: Log sync attempt
  const logFn = typeof window !== 'undefined' && (window as any).electronAPI?.log
    ? (level: string, msg: string, data?: any) => (window as any).electronAPI.log(level, msg, data)
    : () => {}
  
  logFn('debug', '[syncFile] Starting sync', { orgId, vaultId, filePath, fileName })
  
  try {
    // 1. Upload file content to storage (using content hash as filename for deduplication)
    // Use subdirectory based on first 2 chars of hash to prevent too many files in one folder
    const storagePath = `${orgId}/${contentHash.substring(0, 2)}/${contentHash}`
    
    // Check if this content already exists (deduplication)
    logFn('debug', '[syncFile] Checking storage', { filePath, storagePath })
    let existingFile: { name: string }[] | null = null
    let listError: Error | null = null
    
    try {
      const listResult = await client.storage
        .from('vault')
        .list(`${orgId}/${contentHash.substring(0, 2)}`, { search: contentHash })
      existingFile = listResult.data
      listError = listResult.error
    } catch (err) {
      // Network error - log and continue (will try to upload)
      logFn('warn', '[syncFile] Storage list error, will attempt upload', { 
        filePath, 
        error: err instanceof Error ? err.message : String(err) 
      })
    }
    
    if (listError) {
      logFn('error', '[syncFile] Storage list error', { filePath, error: listError.message })
    }
    
    if (!existingFile || existingFile.length === 0) {
      // Convert base64 to blob
      logFn('debug', '[syncFile] Uploading to storage', { filePath, size: base64Content.length })
      const binaryString = atob(base64Content)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const blob = new Blob([bytes])
      
      // Upload to storage
      try {
        const uploadResult = await client.storage
          .from('vault')
          .upload(storagePath, blob, {
            contentType: 'application/octet-stream',
            upsert: false
          })
        
        if (uploadResult.error && !uploadResult.error.message.includes('already exists')) {
          logFn('error', '[syncFile] Storage upload failed', { filePath, error: uploadResult.error.message })
          throw uploadResult.error
        }
        logFn('debug', '[syncFile] Storage upload complete', { filePath })
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err)
        logFn('error', '[syncFile] Storage upload error', { filePath, error: errMessage })
        throw err
      }
    } else {
      logFn('debug', '[syncFile] Content already exists in storage', { filePath })
    }
    
    // 2. Determine file type from extension
    const fileType = getFileTypeFromExtension(extension)
    
    // 3. Check if file already exists in database (by vault and path)
    // With partial unique index (Agent 1), only active (non-deleted) files have unique constraint
    logFn('debug', '[syncFile] Checking DB for existing file', { filePath, vaultId, orgId })
    
    // Check for an active (non-deleted) file with matching org
    const { data: activeFile, error: activeError } = await client
      .from('files')
      .select('id, version, deleted_at, org_id')
      .eq('vault_id', vaultId)
      .eq('file_path', filePath)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .single()
    
    if (activeError && activeError.code !== 'PGRST116') {
      logFn('error', '[syncFile] Active file check error', { filePath, error: activeError.message, code: activeError.code })
    }
    
    // If active file exists with same org, update it
    if (activeFile) {
      logFn('debug', '[syncFile] Updating active file', { filePath, existingId: activeFile.id, metadata })
      
      // Build update payload - only include metadata fields if provided
      const updatePayload: Record<string, unknown> = {
        content_hash: contentHash,
        file_size: fileSize,
        version: activeFile.version + 1,
        updated_at: new Date().toISOString(),
        updated_by: userId
      }
      
      // Only update metadata if provided (preserve existing values otherwise)
      if (metadata?.partNumber !== undefined) {
        updatePayload.part_number = metadata.partNumber
      }
      if (metadata?.description !== undefined) {
        updatePayload.description = metadata.description
      }
      if (metadata?.customProperties !== undefined) {
        updatePayload.custom_properties = metadata.customProperties
      }
      
      const { data: updatedFile, error } = await dbWithRetry(
        () => client
          .from('files')
          .update(updatePayload)
          .eq('id', activeFile.id)
          .select()
          .single(),
        'File update',
        logFn
      )
      
      if (error || !updatedFile) {
        logFn('error', '[syncFile] Update failed', { filePath, error: error?.message || 'No data returned' })
        throw error || new Error('Update returned no data')
      }
      
      // Type assertion after validation - we know the structure from Supabase schema
      const fileData = updatedFile as { revision: string; workflow_state_id: string | null; state: string | null }
      
      // Create version record
      await dbWithRetry(
        () => client.from('file_versions').insert({
          file_id: activeFile.id,
          version: activeFile.version + 1,
          revision: fileData.revision,
          content_hash: contentHash,
          file_size: fileSize,
          workflow_state_id: fileData.workflow_state_id,
          state: fileData.state || 'not_tracked',
          created_by: userId
        }),
        'Version insert',
        logFn
      )
      
      logFn('info', '[syncFile] Update SUCCESS', { filePath, fileId: activeFile.id })
      return { file: updatedFile, error: null, isNew: false }
    }
    
    // No active file exists - create new file record
    // With partial unique index, soft-deleted files don't block insertion
    logFn('debug', '[syncFile] Inserting new file', { filePath, vaultId, orgId, metadata })
    const { data, error } = await dbWithRetry(
      () => client
        .from('files')
        .insert({
          org_id: orgId,
          vault_id: vaultId,
          file_path: filePath,
          file_name: fileName,
          extension: extension,
          file_type: fileType,
          content_hash: contentHash,
          file_size: fileSize,
          state: 'not_tracked',
          revision: metadata?.revision || 'A',
          version: 1,
          part_number: metadata?.partNumber || null,
          description: metadata?.description || null,
          custom_properties: metadata?.customProperties || {},
          created_by: userId,
          updated_by: userId
        })
        .select()
        .single(),
      'File insert',
      logFn
    )
    
    if (error || !data) {
      logFn('error', '[syncFile] Insert failed', { filePath, error: error?.message || 'No data returned', code: (error as any)?.code })
      throw error || new Error('Insert returned no data')
    }
    
    // Type assertion after validation - we know the structure from Supabase schema
    const insertedFile = data as { id: string }
    
    // Debug: Log successful insert
    logFn('info', '[syncFile] Insert SUCCESS', { filePath, fileId: insertedFile.id, vaultId })
    
    // Create initial version record
    await dbWithRetry(
      () => client.from('file_versions').insert({
        file_id: insertedFile.id,
        version: 1,
        revision: 'A',
        content_hash: contentHash,
        file_size: fileSize,
        state: 'not_tracked',
        created_by: userId
      }),
      'Version insert',
      logFn
    )
    
    return { file: data, error: null, isNew: true }
  } catch (error) {
    logFn('error', '[syncFile] Exception', { filePath, error: String(error) })
    console.error('Error syncing file:', error)
    return { file: null, error, isNew: false }
  }
}

// ============================================
// File Metadata Updates
// ============================================

export async function updateFileMetadata(
  fileId: string,
  userId: string,
  updates: {
    state?: 'not_tracked' | 'wip' | 'in_review' | 'released' | 'obsolete'
    workflow_state_id?: string
  }
): Promise<{ success: boolean; file?: any; error?: string | null }> {
  const client = getSupabaseClient()
  
  // Get current file to validate and log changes
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('*, org_id')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  // Check if workflow state actually changed
  if (!updates.workflow_state_id || updates.workflow_state_id === file.workflow_state_id) {
    return { success: true, file, error: null }
  }
  
  // Prepare update data - state changes do NOT increment version
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
    workflow_state_id: updates.workflow_state_id,
    state_changed_at: new Date().toISOString(),
    state_changed_by: userId
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
  
  // Log activity
  try {
    const userEmail = await getCurrentUserEmail()
    await client.from('activity').insert({
      org_id: file.org_id,
      file_id: fileId,
      user_id: userId,
      user_email: userEmail,
      action: 'state_change',
      details: { 
        from_state_id: file.workflow_state_id,
        to_state_id: updates.workflow_state_id
      }
    })
  } catch (activityError) {
    console.warn('[updateFileMetadata] Failed to log activity:', activityError)
  }
  
  return { success: true, file: data, error: null }
}

export async function updateFilePath(
  fileId: string,
  newPath: string
): Promise<{ success: boolean; file?: any; error?: string }> {
  const client = getSupabaseClient()
  
  // Extract filename from path
  const newFileName = newPath.split('/').pop() || newPath.split('\\').pop() || newPath
  
  const { data, error } = await client
    .from('files')
    .update({
      file_path: newPath,
      file_name: newFileName,
      updated_at: new Date().toISOString()
    })
    .eq('id', fileId)
    .select()
    .single()
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true, file: data }
}

export async function updateFolderPath(
  oldFolderPath: string,
  newFolderPath: string
): Promise<{ success: boolean; updated: number; error?: string }> {
  const client = getSupabaseClient()
  
  // Get all files in the folder (uses RLS to filter by user's org/vault)
  const { data: files, error: fetchError } = await client
    .from('files')
    .select('id, file_path, file_name')
    .ilike('file_path', `${oldFolderPath}%`)
  
  if (fetchError) {
    return { success: false, updated: 0, error: fetchError.message }
  }
  
  if (!files || files.length === 0) {
    return { success: true, updated: 0 }
  }
  
  // Update each file's path
  let updated = 0
  for (const file of files) {
    const newFilePath = file.file_path.replace(oldFolderPath, newFolderPath)
    
    const { error } = await client
      .from('files')
      .update({
        file_path: newFilePath,
        updated_at: new Date().toISOString()
      })
      .eq('id', file.id)
    
    if (!error) {
      updated++
    }
  }
  
  return { success: true, updated }
}
