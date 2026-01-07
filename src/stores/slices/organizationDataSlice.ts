/**
 * Organization Data Slice - Centralized state for team members management
 * 
 * This slice manages:
 * - Teams (list, loading state)
 * - Members (list, loading state)
 * - Pending Members (list, loading state)
 * - Dialog state for user removal and team editing
 * 
 * Note: This data is NOT persisted - organizational data should be fetched fresh.
 */
import { StateCreator } from 'zustand'
import type { PDMStoreState, OrganizationDataSlice } from '../types'

export const createOrganizationDataSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  OrganizationDataSlice
> = (set) => ({
  // === Teams State ===
  teams: [],
  teamsLoading: false,
  teamsLoaded: false,
  
  // === Members State ===
  members: [],
  membersLoading: false,
  membersLoaded: false,
  
  // === Pending Members State ===
  pendingMembers: [],
  pendingMembersLoading: false,
  pendingMembersLoaded: false,
  
  // === Dialog State ===
  removingUser: null,
  isRemoving: false,
  editingTeamsUser: null,
  
  // === Teams Actions ===
  setTeams: (teams) => set({ teams, teamsLoaded: true }),
  setTeamsLoading: (loading) => set({ teamsLoading: loading }),
  addTeam: (team) => set((state) => ({ teams: [...state.teams, team] })),
  updateTeam: (id, updates) => set((state) => ({
    teams: state.teams.map(t => t.id === id ? { ...t, ...updates } : t)
  })),
  removeTeam: (id) => set((state) => ({
    teams: state.teams.filter(t => t.id !== id)
  })),
  
  // === Members Actions ===
  setMembers: (members) => set({ members, membersLoaded: true }),
  setMembersLoading: (loading) => set({ membersLoading: loading }),
  addMember: (member) => set((state) => ({ members: [...state.members, member] })),
  updateMember: (id, updates) => set((state) => ({
    members: state.members.map(m => m.id === id ? { ...m, ...updates } : m)
  })),
  removeMember: (id) => set((state) => ({
    members: state.members.filter(m => m.id !== id)
  })),
  
  // === Pending Members Actions ===
  setPendingMembers: (pendingMembers) => set({ pendingMembers, pendingMembersLoaded: true }),
  setPendingMembersLoading: (loading) => set({ pendingMembersLoading: loading }),
  addPendingMember: (member) => set((state) => ({ 
    pendingMembers: [...state.pendingMembers, member] 
  })),
  updatePendingMember: (id, updates) => set((state) => ({
    pendingMembers: state.pendingMembers.map(m => m.id === id ? { ...m, ...updates } : m)
  })),
  removePendingMember: (id) => set((state) => ({
    pendingMembers: state.pendingMembers.filter(m => m.id !== id)
  })),
  
  // === Dialog Actions ===
  setRemovingUser: (user) => set({ removingUser: user }),
  setIsRemoving: (v) => set({ isRemoving: v }),
  setEditingTeamsUser: (user) => set({ editingTeamsUser: user }),
  
  // === Clear/Reset ===
  clearOrganizationData: () => set({
    teams: [],
    teamsLoaded: false,
    teamsLoading: false,
    members: [],
    membersLoaded: false,
    membersLoading: false,
    pendingMembers: [],
    pendingMembersLoaded: false,
    pendingMembersLoading: false,
    removingUser: null,
    isRemoving: false,
    editingTeamsUser: null,
  }),
})
