/**
 * Extension Permissions System
 * 
 * Provides permission checking for extension API access.
 * All API methods check permissions before executing.
 * 
 * @module extensions/api/permissions
 */

import type { ClientPermission } from './types'

// ============================================
// Permission Checking
// ============================================

/**
 * Error thrown when an extension lacks required permissions.
 */
export class PermissionDeniedError extends Error {
  constructor(
    public readonly extensionId: string,
    public readonly api: string,
    public readonly requiredPermissions: string[]
  ) {
    super(
      `Extension '${extensionId}' does not have permission to access '${api}'. ` +
      `Required permissions: ${requiredPermissions.join(', ')}`
    )
    this.name = 'PermissionDeniedError'
  }
}

/**
 * Check if an extension has permission to access an API method.
 * Throws PermissionDeniedError if permission is denied.
 * 
 * @param extensionId - The ID of the extension
 * @param api - The API method being accessed (e.g., 'ui.showToast')
 * @param grantedPermissions - Permissions granted to the extension
 * @throws PermissionDeniedError if permission is denied
 * 
 * @example
 * ```typescript
 * // In API implementation
 * checkPermission('my-ext', 'ui.showToast', ['ui:toast'])
 * // Throws if 'ui:toast' is not in granted permissions
 * ```
 */
export function checkPermission(
  extensionId: string,
  api: string,
  grantedPermissions: string[]
): void {
  const required = getRequiredPermissions(api)
  
  // If no permissions required, allow
  if (required.length === 0) {
    return
  }
  
  // Check if all required permissions are granted
  const missingPermissions = required.filter(
    (perm) => !grantedPermissions.includes(perm)
  )
  
  if (missingPermissions.length > 0) {
    throw new PermissionDeniedError(extensionId, api, missingPermissions)
  }
}

/**
 * Check if an extension has all specified permissions.
 * Returns boolean instead of throwing.
 * 
 * @param requiredPermissions - Permissions to check
 * @param grantedPermissions - Permissions granted to the extension
 * @returns True if all required permissions are granted
 */
export function hasPermissions(
  requiredPermissions: ClientPermission[],
  grantedPermissions: string[]
): boolean {
  return requiredPermissions.every((perm) => grantedPermissions.includes(perm))
}

/**
 * Check if an extension has a specific permission.
 * 
 * @param permission - Permission to check
 * @param grantedPermissions - Permissions granted to the extension
 * @returns True if the permission is granted
 */
export function hasPermission(
  permission: ClientPermission,
  grantedPermissions: string[]
): boolean {
  return grantedPermissions.includes(permission)
}

/**
 * Get the permissions required for an API method.
 * 
 * @param api - The API method (e.g., 'ui.showToast')
 * @returns Array of required permissions
 */
export function getRequiredPermissions(api: string): ClientPermission[] {
  // Import API_PERMISSIONS dynamically to avoid circular dependency
  const apiPermissions: Record<string, ClientPermission[]> = {
    // UI
    'ui.showToast': ['ui:toast'],
    'ui.showDialog': ['ui:dialog'],
    'ui.setStatus': ['ui:status'],
    'ui.showProgress': ['ui:progress'],
    'ui.showQuickPick': ['ui:dialog'],
    'ui.showInputBox': ['ui:dialog'],
    
    // Storage
    'storage.get': ['storage:local'],
    'storage.set': ['storage:local'],
    'storage.delete': ['storage:local'],
    'storage.keys': ['storage:local'],
    'storage.has': ['storage:local'],
    'storage.clear': ['storage:local'],
    
    // Network
    'callOrgApi': ['network:orgApi'],
    'callStoreApi': ['network:storeApi'],
    'fetch': ['network:fetch'],
    
    // Commands
    'commands.registerCommand': ['commands:register'],
    'commands.executeCommand': ['commands:execute'],
    'commands.getCommands': [],
    
    // Workspace
    'workspace.onFileChanged': ['workspace:files'],
    'workspace.getOpenFiles': ['workspace:files'],
    'workspace.getCurrentVault': [],
    'workspace.getVaults': [],
    
    // Events (no permissions needed)
    'events.on': [],
    'events.emit': [],
    
    // Telemetry
    'telemetry.trackEvent': ['telemetry'],
    'telemetry.trackError': ['telemetry'],
    'telemetry.trackTiming': ['telemetry'],
    
    // Context (no permissions needed)
    'context': [],
  }
  
  return apiPermissions[api] || []
}

// ============================================
// Permission Validation
// ============================================

/**
 * All valid client permissions.
 */
export const VALID_CLIENT_PERMISSIONS: ClientPermission[] = [
  'ui:toast',
  'ui:dialog',
  'ui:status',
  'ui:progress',
  'storage:local',
  'network:orgApi',
  'network:storeApi',
  'network:fetch',
  'commands:register',
  'commands:execute',
  'workspace:files',
  'telemetry',
]

/**
 * Validate that all permissions in a list are valid.
 * 
 * @param permissions - Permissions to validate
 * @returns Array of invalid permissions (empty if all valid)
 */
export function validatePermissions(permissions: string[]): string[] {
  const invalid: string[] = []
  
  for (const perm of permissions) {
    if (!VALID_CLIENT_PERMISSIONS.includes(perm as ClientPermission)) {
      invalid.push(perm)
    }
  }
  
  return invalid
}

/**
 * Normalize permissions by removing duplicates and sorting.
 * 
 * @param permissions - Permissions to normalize
 * @returns Normalized permission list
 */
export function normalizePermissions(permissions: string[]): string[] {
  return [...new Set(permissions)].sort()
}

// ============================================
// Permission Categories
// ============================================

/**
 * Permission categories for grouping in UI.
 */
export interface PermissionCategory {
  id: string
  name: string
  description: string
  permissions: ClientPermission[]
}

/**
 * Categories of permissions for display.
 */
export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: 'ui',
    name: 'User Interface',
    description: 'Show notifications, dialogs, and status indicators',
    permissions: ['ui:toast', 'ui:dialog', 'ui:status', 'ui:progress'],
  },
  {
    id: 'storage',
    name: 'Storage',
    description: 'Store data locally on this device',
    permissions: ['storage:local'],
  },
  {
    id: 'network',
    name: 'Network',
    description: 'Make network requests',
    permissions: ['network:orgApi', 'network:storeApi', 'network:fetch'],
  },
  {
    id: 'commands',
    name: 'Commands',
    description: 'Register and execute commands',
    permissions: ['commands:register', 'commands:execute'],
  },
  {
    id: 'workspace',
    name: 'Workspace',
    description: 'Access workspace files and vaults',
    permissions: ['workspace:files'],
  },
  {
    id: 'telemetry',
    name: 'Analytics',
    description: 'Send anonymous usage analytics',
    permissions: ['telemetry'],
  },
]

/**
 * Get human-readable description for a permission.
 * 
 * @param permission - The permission to describe
 * @returns Human-readable description
 */
export function getPermissionDescription(permission: ClientPermission): string {
  const descriptions: Record<ClientPermission, string> = {
    'ui:toast': 'Show toast notifications',
    'ui:dialog': 'Show dialog boxes',
    'ui:status': 'Update status bar indicators',
    'ui:progress': 'Show progress indicators',
    'storage:local': 'Store data locally',
    'network:orgApi': 'Call organization API',
    'network:storeApi': 'Call extension store API',
    'network:fetch': 'Make HTTP requests to declared domains',
    'commands:register': 'Register new commands',
    'commands:execute': 'Execute registered commands',
    'workspace:files': 'Monitor file changes',
    'telemetry': 'Send anonymous analytics',
  }
  
  return descriptions[permission] || permission
}

/**
 * Get the category for a permission.
 * 
 * @param permission - The permission
 * @returns The category ID
 */
export function getPermissionCategory(permission: ClientPermission): string {
  for (const category of PERMISSION_CATEGORIES) {
    if (category.permissions.includes(permission)) {
      return category.id
    }
  }
  return 'other'
}

// ============================================
// Permission Granting
// ============================================

/**
 * Grant additional permissions to an extension.
 * This would be persisted to extension settings.
 * 
 * @param extensionId - The extension ID
 * @param currentPermissions - Current granted permissions
 * @param newPermissions - New permissions to grant
 * @returns Updated permission list
 */
export function grantPermissions(
  extensionId: string,
  currentPermissions: string[],
  newPermissions: ClientPermission[]
): string[] {
  const updated = normalizePermissions([...currentPermissions, ...newPermissions])
  console.info(`[Permissions] Granted to ${extensionId}:`, newPermissions)
  return updated
}

/**
 * Revoke permissions from an extension.
 * 
 * @param extensionId - The extension ID
 * @param currentPermissions - Current granted permissions
 * @param permissionsToRevoke - Permissions to revoke
 * @returns Updated permission list
 */
export function revokePermissions(
  extensionId: string,
  currentPermissions: string[],
  permissionsToRevoke: ClientPermission[]
): string[] {
  const updated = currentPermissions.filter(
    (perm) => !permissionsToRevoke.includes(perm as ClientPermission)
  )
  console.info(`[Permissions] Revoked from ${extensionId}:`, permissionsToRevoke)
  return updated
}

// ============================================
// Export Types
// ============================================

export type { ClientPermission }
