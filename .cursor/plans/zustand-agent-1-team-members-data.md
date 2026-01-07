# Agent 1: Team Members Data Slice

## Overview

Create a new `organizationDataSlice` to centralize team members management data. This integrates with the existing "Fix Member Dialogs with Zustand" plan and extends it to include the underlying data (teams, members, invites).

## Scope

| Feature | Source File | Current State | Target |
|---------|-------------|---------------|--------|
| Teams | `useTeams.ts` | `useState<TeamWithDetails[]>` | `organizationDataSlice.teams` |
| Members | `useMembers.ts` | `useState<OrgUser[]>` | `organizationDataSlice.members` |
| Pending Invites | `useInvites.ts` | `useState<PendingMember[]>` | `organizationDataSlice.pendingMembers` |
| Dialog State | `useUserDialogs.ts` | Local useState | Integrate with slice |

## Implementation Steps

### Step 1: Create the Slice File

**Create:** `src/stores/slices/organizationDataSlice.ts`

```typescript
import { StateCreator } from 'zustand'
import type { PDMStoreState, OrganizationDataSlice } from '../types'

export const createOrganizationDataSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  OrganizationDataSlice
> = (set, get) => ({
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
  
  // === Dialog State (from existing plan) ===
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
    members: [],
    membersLoaded: false,
    pendingMembers: [],
    pendingMembersLoaded: false,
    removingUser: null,
    isRemoving: false,
    editingTeamsUser: null,
  }),
})
```

### Step 2: Add Types to `src/stores/types.ts`

Add these type definitions:

```typescript
// Import types from team-members feature
import type { OrgUser, TeamWithDetails, PendingMember } from '../features/settings/organization/team-members/types'

export interface OrganizationDataSlice {
  // Teams
  teams: TeamWithDetails[]
  teamsLoading: boolean
  teamsLoaded: boolean
  setTeams: (teams: TeamWithDetails[]) => void
  setTeamsLoading: (loading: boolean) => void
  addTeam: (team: TeamWithDetails) => void
  updateTeam: (id: string, updates: Partial<TeamWithDetails>) => void
  removeTeam: (id: string) => void
  
  // Members
  members: OrgUser[]
  membersLoading: boolean
  membersLoaded: boolean
  setMembers: (members: OrgUser[]) => void
  setMembersLoading: (loading: boolean) => void
  addMember: (member: OrgUser) => void
  updateMember: (id: string, updates: Partial<OrgUser>) => void
  removeMember: (id: string) => void
  
  // Pending Members
  pendingMembers: PendingMember[]
  pendingMembersLoading: boolean
  pendingMembersLoaded: boolean
  setPendingMembers: (members: PendingMember[]) => void
  setPendingMembersLoading: (loading: boolean) => void
  addPendingMember: (member: PendingMember) => void
  updatePendingMember: (id: string, updates: Partial<PendingMember>) => void
  removePendingMember: (id: string) => void
  
  // Dialog state
  removingUser: OrgUser | null
  isRemoving: boolean
  editingTeamsUser: OrgUser | null
  setRemovingUser: (user: OrgUser | null) => void
  setIsRemoving: (v: boolean) => void
  setEditingTeamsUser: (user: OrgUser | null) => void
  
  // Reset
  clearOrganizationData: () => void
}
```

Add `OrganizationDataSlice` to the `PDMStoreState` intersection type.

### Step 3: Register in Store

**Update:** `src/stores/slices/index.ts` - export the new slice
**Update:** `src/stores/pdmStore.ts` - compose the new slice (NOT persisted - organizational data should be fetched fresh)

### Step 4: Update Hooks to Use Store

**Update:** `src/features/settings/organization/team-members/hooks/useTeams.ts`
- Replace `useState` with `usePDMStore` selectors
- Keep the fetch/mutation logic but update store instead of local state

**Update:** `src/features/settings/organization/team-members/hooks/useMembers.ts`
- Same pattern as useTeams

**Update:** `src/features/settings/organization/team-members/hooks/useInvites.ts`
- Same pattern

### Step 5: Update Components

**Update:** `src/features/settings/organization/TeamMembersSettings.tsx`
- Render dialogs from store state (as per existing plan)
- Use store selectors instead of hook state

**Update:** `src/features/settings/organization/team-members/components/user/ConnectedUserRow.tsx`
- Use store actions for dialog triggers

## Files to Modify

| File | Action |
|------|--------|
| `src/stores/slices/organizationDataSlice.ts` | **Create** |
| `src/stores/slices/index.ts` | Export new slice |
| `src/stores/types.ts` | Add types and merge into PDMStoreState |
| `src/stores/pdmStore.ts` | Compose new slice |
| `src/features/.../hooks/useTeams.ts` | Use store instead of useState |
| `src/features/.../hooks/useMembers.ts` | Use store instead of useState |
| `src/features/.../hooks/useInvites.ts` | Use store instead of useState |
| `src/features/.../TeamMembersSettings.tsx` | Use store selectors, render dialogs |
| `src/features/.../ConnectedUserRow.tsx` | Use store actions |

## Testing Checklist

- [ ] Teams load on settings page visit
- [ ] Teams persist when switching tabs within settings
- [ ] Member changes reflect immediately in UI
- [ ] Remove user dialog opens from ConnectedUserRow
- [ ] Edit teams modal opens and saves correctly
- [ ] Pending invites list updates on add/remove
- [ ] No console errors about undefined store values

## Report Generation

After completing this work, generate a report file at `.cursor/plans/zustand-agent-1-report.md` containing:
1. Summary of changes made
2. Files created/modified with brief descriptions
3. Any issues encountered and how they were resolved
4. Testing results
5. Dependencies on other agents' work (if any)
