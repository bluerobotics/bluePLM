import { lazy, Suspense, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import type { SettingsTab } from '@/types/settings'
import { usePDMStore } from '@/stores/pdmStore'
import { SettingsSearchResults } from './SettingsSearchResults'
import { findSettingElement, flashSettingElement } from '../revealSetting'
import { findSettingsItem, isDesktopOnlySettingsTab } from '../settingsCatalog'
import { hasDesktop } from '@/lib/platform'

// Lazy loaded settings panels - only loaded when the tab is selected
// This saves memory by not loading all settings components upfront
const OrgExtensionsPanel = lazy(() =>
  import('@/features/nativeExtensions/OrgExtensionsPanel').then((m) => ({ default: m.OrgExtensionsPanel })),
)
const ProfileSettings = lazy(() =>
  import('../account/ProfileSettings').then((m) => ({ default: m.ProfileSettings })),
)
const AppearanceSettings = lazy(() =>
  import('../account/AppearanceSettings').then((m) => ({ default: m.AppearanceSettings })),
)
const SessionsSettings = lazy(() =>
  import('../account/SessionsSettings').then((m) => ({ default: m.SessionsSettings })),
)
const PreferencesSettings = lazy(() =>
  import('../account/PreferencesSettings').then((m) => ({ default: m.PreferencesSettings })),
)
const KeybindingsSettings = lazy(() =>
  import('../account/KeybindingsSettings').then((m) => ({ default: m.KeybindingsSettings })),
)
const ModulesSettings = lazy(() =>
  import('../organization/ModulesSettings').then((m) => ({ default: m.ModulesSettings })),
)
const VaultsSettings = lazy(() =>
  import('../organization/VaultsSettings').then((m) => ({ default: m.VaultsSettings })),
)
const TeamMembersSettings = lazy(() =>
  import('../organization/TeamMembersSettings').then((m) => ({ default: m.TeamMembersSettings })),
)
const ModuleAccessSettings = lazy(() =>
  import('../organization/ModuleAccessSettings').then((m) => ({ default: m.ModuleAccessSettings })),
)
const CompanyProfileSettings = lazy(() =>
  import('../organization/CompanyProfileSettings').then((m) => ({
    default: m.CompanyProfileSettings,
  })),
)
const AuthProvidersSettings = lazy(() =>
  import('../organization/AuthProvidersSettings').then((m) => ({
    default: m.AuthProvidersSettings,
  })),
)
const SerializationSettings = lazy(() =>
  import('../system/SerializationSettings').then((m) => ({ default: m.SerializationSettings })),
)
const ExportSettings = lazy(() =>
  import('../system/ExportSettings').then((m) => ({ default: m.ExportSettings })),
)
const RFQSettings = lazy(() =>
  import('../system/RFQSettings').then((m) => ({ default: m.RFQSettings })),
)
const FileWorkflowsSettings = lazy(() =>
  import('../organization/FileWorkflowsSettings').then((m) => ({
    default: m.FileWorkflowsSettings,
  })),
)
const SecurityMonitoringSettings = lazy(() =>
  import('../organization/SecurityMonitoringSettings').then((m) => ({
    default: m.SecurityMonitoringSettings,
  })),
)
const MetadataColumnsSettings = lazy(() =>
  import('../organization/MetadataColumnsSettings').then((m) => ({
    default: m.MetadataColumnsSettings,
  })),
)
const ItemDesignationsSettings = lazy(() =>
  import('../organization/ItemDesignationsSettings').then((m) => ({
    default: m.ItemDesignationsSettings,
  })),
)
const BackupSettings = lazy(() =>
  import('../system/BackupSettings').then((m) => ({ default: m.BackupSettings })),
)
const SolidWorksSettings = lazy(() =>
  import('../integrations/solidworks').then((m) => ({ default: m.SolidWorksSettings })),
)
const GoogleDriveSettings = lazy(() =>
  import('../integrations/google-drive').then((m) => ({ default: m.GoogleDriveSettings })),
)
const OdooSettings = lazy(() =>
  import('../integrations/odoo').then((m) => ({ default: m.OdooSettings })),
)
const WebhooksSettings = lazy(() =>
  import('../integrations/WebhooksSettings').then((m) => ({ default: m.WebhooksSettings })),
)
const ApiSettings = lazy(() =>
  import('../integrations/ApiSettings').then((m) => ({ default: m.ApiSettings })),
)
const PerformanceSettings = lazy(() =>
  import('../system/PerformanceSettings').then((m) => ({ default: m.PerformanceSettings })),
)
const LogsSettings = lazy(() =>
  import('../system/LogsSettings').then((m) => ({ default: m.LogsSettings })),
)
const DevToolsSettings = lazy(() =>
  import('../system/DevToolsSettings').then((m) => ({ default: m.DevToolsSettings })),
)
const AboutSettings = lazy(() =>
  import('../system/AboutSettings').then((m) => ({ default: m.AboutSettings })),
)
const SupabaseSettings = lazy(() =>
  import('../system/SupabaseSettings').then((m) => ({ default: m.SupabaseSettings })),
)
const RecoveryCodeSettings = lazy(() =>
  import('../system/RecoveryCodeSettings').then((m) => ({ default: m.RecoveryCodeSettings })),
)
const DeleteAccountSettings = lazy(() =>
  import('../account/DeleteAccountSettings').then((m) => ({ default: m.DeleteAccountSettings })),
)
interface SettingsContentProps {
  activeTab: SettingsTab
}

// Loading fallback for lazy-loaded settings panels
function SettingsLoading() {
  return (
    <div className="flex items-center justify-center h-32 text-plm-fg-muted">
      <Loader2 size={20} className="animate-spin" />
    </div>
  )
}

/** How long to wait for a lazy panel (and the data it loads) to render the setting asked for. */
const REVEAL_TIMEOUT_MS = 4000
const REVEAL_POLL_MS = 100

/**
 * When a search result opened this tab, wait for the panel to render the setting, then scroll
 * to it and flash it. Gives up quietly if the panel never shows that label.
 */
function useRevealSearchedSetting(activeTab: SettingsTab) {
  const containerRef = useRef<HTMLDivElement>(null)
  const focusTarget = usePDMStore((s) => s.settingsFocusTarget)
  const clearFocusTarget = usePDMStore((s) => s.clearSettingsFocusTarget)

  useEffect(() => {
    if (!focusTarget || focusTarget.tab !== activeTab) return
    const startedAt = performance.now()
    let timer = 0
    const tick = () => {
      const root = containerRef.current
      const el = root ? findSettingElement(root, focusTarget.label) : null
      if (root && el) {
        flashSettingElement(el, root)
        clearFocusTarget()
        return
      }
      if (performance.now() - startedAt > REVEAL_TIMEOUT_MS) {
        clearFocusTarget()
        return
      }
      timer = window.setTimeout(tick, REVEAL_POLL_MS)
    }
    timer = window.setTimeout(tick, 0)
    return () => window.clearTimeout(timer)
  }, [focusTarget, activeTab, clearFocusTarget])

  return containerRef
}

export function SettingsContent({ activeTab }: SettingsContentProps) {
  const searchQuery = usePDMStore((s) => s.settingsSearchQuery)
  const containerRef = useRevealSearchedSetting(activeTab)

  // Each page opens at its top, not at the previous page's scroll position.
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 })
  }, [activeTab, containerRef])

  const renderContent = () => {
    // A desktop-only tab (persisted or deep-linked) never renders on the web.
    if (!hasDesktop() && isDesktopOnlySettingsTab(activeTab)) return <ProfileSettings />
    switch (activeTab) {
      case 'profile':
        return <ProfileSettings />
      case 'appearance':
        return <AppearanceSettings />
      case 'preferences':
        return <PreferencesSettings />
      case 'sessions':
        return <SessionsSettings />
      case 'keybindings':
        return <KeybindingsSettings />
      case 'modules':
        return <ModulesSettings />
      case 'vaults':
        return <VaultsSettings />
      case 'team-members':
        return <TeamMembersSettings />
      case 'module-access':
        return <ModuleAccessSettings />
      case 'company-profile':
        return <CompanyProfileSettings />
      case 'auth-providers':
        return <AuthProvidersSettings />
      case 'serialization':
        return <SerializationSettings />
      case 'export':
        return <ExportSettings />
      case 'rfq':
        return <RFQSettings />
      case 'metadata-columns':
        return <MetadataColumnsSettings />
      case 'file-workflows':
        return <FileWorkflowsSettings />
      case 'security-monitoring':
        return <SecurityMonitoringSettings />
      case 'item-designations':
        return <ItemDesignationsSettings />
      case 'backup':
        return <BackupSettings />
      case 'solidworks':
        return <SolidWorksSettings />
      case 'google-drive':
        return <GoogleDriveSettings />
      case 'odoo':
        return <OdooSettings />
      case 'webhooks':
        return <WebhooksSettings />
      case 'api':
        return <ApiSettings />
      case 'supabase':
        return <SupabaseSettings />
      case 'recovery-codes':
        return <RecoveryCodeSettings />
      case 'performance':
        return <PerformanceSettings />
      case 'logs':
        return <LogsSettings />
      case 'dev-tools':
        return <DevToolsSettings />
      case 'about':
        return <AboutSettings />
      case 'delete-account':
        return <DeleteAccountSettings />
      case 'extensions':
        return <OrgExtensionsPanel />
      default:
        return <ProfileSettings />
    }
  }

  if (searchQuery.trim()) {
    return <SettingsSearchResults />
  }

  const item = findSettingsItem(activeTab)
  const layout = item?.layout ?? 'default'
  const header = item && (
    <header className="mb-7 flex-shrink-0">
      <h1 className="text-[20px] font-semibold tracking-tight text-plm-fg">{item.label}</h1>
      <p className="mt-1 text-[13px] text-plm-fg-muted">{item.description}</p>
    </header>
  )

  // A full page (the log viewer) fills the height and scrolls itself.
  if (layout === 'full') {
    return (
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col px-8 pb-6 pt-7">
        {header}
        <div className="min-h-0 flex-1">
          <Suspense fallback={<SettingsLoading />}>{renderContent()}</Suspense>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto px-8 pb-16 pt-7 ${layout === 'wide' ? 'max-w-none' : 'max-w-[860px]'}`}>
        {header}
        <Suspense fallback={<SettingsLoading />}>{renderContent()}</Suspense>
      </div>
    </div>
  )
}
