import { useState, type FormEvent } from 'react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { navigate } from '@web/lib/router'
import { ErrorState, Forbidden, Loading, NotFound, PageHeader } from '@web/shell/ui'
import { createDeviation, getDeviation, updateDeviation, type DeviationRow, type DeviationValues } from './api'
import { errorMessage, useLoad, usePermissions } from './hooks'
import {
  dateInputToIso,
  DEVIATION_TYPES,
  hasErrors,
  isKnownDeviationType,
  isoToDateInput,
  normalizeNumber,
  nullableText,
  parsePartNumbers,
  validateDeviationDraft,
  type DeviationDraft,
  type DeviationDraftErrors,
} from './model'
import { paths } from './routes'
import { Button, Field, inputClass, LinkButton, Notice } from './ui'

export function DeviationCreatePage() {
  const t = useT()
  const permissions = usePermissions()
  if (!permissions.deviations.create) return <Forbidden />
  return (
    <div>
      <PageHeader title={t('changeControl.deviation.new')} />
      <DeviationForm initial={null} />
    </div>
  )
}

export function DeviationEditPage({ id }: { id: string }) {
  const t = useT()
  const permissions = usePermissions()
  const auth = useReadyAuth()
  const { data, error, loading, reload } = useLoad(() => getDeviation(id, { userId: auth.profile.id, orgId: auth.profile.org_id, isAdmin: auth.isAdmin }), id)
  if (!permissions.deviations.edit) return <Forbidden />
  if (loading && !data) return <Loading />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <NotFound />
  return (
    <div>
      <PageHeader title={t('changeControl.deviation.editTitle', { number: data.deviation.deviation_number })} />
      <DeviationForm initial={data.deviation} />
    </div>
  )
}

function DeviationForm({ initial }: { initial: DeviationRow | null }) {
  const t = useT()
  const auth = useReadyAuth()
  const [draft, setDraft] = useState<DeviationDraft>({
    number: initial?.deviation_number ?? '',
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    type: initial?.deviation_type ?? '',
    effectiveDate: initial ? isoToDateInput(initial.effective_date) : '',
    expirationDate: isoToDateInput(initial?.expiration_date),
    partNumbers: (initial?.affected_part_numbers ?? []).join('\n'),
  })
  const [errors, setErrors] = useState<DeviationDraftErrors>({})
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const set = (key: keyof DeviationDraft) => (value: string) => setDraft((previous) => ({ ...previous, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = validateDeviationDraft(draft)
    setErrors(found)
    if (hasErrors(found)) return
    setSaving(true)
    setFailure(null)
    const values: DeviationValues = {
      deviation_number: normalizeNumber(draft.number),
      title: draft.title.trim(),
      description: nullableText(draft.description),
      deviation_type: nullableText(draft.type),
      // Empty on create lets the column default (now) apply; on edit it keeps the stored date.
      effective_date: dateInputToIso(draft.effectiveDate) ?? (initial ? initial.effective_date : null),
      expiration_date: dateInputToIso(draft.expirationDate),
      affected_part_numbers: parsePartNumbers(draft.partNumbers),
    }
    try {
      if (initial) {
        await updateDeviation(initial.id, { ...values, updated_at: new Date().toISOString(), updated_by: auth.profile.id })
        navigate(paths.deviation(initial.id))
      } else {
        const id = await createDeviation(auth.profile.org_id, auth.profile.id, values)
        navigate(paths.deviation(id))
      }
    } catch (error) {
      setFailure(errorMessage(error, 'changeControl.deviation.duplicateNumber'))
      setSaving(false)
    }
  }

  // A type written by another client that is not in the list is kept as its own option.
  const typeOptions = isKnownDeviationType(draft.type) || !draft.type ? [...DEVIATION_TYPES] : [...DEVIATION_TYPES, draft.type]

  return (
    <form onSubmit={(event) => void submit(event)} className="flex max-w-2xl flex-col gap-4 p-4" noValidate>
      {failure && <Notice tone="error">{failure}</Notice>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('changeControl.deviation.number')} htmlFor="dev-number" error={errors.number} hint={t('changeControl.numberHint')}>
          <input id="dev-number" className={`${inputClass} font-mono`} value={draft.number} onChange={(event) => set('number')(event.target.value)} autoComplete="off" required />
        </Field>
        <Field label={t('changeControl.deviation.type')} htmlFor="dev-type">
          <select id="dev-type" className={inputClass} value={draft.type} onChange={(event) => set('type')(event.target.value)}>
            <option value="">{t('changeControl.deviation.noType')}</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {isKnownDeviationType(type) ? t(`changeControl.deviationType.${type.toLowerCase()}`) : type}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('changeControl.deviation.titleField')} htmlFor="dev-title" error={errors.title}>
        <input id="dev-title" className={inputClass} value={draft.title} onChange={(event) => set('title')(event.target.value)} required />
      </Field>
      <Field label={t('changeControl.description')} htmlFor="dev-description">
        <textarea id="dev-description" rows={5} className={inputClass} value={draft.description} onChange={(event) => set('description')(event.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('changeControl.deviation.effectiveDate')} htmlFor="dev-effective" hint={initial ? undefined : t('changeControl.deviation.effectiveHint')}>
          <input id="dev-effective" type="date" className={inputClass} value={draft.effectiveDate} onChange={(event) => set('effectiveDate')(event.target.value)} />
        </Field>
        <Field label={t('changeControl.deviation.expirationDate')} htmlFor="dev-expiration" error={errors.expirationDate}>
          <input id="dev-expiration" type="date" className={inputClass} value={draft.expirationDate} onChange={(event) => set('expirationDate')(event.target.value)} />
        </Field>
      </div>
      <Field label={t('changeControl.deviation.partNumbers')} htmlFor="dev-parts" hint={t('changeControl.deviation.partNumbersHint')}>
        <textarea id="dev-parts" rows={3} className={`${inputClass} font-mono`} value={draft.partNumbers} onChange={(event) => set('partNumbers')(event.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? t('changeControl.saving') : initial ? t('common.save') : t('changeControl.deviation.create')}
        </Button>
        <LinkButton to={initial ? paths.deviation(initial.id) : paths.deviationList()} variant="ghost">
          {t('common.cancel')}
        </LinkButton>
      </div>
    </form>
  )
}
