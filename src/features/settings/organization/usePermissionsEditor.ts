import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { withExtensionPermissionResources } from '@/lib/nativeExtensions/permissions'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { PermissionAction, PermissionPreset, Team } from '@/types/permissions'
import { ALL_RESOURCES } from '@/types/permissions'

interface Vault {
  id: string
  name: string
  slug: string
}

// Group resources by a custom category for better UX
const RESOURCE_GROUPS: {
  id: string
  name: string
  icon: string
  color: string
  resources: string[]
}[] = [
  {
    id: 'source-files',
    name: 'Source Files',
    icon: 'FolderTree',
    color: '#3b82f6',
    resources: [
      'module:explorer',
      'module:pending',
      'module:history',
      'module:workflows',
      'module:trash',
    ],
  },
  {
    id: 'items',
    name: 'Items & Products',
    icon: 'Package',
    color: '#8b5cf6',
    resources: ['module:items', 'system:item-designations', 'module:products'],
  },
  {
    id: 'change-control',
    name: 'Change Control',
    icon: 'GitBranch',
    color: '#f59e0b',
    resources: [
      'module:ecr',
      'module:eco',
      'module:reviews',
      'module:deviations',
      'module:release-schedule',
      'module:process',
    ],
  },
  {
    id: 'supply-chain',
    name: 'Supply Chain',
    icon: 'Truck',
    color: '#14b8a6',
    resources: ['module:supplier-database', 'module:supplier-portal'],
  },
  {
    id: 'system',
    name: 'System & Admin',
    icon: 'Settings',
    color: '#64748b',
    resources: [
      'module:google-drive',
      'module:terminal',
      'module:settings',
      'system:users',
      'system:teams',
      'system:permissions',
      'system:org-settings',
      'system:vaults',
      'system:backups',
      'system:webhooks',
      'system:workflows',
      'system:metadata',
      'system:integrations',
      'system:recovery-codes',
      'system:impersonation',
    ],
  },
]

/** State and data calls of the team permissions editor (PermissionsEditor). */
export function usePermissionsEditor(team: Team, userId: string | undefined, isAdmin: boolean) {
  const { addToast } = usePDMStore(useShallow((s) => ({ addToast: s.addToast })))

  // Resources contributed by the organization's installed native extensions are
  // listed in their own group next to core's.
  const orgNativeExtensionRows = usePDMStore((s) => s.orgNativeExtensionRows)
  const { allResources, resourceGroups } = useMemo(
    () =>
      withExtensionPermissionResources(
        ALL_RESOURCES,
        RESOURCE_GROUPS,
        orgNativeExtensionRows,
        t('nativeExtensions.permissionsGroup'),
      ),
    [orgNativeExtensionRows],
  )

  // State
  const [permissions, setPermissions] = useState<Record<string, PermissionAction[]>>({})
  const [originalPermissions, setOriginalPermissions] = useState<
    Record<string, PermissionAction[]>
  >({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(resourceGroups.map((g) => g.id)),
  )
  const [showPresets, setShowPresets] = useState(false)
  const [_presets, setPresets] = useState<PermissionPreset[]>([])

  // Vault scope state - only for source files
  const [vaults, setVaults] = useState<Vault[]>([])
  const [selectedSourceFilesVaultId, setSelectedSourceFilesVaultId] = useState<string | null>(null) // null = "All Vaults"
  const [sourceFilesPermsByVault, setSourceFilesPermsByVault] = useState<
    Record<string, Record<string, PermissionAction[]>>
  >({})
  const [originalSourceFilesPermsByVault, setOriginalSourceFilesPermsByVault] = useState<
    Record<string, Record<string, PermissionAction[]>>
  >({})
  const [_vaultsLoading, setVaultsLoading] = useState(true)

  // Source files resources
  const sourceFilesResources = [
    'module:explorer',
    'module:pending',
    'module:history',
    'module:workflows',
    'module:trash',
  ]

  // Load vaults for this org
  useEffect(() => {
    const loadVaults = async () => {
      try {
        const { data: orgData } = await supabase
          .from('team')
          .select('org_id')
          .eq('id', team.id)
          .single()

        if (!orgData) return

        const { data, error } = await supabase
          .from('vault')
          .select('id, name, slug')
          .eq('org_id', orgData.org_id)
          .order('name')

        if (error) throw error
        setVaults(data || [])
      } catch (error) {
        log.error('[PermissionsEditor]', 'Failed to load vaults', { error: error })
      } finally {
        setVaultsLoading(false)
      }
    }
    loadVaults()
  }, [team.id])

  // Load permissions when team changes
  useEffect(() => {
    loadPermissions()
    loadPresets()
  }, [team.id])

  // Track changes - check both global and source files permissions
  useEffect(() => {
    const globalChanged = JSON.stringify(permissions) !== JSON.stringify(originalPermissions)
    const sourceFilesChanged =
      JSON.stringify(sourceFilesPermsByVault) !== JSON.stringify(originalSourceFilesPermsByVault)
    setHasChanges(globalChanged || sourceFilesChanged)
  }, [permissions, originalPermissions, sourceFilesPermsByVault, originalSourceFilesPermsByVault])

  const loadPermissions = async () => {
    setIsLoading(true)
    try {
      // Load global permissions (vault_id IS NULL) for non-source-files resources
      const { data: globalData, error: globalError } = await supabase
        .from('team_permission')
        .select('*')
        .eq('team_id', team.id)
        .is('vault_id', null)

      if (globalError) throw globalError

      const globalPermsMap: Record<string, PermissionAction[]> = {}
      for (const perm of globalData || []) {
        // Only include non-source-files resources in global permissions
        if (!sourceFilesResources.includes(perm.resource)) {
          globalPermsMap[perm.resource] = perm.actions as PermissionAction[]
        }
      }

      setPermissions(globalPermsMap)
      setOriginalPermissions(globalPermsMap)

      // Load source files permissions per vault
      const { data: vaultPermsData, error: vaultError } = await supabase
        .from('team_permission')
        .select('*')
        .eq('team_id', team.id)
        .not('vault_id', 'is', null)

      if (vaultError) throw vaultError

      // Also load "All Vaults" source files permissions (vault_id IS NULL)
      const { data: allVaultsSourceFiles } = await supabase
        .from('team_permission')
        .select('*')
        .eq('team_id', team.id)
        .is('vault_id', null)
        .in('resource', sourceFilesResources)

      const vaultPermsMap: Record<string, Record<string, PermissionAction[]>> = {}

      // Initialize "all" vaults entry
      vaultPermsMap['all'] = {}
      for (const perm of allVaultsSourceFiles || []) {
        if (sourceFilesResources.includes(perm.resource)) {
          vaultPermsMap['all'][perm.resource] = perm.actions as PermissionAction[]
        }
      }

      // Group by vault_id
      for (const perm of vaultPermsData || []) {
        if (sourceFilesResources.includes(perm.resource) && perm.vault_id) {
          if (!vaultPermsMap[perm.vault_id]) {
            vaultPermsMap[perm.vault_id] = {}
          }
          vaultPermsMap[perm.vault_id][perm.resource] = perm.actions as PermissionAction[]
        }
      }

      setSourceFilesPermsByVault(vaultPermsMap)
      setOriginalSourceFilesPermsByVault(JSON.parse(JSON.stringify(vaultPermsMap)))
    } catch (error) {
      log.error('[PermissionsEditor]', 'Failed to load permissions', { error: error })
      addToast('error', 'Failed to load permissions')
    } finally {
      setIsLoading(false)
    }
  }

  const loadPresets = async () => {
    try {
      const { data: orgData } = await supabase
        .from('team')
        .select('org_id')
        .eq('id', team.id)
        .single()

      if (!orgData) return

      const { data, error } = await supabase
        .from('permission_preset')
        .select('*')
        .eq('org_id', orgData.org_id)
        .order('name')

      if (error) throw error
      // Map Supabase types to app types with defaults
      setPresets(
        (data || []).map((p) => ({
          id: p.id,
          org_id: p.org_id,
          name: p.name,
          description: p.description ?? null,
          color: p.color ?? '#64748b',
          icon: p.icon ?? 'Shield',
          permissions: (p.permissions as Record<string, PermissionAction[]>) ?? {},
          is_system: p.is_system ?? false,
          created_at: p.created_at ?? new Date().toISOString(),
          created_by: p.created_by ?? null,
          updated_at: p.updated_at ?? new Date().toISOString(),
          updated_by: p.updated_by ?? null,
        })),
      )
    } catch (error) {
      log.error('[PermissionsEditor]', 'Failed to load presets', { error: error })
    }
  }

  const savePermissions = async () => {
    if (!userId) return

    setIsSaving(true)
    try {
      // Delete all existing permissions for this team
      await supabase.from('team_permission').delete().eq('team_id', team.id)

      const allNewPerms: any[] = []

      // Add global permissions (non-source-files with vault_id = null)
      for (const [resource, actions] of Object.entries(permissions)) {
        if (actions.length > 0 && !sourceFilesResources.includes(resource)) {
          allNewPerms.push({
            team_id: team.id,
            resource,
            vault_id: null,
            actions,
            granted_by: userId,
          })
        }
      }

      // Add source files permissions per vault
      for (const [vaultKey, vaultPerms] of Object.entries(sourceFilesPermsByVault)) {
        const vaultId = vaultKey === 'all' ? null : vaultKey
        for (const [resource, actions] of Object.entries(vaultPerms)) {
          if (actions.length > 0 && sourceFilesResources.includes(resource)) {
            allNewPerms.push({
              team_id: team.id,
              resource,
              vault_id: vaultId,
              actions,
              granted_by: userId,
            })
          }
        }
      }

      if (allNewPerms.length > 0) {
        const { error } = await supabase.from('team_permission').insert(allNewPerms)

        if (error) throw error
      }

      setOriginalPermissions({ ...permissions })
      setOriginalSourceFilesPermsByVault(JSON.parse(JSON.stringify(sourceFilesPermsByVault)))
      setHasChanges(false)
      addToast('success', 'Permissions saved')
    } catch (error) {
      log.error('[PermissionsEditor]', 'Failed to save permissions', { error: error })
      addToast('error', 'Failed to save permissions')
    } finally {
      setIsSaving(false)
    }
  }

  // Get the current vault key for source files
  const getSourceFilesVaultKey = () => selectedSourceFilesVaultId || 'all'

  // Get permissions for a resource (handles source files vs others)
  const getResourcePermissions = (resourceId: string): PermissionAction[] => {
    if (sourceFilesResources.includes(resourceId)) {
      const vaultKey = getSourceFilesVaultKey()
      return sourceFilesPermsByVault[vaultKey]?.[resourceId] || []
    }
    return permissions[resourceId] || []
  }

  const toggleAction = (resourceId: string, action: PermissionAction) => {
    if (!isAdmin) return

    if (sourceFilesResources.includes(resourceId)) {
      // Handle source files - update vault-specific permissions
      const vaultKey = getSourceFilesVaultKey()
      setSourceFilesPermsByVault((prev) => {
        const vaultPerms = prev[vaultKey] || {}
        const current = vaultPerms[resourceId] || []
        const newActions = current.includes(action)
          ? current.filter((a) => a !== action)
          : [...current, action]
        return {
          ...prev,
          [vaultKey]: {
            ...vaultPerms,
            [resourceId]: newActions,
          },
        }
      })
    } else {
      // Handle non-source files - update global permissions
      setPermissions((prev) => {
        const current = prev[resourceId] || []
        if (current.includes(action)) {
          return { ...prev, [resourceId]: current.filter((a) => a !== action) }
        } else {
          return { ...prev, [resourceId]: [...current, action] }
        }
      })
    }
  }

  const toggleAllInGroup = (groupId: string, action: PermissionAction) => {
    if (!isAdmin) return

    const group = resourceGroups.find((g) => g.id === groupId)
    if (!group) return

    if (groupId === 'source-files') {
      // Handle source files group
      const vaultKey = getSourceFilesVaultKey()
      const allHave = group.resources.every((r) =>
        (sourceFilesPermsByVault[vaultKey]?.[r] || []).includes(action),
      )

      setSourceFilesPermsByVault((prev) => {
        const vaultPerms = prev[vaultKey] || {}
        const updated = { ...vaultPerms }
        for (const resourceId of group.resources) {
          const current = updated[resourceId] || []
          if (allHave) {
            updated[resourceId] = current.filter((a) => a !== action)
          } else if (!current.includes(action)) {
            updated[resourceId] = [...current, action]
          }
        }
        return { ...prev, [vaultKey]: updated }
      })
    } else {
      // Handle non-source files groups
      const allHave = group.resources.every((r) => (permissions[r] || []).includes(action))

      setPermissions((prev) => {
        const updated = { ...prev }
        for (const resourceId of group.resources) {
          const current = updated[resourceId] || []
          if (allHave) {
            updated[resourceId] = current.filter((a) => a !== action)
          } else if (!current.includes(action)) {
            updated[resourceId] = [...current, action]
          }
        }
        return updated
      })
    }
  }

  const setAllActions = (resourceId: string, actions: PermissionAction[]) => {
    if (!isAdmin) return

    if (sourceFilesResources.includes(resourceId)) {
      const vaultKey = getSourceFilesVaultKey()
      setSourceFilesPermsByVault((prev) => ({
        ...prev,
        [vaultKey]: {
          ...prev[vaultKey],
          [resourceId]: actions,
        },
      }))
    } else {
      setPermissions((prev) => ({ ...prev, [resourceId]: actions }))
    }
  }

  const applyPreset = (preset: PermissionPreset) => {
    if (!isAdmin) return
    // Split preset into source files and other permissions
    const globalPerms: Record<string, PermissionAction[]> = {}
    const sfPerms: Record<string, PermissionAction[]> = {}

    for (const [resource, actions] of Object.entries(preset.permissions)) {
      if (sourceFilesResources.includes(resource)) {
        sfPerms[resource] = actions
      } else {
        globalPerms[resource] = actions
      }
    }

    setPermissions(globalPerms)
    // Apply source files to "all" vault context
    setSourceFilesPermsByVault((prev) => ({ ...prev, all: sfPerms }))
    setShowPresets(false)
    addToast('success', `Applied "${preset.name}" preset`)
  }

  const resetToOriginal = () => {
    setPermissions({ ...originalPermissions })
    setSourceFilesPermsByVault(JSON.parse(JSON.stringify(originalSourceFilesPermsByVault)))
  }

  const clearAll = () => {
    if (!isAdmin) return
    setPermissions({})
    setSourceFilesPermsByVault({})
  }

  const grantAll = () => {
    if (!isAdmin) return
    const globalPerms: Record<string, PermissionAction[]> = {}
    const sfPerms: Record<string, PermissionAction[]> = {}

    for (const resource of allResources) {
      if (sourceFilesResources.includes(resource.id)) {
        sfPerms[resource.id] = [...resource.applicableActions]
      } else {
        globalPerms[resource.id] = [...resource.applicableActions]
      }
    }

    setPermissions(globalPerms)
    setSourceFilesPermsByVault({ all: sfPerms })
  }

  // Toggle a specific action across ALL resources (including source files for current vault context)
  const toggleAllForAction = (action: PermissionAction) => {
    if (!isAdmin) return

    // Get non-source-files resources
    const nonSfResources = allResources.filter((r) => !sourceFilesResources.includes(r.id))
    // Get source files resources
    const sfResources = allResources.filter((r) => sourceFilesResources.includes(r.id))
    const vaultKey = getSourceFilesVaultKey()

    // Check if all applicable resources have the action (both global and source files)
    const allNonSfHave = nonSfResources
      .filter((r) => r.applicableActions.includes(action))
      .every((r) => (permissions[r.id] || []).includes(action))
    const allSfHave = sfResources
      .filter((r) => r.applicableActions.includes(action))
      .every((r) => (sourceFilesPermsByVault[vaultKey]?.[r.id] || []).includes(action))
    const allHave = allNonSfHave && allSfHave

    // Update non-source-files permissions
    setPermissions((prev) => {
      const updated = { ...prev }
      for (const resource of nonSfResources) {
        if (!resource.applicableActions.includes(action)) continue
        const current = updated[resource.id] || []
        if (allHave) {
          updated[resource.id] = current.filter((a) => a !== action)
        } else if (!current.includes(action)) {
          updated[resource.id] = [...current, action]
        }
      }
      return updated
    })

    // Update source files permissions for current vault context
    setSourceFilesPermsByVault((prev) => {
      const vaultPerms = prev[vaultKey] || {}
      const updated = { ...vaultPerms }
      for (const resource of sfResources) {
        if (!resource.applicableActions.includes(action)) continue
        const current = updated[resource.id] || []
        if (allHave) {
          updated[resource.id] = current.filter((a) => a !== action)
        } else if (!current.includes(action)) {
          updated[resource.id] = [...current, action]
        }
      }
      return { ...prev, [vaultKey]: updated }
    })
  }

  // Check if all applicable resources have a specific action (including source files for current vault)
  const allHaveAction = (action: PermissionAction): boolean => {
    const vaultKey = getSourceFilesVaultKey()
    const nonSfResources = allResources.filter((r) => !sourceFilesResources.includes(r.id))
    const sfResources = allResources.filter((r) => sourceFilesResources.includes(r.id))

    const allNonSfHave = nonSfResources
      .filter((r) => r.applicableActions.includes(action))
      .every((r) => (permissions[r.id] || []).includes(action))
    const allSfHave = sfResources
      .filter((r) => r.applicableActions.includes(action))
      .every((r) => (sourceFilesPermsByVault[vaultKey]?.[r.id] || []).includes(action))

    return allNonSfHave && allSfHave
  }

  // Check if some (but not all) applicable resources have a specific action (including source files)
  const someHaveAction = (action: PermissionAction): boolean => {
    const vaultKey = getSourceFilesVaultKey()
    const nonSfResources = allResources.filter((r) => !sourceFilesResources.includes(r.id))
    const sfResources = allResources.filter((r) => sourceFilesResources.includes(r.id))

    const applicableNonSf = nonSfResources.filter((r) => r.applicableActions.includes(action))
    const applicableSf = sfResources.filter((r) => r.applicableActions.includes(action))

    const withActionNonSf = applicableNonSf.filter((r) =>
      (permissions[r.id] || []).includes(action),
    )
    const withActionSf = applicableSf.filter((r) =>
      (sourceFilesPermsByVault[vaultKey]?.[r.id] || []).includes(action),
    )

    const totalApplicable = applicableNonSf.length + applicableSf.length
    const totalWithAction = withActionNonSf.length + withActionSf.length

    return totalWithAction > 0 && totalWithAction < totalApplicable
  }

  // Filter resources by search
  const filterResources = (resources: string[]): string[] => {
    if (!searchQuery) return resources
    return resources.filter((resourceId) => {
      const resource = allResources.find((r) => r.id === resourceId)
      if (!resource) return false
      return (
        resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resource.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    })
  }

  // Count permissions in a group
  const getGroupStats = (groupId: string) => {
    const group = resourceGroups.find((g) => g.id === groupId)
    if (!group) return { total: 0, withPerms: 0 }

    let withPerms = 0
    for (const resourceId of group.resources) {
      if (getResourcePermissions(resourceId).length > 0) {
        withPerms++
      }
    }
    return { total: group.resources.length, withPerms }
  }

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  return {
    allResources,
    resourceGroups,
    permissions,
    isLoading,
    isSaving,
    hasChanges,
    searchQuery,
    setSearchQuery,
    expandedGroups,
    showPresets,
    setShowPresets,
    vaults,
    selectedSourceFilesVaultId,
    setSelectedSourceFilesVaultId,
    sourceFilesPermsByVault,
    savePermissions,
    getResourcePermissions,
    toggleAction,
    toggleAllInGroup,
    setAllActions,
    applyPreset,
    resetToOriginal,
    clearAll,
    grantAll,
    toggleAllForAction,
    allHaveAction,
    someHaveAction,
    filterResources,
    getGroupStats,
    toggleGroup,
  }
}
