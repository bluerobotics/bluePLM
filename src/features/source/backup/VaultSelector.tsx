import { Switch } from '@/components/core/ui'

import type { ConnectedVault } from './types'

interface VaultSelectorProps {
  connectedVaults: ConnectedVault[]
  selectedVaultIds: string[]
  onVaultToggle: (vaultId: string, checked: boolean) => void
}

/**
 * Switches choosing which vaults to include in the backup, one row per connected vault.
 * Only shown when this machine is the designated backup source.
 */
export function VaultSelector({
  connectedVaults,
  selectedVaultIds,
  onVaultToggle,
}: VaultSelectorProps) {
  return (
    <div className="px-4 py-3.5">
      <div className="mb-2 text-[13px] font-medium text-plm-fg">Vaults to backup</div>
      {connectedVaults.length > 0 ? (
        <div className="divide-y divide-plm-border rounded-md border border-plm-border">
          {connectedVaults.map((vault) => (
            <div key={vault.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-plm-fg">{vault.name}</div>
                <div className="truncate text-[12px] text-plm-fg-muted">{vault.localPath}</div>
              </div>
              <Switch
                size="sm"
                aria-label={vault.name}
                checked={selectedVaultIds.includes(vault.id)}
                onChange={(checked) => onVaultToggle(vault.id, checked)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-plm-warning">No vaults connected</div>
      )}
    </div>
  )
}
