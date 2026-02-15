import { getSupabaseClient } from './client'
import { log } from '@/lib/logger'
import type { AnnotationType, AnnotationPosition, FileAnnotation } from '@/types/database'

// ============================================
// Annotations - CRUD Operations
// ============================================

// NOTE: The auto-generated Supabase types (supabase.ts) may not yet include the
// new file_comments columns (page_number, position, annotation_type, parent_id,
// resolved, resolved_by, resolved_at, file_version, edited_at). These columns
// are defined in the SQL schema but the generated types need `npm run gen:types`
// after the schema is applied. We use targeted type assertions (Record<string, unknown>)
// on insert/update payloads to work around this until types are regenerated.

/**
 * Raw row shape returned from the file_comments table with user join.
 * Used internally before transforming into the public FileAnnotation type.
 */
interface FileCommentRow {
  id: string
  file_id: string
  user_id: string
  comment: string
  page_number: number | null
  position: AnnotationPosition | null
  annotation_type: string | null
  parent_id: string | null
  resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  file_version: number | null
  edited_at: string | null
  created_at: string
  user: { email: string; full_name: string | null; avatar_url: string | null } | null
}

/**
 * Convert a raw database row into a typed FileAnnotation.
 */
function toFileAnnotation(row: FileCommentRow): FileAnnotation {
  return {
    id: row.id,
    file_id: row.file_id,
    user_id: row.user_id,
    comment: row.comment,
    page_number: row.page_number,
    position: row.position,
    annotation_type: (row.annotation_type ?? 'text') as AnnotationType,
    parent_id: row.parent_id,
    resolved: row.resolved,
    resolved_by: row.resolved_by,
    resolved_at: row.resolved_at,
    file_version: row.file_version,
    edited_at: row.edited_at,
    created_at: row.created_at,
    user: row.user ?? undefined,
    replies: [],
  }
}

/**
 * Organize a flat list of annotations into a threaded tree structure.
 * Top-level annotations (parent_id = null) become roots, and their
 * replies are nested under the `replies` property.
 *
 * @param flat - Flat array of FileAnnotation objects (all depths mixed)
 * @returns Array of top-level annotations with nested replies
 */
function buildThreadTree(flat: FileAnnotation[]): FileAnnotation[] {
  const lookup = new Map<string, FileAnnotation>()
  const roots: FileAnnotation[] = []

  // Index all annotations by ID
  for (const annotation of flat) {
    annotation.replies = []
    lookup.set(annotation.id, annotation)
  }

  // Build parent → children relationships
  for (const annotation of flat) {
    if (annotation.parent_id && lookup.has(annotation.parent_id)) {
      lookup.get(annotation.parent_id)!.replies!.push(annotation)
    } else {
      roots.push(annotation)
    }
  }

  return roots
}

// ============================================
// Read Operations
// ============================================

/**
 * Fetch all annotations for a file, structured as threaded conversations.
 *
 * Returns top-level annotations with nested `replies`. Each annotation
 * includes the authoring user's profile info (email, name, avatar).
 *
 * @param fileId - The file ID to fetch annotations for
 * @param version - Optional file version filter (only annotations from this version)
 * @returns Object with `annotations` array (threaded) and optional `error`
 */
export async function getFileAnnotations(
  fileId: string,
  version?: number
): Promise<{ annotations: FileAnnotation[]; error: string | null }> {
  const client = getSupabaseClient()

  // Type assertion needed: new columns not yet in auto-generated types (see note at top)
  let query = (client
    .from('file_comments') as any)
    .select(`
      id,
      file_id,
      user_id,
      comment,
      page_number,
      position,
      annotation_type,
      parent_id,
      resolved,
      resolved_by,
      resolved_at,
      file_version,
      edited_at,
      created_at,
      user:users!user_id(email, full_name, avatar_url)
    `)
    .eq('file_id', fileId)
    .order('created_at', { ascending: true })

  if (version !== undefined) {
    query = query.eq('file_version', version)
  }

  const { data, error } = await query

  if (error) {
    log.error('[Annotations]', 'Failed to fetch annotations', { error: error.message, fileId })
    return { annotations: [], error: error.message }
  }

  const rows = (data ?? []) as unknown as FileCommentRow[]
  const flat = rows.map(toFileAnnotation)
  const threaded = buildThreadTree(flat)

  return { annotations: threaded, error: null }
}

/**
 * Get the count of unresolved annotations for a file.
 * Useful for badge display on file cards / tabs.
 *
 * Only counts top-level annotations (not replies) to avoid inflated numbers.
 *
 * @param fileId - The file ID to count annotations for
 * @returns Object with `count` number and optional `error`
 */
export async function getAnnotationCount(
  fileId: string
): Promise<{ count: number; error: string | null }> {
  const client = getSupabaseClient()

  // Type assertion needed: resolved/parent_id not yet in auto-generated types (see note at top)
  const { count, error } = await (client
    .from('file_comments') as any)
    .select('id', { count: 'exact', head: true })
    .eq('file_id', fileId)
    .eq('resolved', false)
    .is('parent_id', null)

  if (error) {
    log.error('[Annotations]', 'Failed to count annotations', { error: error.message, fileId })
    return { count: 0, error: error.message }
  }

  return { count: count ?? 0, error: null }
}

// ============================================
// Write Operations
// ============================================

/** Parameters for creating a new annotation */
export interface CreateAnnotationParams {
  fileId: string
  userId: string
  comment: string
  pageNumber?: number | null
  position?: AnnotationPosition | null
  annotationType: AnnotationType
  parentId?: string | null
  fileVersion?: number | null
}

/**
 * Create a new annotation (comment) on a file.
 *
 * Supports file-level comments, page-level text comments, area highlights,
 * and threaded replies (via parentId).
 *
 * @param params - Annotation creation parameters
 * @returns Object with the created `annotation` and optional `error`
 */
export async function createAnnotation(
  params: CreateAnnotationParams
): Promise<{ annotation: FileAnnotation | null; error: string | null }> {
  const client = getSupabaseClient()

  // Type assertion needed: new columns not yet in auto-generated types (see note at top)
  const insertPayload: Record<string, unknown> = {
    file_id: params.fileId,
    user_id: params.userId,
    comment: params.comment,
    page_number: params.pageNumber ?? null,
    position: params.position ?? null,
    annotation_type: params.annotationType,
    parent_id: params.parentId ?? null,
    file_version: params.fileVersion ?? null,
  }

  const { data, error } = await (client
    .from('file_comments') as any)
    .insert(insertPayload)
    .select(`
      id,
      file_id,
      user_id,
      comment,
      page_number,
      position,
      annotation_type,
      parent_id,
      resolved,
      resolved_by,
      resolved_at,
      file_version,
      edited_at,
      created_at,
      user:users!user_id(email, full_name, avatar_url)
    `)
    .single()

  if (error) {
    log.error('[Annotations]', 'Failed to create annotation', {
      error: error.message,
      fileId: params.fileId,
    })
    return { annotation: null, error: error.message }
  }

  const row = data as unknown as FileCommentRow
  return { annotation: toFileAnnotation(row), error: null }
}

/**
 * Update the comment text of an existing annotation.
 * Sets the `edited_at` timestamp to track that the comment was modified.
 *
 * @param annotationId - The annotation ID to update
 * @param comment - New comment text
 * @returns Object with the updated `annotation` and optional `error`
 */
export async function updateAnnotation(
  annotationId: string,
  comment: string
): Promise<{ annotation: FileAnnotation | null; error: string | null }> {
  const client = getSupabaseClient()

  // Type assertion needed: edited_at not yet in auto-generated types (see note at top)
  const updatePayload: Record<string, unknown> = {
    comment,
    edited_at: new Date().toISOString(),
  }

  const { data, error } = await (client
    .from('file_comments') as any)
    .update(updatePayload)
    .eq('id', annotationId)
    .select(`
      id,
      file_id,
      user_id,
      comment,
      page_number,
      position,
      annotation_type,
      parent_id,
      resolved,
      resolved_by,
      resolved_at,
      file_version,
      edited_at,
      created_at,
      user:users!user_id(email, full_name, avatar_url)
    `)
    .single()

  if (error) {
    log.error('[Annotations]', 'Failed to update annotation', {
      error: error.message,
      annotationId,
    })
    return { annotation: null, error: error.message }
  }

  const row = data as unknown as FileCommentRow
  return { annotation: toFileAnnotation(row), error: null }
}

/**
 * Delete an annotation by ID.
 * Cascades to all threaded replies via the foreign key constraint.
 *
 * @param annotationId - The annotation ID to delete
 * @returns Object with `success` boolean and optional `error`
 */
export async function deleteAnnotation(
  annotationId: string
): Promise<{ success: boolean; error: string | null }> {
  const client = getSupabaseClient()

  const { error } = await client
    .from('file_comments')
    .delete()
    .eq('id', annotationId)

  if (error) {
    log.error('[Annotations]', 'Failed to delete annotation', {
      error: error.message,
      annotationId,
    })
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

// ============================================
// Resolve / Unresolve Operations
// ============================================

/**
 * Mark an annotation as resolved.
 * Sets the `resolved`, `resolved_by`, and `resolved_at` fields.
 *
 * @param annotationId - The annotation ID to resolve
 * @param userId - The user ID of the person resolving
 * @returns Object with the updated `annotation` and optional `error`
 */
export async function resolveAnnotation(
  annotationId: string,
  userId: string
): Promise<{ annotation: FileAnnotation | null; error: string | null }> {
  const client = getSupabaseClient()

  // Type assertion needed: resolve columns not yet in auto-generated types (see note at top)
  const resolvePayload: Record<string, unknown> = {
    resolved: true,
    resolved_by: userId,
    resolved_at: new Date().toISOString(),
  }

  const { data, error } = await (client
    .from('file_comments') as any)
    .update(resolvePayload)
    .eq('id', annotationId)
    .select(`
      id,
      file_id,
      user_id,
      comment,
      page_number,
      position,
      annotation_type,
      parent_id,
      resolved,
      resolved_by,
      resolved_at,
      file_version,
      edited_at,
      created_at,
      user:users!user_id(email, full_name, avatar_url)
    `)
    .single()

  if (error) {
    log.error('[Annotations]', 'Failed to resolve annotation', {
      error: error.message,
      annotationId,
    })
    return { annotation: null, error: error.message }
  }

  const row = data as unknown as FileCommentRow
  return { annotation: toFileAnnotation(row), error: null }
}

/**
 * Remove the resolved status from an annotation.
 * Clears the `resolved`, `resolved_by`, and `resolved_at` fields.
 *
 * @param annotationId - The annotation ID to unresolve
 * @returns Object with the updated `annotation` and optional `error`
 */
export async function unresolveAnnotation(
  annotationId: string
): Promise<{ annotation: FileAnnotation | null; error: string | null }> {
  const client = getSupabaseClient()

  // Type assertion needed: resolve columns not yet in auto-generated types (see note at top)
  const unresolvePayload: Record<string, unknown> = {
    resolved: false,
    resolved_by: null,
    resolved_at: null,
  }

  const { data, error } = await (client
    .from('file_comments') as any)
    .update(unresolvePayload)
    .eq('id', annotationId)
    .select(`
      id,
      file_id,
      user_id,
      comment,
      page_number,
      position,
      annotation_type,
      parent_id,
      resolved,
      resolved_by,
      resolved_at,
      file_version,
      edited_at,
      created_at,
      user:users!user_id(email, full_name, avatar_url)
    `)
    .single()

  if (error) {
    log.error('[Annotations]', 'Failed to unresolve annotation', {
      error: error.message,
      annotationId,
    })
    return { annotation: null, error: error.message }
  }

  const row = data as unknown as FileCommentRow
  return { annotation: toFileAnnotation(row), error: null }
}
