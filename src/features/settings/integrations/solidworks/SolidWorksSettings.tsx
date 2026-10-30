import { lazy, Suspense, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { t } from '@/lib/i18n'
import { usePDMStore } from '@/stores/pdmStore'

import { ServiceTab, LicensesTab, TemplatesTab, SettingsTab } from './tabs'

// Lazy so the scan and repair code stays out of the main settings chunk.
const VaultAuditSettings = lazy(() =>
  import('../../system/vault-audit').then((m) => ({ default: m.VaultAuditSettings })),
)

type TabId = 'service' | 'licenses' | 'templates' | 'settings' | 'metadata-audit'

interface Tab {
  id: TabId
  label: string
  /** Only shown to administrators. The panel itself re-checks the role. */
  adminOnly?: boolean
}

const tabs = (): Tab[] => [
  { id: 'service', label: 'Service' },
  { id: 'licenses', label: 'Licenses' },
  { id: 'templates', label: 'Templates' },
  { id: 'settings', label: 'Settings' },
  { id: 'metadata-audit', label: t('vaultAudit.tabLabel'), adminOnly: true },
]

function TabLoading() {
  return (
    <div className="flex items-center justify-center h-32 text-ui-fg-secondary">
      <Loader2 size={20} className="animate-spin" />
    </div>
  )
}

export function SolidWorksSettings() {
  const [activeTab, setActiveTab] = useState<TabId>('service')
  const isAdmin = usePDMStore((s) => s.getEffectiveRole() === 'admin')

  const visibleTabs = tabs().filter((tab) => !tab.adminOnly || isAdmin)
  // A demoted admin must not be left on a tab that has just disappeared.
  const currentTab: TabId = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : 'service'

  const renderTabContent = () => {
    switch (currentTab) {
      case 'service':
        return <ServiceTab />
      case 'licenses':
        return <LicensesTab />
      case 'templates':
        return <TemplatesTab />
      case 'settings':
        return <SettingsTab />
      case 'metadata-audit':
        return (
          <Suspense fallback={<TabLoading />}>
            <VaultAuditSettings />
          </Suspense>
        )
      default:
        return null
    }
  }

  // The audit is a file list and uses the full width it is given; the forms read better narrow.
  const width = currentTab === 'metadata-audit' ? '' : 'max-w-3xl'

  return (
    <div className={`space-y-8 ${width}`}>
      {/* Tab navigation: a quiet underline bar, text only */}
      <nav
        className="flex gap-6 border-b border-ui-divider"
        role="tablist"
        aria-label="SolidWorks Settings Tabs"
      >
        {visibleTabs.map((tab) => {
          const isActive = currentTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b-2 pb-2.5 text-[14px] transition-colors outline-none focus-visible:text-ui-fg ${
                isActive
                  ? 'border-ui-fg font-medium text-ui-fg'
                  : 'border-transparent text-ui-fg-secondary hover:text-ui-fg'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      {/* Tab Content */}
      <div className="min-h-[400px]">{renderTabContent()}</div>
    </div>
  )
}
