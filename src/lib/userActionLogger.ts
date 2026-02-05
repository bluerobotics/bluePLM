/**
 * User Action Logger
 * 
 * Logs user interactions for debugging purposes.
 * All actions are written to the Electron log file.
 */

type ActionCategory = 
  | 'navigation'
  | 'click'
  | 'file'
  | 'auth'
  | 'settings'
  | 'search'
  | 'filter'
  | 'modal'
  | 'context-menu'
  | 'drag-drop'
  | 'keyboard'
  | 'form'
  | 'sync'

interface ActionDetails {
  [key: string]: string | number | boolean | undefined | null
}

/**
 * Log a user action
 * @param category - The category of action (navigation, click, file, etc.)
 * @param action - Description of what the user did
 * @param details - Optional additional details about the action
 */
export function logUserAction(
  category: ActionCategory,
  action: string,
  details?: ActionDetails
) {
  const message = `[UserAction] [${category.toUpperCase()}] ${action}`
  
  // Log to electron (file) only - avoid console spam for user actions
  if (window.electronAPI?.log) {
    window.electronAPI.log('info', message, details)
  }
}

// Convenience functions for common action types

export const logNavigation = (view: string, details?: ActionDetails) => 
  logUserAction('navigation', `Navigated to ${view}`, details)

export const logClick = (element: string, details?: ActionDetails) => 
  logUserAction('click', `Clicked ${element}`, details)

export const logFileAction = (action: string, filePath?: string, details?: ActionDetails) => 
  logUserAction('file', action, { filePath, ...details })

export const logAuth = (action: string, details?: ActionDetails) => 
  logUserAction('auth', action, details)

export const logSettings = (action: string, details?: ActionDetails) => 
  logUserAction('settings', action, details)

export const logSearch = (query: string, type?: string) => 
  logUserAction('search', `Searched for "${query}"`, { type })

export const logFilter = (filterType: string, value: string | boolean) => 
  logUserAction('filter', `Changed ${filterType} filter`, { value: String(value) })

export const logModal = (action: 'opened' | 'closed', modalName: string) => 
  logUserAction('modal', `${action === 'opened' ? 'Opened' : 'Closed'} ${modalName} modal`)

export const logContextMenu = (action: string, target?: string) => 
  logUserAction('context-menu', action, { target })

export const logDragDrop = (action: string, details?: ActionDetails) => 
  logUserAction('drag-drop', action, details)

export const logKeyboard = (shortcut: string, action: string) => 
  logUserAction('keyboard', `${shortcut} - ${action}`)

export const logForm = (formName: string, action: 'submitted' | 'changed' | 'validated', details?: ActionDetails) => 
  logUserAction('form', `${formName} ${action}`, details)

export const logSync = (action: string, details?: ActionDetails) => 
  logUserAction('sync', action, details)

/**
 * Log explorer/navigation actions with detailed timing for debugging hangs.
 * All logs include timestamps and are written to the Electron log file.
 */
export const logExplorer = (action: string, details?: ActionDetails) => 
  logUserAction('navigation', `[Explorer] ${action}`, details)
