import { usePDMStore } from '@/stores/pdmStore'
import type { IntegrationStatusValue, IntegrationId, BackupStatusValue } from '@/stores/types'
import type { SettingsTab } from '@/types/settings'
import { logSettings } from '@/lib/userActionLogger'
import { isSettingsTabAvailable, settingsSections } from '../settingsCatalog'
import { hasDesktop } from '@/lib/platform'
import { SettingsSearchBox } from './SettingsSearchBox'
import { useSettingsSearch } from '../useSettingsSearch'

interface SettingsNavigationProps {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

// Items that show status dots (integrations + Supabase which is now in Organization)
const integrationIds = [
  'supabase',
  'solidworks',
  'google-drive',
  'odoo',
  'webhooks',
  'api',
] as const

function StatusDot({ status }: { status: IntegrationStatusValue }) {
  const colors: Record<IntegrationStatusValue, string> = {
    online: 'bg-plm-success',
    partial: 'bg-yellow-500',
    offline: 'bg-plm-error',
    'not-configured': 'bg-plm-fg-muted/40',
    'coming-soon': 'bg-plm-fg-muted/40',
    checking: 'bg-plm-accent',
  }

  const titles: Record<IntegrationStatusValue, string> = {
    online: 'Connected',
    partial: 'Partially connected',
    offline: 'Offline',
    'not-configured': 'Not configured',
    'coming-soon': 'Coming soon',
    checking: 'Checking status...',
  }

  return (
    <span
      className={`w-2.5 h-2.5 rounded-full ${colors[status]} flex-shrink-0 ${status === 'checking' ? 'animate-pulse' : ''}`}
      title={titles[status]}
    />
  )
}

function BackupStatusDot({ status }: { status: BackupStatusValue }) {
  const colors: Record<BackupStatusValue, string> = {
    online: 'bg-plm-success',
    partial: 'bg-yellow-500',
    offline: 'bg-plm-error',
    'not-configured': 'bg-plm-fg-muted/40',
  }

  const titles: Record<BackupStatusValue, string> = {
    online: 'Backups working',
    partial: 'Needs attention',
    offline: 'Backup failed',
    'not-configured': 'Not configured',
  }

  return (
    <span
      className={`w-2.5 h-2.5 rounded-full ${colors[status]} flex-shrink-0`}
      title={titles[status]}
    />
  )
}

export function SettingsNavigation({ activeTab, onTabChange }: SettingsNavigationProps) {
  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION & BACKUP STATUSES - Consumed from centralized store slice
  // ═══════════════════════════════════════════════════════════════════════════

  // Subscribe to integration statuses from the store (no local state needed)
  // The useIntegrationStatus hook in App.tsx handles the status check orchestration
  const integrations = usePDMStore((s) => s.integrations)
  const backupStatus = usePDMStore((s) => s.backupStatus)
  const isAdmin = usePDMStore((s) => s.getEffectiveRole() === 'admin')

  const desktop = hasDesktop()
  const { query, groups } = useSettingsSearch()
  const matchedTabs = new Set(groups.map((g) => g.tab))

  // While searching, the navigation narrows to the tabs that have a match.
  const sections = settingsSections()
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          isSettingsTabAvailable(item, isAdmin, desktop) && (!query || matchedTabs.has(item.id)),
      ),
    }))
    .filter((section) => section.items.length > 0)

  const isIntegration = (id: SettingsTab): boolean => {
    return (integrationIds as readonly string[]).includes(id)
  }

  // Get integration status from store, with fallback for initial load
  const getIntegrationStatus = (id: SettingsTab): IntegrationStatusValue => {
    if (!isIntegration(id)) return 'not-configured'
    const integration = integrations[id as IntegrationId]
    return integration?.status || 'checking'
  }

  return (
    <div className="flex flex-col h-full bg-plm-sidebar">
      <SettingsSearchBox />

      {/* Scrollable navigation */}
      <nav
        className="flex-1 overflow-y-auto hide-scrollbar"
        role="menu"
        aria-label="Settings navigation"
      >
        <div className="flex flex-col py-1">
          {sections.map((section, sectionIndex) => (
            <div key={section.category}>
              {/* Section */}
              <div className="mt-4 mb-1 mx-3">
                {/* Category header - uppercase mono, faded */}
                <div className="px-3 mb-1">
                  <span className="text-[13px] font-mono uppercase text-plm-fg-muted/45">
                    {section.category}
                  </span>
                </div>

                {/* Menu items - tighter spacing */}
                <div>
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      role="menuitem"
                      onClick={() => {
                        logSettings(`Changed settings tab to ${item.label}`, { tabId: item.id })
                        if (query) {
                          usePDMStore.getState().openSettingFromSearch(item.id, item.label)
                        } else {
                          onTabChange(item.id)
                        }
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1 rounded-lg text-[13px] font-sans transition-colors outline-none focus-visible:ring-1 focus-visible:ring-plm-accent ${
                        activeTab === item.id && !query
                          ? 'bg-plm-highlight text-plm-fg font-semibold'
                          : 'text-plm-fg-dim hover:text-plm-fg'
                      }`}
                    >
                      <span>{item.label}</span>
                      {isIntegration(item.id) && (
                        <StatusDot status={getIntegrationStatus(item.id)} />
                      )}
                      {item.id === 'backup' && <BackupStatusDot status={backupStatus} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider between sections (except after last) */}
              {sectionIndex < sections.length - 1 && (
                <div className="h-px w-full bg-plm-border/50 mt-3" />
              )}
            </div>
          ))}
        </div>
      </nav>
    </div>
  )
}
