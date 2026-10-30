/**
 * Settings > File Workflows (schema 110): turn file workflows on or off for the organization, and
 * decide what an approved review does with files in a review stage. Org-wide, in
 * `organizations.settings`; administrators change it, everyone else sees it read-only.
 *
 * The server reads the same keys: `execute_workflow_transition` refuses while workflows are off,
 * and `review_settle` / `advance_reviewed_files` apply the review-stage rules.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Callout, Switch } from '@/components/core/ui'
import { fileWorkflowsEnabled } from '@/lib/fileWorkflows'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { OrgSettings } from '@/types/pdm'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'

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

/** One choice of a review-stage rule, as a row of radio options inside a SettingsGroup. */
function Choice<T extends string>({ name, value, options, disabled, onChange }: ChoiceProps<T>) {
  return (
    <SettingsGroup>
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex items-start gap-3 px-4 py-3 ${
            disabled ? 'opacity-60' : 'cursor-pointer hover:bg-plm-highlight/40'
          }`}
        >
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            className="mt-0.5 accent-plm-accent"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-plm-fg">{option.label}</span>
            <span className="mt-0.5 block text-[12px] leading-relaxed text-plm-fg-muted">
              {option.hint}
            </span>
          </span>
        </label>
      ))}
    </SettingsGroup>
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
    <SettingsPage>
      {!isAdmin && <Callout tone="warning">{t('workflows.settings.adminOnly')}</Callout>}

      <SettingsSection
        description={t('workflows.settings.intro')}
        // Always set, so the heading (and with it the description) renders; the spinner shows
        // while a change saves.
        actions={
          <span className="inline-flex h-4 w-4 items-center" aria-live="polite">
            {saving && <Loader2 size={14} className="animate-spin text-plm-fg-muted" />}
          </span>
        }
      >
        <SettingsGroup>
          <SettingRow
            label={t('workflows.settings.enable')}
            htmlFor="file-workflows-enabled"
            description={
              enabled ? t('workflows.settings.enabledHint') : t('workflows.settings.disabledHint')
            }
          >
            <Switch
              id="file-workflows-enabled"
              checked={enabled}
              disabled={disabled}
              onChange={(checked) => void save({ file_workflows_enabled: checked })}
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      {enabled && (
        <>
          <SettingsSection
            title={t('workflows.settings.onApprovalTitle')}
            description={t('workflows.settings.onApprovalIntro')}
          >
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
          </SettingsSection>

          <SettingsSection
            title={t('workflows.settings.packageTitle')}
            description={t('workflows.settings.packageIntro')}
          >
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
          </SettingsSection>
        </>
      )}
    </SettingsPage>
  )
}
