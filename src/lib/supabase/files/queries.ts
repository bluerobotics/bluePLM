import { getSupabaseClient } from '../client'

// ============================================
// Files - Read Operations
// ============================================

/**
 * Get files with full metadata including user info (slower, use for single file or small sets)
 */
export async function getFiles(orgId: string, options?: {
  vaultId?: string
  folder?: string
  state?: string[]
  search?: string
  checkedOutByMe?: string  // user ID
  includeDeleted?: boolean  // Include soft-deleted files (default: false)
  workflow_state_ids?: string[]
}) {
  const client = getSupabaseClient()
  let query = client
    .from('files')
    .select(`
      *,
      checked_out_user:users!checked_out_by(email, full_name, avatar_url),
      created_by_user:users!created_by(email, full_name)
    `)
    .eq('org_id', orgId)
    .order('file_path', { ascending: true })
  
  // Filter out soft-deleted files by default
  if (!options?.includeDeleted) {
    query = query.is('deleted_at', null)
  }
  
  // Filter by vault if specified
  if (options?.vaultId) {
    query = query.eq('vault_id', options.vaultId)
  }
  
  if (options?.folder) {
    query = query.ilike('file_path', `${options.folder}%`)
  }
  
  if (options?.workflow_state_ids && options.workflow_state_ids.length > 0) {
    query = query.in('workflow_state_id', options.workflow_state_ids)
  }
  
  if (options?.search) {
    query = query.or(
      `file_name.ilike.%${options.search}%,` +
      `part_number.ilike.%${options.search}%,` +
      `description.ilike.%${options.search}%`
    )
  }
  
  if (options?.checkedOutByMe) {
    query = query.eq('checked_out_by', options.checkedOutByMe)
  }
  
  const { data, error } = await query
  return { files: data, error }
}

/**
 * Lightweight file fetch for initial vault sync - only essential columns, no joins
 * Much faster than getFiles() for large vaults
 * Automatically filters out soft-deleted files (deleted_at is set)
 * Uses pagination to fetch ALL files (Supabase default limit is 1000)
 */
export async function getFilesLightweight(orgId: string, vaultId?: string) {
  const logFn = typeof window !== 'undefined' && (window as any).electronAPI?.log
    ? (level: string, msg: string, data?: any) => (window as any).electronAPI.log(level, msg, data)
    : () => {}
  
  logFn('debug', '[getFilesLightweight] Querying', { orgId, vaultId })
  
  const client = getSupabaseClient()
  
  // Fetch ALL files using pagination (Supabase default limit is 1000)
  const PAGE_SIZE = 1000
  const allFiles: any[] = []
  let offset = 0
  let hasMore = true
  
  while (hasMore) {
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
        checked_out_by,
        checked_out_at,
        updated_at
      `)
      .eq('org_id', orgId)
      .is('deleted_at', null)  // Filter out soft-deleted files
      .order('file_path', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    
    if (vaultId) {
      query = query.eq('vault_id', vaultId)
    }
    
    const { data, error } = await query
    
    if (error) {
      logFn('error', '[getFilesLightweight] Query error', { 
        offset,
        error: error.message 
      })
      return { files: allFiles.length > 0 ? allFiles : null, error }
    }
    
    if (data && data.length > 0) {
      allFiles.push(...data)
      offset += data.length
      // If we got fewer than PAGE_SIZE, we've reached the end
      hasMore = data.length === PAGE_SIZE
      
      if (hasMore) {
        logFn('debug', '[getFilesLightweight] Fetching more files', { 
          fetchedSoFar: allFiles.length,
          offset 
        })
      }
    } else {
      hasMore = false
    }
  }
  
  logFn('debug', '[getFilesLightweight] Result', { 
    fileCount: allFiles.length, 
    hasError: false,
    pages: Math.ceil(allFiles.length / PAGE_SIZE)
  })
  
  return { files: allFiles, error: null }
}

/**
 * Get checked out user info for a batch of file IDs
 * Used to lazily load user info after initial sync
 */
export async function getCheckedOutUsers(fileIds: string[]) {
  if (fileIds.length === 0) return { users: {}, error: null }
  
  const client = getSupabaseClient()
  
  // First get files with their checked_out_by user IDs
  const { data: files, error: filesError } = await client
    .from('files')
    .select('id, checked_out_by')
    .in('id', fileIds)
    .not('checked_out_by', 'is', null)
  
  if (filesError) return { users: {}, error: filesError }
  if (!files || files.length === 0) return { users: {}, error: null }
  
  // Get unique user IDs - filter out nulls with proper type narrowing
  const userIds = [...new Set(
    files.map(f => f.checked_out_by).filter((id): id is string => id !== null)
  )]
  
  if (userIds.length === 0) return { users: {}, error: null }
  
  // Fetch user info separately
  const { data: usersData, error: usersError } = await client
    .from('users')
    .select('id, email, full_name, avatar_url')
    .in('id', userIds)
  
  if (usersError) return { users: {}, error: usersError }
  
  // Create a user lookup map
  const userLookup = new Map(usersData?.map(u => [u.id, u]) || [])
  
  // Convert to a map for easy lookup by file ID
  const users: Record<string, { email: string; full_name: string; avatar_url?: string }> = {}
  for (const file of files) {
    if (!file.checked_out_by) continue
    const user = userLookup.get(file.checked_out_by)
    if (user) {
      users[file.id] = {
        email: user.email,
        full_name: user.full_name || '',
        avatar_url: user.avatar_url || undefined
      }
    }
  }
  
  return { users, error: null }
}

/**
 * Get basic user info by ID (for checkout display)
 * Used when realtime updates come in and we need to show who checked out a file
 */
export async function getUserBasicInfo(userId: string): Promise<{ 
  user: { email: string; full_name: string; avatar_url?: string } | null; 
  error?: string 
}> {
  const client = getSupabaseClient()
  
  const { data, error } = await client
    .from('users')
    .select('email, full_name, avatar_url')
    .eq('id', userId)
    .single()
  
  if (error) {
    console.error('[getUserBasicInfo] Failed to fetch user:', error.message)
    return { user: null, error: error.message }
  }
  
  return { 
    user: data ? {
      email: data.email,
      full_name: data.full_name || '',
      avatar_url: data.avatar_url || undefined
    } : null 
  }
}

export async function getFile(fileId: string) {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('files')
    .select(`
      *,
      checked_out_user:users!checked_out_by(email, full_name, avatar_url),
      created_by_user:users!created_by(email, full_name),
      updated_by_user:users!updated_by(email, full_name)
    `)
    .eq('id', fileId)
    .single()
  
  return { file: data, error }
}

export async function getFileByPath(orgId: string, filePath: string) {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('files')
    .select('*')
    .eq('org_id', orgId)
    .eq('file_path', filePath)
    .single()
  
  return { file: data, error }
}

// ============================================
// Files - Version History
// ============================================

export async function getFileVersions(fileId: string) {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('file_versions')
    .select(`
      *,
      created_by_user:users!created_by(email, full_name)
    `)
    .eq('file_id', fileId)
    .order('version', { ascending: false })
  
  return { versions: data, error }
}

// ============================================
// Files - References (Where-Used / BOM)
// ============================================

export async function getWhereUsed(fileId: string) {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('file_references')
    .select(`
      *,
      parent:files!parent_file_id(
        id, file_name, file_path, part_number, revision, state
      )
    `)
    .eq('child_file_id', fileId)
  
  return { references: data, error }
}

export async function getContains(fileId: string) {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('file_references')
    .select(`
      *,
      child:files!child_file_id(
        id, file_name, file_path, part_number, revision, state
      )
    `)
    .eq('parent_file_id', fileId)
  
  return { references: data, error }
}

// ============================================
// Checked Out Files (for current user)
// ============================================

export async function getMyCheckedOutFiles(userId: string) {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('files')
    .select('*')
    .eq('checked_out_by', userId)
    .order('checked_out_at', { ascending: false })
  
  return { files: data, error }
}

export async function getAllCheckedOutFiles(orgId: string) {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('files')
    .select(`
      *,
      checked_out_user:users!checked_out_by(email, full_name, avatar_url)
    `)
    .eq('org_id', orgId)
    .not('checked_out_by', 'is', null)
    .order('checked_out_at', { ascending: false })
  
  return { files: data, error }
}
