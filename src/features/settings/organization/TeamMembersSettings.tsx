/**
 * TeamMembersSettings - Main component for team members management
 *
 * This component uses hooks directly to manage state:
 * - usePDMStore for organization data
 * - useTeams, useMembers, useWorkflowRoles, useJobTitles for data
 * - useTeamDialogs, useUserDialogs, etc. for dialog state
 * - useOrgCode for organization code management
 * - OrganizationAccessSection (admin only) for the organization code and email domains
 *
 * IMPORTANT: Create dialogs are rendered here (not in tabs) because the header
 * buttons use the hook instances from this component. Tabs render their own
 * edit/delete dialogs which are triggered from within the tabs.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Briefcase,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button, TextInput } from '@/components/core/ui'
import { log } from '@/lib/logger'
import { subscribeToMemberChanges } from '@/lib/realtime'
import { getCurrentConfig } from '@/lib/supabase'
import { generateOrgCode } from '@/lib/supabaseConfig'
import { usePDMStore } from '@/stores/pdmStore'

import { SettingsPage, SettingsSection } from '../components/ui'
import {
  UsersTab,
  TeamsTab,
  RolesTab,
  TitlesTab,
  // Data hooks
  useTeams,
  useMembers,
  useWorkflowRoles,
  useJobTitles,
  useVaultAccess,
  useInvites,
  // Dialog state hooks
  useTeamDialogs,
  useUserDialogs,
  useWorkflowRoleDialogs,
  useJobTitleDialogs,
  useOrgCode,
  // Dialog components
  CreateUserDialog,
  TeamFormDialog,
  WorkflowRoleFormDialog,
  JobTitleFormDialog,
} from './team-members'
import { OrganizationAccessSection } from './team-members/components/OrganizationAccessSection'

type TabType = 'users' | 'teams' | 'roles' | 'titles'

const TABS: readonly { id: TabType; label: string; icon: ReactNode; search: string }[] = [
  { id: 'users', label: 'Users', icon: <UsersRound size={14} />, search: 'Search users...' },
  { id: 'teams', label: 'Teams', icon: <Users size={14} />, search: 'Search teams...' },
  { id: 'roles', label: 'Roles', icon: <Shield size={14} />, search: 'Search roles...' },
  { id: 'titles', label: 'Titles', icon: <Briefcase size={14} />, search: 'Search titles...' },
]

const TAB_DESCRIPTIONS: Record<TabType, string> = {
  users: 'Manage individual users in your organization',
  teams: 'Organize members into teams and manage permissions',
  roles: 'Define workflow roles for approvals and reviews',
  titles: 'Manage job titles for your organization',
}

/**
 * Main TeamMembersSettings component
 */
export function TeamMembersSettings() {
  // ===== STORE STATE =====
  const { user, organization, getEffectiveRole, apiServerUrl } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      organization: s.organization,
      getEffectiveRole: s.getEffectiveRole,
      apiServerUrl: s.apiServerUrl,
    })),
  )
  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'

  // ===== DATA HOOKS =====
  const { teams, isLoading: teamsLoading, loadTeams, createTeam } = useTeams(orgId)
  const { members: orgUsers, isLoading: membersLoading, loadMembers } = useMembers(orgId)
  const { loadPendingMembers } = useInvites(orgId)
  const {
    workflowRoles,
    isLoading: rolesLoading,
    loadWorkflowRoles,
    createWorkflowRole,
  } = useWorkflowRoles(orgId)
  const { jobTitles, isLoading: titlesLoading, loadJobTitles, createJobTitle } = useJobTitles(orgId)
  const { vaults } = useVaultAccess(orgId)

  const isLoading = teamsLoading || membersLoading || rolesLoading || titlesLoading

  // ===== UI STATE (local) =====
  const [activeTab, setActiveTab] = useState<TabType>('users')

  // Other screens open this page on a given tab (workflow dialogs send 'users')
  useEffect(() => {
    const handleSwitchTab = (e: Event) => {
      const tab = (e as CustomEvent<TabType>).detail
      if (TABS.some((entry) => entry.id === tab)) setActiveTab(tab)
    }
    window.addEventListener('navigate-team-members-tab', handleSwitchTab)
    return () => window.removeEventListener('navigate-team-members-tab', handleSwitchTab)
  }, [])
  const [searchQuery, setSearchQuery] = useState('')

  // ===== ORG CODE STATE =====
  const { orgCode, setOrgCode, codeCopied, setCodeCopied } = useOrgCode()

  // ===== DIALOG STATE HOOKS =====
  // These hooks manage dialog visibility state
  // Dialogs are rendered HERE in the parent so header buttons work
  const {
    showCreateTeamDialog,
    setShowCreateTeamDialog,
    teamFormData,
    setTeamFormData,
    isSavingTeam,
    setIsSavingTeam,
    copyFromTeamId,
    setCopyFromTeamId,
    resetTeamForm,
  } = useTeamDialogs()

  const { showCreateUserDialog, setShowCreateUserDialog } = useUserDialogs()

  const {
    showCreateWorkflowRoleDialog,
    setShowCreateWorkflowRoleDialog,
    workflowRoleFormData,
    setWorkflowRoleFormData,
    isSavingWorkflowRole,
    setIsSavingWorkflowRole,
  } = useWorkflowRoleDialogs()

  const {
    showCreateTitleDialog,
    setShowCreateTitleDialog,
    newTitleName,
    setNewTitleName,
    newTitleColor,
    setNewTitleColor,
    newTitleIcon,
    setNewTitleIcon,
    isCreatingTitle,
    setIsCreatingTitle,
    editingJobTitle,
    pendingTitleForUser,
    openCreateTitleDialog: openCreateJobTitle,
    resetTitleForm,
  } = useJobTitleDialogs()

  // ===== DIALOG HANDLERS =====
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

  const handleCreateWorkflowRole = async () => {
    setIsSavingWorkflowRole(true)
    try {
      const success = await createWorkflowRole(workflowRoleFormData)
      if (success) {
        setShowCreateWorkflowRoleDialog(false)
        setWorkflowRoleFormData({ name: '', color: '#8b5cf6', icon: 'Shield', description: '' })
      }
    } finally {
      setIsSavingWorkflowRole(false)
    }
  }

  const handleCreateJobTitle = async () => {
    if (!newTitleName.trim()) return
    setIsCreatingTitle(true)
    try {
      const success = await createJobTitle(
        newTitleName.trim(),
        newTitleColor,
        newTitleIcon,
        pendingTitleForUser?.id,
      )
      if (success) {
        setShowCreateTitleDialog(false)
        resetTitleForm()
      }
    } finally {
      setIsCreatingTitle(false)
    }
  }

  // Generate org code for invite dialog
  const getOrgCodeForDialog = () => {
    const config = getCurrentConfig()
    return config ? generateOrgCode(config, organization?.slug) : undefined
  }

  // ===== ORG CODE EFFECT =====
  // Pre-generate org code so it's ready to display
  useEffect(() => {
    if (!orgCode && organization?.slug) {
      const config = getCurrentConfig()
      if (config) {
        setOrgCode(generateOrgCode(config, organization.slug))
      }
    }
  }, [organization?.slug, orgCode, setOrgCode])

  // ===== DATA LOADING =====
  const loadAllData = useCallback(async () => {
    await Promise.all([loadTeams(), loadMembers()])
  }, [loadTeams, loadMembers])

  // ===== REALTIME SUBSCRIPTION =====
  // Subscribe to member attribute changes (teams, roles, titles) for instant sync
  useEffect(() => {
    if (!orgId) return

    const unsubscribe = subscribeToMemberChanges(orgId, (changeType, _eventType, _userId) => {
      // Debounce rapid updates - just reload the affected data
      log.info('[TeamMembers]', 'Realtime member change', { changeType })

      switch (changeType) {
        case 'team_member':
          loadMembers()
          loadTeams() // Team member counts may have changed
          break
        case 'workflow_role':
          loadWorkflowRoles()
          break
        case 'job_title':
          loadJobTitles()
          loadMembers() // Member list shows job titles
          break
      }
    })

    return unsubscribe
  }, [orgId, loadMembers, loadTeams, loadWorkflowRoles, loadJobTitles])

  // ===== RENDER =====
  if (!organization) {
    return <div className="py-12 text-center text-plm-fg-muted">No organization connected</div>
  }

  const counts: Record<TabType, number> = {
    users: orgUsers.length,
    teams: teams.length,
    roles: workflowRoles.length,
    titles: jobTitles.length,
  }
  const activeSearch = TABS.find((tab) => tab.id === activeTab)?.search

  const addAction: { label: string; title: string; icon: ReactNode; onClick: () => void } =
    activeTab === 'users'
      ? {
          label: 'Add User',
          title: 'Add user',
          icon: <UserPlus size={14} />,
          onClick: () => setShowCreateUserDialog(true),
        }
      : activeTab === 'teams'
        ? {
            label: 'Add Team',
            title: 'Add team',
            icon: <Plus size={14} />,
            onClick: () => {
              resetTeamForm()
              setShowCreateTeamDialog(true)
            },
          }
        : activeTab === 'roles'
          ? {
              label: 'Add Role',
              title: 'Add role',
              icon: <Plus size={14} />,
              onClick: () => setShowCreateWorkflowRoleDialog(true),
            }
          : {
              label: 'Add Title',
              title: 'Add title',
              icon: <Plus size={14} />,
              onClick: () => openCreateJobTitle(),
            }

  return (
    <SettingsPage>
      {/* Organization access settings (admin only) */}
      {isAdmin && (
        <OrganizationAccessSection
          orgSlug={organization.slug}
          orgCode={orgCode}
          setOrgCode={setOrgCode}
          codeCopied={codeCopied}
          setCodeCopied={setCodeCopied}
        />
      )}

      <SettingsSection title="Members" description={TAB_DESCRIPTIONS[activeTab]}>
        {/* Tab bar, search and the active tab's actions */}
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-plm-border">
          <div role="tablist" aria-label="Members" className="-mb-px flex items-center gap-5">
            {TABS.map((tab) => {
              const selected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 border-b-2 px-0.5 pb-2.5 pt-1 text-[13px] font-medium outline-none transition-colors focus-visible:text-plm-fg ${
                    selected
                      ? 'border-plm-accent text-plm-fg'
                      : 'border-transparent text-plm-fg-muted hover:text-plm-fg'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {counts[tab.id] > 0 && (
                    <span className="text-[11px] font-normal tabular-nums text-plm-fg-muted">
                      {counts[tab.id]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 pb-2">
            <div className="relative w-56">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted"
              />
              <TextInput
                size="sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeSearch}
                aria-label={activeSearch}
                className="pl-8"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="!px-1.5"
              onClick={loadAllData}
              disabled={isLoading}
              title="Refresh"
              aria-label="Refresh"
              icon={<RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />}
            />
            {isAdmin && (
              <Button
                variant="primary"
                size="sm"
                icon={addAction.icon}
                onClick={addAction.onClick}
                title={addAction.title}
              >
                {addAction.label}
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-plm-fg-muted" size={20} />
          </div>
        ) : (
          <div className="space-y-4">
            {activeTab === 'users' && (
              <UsersTab
                searchQuery={searchQuery}
                onShowCreateUserDialog={() => setShowCreateUserDialog(true)}
              />
            )}
            {activeTab === 'teams' && (
              <TeamsTab
                searchQuery={searchQuery}
                onShowCreateTeamDialog={() => {
                  resetTeamForm()
                  setShowCreateTeamDialog(true)
                }}
              />
            )}
            {activeTab === 'roles' && (
              <RolesTab
                searchQuery={searchQuery}
                onShowCreateRoleDialog={() => setShowCreateWorkflowRoleDialog(true)}
              />
            )}
            {activeTab === 'titles' && (
              <TitlesTab
                searchQuery={searchQuery}
                onShowCreateTitleDialog={() => openCreateJobTitle()}
              />
            )}
          </div>
        )}
      </SettingsSection>

      {/* ===== CREATE DIALOGS ===== */}
      {/* Rendered here because header buttons use this component's hook instances */}

      {/* Create User Dialog */}
      {showCreateUserDialog && orgId && (
        <CreateUserDialog
          onClose={() => setShowCreateUserDialog(false)}
          onCreated={() => {
            loadMembers()
            loadPendingMembers()
          }}
          teams={teams}
          orgId={orgId}
          currentUserId={user?.id}
          currentUserName={user?.full_name ?? user?.email}
          orgName={organization?.name}
          vaults={vaults}
          workflowRoles={workflowRoles}
          apiUrl={apiServerUrl}
          orgCode={getOrgCodeForDialog()}
        />
      )}

      {/* Create Team Dialog */}
      {showCreateTeamDialog && (
        <TeamFormDialog
          title="Create Team"
          formData={teamFormData}
          setFormData={setTeamFormData}
          onSave={handleCreateTeam}
          onCancel={() => {
            setShowCreateTeamDialog(false)
            resetTeamForm()
          }}
          isSaving={isSavingTeam}
          existingTeams={teams}
          copyFromTeamId={copyFromTeamId}
          setCopyFromTeamId={setCopyFromTeamId}
        />
      )}

      {/* Create Workflow Role Dialog */}
      {showCreateWorkflowRoleDialog && (
        <WorkflowRoleFormDialog
          mode="create"
          formData={workflowRoleFormData}
          setFormData={setWorkflowRoleFormData}
          onSave={handleCreateWorkflowRole}
          onClose={() => {
            setShowCreateWorkflowRoleDialog(false)
            setWorkflowRoleFormData({ name: '', color: '#8b5cf6', icon: 'Shield', description: '' })
          }}
          isSaving={isSavingWorkflowRole}
        />
      )}

      {/* Create Job Title Dialog */}
      {showCreateTitleDialog && !editingJobTitle && (
        <JobTitleFormDialog
          editingTitle={null}
          titleName={newTitleName}
          setTitleName={setNewTitleName}
          titleColor={newTitleColor}
          setTitleColor={setNewTitleColor}
          titleIcon={newTitleIcon}
          setTitleIcon={setNewTitleIcon}
          pendingTitleForUser={pendingTitleForUser}
          onSave={handleCreateJobTitle}
          onClose={() => {
            setShowCreateTitleDialog(false)
            resetTitleForm()
          }}
          isSaving={isCreatingTitle}
        />
      )}
    </SettingsPage>
  )
}
