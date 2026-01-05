/**
 * TeamVaultAccessDialog - Manage vault access for a team
 * 
 * Allows admins to configure which vaults a team can access.
 * Empty selection means access to all vaults.
 * 
 * @module team-members/TeamVaultAccessDialog
 */

import { Database, Folder } from 'lucide-react'
import type { TeamWithDetails, Vault } from '../../types'

export interface TeamVaultAccessDialogProps {
  team: TeamWithDetails
  orgVaults: Vault[]
  pendingVaultAccess: string[]
  setPendingVaultAccess: (fn: (prev: string[]) => string[]) => void
  onSave: () => Promise<void>
  onClose: () => void
  isSaving: boolean
}

export function TeamVaultAccessDialog({
  team,
  orgVaults,
  pendingVaultAccess,
  setPendingVaultAccess,
  onSave,
  onClose,
  isSaving
}: TeamVaultAccessDialogProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-plm-fg mb-2 flex items-center gap-2">
          <Database size={18} className="text-plm-accent" />
          Vault Access - {team.name}
        </h3>
        <p className="text-sm text-plm-fg-muted mb-4">
          Select which vaults this team can access.
        </p>
        
        {/* All vaults indicator */}
        <div className={`p-3 rounded-lg border mb-3 ${
          pendingVaultAccess.length === 0
            ? 'bg-plm-success/10 border-plm-success/30'
            : 'bg-plm-bg border-plm-border'
        }`}>
          <div className="flex items-center gap-2">
            <Database size={16} className={pendingVaultAccess.length === 0 ? 'text-plm-success' : 'text-plm-fg-muted'} />
            <span className={`text-sm ${pendingVaultAccess.length === 0 ? 'text-plm-success' : 'text-plm-fg-muted'}`}>
              {pendingVaultAccess.length === 0 
                ? 'All vaults (no restrictions)' 
                : `${pendingVaultAccess.length} of ${orgVaults.length} vaults selected`}
            </span>
          </div>
          {pendingVaultAccess.length === 0 && (
            <p className="text-xs text-plm-fg-muted mt-1 ml-6">
              By default, teams have access to all organization vaults
            </p>
          )}
        </div>
        
        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {orgVaults.map(vault => (
            <label key={vault.id} className="flex items-center gap-3 p-2 hover:bg-plm-highlight rounded cursor-pointer">
              <input
                type="checkbox"
                checked={pendingVaultAccess.includes(vault.id)}
                onChange={() => {
                  setPendingVaultAccess(current =>
                    current.includes(vault.id)
                      ? current.filter(id => id !== vault.id)
                      : [...current, vault.id]
                  )
                }}
                className="w-4 h-4 rounded border-plm-border text-plm-accent focus:ring-plm-accent"
              />
              <Folder size={18} className={vault.is_default ? 'text-plm-accent' : 'text-plm-fg-muted'} />
              <span className="text-base text-plm-fg">{vault.name}</span>
              {vault.is_default && (
                <span className="text-xs text-plm-accent">(default)</span>
              )}
            </label>
          ))}
        </div>
        <p className="text-xs text-plm-fg-dim mb-4">
          Select specific vaults to restrict access, or leave all unchecked for full access to all vaults.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="btn btn-primary"
          >
            {isSaving ? 'Saving...' : 'Save Access'}
          </button>
        </div>
      </div>
    </div>
  )
}
