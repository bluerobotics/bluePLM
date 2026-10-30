import { Database } from 'lucide-react'
import { useT } from '@web/i18n'
import { href, Link } from '@web/lib/router'
import { EmptyState, ErrorState, Loading, PageHeader } from '@web/shell/ui'
import { useVaults } from './components'

export function VaultList() {
  const t = useT()
  const vaults = useVaults()

  return (
    <div>
      <PageHeader title={t('files.vaults.title')} />
      {vaults.status === 'loading' && <Loading />}
      {vaults.status === 'error' && <ErrorState message={vaults.error} onRetry={vaults.reload} />}
      {vaults.status === 'ready' && vaults.data.length === 0 && <EmptyState>{t('files.vaults.empty')}</EmptyState>}
      {vaults.status === 'ready' && vaults.data.length > 0 && (
        <ul className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {vaults.data.map((vault) => (
            <li key={vault.id}>
              <Link
                to={href(['files', vault.id])}
                aria-label={t('files.vaults.open', { name: vault.name })}
                className="flex h-full items-start gap-3 rounded border border-plm-border p-3 hover:bg-plm-bg-lighter"
              >
                <Database size={18} className="mt-0.5 shrink-0 text-plm-accent" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-plm-fg">{vault.name}</span>
                    {vault.is_default && (
                      <span className="shrink-0 rounded bg-plm-bg-lighter px-1.5 text-xs text-plm-fg-muted">
                        {t('files.vaults.default')}
                      </span>
                    )}
                  </span>
                  {vault.description && (
                    <span className="mt-1 block text-sm text-plm-fg-muted">{vault.description}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
