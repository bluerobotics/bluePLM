/**
 * BluePLM Realtime Subscriptions
 * 
 * Provides instant updates across all connected clients for:
 * - Checkout locks (critical for conflict prevention)
 * - Version changes (know when your copy is stale)
 * - State changes (see releases in real-time)
 * 
 * New files require manual refresh (F5) - less critical.
 */

import { supabase } from './supabase'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { PDMFile } from '../types/pdm'
import type { Organization } from '../types/pdm'

type FileChangeCallback = (
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  file: PDMFile,
  oldFile?: PDMFile
) => void

type ActivityCallback = (activity: {
  action: string
  file_id: string | null
  user_email: string
  details: Record<string, unknown>
  created_at: string
}) => void

type OrganizationChangeCallback = (
  eventType: 'UPDATE',
  org: Organization,
  oldOrg?: Organization
) => void

type ColorSwatchChangeCallback = (
  eventType: 'INSERT' | 'DELETE',
  swatch: { id: string; color: string; org_id: string | null; user_id: string | null; created_at: string }
) => void

type VaultChangeCallback = (
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  vault: { id: string; name: string; slug: string; org_id: string; is_default: boolean | null },
  oldVault?: { id: string; name: string; slug: string; org_id: string; is_default: boolean | null }
) => void

let filesChannel: RealtimeChannel | null = null
let activityChannel: RealtimeChannel | null = null
let organizationChannel: RealtimeChannel | null = null
let colorSwatchesChannel: RealtimeChannel | null = null
let permissionsChannel: RealtimeChannel | null = null
let vaultsChannel: RealtimeChannel | null = null
let memberChangesChannel: RealtimeChannel | null = null
let notificationsChannel: RealtimeChannel | null = null

// Callback type for permission/access changes
type PermissionChangeCallback = (
  changeType: 'vault_access' | 'team_vault_access' | 'team_members' | 'user_permissions' | 'teams' | 'workflow_roles' | 'job_titles',
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  userId?: string
) => void

// Callback type for member attribute changes (org-wide, for admin views)
type MemberChangeCallback = (
  changeType: 'team_member' | 'workflow_role' | 'job_title',
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  userId: string
) => void

/**
 * Subscribe to real-time file changes for an organization
 * 
 * Updates are instant (<100ms) for:
 * - checked_out_by changes (lock acquired/released)
 * - version increments (new version checked in)
 * - state changes (WIP → Released)
 * - revision changes
 */
export function subscribeToFiles(
  orgId: string,
  onFileChange: FileChangeCallback
): () => void {
  // Unsubscribe from previous channel if exists
  if (filesChannel) {
    filesChannel.unsubscribe()
  }

  filesChannel = supabase
    .channel(`files:${orgId}`)
    .on<PDMFile>(
      'postgres_changes',
      {
        event: '*', // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'files',
        filter: `org_id=eq.${orgId}`
      },
      (payload: RealtimePostgresChangesPayload<PDMFile>) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        const newFile = payload.new as PDMFile
        const oldFile = payload.old as PDMFile | undefined
        onFileChange(eventType, newFile, oldFile)
      }
    )
    .subscribe()

  // Return unsubscribe function
  return () => {
    if (filesChannel) {
      filesChannel.unsubscribe()
      filesChannel = null
    }
  }
}

/**
 * Subscribe to activity feed for real-time notifications
 * 
 * Shows toast/notifications when:
 * - Someone checks out a file you're watching
 * - A file you care about gets a new version
 * - Files change state
 */
export function subscribeToActivity(
  orgId: string,
  onActivity: ActivityCallback
): () => void {
  if (activityChannel) {
    activityChannel.unsubscribe()
  }

  activityChannel = supabase
    .channel(`activity:${orgId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'activity',
        filter: `org_id=eq.${orgId}`
      },
      (payload) => {
        onActivity(payload.new as {
          action: string
          file_id: string | null
          user_email: string
          details: Record<string, unknown>
          created_at: string
        })
      }
    )
    .subscribe()

  return () => {
    if (activityChannel) {
      activityChannel.unsubscribe()
      activityChannel = null
    }
  }
}

/**
 * Subscribe to organization settings changes for real-time sync
 * 
 * Updates are instant for:
 * - Integration settings (API URLs, license keys)
 * - Google Drive configuration
 * - RFQ settings
 * - Any other org-level settings
 * 
 * This ensures all users in an org see settings changes immediately
 * without needing to refresh.
 */
export function subscribeToOrganization(
  orgId: string,
  onOrgChange: OrganizationChangeCallback
): () => void {
  // Unsubscribe from previous channel if exists
  if (organizationChannel) {
    organizationChannel.unsubscribe()
  }

  organizationChannel = supabase
    .channel(`organization:${orgId}`)
    .on<Organization>(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'organizations',
        filter: `id=eq.${orgId}`
      },
      (payload: RealtimePostgresChangesPayload<Organization>) => {
        const newOrg = payload.new as Organization
        const oldOrg = payload.old as Organization | undefined
        onOrgChange('UPDATE', newOrg, oldOrg)
      }
    )
    .subscribe()

  // Return unsubscribe function
  return () => {
    if (organizationChannel) {
      organizationChannel.unsubscribe()
      organizationChannel = null
    }
  }
}

/**
 * Subscribe to org color swatch changes for real-time sync
 * 
 * Updates are instant for:
 * - New org colors added by admins
 * - Org colors deleted by admins
 * 
 * This ensures all users see shared color palette changes immediately.
 */
export function subscribeToColorSwatches(
  orgId: string,
  onSwatchChange: ColorSwatchChangeCallback
): () => void {
  // Unsubscribe from previous channel if exists
  if (colorSwatchesChannel) {
    colorSwatchesChannel.unsubscribe()
  }

  colorSwatchesChannel = supabase
    .channel(`color_swatches:${orgId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'color_swatches',
        filter: `org_id=eq.${orgId}`
      },
      (payload) => {
        onSwatchChange('INSERT', payload.new as { id: string; color: string; org_id: string | null; user_id: string | null; created_at: string })
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'color_swatches',
        filter: `org_id=eq.${orgId}`
      },
      (payload) => {
        onSwatchChange('DELETE', payload.old as { id: string; color: string; org_id: string | null; user_id: string | null; created_at: string })
      }
    )
    .subscribe()

  // Return unsubscribe function
  return () => {
    if (colorSwatchesChannel) {
      colorSwatchesChannel.unsubscribe()
      colorSwatchesChannel = null
    }
  }
}

/**
 * Subscribe to vault CRUD changes for an organization
 * 
 * Updates are instant for:
 * - Vault created
 * - Vault renamed
 * - Vault deleted
 * - Default vault changed
 * 
 * This ensures all admins see vault changes immediately.
 */
export function subscribeToVaults(
  orgId: string,
  onVaultChange: VaultChangeCallback
): () => void {
  // Unsubscribe from previous channel if exists
  if (vaultsChannel) {
    vaultsChannel.unsubscribe()
  }

  vaultsChannel = supabase
    .channel(`vaults:${orgId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'vaults',
        filter: `org_id=eq.${orgId}`
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        const newVault = payload.new as { id: string; name: string; slug: string; org_id: string; is_default: boolean | null }
        const oldVault = payload.old as { id: string; name: string; slug: string; org_id: string; is_default: boolean | null } | undefined
        onVaultChange(eventType, newVault, oldVault)
      }
    )
    .subscribe()

  // Return unsubscribe function
  return () => {
    if (vaultsChannel) {
      vaultsChannel.unsubscribe()
      vaultsChannel = null
    }
  }
}

/**
 * Subscribe to org-wide member attribute changes
 * 
 * Used by admin views (e.g., TeamMembersSettings) to see real-time updates when:
 * - Users are added/removed from teams
 * - Users are assigned/unassigned workflow roles
 * - Users are assigned/unassigned job titles
 * 
 * Note: These tables don't have org_id directly, so we subscribe to all changes
 * and let the callback handler filter/refresh as needed. The subscription is
 * scoped by channel name to avoid conflicts with other orgs.
 */
export function subscribeToMemberChanges(
  orgId: string,
  onMemberChange: MemberChangeCallback
): () => void {
  // Unsubscribe from previous channel if exists
  if (memberChangesChannel) {
    memberChangesChannel.unsubscribe()
  }

  memberChangesChannel = supabase
    .channel(`member_changes:${orgId}`)
    // Team membership changes (all users)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'team_members'
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        const record = (payload.new || payload.old) as { user_id?: string }
        if (record?.user_id) {
          onMemberChange('team_member', eventType, record.user_id)
        }
      }
    )
    // Workflow role assignment changes (all users)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_workflow_roles'
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        const record = (payload.new || payload.old) as { user_id?: string }
        if (record?.user_id) {
          onMemberChange('workflow_role', eventType, record.user_id)
        }
      }
    )
    // Job title assignment changes (all users)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_job_titles'
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        const record = (payload.new || payload.old) as { user_id?: string }
        if (record?.user_id) {
          onMemberChange('job_title', eventType, record.user_id)
        }
      }
    )
    .subscribe()

  // Return unsubscribe function
  return () => {
    if (memberChangesChannel) {
      memberChangesChannel.unsubscribe()
      memberChangesChannel = null
    }
  }
}

/**
 * Check if member changes realtime is connected
 */
export function isMemberChangesRealtimeConnected(): boolean {
  return memberChangesChannel !== null
}

// Callback type for notification changes
type NotificationChangeCallback = (
  eventType: 'INSERT' | 'UPDATE',
  notification: {
    id: string
    type: string
    priority: string | null
    title: string
    message: string | null
    from_user_id: string | null
    to_user_id: string
    file_id: string | null
    is_read: boolean | null
    created_at: string | null
  }
) => void

/**
 * Subscribe to notification changes for a user
 * 
 * Updates are instant for:
 * - New notifications
 * - Notification read status changes
 * 
 * This enables urgent notification modal display.
 */
export function subscribeToNotifications(
  userId: string,
  onNotificationChange: NotificationChangeCallback
): () => void {
  // Unsubscribe from previous channel if exists
  if (notificationsChannel) {
    notificationsChannel.unsubscribe()
  }

  notificationsChannel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `to_user_id=eq.${userId}`
      },
      (payload) => {
        onNotificationChange('INSERT', payload.new as any)
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `to_user_id=eq.${userId}`
      },
      (payload) => {
        onNotificationChange('UPDATE', payload.new as any)
      }
    )
    .subscribe()

  // Return unsubscribe function
  return () => {
    if (notificationsChannel) {
      notificationsChannel.unsubscribe()
      notificationsChannel = null
    }
  }
}

/**
 * Check if notifications realtime is connected
 */
export function isNotificationsRealtimeConnected(): boolean {
  return notificationsChannel !== null
}

/**
 * Subscribe to permission-related changes for a user
 * 
 * Updates are instant for:
 * - vault_access: Individual user vault access grants/revocations
 * - team_vault_access: Team-level vault access changes
 * - team_members: User added/removed from teams
 * - user_permissions: Individual permission changes
 * - teams: Team created/renamed/deleted
 * - workflow_roles: User workflow role assignments
 * - job_titles: User job title assignments
 * 
 * This ensures users see access changes immediately without refreshing.
 * The callback is fired with the change type so the app can reload the appropriate data.
 */
export function subscribeToPermissions(
  userId: string,
  orgId: string,
  onPermissionChange: PermissionChangeCallback
): () => void {
  // Unsubscribe from previous channel if exists
  if (permissionsChannel) {
    permissionsChannel.unsubscribe()
  }

  // Create a single channel that listens to multiple tables
  // We use the org filter where available, and filter by user in the callback
  permissionsChannel = supabase
    .channel(`permissions:${userId}`)
    // Individual vault access changes for this user
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'vault_access',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        onPermissionChange('vault_access', eventType, userId)
      }
    )
    // Team vault access changes (affects user if they're in that team)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'team_vault_access'
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        onPermissionChange('team_vault_access', eventType)
      }
    )
    // Team membership changes for this user
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'team_members',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        onPermissionChange('team_members', eventType, userId)
      }
    )
    // Individual permission changes for this user
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_permissions',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        onPermissionChange('user_permissions', eventType, userId)
      }
    )
    // Workflow role assignment changes for this user
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_workflow_roles',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        onPermissionChange('workflow_roles', eventType, userId)
      }
    )
    // Job title assignment changes for this user
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_job_titles',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        onPermissionChange('job_titles', eventType, userId)
      }
    )
    // Also listen for user role changes (admin making someone engineer, etc)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`
      },
      (payload) => {
        const newUser = payload.new as { role?: string }
        const oldUser = payload.old as { role?: string }
        if (newUser?.role !== oldUser?.role) {
          onPermissionChange('user_permissions', 'UPDATE', userId)
        }
      }
    )
    // Team CRUD changes (team created/renamed/deleted)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'teams',
        filter: `org_id=eq.${orgId}`
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        onPermissionChange('teams', eventType)
      }
    )
    .subscribe()

  // Return unsubscribe function
  return () => {
    if (permissionsChannel) {
      permissionsChannel.unsubscribe()
      permissionsChannel = null
    }
  }
}

/**
 * Check if permissions realtime is connected
 */
export function isPermissionsRealtimeConnected(): boolean {
  return permissionsChannel !== null
}

/**
 * Unsubscribe from all realtime channels
 */
export function unsubscribeAll() {
  if (filesChannel) {
    filesChannel.unsubscribe()
    filesChannel = null
  }
  if (activityChannel) {
    activityChannel.unsubscribe()
    activityChannel = null
  }
  if (organizationChannel) {
    organizationChannel.unsubscribe()
    organizationChannel = null
  }
  if (colorSwatchesChannel) {
    colorSwatchesChannel.unsubscribe()
    colorSwatchesChannel = null
  }
  if (permissionsChannel) {
    permissionsChannel.unsubscribe()
    permissionsChannel = null
  }
  if (vaultsChannel) {
    vaultsChannel.unsubscribe()
    vaultsChannel = null
  }
  if (memberChangesChannel) {
    memberChangesChannel.unsubscribe()
    memberChangesChannel = null
  }
  if (notificationsChannel) {
    notificationsChannel.unsubscribe()
    notificationsChannel = null
  }
}

/**
 * Check if realtime is connected
 */
export function isRealtimeConnected(): boolean {
  return filesChannel !== null && activityChannel !== null
}

/**
 * Check if organization realtime is connected
 */
export function isOrgRealtimeConnected(): boolean {
  return organizationChannel !== null
}

/**
 * Check if vaults realtime is connected
 */
export function isVaultsRealtimeConnected(): boolean {
  return vaultsChannel !== null
}
