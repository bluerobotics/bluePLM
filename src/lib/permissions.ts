/**
 * Permission checking utilities for Explorer operations
 * 
 * This module provides pre-flight permission checks that can be used
 * to disable UI elements when users lack required permissions.
 */

import type { PermissionAction } from '@/types/permissions'
import { PERMISSION_ACTION_LABELS, MODULE_RESOURCES, SYSTEM_RESOURCES } from '@/types/permissions'

// ===========================================
// OPERATION TO PERMISSION MAPPING
// ===========================================

/**
 * Maps file operations to required permissions
 */
export const OPERATION_PERMISSIONS = {
  // File checkout/checkin operations
  checkout: { resource: 'module:explorer', action: 'edit' as PermissionAction },
  checkin: { resource: 'module:explorer', action: 'edit' as PermissionAction },
  discard: { resource: 'module:explorer', action: 'edit' as PermissionAction },
  
  // File creation/sync operations
  sync: { resource: 'module:explorer', action: 'create' as PermissionAction },
  'add-files': { resource: 'module:explorer', action: 'create' as PermissionAction },
  'add-folder': { resource: 'module:explorer', action: 'create' as PermissionAction },
  
  // File download operations (read access)
  download: { resource: 'module:explorer', action: 'view' as PermissionAction },
  'get-latest': { resource: 'module:explorer', action: 'view' as PermissionAction },
  
  // Delete operations
  'delete-server': { resource: 'module:explorer', action: 'delete' as PermissionAction },
  'delete-local': { resource: 'module:explorer', action: 'view' as PermissionAction }, // Local-only needs view
  
  // Admin operations
  'force-release': { resource: 'module:explorer', action: 'admin' as PermissionAction },
  
  // Metadata operations
  'sync-metadata': { resource: 'module:explorer', action: 'edit' as PermissionAction },
  'extract-references': { resource: 'module:explorer', action: 'edit' as PermissionAction },
} as const

export type OperationId = keyof typeof OPERATION_PERMISSIONS

// ===========================================
// RESOURCE NAME LOOKUP
// ===========================================

const ALL_RESOURCES = [...MODULE_RESOURCES, ...SYSTEM_RESOURCES]

/**
 * Get human-readable name for a resource ID
 */
export function getResourceName(resourceId: string): string {
  const resource = ALL_RESOURCES.find(r => r.id === resourceId)
  return resource?.name || resourceId.replace('module:', '').replace('system:', '')
}

// ===========================================
// PERMISSION REQUIREMENT MESSAGES
// ===========================================

/**
 * Get human-readable permission requirement message
 * e.g., "Edit permission on Explorer"
 */
export function getPermissionRequirement(operation: OperationId): string {
  const perm = OPERATION_PERMISSIONS[operation]
  if (!perm) return 'Permission required'
  
  const actionLabel = PERMISSION_ACTION_LABELS[perm.action]
  const resourceName = getResourceName(perm.resource)
  
  return `${actionLabel} permission on ${resourceName}`
}

/**
 * Get full permission denied message for toast/tooltip
 * e.g., "You need Edit permission on Explorer to check out files"
 */
export function getPermissionDeniedMessage(operation: OperationId): string {
  const operationLabels: Record<OperationId, string> = {
    checkout: 'check out files',
    checkin: 'check in files',
    discard: 'discard checkouts',
    sync: 'sync files to server',
    'add-files': 'add files',
    'add-folder': 'create folders',
    download: 'download files',
    'get-latest': 'get latest versions',
    'delete-server': 'delete files from server',
    'delete-local': 'remove local files',
    'force-release': 'force release checkouts',
    'sync-metadata': 'sync metadata',
    'extract-references': 'extract references',
  }
  
  const requirement = getPermissionRequirement(operation)
  const operationLabel = operationLabels[operation] || operation
  
  return `You need ${requirement} to ${operationLabel}`
}

// ===========================================
// PERMISSION CHECK HELPERS
// ===========================================

/**
 * Check if user has permission for an operation
 * Returns { allowed, reason } where reason explains why if not allowed
 */
export function checkOperationPermission(
  operation: OperationId,
  hasPermission: (resource: string, action: string) => boolean
): { allowed: boolean; reason?: string } {
  const perm = OPERATION_PERMISSIONS[operation]
  if (!perm) {
    return { allowed: true } // Unknown operation, allow by default
  }
  
  const allowed = hasPermission(perm.resource, perm.action)
  
  if (allowed) {
    return { allowed: true }
  }
  
  return {
    allowed: false,
    reason: getPermissionDeniedMessage(operation)
  }
}

/**
 * Get the required permission for an operation
 */
export function getOperationPermission(operation: OperationId): { resource: string; action: PermissionAction } | null {
  return OPERATION_PERMISSIONS[operation] || null
}
