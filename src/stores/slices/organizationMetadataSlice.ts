/**
 * Organization Metadata Slice
 * 
 * Manages organization-level metadata including:
 * - Job titles (user job assignments)
 * - Workflow roles (user role assignments)
 * - Vault access mappings (user and team access)
 * 
 * This data is NOT persisted to localStorage - it's fetched fresh each session.
 * 
 * @module stores/slices/organizationMetadataSlice
 */
import { StateCreator } from 'zustand'
import type { 
  PDMStoreState, 
  OrganizationMetadataSlice,
  JobTitle,
  WorkflowRoleBasic,
  OrgVault
} from '../types'

export const createOrganizationMetadataSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  OrganizationMetadataSlice
> = (set) => ({
  // ═══════════════════════════════════════════════════════════════════════════
  // Job Titles - Initial State
  // ═══════════════════════════════════════════════════════════════════════════
  jobTitles: [],
  jobTitlesLoading: false,
  jobTitlesLoaded: false,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Job Titles - Actions
  // ═══════════════════════════════════════════════════════════════════════════
  setJobTitles: (titles: JobTitle[]) => set({ 
    jobTitles: titles, 
    jobTitlesLoaded: true,
    jobTitlesLoading: false 
  }),
  
  setJobTitlesLoading: (loading: boolean) => set({ jobTitlesLoading: loading }),
  
  addJobTitle: (title: JobTitle) => set((state) => ({
    jobTitles: [...state.jobTitles, title]
  })),
  
  updateJobTitleInStore: (id: string, updates: Partial<JobTitle>) => set((state) => ({
    jobTitles: state.jobTitles.map(t => 
      t.id === id ? { ...t, ...updates } : t
    )
  })),
  
  removeJobTitle: (id: string) => set((state) => ({
    jobTitles: state.jobTitles.filter(t => t.id !== id)
  })),
  
  clearJobTitles: () => set({ 
    jobTitles: [], 
    jobTitlesLoaded: false,
    jobTitlesLoading: false 
  }),
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Workflow Roles - Initial State
  // ═══════════════════════════════════════════════════════════════════════════
  workflowRoles: [],
  workflowRolesLoading: false,
  workflowRolesLoaded: false,
  userRoleAssignments: {},
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Workflow Roles - Actions
  // ═══════════════════════════════════════════════════════════════════════════
  setWorkflowRoles: (roles: WorkflowRoleBasic[]) => set({ 
    workflowRoles: roles,
    workflowRolesLoaded: true,
    workflowRolesLoading: false
  }),
  
  setWorkflowRolesLoading: (loading: boolean) => set({ workflowRolesLoading: loading }),
  
  setUserRoleAssignments: (assignments: Record<string, string[]>) => set({ 
    userRoleAssignments: assignments 
  }),
  
  addWorkflowRole: (role: WorkflowRoleBasic) => set((state) => ({
    workflowRoles: [...state.workflowRoles, role]
  })),
  
  updateWorkflowRoleInStore: (id: string, updates: Partial<WorkflowRoleBasic>) => set((state) => ({
    workflowRoles: state.workflowRoles.map(r => 
      r.id === id ? { ...r, ...updates } : r
    )
  })),
  
  removeWorkflowRole: (id: string) => set((state) => ({
    workflowRoles: state.workflowRoles.filter(r => r.id !== id),
    // Also remove this role from all user assignments
    userRoleAssignments: Object.fromEntries(
      Object.entries(state.userRoleAssignments).map(([userId, roleIds]) => [
        userId,
        roleIds.filter(roleId => roleId !== id)
      ])
    )
  })),
  
  assignUserRole: (userId: string, roleId: string) => set((state) => {
    const currentRoles = state.userRoleAssignments[userId] || []
    if (currentRoles.includes(roleId)) return state
    
    return {
      userRoleAssignments: {
        ...state.userRoleAssignments,
        [userId]: [...currentRoles, roleId]
      }
    }
  }),
  
  unassignUserRole: (userId: string, roleId: string) => set((state) => {
    const currentRoles = state.userRoleAssignments[userId] || []
    
    return {
      userRoleAssignments: {
        ...state.userRoleAssignments,
        [userId]: currentRoles.filter(id => id !== roleId)
      }
    }
  }),
  
  clearWorkflowRoles: () => set({ 
    workflowRoles: [],
    workflowRolesLoaded: false,
    workflowRolesLoading: false,
    userRoleAssignments: {}
  }),
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Vault Access - Initial State
  // ═══════════════════════════════════════════════════════════════════════════
  orgVaults: [],
  orgVaultsLoading: false,
  orgVaultsLoaded: false,
  vaultAccessMap: {},
  teamVaultAccessMap: {},
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Vault Access - Actions
  // ═══════════════════════════════════════════════════════════════════════════
  setOrgVaults: (vaults: OrgVault[]) => set({ 
    orgVaults: vaults,
    orgVaultsLoaded: true,
    orgVaultsLoading: false
  }),
  
  setOrgVaultsLoading: (loading: boolean) => set({ orgVaultsLoading: loading }),
  
  setVaultAccessMap: (map: Record<string, string[]>) => set({ 
    vaultAccessMap: map 
  }),
  
  setTeamVaultAccessMap: (map: Record<string, string[]>) => set({ 
    teamVaultAccessMap: map 
  }),
  
  grantUserVaultAccess: (userId: string, vaultId: string) => set((state) => {
    const currentUsers = state.vaultAccessMap[vaultId] || []
    if (currentUsers.includes(userId)) return state
    
    return {
      vaultAccessMap: {
        ...state.vaultAccessMap,
        [vaultId]: [...currentUsers, userId]
      }
    }
  }),
  
  revokeUserVaultAccess: (userId: string, vaultId: string) => set((state) => {
    const currentUsers = state.vaultAccessMap[vaultId] || []
    
    return {
      vaultAccessMap: {
        ...state.vaultAccessMap,
        [vaultId]: currentUsers.filter(id => id !== userId)
      }
    }
  }),
  
  grantTeamVaultAccess: (teamId: string, vaultId: string) => set((state) => {
    const currentVaults = state.teamVaultAccessMap[teamId] || []
    if (currentVaults.includes(vaultId)) return state
    
    return {
      teamVaultAccessMap: {
        ...state.teamVaultAccessMap,
        [teamId]: [...currentVaults, vaultId]
      }
    }
  }),
  
  revokeTeamVaultAccess: (teamId: string, vaultId: string) => set((state) => {
    const currentVaults = state.teamVaultAccessMap[teamId] || []
    
    return {
      teamVaultAccessMap: {
        ...state.teamVaultAccessMap,
        [teamId]: currentVaults.filter(id => id !== vaultId)
      }
    }
  }),
  
  clearOrgVaults: () => set({ 
    orgVaults: [],
    orgVaultsLoaded: false,
    orgVaultsLoading: false,
    vaultAccessMap: {},
    teamVaultAccessMap: {}
  }),
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Bulk Clear - for organization switch
  // ═══════════════════════════════════════════════════════════════════════════
  clearOrganizationMetadata: () => set({
    // Job titles
    jobTitles: [],
    jobTitlesLoading: false,
    jobTitlesLoaded: false,
    // Workflow roles
    workflowRoles: [],
    workflowRolesLoading: false,
    workflowRolesLoaded: false,
    userRoleAssignments: {},
    // Vault access
    orgVaults: [],
    orgVaultsLoading: false,
    orgVaultsLoaded: false,
    vaultAccessMap: {},
    teamVaultAccessMap: {}
  })
})
