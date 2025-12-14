import { useState } from 'react'
import { usePDMStore } from '../../stores/pdmStore'

export function VaultSettings() {
  const { vaultPath, vaultName, setVaultName } = usePDMStore()
  const [editingVaultName, setEditingVaultName] = useState(false)
  const [vaultNameInput, setVaultNameInput] = useState('')

  const displayName = vaultName || vaultPath?.split(/[/\\]/).pop() || 'vault'

  const handleSaveVaultName = () => {
    if (vaultNameInput.trim()) {
      setVaultName(vaultNameInput.trim())
    }
    setEditingVaultName(false)
  }

  if (!vaultPath) {
    return (
      <div className="text-center py-12 text-plm-fg-muted text-base">
        No vault connected
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Vault name */}
      <div className="space-y-2">
        <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
          Vault Name
        </label>
        {editingVaultName ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={vaultNameInput}
              onChange={(e) => setVaultNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveVaultName()
                if (e.key === 'Escape') setEditingVaultName(false)
              }}
              className="flex-1 bg-plm-bg border border-plm-border rounded-lg px-3 py-2 text-base focus:border-plm-accent focus:outline-none"
              autoFocus
            />
            <button onClick={handleSaveVaultName} className="btn btn-primary btn-sm">
              Save
            </button>
            <button 
              onClick={() => setEditingVaultName(false)} 
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div 
            className="p-3 bg-plm-bg rounded-lg border border-plm-border cursor-pointer hover:border-plm-accent transition-colors"
            onClick={() => {
              setVaultNameInput(displayName)
              setEditingVaultName(true)
            }}
          >
            <span className="text-base text-plm-fg">{displayName}</span>
            <span className="text-sm text-plm-fg-dim ml-2">(click to edit)</span>
          </div>
        )}
      </div>

      {/* Vault path */}
      <div className="space-y-2">
        <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
          Local Path
        </label>
        <div className="p-3 bg-plm-bg rounded-lg border border-plm-border">
          <span className="text-base text-plm-fg-dim font-mono break-all">
            {vaultPath}
          </span>
        </div>
      </div>
    </div>
  )
}

