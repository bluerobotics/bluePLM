/**
 * RolesTab - Displays and manages workflow roles
 * 
 * Shows a list of workflow roles with assigned users and admin actions
 * for editing and deleting roles.
 */
import * as LucideIcons from 'lucide-react'
import { Shield, Plus, Pencil, Trash2 } from 'lucide-react'
import { getInitials, getEffectiveAvatarUrl } from '@/types/pdm'
import { useTeamMembersContext } from '../context'

export function RolesTab() {
  const {
    workflowRoles,
    orgUsers,
    userWorkflowRoleAssignments,
    searchQuery,
    isAdmin,
    setEditingWorkflowRole,
    setWorkflowRoleFormData,
    setShowEditWorkflowRoleDialog,
    setShowCreateWorkflowRoleDialog,
    handleDeleteWorkflowRole
  } = useTeamMembersContext()

  const filteredRoles = workflowRoles.filter(r => 
    !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (filteredRoles.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-center py-8 border border-dashed border-plm-border rounded-lg">
          <Shield size={36} className="mx-auto text-plm-fg-muted mb-3 opacity-50" />
          <p className="text-sm text-plm-fg-muted mb-4">
            {searchQuery ? 'No matching workflow roles' : 'No workflow roles yet'}
          </p>
          {isAdmin && !searchQuery && (
            <button
              onClick={() => setShowCreateWorkflowRoleDialog(true)}
              className="btn btn-primary btn-sm"
            >
              <Plus size={14} className="mr-1" />
              Create First Role
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="border border-plm-border rounded-lg overflow-hidden bg-plm-bg/50">
        <div className="divide-y divide-plm-border/50">
          {filteredRoles.map(role => {
            const RoleIcon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[role.icon] || Shield
            const usersWithRole = orgUsers.filter(u => 
              userWorkflowRoleAssignments[u.id]?.includes(role.id)
            )
            
            return (
              <div
                key={role.id}
                className="flex items-center gap-3 p-3 hover:bg-plm-highlight/30 transition-colors group"
              >
                {/* Role icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${role.color}15`, color: role.color }}
                >
                  <RoleIcon size={20} />
                </div>
                
                {/* Role info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-plm-fg">{role.name}</div>
                  <div className="text-xs text-plm-fg-muted">
                    {usersWithRole.length} user{usersWithRole.length !== 1 ? 's' : ''}
                    {role.description && ` • ${role.description}`}
                  </div>
                </div>
                
                {/* Users with this role */}
                {usersWithRole.length > 0 && (
                  <div className="flex -space-x-2 flex-shrink-0">
                    {usersWithRole.slice(0, 4).map(u => (
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
                    {usersWithRole.length > 4 && (
                      <div className="w-7 h-7 rounded-full bg-plm-fg-muted/20 flex items-center justify-center text-[10px] font-medium border-2 border-plm-bg-light">
                        +{usersWithRole.length - 4}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Actions */}
                {isAdmin && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingWorkflowRole(role)
                        setWorkflowRoleFormData({
                          name: role.name,
                          color: role.color,
                          icon: role.icon,
                          description: role.description || ''
                        })
                        setShowEditWorkflowRoleDialog(true)
                      }}
                      className="p-1.5 text-plm-fg-muted hover:text-purple-400 hover:bg-purple-500/10 rounded transition-colors"
                      title="Edit role"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteWorkflowRole(role)}
                      className="p-1.5 text-plm-fg-muted hover:text-plm-error hover:bg-plm-error/10 rounded transition-colors"
                      title="Delete role"
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
        Workflow roles define responsibilities in workflows (e.g., approvers, reviewers). 
        Editing a role updates it for all assigned users.
      </p>
    </div>
  )
}

// Export props type for backward compatibility (can be removed later)
export type RolesTabProps = Record<string, never>
