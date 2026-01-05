/**
 * TeamMembersSettings - Main component for team members management
 * 
 * This component uses the TeamMembersProvider to manage all state
 * and renders tabs and dialogs that consume the context.
 */
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
  Briefcase
} from 'lucide-react'
import { copyToClipboard } from '@/lib/clipboard'
import { getCurrentConfig } from '@/lib/supabase'
import { generateOrgCode } from '@/lib/supabaseConfig'

// Import context and components from team-members
import {
  TeamMembersProvider,
  useTeamMembersContext,
  UsersTab,
  TeamsTab,
  RolesTab,
  TitlesTab,
  TeamDialogs,
  UserDialogs,
  WorkflowRoleDialogs,
  JobTitleDialogs
} from './team-members'

/**
 * Main TeamMembersSettings component
 * Wraps content in the provider
 */
export function TeamMembersSettings() {
  return (
    <TeamMembersProvider>
      <TeamMembersContent />
    </TeamMembersProvider>
  )
}

/**
 * TeamMembersContent - Inner component that consumes the context
 */
function TeamMembersContent() {
  const {
    organization,
    isAdmin,
    isLoading,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    orgUsers,
    teams,
    workflowRoles,
    jobTitles,
    
    // Org code state
    showOrgCode,
    setShowOrgCode,
    orgCode,
    setOrgCode,
    codeCopied,
    setCodeCopied,
    
    // Dialog openers
    setShowCreateUserDialog,
    setShowCreateTeamDialog,
    setShowCreateWorkflowRoleDialog,
    resetTeamForm,
    openCreateJobTitle,
    
    // Data refresh
    loadAllData
  } = useTeamMembersContext()

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
              onClick={openCreateJobTitle}
              className="btn btn-primary btn-sm flex items-center gap-1"
              title="Add title"
            >
              <Plus size={14} />
              Add Title
            </button>
          )}
        </div>
      </div>
      
      {/* Organization Code (Admin only) */}
      {isAdmin && (
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border">
          <div className="flex items-center gap-2 mb-2">
            <Key size={16} className="text-plm-accent" />
            <h3 className="text-sm font-medium text-plm-fg">Organization Code</h3>
          </div>
          {showOrgCode && orgCode ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-plm-bg-secondary border border-plm-border rounded px-3 py-1.5 font-mono text-plm-fg truncate">
                {orgCode}
              </code>
              <button
                onClick={async () => {
                  const result = await copyToClipboard(orgCode)
                  if (result.success) {
                    setCodeCopied(true)
                    setTimeout(() => setCodeCopied(false), 2000)
                  }
                }}
                className="btn btn-ghost btn-sm"
              >
                {codeCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
              <button onClick={() => setShowOrgCode(false)} className="text-sm text-plm-fg-muted hover:text-plm-fg">
                Hide
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                const config = getCurrentConfig()
                if (config) {
                  setOrgCode(generateOrgCode(config, organization?.slug))
                  setShowOrgCode(true)
                }
              }}
              className="text-sm text-plm-accent hover:underline"
            >
              Show organization code
            </button>
          )}
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
          {activeTab === 'teams' && <TeamsTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'roles' && <RolesTab />}
          {activeTab === 'titles' && <TitlesTab />}
        </div>
      )}

      {/* Self-contained dialogs - each checks its own visibility via context */}
      <TeamDialogs />
      <UserDialogs />
      <WorkflowRoleDialogs />
      <JobTitleDialogs />
    </div>
  )
}
