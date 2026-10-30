import { useEffect } from 'react'
import { AuthProvider, useAuth } from '@web/auth/AuthProvider'
import { LoginPage } from '@web/auth/LoginPage'
import { Layout, type Section } from '@web/shell/Layout'
import { ErrorState, Forbidden, Loading, NotFound } from '@web/shell/ui'
import { navigate, useRoute } from '@web/lib/router'
import { useT } from '@web/i18n'
import { FilesSection } from '@web/features/files/FilesSection'
import { ReviewsSection } from '@web/features/reviews/ReviewsSection'
import { ChangeControlSection } from '@web/features/changeControl/ChangeControlSection'
import { AdminSection } from '@web/features/admin/AdminSection'
import { AccountSection } from '@web/features/account/AccountSection'

// First path segment → section. `/file/<id>` is the file detail page, part of Files.
const SECTIONS: Record<string, Section> = {
  files: 'files',
  file: 'files',
  reviews: 'reviews',
  eco: 'changeControl',
  admin: 'admin',
  account: 'account',
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

function Gate() {
  const t = useT()
  const auth = useAuth()

  if (auth.status === 'loading') return <Loading />
  if (auth.status === 'signedOut') return <LoginPage />
  if (auth.status === 'error') return <ErrorState message={auth.error ?? t('auth.profileFailed')} onRetry={auth.reload} />
  if (auth.status === 'noOrganization') {
    return (
      <div className="mx-auto max-w-md p-6 text-sm">
        <p className="text-plm-fg">{t('auth.noProfile')}</p>
        <button
          type="button"
          onClick={() => void auth.signOut()}
          className="mt-4 rounded border border-plm-border-light px-3 py-1 text-plm-fg hover:bg-plm-bg-lighter"
        >
          {t('auth.signOut')}
        </button>
      </div>
    )
  }
  return <SignedInApp />
}

function SignedInApp() {
  const auth = useAuth()
  const route = useRoute()
  const [first, ...rest] = route.segments

  useEffect(() => {
    if (!first) navigate('/files', { replace: true })
  }, [first])

  const section = first ? (SECTIONS[first] ?? null) : 'files'
  const props = { segments: first === 'file' ? route.segments : rest, query: route.query }

  let content
  switch (section) {
    case 'files':
      content = <FilesSection {...props} />
      break
    case 'reviews':
      content = <ReviewsSection {...props} />
      break
    case 'changeControl':
      content = <ChangeControlSection {...props} />
      break
    case 'admin':
      content = auth.isAdmin ? <AdminSection {...props} /> : <Forbidden />
      break
    case 'account':
      content = <AccountSection {...props} />
      break
    default:
      content = <NotFound />
  }

  return <Layout section={section}>{content}</Layout>
}
