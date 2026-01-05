/**
 * Components - All team-members UI components
 * @module team-members/components
 */

// Dialogs - Form dialogs for creating/editing entities
export {
  TeamFormDialog,
  DeleteTeamDialog,
  WorkflowRoleFormDialog,
  JobTitleFormDialog,
  EditPendingMemberDialog,
  type DeleteTeamDialogProps,
  type WorkflowRoleFormDialogProps,
  type JobTitleFormDialogProps,
  type EditPendingMemberDialogProps
} from './dialogs'

// Modals - Selection/assignment modals
export {
  WorkflowRolesModal,
  UserTeamsModal,
  UserJobTitleModal,
  ViewNetPermissionsModal,
  AddToTeamModal,
  type AddToTeamModalProps
} from './modals'

// User components
export {
  UserRow,
  UserPermissionsDialog,
  UserVaultAccessDialog,
  CreateUserDialog,
  RemoveUserDialog,
  RemoveFromAdminsDialog,
  type UserVaultAccessDialogProps
} from './user'

// Team components
export {
  TeamMembersDialog,
  TeamModulesDialog,
  TeamVaultAccessDialog,
  type TeamVaultAccessDialogProps
} from './team'

// Self-contained dialog groups (use context, no props needed)
export { TeamDialogs } from './TeamDialogs'
export { UserDialogs } from './UserDialogs'
export { WorkflowRoleDialogs } from './WorkflowRoleDialogs'
export { JobTitleDialogs } from './JobTitleDialogs'