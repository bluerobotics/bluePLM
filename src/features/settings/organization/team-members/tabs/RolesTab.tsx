/**
 * RolesTab - Displays and manages workflow roles
 *
 * This component uses hooks directly instead of context:
 * - usePDMStore for user/org info
 * - useWorkflowRoles for data
 * - useWorkflowRoleDialogs for dialog state
 * - useWorkflowRoleHandlers for CRUD operations
 */
import { Shield, Plus, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/core/ui'
import { getInitials, getEffectiveAvatarUrl } from '@/lib/utils'
import { usePDMStore } from '@/stores/pdmStore'

import { SettingsGroup } from '../../../components/ui'
import { useMembers, useWorkflowRoles, useWorkflowRoleDialogs } from '../hooks'
import { WorkflowRoleFormDialog, DeleteWorkflowRoleDialog } from '../components/dialogs'

export interface RolesTabProps {
  /** Search query for filtering roles */
  searchQuery?: string
  /** Called when the "Add Role" button should trigger a dialog in the parent */
  onShowCreateRoleDialog?: () => void
}

export function RolesTab({ searchQuery = '', onShowCreateRoleDialog }: RolesTabProps) {
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
  const {
    workflowRoles,
    userRoleAssignments: userWorkflowRoleAssignments,
    updateWorkflowRole,
    deleteWorkflowRole,
  } = useWorkflowRoles(orgId)

  const { members: orgUsers } = useMembers(orgId)

  // Dialog state - for edit operations within the tab
  const {
    showEditWorkflowRoleDialog,
    setShowEditWorkflowRoleDialog,
    editingWorkflowRole,
    setEditingWorkflowRole,
    workflowRoleFormData,
    setWorkflowRoleFormData,
    isSavingWorkflowRole,
    setIsSavingWorkflowRole,
  } = useWorkflowRoleDialogs()

  // Delete confirmation dialog state
  const [deletingRole, setDeletingRole] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filter roles by search
  const filteredRoles = workflowRoles.filter(
    (r) => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Handlers
  const handleUpdateWorkflowRole = async () => {
    if (!editingWorkflowRole) return
    setIsSavingWorkflowRole(true)
    try {
      const success = await updateWorkflowRole(editingWorkflowRole.id, workflowRoleFormData)
      if (success) {
        setShowEditWorkflowRoleDialog(false)
        setEditingWorkflowRole(null)
        setWorkflowRoleFormData({ name: '', color: '#8b5cf6', icon: 'Shield', description: '' })
      }
    } finally {
      setIsSavingWorkflowRole(false)
    }
  }

  const handleDeleteWorkflowRole = async () => {
    if (!deletingRole) return
    setIsDeleting(true)
    try {
      const success = await deleteWorkflowRole(deletingRole.id)
      if (success) {
        addToast('success', `Deleted role "${deletingRole.name}"`)
      }
    } finally {
      setIsDeleting(false)
      setDeletingRole(null)
    }
  }

  const openEditRoleDialog = (role: (typeof workflowRoles)[0]) => {
    setEditingWorkflowRole(role)
    setWorkflowRoleFormData({
      name: role.name,
      color: role.color,
      icon: role.icon,
      description: role.description || '',
    })
    setShowEditWorkflowRoleDialog(true)
  }

  if (filteredRoles.length === 0) {
    return (
      <SettingsGroup>
        <div className="flex items-center justify-between gap-4 py-4">
          <span className="text-[14px] text-ui-fg-secondary">
            {searchQuery ? 'No matching workflow roles' : 'No workflow roles yet'}
          </span>
          {isAdmin && !searchQuery && onShowCreateRoleDialog && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={onShowCreateRoleDialog}
            >
              Create first role
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
          {filteredRoles.map((role) => {
            const usersWithRole = orgUsers.filter((u) =>
              userWorkflowRoleAssignments[u.id]?.includes(role.id),
            )

            return (
              <div
                key={role.id}
                className="group flex items-center gap-3 py-3"
              >
                {/* Role colour */}
                <span
                  aria-hidden
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: role.color }}
                />

                {/* Role info */}
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[14px] text-ui-fg">{role.name}</div>
                  <div className="truncate text-[13px] text-ui-fg-secondary">
                    {usersWithRole.length} user{usersWithRole.length !== 1 ? 's' : ''}
                    {role.description && ` · ${role.description}`}
                  </div>
                </div>

                {/* Users with this role */}
                {usersWithRole.length > 0 && (
                  <div className="flex -space-x-2 flex-shrink-0">
                    {usersWithRole.slice(0, 4).map((u) =>
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
                    {usersWithRole.length > 4 && (
                      <div className="h-6 w-6 rounded-full bg-ui-selected text-ui-fg flex items-center justify-center text-[12px] font-medium border-2 border-ui-bg">
                        +{usersWithRole.length - 4}
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
                      onClick={() => openEditRoleDialog(role)}
                      icon={<Pencil size={14} />}
                      title="Edit role"
                      aria-label="Edit role"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="!px-1.5 hover:!text-ui-danger"
                      onClick={() => setDeletingRole(role)}
                      icon={<Trash2 size={14} />}
                      title="Delete role"
                      aria-label="Delete role"
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
        Workflow roles define responsibilities in workflows (e.g., approvers, reviewers). Editing a
        role updates it for all assigned users.
      </p>

      {/* Edit Workflow Role Dialog - rendered here for edit actions within the tab */}
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

      {/* Delete Workflow Role Confirmation Dialog */}
      {deletingRole && (
        <DeleteWorkflowRoleDialog
          role={deletingRole}
          onConfirm={handleDeleteWorkflowRole}
          onClose={() => setDeletingRole(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  )
}
