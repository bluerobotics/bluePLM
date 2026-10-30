import { useState, type FormEvent } from 'react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { navigate } from '@web/lib/router'
import { ErrorState, Forbidden, Loading, NotFound, PageHeader } from '@web/shell/ui'
import { createEco, getEco, logEcoActivity, updateEco, type EcoRow } from './api'
import { errorMessage, useLoad, usePermissions } from './hooks'
import { ECO_ACTIVITY, hasErrors, normalizeNumber, nullableText, validateEcoDraft, type EcoDraft, type EcoDraftErrors } from './model'
import { paths } from './routes'
import { Button, Field, inputClass, LinkButton, Notice } from './ui'

export function EcoCreatePage() {
  const t = useT()
  const permissions = usePermissions()
  if (!permissions.eco.create) return <Forbidden />
  return (
    <div>
      <PageHeader title={t('changeControl.eco.new')} />
      <EcoForm initial={null} />
    </div>
  )
}

export function EcoEditPage({ id }: { id: string }) {
  const t = useT()
  const permissions = usePermissions()
  const auth = useReadyAuth()
  const { data, error, loading, reload } = useLoad(() => getEco(id, { userId: auth.profile.id, orgId: auth.profile.org_id, isAdmin: auth.isAdmin }), id)
  if (!permissions.eco.edit) return <Forbidden />
  if (loading && !data) return <Loading />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <NotFound />
  return (
    <div>
      <PageHeader title={t('changeControl.eco.editTitle', { number: data.eco.eco_number })} />
      <EcoForm initial={data.eco} />
    </div>
  )
}

function EcoForm({ initial }: { initial: EcoRow | null }) {
  const t = useT()
  const auth = useReadyAuth()
  const [draft, setDraft] = useState<EcoDraft>({
    number: initial?.eco_number ?? '',
    title: initial?.title ?? '',
    description: initial?.description ?? '',
  })
  const [errors, setErrors] = useState<EcoDraftErrors>({})
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const set = (key: keyof EcoDraft) => (value: string) => setDraft((previous) => ({ ...previous, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = validateEcoDraft(draft)
    setErrors(found)
    if (hasErrors(found)) return
    setSaving(true)
    setFailure(null)
    const values = { eco_number: normalizeNumber(draft.number), title: nullableText(draft.title), description: nullableText(draft.description) }
    try {
      if (initial) {
        await updateEco(initial.id, { ...values, updated_at: new Date().toISOString(), updated_by: auth.profile.id })
        const changed = (['eco_number', 'title', 'description'] as const).filter((key) => (initial[key] ?? null) !== values[key])
        if (changed.length > 0) await logEcoActivity(initial.id, auth.profile.id, ECO_ACTIVITY.edited, { new: changed.join(',') })
        navigate(paths.eco(initial.id))
      } else {
        const id = await createEco(auth.profile.org_id, auth.profile.id, values)
        navigate(paths.eco(id))
      }
    } catch (error) {
      setFailure(errorMessage(error, 'changeControl.eco.duplicateNumber'))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex max-w-2xl flex-col gap-4 p-4" noValidate>
      {failure && <Notice tone="error">{failure}</Notice>}
      <Field label={t('changeControl.eco.number')} htmlFor="eco-number" error={errors.number} hint={t('changeControl.numberHint')}>
        <input id="eco-number" className={`${inputClass} font-mono`} value={draft.number} onChange={(event) => set('number')(event.target.value)} autoComplete="off" required />
      </Field>
      <Field label={t('changeControl.eco.titleField')} htmlFor="eco-title" error={errors.title}>
        <input id="eco-title" className={inputClass} value={draft.title} onChange={(event) => set('title')(event.target.value)} />
      </Field>
      <Field label={t('changeControl.description')} htmlFor="eco-description">
        <textarea id="eco-description" rows={6} className={inputClass} value={draft.description} onChange={(event) => set('description')(event.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? t('changeControl.saving') : initial ? t('common.save') : t('changeControl.eco.create')}
        </Button>
        <LinkButton to={initial ? paths.eco(initial.id) : paths.ecoList()} variant="ghost">
          {t('common.cancel')}
        </LinkButton>
      </div>
    </form>
  )
}
