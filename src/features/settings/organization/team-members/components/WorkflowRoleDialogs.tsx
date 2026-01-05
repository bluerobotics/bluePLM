/**
 * WorkflowRoleDialogs - Self-contained workflow role dialogs
 * 
 * This component renders workflow role create/edit dialogs and manages
 * their visibility through the TeamMembersContext.
 */
import { useTeamMembersContext } from '../context'
import { WorkflowRoleFormDialog } from './dialogs'

export function WorkflowRoleDialogs() {
  const {
    // Workflow role dialog state
    showCreateWorkflowRoleDialog,
    setShowCreateWorkflowRoleDialog,
    showEditWorkflowRoleDialog,
    setShowEditWorkflowRoleDialog,
    editingWorkflowRole,
    setEditingWorkflowRole,
    workflowRoleFormData,
    setWorkflowRoleFormData,
    isSavingWorkflowRole,
    
    // Handlers
    handleCreateWorkflowRole,
    handleUpdateWorkflowRole
  } = useTeamMembersContext()

  return (
    <>
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

      {/* Edit Workflow Role Dialog */}
      {showEditWorkflowRoleDialog && editingWorkflowRole && (
        <WorkflowRoleFormDialog
          mode="edit"
          formData={workflowRoleFormData}
          setFormData={setWorkflowRoleFormData}
          editingRole={editingWorkflowRole}
          onSave={handleUpdateWorkflowRole}
          onClose={() => {
            setShowEditWorkflowRoleDialog(false)
            setEditingWorkflowRole(null)
            setWorkflowRoleFormData({ name: '', color: '#8b5cf6', icon: 'Shield', description: '' })
          }}
          isSaving={isSavingWorkflowRole}
        />
      )}
    </>
  )
}
