/**
 * Settings > File Workflows (schema 110): turn file workflows on or off for the organization, and
 * decide what an approved review does with files in a review stage. Org-wide, in
 * `organizations.settings`; administrators change it, everyone else sees it read-only.
 *
 * The server reads the same keys: `execute_workflow_transition` refuses while workflows are off,
 * and `review_settle` / `advance_reviewed_files` apply the review-stage rules.
 */

import { useState } from 'react'
import { GitBranch, Loader2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { fileWorkflowsEnabled } from '@/lib/fileWorkflows'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { OrgSettings } from '@/types/pdm'

type WorkflowSettingsPatch = Pick<
  OrgSettings,
  'file_workflows_enabled' | 'review_stage_on_approval' | 'review_stage_package_policy'
>

interface ChoiceProps<T extends string> {
  name: string
  value: T
  options: { value: T; label: string; hint: string }[]
  disabled: boolean
  onChange: (value: T) => void
}

function Choice<T extends string>({ name, value, options, disabled, onChange }: ChoiceProps<T>) {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex items-start gap-2 p-2 rounded border ${
            value === option.value ? 'border-plm-accent bg-plm-accent/5' : 'border-plm-border'
          } ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
        >
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm text-plm-fg">{option.label}</span>
            <span className="block text-xs text-plm-fg-muted">{option.hint}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

export function FileWorkflowsSettings() {
  const { organization, setOrganization, addToast, getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      setOrganization: s.setOrganization,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )
  const [saving, setSaving] = useState(false)

  const isAdmin = getEffectiveRole() === 'admin'
  const enabled = fileWorkflowsEnabled(organization)
  const onApproval = organization?.settings?.review_stage_on_approval ?? 'hold'
  const packagePolicy = organization?.settings?.review_stage_package_policy ?? 'together'
  const disabled = !isAdmin || saving

  const save = async (patch: WorkflowSettingsPatch) => {
    if (!organization) return
    setSaving(true)
    try {
      // Read the current settings first so a concurrent change to another key is not overwritten.
      const { data: current } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organization.id)
        .single()
      const base = (current?.settings ?? organization.settings ?? {}) as OrgSettings
      const settings: OrgSettings = { ...base, ...patch }

      const { data, error } = await supabase
        .from('organizations')
        .update({ settings: settings as never })
        .eq('id', organization.id)
        .select('settings')
        .single()
      if (error) throw error
      if (!data) throw new Error(t('workflows.settings.noPermission'))

      setOrganization({ ...organization, settings })
      addToast('success', t('workflows.settings.saved'))
    } catch (error) {
      log.error('[Workflow]', 'Saving the file workflow settings failed', { error })
      addToast(
        'error',
        t('workflows.settings.saveFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-plm-fg flex items-center gap-2">
          <GitBranch size={18} />
          {t('workflows.settings.title')}
          {saving && <Loader2 size={14} className="animate-spin text-plm-fg-muted" />}
        </h2>
        <p className="text-sm text-plm-fg-muted mt-1">{t('workflows.settings.intro')}</p>
        {!isAdmin && (
          <p className="text-xs text-plm-warning mt-2">{t('workflows.settings.adminOnly')}</p>
        )}
      </div>

      <label
        className={`flex items-start gap-3 p-3 rounded border border-plm-border ${
          disabled ? 'opacity-60' : 'cursor-pointer'
        }`}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => void save({ file_workflows_enabled: e.target.checked })}
          className="mt-0.5 rounded"
        />
        <span>
          <span className="block text-sm font-medium text-plm-fg">
            {t('workflows.settings.enable')}
          </span>
          <span className="block text-xs text-plm-fg-muted">
            {enabled ? t('workflows.settings.enabledHint') : t('workflows.settings.disabledHint')}
          </span>
        </span>
      </label>

      {enabled && (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-plm-fg">
              {t('workflows.settings.onApprovalTitle')}
            </h3>
            <p className="text-xs text-plm-fg-muted">{t('workflows.settings.onApprovalIntro')}</p>
            <Choice
              name="review-stage-on-approval"
              value={onApproval}
              disabled={disabled}
              onChange={(value) => void save({ review_stage_on_approval: value })}
              options={[
                {
                  value: 'hold',
                  label: t('workflows.settings.hold'),
                  hint: t('workflows.settings.holdHint'),
                },
                {
                  value: 'advance',
                  label: t('workflows.settings.advance'),
                  hint: t('workflows.settings.advanceHint'),
                },
              ]}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-plm-fg">
              {t('workflows.settings.packageTitle')}
            </h3>
            <p className="text-xs text-plm-fg-muted">{t('workflows.settings.packageIntro')}</p>
            <Choice
              name="review-stage-package-policy"
              value={packagePolicy}
              disabled={disabled}
              onChange={(value) => void save({ review_stage_package_policy: value })}
              options={[
                {
                  value: 'together',
                  label: t('workflows.settings.together'),
                  hint: t('workflows.settings.togetherHint'),
                },
                {
                  value: 'approved_only',
                  label: t('workflows.settings.approvedOnly'),
                  hint: t('workflows.settings.approvedOnlyHint'),
                },
              ]}
            />
          </section>
        </>
      )}
    </div>
  )
}
