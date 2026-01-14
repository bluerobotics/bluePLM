import { useState } from 'react'
import { Activity, Key, FolderOpen, Settings } from 'lucide-react'
import { ServiceTab, LicensesTab, TemplatesTab, SettingsTab } from './tabs'

type TabId = 'service' | 'licenses' | 'templates' | 'settings'

interface Tab {
  id: TabId
  label: string
  icon: typeof Activity
}

const tabs: Tab[] = [
  { id: 'service', label: 'Service', icon: Activity },
  { id: 'licenses', label: 'Licenses', icon: Key },
  { id: 'templates', label: 'Templates', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings }
]

export function SolidWorksSettings() {
  const [activeTab, setActiveTab] = useState<TabId>('service')

  const renderTabContent = () => {
    switch (activeTab) {
      case 'service':
        return <ServiceTab />
      case 'licenses':
        return <LicensesTab />
      case 'templates':
        return <TemplatesTab />
      case 'settings':
        return <SettingsTab />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-plm-border">
        <nav className="flex gap-1" aria-label="SolidWorks Settings Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-plm-accent text-plm-accent'
                    : 'border-transparent text-plm-fg-muted hover:text-plm-fg hover:border-plm-fg-dim'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {renderTabContent()}
      </div>
    </div>
  )
}
