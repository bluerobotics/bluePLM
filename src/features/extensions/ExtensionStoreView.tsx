/**
 * ExtensionStoreView - Main view for browsing and managing extensions
 * 
 * This is the primary UI for the in-app extension store.
 * Provides tabs for browsing the store and managing installed extensions.
 */
import { useEffect, useState } from 'react'
import { Store, Package, RefreshCw, Upload, Bell } from 'lucide-react'
import { ExtensionList } from './ExtensionList'
import { ExtensionDetailsDialog } from './ExtensionDetailsDialog'
import { InstallDialog } from './InstallDialog'
import { UpdateDialog } from './UpdateDialog'
import { SideloadDialog } from './SideloadDialog'
import { usePDMStore } from '@/stores/pdmStore'
import { useExtensions } from '@/hooks/useExtensions'

type TabId = 'store' | 'installed'

export function ExtensionStoreView() {
  const [activeTab, setActiveTab] = useState<TabId>('store')
  const [selectedExtensionId, setSelectedExtensionId] = useState<string | null>(null)
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [installExtensionId, setInstallExtensionId] = useState<string | null>(null)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [updateExtensionId, setUpdateExtensionId] = useState<string | null>(null)
  const [showSideloadDialog, setShowSideloadDialog] = useState(false)
  
  const {
    installedExtensions,
    storeExtensions,
    availableUpdates,
    storeLoading,
    checkingUpdates,
  } = useExtensions()
  
  const {
    fetchStoreExtensions,
    loadInstalledExtensions,
    uninstallExtension,
    enableExtension,
    disableExtension,
    checkForUpdates,
  } = usePDMStore()

  // Load data on mount
  useEffect(() => {
    loadInstalledExtensions()
    fetchStoreExtensions()
    checkForUpdates()
  }, [])

  // Convert installed extensions record to array
  const installedArray = Object.values(installedExtensions)

  // Handle actions
  const handleViewDetails = (extensionId: string) => {
    setSelectedExtensionId(extensionId)
  }

  const handleInstall = (extensionId: string) => {
    setInstallExtensionId(extensionId)
    setShowInstallDialog(true)
  }

  const handleUninstall = async (extensionId: string) => {
    // Show confirmation in the future, for now just uninstall
    await uninstallExtension(extensionId)
  }

  const handleUpdate = (extensionId: string) => {
    setUpdateExtensionId(extensionId)
    setShowUpdateDialog(true)
  }

  const handleEnable = async (extensionId: string) => {
    await enableExtension(extensionId)
  }

  const handleDisable = async (extensionId: string) => {
    await disableExtension(extensionId)
  }

  const handleRefresh = () => {
    if (activeTab === 'store') {
      fetchStoreExtensions()
    } else {
      loadInstalledExtensions()
    }
    checkForUpdates()
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Store size={24} className="text-blue-400" />
            <h1 className="text-xl font-semibold text-gray-100">Extension Store</h1>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Updates badge */}
            {availableUpdates.length > 0 && (
              <button
                onClick={() => setActiveTab('installed')}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 text-blue-400 
                  rounded-lg hover:bg-blue-600/30 transition-colors"
              >
                <Bell size={16} />
                <span className="text-sm font-medium">{availableUpdates.length} update{availableUpdates.length !== 1 ? 's' : ''}</span>
              </button>
            )}
            
            {/* Sideload button */}
            <button
              onClick={() => setShowSideloadDialog(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 text-gray-300 
                rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Upload size={16} />
              <span className="text-sm">Sideload</span>
            </button>
            
            {/* Check updates button */}
            <button
              onClick={() => checkForUpdates()}
              disabled={checkingUpdates}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 text-gray-300 
                rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={checkingUpdates ? 'animate-spin' : ''} />
              <span className="text-sm">Check Updates</span>
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          <button
            onClick={() => setActiveTab('store')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'store'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <Store size={16} />
            <span>Browse Store</span>
            <span className="ml-1 px-1.5 py-0.5 bg-black/20 rounded text-xs">
              {storeExtensions.length}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab('installed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'installed'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <Package size={16} />
            <span>Installed</span>
            <span className="ml-1 px-1.5 py-0.5 bg-black/20 rounded text-xs">
              {installedArray.length}
            </span>
            {availableUpdates.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-500 rounded-full text-xs">
                {availableUpdates.length}
              </span>
            )}
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-6 overflow-hidden">
        {activeTab === 'store' ? (
          <ExtensionList
            storeExtensions={storeExtensions}
            installedExtensions={installedArray}
            updates={availableUpdates}
            loading={storeLoading}
            emptyMessage="No extensions available in the store yet."
            onViewDetails={handleViewDetails}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            onUpdate={handleUpdate}
            onEnable={handleEnable}
            onDisable={handleDisable}
            onRefresh={handleRefresh}
          />
        ) : (
          <ExtensionList
            installedExtensions={installedArray}
            updates={availableUpdates}
            loading={false}
            emptyMessage="No extensions installed. Browse the store to find extensions."
            showFilters={false}
            onViewDetails={handleViewDetails}
            onUninstall={handleUninstall}
            onUpdate={handleUpdate}
            onEnable={handleEnable}
            onDisable={handleDisable}
            onRefresh={handleRefresh}
          />
        )}
      </div>
      
      {/* Dialogs */}
      <ExtensionDetailsDialog
        extensionId={selectedExtensionId}
        open={!!selectedExtensionId}
        onClose={() => setSelectedExtensionId(null)}
        onInstall={() => {
          if (selectedExtensionId) {
            handleInstall(selectedExtensionId)
          }
        }}
        onUninstall={() => {
          if (selectedExtensionId) {
            handleUninstall(selectedExtensionId)
            setSelectedExtensionId(null)
          }
        }}
        onUpdate={() => {
          if (selectedExtensionId) {
            handleUpdate(selectedExtensionId)
          }
        }}
      />
      
      <InstallDialog
        extensionId={installExtensionId}
        open={showInstallDialog}
        onClose={() => {
          setShowInstallDialog(false)
          setInstallExtensionId(null)
        }}
      />
      
      <UpdateDialog
        extensionId={updateExtensionId}
        open={showUpdateDialog}
        onClose={() => {
          setShowUpdateDialog(false)
          setUpdateExtensionId(null)
        }}
      />
      
      <SideloadDialog
        open={showSideloadDialog}
        onClose={() => setShowSideloadDialog(false)}
      />
    </div>
  )
}
