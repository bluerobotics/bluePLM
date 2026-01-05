/**
 * WorkflowRoleDialogs - Self-contained workflow role dialogs
 * 
 * NOTE: This component has been refactored. Workflow role dialogs are now
 * rendered inline within RolesTab. This component is kept for backward
 * compatibility but will render nothing if used standalone.
 * 
 * For new code, dialogs are managed by RolesTab directly using hooks.
 * 
 * @deprecated Dialogs are now rendered inline in RolesTab
 */

export function WorkflowRoleDialogs() {
  // Dialogs are now rendered inline in RolesTab using hooks directly.
  // This component is kept for backward compatibility with parent imports.
  return null
}
