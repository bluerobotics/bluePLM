/**
 * usePendingMemberHandlers - Pending member/invite handler functions
 * 
 * Provides handlers for pending member updates and invite resending.
 */
import { useCallback } from 'react'
import type { PendingMember, PendingMemberFormData } from '../../types'

export interface UsePendingMemberHandlersParams {
  // Data hook methods
  hookUpdatePendingMember: (memberId: string, data: PendingMemberFormData) => Promise<boolean>
  hookResendInvite: (pm: PendingMember) => Promise<boolean>
  
  // Dialog state
  editingPendingMember: PendingMember | null
  setEditingPendingMember: (pm: PendingMember | null) => void
  pendingMemberForm: PendingMemberFormData
  setIsSavingPendingMember: (v: boolean) => void
  setResendingInviteId: (id: string | null) => void
}

export function usePendingMemberHandlers(params: UsePendingMemberHandlersParams) {
  const {
    hookUpdatePendingMember,
    hookResendInvite,
    editingPendingMember,
    setEditingPendingMember,
    pendingMemberForm,
    setIsSavingPendingMember,
    setResendingInviteId
  } = params

  const handleSavePendingMember = useCallback(async () => {
    if (!editingPendingMember) return
    
    setIsSavingPendingMember(true)
    try {
      const success = await hookUpdatePendingMember(editingPendingMember.id, pendingMemberForm)
      if (success) {
        setEditingPendingMember(null)
      }
    } finally {
      setIsSavingPendingMember(false)
    }
  }, [editingPendingMember, pendingMemberForm, hookUpdatePendingMember, setIsSavingPendingMember, setEditingPendingMember])

  const handleResendInvite = useCallback(async (pm: PendingMember) => {
    setResendingInviteId(pm.id)
    try {
      await hookResendInvite(pm)
    } finally {
      setResendingInviteId(null)
    }
  }, [hookResendInvite, setResendingInviteId])

  return {
    handleSavePendingMember,
    handleResendInvite
  }
}
