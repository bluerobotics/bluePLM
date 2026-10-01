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
import { useState, useCallback, useEffect } from 'react'
import * as LucideIcons from 'lucide-react'
import {
  UsersRound,
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
  UserCheck,
  UserX,
  Loader2,
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import {
  approveMdbRegistration,
  getMdbRegistrationRequests,
  rejectMdbRegistration,
  type MdbRegistrationRequest,
} from '@/lib/mdb'
import { isMdbBackendActive } from '@/lib/backendAdapter'
import { getTranslation, useTranslation } from '@/lib/i18n'
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
  const { organization, getEffectiveRole, apiServerUrl, startUserImpersonation, addToast } = usePDMStore()
  const { language, t } = useTranslation()
  const orgId = organization?.id ?? null
  const isAdmin = ['admin', 'owner'].includes(getEffectiveRole())

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

  // MDB self-registration requests are intentionally separate from pre-created invites.
  const [registrationRequests, setRegistrationRequests] = useState<MdbRegistrationRequest[]>([])
  const [registrationRoles, setRegistrationRoles] = useState<Record<string, 'admin' | 'member' | 'viewer' | 'guest'>>({})
  const [isLoadingRegistrationRequests, setIsLoadingRegistrationRequests] = useState(false)
  const [registrationAction, setRegistrationAction] = useState<string | null>(null)

  const loadRegistrationRequests = useCallback(async () => {
    if (!isMdbBackendActive() || !isAdmin) return
    setIsLoadingRegistrationRequests(true)
    try {
      const requests = await getMdbRegistrationRequests()
      setRegistrationRequests(requests)
      setRegistrationRoles((previous) => Object.fromEntries(
        requests.map((request) => [request.id, previous[request.id] ?? 'viewer']),
      ))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[UsersTab] Failed to load MDB registration requests:', message)
      addToast('error', getTranslation(language, 'mdbSetup.registrationRequestsLoadFailed'))
      setRegistrationRequests([])
    } finally {
      setIsLoadingRegistrationRequests(false)
    }
  }, [addToast, isAdmin, language])

  useEffect(() => {
    void loadRegistrationRequests()
  }, [loadRegistrationRequests])

  const handleApproveRegistration = useCallback(async (request: MdbRegistrationRequest) => {
    setRegistrationAction(`${request.id}:approve`)
    try {
      await approveMdbRegistration(request.id, registrationRoles[request.id] ?? 'viewer')
      await loadRegistrationRequests()
      addToast('success', t('mdbSetup.registrationRequestApproved'))
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : t('mdbSetup.registrationRequestApproveFailed'))
    } finally {
      setRegistrationAction(null)
    }
  }, [addToast, loadRegistrationRequests, registrationRoles, t])

  const handleRejectRegistration = useCallback(async (request: MdbRegistrationRequest) => {
    setRegistrationAction(`${request.id}:reject`)
    try {
      await rejectMdbRegistration(request.id)
      await loadRegistrationRequests()
      addToast('success', t('mdbSetup.registrationRequestRejected'))
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : t('mdbSetup.registrationRequestRejectFailed'))
    } finally {
      setRegistrationAction(null)
    }
  }, [addToast, loadRegistrationRequests, t])

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
      <div className="space-y-3">
        {filteredAllUsers.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-plm-border rounded-lg">
            <UsersRound size={36} className="mx-auto text-plm-fg-muted mb-3 opacity-50" />
            <p className="text-sm text-plm-fg-muted mb-4">
              {orgUsers.length === 0 ? 'No users yet' : 'No users match your search'}
            </p>
            {isAdmin && orgUsers.length === 0 && onShowCreateUserDialog && (
              <button onClick={onShowCreateUserDialog} className="btn btn-primary btn-sm">
                <UserPlus size={14} className="mr-1" />
                Add First User
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden bg-plm-bg/50 ring-1 ring-white/5">
            <div className="divide-y divide-white/10">
              {filteredAllUsers.map((u) => (
                <ConnectedUserRow key={u.id} user={u} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MDB self-registration requests */}
      {isMdbBackendActive() && isAdmin && (isLoadingRegistrationRequests || registrationRequests.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm font-medium text-plm-fg-muted uppercase tracking-wide">
            <span className="flex items-center gap-2">
              <UserPlus size={14} />
              {t('mdbSetup.registrationRequestsTitle')} ({registrationRequests.length})
            </span>
            {isLoadingRegistrationRequests && <Loader2 size={14} className="animate-spin" />}
          </div>
          <div className="border border-plm-border rounded-lg overflow-hidden bg-plm-bg/50">
            <div className="p-3 border-b border-plm-border bg-plm-bg/30">
              <p className="text-xs text-plm-fg-muted">{t('mdbSetup.registrationRequestsDescription')}</p>
            </div>
            <div className="divide-y divide-plm-border/50">
              {registrationRequests.map((request) => {
                const action = registrationAction?.startsWith(`${request.id}:`) ? registrationAction.split(':')[1] : null
                return (
                  <div key={request.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="w-10 h-10 rounded-full bg-plm-accent/10 flex items-center justify-center">
                      <Clock size={18} className="text-plm-accent" />
                    </div>
                    <div className="flex-1 min-w-[12rem]">
                      <div className="text-sm text-plm-fg truncate">{request.displayName || request.email}</div>
                      <div className="text-xs text-plm-fg-muted truncate">{request.email}</div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-plm-fg-muted">
                      <span>{t('mdbSetup.registrationRoleLabel')}</span>
                      <select
                        value={registrationRoles[request.id] ?? 'viewer'}
                        disabled={registrationAction !== null}
                        onChange={(event) => setRegistrationRoles((previous) => ({
                          ...previous,
                          [request.id]: event.target.value as 'admin' | 'member' | 'viewer' | 'guest',
                        }))}
                        className="bg-plm-bg border border-plm-border rounded px-2 py-1 text-plm-fg"
                      >
                        <option value="admin">{t('mdbSetup.roleAdmin')}</option>
                        <option value="member">{t('mdbSetup.roleMember')}</option>
                        <option value="viewer">{t('mdbSetup.roleViewer')}</option>
                        <option value="guest">{t('mdbSetup.roleGuest')}</option>
                      </select>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleApproveRegistration(request)}
                        disabled={registrationAction !== null}
                        className="p-1.5 text-plm-success hover:bg-plm-success/10 rounded disabled:opacity-50"
                        title={t('mdbSetup.registrationApprove')}
                      >
                        {action === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRejectRegistration(request)}
                        disabled={registrationAction !== null}
                        className="p-1.5 text-plm-error hover:bg-plm-error/10 rounded disabled:opacity-50"
                        title={t('mdbSetup.registrationReject')}
                      >
                        {action === 'reject' ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pending Members Section (pre-created accounts) */}
      {isAdmin && pendingMembers.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowPendingMembers(!showPendingMembers)}
            className="w-full flex items-center justify-between text-sm font-medium text-plm-fg-muted uppercase tracking-wide hover:text-plm-fg transition-colors"
          >
            <span className="flex items-center gap-2">
              <Clock size={14} />
              Pending Members ({pendingMembers.length})
            </span>
            {showPendingMembers ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {showPendingMembers && (
            <div className="border border-plm-border rounded-lg overflow-hidden bg-plm-bg/50">
              <div className="p-3 border-b border-plm-border bg-plm-bg/30">
                <p className="text-xs text-plm-fg-muted">
                  Pre-created accounts awaiting user sign-in. These users can sign in with the
                  organization code.
                </p>
              </div>
              <div className="divide-y divide-plm-border/50">
                {pendingMembers.map((pm) => (
                  <div key={pm.id} className="flex items-center gap-3 p-3 group">
                    <div className="w-10 h-10 rounded-full bg-plm-fg-muted/10 flex items-center justify-center">
                      <Clock size={18} className="text-plm-fg-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-base text-plm-fg truncate flex items-center gap-2">
                        {pm.full_name || pm.email}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 uppercase">
                          Pending
                        </span>
                      </div>
                      <div className="text-sm text-plm-fg-muted truncate flex items-center gap-2 flex-wrap">
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
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                                  style={{ backgroundColor: `${role.color}20`, color: role.color }}
                                  title={role.name}
                                >
                                  <RoleIcon size={10} />
                                  {role.name}
                                </span>
                              )
                            })}
                            {pm.workflow_role_ids.length > 2 && (
                              <span className="text-xs text-plm-fg-dim">
                                +{pm.workflow_role_ids.length - 2}
                              </span>
                            )}
                          </span>
                        )}
                        {pm.team_ids && pm.team_ids.length > 0 && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-plm-fg-muted/10 rounded text-plm-fg-dim">
                            <Users size={10} />
                            {pm.team_ids.length} team{pm.team_ids.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      {apiServerUrl && (
                        <button
                          onClick={() => handleResendInvite(pm)}
                          disabled={resendingInviteId === pm.id}
                          className="p-1.5 text-plm-fg-muted hover:text-plm-accent hover:bg-plm-accent/10 rounded disabled:opacity-50"
                          title="Resend invite email"
                        >
                          {resendingInviteId === pm.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Mail size={14} />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => openEditPendingMember(pm)}
                        className="p-1.5 text-plm-fg-muted hover:text-plm-accent hover:bg-plm-accent/10 rounded"
                        title="Edit pending member"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deletePendingMember(pm.id)}
                        className="p-1.5 text-plm-fg-muted hover:text-plm-error hover:bg-plm-error/10 rounded"
                        title="Remove pending member"
                      >
                        <X size={14} />
                      </button>

                      {/* More actions dropdown */}
                      <div className="relative">
                        <button
                          onClick={() =>
                            setPendingMemberDropdownOpen(
                              pendingMemberDropdownOpen === pm.id ? null : pm.id,
                            )
                          }
                          className="p-1.5 text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight rounded"
                          title="More actions"
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
                              className="fixed z-[101] bg-plm-bg-light border border-plm-border rounded-lg shadow-xl py-1 min-w-[180px]"
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
                                onClick={() => {
                                  setViewingPendingMemberPermissions(pm)
                                  setPendingMemberDropdownOpen(null)
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-plm-fg hover:bg-plm-highlight transition-colors"
                              >
                                <Eye size={14} />
                                View Net Permissions
                              </button>
                              <button
                                onClick={() => {
                                  const fakeUser = pendingMemberToOrgUser(pm, teams, workflowRoles)
                                  startUserImpersonation(fakeUser.id, fakeUser)
                                  setPendingMemberDropdownOpen(null)
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-plm-fg hover:bg-plm-highlight transition-colors"
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
              </div>
            </div>
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
