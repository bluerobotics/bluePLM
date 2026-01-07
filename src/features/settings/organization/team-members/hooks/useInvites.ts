/**
 * useInvites - Hook for managing pending organization member invitations
 * 
 * Provides state and operations for pending invites including:
 * - Loading pending members awaiting signup
 * - Updating pending member details (teams, roles, vaults)
 * - Deleting pending members
 * - Resending invitation emails
 * 
 * State is stored in the Zustand organizationDataSlice.
 */
import { useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { PendingMember, PendingMemberFormData } from '../types'
import { castQueryResult, updatePendingOrgMember } from './supabaseHelpers'

export function useInvites(orgId: string | null) {
  const { 
    user, 
    addToast, 
    apiServerUrl,
    // Pending members state from organizationDataSlice
    pendingMembers,
    pendingMembersLoading: isLoading,
    pendingMembersLoaded,
    setPendingMembers,
    setPendingMembersLoading,
    removePendingMember: removePendingMemberFromStore
  } = usePDMStore()

  const loadPendingMembers = useCallback(async () => {
    if (!orgId) return
    
    setPendingMembersLoading(true)
    try {
      const { data, error } = await supabase
        .from('pending_org_members')
        .select('*')
        .eq('org_id', orgId)
        .is('claimed_at', null)
        .order('invited_at', { ascending: false })
      
      if (error) throw error
      
      // Cast to our PendingMember type
      setPendingMembers(castQueryResult<PendingMember[]>(data || []))
    } catch (err) {
      console.error('Failed to load pending members:', err)
    } finally {
      setPendingMembersLoading(false)
    }
  }, [orgId, setPendingMembers, setPendingMembersLoading])

  const updatePendingMember = useCallback(async (
    memberId: string,
    formData: PendingMemberFormData
  ): Promise<boolean> => {
    const member = pendingMembers.find(m => m.id === memberId)
    if (!member) return false
    
    try {
      const { error } = await updatePendingOrgMember(memberId, {
        full_name: formData.full_name || null,
        team_ids: formData.team_ids,
        workflow_role_ids: formData.workflow_role_ids,
        vault_ids: formData.vault_ids
      })
      
      if (error) throw error
      
      addToast('success', `Updated pending member ${member.email}`)
      await loadPendingMembers()
      return true
    } catch (err) {
      console.error('Failed to update pending member:', err)
      addToast('error', 'Failed to update pending member')
      return false
    }
  }, [pendingMembers, addToast, loadPendingMembers])

  const deletePendingMember = useCallback(async (memberId: string): Promise<boolean> => {
    const member = pendingMembers.find(m => m.id === memberId)
    if (!member) return false
    
    try {
      const { error } = await supabase
        .from('pending_org_members')
        .delete()
        .eq('id', memberId)
      
      if (error) throw error
      
      addToast('success', `Removed pending member ${member.email}`)
      removePendingMemberFromStore(memberId)
      return true
    } catch {
      addToast('error', 'Failed to remove pending member')
      return false
    }
  }, [pendingMembers, addToast, removePendingMemberFromStore])

  const resendInvite = useCallback(async (member: PendingMember): Promise<boolean> => {
    if (!apiServerUrl || !user) {
      addToast('error', 'API server not configured - cannot send invite emails')
      return false
    }
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        addToast('error', 'Session expired, please log in again')
        return false
      }
      
      const response = await fetch(`${apiServerUrl}/auth/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          email: member.email,
          full_name: member.full_name || undefined,
          team_ids: member.team_ids?.length > 0 ? member.team_ids : undefined,
          vault_ids: member.vault_ids?.length > 0 ? member.vault_ids : undefined,
          workflow_role_ids: member.workflow_role_ids?.length > 0 ? member.workflow_role_ids : undefined,
          resend: true
        })
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to resend invite')
      }
      
      addToast('success', `Invite email resent to ${member.email}`)
      return true
    } catch (err) {
      console.error('Failed to resend invite:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to resend invite email'
      addToast('error', errorMessage)
      return false
    }
  }, [apiServerUrl, user, addToast])

  // Initial load - only if not already loaded
  useEffect(() => {
    if (orgId && !pendingMembersLoaded && !isLoading) {
      loadPendingMembers()
    }
  }, [orgId, pendingMembersLoaded, isLoading, loadPendingMembers])

  return {
    pendingMembers,
    isLoading,
    loadPendingMembers,
    updatePendingMember,
    deletePendingMember,
    resendInvite
  }
}
