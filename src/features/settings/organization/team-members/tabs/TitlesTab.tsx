/**
 * TitlesTab - Displays and manages job titles
 *
 * This component uses hooks directly instead of context:
 * - usePDMStore for user/org info
 * - useJobTitles for data
 * - useJobTitleDialogs for dialog state
 * - useMembers for user data
 */
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/core/ui'
import { getInitials, getEffectiveAvatarUrl } from '@/lib/utils'
import { usePDMStore } from '@/stores/pdmStore'

import { SettingsGroup } from '../../../components/ui'
import { useMembers, useJobTitles, useJobTitleDialogs } from '../hooks'
import { JobTitleFormDialog, DeleteJobTitleDialog } from '../components/dialogs'

export interface TitlesTabProps {
  /** Search query for filtering titles */
  searchQuery?: string
  /** Called when the "Add Title" button should trigger a dialog in the parent */
  onShowCreateTitleDialog?: () => void
}

export function TitlesTab({ searchQuery = '', onShowCreateTitleDialog }: TitlesTabProps) {
  // Get user/org info from store
  const { organization, getEffectiveRole, addToast } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      getEffectiveRole: s.getEffectiveRole,
      addToast: s.addToast,
    })),
  )
  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'

  // Data hooks
  const { jobTitles, updateJobTitle, deleteJobTitle } = useJobTitles(orgId)

  const { members: orgUsers } = useMembers(orgId)

  // Dialog state - for edit operations within the tab
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
    resetTitleForm,
  } = useJobTitleDialogs()

  // Delete confirmation dialog state
  const [deletingTitle, setDeletingTitle] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filter titles by search
  const filteredTitles = jobTitles.filter(
    (t) => !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Handlers
  const handleUpdateJobTitle = async () => {
    if (!editingJobTitle || !newTitleName.trim()) return
    setIsCreatingTitle(true)
    try {
      const success = await updateJobTitle(
        editingJobTitle.id,
        newTitleName.trim(),
        newTitleColor,
        newTitleIcon,
      )
      if (success) {
        setShowCreateTitleDialog(false)
        resetTitleForm()
      }
    } finally {
      setIsCreatingTitle(false)
    }
  }

  const handleDeleteJobTitle = async () => {
    if (!deletingTitle) return
    setIsDeleting(true)
    try {
      const success = await deleteJobTitle(deletingTitle.id)
      if (success) {
        addToast('success', `Deleted title "${deletingTitle.name}"`)
      }
    } finally {
      setIsDeleting(false)
      setDeletingTitle(null)
    }
  }

  if (filteredTitles.length === 0) {
    return (
      <SettingsGroup>
        <div className="flex items-center justify-between gap-4 py-4">
          <span className="text-[14px] text-ui-fg-secondary">
            {searchQuery ? 'No matching job titles' : 'No job titles yet'}
          </span>
          {isAdmin && !searchQuery && onShowCreateTitleDialog && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={onShowCreateTitleDialog}
            >
              Create first title
            </Button>
          )}
        </div>
      </SettingsGroup>
    )
  }

  return (
    <div className="space-y-4">
      <SettingsGroup>
        <>
          {filteredTitles.map((title) => {
            const usersWithTitle = orgUsers.filter((u) => u.job_title?.id === title.id)

            return (
              <div
                key={title.id}
                className="group flex items-center gap-3 py-3"
              >
                {/* Title colour */}
                <span
                  aria-hidden
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: title.color }}
                />

                {/* Title info */}
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[14px] text-ui-fg">{title.name}</div>
                  <div className="text-[13px] text-ui-fg-secondary">
                    {usersWithTitle.length} user{usersWithTitle.length !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Users with this title */}
                {usersWithTitle.length > 0 && (
                  <div className="flex -space-x-2 flex-shrink-0">
                    {usersWithTitle.slice(0, 4).map((u) =>
                      getEffectiveAvatarUrl(u) ? (
                        <img
                          key={u.id}
                          src={getEffectiveAvatarUrl(u)!}
                          alt={u.full_name || u.email}
                          className="h-6 w-6 rounded-full border-2 border-ui-bg object-cover"
                          title={u.full_name || u.email}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          key={u.id}
                          className="h-6 w-6 rounded-full bg-ui-selected text-ui-fg flex items-center justify-center text-[12px] font-medium border-2 border-ui-bg"
                          title={u.full_name || u.email}
                        >
                          {getInitials(u.full_name || u.email)}
                        </div>
                      ),
                    )}
                    {usersWithTitle.length > 4 && (
                      <div className="h-6 w-6 rounded-full bg-ui-selected text-ui-fg flex items-center justify-center text-[12px] font-medium border-2 border-ui-bg">
                        +{usersWithTitle.length - 4}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                {isAdmin && (
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="!px-1.5"
                      onClick={() => openEditTitleDialog(title)}
                      icon={<Pencil size={14} />}
                      title="Edit title"
                      aria-label="Edit title"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="!px-1.5 hover:!text-ui-danger"
                      onClick={() => setDeletingTitle(title)}
                      icon={<Trash2 size={14} />}
                      title="Delete title"
                      aria-label="Delete title"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </>
      </SettingsGroup>

      {/* Info footer */}
      <p className="text-[14px] leading-[1.4] text-ui-fg-secondary">
        Job titles are display-only labels. Editing a title updates it for all users who have it
        assigned. All permissions come from teams.
      </p>

      {/* Edit Job Title Dialog - rendered here for edit actions within the tab */}
      {showCreateTitleDialog && editingJobTitle && (
        <JobTitleFormDialog
          editingTitle={editingJobTitle}
          titleName={newTitleName}
          setTitleName={setNewTitleName}
          titleColor={newTitleColor}
          setTitleColor={setNewTitleColor}
          titleIcon={newTitleIcon}
          setTitleIcon={setNewTitleIcon}
          pendingTitleForUser={pendingTitleForUser}
          onSave={handleUpdateJobTitle}
          onClose={() => {
            setShowCreateTitleDialog(false)
            setEditingJobTitle(null)
            setPendingTitleForUser(null)
          }}
          isSaving={isCreatingTitle}
        />
      )}

      {/* Delete Job Title Confirmation Dialog */}
      {deletingTitle && (
        <DeleteJobTitleDialog
          title={deletingTitle}
          onConfirm={handleDeleteJobTitle}
          onClose={() => setDeletingTitle(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  )
}
