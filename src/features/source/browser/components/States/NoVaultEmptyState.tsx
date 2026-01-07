import { memo } from 'react'
import { Database, Settings } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'

/**
 * Empty state component shown when no vault is connected
 * Provides a link to vault settings to connect a vault
 */
export const NoVaultEmptyState = memo(function NoVaultEmptyState() {
  const { setActiveView, setSettingsTab } = usePDMStore()
  
  const handleGoToVaultSettings = () => {
    setActiveView('settings')
    setSettingsTab('vaults')
  }
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="p-4 bg-plm-bg-light/50 rounded-2xl border border-plm-border mb-4">
        <Database size={48} className="text-plm-fg-muted" />
      </div>
      <h3 className="text-lg font-semibold text-plm-fg mb-2">
        No Vault Connected
      </h3>
      <p className="text-sm text-plm-fg-muted max-w-[280px] mb-6">
        Connect to a vault to browse and manage your files
      </p>
      <button
        onClick={handleGoToVaultSettings}
        className="btn btn-primary flex items-center gap-2"
      >
        <Settings size={16} />
        Go to Vault Settings
      </button>
    </div>
  )
})
