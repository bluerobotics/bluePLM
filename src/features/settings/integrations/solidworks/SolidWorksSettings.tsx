import { lazy, Suspense, useState } from 'react'
import { Activity, FolderOpen, Key, Loader2, ScanSearch, Settings } from 'lucide-react'

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
  icon: typeof Activity
  /** Only shown to administrators. The panel itself re-checks the role. */
  adminOnly?: boolean
}

const tabs = (): Tab[] => [
  { id: 'service', label: 'Service', icon: Activity },
  { id: 'licenses', label: 'Licenses', icon: Key },
  { id: 'templates', label: 'Templates', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'metadata-audit', label: t('vaultAudit.tabLabel'), icon: ScanSearch, adminOnly: true },
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
  const width = currentTab === 'metadata-audit' ? '' : 'max-w-6xl mx-auto'

  return (
    <div className={`space-y-6 ${width}`}>
      {/* Tab Navigation */}
      <nav
        className="flex gap-5 border-b border-ui-divider"
        role="tablist"
        aria-label="SolidWorks Settings Tabs"
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = currentTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-[14px] font-medium transition-colors outline-none focus-visible:text-ui-fg ${
                isActive
                  ? 'border-ui-accent text-ui-fg'
                  : 'border-transparent text-ui-fg-secondary hover:text-ui-fg'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-ui-accent' : ''} />
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
