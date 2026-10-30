/**
 * VaultAccessDialog - Generic vault access management dialog
 *
 * Allows admins to configure which vaults an entity (user or team) can access.
 * Empty selection means access to all vaults.
 *
 * @module team-members/VaultAccessDialog
 */

import { Database, Folder } from 'lucide-react'
import { Button } from '@/components/core/ui'
import type { Vault } from '../../types'

export interface VaultAccessDialogProps {
  /** Display name of the entity (user name or team name) */
  entityName: string
  /** Type of entity being configured */
  entityType: 'user' | 'team'
  /** List of all vaults in the organization */
  orgVaults: Vault[]
  /** Currently selected vault IDs */
  pendingVaultAccess: string[]
  /** Callback to update selected vault IDs */
  setPendingVaultAccess: (fn: (prev: string[]) => string[]) => void
  /** Save handler */
  onSave: () => Promise<void>
  /** Close handler */
  onClose: () => void
  /** Whether save is in progress */
  isSaving: boolean
}

export function VaultAccessDialog({
  entityName,
  entityType,
  orgVaults,
  pendingVaultAccess,
  setPendingVaultAccess,
  onSave,
  onClose,
  isSaving,
}: VaultAccessDialogProps) {
  const isTeam = entityType === 'team'
  const title = isTeam ? `Vault Access - ${entityName}` : 'Individual Vault Access'
  const description = isTeam
    ? 'Select which vaults this team can access.'
    : `Select which vaults ${entityName} can access.`
  const defaultAccessText = isTeam
    ? 'No vaults selected — this team has no vault access. Select vaults to grant access.'
    : 'No vaults selected — this user has no vault access. Select vaults to grant access.'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-ui-field border border-ui-divider rounded-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-ui-fg mb-2 flex items-center gap-2">
          {isTeam && <Database size={18} className="text-ui-accent" />}
          {title}
        </h3>
        <p className={`${isTeam ? 'text-[13px]' : 'text-[14px]'} text-ui-fg-secondary mb-4`}>
          {!isTeam && (
            <>
              Select which vaults <strong>{entityName}</strong> can access.
            </>
          )}
          {isTeam && description}
        </p>

        {/* Vault access indicator */}
        <div
          className={`p-3 rounded-lg border mb-3 ${
            pendingVaultAccess.length === 0
              ? 'bg-ui-warning/10 border-ui-warning/30'
              : 'bg-ui-bg border-ui-divider'
          }`}
        >
          <div className="flex items-center gap-2">
            <Database
              size={16}
              className={pendingVaultAccess.length === 0 ? 'text-ui-warning' : 'text-ui-fg-secondary'}
            />
            <span
              className={`text-[13px] ${pendingVaultAccess.length === 0 ? 'text-ui-warning' : 'text-ui-fg-secondary'}`}
            >
              {pendingVaultAccess.length === 0
                ? 'No vault access'
                : `${pendingVaultAccess.length} of ${orgVaults.length} vaults selected`}
            </span>
          </div>
          {pendingVaultAccess.length === 0 && (
            <p className="text-[12px] text-ui-fg-secondary mt-1 ml-6">{defaultAccessText}</p>
          )}
        </div>

        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {orgVaults.map((vault) => (
            <label
              key={vault.id}
              className="flex items-center gap-3 p-2 hover:bg-ui-hover rounded cursor-pointer"
            >
              <input
                type="checkbox"
                checked={pendingVaultAccess.includes(vault.id)}
                onChange={() => {
                  setPendingVaultAccess((current) =>
                    current.includes(vault.id)
                      ? current.filter((id) => id !== vault.id)
                      : [...current, vault.id],
                  )
                }}
                className="w-4 h-4 rounded border-ui-divider text-ui-accent focus:ring-ui-accent"
              />
              <Folder
                size={18}
                className={vault.is_default ? 'text-ui-accent' : 'text-ui-fg-secondary'}
              />
              <span className="text-[14px] text-ui-fg">{vault.name}</span>
              {vault.is_default && <span className="text-[12px] text-ui-accent">(default)</span>}
            </label>
          ))}
        </div>
        <p className="text-[12px] text-ui-fg mb-4">
          Select specific vaults to restrict access, or leave all unchecked for full access to all
          vaults.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Access'}
          </Button>
        </div>
      </div>
    </div>
  )
}
