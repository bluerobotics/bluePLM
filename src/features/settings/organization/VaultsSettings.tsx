import { useState, useEffect, useRef } from 'react'
import { 
  Folder, 
  FolderOpen,
  Trash2, 
  Star, 
  Pencil, 
  Check, 
  X,
  Link,
  Unlink,
  Plus,
  Loader2,
  AlertTriangle,
  FolderX,
  RefreshCw,
  Eraser,
  CloudDownload,
  Download,
  Scale,
  ToggleLeft,
  ToggleRight,
  Upload
} from 'lucide-react'
import { usePDMStore, ConnectedVault } from '@/stores/pdmStore'
import { supabase, getAccessibleVaults } from '@/lib/supabase'
import { subscribeToVaults } from '@/lib/realtime'
import { log } from '@/lib/logger'
import { VaultSetupDialog, type VaultSyncStats } from '@/components/shared/Dialogs'
import { calculateVaultSyncStats } from '@/lib/vaultHealthCheck'

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

interface Vault {
  id: string
  name: string
  slug: string
  description: string | null
  storage_bucket?: string  // Only used when creating vaults, not needed for display
  is_default: boolean
  created_at: string
}

export function VaultsSettings() {
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
    autoDownloadCloudFiles,
    setAutoDownloadCloudFiles,
    autoDownloadUpdates,
    setAutoDownloadUpdates,
    autoDownloadSizeLimit,
    setAutoDownloadSizeLimit,
    uploadSizeWarningEnabled,
    setUploadSizeWarningEnabled,
    uploadSizeWarningThreshold,
    setUploadSizeWarningThreshold
  } = usePDMStore()
  
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
  const [disconnectingVault, setDisconnectingVault] = useState<{ id: string; name: string } | null>(null)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  
  // Wipe local files state
  const [wipingVault, setWipingVault] = useState<{ id: string; name: string; localPath: string } | null>(null)
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
        getEffectiveRole()
      )
      
      if (error) {
        log.error('[VaultsSettings]', 'Failed to load org vaults', { error })
      } else {
        // Map Supabase nullables to app types with defaults
        setOrgVaults((vaults || []).map(v => ({
          ...v,
          description: v.description ?? null,
          is_default: v.is_default ?? false,
          created_at: v.created_at ?? new Date().toISOString()
        })))
      }
    } catch (err) {
      log.error('[VaultsSettings]', 'Failed to load org vaults', { error: err })
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
          created_by: user.id
        })
        .select()
        .single()
      
      if (error) {
        log.error('[VaultsSettings]', 'Failed to create vault', { error })
        addToast('error', `Failed to create vault: ${error.message}`)
        return
      }
      
      addToast('success', `Vault "${name}" created`)
      // Map Supabase nullables to app types with defaults
      const mappedVault: Vault = {
        ...vault,
        description: vault.description ?? null,
        is_default: vault.is_default ?? false,
        created_at: vault.created_at ?? new Date().toISOString(),
        storage_bucket: vault.storage_bucket ?? undefined
      }
      setOrgVaults([...orgVaults, mappedVault])
      setIsCreatingVault(false)
      setNewVaultName('')
      setNewVaultDescription('')
      triggerVaultsRefresh()
    } catch (err) {
      log.error('[VaultsSettings]', 'Failed to create vault', { error: err })
      addToast('error', 'Failed to create vault')
    } finally {
      setIsSavingVault(false)
      // Small delay before allowing realtime sync again to let the update propagate
      setTimeout(() => { savingRef.current = false }, 1000)
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
        addToast('error', `Failed to rename vault: ${error.message}`)
        return
      }
      
      const connectedVault = connectedVaults.find(v => v.id === vault.id)
      if (connectedVault) {
        updateConnectedVault(vault.id, { name: newName })
      }
      
      setOrgVaults(orgVaults.map(v => 
        v.id === vault.id ? { ...v, name: newName, slug: newSlug } : v
      ))
      addToast('success', `Vault renamed to "${newName}"`)
      setRenamingVaultId(null)
    } catch (err) {
      log.error('[VaultsSettings]', 'Failed to rename vault', { error: err })
      addToast('error', 'Failed to rename vault')
    } finally {
      setTimeout(() => { savingRef.current = false }, 1000)
    }
  }
  
  const handleSetDefaultVault = async (vaultId: string) => {
    if (!organization) return
    
    savingRef.current = true
    try {
      await supabase
        .from('vaults')
        .update({ is_default: false })
        .eq('org_id', organization.id)
      
      const { error } = await supabase
        .from('vaults')
        .update({ is_default: true })
        .eq('id', vaultId)
      
      if (error) {
        addToast('error', 'Failed to set default vault')
        return
      }
      
      setOrgVaults(orgVaults.map(v => ({
        ...v,
        is_default: v.id === vaultId
      })))
      addToast('success', 'Default vault updated')
    } catch (err) {
      log.error('[VaultsSettings]', 'Failed to set default vault', { error: err })
    } finally {
      setTimeout(() => { savingRef.current = false }, 1000)
    }
  }
  
  const handleDeleteVault = async () => {
    if (!deletingVault || deleteConfirmText !== deletingVault.name || deleteConfirmText2 !== deletingVault.name) return
    
    setIsDeleting(true)
    savingRef.current = true
    
    try {
      const connectedVault = connectedVaults.find(v => v.id === deletingVault.id)
      if (connectedVault?.localPath) {
        const api = window.electronAPI
        if (api) {
          try {
            await api.deleteItem(connectedVault.localPath)
          } catch (err) {
            log.error('[VaultsSettings]', 'Failed to delete local folder during vault delete', { error: err })
          }
        }
      }
      
      const { error } = await supabase
        .from('vaults')
        .delete()
        .eq('id', deletingVault.id)
      
      if (error) {
        addToast('error', `Failed to delete vault: ${error.message}`)
        return
      }
      
      if (connectedVaults.some(v => v.id === deletingVault.id)) {
        removeConnectedVault(deletingVault.id)
      }
      
      setOrgVaults(orgVaults.filter(v => v.id !== deletingVault.id))
      addToast('success', `Vault "${deletingVault.name}" permanently deleted`)
      setDeletingVault(null)
      setDeleteConfirmText('')
      triggerVaultsRefresh()
    } catch (err) {
      log.error('[VaultsSettings]', 'Failed to delete vault', { error: err })
      addToast('error', 'Failed to delete vault')
    } finally {
      setIsDeleting(false)
      setTimeout(() => { savingRef.current = false }, 1000)
    }
  }
  
  const handleClearVault = async () => {
    if (!clearingVault || clearConfirmText !== clearingVault.name || clearConfirmText2 !== clearingVault.name || !organization) return
    
    setIsClearing(true)
    savingRef.current = true
    
    try {
      // Delete all files from the vault in the database
      addToast('info', 'Clearing database records...')
      const { error: filesError } = await supabase
        .from('files')
        .delete()
        .eq('vault_id', clearingVault.id)
      
      if (filesError) {
        log.error('[VaultsSettings]', 'Failed to delete files during vault clear', { error: filesError })
        addToast('error', `Failed to clear vault files: ${filesError.message}`)
        return
      }
      
      // Clear local files if vault is connected
      const connectedVault = connectedVaults.find(v => v.id === clearingVault.id)
      if (connectedVault?.localPath) {
        const api = window.electronAPI
        if (api) {
          try {
            addToast('info', 'Clearing local files...')
            // Stop file watcher first to release file handles
            await api.clearWorkingDir()
            await new Promise(resolve => setTimeout(resolve, 200))
            
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
                } catch (err) {
                  log.error('[VaultsSettings]', 'Failed to delete local item', { path: file.path, error: err })
                }
              }
              addToast('success', `Deleted ${deletedCount} of ${totalItems} local items`)
            } else {
              addToast('info', 'No local files to delete')
            }
          } catch (err) {
            log.error('[VaultsSettings]', 'Failed to clear local files', { error: err })
            addToast('warning', 'Could not clear some local files')
          }
        }
      }
      
      // Delete files from storage bucket
      try {
        addToast('info', 'Clearing cloud storage...')
        const { data: storageFiles } = await supabase.storage
          .from('vault')
          .list(`${organization.id}/${clearingVault.id}`)
        
        if (storageFiles && storageFiles.length > 0) {
          const filePaths = storageFiles.map(f => `${organization.id}/${clearingVault.id}/${f.name}`)
          await supabase.storage.from('vault').remove(filePaths)
          addToast('success', `Deleted ${storageFiles.length} files from cloud storage`)
        } else {
          addToast('info', 'No cloud storage files to delete')
        }
      } catch (err) {
        log.error('[VaultsSettings]', 'Failed to clear storage files', { error: err })
        addToast('warning', 'Could not clear cloud storage files')
      }
      
      // Clear local state if this is the active vault
      if (clearingVault.id === activeVaultId) {
        setFiles([])
        setServerFiles([])
        // Set filesLoaded to true since the empty state is valid and loaded
        // (setting to false would cause infinite loading spinner)
        setFilesLoaded(true)
      }
      
      addToast('success', `Vault "${clearingVault.name}" cleared successfully`)
      setClearingVault(null)
      setClearConfirmText('')
      setClearConfirmText2('')
      triggerVaultsRefresh()
    } catch (err) {
      log.error('[VaultsSettings]', 'Failed to clear vault', { error: err })
      addToast('error', 'Failed to clear vault')
    } finally {
      setIsClearing(false)
      setTimeout(() => { savingRef.current = false }, 1000)
    }
  }
  
  const handleConnectVault = async (vault: Vault) => {
    setConnectingVaultId(vault.id)
    
    try {
      const api = window.electronAPI
      if (!api) {
        addToast('error', 'Electron API not available')
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
          serverFileCount: 0, serverTotalSize: 0, localFileCount: 0, 
          syncedCount: 0, cloudOnlyCount: 0, localOnlyCount: 0, outdatedCount: 0,
          isLoading: true 
        })
        
        // Set working directory and calculate stats
        const orgId = organization?.id
        const vaultPath = result.path
        if (orgId && vaultPath) {
          api.setWorkingDir(vaultPath).then(async () => {
            const stats = await calculateVaultSyncStats(vaultPath, vault.id, orgId)
            setSetupVaultSyncStats(stats)
          }).catch(err => {
            log.warn('[VaultsSettings]', 'Failed to calculate sync stats', { error: String(err) })
            setSetupVaultSyncStats(null) // Fall back to basic stats
          })
        }
      } else {
        addToast('error', `Failed to create vault folder: ${result.error}`)
      }
    } catch (err) {
      log.error('[VaultsSettings]', 'Failed to connect vault', { error: err })
      addToast('error', 'Failed to connect vault')
    } finally {
      setConnectingVaultId(null)
    }
  }
  
  const handleVaultSetupComplete = (preferences: { autoDownloadCloudFiles: boolean; autoDownloadUpdates: boolean; autoDownloadSizeLimit: number }) => {
    if (!setupVault || !setupVaultPath) return
    
    log.info('[VaultsSettings]', 'Vault setup complete', { 
      vaultName: setupVault.name, 
      preferences 
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
      hasCompletedSetup: true
    }
    addConnectedVault(connectedVault)
    setVaultPath(setupVaultPath)
    setVaultConnected(true)
    
    addToast('success', `Connected to "${setupVault.name}"`)
    
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
    const vault = connectedVaults.find(v => v.id === vaultId)
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
        } catch (err) {
          log.error('[VaultsSettings]', 'Failed to clear working dir during disconnect', { error: err })
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
    
    addToast('success', 'Vault disconnected (local files preserved)')
  }
  
  const handleWipeLocalFiles = async () => {
    if (!wipingVault) return
    
    setIsWiping(true)
    
    try {
      const api = window.electronAPI
      if (!api) {
        addToast('error', 'Electron API not available')
        return
      }
      
      // Stop file watcher if this is the active vault
      if (wipingVault.id === activeVaultId) {
        await api.clearWorkingDir()
        await new Promise(resolve => setTimeout(resolve, 200))
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
          } catch (err) {
            log.error('[VaultsSettings]', 'Failed to delete local item', { path: file.path, error: err })
          }
        }
        
        addToast('success', `Deleted ${deletedCount} of ${totalItems} local items`)
      } else {
        addToast('info', 'No local files to delete')
      }
      
      // Clear local state if this is the active vault
      if (wipingVault.id === activeVaultId) {
        setFiles([])
        setServerFiles([])
        setFilesLoaded(true)  // Set to true since empty state is valid
      }
      
    } catch (err) {
      log.error('[VaultsSettings]', 'Failed to wipe local files', { error: err })
      addToast('error', 'Failed to wipe local files')
    } finally {
      setWipingVault(null)
      setIsWiping(false)
    }
  }
  
  const isVaultConnected = (vaultId: string) => {
    return connectedVaults.some(v => v.id === vaultId)
  }

  if (!organization) {
    return (
      <div className="text-center py-12 text-plm-fg-muted text-base">
        No organization connected
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-plm-fg">Vaults</h2>
          <p className="text-sm text-plm-fg-muted mt-1">
            Manage vaults in your organization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadOrgVaults}
            disabled={isLoadingVaults}
            className="btn btn-ghost btn-sm flex items-center gap-1"
            title="Refresh vaults"
          >
            <RefreshCw size={14} className={isLoadingVaults ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button
              onClick={() => setIsCreatingVault(true)}
              className="btn btn-primary btn-sm flex items-center gap-1"
            >
              <Plus size={14} />
              Add Vault
            </button>
          )}
        </div>
      </div>
      
      {/* Create vault form */}
      {isCreatingVault && (
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-accent space-y-3">
          <div className="space-y-2">
            <label className="text-sm text-plm-fg-muted">Vault Name</label>
            <input
              type="text"
              value={newVaultName}
              onChange={(e) => setNewVaultName(e.target.value)}
              placeholder="e.g., Main Vault, Archive, Projects"
              className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-3 py-2 text-base focus:border-plm-accent focus:outline-none"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-plm-fg-muted">Description (optional)</label>
            <input
              type="text"
              value={newVaultDescription}
              onChange={(e) => setNewVaultDescription(e.target.value)}
              placeholder="e.g., Main production files"
              className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-3 py-2 text-base focus:border-plm-accent focus:outline-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setIsCreatingVault(false)
                setNewVaultName('')
                setNewVaultDescription('')
              }}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateVault}
              disabled={!newVaultName.trim() || isSavingVault}
              className="btn btn-primary btn-sm"
            >
              {isSavingVault ? 'Creating...' : 'Create Vault'}
            </button>
          </div>
        </div>
      )}
      
      {/* Vaults list */}
      {isLoadingVaults ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-plm-fg-muted" size={24} />
        </div>
      ) : orgVaults.length === 0 ? (
        <div className="text-center py-8 text-plm-fg-muted text-base">
          {isAdmin 
            ? 'No vaults created yet. Add a vault to get started.'
            : 'No vaults created yet. Ask an organization admin to create one.'}
        </div>
      ) : (
        <div className="space-y-2">
          {orgVaults.map(vault => (
            <div 
              key={vault.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-plm-bg border border-plm-border hover:border-plm-border-light transition-colors"
            >
              <Folder size={18} className={vault.is_default ? 'text-plm-accent' : 'text-plm-fg-muted'} />
              <div className="flex-1 min-w-0">
                {renamingVaultId === vault.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameVault(vault)
                        if (e.key === 'Escape') setRenamingVaultId(null)
                      }}
                      className="flex-1 bg-plm-bg-light border border-plm-border rounded px-2 py-1 text-base focus:border-plm-accent focus:outline-none"
                      autoFocus
                    />
                    <button onClick={() => handleRenameVault(vault)} className="p-1 hover:bg-plm-highlight rounded">
                      <Check size={14} className="text-plm-success" />
                    </button>
                    <button onClick={() => setRenamingVaultId(null)} className="p-1 hover:bg-plm-highlight rounded">
                      <X size={14} className="text-plm-fg-muted" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-base text-plm-fg font-medium truncate">
                        {vault.name}
                      </span>
                      {vault.is_default && (
                        <span className="px-1.5 py-0.5 bg-plm-accent/20 text-plm-accent text-sm rounded">
                          Default
                        </span>
                      )}
                      {isVaultConnected(vault.id) && (
                        <span className="px-1.5 py-0.5 bg-plm-success/20 text-plm-success text-sm rounded">
                          Connected
                        </span>
                      )}
                    </div>
                    {vault.description && (
                      <div className="text-sm text-plm-fg-muted truncate">
                        {vault.description}
                      </div>
                    )}
                  </>
                )}
              </div>
              {renamingVaultId !== vault.id && (
                <div className="flex items-center gap-2">
                  {/* Show in folder button (only for connected vaults) */}
                  {isVaultConnected(vault.id) && (
                    <button
                      onClick={() => {
                        const connectedVault = connectedVaults.find(v => v.id === vault.id)
                        if (connectedVault?.localPath) {
                          window.electronAPI?.showInExplorer(connectedVault.localPath)
                        }
                      }}
                      className="p-1.5 hover:bg-plm-highlight rounded transition-colors"
                      title="Show in folder"
                    >
                      <FolderOpen size={14} className="text-plm-fg-muted" />
                    </button>
                  )}
                  
                  {/* Connect/Disconnect button */}
                  {isVaultConnected(vault.id) ? (
                    <>
                      <button
                        onClick={() => handleDisconnectVault(vault.id)}
                        className="btn btn-ghost btn-sm flex items-center gap-1 text-plm-warning"
                        title="Disconnect vault"
                      >
                        <Unlink size={14} />
                        Disconnect
                      </button>
                      <button
                        onClick={() => {
                          const cv = connectedVaults.find(v => v.id === vault.id)
                          if (cv?.localPath) {
                            setWipingVault({ id: vault.id, name: vault.name, localPath: cv.localPath })
                          }
                        }}
                        className="btn btn-ghost btn-sm flex items-center gap-1 text-plm-error"
                        title="Wipe local files"
                      >
                        <Eraser size={14} />
                        Wipe Local
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleConnectVault(vault)}
                      disabled={connectingVaultId === vault.id}
                      className="btn btn-primary btn-sm flex items-center gap-1"
                    >
                      {connectingVaultId === vault.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Link size={14} />
                      )}
                      Connect
                    </button>
                  )}
                  
                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 border-l border-plm-border pl-2">
                      <button
                        onClick={() => {
                          setRenameValue(vault.name)
                          setRenamingVaultId(vault.id)
                        }}
                        className="p-1.5 hover:bg-plm-highlight rounded transition-colors"
                        title="Rename vault"
                      >
                        <Pencil size={14} className="text-plm-fg-muted" />
                      </button>
                      {!vault.is_default && (
                        <button
                          onClick={() => handleSetDefaultVault(vault.id)}
                          className="p-1.5 hover:bg-plm-highlight rounded transition-colors"
                          title="Set as default"
                        >
                          <Star size={14} className="text-plm-fg-muted" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setClearingVault(vault)
                          setClearConfirmText('')
                          setClearConfirmText2('')
                        }}
                        className="p-1.5 hover:bg-plm-warning/20 rounded transition-colors"
                        title="Clear vault contents"
                      >
                        <FolderX size={14} className="text-plm-warning" />
                      </button>
                      <button
                        onClick={() => {
                          setDeletingVault(vault)
                          setDeleteConfirmText('')
                          setDeleteConfirmText2('')
                        }}
                        className="p-1.5 hover:bg-plm-error/20 rounded transition-colors"
                        title="Delete vault"
                      >
                        <Trash2 size={14} className="text-plm-error" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Auto-Download Settings */}
      {connectedVaults.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
            Auto-Download Settings
          </h3>
          <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
            {/* Auto-download cloud files */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-plm-highlight">
                  <CloudDownload size={18} className="text-plm-fg-muted" />
                </div>
                <div>
                  <div className="text-base text-plm-fg">Auto-download cloud files</div>
                  <div className="text-sm text-plm-fg-muted mt-0.5">
                    Automatically download files that exist on the server but not on your computer
                  </div>
                </div>
              </div>
              <button
                onClick={() => setAutoDownloadCloudFiles(!autoDownloadCloudFiles)}
                className="text-plm-accent"
              >
                {autoDownloadCloudFiles ? (
                  <ToggleRight size={28} />
                ) : (
                  <ToggleLeft size={28} className="text-plm-fg-muted" />
                )}
              </button>
            </div>
            
            {/* Auto-download updates */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-plm-highlight">
                  <Download size={18} className="text-plm-fg-muted" />
                </div>
                <div>
                  <div className="text-base text-plm-fg">Auto-download file updates</div>
                  <div className="text-sm text-plm-fg-muted mt-0.5">
                    Automatically download newer versions when files are updated on the server
                  </div>
                </div>
              </div>
              <button
                onClick={() => setAutoDownloadUpdates(!autoDownloadUpdates)}
                className="text-plm-accent"
              >
                {autoDownloadUpdates ? (
                  <ToggleRight size={28} />
                ) : (
                  <ToggleLeft size={28} className="text-plm-fg-muted" />
                )}
              </button>
            </div>
            
            {/* Size limit for auto-downloads */}
            {(autoDownloadCloudFiles || autoDownloadUpdates) && (
              <div className="pt-3 border-t border-plm-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-plm-highlight">
                      <Scale size={18} className="text-plm-fg-muted" />
                    </div>
                    <div>
                      <div className="text-base text-plm-fg">Skip large files</div>
                      <div className="text-sm text-plm-fg-muted mt-0.5">
                        Avoid auto-downloading files larger than a specified size
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setAutoDownloadSizeLimit(autoDownloadSizeLimit > 0 ? 0 : 1024)}
                    className="text-plm-accent"
                  >
                    {autoDownloadSizeLimit > 0 ? (
                      <ToggleRight size={28} />
                    ) : (
                      <ToggleLeft size={28} className="text-plm-fg-muted" />
                    )}
                  </button>
                </div>
                
                {autoDownloadSizeLimit > 0 && (
                  <div className="flex items-center gap-2 mt-3 ml-11">
                    <span className="text-sm text-plm-fg-muted">
                      Max file size:
                    </span>
                    <input
                      type="number"
                      value={autoDownloadSizeLimit}
                      onChange={(e) => setAutoDownloadSizeLimit(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      className="w-24 px-2 py-1.5 text-sm bg-plm-bg-secondary border border-plm-border rounded-lg focus:border-plm-accent focus:outline-none text-plm-fg"
                    />
                    <span className="text-sm text-plm-fg-muted">MB</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Warning Settings */}
      {connectedVaults.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
            Upload Warnings
          </h3>
          <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
            {/* Warn on large file upload */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-plm-highlight">
                  <Upload size={18} className="text-plm-fg-muted" />
                </div>
                <div>
                  <div className="text-base text-plm-fg">Warn on large file uploads</div>
                  <div className="text-sm text-plm-fg-muted mt-0.5">
                    Show a warning before uploading files larger than your threshold
                  </div>
                </div>
              </div>
              <button
                onClick={() => setUploadSizeWarningEnabled(!uploadSizeWarningEnabled)}
                className="text-plm-accent"
              >
                {uploadSizeWarningEnabled ? (
                  <ToggleRight size={28} />
                ) : (
                  <ToggleLeft size={28} className="text-plm-fg-muted" />
                )}
              </button>
            </div>
            
            {/* Threshold input */}
            {uploadSizeWarningEnabled && (
              <div className="flex items-center gap-2 ml-11">
                <span className="text-sm text-plm-fg-muted">
                  Warn when file size exceeds:
                </span>
                <input
                  type="number"
                  value={uploadSizeWarningThreshold}
                  onChange={(e) => setUploadSizeWarningThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  className="w-24 px-2 py-1.5 text-sm bg-plm-bg-secondary border border-plm-border rounded-lg focus:border-plm-accent focus:outline-none text-plm-fg"
                />
                <span className="text-sm text-plm-fg-muted">MB</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Vault Dialog */}
      {deletingVault && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => { setDeletingVault(null); setDeleteConfirmText(''); setDeleteConfirmText2('') }}>
          <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-plm-error/20 rounded-full">
                <AlertTriangle size={20} className="text-plm-error" />
              </div>
              <h3 className="text-lg font-medium text-plm-fg">Delete Vault</h3>
            </div>
            <p className="text-base text-plm-fg-muted mb-4">
              This will permanently delete the vault <strong>"{deletingVault.name}"</strong> and all its files from the cloud.
              This action cannot be undone.
            </p>
            <div className="space-y-3 mb-4">
              <div className="space-y-2">
                <label className="text-sm text-plm-fg-dim">Type <strong>"{deletingVault.name}"</strong> to confirm:</label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deletingVault.name}
                  className={`w-full px-3 py-2 bg-plm-bg border rounded-lg text-base focus:outline-none ${
                    deleteConfirmText === deletingVault.name 
                      ? 'border-plm-success focus:border-plm-success' 
                      : 'border-plm-border focus:border-plm-error'
                  }`}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-plm-fg-dim">Type it again to double confirm:</label>
                <input
                  type="text"
                  value={deleteConfirmText2}
                  onChange={(e) => setDeleteConfirmText2(e.target.value)}
                  placeholder={deletingVault.name}
                  disabled={deleteConfirmText !== deletingVault.name}
                  className={`w-full px-3 py-2 bg-plm-bg border rounded-lg text-base focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                    deleteConfirmText2 === deletingVault.name 
                      ? 'border-plm-success focus:border-plm-success' 
                      : 'border-plm-border focus:border-plm-error'
                  }`}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setDeletingVault(null); setDeleteConfirmText(''); setDeleteConfirmText2('') }} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={handleDeleteVault}
                disabled={deleteConfirmText !== deletingVault.name || deleteConfirmText2 !== deletingVault.name || isDeleting}
                className="btn bg-plm-error text-white hover:bg-plm-error/90 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Vault'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Vault Contents Dialog */}
      {clearingVault && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => { setClearingVault(null); setClearConfirmText(''); setClearConfirmText2('') }}>
          <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-plm-warning/20 rounded-full">
                <FolderX size={20} className="text-plm-warning" />
              </div>
              <h3 className="text-lg font-medium text-plm-fg">Clear Vault Contents</h3>
            </div>
            <p className="text-base text-plm-fg-muted mb-2">
              This will permanently delete all files and file history from <strong>"{clearingVault.name}"</strong>.
            </p>
            <ul className="text-sm text-plm-fg-dim mb-4 list-disc list-inside space-y-1">
              <li>All files will be removed from the cloud</li>
              <li>All file history and versions will be deleted</li>
              <li>Local files will be cleared</li>
              <li>The vault itself will remain intact</li>
            </ul>
            <div className="space-y-3 mb-4">
              <div className="space-y-2">
                <label className="text-sm text-plm-fg-dim">Type <strong>"{clearingVault.name}"</strong> to confirm:</label>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder={clearingVault.name}
                  className={`w-full px-3 py-2 bg-plm-bg border rounded-lg text-base focus:outline-none ${
                    clearConfirmText === clearingVault.name 
                      ? 'border-plm-success focus:border-plm-success' 
                      : 'border-plm-border focus:border-plm-warning'
                  }`}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-plm-fg-dim">Type it again to double confirm:</label>
                <input
                  type="text"
                  value={clearConfirmText2}
                  onChange={(e) => setClearConfirmText2(e.target.value)}
                  placeholder={clearingVault.name}
                  disabled={clearConfirmText !== clearingVault.name}
                  className={`w-full px-3 py-2 bg-plm-bg border rounded-lg text-base focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                    clearConfirmText2 === clearingVault.name 
                      ? 'border-plm-success focus:border-plm-success' 
                      : 'border-plm-border focus:border-plm-warning'
                  }`}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setClearingVault(null); setClearConfirmText(''); setClearConfirmText2('') }} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={handleClearVault}
                disabled={clearConfirmText !== clearingVault.name || clearConfirmText2 !== clearingVault.name || isClearing}
                className="btn bg-plm-warning text-white hover:bg-plm-warning/90 disabled:opacity-50"
              >
                {isClearing ? 'Clearing...' : 'Clear Vault Contents'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Vault Dialog */}
      {disconnectingVault && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setDisconnectingVault(null)}>
          <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-plm-warning/20 rounded-full">
                <Unlink size={20} className="text-plm-warning" />
              </div>
              <h3 className="text-lg font-medium text-plm-fg">Disconnect Vault</h3>
            </div>
            <p className="text-base text-plm-fg-muted mb-4">
              This will remove <strong>"{disconnectingVault.name}"</strong> from BluePLM.
              Local files will be preserved and can be reconnected later.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDisconnectingVault(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={confirmDisconnect}
                disabled={isDisconnecting}
                className="btn bg-plm-error text-white hover:bg-plm-error/90"
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe Local Files Dialog */}
      {wipingVault && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setWipingVault(null)}>
          <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-plm-error/20 rounded-full">
                <Eraser size={20} className="text-plm-error" />
              </div>
              <h3 className="text-lg font-medium text-plm-fg">Wipe Local Files</h3>
            </div>
            <p className="text-base text-plm-fg-muted mb-4">
              This will delete all local files for <strong>"{wipingVault.name}"</strong>.
              Cloud files will not be affected and can be re-synced.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setWipingVault(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button
                onClick={handleWipeLocalFiles}
                disabled={isWiping}
                className="btn bg-plm-error text-white hover:bg-plm-error/90"
              >
                {isWiping ? 'Wiping...' : 'Wipe Local Files'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vault Setup Dialog */}
      {setupVault && (
        <VaultSetupDialog
          vaultId={setupVault.id}
          vaultName={setupVault.name}
          vaultDescription={setupVault.description}
          syncStats={setupVaultSyncStats || undefined}
          initialSizeLimit={autoDownloadSizeLimit}
          vaultLocalPath={setupVaultPath || undefined}
          onComplete={handleVaultSetupComplete}
          onCancel={handleVaultSetupCancel}
        />
      )}
    </div>
  )
}

