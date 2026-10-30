// The ECO's phase-gate checklist: copied from a process template by instantiate_process_template,
// items tracked per phase, a gate approved through approve_eco_gate once its required items are
// complete or N/A. Templates themselves are managed by admins and are not edited here.
import { useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { applyProcessTemplate, approveGate, logEcoActivity, updateChecklistItem, type ChecklistItemRow, type EcoDetailData, type GateRow } from './api'
import { errorMessage, usePermissions } from './hooks'
import { CHECKLIST_STATUSES, checklistStatusPatch, ECO_ACTIVITY, groupChecklist, nullableText, type ChecklistPhase, type ChecklistStatus } from './model'
import { Button, Card, ChecklistStatusBadge, ConfirmButton, formatDate, formatDateTime, inputClass, Notice, userLabel } from './ui'

export function EcoChecklist({ data, reload }: { data: EcoDetailData; reload: () => void }) {
  const t = useT()
  const auth = useReadyAuth()
  const permissions = usePermissions()
  const canEdit = permissions.eco.edit
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState('')
  const phases = useMemo(() => groupChecklist(data.checklist, data.gates), [data.checklist, data.gates])
  const userId = auth.profile.id
  const ecoId = data.eco.id
  const hasChecklist = phases.length > 0
  const currentTemplate = data.templates.find((template) => template.id === data.eco.process_template_id)

  if (!hasChecklist && (!canEdit || data.templates.length === 0)) return null

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setFailure(null)
    try {
      await action()
      reload()
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const apply = () =>
    run(async () => {
      const template = data.templates.find((candidate) => candidate.id === templateId)
      if (!template) return
      await applyProcessTemplate(ecoId, template.id)
      await logEcoActivity(ecoId, userId, ECO_ACTIVITY.templateApplied, { new: template.name })
      setTemplateId('')
    })

  const setStatus = (item: ChecklistItemRow, to: ChecklistStatus) =>
    run(async () => {
      await updateChecklistItem(item.id, checklistStatusPatch(item.status, to, userId, new Date().toISOString(), item.started_at))
      await logEcoActivity(ecoId, userId, ECO_ACTIVITY.itemStatus, { old: item.status ?? 'not_started', new: to, notes: item.name, checklistItemId: item.id })
    })

  const approve = (gate: GateRow, notes: string) =>
    run(async () => {
      const result = await approveGate(ecoId, gate.gate_name, nullableText(notes))
      if (!result.success) {
        throw new Error(
          result.incomplete.length > 0
            ? t('changeControl.checklist.gateIncomplete', { items: result.incomplete.join(', ') })
            : result.error || t('common.unknownError'),
        )
      }
    })

  const templatePicker = canEdit && data.templates.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={t('changeControl.checklist.template')} value={templateId} onChange={(event) => setTemplateId(event.target.value)} className={`${inputClass} w-auto`}>
        <option value="">{t('changeControl.checklist.chooseTemplate')}</option>
        {data.templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
      {hasChecklist ? (
        <ConfirmButton
          label={t('changeControl.checklist.replace')}
          confirmLabel={t('changeControl.checklist.replaceConfirm')}
          prompt={t('changeControl.checklist.replacePrompt')}
          onConfirm={() => void apply()}
          disabled={busy || !templateId}
        />
      ) : (
        <Button variant="primary" disabled={busy || !templateId} onClick={() => void apply()}>
          {t('changeControl.checklist.apply')}
        </Button>
      )}
    </div>
  )

  return (
    <Card title={currentTemplate ? t('changeControl.checklist.titleWithTemplate', { template: currentTemplate.name }) : t('changeControl.checklist.title')}>
      <div className="flex flex-col gap-4">
        {failure && <Notice tone="error">{failure}</Notice>}
        {!hasChecklist && <p className="text-sm text-plm-fg-muted">{t('changeControl.checklist.empty')}</p>}
        {phases.map((phase) => (
          <Phase key={phase.name} phase={phase} data={data} canEdit={canEdit} busy={busy} onStatus={setStatus} onApprove={approve} />
        ))}
        {templatePicker}
      </div>
    </Card>
  )
}

function Phase({
  phase,
  data,
  canEdit,
  busy,
  onStatus,
  onApprove,
}: {
  phase: ChecklistPhase<ChecklistItemRow, GateRow>
  data: EcoDetailData
  canEdit: boolean
  busy: boolean
  onStatus: (item: ChecklistItemRow, to: ChecklistStatus) => Promise<void>
  onApprove: (gate: GateRow, notes: string) => Promise<void>
}) {
  const t = useT()
  const [notes, setNotes] = useState('')
  const gate = phase.gate
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold text-plm-fg">{phase.name}</h3>
        {phase.total > 0 && <span className="text-xs text-plm-fg-muted">{t('changeControl.checklist.progress', { done: phase.done, total: phase.total })}</span>}
      </div>
      {phase.items.length > 0 && (
        <ul className="mt-1 divide-y divide-plm-border rounded border border-plm-border">
          {phase.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-plm-fg">
                  {item.doc_number && <span className="mr-1 font-mono text-xs text-plm-fg-muted">{item.doc_number}</span>}
                  {item.name}
                  {item.required_for_gate && <span className="ml-1 text-xs text-plm-warning">{t('changeControl.checklist.required')}</span>}
                </div>
                <div className="text-xs text-plm-fg-muted">
                  {[
                    item.responsible_text && t('changeControl.checklist.responsible', { name: item.responsible_text }),
                    item.target_date && t('changeControl.checklist.due', { date: formatDate(item.target_date) }),
                    item.completed_at && t('changeControl.checklist.completedBy', { name: userLabel(data.users, item.completed_by), date: formatDate(item.completed_at) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {item.link_url && /^https?:\/\//i.test(item.link_url) && (
                  <a href={item.link_url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-plm-accent hover:underline">
                    {item.link_url}
                  </a>
                )}
              </div>
              {canEdit ? (
                <select
                  aria-label={t('changeControl.checklist.statusFor', { item: item.name })}
                  value={item.status ?? 'not_started'}
                  disabled={busy}
                  onChange={(event) => void onStatus(item, event.target.value as ChecklistStatus)}
                  className={`${inputClass} w-auto`}
                >
                  {CHECKLIST_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(`changeControl.checklistStatus.${status}`)}
                    </option>
                  ))}
                </select>
              ) : (
                <ChecklistStatusBadge status={item.status} />
              )}
            </li>
          ))}
        </ul>
      )}
      {gate && (
        <div className="mt-2 rounded bg-plm-bg-lighter px-2 py-2 text-sm">
          {gate.is_approved ? (
            <p className="flex flex-wrap items-center gap-1 text-plm-success">
              <CheckCircle2 size={14} />
              {t('changeControl.checklist.gateApproved', {
                gate: gate.gate_name,
                name: userLabel(data.users, gate.approved_by),
                date: formatDateTime(gate.approved_at),
              })}
              {gate.notes && <span className="block w-full whitespace-pre-wrap text-xs text-plm-fg-dim">{gate.notes}</span>}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-plm-fg">{t('changeControl.checklist.gatePending', { gate: gate.gate_name })}</p>
              {phase.blocking.length > 0 && (
                <p className="text-xs text-plm-warning">{t('changeControl.checklist.gateIncomplete', { items: phase.blocking.join(', ') })}</p>
              )}
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={t('changeControl.checklist.gateNotes')}
                    placeholder={t('changeControl.checklist.gateNotes')}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className={`${inputClass} max-w-sm flex-1`}
                  />
                  <Button variant="primary" disabled={busy || phase.blocking.length > 0} onClick={() => void onApprove(gate, notes)}>
                    {t('changeControl.checklist.approveGate')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
