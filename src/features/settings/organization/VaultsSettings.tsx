import { Loader2, Plus, RefreshCw } from 'lucide-react'

import { Button, TextInput } from '@/components/core/ui'
import { VaultSetupDialog } from '@/components/shared/Dialogs'
import { hasDesktop } from '@/lib/platform'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'
import { RealignSection } from './realign'
import { useVaultsManager } from './useVaultsManager'
import { VaultDialogs } from './VaultDialogs'
import { VaultRow } from './VaultRow'
import { VaultAutoDownloadSettings, VaultUploadWarnings } from './VaultSyncPreferences'

export function VaultsSettings() {
  const manager = useVaultsManager()
  const {
    organization,
    connectedVaults,
    isAdmin,
    autoDownloadSizeLimit,
    orgVaults,
    isLoadingVaults,
    loadOrgVaults,
    isCreatingVault,
    setIsCreatingVault,
    newVaultName,
    setNewVaultName,
    newVaultDescription,
    setNewVaultDescription,
    isSavingVault,
    handleCreateVault,
    cancelCreateVault,
    setupVault,
    setupVaultPath,
    setupVaultSyncStats,
    handleVaultSetupComplete,
    handleVaultSetupCancel,
  } = manager

  if (!organization) {
    return (
      <div className="py-12 text-center text-[14px] text-ui-fg-secondary">
        No organization connected
      </div>
    )
  }

  return (
    <SettingsPage>
      <SettingsSection
        description="Manage vaults in your organization"
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={14} className={isLoadingVaults ? 'animate-spin' : ''} />}
              onClick={loadOrgVaults}
              disabled={isLoadingVaults}
              title="Refresh vaults"
              aria-label="Refresh vaults"
            />
            {isAdmin && (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => setIsCreatingVault(true)}
              >
                Add Vault
              </Button>
            )}
          </>
        }
      >
        {isCreatingVault && (
          <SettingsGroup>
            <SettingRow label="Vault Name" htmlFor="new-vault-name">
              <TextInput
                id="new-vault-name"
                value={newVaultName}
                onChange={(e) => setNewVaultName(e.target.value)}
                placeholder="e.g., Main Vault, Archive, Projects"
                className="!w-72"
                autoFocus
              />
            </SettingRow>
            <SettingRow label="Description (optional)" htmlFor="new-vault-description">
              <TextInput
                id="new-vault-description"
                value={newVaultDescription}
                onChange={(e) => setNewVaultDescription(e.target.value)}
                placeholder="e.g., Main production files"
                className="!w-72"
              />
            </SettingRow>
            <div className="flex justify-end gap-2 px-4 py-3">
              <Button variant="ghost" size="sm" onClick={cancelCreateVault}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateVault}
                disabled={!newVaultName.trim() || isSavingVault}
              >
                {isSavingVault ? 'Creating...' : 'Create Vault'}
              </Button>
            </div>
          </SettingsGroup>
        )}

        {isLoadingVaults ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-ui-fg-secondary" size={20} />
          </div>
        ) : orgVaults.length === 0 ? (
          <SettingsGroup>
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <p className="text-[14px] text-ui-fg-secondary">
                {isAdmin
                  ? 'No vaults created yet. Add a vault to get started.'
                  : 'No vaults created yet. Ask an organization admin to create one.'}
              </p>
              {isAdmin && !isCreatingVault && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => setIsCreatingVault(true)}
                >
                  Add Vault
                </Button>
              )}
            </div>
          </SettingsGroup>
        ) : (
          <SettingsGroup>
            {orgVaults.map((vault) => (
              <VaultRow key={vault.id} vault={vault} manager={manager} />
            ))}
          </SettingsGroup>
        )}
      </SettingsSection>

      {connectedVaults.length > 0 && <VaultAutoDownloadSettings />}

      {/* Re-align with Server: see ./realign/. Not admin-gated: any user may re-align their own
          vault copy. */}
      {connectedVaults.length > 0 && hasDesktop() && <RealignSection />}

      {connectedVaults.length > 0 && <VaultUploadWarnings />}

      <VaultDialogs manager={manager} />

      {setupVault && (
        <VaultSetupDialog
          vaultId={setupVault.id}
          vaultName={setupVault.name}
          vaultDescription={setupVault.description}
          syncStats={setupVaultSyncStats || undefined}
          initialSizeLimit={autoDownloadSizeLimit}
          vaultLocalPath={setupVaultPath || undefined}
          onComplete={handleVaultSetupComplete}
          onCancel={handleVaultSetupCancel}
        />
      )}
    </SettingsPage>
  )
}
