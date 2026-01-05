/**
 * TeamVaultAccessDialog - Manage vault access for a team
 * 
 * Thin wrapper around VaultAccessDialog for team-specific vault access.
 * 
 * @module team-members/TeamVaultAccessDialog
 */

import { VaultAccessDialog } from '../dialogs/VaultAccessDialog'
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
    <VaultAccessDialog
      entityName={team.name}
      entityType="team"
      orgVaults={orgVaults}
      pendingVaultAccess={pendingVaultAccess}
      setPendingVaultAccess={setPendingVaultAccess}
      onSave={onSave}
      onClose={onClose}
      isSaving={isSaving}
    />
  )
}
