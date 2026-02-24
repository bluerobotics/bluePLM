import { getSupabaseClient } from './client'

export interface ShareLinkOptions {
  expiresInDays?: number
  maxDownloads?: number
  requireAuth?: boolean
}

function generateToken(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Create a shareable link for a file - generates actual signed URL from Supabase Storage
 */
export async function createShareLink(
  orgId: string,
  fileId: string,
  createdBy: string,
  options?: ShareLinkOptions
): Promise<{ link: { id: string; token: string; expiresAt: string | null; downloadUrl: string } | null; error?: string }> {
  const client = getSupabaseClient()
  
  const { data: fileData, error: fileError } = await client
    .from('files')
    .select('content_hash, file_name, org_id')
    .eq('id', fileId)
    .single()
  
  if (fileError || !fileData) {
    return { link: null, error: fileError?.message || 'File not found' }
  }
  
  if (!fileData.content_hash) {
    return { link: null, error: 'File has no content in storage' }
  }
  
  const expiresInSeconds = options?.expiresInDays 
    ? Math.min(options.expiresInDays * 24 * 60 * 60, 365 * 24 * 60 * 60)
    : 7 * 24 * 60 * 60
  
  const storagePath = `${fileData.org_id}/${fileData.content_hash.substring(0, 2)}/${fileData.content_hash}`
  
  const { data: signedUrlData, error: signedUrlError } = await client.storage
    .from('vault')
    .createSignedUrl(storagePath, expiresInSeconds, {
      download: fileData.file_name
    })
  
  if (signedUrlError || !signedUrlData?.signedUrl) {
    return { link: null, error: signedUrlError?.message || 'Failed to generate download URL' }
  }
  
  const token = generateToken(12)
  
  let expiresAt: string | null = null
  if (options?.expiresInDays) {
    const date = new Date()
    date.setDate(date.getDate() + options.expiresInDays)
    expiresAt = date.toISOString()
  } else {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    expiresAt = date.toISOString()
  }
  
  try {
    await client
      .from('file_share_links')
      .insert({
        org_id: orgId,
        file_id: fileId,
        token,
        created_by: createdBy,
        expires_at: expiresAt,
        max_downloads: options?.maxDownloads || null,
        require_auth: options?.requireAuth || false
      })
  } catch {
    // Don't fail if we can't track it - the signed URL still works
  }
  
  return { 
    link: { 
      id: token, 
      token, 
      expiresAt,
      downloadUrl: signedUrlData.signedUrl
    } 
  }
}

/**
 * Get share links for a file
 */
export async function getFileShareLinks(
  fileId: string
): Promise<{ links: any[]; error?: string }> {
  const client = getSupabaseClient()
  
  const { data, error } = await client
    .from('file_share_links')
    .select(`
      *,
      created_by_user:users!created_by(email, full_name)
    `)
    .eq('file_id', fileId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  
  if (error) {
    return { links: [], error: error.message }
  }
  
  return { links: data || [] }
}

/**
 * Revoke/deactivate a share link
 */
export async function revokeShareLink(
  linkId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient()
  
  const { error } = await client
    .from('file_share_links')
    .update({ is_active: false })
    .eq('id', linkId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

/**
 * Validate a share link token (for public access)
 */
export async function validateShareLink(
  token: string
): Promise<{ 
  valid: boolean
  fileId?: string
  orgId?: string
  requireAuth?: boolean
  error?: string 
}> {
  const client = getSupabaseClient()
  
  const { data, error } = await client
    .from('file_share_links')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single()
  
  if (error || !data) {
    return { valid: false, error: 'Link not found or invalid' }
  }
  
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, error: 'Link has expired' }
  }
  
  if (data.max_downloads && (data.download_count ?? 0) >= data.max_downloads) {
    return { valid: false, error: 'Download limit reached' }
  }
  
  return { 
    valid: true, 
    fileId: data.file_id, 
    orgId: data.org_id,
    requireAuth: data.require_auth ?? undefined
  }
}
