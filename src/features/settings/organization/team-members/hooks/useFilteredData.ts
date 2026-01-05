/**
 * useFilteredData - Computed/filtered data for team members settings
 * 
 * Provides memoized computed values for:
 * - Assigned/unassigned users
 * - Filtered lists based on search query
 * 
 * @example
 * ```tsx
 * const { filteredAllUsers, filteredTeams, unassignedUsers } = useFilteredData({
 *   orgUsers,
 *   teams,
 *   searchQuery
 * })
 * ```
 */
import { useMemo } from 'react'
import type { OrgUser, TeamWithDetails } from '../types'

export interface UseFilteredDataParams {
  orgUsers: OrgUser[]
  teams: TeamWithDetails[]
  searchQuery: string
}

export interface UseFilteredDataReturn {
  /** Users not assigned to any team */
  unassignedUsers: OrgUser[]
  /** Users assigned to at least one team */
  assignedUsers: OrgUser[]
  /** Unassigned users filtered by search query */
  filteredUnassignedUsers: OrgUser[]
  /** Teams filtered by search query */
  filteredTeams: TeamWithDetails[]
  /** All users filtered by search query */
  filteredAllUsers: OrgUser[]
}

export function useFilteredData({
  orgUsers,
  teams,
  searchQuery
}: UseFilteredDataParams): UseFilteredDataReturn {
  // Users not in any team
  const unassignedUsers = useMemo(() => {
    return orgUsers.filter(u => !u.teams || u.teams.length === 0)
  }, [orgUsers])
  
  // Users in teams
  const assignedUsers = useMemo(() => {
    return orgUsers.filter(u => u.teams && u.teams.length > 0)
  }, [orgUsers])
  
  // Filter unassigned by search
  const filteredUnassignedUsers = useMemo(() => {
    if (!searchQuery) return unassignedUsers
    const q = searchQuery.toLowerCase()
    return unassignedUsers.filter(u =>
      u.full_name?.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  }, [unassignedUsers, searchQuery])
  
  // Filter teams by search
  const filteredTeams = useMemo(() => {
    if (!searchQuery) return teams
    const q = searchQuery.toLowerCase()
    return teams.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    )
  }, [teams, searchQuery])
  
  // Filter all users for the "users" tab
  const filteredAllUsers = useMemo(() => {
    if (!searchQuery) return orgUsers
    const q = searchQuery.toLowerCase()
    return orgUsers.filter(u =>
      u.full_name?.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.job_title?.name?.toLowerCase().includes(q)
    )
  }, [orgUsers, searchQuery])
  
  return {
    unassignedUsers,
    assignedUsers,
    filteredUnassignedUsers,
    filteredTeams,
    filteredAllUsers
  }
}
