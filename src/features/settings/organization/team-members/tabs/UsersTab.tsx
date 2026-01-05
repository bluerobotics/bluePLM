/**
 * UsersTab - Displays and manages organization users
 * 
 * Shows all organization members with inline actions for managing
 * teams, workflow roles, job titles, and permissions.
 * Also displays pending members who haven't yet signed in.
 */
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
  Loader2
} from 'lucide-react'
import { ConnectedUserRow } from '../components/user'
import { useTeamMembersContext } from '../context'
import { pendingMemberToOrgUser } from '../utils'

export function UsersTab() {
  const {
    filteredAllUsers,
    orgUsers,
    teams,
    workflowRoles,
    pendingMembers,
    isAdmin,
    apiServerUrl,
    setShowCreateUserDialog,
    // Pending member state & handlers
    showPendingMembers,
    setShowPendingMembers,
    pendingMemberDropdownOpen,
    setPendingMemberDropdownOpen,
    setViewingPendingMemberPermissions,
    openEditPendingMember,
    handleResendInvite,
    resendingInviteId,
    deletePendingMember,
    startUserImpersonation
  } = useTeamMembersContext()

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
            {isAdmin && orgUsers.length === 0 && (
              <button
                onClick={() => setShowCreateUserDialog(true)}
                className="btn btn-primary btn-sm"
              >
                <UserPlus size={14} className="mr-1" />
                Add First User
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden bg-plm-bg/50 ring-1 ring-white/5">
            <div className="divide-y divide-white/10">
              {filteredAllUsers.map(u => (
                <ConnectedUserRow key={u.id} user={u} />
              ))}
            </div>
          </div>
        )}
      </div>

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
                  Pre-created accounts awaiting user sign-in. These users can sign in with the organization code.
                </p>
              </div>
              <div className="divide-y divide-plm-border/50">
                {pendingMembers.map(pm => (
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
                            {pm.workflow_role_ids.slice(0, 2).map(roleId => {
                              const role = workflowRoles.find(r => r.id === roleId)
                              if (!role) return null
                              const RoleIcon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[role.icon] || Shield
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
                              <span className="text-xs text-plm-fg-dim">+{pm.workflow_role_ids.length - 2}</span>
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
                          onClick={() => setPendingMemberDropdownOpen(pendingMemberDropdownOpen === pm.id ? null : pm.id)}
                          className="p-1.5 text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight rounded"
                          title="More actions"
                        >
                          <MoreVertical size={14} />
                        </button>
                        
                        {pendingMemberDropdownOpen === pm.id && (
                          <>
                            <div className="fixed inset-0 z-[100]" onClick={() => setPendingMemberDropdownOpen(null)} />
                            <div 
                              className="fixed z-[101] bg-plm-bg-light border border-plm-border rounded-lg shadow-xl py-1 min-w-[180px]"
                              ref={(el) => {
                                if (el) {
                                  const btn = el.previousElementSibling?.previousElementSibling as HTMLElement
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
    </>
  )
}

// Export props type for backward compatibility (can be removed later)
export type UsersTabProps = Record<string, never>
