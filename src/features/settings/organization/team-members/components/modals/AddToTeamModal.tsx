/**
 * AddToTeamModal - Quick add a user to a team
 * 
 * Shows a list of available teams and allows quickly adding
 * a user to one of them.
 * 
 * @module team-members/AddToTeamModal
 */

// @ts-nocheck - Supabase type inference issues with Database generics
import * as LucideIcons from 'lucide-react'
import { Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { OrgUser, TeamWithDetails } from '../../types'

export interface AddToTeamModalProps {
  user: OrgUser
  teams: TeamWithDetails[]
  currentUserId?: string
  onClose: () => void
  onSuccess: () => void
}

export function AddToTeamModal({
  user: targetUser,
  teams,
  currentUserId,
  onClose,
  onSuccess
}: AddToTeamModalProps) {
  const { addToast } = usePDMStore()

  const handleAddToTeam = async (team: TeamWithDetails) => {
    try {
      await supabase.from('team_members').insert({
        team_id: team.id,
        user_id: targetUser.id,
        added_by: currentUserId
      })
      addToast('success', `Added ${targetUser.full_name || targetUser.email} to ${team.name}`)
      onSuccess()
      onClose()
    } catch (err) {
      addToast('error', 'Failed to add user to team')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-plm-fg mb-2">Add to Team</h3>
        <p className="text-sm text-plm-fg-muted mb-4">
          Select a team for <strong>{targetUser.full_name || targetUser.email}</strong>
        </p>
        
        {teams.length === 0 ? (
          <div className="text-center py-4 text-sm text-plm-fg-muted bg-plm-bg rounded-lg border border-plm-border">
            No teams available. Create a team first.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {teams.map(team => {
              const TeamIcon = (LucideIcons as any)[team.icon] || Users
              return (
                <button
                  key={team.id}
                  onClick={() => handleAddToTeam(team)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-plm-bg border border-plm-border hover:border-plm-accent hover:bg-plm-highlight transition-colors text-left"
                >
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${team.color}15`, color: team.color }}
                  >
                    <TeamIcon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-plm-fg truncate">{team.name}</div>
                    {team.description && (
                      <div className="text-xs text-plm-fg-muted truncate">{team.description}</div>
                    )}
                  </div>
                  <div className="text-xs text-plm-fg-dim flex items-center gap-1">
                    <Users size={12} />
                    {team.member_count}
                  </div>
                </button>
              )
            })}
          </div>
        )}
        
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
