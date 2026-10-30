/**
 * TeamsTab - Displays and manages organization teams
 *
 * This component uses hooks directly instead of context:
 * - usePDMStore for user/org info
 * - useTeams for team data
 * - useMembers for user data
 * - useVaultAccess for vault data
 * - useTeamDialogs for dialog state
 */
import { useState } from 'react'
import * as LucideIcons from 'lucide-react'
import {
  Users,
  Plus,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Shield,
  Pencil,
  Trash2,
  Database,
  Star,
  LayoutGrid,
  Loader2,
  AlertTriangle,
  ClipboardCheck,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button, Select } from '@/components/core/ui'
import { PermissionsEditor } from '@/features/settings/organization/PermissionsEditor'
import { usePDMStore } from '@/stores/pdmStore'

import { SettingRow, SettingsGroup } from '../../../components/ui'
import { useTeams, useMembers, useVaultAccess, useTeamDialogs } from '../hooks'
import { useFilteredData } from '../hooks/useFilteredData'
import { ConnectedUserRow } from '../components/user'
import { TeamFormDialog, DeleteTeamDialog } from '../components/dialogs'
import { TeamMembersDialog, TeamModulesDialog, TeamVaultAccessDialog } from '../components/team'
import { TeamReviewersDialog } from '../components/team/TeamReviewersDialog'

export interface TeamsTabProps {
  /** Search query for filtering teams */
  searchQuery?: string
  /** Called when the "Add Team" button should trigger a dialog in the parent */
  onShowCreateTeamDialog?: () => void
}

export function TeamsTab({ searchQuery = '', onShowCreateTeamDialog }: TeamsTabProps) {
  // Get user/org info from store
  const { user, organization, setOrganization, getEffectiveRole, workflowRoles } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      organization: s.organization,
      setOrganization: s.setOrganization,
      getEffectiveRole: s.getEffectiveRole,
      workflowRoles: s.workflowRoles,
    })),
  )
  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'

  // Data hooks
  const { teams, loadTeams, createTeam, updateTeam, deleteTeam, setDefaultTeam } = useTeams(orgId)

  const { members: orgUsers, loadMembers: loadOrgUsers } = useMembers(orgId)

  const { vaults: orgVaults, teamVaultAccessMap, saveTeamVaultAccess } = useVaultAccess(orgId)

  // Filtered data
  const { filteredTeams } = useFilteredData({ orgUsers, teams, searchQuery })

  // Dialog state
  const {
    selectedTeam,
    setSelectedTeam,
    showCreateTeamDialog,
    setShowCreateTeamDialog,
    showEditTeamDialog,
    setShowEditTeamDialog,
    showDeleteTeamDialog,
    setShowDeleteTeamDialog,
    showTeamMembersDialog,
    setShowTeamMembersDialog,
    showTeamVaultAccessDialog,
    setShowTeamVaultAccessDialog,
    showPermissionsEditor,
    setShowPermissionsEditor,
    showModulesDialog,
    setShowModulesDialog,
    showTeamReviewersDialog,
    setShowTeamReviewersDialog,
    teamFormData,
    setTeamFormData,
    isSavingTeam,
    setIsSavingTeam,
    copyFromTeamId,
    setCopyFromTeamId,
    pendingTeamVaultAccess,
    setPendingTeamVaultAccess,
    isSavingTeamVaultAccess,
    setIsSavingTeamVaultAccess,
    resetTeamForm,
    openEditTeamDialog,
    openModulesDialog,
    openTeamReviewersDialog,
  } = useTeamDialogs()

  // Local UI state
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [isSavingDefaultTeam, setIsSavingDefaultTeam] = useState(false)

  // Handlers
  const toggleTeamExpand = (teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) {
        next.delete(teamId)
      } else {
        next.add(teamId)
      }
      return next
    })
  }

  const handleCreateTeam = async () => {
    setIsSavingTeam(true)
    try {
      const success = await createTeam(teamFormData, copyFromTeamId)
      if (success) {
        setShowCreateTeamDialog(false)
        resetTeamForm()
      }
    } finally {
      setIsSavingTeam(false)
    }
  }

  const handleUpdateTeam = async () => {
    if (!selectedTeam) return
    setIsSavingTeam(true)
    try {
      const success = await updateTeam(selectedTeam.id, teamFormData)
      if (success) {
        setShowEditTeamDialog(false)
        setSelectedTeam(null)
      }
    } finally {
      setIsSavingTeam(false)
    }
  }

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return
    setIsSavingTeam(true)
    try {
      const success = await deleteTeam(selectedTeam.id)
      if (success) {
        setShowDeleteTeamDialog(false)
        setSelectedTeam(null)
      }
    } finally {
      setIsSavingTeam(false)
    }
  }

  const handleSetDefaultTeam = async (teamId: string | null) => {
    if (!organization) return
    setIsSavingDefaultTeam(true)
    try {
      // Cast to satisfy the generic constraint - the DB column exists even if type doesn't include it
      type OrgWithDefaultTeam = typeof organization & { default_new_user_team_id?: string | null }
      await setDefaultTeam(
        teamId,
        organization.id,
        setOrganization as (org: OrgWithDefaultTeam) => void,
        organization as OrgWithDefaultTeam,
      )
    } finally {
      setIsSavingDefaultTeam(false)
    }
  }

  const openTeamVaultAccessDialog = (team: (typeof teams)[0]) => {
    setSelectedTeam(team)
    setPendingTeamVaultAccess(teamVaultAccessMap[team.id] || [])
    setShowTeamVaultAccessDialog(true)
  }

  const handleSaveTeamVaultAccess = async () => {
    if (!selectedTeam) return
    setIsSavingTeamVaultAccess(true)
    try {
      const success = await saveTeamVaultAccess(
        selectedTeam.id,
        pendingTeamVaultAccess,
        selectedTeam.name,
      )
      if (success) {
        setShowTeamVaultAccessDialog(false)
        setSelectedTeam(null)
      }
    } finally {
      setIsSavingTeamVaultAccess(false)
    }
  }

  const defaultTeamId =
    (organization as { default_new_user_team_id?: string | null } | null)
      ?.default_new_user_team_id || ''

  return (
    <div className="space-y-4">
      {/* Default Team for New Users Setting */}
      {isAdmin && teams.length > 0 && (
        <SettingsGroup>
          <SettingRow
            label="Default Team for New Users"
            htmlFor="default-new-user-team"
            description={
              defaultTeamId ? (
                'Users joining via org code (or invited without specific teams) will be added here'
              ) : (
                <span className="flex items-center gap-1 text-ui-warning">
                  <AlertTriangle size={12} />
                  New users will have no team permissions until manually assigned
                </span>
              )
            }
          >
            {isSavingDefaultTeam && (
              <Loader2 size={14} className="animate-spin text-ui-fg-secondary" />
            )}
            <Select
              id="default-new-user-team"
              size="sm"
              value={defaultTeamId}
              onChange={(e) => handleSetDefaultTeam(e.target.value || null)}
              disabled={isSavingDefaultTeam}
            >
              <option value="">Unassigned (no team permissions)</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </SettingRow>
        </SettingsGroup>
      )}

      {filteredTeams.length === 0 ? (
        <SettingsGroup>
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <span className="text-[13px] text-ui-fg-secondary">No teams yet</span>
            {isAdmin && onShowCreateTeamDialog && (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={onShowCreateTeamDialog}
              >
                Create First Team
              </Button>
            )}
          </div>
        </SettingsGroup>
      ) : (
        <SettingsGroup>
          {filteredTeams.map((team) => {
            const IconComponent =
              (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[
                team.icon
              ] || Users
            const isExpanded = expandedTeams.has(team.id)
            const teamMembers = orgUsers.filter((u) => u.teams?.some((t) => t.id === team.id))
            const teamVaults = teamVaultAccessMap[team.id] || []

            return (
              <div key={team.id}>
                {/* Team Header */}
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isExpanded ? 'bg-ui-hover/40' : 'hover:bg-ui-hover/40'
                  }`}
                  onClick={() => toggleTeamExpand(team.id)}
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="flex-shrink-0 text-ui-fg-secondary" />
                  ) : (
                    <ChevronRight size={14} className="flex-shrink-0 text-ui-fg-secondary" />
                  )}
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${team.color}20`, color: team.color }}
                  >
                    <IconComponent size={16} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-ui-fg">
                        {team.name}
                      </span>
                      {team.is_default && <Badge tone="accent">Default</Badge>}
                      {team.is_system && (
                        <Badge tone="warning" icon={<Star size={10} className="fill-current" />}>
                          Required
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px] text-ui-fg-secondary">
                      <span>
                        {team.member_count} member{team.member_count !== 1 ? 's' : ''}
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        {team.permissions_count} permission{team.permissions_count !== 1 ? 's' : ''}
                      </span>
                      {teamVaults.length > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="flex items-center gap-1">
                            <Database size={10} />
                            {teamVaults.length} vault{teamVaults.length !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-ui-divider bg-ui-bg/40">
                    {/* Team Actions */}
                    {isAdmin && (
                      <div className="flex flex-wrap items-center gap-1 border-b border-ui-divider px-4 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<UserPlus size={14} />}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTeam(team)
                            setShowTeamMembersDialog(true)
                          }}
                        >
                          Manage Members
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Shield size={14} />}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTeam(team)
                            setShowPermissionsEditor(true)
                          }}
                        >
                          Permissions
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Database size={14} />}
                          onClick={(e) => {
                            e.stopPropagation()
                            openTeamVaultAccessDialog(team)
                          }}
                        >
                          Vault Access
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<ClipboardCheck size={14} />}
                          onClick={(e) => {
                            e.stopPropagation()
                            openTeamReviewersDialog(team)
                          }}
                        >
                          Reviewers
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<LayoutGrid size={14} />}
                          onClick={(e) => {
                            e.stopPropagation()
                            openModulesDialog(team)
                          }}
                        >
                          Modules
                          {team.module_defaults && <Badge tone="success">Set</Badge>}
                        </Button>
                        {!team.is_system && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Pencil size={14} />}
                              onClick={(e) => {
                                e.stopPropagation()
                                openEditTeamDialog(team)
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto !text-ui-danger hover:!bg-ui-danger/10"
                              icon={<Trash2 size={14} />}
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedTeam(team)
                                setShowDeleteTeamDialog(true)
                              }}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Team Members List */}
                    {teamMembers.length === 0 ? (
                      <p className="px-4 py-3 text-[13px] text-ui-fg-secondary">
                        No members in this team
                      </p>
                    ) : (
                      <div className="divide-y divide-ui-divider pl-11 pr-4">
                        {teamMembers.map((member) => (
                          <ConnectedUserRow
                            key={member.id}
                            user={member}
                            teamContext={{ teamId: team.id, teamName: team.name }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </SettingsGroup>
      )}

      {/* Dialogs */}
      {showCreateTeamDialog && (
        <TeamFormDialog
          title="Create Team"
          formData={teamFormData}
          setFormData={setTeamFormData}
          onSave={handleCreateTeam}
          onCancel={() => setShowCreateTeamDialog(false)}
          isSaving={isSavingTeam}
          existingTeams={teams}
          copyFromTeamId={copyFromTeamId}
          setCopyFromTeamId={setCopyFromTeamId}
        />
      )}

      {showEditTeamDialog && selectedTeam && (
        <TeamFormDialog
          title="Edit Team"
          formData={teamFormData}
          setFormData={setTeamFormData}
          onSave={handleUpdateTeam}
          onCancel={() => {
            setShowEditTeamDialog(false)
            setSelectedTeam(null)
          }}
          isSaving={isSavingTeam}
        />
      )}

      {showDeleteTeamDialog && selectedTeam && (
        <DeleteTeamDialog
          team={selectedTeam}
          onConfirm={handleDeleteTeam}
          onClose={() => setShowDeleteTeamDialog(false)}
          isDeleting={isSavingTeam}
        />
      )}

      {showTeamMembersDialog && selectedTeam && (
        <TeamMembersDialog
          team={selectedTeam}
          orgUsers={orgUsers}
          onClose={() => {
            setShowTeamMembersDialog(false)
            setSelectedTeam(null)
            loadTeams()
            loadOrgUsers()
          }}
          userId={user?.id}
        />
      )}

      {showTeamVaultAccessDialog && selectedTeam && (
        <TeamVaultAccessDialog
          team={selectedTeam}
          orgVaults={orgVaults}
          pendingVaultAccess={pendingTeamVaultAccess}
          setPendingVaultAccess={setPendingTeamVaultAccess}
          onSave={handleSaveTeamVaultAccess}
          onClose={() => setShowTeamVaultAccessDialog(false)}
          isSaving={isSavingTeamVaultAccess}
        />
      )}

      {showPermissionsEditor && selectedTeam && (
        <PermissionsEditor
          team={selectedTeam}
          onClose={() => {
            setShowPermissionsEditor(false)
            setSelectedTeam(null)
            loadTeams()
          }}
          userId={user?.id}
          isAdmin={isAdmin}
        />
      )}

      {showModulesDialog && selectedTeam && (
        <TeamModulesDialog
          team={selectedTeam}
          onClose={() => {
            setShowModulesDialog(false)
            setSelectedTeam(null)
            loadTeams()
          }}
        />
      )}

      {showTeamReviewersDialog && selectedTeam && (
        <TeamReviewersDialog
          team={selectedTeam}
          orgUsers={orgUsers}
          workflowRoles={workflowRoles}
          onClose={() => {
            setShowTeamReviewersDialog(false)
            setSelectedTeam(null)
          }}
          userId={user?.id}
        />
      )}
    </div>
  )
}
