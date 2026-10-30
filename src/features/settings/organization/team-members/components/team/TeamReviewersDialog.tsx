import { useState, useEffect, useCallback } from 'react'
import { Users, X, Loader2, Plus, UserCircle, ShieldCheck } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '@/lib/supabase'
import { getTeamReviewers, addTeamReviewer, removeTeamReviewer } from '@/lib/supabase/teams'
import type { TeamReviewerRow } from '@/lib/supabase/teams'
import type { TeamWithDetails, OrgUser, WorkflowRoleBasic } from '../../types'
import { getTeamIcon, getRoleIcon } from '../../utils/icons'
import { getInitials, getEffectiveAvatarUrl } from '@/lib/utils'
import { log } from '@/lib/logger'

interface TeamReviewersDialogProps {
  team: TeamWithDetails
  orgUsers: OrgUser[]
  workflowRoles: WorkflowRoleBasic[]
  onClose: () => void
  userId?: string
}

type AddMode = 'workflow_role' | 'user'

export function TeamReviewersDialog({
  team,
  orgUsers,
  workflowRoles,
  onClose,
  userId,
}: TeamReviewersDialogProps) {
  const { addToast } = usePDMStore(useShallow((s) => ({ addToast: s.addToast })))
  const [reviewers, setReviewers] = useState<TeamReviewerRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('workflow_role')
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([])

  const loadReviewers = useCallback(async () => {
    setIsLoading(true)
    try {
      const { reviewers: data, error } = await getTeamReviewers(team.id)
      if (error) {
        log.error('[TeamReviewers]', 'Failed to load', { error })
        addToast('error', 'Failed to load reviewers')
      } else {
        setReviewers(data)
      }
    } finally {
      setIsLoading(false)
    }
  }, [team.id, addToast])

  useEffect(() => {
    loadReviewers()
  }, [loadReviewers])

  useEffect(() => {
    async function loadTeamMembers() {
      const { data } = await supabase.from('team_member').select('user_id').eq('team_id', team.id)
      setTeamMemberIds((data || []).map((m: { user_id: string }) => m.user_id))
    }
    loadTeamMembers()
  }, [team.id])

  const teamUsers = orgUsers.filter((u) => teamMemberIds.includes(u.id))

  const existingUserIds = new Set(
    reviewers.filter((r) => r.reviewer_type === 'user').map((r) => r.user_id),
  )
  const existingWorkflowRoleIds = new Set(
    reviewers.filter((r) => r.reviewer_type === 'workflow_role').map((r) => r.workflow_role_id),
  )

  const availableUsers = teamUsers.filter((u) => !existingUserIds.has(u.id))
  const availableWorkflowRoles = workflowRoles.filter((r) => !existingWorkflowRoleIds.has(r.id))

  const handleAddUser = async (user: OrgUser) => {
    if (!userId) return
    setIsAdding(true)
    try {
      const { error } = await addTeamReviewer(team.id, 'user', userId, { userId: user.id })
      if (error) {
        addToast('error', `Failed to add reviewer: ${error}`)
      } else {
        addToast('success', `Added ${user.full_name || user.email} as reviewer`)
        loadReviewers()
      }
    } finally {
      setIsAdding(false)
    }
  }

  const handleAddWorkflowRole = async (wr: WorkflowRoleBasic) => {
    if (!userId) return
    setIsAdding(true)
    try {
      const { error } = await addTeamReviewer(team.id, 'workflow_role', userId, {
        workflowRoleId: wr.id,
      })
      if (error) {
        addToast('error', `Failed to add role: ${error}`)
      } else {
        addToast('success', `Added "${wr.name}" role as reviewers`)
        loadReviewers()
      }
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemove = async (reviewer: TeamReviewerRow) => {
    try {
      const { error } = await removeTeamReviewer(reviewer.id)
      if (error) {
        addToast('error', 'Failed to remove reviewer')
      } else {
        addToast('success', 'Reviewer removed')
        loadReviewers()
      }
    } catch {
      addToast('error', 'Failed to remove reviewer')
    }
  }

  const IconComponent = getTeamIcon(team.icon)

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
            <h3 className="text-lg font-medium text-ui-fg">{team.name} - Reviewers</h3>
            <p className="text-[13px] text-ui-fg-secondary">
              {reviewers.length} reviewer rule{reviewers.length !== 1 ? 's' : ''} configured
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-ui-fg-secondary hover:text-ui-fg rounded">
            <X size={18} />
          </button>
        </div>

        {/* Add reviewer section */}
        <div className="p-4 border-b border-ui-divider">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-medium text-ui-fg flex items-center gap-2">
              <Plus size={14} />
              Add Reviewer Rule
            </h4>
          </div>

          {/* Mode tabs: Roles (default) | Users */}
          <div className="flex border-b border-ui-divider mb-3">
            <button
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                addMode === 'workflow_role'
                  ? 'text-ui-accent border-b-2 border-ui-accent -mb-px'
                  : 'text-ui-fg-secondary hover:text-ui-fg'
              }`}
              onClick={() => setAddMode('workflow_role')}
            >
              <ShieldCheck size={12} className="inline mr-1 -mt-0.5" />
              Roles
            </button>
            <button
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                addMode === 'user'
                  ? 'text-ui-accent border-b-2 border-ui-accent -mb-px'
                  : 'text-ui-fg-secondary hover:text-ui-fg'
              }`}
              onClick={() => setAddMode('user')}
            >
              <UserCircle size={12} className="inline mr-1 -mt-0.5" />
              Users
            </button>
          </div>

          {/* Roles picker */}
          {addMode === 'workflow_role' && (
            <div className="max-h-40 overflow-y-auto bg-ui-bg border border-ui-divider rounded-lg">
              {availableWorkflowRoles.length === 0 ? (
                <div className="text-center py-4 text-[13px] text-ui-fg-secondary">
                  {workflowRoles.length === 0
                    ? 'No roles defined for this organization'
                    : 'All roles are already added'}
                </div>
              ) : (
                availableWorkflowRoles.map((wr) => {
                  const WRIcon = getRoleIcon(wr.icon)
                  return (
                    <button
                      key={wr.id}
                      onClick={() => handleAddWorkflowRole(wr)}
                      disabled={isAdding}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-ui-hover transition-colors text-left border-b border-ui-divider/50 last:border-b-0"
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${wr.color}20`, color: wr.color }}
                      >
                        <WRIcon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-ui-fg">{wr.name}</div>
                        <div className="text-[12px] text-ui-fg-secondary">
                          Anyone on this team with this role
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-ui-accent text-[12px] font-medium">
                        <Plus size={14} />
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}

          {/* User picker */}
          {addMode === 'user' && (
            <div className="max-h-40 overflow-y-auto bg-ui-bg border border-ui-divider rounded-lg">
              {availableUsers.length === 0 ? (
                <div className="text-center py-4 text-[13px] text-ui-fg-secondary">
                  All team members are already reviewers
                </div>
              ) : (
                availableUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleAddUser(u)}
                    disabled={isAdding}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-ui-hover transition-colors text-left border-b border-ui-divider/50 last:border-b-0"
                  >
                    {getEffectiveAvatarUrl(u) ? (
                      <img
                        src={getEffectiveAvatarUrl(u)!}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-ui-fg-secondary/20 flex items-center justify-center text-[12px] font-medium">
                        {getInitials(u.full_name || u.email)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-ui-fg truncate">{u.full_name || u.email}</div>
                      {u.full_name && (
                        <div className="text-[12px] text-ui-fg-secondary truncate">{u.email}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-ui-accent text-[12px] font-medium">
                      <Plus size={14} />
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Current reviewer rules list */}
        <div className="flex-1 overflow-y-auto p-4">
          <h4 className="text-[12px] text-ui-fg-secondary uppercase tracking-wide mb-3">
            Current Reviewer Rules
          </h4>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-ui-fg-secondary" size={24} />
            </div>
          ) : reviewers.length === 0 ? (
            <div className="text-center py-8 text-ui-fg-secondary">
              <Users size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-[13px]">No reviewer rules configured</p>
              <p className="text-[12px] mt-1">
                When no rules are set, selecting this team adds all members as reviewers
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {reviewers.map((reviewer) => (
                <ReviewerRulePill
                  key={reviewer.id}
                  reviewer={reviewer}
                  workflowRoles={workflowRoles}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-ui-divider flex justify-end">
          <button onClick={onClose} className="btn btn-primary">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function ReviewerRulePill({
  reviewer,
  workflowRoles,
  onRemove,
}: {
  reviewer: TeamReviewerRow
  workflowRoles: WorkflowRoleBasic[]
  onRemove: (r: TeamReviewerRow) => void
}) {
  let icon: React.ReactNode
  let label: string
  let sublabel: string

  if (reviewer.reviewer_type === 'user' && reviewer.user) {
    const avatarUrl = (reviewer.user as Record<string, unknown>).avatar_url as string | null
    icon = avatarUrl ? (
      <img
        src={avatarUrl}
        alt=""
        className="w-8 h-8 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    ) : (
      <div className="w-8 h-8 rounded-full bg-ui-accent/10 flex items-center justify-center text-[12px] font-medium">
        {getInitials(reviewer.user.full_name || reviewer.user.email)}
      </div>
    )
    label = reviewer.user.full_name || reviewer.user.email
    sublabel = 'Individual user'
  } else if (reviewer.reviewer_type === 'workflow_role' && reviewer.workflow_role_id) {
    const wr = workflowRoles.find((r) => r.id === reviewer.workflow_role_id)
    if (wr) {
      const WRIcon = getRoleIcon(wr.icon)
      icon = (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${wr.color}20`, color: wr.color }}
        >
          <WRIcon size={16} />
        </div>
      )
      label = wr.name
    } else {
      icon = (
        <div className="w-8 h-8 rounded-full bg-ui-fg-secondary/10 flex items-center justify-center">
          <ShieldCheck size={16} className="text-ui-fg-secondary" />
        </div>
      )
      label = 'Unknown role'
    }
    sublabel = 'Role'
  } else {
    icon = (
      <div className="w-8 h-8 rounded-full bg-ui-fg-secondary/10 flex items-center justify-center">
        <Users size={16} className="text-ui-fg-secondary" />
      </div>
    )
    label = 'Unknown'
    sublabel = reviewer.reviewer_type
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-ui-bg rounded-lg group">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ui-fg truncate">{label}</div>
        <div className="text-[12px] text-ui-fg-secondary">{sublabel}</div>
      </div>
      <button
        onClick={() => onRemove(reviewer)}
        className="p-1.5 text-ui-fg-secondary hover:text-ui-danger hover:bg-ui-danger/10 rounded opacity-0 group-hover:opacity-100 transition-all"
        title="Remove reviewer rule"
      >
        <X size={14} />
      </button>
    </div>
  )
}
