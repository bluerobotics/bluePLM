// Utility functions for TeamMembersSettings components

import type { PendingMember, OrgUser, TeamWithDetails, WorkflowRoleBasic } from './types'

/**
 * Format relative time for last online status
 */
export function formatLastOnline(dateStr: string | null): string | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return 'Online now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Convert a pending member to an OrgUser-like object for permissions modals
 * 
 * @param pm - The pending member to convert
 * @param teams - All teams in the organization
 * @param workflowRoles - All workflow roles in the organization
 * @returns An OrgUser object with team and role details populated
 */
export function pendingMemberToOrgUser(
  pm: PendingMember,
  teams: TeamWithDetails[],
  workflowRoles: WorkflowRoleBasic[]
): OrgUser {
  // Get team details for the pending member's teams
  const memberTeams = teams
    .filter(t => pm.team_ids.includes(t.id))
    .map(t => ({ id: t.id, name: t.name, color: t.color, icon: t.icon }))
  
  // Get workflow role details
  const memberWorkflowRoles = workflowRoles
    .filter(r => pm.workflow_role_ids.includes(r.id))
    .map(r => ({ id: r.id, name: r.name, color: r.color, icon: r.icon }))
  
  return {
    id: pm.id,
    email: pm.email,
    full_name: pm.full_name,
    role: pm.role,
    avatar_url: null,
    custom_avatar_url: null,
    last_sign_in: null,
    last_online: null,
    teams: memberTeams,
    workflow_roles: memberWorkflowRoles,
    job_title: null
  }
}

/**
 * Get vault access count for a pending member (based on their teams)
 * 
 * @param pm - The pending member
 * @param teamVaultAccessMap - Map of team ID to vault IDs they have access to
 * @returns Number of vaults the user will have access to (0 = unrestricted access)
 */
export function getPendingMemberVaultAccessCount(
  pm: PendingMember,
  teamVaultAccessMap: Record<string, string[]>
): number {
  // If explicit vault restrictions, use those
  if (pm.vault_ids && pm.vault_ids.length > 0) {
    return pm.vault_ids.length
  }
  
  // Otherwise check team vault access
  const teamVaultIds = new Set<string>()
  let hasUnrestrictedTeam = false
  
  for (const teamId of pm.team_ids) {
    const teamVaults = teamVaultAccessMap[teamId]
    if (!teamVaults || teamVaults.length === 0) {
      // Team has no restrictions = access to all vaults
      hasUnrestrictedTeam = true
    } else {
      teamVaults.forEach(v => teamVaultIds.add(v))
    }
  }
  
  // If any team has no restrictions, user has access to all
  if (hasUnrestrictedTeam) return 0
  
  return teamVaultIds.size
}
