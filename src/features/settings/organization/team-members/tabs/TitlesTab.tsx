/**
 * TitlesTab - Displays and manages job titles
 * 
 * This component uses hooks directly instead of context:
 * - usePDMStore for user/org info
 * - useJobTitles for data
 * - useJobTitleDialogs for dialog state
 * - useMembers for user data
 */
import * as LucideIcons from 'lucide-react'
import { Briefcase, Plus, Pencil, Trash2 } from 'lucide-react'
import { getInitials, getEffectiveAvatarUrl } from '@/lib/utils'
import { usePDMStore } from '@/stores/pdmStore'
import { useMembers, useJobTitles, useJobTitleDialogs } from '../hooks'
import { JobTitleFormDialog } from '../components/dialogs'

export interface TitlesTabProps {
  /** Search query for filtering titles */
  searchQuery?: string
}

export function TitlesTab({ searchQuery = '' }: TitlesTabProps) {
  // Get user/org info from store
  const { organization, getEffectiveRole, addToast } = usePDMStore()
  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'

  // Data hooks
  const {
    jobTitles,
    createJobTitle,
    updateJobTitle,
    deleteJobTitle
  } = useJobTitles(orgId)
  
  const { members: orgUsers } = useMembers(orgId)

  // Dialog state
  const {
    showCreateTitleDialog,
    setShowCreateTitleDialog,
    editingJobTitle,
    setEditingJobTitle,
    pendingTitleForUser,
    setPendingTitleForUser,
    newTitleName,
    setNewTitleName,
    newTitleColor,
    setNewTitleColor,
    newTitleIcon,
    setNewTitleIcon,
    isCreatingTitle,
    setIsCreatingTitle,
    openEditTitleDialog,
    openCreateTitleDialog,
    resetTitleForm
  } = useJobTitleDialogs()

  // Filter titles by search
  const filteredTitles = jobTitles.filter(t => 
    !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Handlers
  const handleCreateTitle = async () => {
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

  const handleUpdateJobTitle = async () => {
    if (!editingJobTitle || !newTitleName.trim()) return
    setIsCreatingTitle(true)
    try {
      const success = await updateJobTitle(
        editingJobTitle.id,
        newTitleName.trim(),
        newTitleColor,
        newTitleIcon
      )
      if (success) {
        setShowCreateTitleDialog(false)
        resetTitleForm()
      }
    } finally {
      setIsCreatingTitle(false)
    }
  }

  const handleDeleteJobTitle = async (title: { id: string; name: string }) => {
    if (!confirm(`Delete job title "${title.name}"? Users with this title will have it removed.`)) {
      return
    }
    const success = await deleteJobTitle(title.id)
    if (success) {
      addToast('success', `Deleted title "${title.name}"`)
    }
  }

  if (filteredTitles.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-center py-8 border border-dashed border-plm-border rounded-lg">
          <Briefcase size={36} className="mx-auto text-plm-fg-muted mb-3 opacity-50" />
          <p className="text-sm text-plm-fg-muted mb-4">
            {searchQuery ? 'No matching job titles' : 'No job titles yet'}
          </p>
          {isAdmin && !searchQuery && (
            <button
              onClick={() => openCreateTitleDialog()}
              className="btn btn-primary btn-sm"
            >
              <Plus size={14} className="mr-1" />
              Create First Title
            </button>
          )}
        </div>

        {/* Dialog */}
        {showCreateTitleDialog && (
          <JobTitleFormDialog
            editingTitle={editingJobTitle}
            titleName={newTitleName}
            setTitleName={setNewTitleName}
            titleColor={newTitleColor}
            setTitleColor={setNewTitleColor}
            titleIcon={newTitleIcon}
            setTitleIcon={setNewTitleIcon}
            pendingTitleForUser={pendingTitleForUser}
            onSave={editingJobTitle ? handleUpdateJobTitle : handleCreateTitle}
            onClose={() => {
              setShowCreateTitleDialog(false)
              setEditingJobTitle(null)
              setPendingTitleForUser(null)
            }}
            isSaving={isCreatingTitle}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="border border-plm-border rounded-lg overflow-hidden bg-plm-bg/50">
        <div className="divide-y divide-plm-border/50">
          {filteredTitles.map(title => {
            const TitleIcon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[title.icon] || Briefcase
            const usersWithTitle = orgUsers.filter(u => u.job_title?.id === title.id)
            
            return (
              <div
                key={title.id}
                className="flex items-center gap-3 p-3 hover:bg-plm-highlight/30 transition-colors group"
              >
                {/* Title icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${title.color}15`, color: title.color }}
                >
                  <TitleIcon size={20} />
                </div>
                
                {/* Title info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-plm-fg">{title.name}</div>
                  <div className="text-xs text-plm-fg-muted">
                    {usersWithTitle.length} user{usersWithTitle.length !== 1 ? 's' : ''}
                  </div>
                </div>
                
                {/* Users with this title */}
                {usersWithTitle.length > 0 && (
                  <div className="flex -space-x-2 flex-shrink-0">
                    {usersWithTitle.slice(0, 4).map(u => (
                      getEffectiveAvatarUrl(u) ? (
                        <img
                          key={u.id}
                          src={getEffectiveAvatarUrl(u) || ''}
                          alt={u.full_name || u.email}
                          className="w-7 h-7 rounded-full border-2 border-plm-bg-light object-cover"
                          title={u.full_name || u.email}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          key={u.id}
                          className="w-7 h-7 rounded-full bg-plm-fg-muted/20 flex items-center justify-center text-[10px] font-medium border-2 border-plm-bg-light"
                          title={u.full_name || u.email}
                        >
                          {getInitials(u.full_name || u.email)}
                        </div>
                      )
                    ))}
                    {usersWithTitle.length > 4 && (
                      <div className="w-7 h-7 rounded-full bg-plm-fg-muted/20 flex items-center justify-center text-[10px] font-medium border-2 border-plm-bg-light">
                        +{usersWithTitle.length - 4}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Actions */}
                {isAdmin && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditTitleDialog(title)}
                      className="p-1.5 text-plm-fg-muted hover:text-plm-accent hover:bg-plm-accent/10 rounded transition-colors"
                      title="Edit title"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteJobTitle(title)}
                      className="p-1.5 text-plm-fg-muted hover:text-plm-error hover:bg-plm-error/10 rounded transition-colors"
                      title="Delete title"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Info footer */}
      <p className="text-xs text-plm-fg-muted">
        Job titles are display-only labels. Editing a title updates it for all users who have it assigned.
        All permissions come from teams.
      </p>

      {/* Dialog */}
      {showCreateTitleDialog && (
        <JobTitleFormDialog
          editingTitle={editingJobTitle}
          titleName={newTitleName}
          setTitleName={setNewTitleName}
          titleColor={newTitleColor}
          setTitleColor={setNewTitleColor}
          titleIcon={newTitleIcon}
          setTitleIcon={setNewTitleIcon}
          pendingTitleForUser={pendingTitleForUser}
          onSave={editingJobTitle ? handleUpdateJobTitle : handleCreateTitle}
          onClose={() => {
            setShowCreateTitleDialog(false)
            setEditingJobTitle(null)
            setPendingTitleForUser(null)
          }}
          isSaving={isCreatingTitle}
        />
      )}
    </div>
  )
}
