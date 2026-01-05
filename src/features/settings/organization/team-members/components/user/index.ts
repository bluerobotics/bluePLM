/**
 * User components - User-related dialogs and components
 * @module team-members/components/user
 */

// Presentation component (pure, testable, for external use or testing)
export { UserRow } from './UserRow'

// Self-contained component (uses hooks directly, no context needed)
export { ConnectedUserRow } from './ConnectedUserRow'
export type { ConnectedUserRowProps } from './ConnectedUserRow'
export { UserPermissionsDialog } from './UserPermissionsDialog'
export { UserVaultAccessDialog, type UserVaultAccessDialogProps } from './UserVaultAccessDialog'
export { CreateUserDialog } from './CreateUserDialog'
export { RemoveUserDialog } from './RemoveUserDialog'
export { RemoveFromAdminsDialog } from './RemoveFromAdminsDialog'
