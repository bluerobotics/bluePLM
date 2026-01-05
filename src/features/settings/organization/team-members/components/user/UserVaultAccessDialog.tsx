/**
 * UserVaultAccessDialog - Manage vault access for an individual user
 * 
 * Thin wrapper around VaultAccessDialog for user-specific vault access.
 * 
 * @module team-members/UserVaultAccessDialog
 */

import { VaultAccessDialog } from '../dialogs/VaultAccessDialog'
import type { OrgUser, Vault } from '../../types'

export interface UserVaultAccessDialogProps {
  user: OrgUser
  orgVaults: Vault[]
  pendingVaultAccess: string[]
  setPendingVaultAccess: (fn: (prev: string[]) => string[]) => void
  onSave: () => Promise<void>
  onClose: () => void
  isSaving: boolean
}

export function UserVaultAccessDialog({
  user,
  orgVaults,
  pendingVaultAccess,
  setPendingVaultAccess,
  onSave,
  onClose,
  isSaving
}: UserVaultAccessDialogProps) {
  return (
    <VaultAccessDialog
      entityName={user.full_name || user.email}
      entityType="user"
      orgVaults={orgVaults}
      pendingVaultAccess={pendingVaultAccess}
      setPendingVaultAccess={setPendingVaultAccess}
      onSave={onSave}
      onClose={onClose}
      isSaving={isSaving}
    />
  )
}
