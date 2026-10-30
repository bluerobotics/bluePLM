/**
 * UsersTab - Displays and manages organization users
 *
 * This component uses hooks directly instead of context:
 * - usePDMStore for user/org info
 * - useMembers for user data
 * - useTeams for team data
 * - useWorkflowRoles for role data
 * - useInvites for pending members
 * - useFilteredData for search filtering
 */
import { useState, useCallback } from 'react'
import * as LucideIcons from 'lucide-react'
import {
  UserPlus,
  Clock,
  ChevronDown,
  ChevronRight,
  Users,
  Shield,
  Mail,
  Pencil,
  X,
  MoreVertical,
  Eye,
  UserCog,
  Loader2,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button } from '@/components/core/ui'
import { usePDMStore } from '@/stores/pdmStore'

import { SettingsGroup } from '../../../components/ui'
import {
  useMembers,
  useTeams,
  useWorkflowRoles,
  useInvites,
  useVaultAccess,
  useFilteredData,
} from '../hooks'
import { ConnectedUserRow } from '../components/user'
import { EditPendingMemberDialog } from '../components/dialogs'
import { pendingMemberToOrgUser } from '../utils'
import type { PendingMember, PendingMemberFormData } from '../types'

export interface UsersTabProps {
  /** Search query for filtering users */
  searchQuery?: string
  /** Called when the "Add User" button should trigger a dialog in the parent */
  onShowCreateUserDialog?: () => void
}

export function UsersTab({ searchQuery = '', onShowCreateUserDialog }: UsersTabProps) {
  // Get user/org info from store
  const { organization, getEffectiveRole, apiServerUrl, startUserImpersonation } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      getEffectiveRole: s.getEffectiveRole,
      apiServerUrl: s.apiServerUrl,
      startUserImpersonation: s.startUserImpersonation,
    })),
  )
  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'

  // Data hooks
  const { members: orgUsers } = useMembers(orgId)
  const { teams } = useTeams(orgId)
  const { workflowRoles } = useWorkflowRoles(orgId)
  const { vaults: orgVaults } = useVaultAccess(orgId)
  const { pendingMembers, deletePendingMember, updatePendingMember, resendInvite } =
    useInvites(orgId)

  // Filtered data
  const { filteredAllUsers } = useFilteredData({ orgUsers, teams, searchQuery })

  // Local UI state for pending members section
  const [showPendingMembers, setShowPendingMembers] = useState(true)
  const [pendingMemberDropdownOpen, setPendingMemberDropdownOpen] = useState<string | null>(null)
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null)

  // Pending member editing state
  const [editingPendingMember, setEditingPendingMember] = useState<PendingMember | null>(null)
  const [pendingMemberForm, setPendingMemberForm] = useState<PendingMemberFormData>({
    full_name: '',
    team_ids: [],
    workflow_role_ids: [],
    vault_ids: [],
  })
  const [isSavingPendingMember, setIsSavingPendingMember] = useState(false)

  // View permissions modal state
  const [, setViewingPendingMemberPermissions] = useState<PendingMember | null>(null)

  // Handlers
  const handleResendInvite = useCallback(
    async (pm: PendingMember) => {
      setResendingInviteId(pm.id)
      try {
        await resendInvite(pm)
      } finally {
        setResendingInviteId(null)
      }
    },
    [resendInvite],
  )

  const openEditPendingMember = useCallback((pm: PendingMember) => {
    setEditingPendingMember(pm)
    setPendingMemberForm({
      full_name: pm.full_name || '',
      team_ids: pm.team_ids || [],
      workflow_role_ids: pm.workflow_role_ids || [],
      vault_ids: pm.vault_ids || [],
    })
  }, [])

  const closeEditPendingMember = useCallback(() => {
    setEditingPendingMember(null)
    setPendingMemberForm({
      full_name: '',
      team_ids: [],
      workflow_role_ids: [],
      vault_ids: [],
    })
  }, [])

  const handleSavePendingMember = useCallback(async () => {
    if (!editingPendingMember) return
    setIsSavingPendingMember(true)
    try {
      await updatePendingMember(editingPendingMember.id, pendingMemberForm)
      closeEditPendingMember()
    } finally {
      setIsSavingPendingMember(false)
    }
  }, [editingPendingMember, pendingMemberForm, updatePendingMember, closeEditPendingMember])

  const togglePendingMemberTeam = useCallback((teamId: string) => {
    setPendingMemberForm((prev) => ({
      ...prev,
      team_ids: prev.team_ids.includes(teamId)
        ? prev.team_ids.filter((id) => id !== teamId)
        : [...prev.team_ids, teamId],
    }))
  }, [])

  const togglePendingMemberWorkflowRole = useCallback((roleId: string) => {
    setPendingMemberForm((prev) => ({
      ...prev,
      workflow_role_ids: prev.workflow_role_ids.includes(roleId)
        ? prev.workflow_role_ids.filter((id) => id !== roleId)
        : [...prev.workflow_role_ids, roleId],
    }))
  }, [])

  const togglePendingMemberVault = useCallback((vaultId: string) => {
    setPendingMemberForm((prev) => ({
      ...prev,
      vault_ids: prev.vault_ids.includes(vaultId)
        ? prev.vault_ids.filter((id) => id !== vaultId)
        : [...prev.vault_ids, vaultId],
    }))
  }, [])

  return (
    <>
      {/* All Users Section */}
      {filteredAllUsers.length === 0 ? (
        <SettingsGroup>
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <span className="text-[13px] text-ui-fg-secondary">
              {orgUsers.length === 0 ? 'No users yet' : 'No users match your search'}
            </span>
            {isAdmin && orgUsers.length === 0 && onShowCreateUserDialog && (
              <Button
                variant="primary"
                size="sm"
                icon={<UserPlus size={14} />}
                onClick={onShowCreateUserDialog}
              >
                Add First User
              </Button>
            )}
          </div>
        </SettingsGroup>
      ) : (
        <SettingsGroup>
          {filteredAllUsers.map((u) => (
            <ConnectedUserRow key={u.id} user={u} />
          ))}
        </SettingsGroup>
      )}

      {/* Pending Members Section (pre-created accounts) */}
      {isAdmin && pendingMembers.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowPendingMembers(!showPendingMembers)}
            aria-expanded={showPendingMembers}
            className="flex items-center gap-1.5 text-[14px] font-medium text-ui-fg-secondary transition-colors hover:text-ui-fg"
          >
            {showPendingMembers ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Pending Members
            <span className="text-[12px] font-normal tabular-nums">{pendingMembers.length}</span>
          </button>

          {showPendingMembers && (
            <SettingsGroup>
              <div className="px-4 py-2.5 text-[13px] text-ui-fg-secondary">
                Pre-created accounts awaiting user sign-in. These users can sign in with the
                organization code.
              </div>
              {pendingMembers.map((pm) => (
                <div
                  key={pm.id}
                  className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ui-hover/40"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ui-fg-secondary/10">
                    <Clock size={14} className="text-ui-fg-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[14px] font-medium text-ui-fg">
                      <span className="truncate">{pm.full_name || pm.email}</span>
                      <Badge tone="warning">Pending</Badge>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] text-ui-fg-secondary">
                      <span className="truncate">{pm.email}</span>
                      {pm.workflow_role_ids && pm.workflow_role_ids.length > 0 && (
                        <span className="flex items-center gap-1">
                          {pm.workflow_role_ids.slice(0, 2).map((roleId) => {
                            const role = workflowRoles.find((r) => r.id === roleId)
                            if (!role) return null
                            const RoleIcon =
                              (
                                LucideIcons as unknown as Record<
                                  string,
                                  React.ComponentType<{ size?: number }>
                                >
                              )[role.icon] || Shield
                            return (
                              <span
                                key={roleId}
                                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium"
                                style={{ backgroundColor: `${role.color}20`, color: role.color }}
                                title={role.name}
                              >
                                <RoleIcon size={10} />
                                {role.name}
                              </span>
                            )
                          })}
                          {pm.workflow_role_ids.length > 2 && (
                            <span className="text-[12px] text-ui-fg-secondary">
                              +{pm.workflow_role_ids.length - 2}
                            </span>
                          )}
                        </span>
                      )}
                      {pm.team_ids && pm.team_ids.length > 0 && (
                        <Badge icon={<Users size={10} />}>
                          {pm.team_ids.length} team{pm.team_ids.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    {apiServerUrl && (
                      <button
                        type="button"
                        onClick={() => handleResendInvite(pm)}
                        disabled={resendingInviteId === pm.id}
                        className="rounded-md p-1.5 text-ui-fg-secondary hover:bg-ui-hover hover:text-ui-fg disabled:opacity-50"
                        title="Resend invite email"
                        aria-label="Resend invite email"
                      >
                        {resendingInviteId === pm.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Mail size={14} />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditPendingMember(pm)}
                      className="rounded-md p-1.5 text-ui-fg-secondary hover:bg-ui-hover hover:text-ui-fg"
                      title="Edit pending member"
                      aria-label="Edit pending member"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePendingMember(pm.id)}
                      className="rounded-md p-1.5 text-ui-fg-secondary hover:bg-ui-danger/10 hover:text-ui-danger"
                      title="Remove pending member"
                      aria-label="Remove pending member"
                    >
                      <X size={14} />
                    </button>

                    {/* More actions dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setPendingMemberDropdownOpen(
                            pendingMemberDropdownOpen === pm.id ? null : pm.id,
                          )
                        }
                        className="rounded-md p-1.5 text-ui-fg-secondary hover:bg-ui-hover hover:text-ui-fg"
                        title="More actions"
                        aria-label="More actions"
                      >
                        <MoreVertical size={14} />
                      </button>

                      {pendingMemberDropdownOpen === pm.id && (
                        <>
                          <div
                            className="fixed inset-0 z-[100]"
                            onClick={() => setPendingMemberDropdownOpen(null)}
                          />
                          <div
                            className="fixed z-[101] min-w-[180px] rounded-lg border border-ui-divider bg-ui-field py-1 shadow-xl"
                            ref={(el) => {
                              if (el) {
                                const btn = el.previousElementSibling
                                  ?.previousElementSibling as HTMLElement
                                if (btn) {
                                  const rect = btn.getBoundingClientRect()
                                  const menuHeight = el.offsetHeight
                                  const spaceBelow = window.innerHeight - rect.bottom

                                  if (spaceBelow < menuHeight) {
                                    el.style.bottom = `${window.innerHeight - rect.top + 4}px`
                                    el.style.top = 'auto'
                                  } else {
                                    el.style.top = `${rect.bottom + 4}px`
                                    el.style.bottom = 'auto'
                                  }
                                  el.style.right = `${window.innerWidth - rect.right}px`
                                }
                              }
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setViewingPendingMemberPermissions(pm)
                                setPendingMemberDropdownOpen(null)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[14px] text-ui-fg transition-colors hover:bg-ui-hover"
                            >
                              <Eye size={14} />
                              View Net Permissions
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const fakeUser = pendingMemberToOrgUser(pm, teams, workflowRoles)
                                startUserImpersonation(fakeUser.id, fakeUser)
                                setPendingMemberDropdownOpen(null)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[14px] text-ui-fg transition-colors hover:bg-ui-hover"
                            >
                              <UserCog size={14} />
                              Simulate Permissions
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </SettingsGroup>
          )}
        </div>
      )}

      {/* Edit Pending Member Dialog */}
      {editingPendingMember && (
        <EditPendingMemberDialog
          pendingMember={editingPendingMember}
          pendingMemberForm={pendingMemberForm}
          setPendingMemberForm={setPendingMemberForm}
          teams={teams}
          workflowRoles={workflowRoles}
          orgVaults={orgVaults}
          onSave={handleSavePendingMember}
          onClose={closeEditPendingMember}
          isSaving={isSavingPendingMember}
          togglePendingMemberTeam={togglePendingMemberTeam}
          togglePendingMemberWorkflowRole={togglePendingMemberWorkflowRole}
          togglePendingMemberVault={togglePendingMemberVault}
        />
      )}
    </>
  )
}
