// Administration: users, invites, teams and vault access for the signed-in admin's organization.
// The App shows Forbidden to non-admins; every write here is still decided by RLS / RPCs.
import type { SectionProps } from '@web/shell/ui'
import { ErrorState, Loading, NotFound, PageHeader } from '@web/shell/ui'
import { Link } from '@web/lib/router'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { useT } from '@web/i18n'
import { ADMIN_TABS, parseAdminTab } from './adminLogic'
import { useAdminData } from './useAdminData'
import { UsersTab } from './UsersTab'
import { InvitesTab } from './InvitesTab'
import { TeamsTab } from './TeamsTab'
import { VaultAccessTab } from './VaultAccessTab'

export function AdminSection({ segments }: SectionProps) {
  const t = useT()
  const auth = useReadyAuth()
  const tab = parseAdminTab(segments[0])
  const { data, error, reload } = useAdminData(auth.profile.org_id)

  if (!tab || segments.length > 1) return <NotFound />

  const context = { orgId: auth.profile.org_id, currentUserId: auth.profile.id, reload }

  let body
  if (error && !data) body = <ErrorState message={error} onRetry={reload} />
  else if (!data) body = <Loading />
  else if (tab === 'users') body = <UsersTab data={data} {...context} />
  else if (tab === 'invites') body = <InvitesTab data={data} {...context} />
  else if (tab === 'teams') body = <TeamsTab data={data} {...context} />
  else body = <VaultAccessTab data={data} {...context} />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t('admin.title')}>
        <nav className="mt-2 flex flex-wrap gap-1" aria-label={t('admin.title')}>
          {ADMIN_TABS.map((id) => (
            <Link
              key={id}
              to={id === 'users' ? '/admin' : `/admin/${id}`}
              aria-current={tab === id ? 'page' : undefined}
              className={`rounded px-3 py-1 text-sm ${
                tab === id ? 'bg-plm-selection text-plm-fg' : 'text-plm-fg-dim hover:bg-plm-bg-lighter hover:text-plm-fg'
              }`}
            >
              {t(`admin.tabs.${id}`)}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
    </div>
  )
}

