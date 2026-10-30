// Team Members Dialog - Manage members of a specific team
import { useState, useEffect } from 'react'
import type React from 'react'
import * as LucideIcons from 'lucide-react'
import { Users, UserPlus, Search, Plus, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/core/ui'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import { useShallow } from 'zustand/react/shallow'
import { getInitials, getEffectiveAvatarUrl } from '@/lib/utils'
import { insertTeamMember } from '../../hooks/supabaseHelpers'
import type { TeamMembersDialogProps, OrgUser } from '../../types'
import type { TeamMember } from '@/types/permissions'

// Type for team member query result with joined user data
interface TeamMemberQueryResult {
  id: string
  team_id: string
  user_id: string
  is_team_admin: boolean
  added_at: string
  added_by: string | null
  app_user: {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
    custom_avatar_url: string | null
    role: string
  } | null
}

export function TeamMembersDialog({ team, orgUsers, onClose, userId }: TeamMembersDialogProps) {
  const { addToast } = usePDMStore(useShallow((s) => ({ addToast: s.addToast })))
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    loadMembers()
  }, [team.id])

  const loadMembers = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('team_member')
        .select(
          `
          id, team_id, user_id, is_team_admin, added_at, added_by,
          app_user!user_id (id, email, full_name, avatar_url, custom_avatar_url, role)
        `,
        )
        .eq('team_id', team.id)
        .order('added_at', { ascending: false })

      if (error) throw error

      const typedData = (data || []) as unknown as TeamMemberQueryResult[]
      const mappedData: TeamMember[] = typedData.map((m) => ({
        id: m.id,
        team_id: m.team_id,
        user_id: m.user_id,
        is_team_admin: m.is_team_admin,
        added_at: m.added_at,
        added_by: m.added_by,
        user: m.app_user
          ? {
              id: m.app_user.id,
              email: m.app_user.email,
              full_name: m.app_user.full_name,
              avatar_url: m.app_user.avatar_url,
              custom_avatar_url: m.app_user.custom_avatar_url,
              role: m.app_user.role as 'admin' | 'engineer' | 'viewer',
            }
          : undefined,
      }))

      setMembers(mappedData)
    } catch (error) {
      log.error('[TeamMembers]', 'Failed to load team members', { error: error })
    } finally {
      setIsLoading(false)
    }
  }

  const memberUserIds = members.map((m) => m.user_id)
  const availableUsers = orgUsers.filter((u) => !memberUserIds.includes(u.id))
  const filteredUsers = availableUsers.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const addMember = async (userToAdd: OrgUser) => {
    if (!userId) return

    setIsAdding(true)
    try {
      const { error } = await insertTeamMember({
        team_id: team.id,
        user_id: userToAdd.id,
        added_by: userId,
      })

      if (error) throw error

      addToast('success', `Added ${userToAdd.full_name || userToAdd.email} to team`)
      loadMembers()
    } catch (error) {
      addToast('error', 'Failed to add member')
    } finally {
      setIsAdding(false)
    }
  }

  const removeMember = async (member: TeamMember) => {
    try {
      const { error } = await supabase.from('team_member').delete().eq('id', member.id)
      if (error) throw error

      addToast('success', `Removed ${member.user?.full_name || member.user?.email} from team`)
      loadMembers()
    } catch (error) {
      addToast('error', 'Failed to remove member')
    }
  }

  const IconComponent =
    (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[team.icon] ||
    Users

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-ui-field border border-ui-divider rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-ui-divider flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: `${team.color}20`, color: team.color }}
          >
            <IconComponent size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-ui-fg">{team.name} - Members</h3>
            <p className="text-[13px] text-ui-fg-secondary">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-ui-fg-secondary hover:text-ui-fg rounded">
            <X size={18} />
          </button>
        </div>

        {/* Add member section */}
        <div className="p-4 border-b border-ui-divider">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-medium text-ui-fg flex items-center gap-2">
              <UserPlus size={14} />
              Add Members
            </h4>
            <span className="text-[12px] text-ui-fg-secondary">{availableUsers.length} available</span>
          </div>

          <div className="relative mb-3">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-secondary"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter users..."
              className="w-full pl-9 pr-3 py-2 bg-ui-bg border border-ui-divider rounded-lg text-ui-fg placeholder:text-ui-fg focus:outline-none focus:border-ui-accent"
            />
          </div>

          {availableUsers.length === 0 ? (
            <div className="text-center py-4 text-[13px] text-ui-fg-secondary bg-ui-bg rounded-lg border border-ui-divider">
              All organization members are already in this team
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto bg-ui-bg border border-ui-divider rounded-lg">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-4 text-[13px] text-ui-fg-secondary">
                  No users match your search
                </div>
              ) : (
                filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      addMember(u)
                      setSearchQuery('')
                    }}
                    disabled={isAdding}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-ui-hover transition-colors text-left border-b border-ui-divider/50 last:border-b-0"
                  >
                    {getEffectiveAvatarUrl(u) ? (
                      <img
                        src={getEffectiveAvatarUrl(u)!}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-ui-fg-secondary/20 flex items-center justify-center text-[12px] font-medium">
                        {getInitials(u.full_name || u.email)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-ui-fg truncate">{u.full_name || u.email}</div>
                      <div className="text-[12px] text-ui-fg-secondary truncate">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-1 text-ui-accent text-[12px] font-medium">
                      <Plus size={14} />
                      Add
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-ui-fg-secondary" size={24} />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-ui-fg-secondary">No members in this team yet</div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 bg-ui-bg rounded-lg group"
                >
                  {getEffectiveAvatarUrl(member.user) ? (
                    <img
                      src={getEffectiveAvatarUrl(member.user)!}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-ui-fg-secondary/20 flex items-center justify-center text-[13px] font-medium">
                      {getInitials(member.user?.full_name || member.user?.email || '')}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-ui-fg truncate">
                      {member.user?.full_name || member.user?.email}
                    </div>
                    <div className="text-[12px] text-ui-fg-secondary truncate">{member.user?.email}</div>
                  </div>
                  {member.is_team_admin && (
                    <span className="text-[12px] px-1.5 py-0.5 rounded bg-ui-accent/20 text-ui-accent uppercase font-medium">
                      Team Admin
                    </span>
                  )}
                  <button
                    onClick={() => removeMember(member)}
                    className="p-1.5 text-ui-fg-secondary hover:text-ui-danger hover:bg-ui-danger/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove from team"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-ui-divider flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
