import { usePDMStore } from '@/stores/pdmStore'
import type { IntegrationStatusValue, IntegrationId, BackupStatusValue } from '@/stores/types'
import type { SettingsTab } from '@/types/settings'
import { useTranslation } from '@/lib/i18n'
import { logSettings } from '@/lib/userActionLogger'
import { hasDesktop } from '@/lib/platform'

import { isSettingsTabAvailable, settingsSections } from '../settingsCatalog'
import { useSettingsSearch } from '../useSettingsSearch'
import { SettingsSearchBox } from './SettingsSearchBox'

interface SettingsNavigationProps {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

// Items that show a connection status dot
const integrationIds = ['supabase', 'solidworks', 'google-drive', 'odoo', 'webhooks', 'api'] as const

type DotStatus = IntegrationStatusValue | BackupStatusValue

const DOT_COLOR: Record<DotStatus, string> = {
  online: 'bg-plm-success',
  partial: 'bg-plm-warning',
  offline: 'bg-plm-error',
  'not-configured': '',
  'coming-soon': '',
  checking: 'bg-plm-accent animate-pulse',
}

const DOT_TITLE: Record<DotStatus, string> = {
  online: 'Connected',
  partial: 'Needs attention',
  offline: 'Offline',
  'not-configured': 'Not configured',
  'coming-soon': 'Coming soon',
  checking: 'Checking status...',
}

/** A status dot; nothing for a service that is not set up, so the list stays quiet. */
function StatusDot({ status }: { status: DotStatus }) {
  if (!DOT_COLOR[status]) return null
  return (
    <span
      className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT_COLOR[status]}`}
      title={DOT_TITLE[status]}
      aria-label={DOT_TITLE[status]}
    />
  )
}

export function SettingsNavigation({ activeTab, onTabChange }: SettingsNavigationProps) {
  const { t } = useTranslation()
  // Statuses come from the store; useIntegrationStatus in App.tsx keeps them current.
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

  const statusFor = (id: SettingsTab): DotStatus | null => {
    if (id === 'backup') return backupStatus
    if (!(integrationIds as readonly string[]).includes(id)) return null
    return integrations[id as IntegrationId]?.status || 'checking'
  }

  return (
    <div className="flex h-full flex-col">
      <SettingsSearchBox />

      <nav
        className="flex-1 overflow-y-auto px-2.5 pb-4 pt-1 hide-scrollbar"
        aria-label={t('settings.navigation')}
      >
        {sections.map((section) => (
          <div key={section.category} className="mt-4 first:mt-2">
            <div className="mb-1 px-2.5 text-[11px] font-medium tracking-wide text-plm-fg-muted">
              {section.category}
            </div>
            <ul>
              {section.items.map((item) => {
                const selected = activeTab === item.id && !query
                const status = statusFor(item.id)
                const Icon = item.icon
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => {
                        logSettings(`Changed settings tab to ${item.label}`, { tabId: item.id })
                        if (query) {
                          usePDMStore.getState().openSettingFromSearch(item.id, item.label)
                        } else {
                          onTabChange(item.id)
                        }
                      }}
                      className={`group flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-plm-accent/60 ${
                        selected
                          ? 'bg-plm-fg/[0.08] font-medium text-plm-fg'
                          : item.danger
                            ? 'text-plm-error/80 hover:bg-plm-error/10 hover:text-plm-error'
                            : 'text-plm-fg-dim hover:bg-plm-fg/[0.05] hover:text-plm-fg'
                      }`}
                    >
                      <Icon
                        size={15}
                        strokeWidth={1.75}
                        aria-hidden
                        className={`flex-shrink-0 ${
                          selected
                            ? 'text-plm-fg'
                            : item.danger
                              ? 'text-current'
                              : 'text-plm-fg-muted group-hover:text-plm-fg-dim'
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {status && <StatusDot status={status} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}
