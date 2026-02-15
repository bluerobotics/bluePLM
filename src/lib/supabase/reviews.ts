/**
 * Review trigger helpers for workflow-based review requests.
 *
 * Provides:
 *  - checkReviewTrigger: checks whether a workflow state should auto-open a review request
 *  - getOrgTeamsWithMembers: fetches teams with full member info for the enhanced ReviewRequestModal
 */

import { getSupabaseClient } from './client'

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
