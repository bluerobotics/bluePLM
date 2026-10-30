import { useState } from 'react'
import { signInWithGoogle } from '@/lib/supabase/auth'
import { useT } from '@web/i18n'

// Google only. Every member signs in with Google and none has a password, sign-up is closed, and
// the web has no way to set one, so an email form would only be a password-guessing target.
export function LoginPage() {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const google = async () => {
    setBusy(true)
    setError(null)
    const { error: oauthError } = await signInWithGoogle()
    // On success the browser is already leaving for Google; only a failure comes back here.
    setBusy(false)
    if (oauthError) setError(t('common.errorWithMessage', { message: oauthError.message }))
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 p-4">
      <h1 className="flex items-center gap-3 text-2xl font-semibold text-plm-fg">
        <img src="/icon.svg" alt="" width={36} height={36} />
        BluePLM
      </h1>
      <div className="w-full max-w-xs">
        <button
          type="button"
          onClick={google}
          disabled={busy}
          className="w-full rounded border border-plm-border-light bg-plm-bg-light px-3 py-2 text-sm text-plm-fg hover:bg-plm-bg-lighter disabled:opacity-60"
        >
          {t('auth.signInWithGoogle')}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-center text-sm text-plm-error">
            {error}
          </p>
        )}
      </div>
      <a
        href="https://github.com/bluerobotics/bluePLM"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-plm-fg-muted hover:text-plm-fg hover:underline"
      >
        GitHub
      </a>
    </div>
  )
}
