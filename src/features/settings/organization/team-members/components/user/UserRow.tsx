// User Row Component - displays a single user with inline dropdown menus
import { useState } from 'react'
import {
  Shield,
  ChevronDown,
  Search,
  Check,
  Lock,
  MoreVertical,
  User,
  FileKey,
  UserCog,
  Database,
  UserMinus,
  Loader2,
  X,
} from 'lucide-react'
import { Badge, Button } from '@/components/core/ui'
import { isAdminUser } from '@/lib/isAdminUser'
import { getInitials, getEffectiveAvatarUrl } from '@/lib/utils'
import { formatLastOnline, getTitleIcon, getTeamIcon, getRoleIcon } from '../../utils'
import type { UserRowProps } from '../../types'

export function UserRow({
  user,
  isAdmin,
  isRealAdmin,
  isCurrentUser,
  onViewProfile,
  onRemove,
  onRemoveFromTeam,
  onVaultAccess,
  onPermissions,
  onViewNetPermissions,
  onSimulatePermissions,
  isSimulating,
  vaultAccessCount,
  compact,
  onEditJobTitle: _onEditJobTitle, // Available for modal-based editing
  jobTitles,
  onToggleJobTitle,
  workflowRoles,
  userWorkflowRoleIds,
  onEditWorkflowRoles: _onEditWorkflowRoles, // Available for modal-based editing
  teams,
  onEditTeams: _onEditTeams, // Available for modal-based editing
  onToggleTeam,
  onToggleWorkflowRole,
}: UserRowProps) {
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false)
  const [titleDropdownOpen, setTitleDropdownOpen] = useState(false)
  const [teamsDropdownOpen, setTeamsDropdownOpen] = useState(false)
  const [rolesDropdownOpen, setRolesDropdownOpen] = useState(false)
  const [togglingTitle, setTogglingTitle] = useState(false)
  const [togglingTeam, setTogglingTeam] = useState<string | null>(null)
  const [togglingRole, setTogglingRole] = useState<string | null>(null)
  const [titleSearch, setTitleSearch] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [roleSearch, setRoleSearch] = useState('')

  // Admins can manage settings for everyone including themselves
  const canManage = isAdmin

  return (
    <div
      className={`group flex items-center gap-3 ${compact ? 'py-2' : 'py-3'}`}
    >
      <button
        onClick={onViewProfile}
        className="flex min-w-0 flex-1 items-center gap-3 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60"
      >
        {(() => {
          return getEffectiveAvatarUrl(user) ? (
            <img
              src={getEffectiveAvatarUrl(user)!}
              alt=""
              className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} flex-shrink-0 rounded-full object-cover`}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className={`${compact ? 'h-7 w-7 text-[12px]' : 'h-8 w-8 text-[13px]'} flex flex-shrink-0 items-center justify-center rounded-full bg-ui-selected font-medium text-ui-fg`}
            >
              {getInitials(user.full_name || user.email)}
            </div>
          )
        })()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[14px] text-ui-fg">
            <span className="truncate">{user.full_name || user.email}</span>
            {isCurrentUser && (
              <span className="text-[13px] font-normal text-ui-fg-secondary">(you)</span>
            )}
            {/* Vault access badge */}
            {!isAdminUser(user.role, user.teams) && vaultAccessCount > 0 && (
              <Badge icon={<Lock size={10} />}>
                {vaultAccessCount} vault{vaultAccessCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-ui-fg-secondary">
            <span className="truncate">{user.email}</span>
            {/* Last online */}
            {!compact && formatLastOnline(user.last_online_at) && (
              <span className="flex flex-shrink-0 items-center gap-1.5">
                <span aria-hidden>·</span>
                {formatLastOnline(user.last_online_at)}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Job title dropdown */}
      {jobTitles && jobTitles.length > 0 && (
        <div className="relative">
          <button
            onClick={() => {
              // Always allow opening to view - admins can edit, others can just view
              setTitleDropdownOpen(!titleDropdownOpen)
              setTeamsDropdownOpen(false)
              setRolesDropdownOpen(false)
            }}
            className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
              user.job_title ? 'bg-ui-field text-ui-fg-secondary hover:text-ui-fg' : 'text-ui-fg-secondary hover:bg-ui-hover hover:text-ui-fg'
            }`}
          >
            {user.job_title?.name || 'No title'}
            <ChevronDown size={12} />
          </button>

          {titleDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => {
                  setTitleDropdownOpen(false)
                  setTitleSearch('')
                }}
              />
              <div
                className="fixed z-[101] bg-ui-field border border-ui-divider rounded-lg shadow-xl py-1 min-w-[220px] max-h-[350px] flex flex-col"
                style={{
                  top: 'auto',
                  left: 'auto',
                }}
                ref={(el) => {
                  if (el) {
                    const btn = el.previousElementSibling?.previousElementSibling as HTMLElement
                    if (btn) {
                      const rect = btn.getBoundingClientRect()
                      el.style.top = `${rect.bottom + 4}px`
                      el.style.left = `${Math.min(rect.left, window.innerWidth - el.offsetWidth - 8)}px`
                    }
                  }
                }}
              >
                {/* View-only mode for non-admins */}
                {!canManage || !onToggleJobTitle ? (
                  <div className="p-3">
                    <div className="mb-2 text-[13px] font-medium text-ui-fg-secondary">
                      Job Title
                    </div>
                    {user.job_title ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: `${user.job_title.color}20`,
                            color: user.job_title.color,
                          }}
                        >
                          {(() => {
                            const TitleIcon = getTitleIcon(user.job_title.icon)
                            return <TitleIcon size={14} />
                          })()}
                        </div>
                        <span className="text-[13px] text-ui-fg">{user.job_title.name}</span>
                      </div>
                    ) : (
                      <div className="text-[13px] text-ui-fg-secondary">No title assigned</div>
                    )}
                  </div>
                ) : (
                  /* Edit mode for admins */
                  <>
                    <div className="px-2 py-1.5 border-b border-ui-divider">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-ui-fg-secondary"
                        />
                        <input
                          type="text"
                          placeholder="Search titles..."
                          value={titleSearch}
                          onChange={(e) => setTitleSearch(e.target.value)}
                          className="w-full pl-7 pr-2 py-1 text-[13px] bg-ui-bg border border-ui-divider rounded focus:outline-none focus:border-ui-accent"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {/* No title option */}
                      {(!titleSearch || 'no title'.includes(titleSearch.toLowerCase())) && (
                        <button
                          onClick={async () => {
                            if (!onToggleJobTitle || togglingTitle) return
                            setTogglingTitle(true)
                            await onToggleJobTitle(user, null)
                            setTogglingTitle(false)
                            setTitleDropdownOpen(false)
                            setTitleSearch('')
                          }}
                          disabled={togglingTitle}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left transition-colors hover:bg-ui-hover ${
                            !user.job_title ? 'text-ui-fg' : 'text-ui-fg-secondary'
                          }`}
                        >
                          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-ui-fg-secondary/20">
                            <X size={12} className="text-ui-fg-secondary" />
                          </div>
                          <span className="flex-1 truncate">No title</span>
                          {!user.job_title && (
                            <Check size={14} className="text-ui-success flex-shrink-0" />
                          )}
                        </button>
                      )}
                      {jobTitles
                        .filter(
                          (t) =>
                            !titleSearch ||
                            t.name.toLowerCase().includes(titleSearch.toLowerCase()),
                        )
                        .map((title) => {
                          const TitleIcon = getTitleIcon(title.icon)
                          const isSelected = user.job_title?.id === title.id
                          return (
                            <button
                              key={title.id}
                              onClick={async () => {
                                if (!onToggleJobTitle || togglingTitle) return
                                setTogglingTitle(true)
                                await onToggleJobTitle(user, title.id)
                                setTogglingTitle(false)
                                setTitleDropdownOpen(false)
                                setTitleSearch('')
                              }}
                              disabled={togglingTitle}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left transition-colors hover:bg-ui-hover"
                            >
                              <div
                                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${title.color}20`, color: title.color }}
                              >
                                {togglingTitle && isSelected ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <TitleIcon size={12} />
                                )}
                              </div>
                              <span className="flex-1 text-ui-fg truncate">{title.name}</span>
                              {isSelected && (
                                <Check size={14} className="text-ui-success flex-shrink-0" />
                              )}
                            </button>
                          )
                        })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Teams and Roles badges - side by side */}
      {!compact && (
        <div className="flex items-center gap-1.5">
          {/* Teams dropdown */}
          {teams && teams.length > 0 && (
            <div className="relative">
              <button
                onClick={() => {
                  // Always allow opening to view - admins can edit, others can just view
                  setTeamsDropdownOpen(!teamsDropdownOpen)
                  setRolesDropdownOpen(false)
                  setTitleDropdownOpen(false)
                }}
                className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
                  (user.teams || []).length > 0
                    ? 'bg-ui-field text-ui-fg-secondary hover:text-ui-fg'
                    : 'bg-ui-warning/15 text-ui-warning'
                }`}
                title={(user.teams || []).map((t) => t.name).join(', ') || 'No teams assigned'}
              >
                {(user.teams || []).length > 0 ? (
                  <span>
                    {(user.teams || []).length} team{(user.teams || []).length !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span>Unassigned</span>
                )}
                <ChevronDown size={12} />
              </button>

              {teamsDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[100]"
                    onClick={() => {
                      setTeamsDropdownOpen(false)
                      setTeamSearch('')
                    }}
                  />
                  <div
                    className="fixed z-[101] bg-ui-field border border-ui-divider rounded-lg shadow-xl py-1 min-w-[220px] max-h-[350px] flex flex-col"
                    ref={(el) => {
                      if (el) {
                        const btn = el.previousElementSibling?.previousElementSibling as HTMLElement
                        if (btn) {
                          const rect = btn.getBoundingClientRect()
                          el.style.top = `${rect.bottom + 4}px`
                          el.style.left = `${Math.min(rect.left, window.innerWidth - el.offsetWidth - 8)}px`
                        }
                      }
                    }}
                  >
                    {/* View-only mode for non-admins */}
                    {!canManage || !onToggleTeam ? (
                      <div className="p-3">
                        <div className="mb-2 text-[13px] font-medium text-ui-fg-secondary">
                          Teams
                        </div>
                        {(user.teams || []).length > 0 ? (
                          <div className="space-y-2">
                            {(user.teams || []).map((team) => {
                              const TeamIcon = getTeamIcon(team.icon)
                              return (
                                <div key={team.id} className="flex items-center gap-2">
                                  <div
                                    className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                                    style={{
                                      backgroundColor: `${team.color}20`,
                                      color: team.color,
                                    }}
                                  >
                                    <TeamIcon size={14} />
                                  </div>
                                  <span className="text-[13px] text-ui-fg">{team.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-[13px] text-ui-fg-secondary">No teams assigned</div>
                        )}
                      </div>
                    ) : (
                      /* Edit mode for admins */
                      <>
                        <div className="px-2 py-1.5 border-b border-ui-divider">
                          <div className="relative">
                            <Search
                              size={14}
                              className="absolute left-2 top-1/2 -translate-y-1/2 text-ui-fg-secondary"
                            />
                            <input
                              type="text"
                              placeholder="Search teams..."
                              value={teamSearch}
                              onChange={(e) => setTeamSearch(e.target.value)}
                              className="w-full pl-7 pr-2 py-1 text-[13px] bg-ui-bg border border-ui-divider rounded focus:outline-none focus:border-ui-accent"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="overflow-y-auto flex-1">
                          {teams
                            .filter(
                              (t) =>
                                !teamSearch ||
                                t.name.toLowerCase().includes(teamSearch.toLowerCase()),
                            )
                            .map((team) => {
                              const TeamIcon = getTeamIcon(team.icon)
                              const isInTeam = (user.teams || []).some((t) => t.id === team.id)
                              const isToggling = togglingTeam === team.id
                              return (
                                <button
                                  key={team.id}
                                  onClick={async () => {
                                    if (!onToggleTeam || isToggling) return
                                    setTogglingTeam(team.id)
                                    await onToggleTeam(user, team.id, !isInTeam)
                                    setTogglingTeam(null)
                                  }}
                                  disabled={isToggling}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left transition-colors hover:bg-ui-hover"
                                >
                                  <div
                                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                    style={{
                                      backgroundColor: `${team.color}20`,
                                      color: team.color,
                                    }}
                                  >
                                    {isToggling ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      <TeamIcon size={12} />
                                    )}
                                  </div>
                                  <span className="flex-1 text-ui-fg truncate">{team.name}</span>
                                  {isInTeam && (
                                    <Check size={14} className="text-ui-success flex-shrink-0" />
                                  )}
                                </button>
                              )
                            })}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Workflow roles dropdown */}
          {workflowRoles && workflowRoles.length > 0 && (
            <div className="relative">
              <button
                onClick={() => {
                  // Always allow opening to view - admins can edit, others can just view
                  setRolesDropdownOpen(!rolesDropdownOpen)
                  setTeamsDropdownOpen(false)
                  setTitleDropdownOpen(false)
                }}
                className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
                  (userWorkflowRoleIds || []).length > 0
                    ? 'bg-ui-field text-ui-fg-secondary hover:text-ui-fg'
                    : 'text-ui-fg-secondary hover:bg-ui-hover hover:text-ui-fg'
                }`}
                title={
                  (userWorkflowRoleIds || [])
                    .map((id) => workflowRoles.find((r) => r.id === id)?.name)
                    .filter(Boolean)
                    .join(', ') || 'No roles assigned'
                }
              >
                <span>
                  {(userWorkflowRoleIds || []).length > 0
                    ? `${(userWorkflowRoleIds || []).length} role${(userWorkflowRoleIds || []).length !== 1 ? 's' : ''}`
                    : 'No roles'}
                </span>
                <ChevronDown size={12} />
              </button>

              {rolesDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[100]"
                    onClick={() => {
                      setRolesDropdownOpen(false)
                      setRoleSearch('')
                    }}
                  />
                  <div
                    className="fixed z-[101] bg-ui-field border border-ui-divider rounded-lg shadow-xl py-1 min-w-[220px] max-h-[350px] flex flex-col"
                    ref={(el) => {
                      if (el) {
                        const btn = el.previousElementSibling?.previousElementSibling as HTMLElement
                        if (btn) {
                          const rect = btn.getBoundingClientRect()
                          el.style.top = `${rect.bottom + 4}px`
                          el.style.left = `${Math.min(rect.left, window.innerWidth - el.offsetWidth - 8)}px`
                        }
                      }
                    }}
                  >
                    {/* View-only mode for non-admins */}
                    {!canManage || !onToggleWorkflowRole ? (
                      <div className="p-3">
                        <div className="mb-2 text-[13px] font-medium text-ui-fg-secondary">
                          Workflow Roles
                        </div>
                        {(userWorkflowRoleIds || []).length > 0 ? (
                          <div className="space-y-2">
                            {(userWorkflowRoleIds || []).map((roleId) => {
                              const role = workflowRoles.find((r) => r.id === roleId)
                              if (!role) return null
                              const RoleIcon = getRoleIcon(role.icon)
                              return (
                                <div key={roleId} className="flex items-center gap-2">
                                  <div
                                    className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                                    style={{
                                      backgroundColor: `${role.color}20`,
                                      color: role.color,
                                    }}
                                  >
                                    <RoleIcon size={14} />
                                  </div>
                                  <span className="text-[13px] text-ui-fg">{role.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-[13px] text-ui-fg-secondary">No roles assigned</div>
                        )}
                      </div>
                    ) : (
                      /* Edit mode for admins */
                      <>
                        <div className="px-2 py-1.5 border-b border-ui-divider">
                          <div className="relative">
                            <Search
                              size={14}
                              className="absolute left-2 top-1/2 -translate-y-1/2 text-ui-fg-secondary"
                            />
                            <input
                              type="text"
                              placeholder="Search roles..."
                              value={roleSearch}
                              onChange={(e) => setRoleSearch(e.target.value)}
                              className="w-full pl-7 pr-2 py-1 text-[13px] bg-ui-bg border border-ui-divider rounded focus:outline-none focus:border-ui-accent"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="overflow-y-auto flex-1">
                          {workflowRoles
                            .filter(
                              (r) =>
                                !roleSearch ||
                                r.name.toLowerCase().includes(roleSearch.toLowerCase()),
                            )
                            .map((role) => {
                              const RoleIcon = getRoleIcon(role.icon)
                              const hasRole = (userWorkflowRoleIds || []).includes(role.id)
                              const isToggling = togglingRole === role.id
                              return (
                                <button
                                  key={role.id}
                                  onClick={async () => {
                                    if (!onToggleWorkflowRole || isToggling) return
                                    setTogglingRole(role.id)
                                    await onToggleWorkflowRole(user, role.id, !hasRole)
                                    setTogglingRole(null)
                                  }}
                                  disabled={isToggling}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left transition-colors hover:bg-ui-hover"
                                >
                                  <div
                                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                    style={{
                                      backgroundColor: `${role.color}20`,
                                      color: role.color,
                                    }}
                                  >
                                    {isToggling ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      <RoleIcon size={12} />
                                    )}
                                  </div>
                                  <span className="flex-1 text-ui-fg truncate">{role.name}</span>
                                  {hasRole && (
                                    <Check size={14} className="text-ui-success flex-shrink-0" />
                                  )}
                                </button>
                              )
                            })}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Workflow roles dropdown - compact mode (team member rows) */}
      {compact && workflowRoles && workflowRoles.length > 0 && (
        <div className="relative">
          <button
            onClick={() => {
              // Always allow opening to view - admins can edit, others can just view
              setRolesDropdownOpen(!rolesDropdownOpen)
            }}
            className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
              (userWorkflowRoleIds || []).length > 0
                ? 'bg-ui-field text-ui-fg-secondary hover:text-ui-fg'
                : 'text-ui-fg-secondary hover:bg-ui-hover hover:text-ui-fg'
            }`}
            title={
              (userWorkflowRoleIds || [])
                .map((id) => workflowRoles.find((r) => r.id === id)?.name)
                .filter(Boolean)
                .join(', ') || 'No roles'
            }
          >
            <span>
              {(userWorkflowRoleIds || []).length > 0
                ? `${(userWorkflowRoleIds || []).length} role${(userWorkflowRoleIds || []).length !== 1 ? 's' : ''}`
                : 'No roles'}
            </span>
            <ChevronDown size={12} />
          </button>

          {rolesDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => {
                  setRolesDropdownOpen(false)
                  setRoleSearch('')
                }}
              />
              <div
                className="fixed z-[101] bg-ui-field border border-ui-divider rounded-lg shadow-xl py-1 min-w-[220px] max-h-[350px] flex flex-col"
                ref={(el) => {
                  if (el) {
                    const btn = el.previousElementSibling?.previousElementSibling as HTMLElement
                    if (btn) {
                      const rect = btn.getBoundingClientRect()
                      el.style.top = `${rect.bottom + 4}px`
                      el.style.left = `${Math.min(rect.left, window.innerWidth - el.offsetWidth - 8)}px`
                    }
                  }
                }}
              >
                {/* View-only mode for non-admins */}
                {!canManage || !onToggleWorkflowRole ? (
                  <div className="p-3">
                    <div className="mb-2 text-[13px] font-medium text-ui-fg-secondary">
                      Workflow Roles
                    </div>
                    {(userWorkflowRoleIds || []).length > 0 ? (
                      <div className="space-y-2">
                        {(userWorkflowRoleIds || []).map((roleId) => {
                          const role = workflowRoles.find((r) => r.id === roleId)
                          if (!role) return null
                          const RoleIcon = getRoleIcon(role.icon)
                          return (
                            <div key={roleId} className="flex items-center gap-2">
                              <div
                                className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${role.color}20`, color: role.color }}
                              >
                                <RoleIcon size={14} />
                              </div>
                              <span className="text-[13px] text-ui-fg">{role.name}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-[13px] text-ui-fg-secondary">No roles assigned</div>
                    )}
                  </div>
                ) : (
                  /* Edit mode for admins */
                  <>
                    <div className="px-2 py-1.5 border-b border-ui-divider">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-ui-fg-secondary"
                        />
                        <input
                          type="text"
                          placeholder="Search roles..."
                          value={roleSearch}
                          onChange={(e) => setRoleSearch(e.target.value)}
                          className="w-full pl-7 pr-2 py-1 text-[13px] bg-ui-bg border border-ui-divider rounded focus:outline-none focus:border-ui-accent"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {workflowRoles
                        .filter(
                          (r) =>
                            !roleSearch || r.name.toLowerCase().includes(roleSearch.toLowerCase()),
                        )
                        .map((role) => {
                          const RoleIcon = getRoleIcon(role.icon)
                          const hasRole = (userWorkflowRoleIds || []).includes(role.id)
                          const isToggling = togglingRole === role.id
                          return (
                            <button
                              key={role.id}
                              onClick={async () => {
                                if (!onToggleWorkflowRole || isToggling) return
                                setTogglingRole(role.id)
                                await onToggleWorkflowRole(user, role.id, !hasRole)
                                setTogglingRole(null)
                              }}
                              disabled={isToggling}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left transition-colors hover:bg-ui-hover"
                            >
                              <div
                                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${role.color}20`, color: role.color }}
                              >
                                {isToggling ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <RoleIcon size={12} />
                                )}
                              </div>
                              <span className="flex-1 text-ui-fg truncate">{role.name}</span>
                              {hasRole && (
                                <Check size={14} className="text-ui-success flex-shrink-0" />
                              )}
                            </button>
                          )
                        })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Actions dropdown */}
      {(canManage || isRealAdmin) && (
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActionDropdownOpen(!actionDropdownOpen)}
            className={`!px-1.5 focus-visible:opacity-100 ${
              actionDropdownOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            icon={<MoreVertical size={16} />}
            title="More actions"
            aria-label="More actions"
          />

          {actionDropdownOpen && (
            <>
              {/* Backdrop to close dropdown */}
              <div className="fixed inset-0 z-[100]" onClick={() => setActionDropdownOpen(false)} />

              <div
                className="fixed z-[101] bg-ui-field border border-ui-divider rounded-lg shadow-xl py-1 min-w-[200px]"
                ref={(el) => {
                  if (el) {
                    const btn = el.previousElementSibling?.previousElementSibling as HTMLElement
                    if (btn) {
                      const rect = btn.getBoundingClientRect()
                      const menuHeight = el.offsetHeight
                      const spaceBelow = window.innerHeight - rect.bottom
                      const spaceAbove = rect.top

                      // Position above if not enough space below
                      if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
                        el.style.bottom = `${window.innerHeight - rect.top + 4}px`
                        el.style.top = 'auto'
                      } else {
                        el.style.top = `${rect.bottom + 4}px`
                        el.style.bottom = 'auto'
                      }

                      // Align right edge with button
                      el.style.right = `${window.innerWidth - rect.right}px`
                    }
                  }
                }}
              >
                {/* View Profile */}
                <button
                  onClick={() => {
                    onViewProfile()
                    setActionDropdownOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left text-ui-fg hover:bg-ui-hover transition-colors"
                >
                  <User size={14} />
                  View Profile
                </button>

                {/* View Net Permissions */}
                {onViewNetPermissions && (
                  <button
                    onClick={() => {
                      onViewNetPermissions()
                      setActionDropdownOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left text-ui-fg hover:bg-ui-hover transition-colors"
                  >
                    <FileKey size={14} />
                    View Net Permissions
                  </button>
                )}

                {/* Simulate Permissions (impersonate) */}
                {isRealAdmin && !isCurrentUser && onSimulatePermissions && (
                  <button
                    onClick={() => {
                      onSimulatePermissions()
                      setActionDropdownOpen(false)
                    }}
                    disabled={isSimulating}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left transition-colors ${
                      isSimulating
                        ? 'bg-ui-selected text-ui-fg'
                        : 'text-ui-fg hover:bg-ui-hover'
                    }`}
                  >
                    <UserCog size={14} />
                    {isSimulating ? 'Currently Simulating' : 'Simulate Permissions'}
                  </button>
                )}

                {/* Divider */}
                {canManage && <div className="my-1 border-t border-ui-divider" />}

                {/* Individual permissions */}
                {onPermissions && canManage && (
                  <button
                    onClick={() => {
                      onPermissions()
                      setActionDropdownOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left text-ui-fg hover:bg-ui-hover transition-colors"
                  >
                    <Shield size={14} />
                    Individual Permissions
                  </button>
                )}

                {/* Individual vault access */}
                {canManage && !compact && (
                  <button
                    onClick={() => {
                      onVaultAccess()
                      setActionDropdownOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left text-ui-fg hover:bg-ui-hover transition-colors"
                  >
                    <Database size={14} />
                    Manage Vault Access
                  </button>
                )}

                {/* Remove from team */}
                {canManage && onRemoveFromTeam && (
                  <>
                    <div className="my-1 border-t border-ui-divider" />
                    <button
                      onClick={() => {
                        onRemoveFromTeam()
                        setActionDropdownOpen(false)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left text-ui-warning hover:bg-ui-warning/10 transition-colors"
                    >
                      <X size={14} />
                      Remove from Team
                    </button>
                  </>
                )}

                {/* Remove from organization */}
                {canManage && !isCurrentUser && (
                  <>
                    {!onRemoveFromTeam && <div className="my-1 border-t border-ui-divider" />}
                    <button
                      onClick={() => {
                        onRemove()
                        setActionDropdownOpen(false)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] text-left text-ui-danger hover:bg-ui-danger/10 transition-colors"
                    >
                      <UserMinus size={14} />
                      Remove from Organization
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
