import {
  AccountSettings,
  OrganizationSettings,
  CompanyProfileSettings,
  RFQSettings,
  MetadataColumnsSettings,
  BackupSettings,
  SolidWorksSettings,
  GoogleDriveSettings,
  OdooSettings,
  SlackSettings,
  WebhooksSettings,
  ApiSettings,
  LogsSettings,
  AboutSettings
} from './settings'

type SettingsTab = 'account' | 'organization' | 'company-profile' | 'rfq' | 'metadata-columns' | 'backup' | 'solidworks' | 'google-drive' | 'odoo' | 'slack' | 'webhooks' | 'api' | 'logs' | 'about'

interface SettingsContentProps {
  activeTab: SettingsTab
}

export function SettingsContent({ activeTab }: SettingsContentProps) {
  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return <AccountSettings />
      case 'organization':
        return <OrganizationSettings />
      case 'company-profile':
        return <CompanyProfileSettings />
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
      case 'webhooks':
        return <WebhooksSettings />
      case 'api':
        return <ApiSettings />
      case 'logs':
        return <LogsSettings />
      case 'about':
        return <AboutSettings />
      default:
        return <AccountSettings />
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-plm-bg">
      <div className="max-w-4xl mx-auto p-6">
        {renderContent()}
      </div>
    </div>
  )
}
