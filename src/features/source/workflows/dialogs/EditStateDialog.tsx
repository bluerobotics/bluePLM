// Edit State Dialog Component
import { useState, useEffect } from 'react'
import { BadgeCheck, CheckCircle } from 'lucide-react'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '@/lib/supabase'
import { STATE_COLORS } from '@/types/workflow'
import { IconGridPicker } from '@/components/shared/IconPicker'
import type { EditStateDialogProps, WorkflowRoleBasic } from '../types'

export function EditStateDialog({ state, onClose, onSave }: EditStateDialogProps) {
  const { organization } = usePDMStore(useShallow((s) => ({ organization: s.organization })))
  const [name, setName] = useState(state.name)
  const [label, setLabel] = useState(state.label || '')
  const [description, setDescription] = useState(state.description || '')
  const [color, setColor] = useState(state.color)
  const [icon, setIcon] = useState(state.icon)
  const [isEditable, setIsEditable] = useState(state.is_editable)
  // requires_checkout is now auto-set to match is_editable (simplified UX)
  const [autoRev, setAutoRev] = useState(state.is_revision_auto_incremented)
  const [requiredRoles, setRequiredRoles] = useState<string[]>(state.required_workflow_roles || [])
  const [isReviewStage, setIsReviewStage] = useState(state.is_review_stage === true)
  const [approvedStateId, setApprovedStateId] = useState<string | null>(
    state.review_approved_state_id ?? null,
  )

  // Resync form fields when the dialog is reused for a different state
  useEffect(() => {
    setName(state.name)
    setLabel(state.label || '')
    setDescription(state.description || '')
    setColor(state.color)
    setIcon(state.icon)
    setIsEditable(state.is_editable)
    setAutoRev(state.is_revision_auto_incremented)
    setRequiredRoles(state.required_workflow_roles || [])
    setIsReviewStage(state.is_review_stage === true)
    setApprovedStateId(state.review_approved_state_id ?? null)
  }, [
    state.is_review_stage,
    state.review_approved_state_id,
    state.id,
    state.name,
    state.label,
    state.description,
    state.color,
    state.icon,
    state.is_editable,
    state.is_revision_auto_incremented,
    state.required_workflow_roles,
  ])

  // Load workflow roles
  const [workflowRoles, setWorkflowRoles] = useState<WorkflowRoleBasic[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)

  useEffect(() => {
    const loadRoles = async () => {
      if (!organization) return
      try {
        const { data, error } = await supabase
          .from('workflow_role')
          .select('id, name, color, icon')
          .eq('org_id', organization.id)
          .eq('is_active', true)
          .order('sort_order')
          .order('name')

        if (!error && data) {
          setWorkflowRoles(data as WorkflowRoleBasic[])
        }
      } catch (error) {
        log.error('[Workflow]', 'Failed to load workflow roles', { error: error })
      } finally {
        setLoadingRoles(false)
      }
    }
    loadRoles()
  }, [organization])

  // The states this one can move to: a review stage's approval takes one of these exits.
  const [exits, setExits] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    let cancelled = false
    const loadExits = async () => {
      const { data, error } = await supabase
        .from('workflow_transition')
        .select('to_state_id, to_state:workflow_state!workflow_transition_to_state_id_fkey(name)')
        .eq('from_state_id', state.id)
      if (cancelled) return
      if (error) {
        log.warn('[Workflow]', 'Failed to load the exits of the state', { error })
        return
      }
      setExits(
        (data ?? []).map((row) => ({
          id: row.to_state_id,
          name: (row.to_state as { name?: string } | null)?.name ?? row.to_state_id,
        })),
      )
    }
    void loadExits()
    return () => {
      cancelled = true
    }
  }, [state.id])

  const toggleRequiredRole = (roleId: string) => {
    if (requiredRoles.includes(roleId)) {
      setRequiredRoles(requiredRoles.filter((id) => id !== roleId))
    } else {
      setRequiredRoles([...requiredRoles, roleId])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-plm-sidebar rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-auto p-4">
        <h3 className="font-semibold mb-4">Edit State</h3>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-plm-fg-muted mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-plm-fg-muted mb-1">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm"
                placeholder={name}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm h-16 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Color</label>
            <div className="flex flex-wrap gap-1">
              {STATE_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-6 h-6 rounded ${color === c.value ? 'ring-2 ring-white ring-offset-1 ring-offset-plm-sidebar' : ''}`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Icon</label>
            <IconGridPicker value={icon} onChange={setIcon} maxHeight="128px" columns={8} />
          </div>

          {/* Required Workflow Roles */}
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">
              Required Roles to Enter State
              <span className="text-plm-fg-muted/60 ml-1">(optional)</span>
            </label>
            {loadingRoles ? (
              <div className="text-xs text-plm-fg-muted py-2">Loading roles...</div>
            ) : workflowRoles.length === 0 ? (
              <div className="text-xs text-plm-fg-muted py-2 bg-plm-bg rounded p-2">
                No workflow roles defined.{' '}
                <button
                  onClick={() => {
                    const { setActiveView } = usePDMStore.getState()
                    setActiveView('settings')
                    window.dispatchEvent(
                      new CustomEvent('navigate-settings-tab', { detail: 'team-members' }),
                    )
                    setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent('navigate-team-members-tab', { detail: 'users' }),
                      )
                    }, 50)
                    onClose()
                  }}
                  className="text-plm-accent hover:underline"
                >
                  Create roles in Settings
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-2 bg-plm-bg rounded border border-plm-border max-h-24 overflow-y-auto">
                {workflowRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => toggleRequiredRole(role.id)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                      requiredRoles.includes(role.id)
                        ? 'ring-1 ring-plm-accent'
                        : 'hover:bg-plm-highlight'
                    }`}
                    style={{
                      backgroundColor: requiredRoles.includes(role.id)
                        ? role.color + '30'
                        : undefined,
                    }}
                    title={
                      requiredRoles.includes(role.id)
                        ? 'Click to remove requirement'
                        : 'Click to require this role'
                    }
                  >
                    <BadgeCheck size={12} style={{ color: role.color }} />
                    <span>{role.name}</span>
                    {requiredRoles.includes(role.id) && (
                      <CheckCircle size={10} className="text-plm-success" />
                    )}
                  </button>
                ))}
              </div>
            )}
            {requiredRoles.length > 0 && (
              <p className="text-[10px] text-plm-fg-muted mt-1">
                Users must have {requiredRoles.length === 1 ? 'this role' : 'any of these roles'} to
                enter this state
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isEditable}
                onChange={(e) => setIsEditable(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Files can be edited in this state</span>
            </label>
            {/* requires_checkout is now auto-set to match is_editable */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRev}
                onChange={(e) => setAutoRev(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Auto-increment revision on transition</span>
            </label>
          </div>

          {/* Review stage: files entering it go to a review; an approval moves them on */}
          <div className="space-y-2 border-t border-plm-border pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isReviewStage}
                onChange={(e) => setIsReviewStage(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">{t('workflows.reviewStage.toggle')}</span>
            </label>
            <p className="text-[10px] text-plm-fg-muted">{t('workflows.reviewStage.hint')}</p>
            {isReviewStage && (
              <div>
                <label className="block text-xs text-plm-fg-muted mb-1">
                  {t('workflows.reviewStage.onApproval')}
                </label>
                <select
                  value={approvedStateId ?? ''}
                  onChange={(e) => setApprovedStateId(e.target.value || null)}
                  className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm"
                >
                  <option value="">
                    {exits.length === 1
                      ? t('workflows.reviewStage.onlyExit', { state: exits[0].name })
                      : t('workflows.reviewStage.chooseExit')}
                  </option>
                  {exits.map((exit) => (
                    <option key={exit.id} value={exit.id}>
                      {exit.name}
                    </option>
                  ))}
                </select>
                {exits.length !== 1 && !approvedStateId && (
                  <p className="text-[10px] text-plm-warning mt-1">
                    {t('workflows.reviewStage.needsExit')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm hover:bg-plm-bg rounded">
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                name,
                label: label || null,
                description: description || null,
                color,
                icon,
                is_editable: isEditable,
                is_checkout_required: isEditable, // Auto-set: editable states require checkout
                is_revision_auto_incremented: autoRev,
                required_workflow_roles: requiredRoles,
                is_review_stage: isReviewStage,
                review_approved_state_id: isReviewStage ? approvedStateId : null,
              })
            }
            className="px-3 py-1.5 text-sm bg-plm-accent hover:bg-plm-accent-hover text-white rounded"
            disabled={!name.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
