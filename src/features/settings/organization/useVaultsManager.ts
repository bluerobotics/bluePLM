import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { VaultSyncStats } from '@/components/shared/Dialogs'
import { useTranslation } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { subscribeToVaults } from '@/lib/realtime'
import { getAccessibleVaults, supabase } from '@/lib/supabase'
import { calculateVaultSyncStats } from '@/lib/vaultHealthCheck'
import { connectWebVault } from '@/lib/webVault'
import { usePDMStore, type ConnectedVault } from '@/stores/pdmStore'

// Build vault path based on platform
function buildVaultPath(platform: string, vaultSlug: string): string {
  if (platform === 'darwin') {
    return `~/Documents/BluePLM/${vaultSlug}`
  } else if (platform === 'linux') {
    return `~/BluePLM/${vaultSlug}`
  } else {
    return `C:\\BluePLM\\${vaultSlug}`
  }
}

export interface Vault {
  id: string
  name: string
  slug: string
  description: string | null
  storage_bucket?: string // Only used when creating vaults, not needed for display
  is_default: boolean
  created_at: string
}

/**
 * State and actions of the Vaults settings page: the organization's vaults, creating, renaming,
 * connecting and the confirm dialogs. The page and its parts render from what this returns.
 */
export function useVaultsManager() {
  const { t } = useTranslation()
  const {
    user,
    organization,
    connectedVaults,
    activeVaultId,
    addConnectedVault,
    removeConnectedVault,
    updateConnectedVault,
    setFiles,
    setServerFiles,
    setFilesLoaded,
    setVaultPath,
    setVaultConnected,
    addToast,
    triggerVaultsRefresh,
    getEffectiveRole,
    setAutoDownloadCloudFiles,
    setAutoDownloadUpdates,
    autoDownloadSizeLimit,
    setAutoDownloadSizeLimit,
  } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      organization: s.organization,
      connectedVaults: s.connectedVaults,
      activeVaultId: s.activeVaultId,
      addConnectedVault: s.addConnectedVault,
      removeConnectedVault: s.removeConnectedVault,
      updateConnectedVault: s.updateConnectedVault,
      setFiles: s.setFiles,
      setServerFiles: s.setServerFiles,
      setFilesLoaded: s.setFilesLoaded,
      setVaultPath: s.setVaultPath,
      setVaultConnected: s.setVaultConnected,
      addToast: s.addToast,
      triggerVaultsRefresh: s.triggerVaultsRefresh,
      getEffectiveRole: s.getEffectiveRole,
      setAutoDownloadCloudFiles: s.setAutoDownloadCloudFiles,
      setAutoDownloadUpdates: s.setAutoDownloadUpdates,
      autoDownloadSizeLimit: s.autoDownloadSizeLimit,
      setAutoDownloadSizeLimit: s.setAutoDownloadSizeLimit,
    })),
  )

  const isAdmin = getEffectiveRole() === 'admin'

  const [platform, setPlatform] = useState<string>('win32')
  const [orgVaults, setOrgVaults] = useState<Vault[]>([])
  const [isLoadingVaults, setIsLoadingVaults] = useState(false)
  const [isCreatingVault, setIsCreatingVault] = useState(false)
  const [newVaultName, setNewVaultName] = useState('')
  const [newVaultDescription, setNewVaultDescription] = useState('')
  const [isSavingVault, setIsSavingVault] = useState(false)
  const [renamingVaultId, setRenamingVaultId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [connectingVaultId, setConnectingVaultId] = useState<string | null>(null)
  const [deletingVault, setDeletingVault] = useState<Vault | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteConfirmText2, setDeleteConfirmText2] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [disconnectingVault, setDisconnectingVault] = useState<{ id: string; name: string } | null>(
    null,
  )
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  // Wipe local files state
  const [wipingVault, setWipingVault] = useState<{
    id: string
    name: string
    localPath: string
  } | null>(null)
  const [isWiping, setIsWiping] = useState(false)

  // Vault setup dialog state
  const [setupVault, setSetupVault] = useState<Vault | null>(null)
  const [setupVaultPath, setSetupVaultPath] = useState<string | null>(null)
  const [setupVaultSyncStats, setSetupVaultSyncStats] = useState<VaultSyncStats | null>(null)

  // Clear vault state
  const [clearingVault, setClearingVault] = useState<Vault | null>(null)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [clearConfirmText2, setClearConfirmText2] = useState('')
  const [isClearing, setIsClearing] = useState(false)

  // Track if we're currently saving to avoid overwriting with stale realtime data
  const savingRef = useRef(false)

  // Get platform on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getPlatform().then(setPlatform)
    }
  }, [])

  // Load data on mount or when user changes
  useEffect(() => {
    if (organization && user) {
      loadOrgVaults()
    }
  }, [organization, user?.id])

  // Real-time subscription for vault changes from other admins
  useEffect(() => {
    if (!organization?.id) return

    const unsubscribe = subscribeToVaults(organization.id, (eventType, vault) => {
      // Skip if we initiated the change
      if (savingRef.current) return

      log.debug('[VaultsSettings]', 'Real-time vault change', { eventType, vaultName: vault?.name })
      loadOrgVaults()
    })

    return unsubscribe
  }, [organization?.id])

  const loadOrgVaults = async () => {
    if (!organization || !user) return

    setIsLoadingVaults(true)
    try {
      // Load vaults filtered by user's access permissions
      // Admins see all vaults, non-admins only see vaults they have access to
      const { vaults, error } = await getAccessibleVaults(
        user.id,
        organization.id,
        getEffectiveRole(),
      )

      if (error) {
        log.error('[VaultsSettings]', 'Failed to load org vaults', { error })
      } else {
        // Map Supabase nullables to app types with defaults
        setOrgVaults(
          (vaults || []).map((v) => ({
            ...v,
            description: v.description ?? null,
            is_default: v.is_default ?? false,
            created_at: v.created_at ?? new Date().toISOString(),
          })),
        )
      }
    } catch (error) {
      log.error('[VaultsSettings]', 'Failed to load org vaults', { error: error })
    } finally {
      setIsLoadingVaults(false)
    }
  }

  const createSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const handleCreateVault = async () => {
    if (!newVaultName.trim() || !organization || !user) return

    setIsSavingVault(true)
    savingRef.current = true

    const name = newVaultName.trim()
    const slug = createSlug(name)
    const storageBucket = `vault-${organization.slug}-${slug}`

    try {
      const { data: vault, error } = await supabase
        .from('vaults')
        .insert({
          org_id: organization.id,
          name,
          slug,
          description: newVaultDescription.trim() || null,
          storage_bucket: storageBucket,
          is_default: orgVaults.length === 0,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) {
        log.error('[VaultsSettings]', 'Failed to create vault', { error })
        addToast('error', t('vaultOperations.createFailed', { error: error.message }))
        return
      }

      addToast('success', t('vaultOperations.created', { name }))
      // Map Supabase nullables to app types with defaults
      const mappedVault: Vault = {
        ...vault,
        description: vault.description ?? null,
        is_default: vault.is_default ?? false,
        created_at: vault.created_at ?? new Date().toISOString(),
        storage_bucket: vault.storage_bucket ?? undefined,
      }
      setOrgVaults([...orgVaults, mappedVault])
      setIsCreatingVault(false)
      setNewVaultName('')
      setNewVaultDescription('')
      triggerVaultsRefresh()
    } catch (error) {
      log.error('[VaultsSettings]', 'Failed to create vault', { error: error })
      addToast('error', t('vaultOperations.createError'))
    } finally {
      setIsSavingVault(false)
      // Small delay before allowing realtime sync again to let the update propagate
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  const handleRenameVault = async (vault: Vault) => {
    if (!renameValue.trim() || renameValue === vault.name) {
      setRenamingVaultId(null)
      return
    }

    const newName = renameValue.trim()
    const newSlug = createSlug(newName)

    savingRef.current = true
    try {
      const { error } = await supabase
        .from('vaults')
        .update({ name: newName, slug: newSlug })
        .eq('id', vault.id)

      if (error) {
        addToast('error', t('vaultOperations.renameErrorDetails', { error: error.message }))
        return
      }

      const connectedVault = connectedVaults.find((v) => v.id === vault.id)
      if (connectedVault) {
        updateConnectedVault(vault.id, { name: newName })
      }

      setOrgVaults(
        orgVaults.map((v) => (v.id === vault.id ? { ...v, name: newName, slug: newSlug } : v)),
      )
      addToast('success', t('vaultOperations.renamed', { name: newName }))
      setRenamingVaultId(null)
    } catch (error) {
      log.error('[VaultsSettings]', 'Failed to rename vault', { error: error })
      addToast('error', t('vaultOperations.renameError'))
    } finally {
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  const handleSetDefaultVault = async (vaultId: string) => {
    if (!organization) return

    savingRef.current = true
    try {
      await supabase.from('vaults').update({ is_default: false }).eq('org_id', organization.id)

      const { error } = await supabase.from('vaults').update({ is_default: true }).eq('id', vaultId)

      if (error) {
        addToast('error', t('vaultOperations.defaultError'))
        return
      }

      setOrgVaults(
        orgVaults.map((v) => ({
          ...v,
          is_default: v.id === vaultId,
        })),
      )
      addToast('success', t('vaultOperations.defaultUpdated'))
    } catch (error) {
      log.error('[VaultsSettings]', 'Failed to set default vault', { error: error })
    } finally {
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  const handleDeleteVault = async () => {
    if (
      !deletingVault ||
      deleteConfirmText !== deletingVault.name ||
      deleteConfirmText2 !== deletingVault.name
    )
      return

    setIsDeleting(true)
    savingRef.current = true

    try {
      const connectedVault = connectedVaults.find((v) => v.id === deletingVault.id)
      if (connectedVault?.localPath) {
        const api = window.electronAPI
        if (api) {
          try {
            await api.deleteItem(connectedVault.localPath)
          } catch (error) {
            log.error('[VaultsSettings]', 'Failed to delete local folder during vault delete', {
              error: error,
            })
          }
        }
      }

      const { error } = await supabase.from('vaults').delete().eq('id', deletingVault.id)

      if (error) {
        addToast('error', t('vaultOperations.deleteErrorDetails', { error: error.message }))
        return
      }

      if (connectedVaults.some((v) => v.id === deletingVault.id)) {
        removeConnectedVault(deletingVault.id)
      }

      setOrgVaults(orgVaults.filter((v) => v.id !== deletingVault.id))
      addToast('success', t('vaultOperations.deleted', { name: deletingVault.name }))
      setDeletingVault(null)
      setDeleteConfirmText('')
      triggerVaultsRefresh()
    } catch (error) {
      log.error('[VaultsSettings]', 'Failed to delete vault', { error: error })
      addToast('error', t('vaultOperations.deleteError'))
    } finally {
      setIsDeleting(false)
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  const handleClearVault = async () => {
    if (
      !clearingVault ||
      clearConfirmText !== clearingVault.name ||
      clearConfirmText2 !== clearingVault.name ||
      !organization
    )
      return

    setIsClearing(true)
    savingRef.current = true

    try {
      // Delete all files from the vault in the database
      addToast('info', t('vaultOperations.clearingDb'))
      const { error: filesError } = await supabase
        .from('files')
        .delete()
        .eq('vault_id', clearingVault.id)

      if (filesError) {
        log.error('[VaultsSettings]', 'Failed to delete files during vault clear', {
          error: filesError,
        })
        addToast('error', t('vaultOperations.clearFilesError', { error: filesError.message }))
        return
      }

      // Clear local files if vault is connected
      const connectedVault = connectedVaults.find((v) => v.id === clearingVault.id)
      if (connectedVault?.localPath) {
        const api = window.electronAPI
        if (api) {
          try {
            addToast('info', t('vaultOperations.clearingLocal'))
            // Stop file watcher first to release file handles
            await api.clearWorkingDir()
            await new Promise((resolve) => setTimeout(resolve, 200))

            // List all items in the local folder
            const listResult = await api.listDirFiles(connectedVault.localPath)
            if (listResult.success && listResult.files && listResult.files.length > 0) {
              const totalItems = listResult.files.length
              let deletedCount = 0
              // Delete each item (files and folders)
              for (const file of listResult.files) {
                try {
                  await api.deleteItem(file.path)
                  deletedCount++
                } catch (error) {
                  log.error('[VaultsSettings]', 'Failed to delete local item', {
                    path: file.path,
                    error: error,
                  })
                }
              }
              addToast(
                'success',
                t('vaultOperations.localDeleted', { count: deletedCount, total: totalItems }),
              )
            } else {
              addToast('info', t('vaultOperations.noLocal'))
            }
          } catch (error) {
            log.error('[VaultsSettings]', 'Failed to clear local files', { error: error })
            addToast('warning', t('vaultOperations.clearLocalWarning'))
          }
        }
      }

      // Delete files from storage bucket
      try {
        addToast('info', t('vaultOperations.clearingCloud'))
        const { data: storageFiles } = await supabase.storage
          .from('vault')
          .list(`${organization.id}/${clearingVault.id}`)

        if (storageFiles && storageFiles.length > 0) {
          const filePaths = storageFiles.map(
            (f) => `${organization.id}/${clearingVault.id}/${f.name}`,
          )
          await supabase.storage.from('vault').remove(filePaths)
          addToast('success', t('vaultOperations.cloudDeleted', { count: storageFiles.length }))
        } else {
          addToast('info', t('vaultOperations.noCloud'))
        }
      } catch (error) {
        log.error('[VaultsSettings]', 'Failed to clear storage files', { error: error })
        addToast('warning', t('vaultOperations.clearCloudWarning'))
      }

      // Clear local state if this is the active vault
      if (clearingVault.id === activeVaultId) {
        setFiles([])
        setServerFiles([])
        // Set filesLoaded to true since the empty state is valid and loaded
        // (setting to false would cause infinite loading spinner)
        setFilesLoaded(true)
      }

      addToast('success', t('vaultOperations.cleared', { name: clearingVault.name }))
      setClearingVault(null)
      setClearConfirmText('')
      setClearConfirmText2('')
      triggerVaultsRefresh()
    } catch (error) {
      log.error('[VaultsSettings]', 'Failed to clear vault', { error: error })
      addToast('error', t('vaultOperations.clearError'))
    } finally {
      setIsClearing(false)
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  const handleConnectVault = async (vault: Vault) => {
    setConnectingVaultId(vault.id)

    try {
      const api = window.electronAPI
      if (!api) {
        // BluePLM Web: no folder and no setup wizard; the vault opens from the server.
        connectWebVault(vault)
        addToast('success', t('vaultOperations.connected', { name: vault.name }))
        return
      }

      const localPath = buildVaultPath(platform, vault.slug)
      const result = await api.createWorkingDir(localPath)

      if (result.success && result.path) {
        // Show setup dialog instead of directly connecting
        setSetupVault(vault)
        setSetupVaultPath(result.path)

        // Calculate sync stats in background (show loading initially)
        setSetupVaultSyncStats({
          serverFileCount: 0,
          serverTotalSize: 0,
          localFileCount: 0,
          syncedCount: 0,
          cloudOnlyCount: 0,
          localOnlyCount: 0,
          outdatedCount: 0,
          isLoading: true,
        })

        // Set working directory and calculate stats
        const orgId = organization?.id
        const vaultPath = result.path
        if (orgId && vaultPath) {
          api
            .setWorkingDir(vaultPath)
            .then(async () => {
              const stats = await calculateVaultSyncStats(vaultPath, vault.id, orgId)
              setSetupVaultSyncStats(stats)
            })
            .catch((error) => {
              log.warn('[VaultsSettings]', 'Failed to calculate sync stats', {
                error: String(error),
              })
              setSetupVaultSyncStats(null) // Fall back to basic stats
            })
        }
      } else {
        addToast('error', t('vaultOperations.folderError', { error: String(result.error) }))
      }
    } catch (error) {
      log.error('[VaultsSettings]', 'Failed to connect vault', { error: error })
      addToast('error', t('vaultOperations.connectError'))
    } finally {
      setConnectingVaultId(null)
    }
  }

  const handleVaultSetupComplete = (preferences: {
    autoDownloadCloudFiles: boolean
    autoDownloadUpdates: boolean
    autoDownloadSizeLimit: number
  }) => {
    if (!setupVault || !setupVaultPath) return

    log.info('[VaultsSettings]', 'Vault setup complete', {
      vaultName: setupVault.name,
      preferences,
    })

    // Apply auto-download preferences
    setAutoDownloadCloudFiles(preferences.autoDownloadCloudFiles)
    setAutoDownloadUpdates(preferences.autoDownloadUpdates)
    setAutoDownloadSizeLimit(preferences.autoDownloadSizeLimit)

    // Add vault with hasCompletedSetup flag
    const connectedVault: ConnectedVault = {
      id: setupVault.id,
      name: setupVault.name,
      localPath: setupVaultPath,
      isExpanded: true,
      hasCompletedSetup: true,
    }
    addConnectedVault(connectedVault)
    setVaultPath(setupVaultPath)
    setVaultConnected(true)

    addToast('success', t('vaultOperations.connected', { name: setupVault.name }))

    // Clear setup state
    setSetupVault(null)
    setSetupVaultPath(null)
    setSetupVaultSyncStats(null)
  }

  const handleVaultSetupCancel = () => {
    log.info('[VaultsSettings]', 'Vault setup cancelled', { vaultName: setupVault?.name })
    setSetupVault(null)
    setSetupVaultPath(null)
    setSetupVaultSyncStats(null)
  }

  const handleDisconnectVault = (vaultId: string) => {
    const vault = connectedVaults.find((v) => v.id === vaultId)
    if (vault) {
      setDisconnectingVault({ id: vault.id, name: vault.name })
    }
  }

  const confirmDisconnect = async () => {
    if (!disconnectingVault) return

    setIsDisconnecting(true)

    // Stop file watcher if this is the active vault
    if (disconnectingVault.id === activeVaultId) {
      const api = window.electronAPI
      if (api) {
        try {
          await api.clearWorkingDir()
        } catch (error) {
          log.error('[VaultsSettings]', 'Failed to clear working dir during disconnect', {
            error: error,
          })
        }
      }

      setFiles([])
      setServerFiles([])
      setFilesLoaded(false)
      setVaultPath(null)
      setVaultConnected(false)
    }

    removeConnectedVault(disconnectingVault.id)
    setDisconnectingVault(null)
    setIsDisconnecting(false)

    addToast('success', t('vaultOperations.disconnected'))
  }

  const handleWipeLocalFiles = async () => {
    if (!wipingVault) return

    setIsWiping(true)

    try {
      const api = window.electronAPI
      if (!api) {
        addToast('error', t('vaultOperations.electronUnavailable'))
        return
      }

      // Stop file watcher if this is the active vault
      if (wipingVault.id === activeVaultId) {
        await api.clearWorkingDir()
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      // List all items in the local folder
      const listResult = await api.listDirFiles(wipingVault.localPath)
      if (listResult.success && listResult.files && listResult.files.length > 0) {
        const totalItems = listResult.files.length
        let deletedCount = 0

        // Delete each item (files and folders)
        for (const file of listResult.files) {
          try {
            await api.deleteItem(file.path)
            deletedCount++
          } catch (error) {
            log.error('[VaultsSettings]', 'Failed to delete local item', {
              path: file.path,
              error: error,
            })
          }
        }

        addToast(
          'success',
          t('vaultOperations.localDeleted', { count: deletedCount, total: totalItems }),
        )
      } else {
        addToast('info', t('vaultOperations.noLocal'))
      }

      // Clear local state if this is the active vault
      if (wipingVault.id === activeVaultId) {
        setFiles([])
        setServerFiles([])
        setFilesLoaded(true) // Set to true since empty state is valid
      }
    } catch (error) {
      log.error('[VaultsSettings]', 'Failed to wipe local files', { error: error })
      addToast('error', t('vaultOperations.wipeError'))
    } finally {
      setWipingVault(null)
      setIsWiping(false)
    }
  }

  const isVaultConnected = (vaultId: string) => {
    return connectedVaults.some((v) => v.id === vaultId)
  }

  const cancelCreateVault = () => {
    setIsCreatingVault(false)
    setNewVaultName('')
    setNewVaultDescription('')
  }

  const startRename = (vault: Vault) => {
    setRenameValue(vault.name)
    setRenamingVaultId(vault.id)
  }

  const startClear = (vault: Vault) => {
    setClearingVault(vault)
    setClearConfirmText('')
    setClearConfirmText2('')
  }

  const cancelClear = () => {
    setClearingVault(null)
    setClearConfirmText('')
    setClearConfirmText2('')
  }

  const startDelete = (vault: Vault) => {
    setDeletingVault(vault)
    setDeleteConfirmText('')
    setDeleteConfirmText2('')
  }

  const cancelDelete = () => {
    setDeletingVault(null)
    setDeleteConfirmText('')
    setDeleteConfirmText2('')
  }

  const startWipe = (vault: Vault) => {
    const cv = connectedVaults.find((v) => v.id === vault.id)
    if (cv?.localPath) {
      setWipingVault({
        id: vault.id,
        name: vault.name,
        localPath: cv.localPath,
      })
    }
  }

  const localPathOf = (vaultId: string) => connectedVaults.find((v) => v.id === vaultId)?.localPath

  return {
    organization,
    connectedVaults,
    isAdmin,
    autoDownloadSizeLimit,
    orgVaults,
    isLoadingVaults,
    loadOrgVaults,
    // Create
    isCreatingVault,
    setIsCreatingVault,
    newVaultName,
    setNewVaultName,
    newVaultDescription,
    setNewVaultDescription,
    isSavingVault,
    handleCreateVault,
    cancelCreateVault,
    // Rename and default
    renamingVaultId,
    setRenamingVaultId,
    renameValue,
    setRenameValue,
    startRename,
    handleRenameVault,
    handleSetDefaultVault,
    // Connect
    connectingVaultId,
    handleConnectVault,
    isVaultConnected,
    localPathOf,
    setupVault,
    setupVaultPath,
    setupVaultSyncStats,
    handleVaultSetupComplete,
    handleVaultSetupCancel,
    // Disconnect
    disconnectingVault,
    setDisconnectingVault,
    isDisconnecting,
    handleDisconnectVault,
    confirmDisconnect,
    // Wipe local
    wipingVault,
    setWipingVault,
    isWiping,
    startWipe,
    handleWipeLocalFiles,
    // Clear contents
    clearingVault,
    clearConfirmText,
    setClearConfirmText,
    clearConfirmText2,
    setClearConfirmText2,
    isClearing,
    startClear,
    cancelClear,
    handleClearVault,
    // Delete
    deletingVault,
    deleteConfirmText,
    setDeleteConfirmText,
    deleteConfirmText2,
    setDeleteConfirmText2,
    isDeleting,
    startDelete,
    cancelDelete,
    handleDeleteVault,
  }
}

export type VaultsManager = ReturnType<typeof useVaultsManager>
