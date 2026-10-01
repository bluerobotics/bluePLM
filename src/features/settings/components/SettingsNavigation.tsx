import { usePDMStore } from '@/stores/pdmStore'
import type { IntegrationStatusValue, IntegrationId, BackupStatusValue } from '@/stores/types'
import type { SettingsTab } from '@/types/settings'
import { t } from '@/lib/i18n'
import { logSettings } from '@/lib/userActionLogger'
import { isMdbBackendActive } from '@/lib/backendAdapter'

interface SettingsNavigationProps {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

interface SettingsNavigationItem {
  id: SettingsTab
  label: string
  /** Hidden from the navigation for everyone but an admin. The panel gates itself as well. */
  adminOnly?: boolean
}

interface SettingsSection {
  category: string
  items: SettingsNavigationItem[]
}

// A function rather than a constant because the labels are translated at render time, and the
// language can change without the module being re-evaluated.
const settingsSections = (): SettingsSection[] => [
  {
    category: t('settings.account'),
    items: [
      { id: 'profile', label: t('settings.profile') },
      { id: 'preferences', label: t('settings.preferences') },
      { id: 'keybindings', label: t('settings.keybindings') },
      { id: 'modules', label: t('settings.sidebar') },
      { id: 'delete-account', label: t('settings.deleteAccount') },
    ],
  },
  {
    category: t('settings.organization'),
    items: [
      { id: 'supabase', label: t('settings.supabase') },
      { id: 'backup', label: t('settings.backups') },
      { id: 'vaults', label: t('settings.vaults') },
      { id: 'vault-audit', label: t('vaultAudit.title'), adminOnly: true },
      { id: 'team-members', label: t('settings.membersAndTeams') },
      { id: 'module-access', label: t('settings.moduleAccess') },
      { id: 'company-profile', label: t('settings.companyProfile') },
      { id: 'auth-providers', label: t('settings.signInMethods') },
      { id: 'serialization', label: t('settings.serialization') },
      { id: 'export', label: t('settings.exportOptions') },
      { id: 'metadata-columns', label: t('settings.fileMetadata') },
      { id: 'item-designations', label: t('settings.itemDesignations') },
      { id: 'rfq', label: t('settings.rfqSettings') },
      { id: 'recovery-codes', label: t('settings.recoveryCodes') },
    ],
  },
  {
    category: t('settings.extensions'),
    items: [
      { id: 'extension-store', label: t('settings.extensionStore') },
      { id: 'solidworks', label: t('settings.solidworks') },
      { id: 'google-drive', label: t('settings.googleDrive') },
      { id: 'odoo', label: t('settings.odooErp') },
      { id: 'api', label: t('settings.restApi') },
      { id: 'webhooks', label: t('settings.webhooks') },
    ],
  },
  {
    category: t('settings.system'),
    items: [
      { id: 'performance', label: t('settings.performance') },
      { id: 'logs', label: t('settings.logs') },
      { id: 'dev-tools', label: t('settings.devTools') },
      { id: 'about', label: t('settings.about') },
    ],
  },
]

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
    online: t('settings.connected'),
    partial: t('settings.partiallyConnected'),
    offline: t('settings.offline'),
    'not-configured': t('settings.notConfigured'),
    'coming-soon': t('settings.comingSoon'),
    checking: t('settings.checkingStatus'),
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
    online: t('settings.backupsWorking'),
    partial: t('settings.needsAttention'),
    offline: t('settings.backupFailed'),
    'not-configured': t('settings.notConfigured'),
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
  const isMdb = isMdbBackendActive()

  const sections = settingsSections().map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => (!item.adminOnly || isAdmin) && !(isMdb && item.id === 'supabase'),
    ),
  }))

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
      {/* Scrollable navigation */}
      <nav
        className="flex-1 overflow-y-auto hide-scrollbar"
        role="menu"
        aria-label={t('settings.navigation')}
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
                        onTabChange(item.id)
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1 rounded-lg text-[13px] font-sans transition-colors outline-none focus-visible:ring-1 focus-visible:ring-plm-accent ${
                        activeTab === item.id
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
