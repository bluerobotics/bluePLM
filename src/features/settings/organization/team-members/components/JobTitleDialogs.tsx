/**
 * JobTitleDialogs - Self-contained job title dialogs
 * 
 * This component renders job title create/edit dialogs and manages
 * their visibility through the TeamMembersContext.
 */
import { useTeamMembersContext } from '../context'
import { JobTitleFormDialog } from './dialogs'
import { UserJobTitleModal } from './modals'

export function JobTitleDialogs() {
  const {
    isAdmin,
    
    // Job title dialog state
    showCreateTitleDialog,
    setShowCreateTitleDialog,
    editingJobTitleUser,
    setEditingJobTitleUser,
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
    openCreateJobTitle,
    
    // Data
    jobTitles,
    
    // Handlers
    handleCreateTitle,
    handleUpdateJobTitle,
    handleChangeJobTitle,
    updateJobTitleDirect,
    deleteJobTitleDirect
  } = useTeamMembersContext()

  return (
    <>
      {/* Create/Edit Job Title Dialog */}
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

      {/* User Job Title Modal */}
      {editingJobTitleUser && (
        <UserJobTitleModal
          user={editingJobTitleUser}
          jobTitles={jobTitles}
          onClose={() => setEditingJobTitleUser(null)}
          onSelectTitle={async (titleId) => {
            await handleChangeJobTitle(editingJobTitleUser, titleId)
            setEditingJobTitleUser(null)
          }}
          onCreateTitle={() => {
            setPendingTitleForUser(editingJobTitleUser)
            setEditingJobTitleUser(null)
            openCreateJobTitle()
          }}
          onUpdateTitle={updateJobTitleDirect}
          onDeleteTitle={deleteJobTitleDirect}
          isAdmin={isAdmin}
        />
      )}
    </>
  )
}
