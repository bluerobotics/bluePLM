// Account: the signed-in user's profile, display name, language, theme and sign out.
import { useState, type FormEvent, type ReactNode } from 'react'
import type { SectionProps } from '@web/shell/ui'
import { NotFound, PageHeader } from '@web/shell/ui'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { getLanguage, setLanguage, useT, WEB_LANGUAGES, type WebLanguage } from '@web/i18n'
import { checkDisplayName, normalizeDisplayName, signOutEverywhere, updateDisplayName } from './profile'
import { getSavedTheme, setTheme, WEB_THEMES, type WebTheme } from './theme'

const buttonClass =
  'rounded border border-plm-border-light px-3 py-1 text-sm text-plm-fg hover:bg-plm-bg-lighter disabled:cursor-not-allowed disabled:opacity-50'
const inputClass =
  'rounded border border-plm-border-light bg-plm-input px-2 py-1 text-sm text-plm-fg focus:border-plm-accent focus:outline-none'

export function AccountSection({ segments }: SectionProps) {
  const t = useT()
  if (segments.length > 0) return <NotFound />
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t('account.title')} />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex max-w-2xl flex-col gap-6 px-4 py-4">
          <ProfileCard />
          <PreferencesCard />
          <SessionCard />
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-plm-fg">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="text-xs text-plm-fg-muted sm:w-32 sm:shrink-0 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-plm-fg">{children}</dd>
    </div>
  )
}

function ProfileCard() {
  const t = useT()
  const auth = useReadyAuth()
  const { profile, organization, teams, isAdmin } = auth
  // The saved name is shown from local state so a save does not reload the whole signed-in app.
  const [savedName, setSavedName] = useState(profile.full_name ?? '')
  const [name, setName] = useState(profile.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const role = ['admin', 'engineer', 'viewer'].includes(profile.role) ? t(`account.roles.${profile.role}`) : profile.role

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const problem = checkDisplayName(name)
    if (problem) {
      setMessage({ tone: 'error', text: t(`account.profile.${problem}`) })
      return
    }
    setSaving(true)
    setMessage(null)
    const { error } = await updateDisplayName(profile.id, name)
    setSaving(false)
    if (error) {
      setMessage({
        tone: 'error',
        text: error === 'refused' ? t('account.profile.refused') : t('account.profile.failed', { message: error }),
      })
      return
    }
    const normalized = normalizeDisplayName(name)
    setSavedName(normalized)
    setName(normalized)
    setMessage({ tone: 'success', text: t('account.profile.saved') })
  }

  return (
    <Card title={t('account.profile.heading')}>
      <dl className="flex flex-col gap-2">
        <Field label={t('account.profile.email')}>{profile.email}</Field>
        <Field label={t('account.profile.organization')}>{organization.name}</Field>
        <Field label={t('account.profile.role')}>
          {role}
          {isAdmin && <span className="ml-2 text-xs text-plm-warning">{t('account.profile.administrator')}</span>}
        </Field>
        <Field label={t('account.profile.teams')}>
          {teams.length === 0 ? t('account.profile.noTeams') : teams.map((team) => team.name).join(', ')}
        </Field>
      </dl>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs text-plm-fg-dim">
          {t('account.profile.displayName')}
          <input
            value={name}
            autoComplete="name"
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={saving || normalizeDisplayName(name) === savedName}
          className="rounded bg-plm-accent px-3 py-1 text-sm text-white hover:bg-plm-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? t('account.profile.saving') : t('account.profile.save')}
        </button>
      </form>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-xs ${message.tone === 'error' ? 'text-plm-error' : 'text-plm-success'}`}>
          {message.text}
        </p>
      )}
    </Card>
  )
}

function PreferencesCard() {
  const t = useT()
  const [theme, setThemeState] = useState<WebTheme>(getSavedTheme)
  const language = getLanguage()

  return (
    <Card title={t('account.preferences.heading')}>
      <label className="flex flex-col gap-1 text-xs text-plm-fg-dim sm:w-64">
        {t('account.preferences.language')}
        <select
          value={language}
          onChange={(event) => {
            const next = WEB_LANGUAGES.find((value) => value === event.target.value)
            if (next) setLanguage(next)
          }}
          className={inputClass}
        >
          {WEB_LANGUAGES.map((value: WebLanguage) => (
            <option key={value} value={value}>
              {t(`account.languageNames.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs text-plm-fg-dim">{t('account.preferences.theme')}</legend>
        <div className="flex gap-2">
          {WEB_THEMES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => {
                setTheme(value)
                setThemeState(value)
              }}
              className={
                theme === value
                  ? 'rounded bg-plm-accent px-3 py-1 text-sm text-white'
                  : buttonClass
              }
            >
              {t(`account.preferences.${value}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-plm-fg-muted">{t('account.preferences.savedInBrowser')}</p>
    </Card>
  )
}

function SessionCard() {
  const t = useT()
  const auth = useReadyAuth()
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (work: () => Promise<{ error: string | null } | void>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await work()
      if (result?.error) setError(result.error)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t('account.session.heading')}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} className={buttonClass} onClick={() => void run(auth.signOut)}>
          {t('account.session.signOut')}
        </button>
        {!asking ? (
          <button type="button" disabled={busy} className={buttonClass} onClick={() => setAsking(true)}>
            {t('account.session.signOutAll')}
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-plm-fg-dim">{t('account.session.signOutAllConfirm')}</span>
            <button
              type="button"
              disabled={busy}
              className="rounded border border-plm-error px-3 py-1 text-sm text-plm-error hover:bg-plm-bg-lighter"
              onClick={() => {
                setAsking(false)
                void run(signOutEverywhere)
              }}
            >
              {t('account.session.confirm')}
            </button>
            <button type="button" className={buttonClass} onClick={() => setAsking(false)}>
              {t('common.cancel')}
            </button>
          </span>
        )}
      </div>
      <p className="text-xs text-plm-fg-muted">{t('account.session.signOutAllHelp')}</p>
      {error && (
        <p role="alert" className="text-xs text-plm-error">
          {t('account.session.failed', { message: error })}
        </p>
      )}
    </Card>
  )
}
