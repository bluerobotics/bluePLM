/**
 * TeamMembersSettings - Main component for team members management
 * 
 * This component uses hooks directly to manage state:
 * - usePDMStore for organization data
 * - useTeams, useMembers, useWorkflowRoles, useJobTitles for data
 * - useTeamDialogs, useUserDialogs, etc. for dialog state
 * - useOrgCode for organization code management
 * 
 * IMPORTANT: Create dialogs are rendered here (not in tabs) because the header
 * buttons use the hook instances from this component. Tabs render their own
 * edit/delete dialogs which are triggered from within the tabs.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Users,
  Plus,
  Loader2,
  Shield,
  UserPlus,
  Check,
  Search,
  Copy,
  RefreshCw,
  Key,
  UsersRound,
  Briefcase,
  Mail,
  X
} from 'lucide-react'
import { log } from '@/lib/logger'
import { copyToClipboard } from '@/lib/clipboard'
import { getCurrentConfig, supabase } from '@/lib/supabase'
import { generateOrgCode } from '@/lib/supabaseConfig'
import { usePDMStore } from '@/stores/pdmStore'

// Import components and hooks from team-members
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
  JobTitleFormDialog
} from './team-members'

type TabType = 'users' | 'teams' | 'roles' | 'titles'

/**
 * Main TeamMembersSettings component
 */
export function TeamMembersSettings() {
  // ===== STORE STATE =====
  const { user, organization, getEffectiveRole, apiServerUrl, addToast } = usePDMStore()
  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'
  
  // Track if we're currently saving to avoid overwriting with stale realtime data
  const savingRef = useRef(false)

  // ===== DATA HOOKS =====
  const { teams, isLoading: teamsLoading, loadTeams, createTeam } = useTeams(orgId)
  const { members: orgUsers, isLoading: membersLoading, loadMembers } = useMembers(orgId)
  const { loadPendingMembers } = useInvites(orgId)
  const { workflowRoles, isLoading: rolesLoading, createWorkflowRole } = useWorkflowRoles(orgId)
  const { jobTitles, isLoading: titlesLoading, createJobTitle } = useJobTitles(orgId)
  const { vaults } = useVaultAccess(orgId)

  const isLoading = teamsLoading || membersLoading || rolesLoading || titlesLoading

  // ===== EMAIL DOMAIN STATE =====
  const [emailDomains, setEmailDomains] = useState<string[]>([])
  const [enforceEmailDomain, setEnforceEmailDomain] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [savingDomains, setSavingDomains] = useState(false)
  const [loadingEmailSettings, setLoadingEmailSettings] = useState(true)

  // ===== UI STATE (local) =====
  const [activeTab, setActiveTab] = useState<TabType>('users')
  const [searchQuery, setSearchQuery] = useState('')

  // ===== ORG CODE STATE =====
  const {
    orgCode,
    setOrgCode,
    codeCopied,
    setCodeCopied
  } = useOrgCode()

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
    resetTeamForm
  } = useTeamDialogs()

  const {
    showCreateUserDialog,
    setShowCreateUserDialog
  } = useUserDialogs()

  const {
    showCreateWorkflowRoleDialog,
    setShowCreateWorkflowRoleDialog,
    workflowRoleFormData,
    setWorkflowRoleFormData,
    isSavingWorkflowRole,
    setIsSavingWorkflowRole
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
    resetTitleForm
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
        pendingTitleForUser?.id
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

  // ===== EMAIL DOMAIN HANDLERS =====
  const handleAddDomain = async () => {
    const domain = newDomain.trim().toLowerCase()
    if (!domain || !organization?.id) return
    
    // Validate domain format
    if (!/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i.test(domain)) {
      addToast('error', 'Invalid domain format')
      return
    }
    
    // Check if already exists
    if (emailDomains.includes(domain)) {
      addToast('error', 'Domain already added')
      return
    }
    
    setSavingDomains(true)
    savingRef.current = true
    const newDomains = [...emailDomains, domain]
    
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ email_domains: newDomains })
        .eq('id', organization.id)
      
      if (error) throw error
      
      setEmailDomains(newDomains)
      setNewDomain('')
      addToast('success', `Added @${domain}`)
    } catch (err) {
      log.error('[TeamMembers]', 'Failed to add domain', { error: err })
      addToast('error', 'Failed to add domain')
    } finally {
      setSavingDomains(false)
      setTimeout(() => { savingRef.current = false }, 1000)
    }
  }

  const handleRemoveDomain = async (idx: number, domain: string) => {
    if (!organization?.id) return
    
    const newDomains = emailDomains.filter((_, i) => i !== idx)
    setEmailDomains(newDomains)
    savingRef.current = true
    
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ email_domains: newDomains })
        .eq('id', organization.id)
      
      if (error) throw error
      addToast('success', `Removed @${domain}`)
    } catch (err) {
      log.error('[TeamMembers]', 'Failed to remove domain', { error: err })
      setEmailDomains(emailDomains) // Revert
      addToast('error', 'Failed to remove domain')
    } finally {
      setTimeout(() => { savingRef.current = false }, 1000)
    }
  }

  const handleToggleEnforcement = async () => {
    if (!organization?.id) return
    
    const newValue = !enforceEmailDomain
    setEnforceEmailDomain(newValue)
    savingRef.current = true
    
    try {
      // Fetch current settings from database first to avoid overwriting other fields
      const { data: currentOrg } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organization.id)
        .single()
      
      const currentSettings = (currentOrg as any)?.settings || organization?.settings || {}
      const newSettings = { ...currentSettings, enforce_email_domain: newValue }
      
      const { error } = await supabase
        .from('organizations')
        .update({ settings: newSettings })
        .eq('id', organization.id)
      
      if (error) throw error
      addToast('success', newValue ? 'Email domain enforcement enabled' : 'Email domain enforcement disabled')
    } catch (err) {
      log.error('[TeamMembers]', 'Failed to update enforcement setting', { error: err })
      setEnforceEmailDomain(!newValue) // Revert
      addToast('error', 'Failed to update setting')
    } finally {
      setTimeout(() => { savingRef.current = false }, 1000)
    }
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

  // ===== EMAIL DOMAIN EFFECTS =====
  // Load email domain settings
  useEffect(() => {
    if (!organization?.id) return

    const loadEmailSettings = async () => {
      setLoadingEmailSettings(true)
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('email_domains, settings')
          .eq('id', organization.id)
          .single()

        if (error) throw error
        
        // Load email domain settings
        setEmailDomains(data?.email_domains || [])
        const settings = (data?.settings || {}) as { enforce_email_domain?: boolean }
        setEnforceEmailDomain(settings.enforce_email_domain ?? false)
      } catch (err) {
        log.error('[TeamMembers]', 'Failed to load email domain settings', { error: err })
      } finally {
        setLoadingEmailSettings(false)
      }
    }

    loadEmailSettings()
  }, [organization?.id])
  
  // Sync with realtime organization changes (when another admin updates settings)
  useEffect(() => {
    // Skip if we're currently saving (to avoid overwriting our own changes)
    if (savingRef.current) return
    // Skip if still loading initial data
    if (loadingEmailSettings) return
    
    const org = organization as any
    if (org) {
      // Sync email domains
      if (org.email_domains) {
        setEmailDomains(org.email_domains)
      }
      
      // Sync enforce_email_domain from settings
      if (org.settings?.enforce_email_domain !== undefined) {
        setEnforceEmailDomain(org.settings.enforce_email_domain)
      }
    }
  }, [
    loadingEmailSettings,
    (organization as any)?.email_domains,
    (organization as any)?.settings?.enforce_email_domain
  ])

  // ===== DATA LOADING =====
  const loadAllData = useCallback(async () => {
    await Promise.all([
      loadTeams(),
      loadMembers()
    ])
  }, [loadTeams, loadMembers])

  // ===== RENDER =====
  if (!organization) {
    return (
      <div className="text-center py-12 text-plm-fg-muted text-base">
        No organization connected
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-plm-fg flex items-center gap-2">
            <UsersRound size={22} />
            Members
          </h2>
          <p className="text-sm text-plm-fg-muted mt-1">
            {activeTab === 'users' ? 'Manage individual users in your organization' :
             activeTab === 'teams' ? 'Organize members into teams and manage permissions' : 
             activeTab === 'roles' ? 'Define workflow roles for approvals and reviews' :
             'Manage job titles for your organization'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAllData}
            disabled={isLoading}
            className="btn btn-ghost btn-sm flex items-center gap-1"
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          {isAdmin && activeTab === 'users' && (
            <button
              onClick={() => setShowCreateUserDialog(true)}
              className="btn btn-primary btn-sm flex items-center gap-1"
              title="Add user"
            >
              <UserPlus size={14} />
              Add User
            </button>
          )}
          {isAdmin && activeTab === 'teams' && (
            <button
              onClick={() => {
                resetTeamForm()
                setShowCreateTeamDialog(true)
              }}
              className="btn btn-primary btn-sm flex items-center gap-1"
              title="Add team"
            >
              <Plus size={14} />
              Add Team
            </button>
          )}
          {isAdmin && activeTab === 'roles' && (
            <button
              onClick={() => setShowCreateWorkflowRoleDialog(true)}
              className="btn btn-primary btn-sm flex items-center gap-1"
              title="Add role"
            >
              <Plus size={14} />
              Add Role
            </button>
          )}
          {isAdmin && activeTab === 'titles' && (
            <button
              onClick={() => openCreateJobTitle()}
              className="btn btn-primary btn-sm flex items-center gap-1"
              title="Add title"
            >
              <Plus size={14} />
              Add Title
            </button>
          )}
        </div>
      </div>
      
      {/* Organization Access Settings (Admin only) */}
      {isAdmin && (
        <div className="bg-plm-bg rounded-lg border border-plm-border divide-y divide-plm-border">
          {/* Organization Code - Inline with copy */}
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <Key size={18} className="text-plm-accent" />
              <div>
                <div className="text-sm font-medium text-plm-fg">Organization Code</div>
                <div className="text-xs text-plm-fg-muted">Share to invite new members</div>
              </div>
            </div>
            <button
              onClick={async () => {
                // Generate code if not already generated
                let code = orgCode
                if (!code) {
                  const config = getCurrentConfig()
                  if (config) {
                    code = generateOrgCode(config, organization?.slug)
                    setOrgCode(code)
                  }
                }
                if (code) {
                  const result = await copyToClipboard(code)
                  if (result.success) {
                    setCodeCopied(true)
                    setTimeout(() => setCodeCopied(false), 2000)
                  }
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-plm-bg-secondary border border-plm-border rounded hover:border-plm-accent transition-colors"
              title="Click to copy"
            >
              <code className="text-sm font-mono text-plm-fg">
                {orgCode ? `${orgCode.substring(0, 24)}...` : '...'}
              </code>
              {codeCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-plm-fg-muted" />}
            </button>
          </div>

          {/* Email Domain Restriction - Inline toggle with expandable content */}
          <div>
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Shield size={18} className={enforceEmailDomain ? 'text-plm-accent' : 'text-plm-fg-muted'} />
                <div>
                  <div className="text-sm font-medium text-plm-fg">Email Domain Restriction</div>
                  <div className="text-xs text-plm-fg-muted">
                    {enforceEmailDomain 
                      ? (emailDomains.length > 0 ? `Only @${emailDomains.join(', @')}` : 'Enabled (no domains set)')
                      : 'Anyone with the code can join'}
                  </div>
                </div>
              </div>
              <button
                onClick={handleToggleEnforcement}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  enforceEmailDomain ? 'bg-plm-accent' : 'bg-zinc-800'
                }`}
              >
                <span 
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    enforceEmailDomain ? 'translate-x-5' : 'translate-x-0'
                  }`} 
                />
              </button>
            </div>

            {/* Domain list - only show when enforcement is enabled */}
            {enforceEmailDomain && (
              <div className="px-3 pb-3 pt-0 space-y-3">
                <div className="ml-7 space-y-2">
                  <label className="text-sm text-plm-fg-muted">Allowed Domains</label>
                  {emailDomains.length === 0 ? (
                    <div className="text-sm text-plm-fg-dim py-1">
                      No domains configured. Add one below.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {emailDomains.map((domain, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-plm-bg-secondary border border-plm-border rounded-lg text-sm"
                        >
                          <Mail size={14} className="text-plm-fg-muted" />
                          <span className="text-plm-fg">@{domain}</span>
                          <button
                            onClick={() => handleRemoveDomain(idx, domain)}
                            className="p-0.5 hover:bg-plm-error/20 rounded text-plm-fg-muted hover:text-plm-error transition-colors"
                            title="Remove domain"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add domain */}
                <div className="flex gap-2 ml-7">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-plm-fg-muted text-sm">@</span>
                    <input
                      type="text"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value.toLowerCase().replace(/^@/, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newDomain.trim()) {
                          e.preventDefault()
                          handleAddDomain()
                        }
                      }}
                      placeholder="example.com"
                      className="w-full pl-7 pr-3 py-2 bg-plm-input border border-plm-border rounded text-sm text-plm-fg placeholder:text-plm-fg-muted/50 focus:outline-none focus:border-plm-accent"
                    />
                  </div>
                  <button
                    onClick={handleAddDomain}
                    disabled={!newDomain.trim() || savingDomains}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    {savingDomains ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-plm-bg-secondary rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${
            activeTab === 'users'
              ? 'bg-plm-bg text-plm-fg shadow-sm'
              : 'text-plm-fg-muted hover:text-plm-fg'
          }`}
        >
          <UsersRound size={16} />
          Users
          {orgUsers.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === 'users' ? 'bg-plm-accent/20 text-plm-accent' : 'bg-plm-fg-muted/20'
            }`}>
              {orgUsers.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${
            activeTab === 'teams'
              ? 'bg-plm-bg text-plm-fg shadow-sm'
              : 'text-plm-fg-muted hover:text-plm-fg'
          }`}
        >
          <Users size={16} />
          Teams
          {teams.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === 'teams' ? 'bg-plm-accent/20 text-plm-accent' : 'bg-plm-fg-muted/20'
            }`}>
              {teams.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${
            activeTab === 'roles'
              ? 'bg-plm-bg text-plm-fg shadow-sm'
              : 'text-plm-fg-muted hover:text-plm-fg'
          }`}
        >
          <Shield size={16} />
          Roles
          {workflowRoles.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === 'roles' ? 'bg-plm-accent/20 text-plm-accent' : 'bg-plm-fg-muted/20'
            }`}>
              {workflowRoles.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('titles')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${
            activeTab === 'titles'
              ? 'bg-plm-bg text-plm-fg shadow-sm'
              : 'text-plm-fg-muted hover:text-plm-fg'
          }`}
        >
          <Briefcase size={16} />
          Titles
          {jobTitles.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === 'titles' ? 'bg-plm-accent/20 text-plm-accent' : 'bg-plm-fg-muted/20'
            }`}>
              {jobTitles.length}
            </span>
          )}
        </button>
      </div>
      
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-plm-fg-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={
            activeTab === 'users' ? "Search users..." :
            activeTab === 'teams' ? "Search teams..." : 
            activeTab === 'roles' ? "Search roles..." :
            "Search titles..."
          }
          className="w-full pl-10 pr-4 py-2 bg-plm-bg border border-plm-border rounded-lg text-plm-fg placeholder:text-plm-fg-dim focus:outline-none focus:border-plm-accent"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-plm-fg-muted" size={32} />
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

    </div>
  )
}
