/**
 * WorkflowRoleFormDialog - Create or edit a workflow role
 * 
 * A unified dialog for both creating new workflow roles and
 * editing existing ones. The mode is determined by whether
 * editingRole is provided.
 * 
 * @module team-members/WorkflowRoleFormDialog
 */

import { IconGridPicker } from '@/components/shared/IconPicker'
import { ColorPickerDropdown } from '@/components/shared/ColorPicker'
import { getRoleIcon } from '../../utils'
import type { WorkflowRoleBasic, WorkflowRoleFormData } from '../../types'

export interface WorkflowRoleFormDialogProps {
  mode: 'create' | 'edit'
  formData: WorkflowRoleFormData
  setFormData: (fn: (prev: WorkflowRoleFormData) => WorkflowRoleFormData) => void
  editingRole?: WorkflowRoleBasic | null
  onSave: () => Promise<void>
  onClose: () => void
  isSaving: boolean
}

export function WorkflowRoleFormDialog({
  mode,
  formData,
  setFormData,
  editingRole: _editingRole,
  onSave,
  onClose,
  isSaving
}: WorkflowRoleFormDialogProps) {
  const isEditMode = mode === 'edit'
  const title = isEditMode ? 'Edit Workflow Role' : 'Create Workflow Role'
  const saveButtonText = isEditMode 
    ? (isSaving ? 'Saving...' : 'Save Changes')
    : (isSaving ? 'Creating...' : 'Create')

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-plm-fg mb-4">{title}</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-plm-fg mb-1">Role Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Design Lead"
              className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-plm-fg placeholder:text-plm-fg-muted/50 focus:outline-none focus:border-plm-accent"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-plm-fg mb-1">Description (optional)</label>
            <input
              type="text"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="e.g., Leads design reviews"
              className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-plm-fg placeholder:text-plm-fg-muted/50 focus:outline-none focus:border-plm-accent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-plm-fg mb-1">Color</label>
            <div className="flex items-center gap-2">
              <ColorPickerDropdown
                color={formData.color}
                onChange={(c) => c && setFormData(prev => ({ ...prev, color: c }))}
                triggerSize="lg"
                showReset={false}
                title="Role Color"
              />
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${formData.color}20`, color: formData.color }}
              >
                {(() => {
                  const IconComp = getRoleIcon(formData.icon)
                  return <IconComp size={16} />
                })()}
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-plm-fg mb-1">Icon</label>
            <IconGridPicker
              value={formData.icon}
              onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
              maxHeight="128px"
              columns={8}
            />
          </div>
          
          {isEditMode && (
            <p className="text-xs text-plm-fg-muted bg-plm-bg p-2 rounded">
              Changes will update for all users with this role.
            </p>
          )}
        </div>
        
        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !formData.name.trim()}
            className="btn btn-primary"
          >
            {saveButtonText}
          </button>
        </div>
      </div>
    </div>
  )
}
