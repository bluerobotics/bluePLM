/**
 * JobTitleFormDialog - Create or edit a job title
 * 
 * A unified dialog for both creating new job titles and editing existing ones.
 * When editingTitle is provided, the dialog is in edit mode.
 * 
 * @module team-members/JobTitleFormDialog
 */

import * as LucideIcons from 'lucide-react'
import { Briefcase } from 'lucide-react'
import { IconGridPicker } from '@/components/shared/IconPicker'
import { ColorPickerDropdown } from '@/components/shared/ColorPicker'
import type { OrgUser, JobTitle } from '../../types'

export interface JobTitleFormDialogProps {
  editingTitle: JobTitle | null
  titleName: string
  setTitleName: (name: string) => void
  titleColor: string
  setTitleColor: (color: string) => void
  titleIcon: string
  setTitleIcon: (icon: string) => void
  pendingTitleForUser?: OrgUser | null
  onSave: () => Promise<void>
  onClose: () => void
  isSaving: boolean
}

export function JobTitleFormDialog({
  editingTitle,
  titleName,
  setTitleName,
  titleColor,
  setTitleColor,
  titleIcon,
  setTitleIcon,
  pendingTitleForUser,
  onSave,
  onClose,
  isSaving
}: JobTitleFormDialogProps) {
  const isEditMode = !!editingTitle
  const title = isEditMode ? 'Edit Job Title' : 'Create Job Title'
  const saveButtonText = isSaving 
    ? 'Saving...' 
    : (isEditMode ? 'Save Changes' : 'Create')

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-plm-fg mb-4">{title}</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-plm-fg mb-1">Title Name</label>
            <input
              type="text"
              value={titleName}
              onChange={e => setTitleName(e.target.value)}
              placeholder="e.g., Quality Engineer"
              className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-plm-fg placeholder:text-plm-fg-muted/50 focus:outline-none focus:border-plm-accent"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-plm-fg mb-1">Color</label>
            <div className="flex items-center gap-2">
              <ColorPickerDropdown
                color={titleColor}
                onChange={(c) => c && setTitleColor(c)}
                triggerSize="lg"
                showReset={false}
                title="Title Color"
              />
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${titleColor}20`, color: titleColor }}
              >
                {(() => {
                  const IconComp = (LucideIcons as any)[titleIcon] || Briefcase
                  return <IconComp size={16} />
                })()}
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-plm-fg mb-1">Icon</label>
            <IconGridPicker
              value={titleIcon}
              onChange={setTitleIcon}
              maxHeight="128px"
              columns={8}
            />
          </div>
          
          {pendingTitleForUser && (
            <p className="text-sm text-plm-fg-muted">
              Will assign to: <strong className="text-plm-fg">{pendingTitleForUser.full_name || pendingTitleForUser.email}</strong>
            </p>
          )}
          
          {isEditMode && (
            <p className="text-xs text-plm-fg-muted bg-plm-bg p-2 rounded">
              Changes will update for all users with this title.
            </p>
          )}
        </div>
        
        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !titleName.trim()}
            className="btn btn-primary"
          >
            {saveButtonText}
          </button>
        </div>
      </div>
    </div>
  )
}
