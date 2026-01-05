/**
 * UserDialogs - Self-contained user-related dialogs
 * 
 * NOTE: This component has been refactored. User dialogs are now rendered
 * inline within UsersTab or triggered from ConnectedUserRow. This component
 * is kept for backward compatibility but will render nothing if used standalone.
 * 
 * For new code, dialogs are managed by the respective components using hooks.
 * 
 * @deprecated Dialogs are now rendered inline in UsersTab/ConnectedUserRow
 */

export function UserDialogs() {
  // Dialogs are now rendered inline in UsersTab and ConnectedUserRow using hooks.
  // This component is kept for backward compatibility with parent imports.
  return null
}
