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
  AlertTriangle
} from 'lucide-react'
import { PermissionsEditor } from '@/features/settings/organization/PermissionsEditor'
import { usePDMStore } from '@/stores/pdmStore'
import { useTeams, useMembers, useVaultAccess, useTeamDialogs } from '../hooks'
import { useFilteredData } from '../hooks/useFilteredData'
import { ConnectedUserRow } from '../components/user'
import {
  TeamFormDialog,
  DeleteTeamDialog
} from '../components/dialogs'
import {
  TeamMembersDialog,
  TeamModulesDialog,
  TeamVaultAccessDialog
} from '../components/team'

export interface TeamsTabProps {
  /** Search query for filtering teams */
  searchQuery?: string
}

export function TeamsTab({ searchQuery = '' }: TeamsTabProps) {
  // Get user/org info from store
  const { user, organization, setOrganization, getEffectiveRole } = usePDMStore()
  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'

  // Data hooks
  const {
    teams,
    loadTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    setDefaultTeam
  } = useTeams(orgId)
  
  const { members: orgUsers, loadMembers: loadOrgUsers } = useMembers(orgId)
  
  const {
    vaults: orgVaults,
    teamVaultAccessMap,
    saveTeamVaultAccess
  } = useVaultAccess(orgId)

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
    openModulesDialog
  } = useTeamDialogs()

  // Local UI state
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [isSavingDefaultTeam, setIsSavingDefaultTeam] = useState(false)

  // Handlers
  const toggleTeamExpand = (teamId: string) => {
    setExpandedTeams(prev => {
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
        organization as OrgWithDefaultTeam
      )
    } finally {
      setIsSavingDefaultTeam(false)
    }
  }

  const openTeamVaultAccessDialog = (team: typeof teams[0]) => {
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
        selectedTeam.name
      )
      if (success) {
        setShowTeamVaultAccessDialog(false)
        setSelectedTeam(null)
      }
    } finally {
      setIsSavingTeamVaultAccess(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Default Team for New Users Setting */}
      {isAdmin && teams.length > 0 && (
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-plm-accent/10">
                <UserPlus size={18} className="text-plm-accent" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-plm-fg">Default Team for New Users</h4>
                <p className="text-xs text-plm-fg-muted">
                  Users joining via org code (or invited without specific teams) will be added here
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={(organization as { default_new_user_team_id?: string | null } | null)?.default_new_user_team_id || ''}
                onChange={(e) => handleSetDefaultTeam(e.target.value || null)}
                disabled={isSavingDefaultTeam}
                className="px-3 py-1.5 text-sm bg-plm-bg-secondary border border-plm-border rounded-lg text-plm-fg focus:outline-none focus:border-plm-accent disabled:opacity-50"
              >
                <option value="">Unassigned (no team permissions)</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
              {isSavingDefaultTeam && (
                <Loader2 size={14} className="animate-spin text-plm-fg-muted" />
              )}
            </div>
          </div>
          {!(organization as { default_new_user_team_id?: string | null } | null)?.default_new_user_team_id && (
            <p className="mt-2 text-xs text-yellow-500 flex items-center gap-1">
              <AlertTriangle size={12} />
              New users will have no team permissions until manually assigned
            </p>
          )}
        </div>
      )}
      
      {filteredTeams.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-plm-border rounded-lg">
          <Users size={36} className="mx-auto text-plm-fg-muted mb-3 opacity-50" />
          <p className="text-sm text-plm-fg-muted mb-4">No teams yet</p>
          {isAdmin && (
            <button
              onClick={() => {
                resetTeamForm()
                setShowCreateTeamDialog(true)
              }}
              className="btn btn-primary btn-sm"
            >
              <Plus size={14} className="mr-1" />
              Create First Team
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg bg-plm-bg/50 ring-1 ring-white/5 divide-y divide-white/10">
          {filteredTeams.map(team => {
            const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[team.icon] || Users
            const isExpanded = expandedTeams.has(team.id)
            const teamMembers = orgUsers.filter(u => u.teams?.some(t => t.id === team.id))
            const teamVaults = teamVaultAccessMap[team.id] || []
            
            return (
              <div
                key={team.id}
                className={`overflow-hidden transition-all first:rounded-t-lg last:rounded-b-lg ${
                  isExpanded 
                    ? 'bg-plm-bg/30 ring-1 ring-plm-accent/30 relative z-10 rounded-lg -mx-1 px-1' 
                    : ''
                }`}
                style={isExpanded ? { boxShadow: '0 0 30px 8px rgba(0,0,0,0.5), 0 0 60px 15px rgba(0,0,0,0.3)' } : undefined}
              >
                {/* Team Header */}
                <div
                  className={`flex items-center gap-3 p-3 cursor-pointer transition-colors border-l-[3px] ${
                    isExpanded 
                      ? 'bg-plm-highlight/40' 
                      : 'hover:bg-plm-highlight'
                  }`}
                  style={{ borderLeftColor: team.color }}
                  onClick={() => toggleTeamExpand(team.id)}
                >
                  <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${team.color}20`, color: team.color }}
                  >
                    <IconComponent size={18} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-plm-fg truncate">{team.name}</h4>
                      {team.is_default && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-plm-accent/20 text-plm-accent uppercase">
                          Default
                        </span>
                      )}
                      {team.is_system && (
                        <Star size={12} className="text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                    <div className="text-xs text-plm-fg-muted flex items-center gap-3">
                      <span>{team.member_count} member{team.member_count !== 1 ? 's' : ''}</span>
                      <span>•</span>
                      <span>{team.permissions_count} permission{team.permissions_count !== 1 ? 's' : ''}</span>
                      {teamVaults.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Database size={10} />
                            {teamVaults.length} vault{teamVaults.length !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded ? (
                    <ChevronDown size={18} className="text-plm-fg-muted" />
                  ) : (
                    <ChevronRight size={18} className="text-plm-fg-muted" />
                  )}
                </div>
                
                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-white/10">
                    {/* Team Actions */}
                    {isAdmin && (
                      <div className="p-3 bg-plm-bg/30 border-b border-white/10 flex flex-wrap gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTeam(team)
                            setShowTeamMembersDialog(true)
                          }}
                          className="btn btn-ghost btn-sm flex items-center gap-1.5"
                        >
                          <UserPlus size={14} />
                          Manage Members
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTeam(team)
                            setShowPermissionsEditor(true)
                          }}
                          className="btn btn-ghost btn-sm flex items-center gap-1.5"
                        >
                          <Shield size={14} />
                          Permissions
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openTeamVaultAccessDialog(team)
                          }}
                          className="btn btn-ghost btn-sm flex items-center gap-1.5"
                        >
                          <Database size={14} />
                          Vault Access
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openModulesDialog(team)
                          }}
                          className={`btn btn-ghost btn-sm flex items-center gap-1.5 ${
                            team.module_defaults ? 'text-green-400' : ''
                          }`}
                        >
                          <LayoutGrid size={14} />
                          Modules
                          {team.module_defaults && (
                            <span className="text-[8px] uppercase tracking-wide opacity-75">✓</span>
                          )}
                        </button>
                        {!team.is_system && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                openEditTeamDialog(team)
                              }}
                              className="btn btn-ghost btn-sm flex items-center gap-1.5"
                            >
                              <Pencil size={14} />
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedTeam(team)
                                setShowDeleteTeamDialog(true)
                              }}
                              className="btn btn-ghost btn-sm flex items-center gap-1.5 text-plm-error hover:bg-plm-error/10"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </>
                        )}
                        {team.is_system && (
                          <span className="text-xs text-plm-fg-muted flex items-center gap-1 ml-auto">
                            <Star size={12} className="text-yellow-500 fill-yellow-500" />
                            Required
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Team Members List */}
                    <div>
                      {teamMembers.length === 0 ? (
                        <p className="text-sm text-plm-fg-muted text-center py-4">
                          No members in this team
                        </p>
                      ) : (
                        <div className="divide-y divide-white/10">
                          {teamMembers.map(member => (
                            <ConnectedUserRow
                              key={member.id}
                              user={member}
                              teamContext={{ teamId: team.id, teamName: team.name }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
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
    </div>
  )
}
