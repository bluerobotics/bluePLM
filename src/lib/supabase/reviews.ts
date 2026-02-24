/**
 * Review helpers: CRUD operations, workflow triggers, and team fetching.
 */

import { getSupabaseClient } from './client'
import type { Review, ReviewStatus } from '../../types/database'

// ============================================
// Review CRUD
// ============================================

/**
 * Create a review request for a file
 */
export async function createReviewRequest(
  orgId: string,
  fileId: string,
  vaultId: string | null,
  requestedBy: string,
  reviewerIds: string[],
  fileVersion: number,
  title?: string,
  message?: string,
  dueDate?: string,
  priority?: 'low' | 'normal' | 'high' | 'urgent'
): Promise<{ review: Review | null; error?: string }> {
  const client = getSupabaseClient()
  
  // Create the review
  const { data: review, error: reviewError } = await client
    .from('reviews')
    .insert({
      org_id: orgId,
      file_id: fileId,
      vault_id: vaultId,
      requested_by: requestedBy,
      title: title || null,
      due_date: dueDate || null,
      priority: priority || 'normal',
      message: message || null,
      file_version: fileVersion,
      status: 'pending'
    })
    .select()
    .single()
  
  if (reviewError) {
    return { review: null, error: reviewError.message }
  }
  
  // Create review_responses for each reviewer
  const responses = reviewerIds.map(reviewerId => ({
    review_id: review.id,
    reviewer_id: reviewerId,
    status: 'pending' as ReviewStatus
  }))
  
  await client.from('review_responses').insert(responses)
  
  return { review: review as Review }
}

/**
 * Get reviews requested by a user
 */
export async function getMyReviews(
  userId: string,
  _orgId?: string,
  options?: {
    status?: ReviewStatus[]
    limit?: number
    asRequester?: boolean
    asReviewer?: boolean
  }
): Promise<{ reviews: any[]; error?: string }> {
  const client = getSupabaseClient()
  
  let query = client
    .from('reviews')
    .select(`
      *,
      file:files(id, file_name, file_path, extension, version, part_number, description, revision),
      requester:users!requested_by(email, full_name, avatar_url),
      responses:review_responses(
        id,
        reviewer_id,
        status,
        comment,
        responded_at,
        reviewer:users!reviewer_id(id, email, full_name, avatar_url)
      )
    `)
    .eq('requested_by', userId)
    .order('created_at', { ascending: false })
  
  if (options?.status && options.status.length > 0) {
    query = query.in('status', options.status)
  }
  
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  
  const { data, error } = await query
  
  if (error) {
    return { reviews: [], error: error.message }
  }
  
  return { reviews: data || [] }
}

/**
 * Get pending reviews for a user (reviews they need to respond to)
 */
export async function getPendingReviewsForUser(
  userId: string,
  _orgId?: string
): Promise<{ reviews: any[]; error?: string }> {
  const client = getSupabaseClient()
  
  const { data, error } = await client
    .from('review_responses')
    .select(`
      id,
      status,
      review:reviews!inner(
        id,
        title,
        message,
        priority,
        due_date,
        file_version,
        created_at,
        requested_by,
        status,
        file:files(id, file_name, file_path, extension, part_number, description, revision),
        requester:users!requested_by(email, full_name, avatar_url),
        responses:review_responses(
          id,
          reviewer_id,
          status,
          comment,
          responded_at,
          reviewer:users!reviewer_id(id, email, full_name, avatar_url)
        )
      )
    `)
    .eq('reviewer_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  
  if (error) {
    return { reviews: [], error: error.message }
  }
  
  return { reviews: data || [] }
}

/**
 * Respond to a review request
 */
export async function respondToReview(
  reviewResponseId: string,
  reviewerId: string,
  status: 'approved' | 'rejected',
  comment?: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient()
  
  const { data: response, error: updateError } = await client
    .from('review_responses')
    .update({
      status,
      comment: comment || null,
      responded_at: new Date().toISOString()
    })
    .eq('id', reviewResponseId)
    .eq('reviewer_id', reviewerId)
    .select('review_id')
    .single()
  
  if (updateError) {
    return { success: false, error: updateError.message }
  }
  
  if (response?.review_id) {
    const reviewId = response.review_id
    
    const { data: allResponses, error: responsesError } = await client
      .from('review_responses')
      .select('status')
      .eq('review_id', reviewId)
    
    if (!responsesError && allResponses) {
      const allResponded = allResponses.every(r => r.status !== 'pending')
      
      if (allResponded) {
        const anyRejected = allResponses.some(r => r.status === 'rejected')
        
        await client
          .from('reviews')
          .update({
            status: anyRejected ? 'rejected' : 'approved',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', reviewId)
      }
    }
  }
  
  return { success: true }
}

/**
 * Cancel a review request
 */
export async function cancelReview(
  reviewId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient()
  
  const { data: review, error: fetchError } = await client
    .from('reviews')
    .select('requested_by')
    .eq('id', reviewId)
    .single()
  
  if (fetchError || !review) {
    return { success: false, error: 'Review not found' }
  }
  
  if (review.requested_by !== userId) {
    return { success: false, error: 'Only the requester can cancel a review' }
  }
  
  const { error } = await client
    .from('reviews')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', reviewId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true }
}

// ============================================
// Workflow review trigger
// ============================================

/**
 * Check if a workflow state has `triggers_review` enabled.
 *
 * @param workflowStateId - UUID of the workflow state to check
 * @returns true when the state should automatically prompt for a review request
 */
export async function checkReviewTrigger(
  workflowStateId: string
): Promise<boolean> {
  const client = getSupabaseClient()

  const { data, error } = await client
    .from('workflow_states')
    .select('triggers_review')
    .eq('id', workflowStateId)
    .single()

  if (error || !data) {
    return false
  }

  return data.triggers_review === true
}

// ============================================
// Team member types
// ============================================

export interface TeamMember {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
}

export interface TeamWithMembers {
  id: string
  name: string
  color: string
  icon: string
  description: string | null
  members: TeamMember[]
}

// ============================================
// Teams with members (for review modal)
// ============================================

/**
 * Fetch all teams in an organization together with their member details.
 *
 * This is used by the enhanced ReviewRequestModal so users can select
 * entire teams as reviewers.
 *
 * @param orgId - The organization UUID
 * @returns An array of teams, each including their full member list
 */
export async function getOrgTeamsWithMembers(
  orgId: string
): Promise<{ teams: TeamWithMembers[]; error?: string }> {
  const client = getSupabaseClient()

  const { data, error } = await client
    .from('teams')
    .select(`
      id,
      name,
      color,
      icon,
      description,
      team_members(
        user:users(id, email, full_name, avatar_url)
      )
    `)
    .eq('org_id', orgId)
    .order('name')

  if (error) {
    console.error('[getOrgTeamsWithMembers] Supabase query failed:', error.message, error.details, error.hint)
    return { teams: [], error: error.message }
  }

  const teams: TeamWithMembers[] = (data || []).map((team) => {
    // Extract user objects from the nested team_members join
    const members: TeamMember[] = ((team as Record<string, unknown>).team_members as Array<{ user: TeamMember | null }> || [])
      .map((tm) => tm.user)
      .filter((u): u is TeamMember => u !== null)

    return {
      id: team.id as string,
      name: team.name as string,
      color: team.color as string,
      icon: team.icon as string,
      description: (team as Record<string, unknown>).description as string | null,
      members,
    }
  })

  return { teams }
}
