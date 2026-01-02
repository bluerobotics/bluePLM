import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import type { SettingsTab } from '../types/settings'

// Lazy loaded settings panels - only loaded when the tab is selected
// This saves memory by not loading all settings components upfront
const ProfileSettings = lazy(() => import('./settings/ProfileSettings').then(m => ({ default: m.ProfileSettings })))
const PreferencesSettings = lazy(() => import('./settings/PreferencesSettings').then(m => ({ default: m.PreferencesSettings })))
const KeybindingsSettings = lazy(() => import('./settings/KeybindingsSettings').then(m => ({ default: m.KeybindingsSettings })))
const ModulesSettings = lazy(() => import('./settings/ModulesSettings').then(m => ({ default: m.ModulesSettings })))
const VaultsSettings = lazy(() => import('./settings/VaultsSettings').then(m => ({ default: m.VaultsSettings })))
const TeamMembersSettings = lazy(() => import('./settings/TeamMembersSettings').then(m => ({ default: m.TeamMembersSettings })))
const CompanyProfileSettings = lazy(() => import('./settings/CompanyProfileSettings').then(m => ({ default: m.CompanyProfileSettings })))
const AuthProvidersSettings = lazy(() => import('./settings/AuthProvidersSettings').then(m => ({ default: m.AuthProvidersSettings })))
const SerializationSettings = lazy(() => import('./settings/SerializationSettings').then(m => ({ default: m.SerializationSettings })))
const ExportSettings = lazy(() => import('./settings/ExportSettings').then(m => ({ default: m.ExportSettings })))
const RFQSettings = lazy(() => import('./settings/RFQSettings').then(m => ({ default: m.RFQSettings })))
const MetadataColumnsSettings = lazy(() => import('./settings/MetadataColumnsSettings').then(m => ({ default: m.MetadataColumnsSettings })))
const BackupSettings = lazy(() => import('./settings/BackupSettings').then(m => ({ default: m.BackupSettings })))
const SolidWorksSettings = lazy(() => import('./settings/SolidWorksSettings').then(m => ({ default: m.SolidWorksSettings })))
const GoogleDriveSettings = lazy(() => import('./settings/GoogleDriveSettings').then(m => ({ default: m.GoogleDriveSettings })))
const OdooSettings = lazy(() => import('./settings/OdooSettings').then(m => ({ default: m.OdooSettings })))
const SlackSettings = lazy(() => import('./settings/SlackSettings').then(m => ({ default: m.SlackSettings })))
const WooCommerceSettings = lazy(() => import('./settings/WooCommerceSettings').then(m => ({ default: m.WooCommerceSettings })))
const WebhooksSettings = lazy(() => import('./settings/WebhooksSettings').then(m => ({ default: m.WebhooksSettings })))
const ApiSettings = lazy(() => import('./settings/ApiSettings').then(m => ({ default: m.ApiSettings })))
const PerformanceSettings = lazy(() => import('./settings/PerformanceSettings').then(m => ({ default: m.PerformanceSettings })))
const LogsSettings = lazy(() => import('./settings/LogsSettings').then(m => ({ default: m.LogsSettings })))
const DevToolsSettings = lazy(() => import('./settings/DevToolsSettings').then(m => ({ default: m.DevToolsSettings })))
const AboutSettings = lazy(() => import('./settings/AboutSettings').then(m => ({ default: m.AboutSettings })))
const SupabaseSettings = lazy(() => import('./settings/SupabaseSettings').then(m => ({ default: m.SupabaseSettings })))
const RecoveryCodeSettings = lazy(() => import('./settings/RecoveryCodeSettings').then(m => ({ default: m.RecoveryCodeSettings })))
const DeleteAccountSettings = lazy(() => import('./settings/DeleteAccountSettings').then(m => ({ default: m.DeleteAccountSettings })))

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

export function SettingsContent({ activeTab }: SettingsContentProps) {
  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileSettings />
      case 'preferences':
        return <PreferencesSettings />
      case 'keybindings':
        return <KeybindingsSettings />
      case 'modules':
        return <ModulesSettings />
      case 'vaults':
        return <VaultsSettings />
      case 'team-members':
        return <TeamMembersSettings />
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
      case 'backup':
        return <BackupSettings />
      case 'solidworks':
        return <SolidWorksSettings />
      case 'google-drive':
        return <GoogleDriveSettings />
      case 'odoo':
        return <OdooSettings />
      case 'slack':
        return <SlackSettings />
      case 'woocommerce':
        return <WooCommerceSettings />
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
      default:
        return <ProfileSettings />
    }
  }

  // Logs view needs full width for the log viewer
  if (activeTab === 'logs') {
    return (
      <div className="flex-1 overflow-hidden bg-plm-bg p-4">
        <Suspense fallback={<SettingsLoading />}>
          {renderContent()}
        </Suspense>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-plm-bg">
      <div className="max-w-4xl mx-auto p-6">
        <Suspense fallback={<SettingsLoading />}>
          {renderContent()}
        </Suspense>
      </div>
    </div>
  )
}
