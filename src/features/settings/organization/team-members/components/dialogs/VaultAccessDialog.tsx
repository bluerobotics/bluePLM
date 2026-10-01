/**
 * VaultAccessDialog - Generic vault access management dialog
 *
 * Allows admins to configure which vaults an entity (user or team) can access.
 * Empty selection means access to all vaults.
 *
 * @module team-members/VaultAccessDialog
 */

import { Database, Folder } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
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
  /** Effective access inherited through teams; never persisted as direct access. */
  inheritedVaultAccess?: string[]
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
  inheritedVaultAccess = [],
  setPendingVaultAccess,
  onSave,
  onClose,
  isSaving,
}: VaultAccessDialogProps) {
  const { t } = useTranslation()
  const isTeam = entityType === 'team'
  const title = isTeam
    ? t('mdbSetup.teamVaultAccess', { name: entityName })
    : t('mdbSetup.individualVaultAccess')
  const description = isTeam
    ? t('mdbSetup.teamVaultAccessDescription')
    : t('mdbSetup.userVaultAccessDescription', { name: entityName })
  const defaultAccessText = isTeam
    ? t('mdbSetup.noVaultAccessTeamHelp')
    : t('mdbSetup.noVaultAccessUserHelp')
  const effectiveVaultAccess = [...new Set([...pendingVaultAccess, ...inheritedVaultAccess])]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-plm-fg mb-2 flex items-center gap-2">
          {isTeam && <Database size={18} className="text-plm-accent" />}
          {title}
        </h3>
        <p className={`${isTeam ? 'text-sm' : 'text-base'} text-plm-fg-muted mb-4`}>
          {description}
        </p>

        {/* Vault access indicator */}
        <div
          className={`p-3 rounded-lg border mb-3 ${
            effectiveVaultAccess.length === 0
              ? 'bg-plm-warning/10 border-plm-warning/30'
              : 'bg-plm-bg border-plm-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <Database
              size={16}
              className={effectiveVaultAccess.length === 0 ? 'text-plm-warning' : 'text-plm-fg-muted'}
            />
            <span
              className={`text-sm ${effectiveVaultAccess.length === 0 ? 'text-plm-warning' : 'text-plm-fg-muted'}`}
            >
              {effectiveVaultAccess.length === 0
                ? t('mdbSetup.noVaultAccess')
                : t('mdbSetup.selectedVaults', {
                    selected: effectiveVaultAccess.length,
                    total: orgVaults.length,
                  })}
            </span>
          </div>
          {effectiveVaultAccess.length === 0 && (
            <p className="text-xs text-plm-fg-muted mt-1 ml-6">{defaultAccessText}</p>
          )}
        </div>

        <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
          {orgVaults.map((vault) => (
            <label
              key={vault.id}
              className="flex items-center gap-3 p-2 hover:bg-plm-highlight rounded cursor-pointer"
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
                className="w-4 h-4 rounded border-plm-border text-plm-accent focus:ring-plm-accent"
              />
              <Folder
                size={18}
                className={vault.is_default ? 'text-plm-accent' : 'text-plm-fg-muted'}
              />
              <span className="text-base text-plm-fg">{vault.name}</span>
              {!isTeam && inheritedVaultAccess.includes(vault.id) && (
                <span className="text-xs text-plm-accent">
                  {t('mdbSetup.inheritedTeamVaultAccess')}
                </span>
              )}
              {vault.is_default && (
                <span className="text-xs text-plm-accent">({t('mdbSetup.defaultVault')})</span>
              )}
            </label>
          ))}
        </div>
        <p className="text-xs text-plm-fg-dim mb-4">
          {inheritedVaultAccess.length > 0
            ? t('mdbSetup.directVaultSelectionHelp')
            : t('mdbSetup.vaultSelectionHelp')}
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost">
            {t('mdbSetup.cancel')}
          </button>
          <button onClick={onSave} disabled={isSaving} className="btn btn-primary">
            {isSaving ? t('mdbSetup.saving') : t('mdbSetup.saveAccess')}
          </button>
        </div>
      </div>
    </div>
  )
}
