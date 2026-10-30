import { useState, type FormEvent } from 'react'
import { signInWithEmail, signInWithGoogle } from '@/lib/supabase/auth'
import { useT } from '@web/i18n'

export function LoginPage() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: signInError } = await signInWithEmail(email.trim(), password)
    setBusy(false)
    // The provider's message can say whether an account exists; show one neutral message.
    if (signInError) setError(t('auth.invalidCredentials'))
  }

  const google = async () => {
    setError(null)
    const { error: oauthError } = await signInWithGoogle()
    if (oauthError) setError(t('common.errorWithMessage', { message: oauthError.message }))
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-plm-border bg-plm-bg-light p-6">
        <h1 className="text-lg font-semibold text-plm-fg">{t('auth.title')}</h1>
        <p className="mt-1 text-sm text-plm-fg-muted">{t('auth.subtitle')}</p>

        <button
          type="button"
          onClick={google}
          className="mt-5 w-full rounded border border-plm-border-light bg-plm-bg px-3 py-2 text-sm text-plm-fg hover:bg-plm-bg-lighter"
        >
          {t('auth.signInWithGoogle')}
        </button>

        <div className="my-4 flex items-center gap-2 text-xs text-plm-fg-muted">
          <div className="h-px flex-1 bg-plm-border" />
          {t('auth.or')}
          <div className="h-px flex-1 bg-plm-border" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-plm-fg-dim">{t('auth.email')}</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded border border-plm-border bg-plm-input px-2 py-1.5 text-plm-fg outline-none focus:border-plm-accent"
            />
          </label>
          <label className="block text-sm">
            <span className="text-plm-fg-dim">{t('auth.password')}</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded border border-plm-border bg-plm-input px-2 py-1.5 text-plm-fg outline-none focus:border-plm-accent"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-plm-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-plm-accent px-3 py-2 text-sm font-medium text-white hover:bg-plm-accent-hover disabled:opacity-60"
          >
            {busy ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        <p className="mt-5 text-xs text-plm-fg-muted">{t('auth.desktopOnlyHint')}</p>
      </div>
    </div>
  )
}
