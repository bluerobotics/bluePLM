/**
 * ExtensionStoreView - Main view for browsing and managing extensions
 *
 * This is the primary UI for the in-app extension store.
 * Provides tabs for browsing the store and managing installed extensions.
 *
 * Installed packages are not run: the desktop has no extension runtime, and the
 * page says so. Install, sideload and uninstall are shown to administrators only
 * (getEffectiveRole() === 'admin', which includes the Administrators team).
 */
import { useEffect, useState } from 'react'
import { Store, Package, Upload } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button, Callout, SegmentedControl } from '@/components/core/ui'
import { usePDMStore } from '@/stores/pdmStore'
import { useExtensions } from '@/hooks/useExtensions'
import { log } from '@/lib/logger'
import { t } from '@/lib/i18n'

import { ExtensionList } from './ExtensionList'
import { ExtensionDetailsDialog } from './ExtensionDetailsDialog'
import { InstallDialog } from './InstallDialog'
import { SideloadDialog } from './SideloadDialog'
import { OrgExtensionsPanel } from '@/features/nativeExtensions/OrgExtensionsPanel'

type TabId = 'store' | 'installed'

export function ExtensionStoreView() {
  const [activeTab, setActiveTab] = useState<TabId>('store')
  const [selectedExtensionId, setSelectedExtensionId] = useState<string | null>(null)
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [installExtensionId, setInstallExtensionId] = useState<string | null>(null)
  const [showSideloadDialog, setShowSideloadDialog] = useState(false)

  const { installedExtensions, storeExtensions, storeLoading } = useExtensions()
  const isAdmin = usePDMStore((s) => s.getEffectiveRole() === 'admin')

  const {
    fetchStoreExtensions,
    loadInstalledExtensions,
    uninstallExtension,
    addToast,
    pendingDeepLinkInstall,
    clearPendingDeepLinkInstall,
  } = usePDMStore(
    useShallow((s) => ({
      fetchStoreExtensions: s.fetchStoreExtensions,
      loadInstalledExtensions: s.loadInstalledExtensions,
      uninstallExtension: s.uninstallExtension,
      addToast: s.addToast,
      pendingDeepLinkInstall: s.pendingDeepLinkInstall,
      clearPendingDeepLinkInstall: s.clearPendingDeepLinkInstall,
    })),
  )

  // Load data on mount
  useEffect(() => {
    loadInstalledExtensions()
    fetchStoreExtensions()
  }, [])

  // Handle pending deep link install
  // When the user clicks "Install in BluePLM" from the website, this triggers
  useEffect(() => {
    if (pendingDeepLinkInstall && storeExtensions.length > 0) {
      const { extensionId } = pendingDeepLinkInstall
      log.info('[ExtensionStore]', 'Processing deep link install', { extensionId })

      // Check if extension exists in store
      const storeExt = storeExtensions.find((e) => e.extensionId === extensionId)
      if (!isAdmin) {
        log.warn('[ExtensionStore]', 'Deep link install refused: not an administrator', {
          extensionId,
        })
        addToast('warning', t('extensionRuntime.adminOnly'))
      } else if (storeExt) {
        // Open install dialog for this extension
        setInstallExtensionId(extensionId)
        setShowInstallDialog(true)
      } else {
        log.warn('[ExtensionStore]', 'Extension not found in store', { extensionId })
      }

      // Clear the pending install regardless (don't re-trigger)
      clearPendingDeepLinkInstall()
    }
  }, [pendingDeepLinkInstall, storeExtensions, clearPendingDeepLinkInstall, isAdmin, addToast])

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

  const handleRefresh = () => {
    if (activeTab === 'store') {
      fetchStoreExtensions()
    } else {
      loadInstalledExtensions()
    }
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {/* No runtime: say so rather than imply installed extensions run */}
      <Callout tone="warning">
        <p>{t('extensionRuntime.notice')}</p>
        {!isAdmin && <p className="mt-1">{t('extensionRuntime.adminOnly')}</p>}
      </Callout>

      {/* Organization-installed native extensions (these do run) */}
      <OrgExtensionsPanel />

      <div className="flex items-center justify-between gap-3">
        <SegmentedControl<TabId>
          value={activeTab}
          onChange={setActiveTab}
          aria-label="Extensions"
          options={[
            {
              value: 'store',
              icon: <Store size={14} />,
              label: (
                <>
                  <span>Browse Store</span>
                  <Badge>{storeExtensions.length}</Badge>
                </>
              ),
            },
            {
              value: 'installed',
              icon: <Package size={14} />,
              label: (
                <>
                  <span>Installed</span>
                  <Badge>{installedArray.length}</Badge>
                </>
              ),
            },
          ]}
        />

        {/* Sideload button (administrators only) */}
        {isAdmin && (
          <Button size="sm" onClick={() => setShowSideloadDialog(true)} icon={<Upload size={14} />}>
            Sideload
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'store' ? (
          <ExtensionList
            storeExtensions={storeExtensions}
            installedExtensions={installedArray}
            loading={storeLoading}
            emptyMessage="No extensions available in the store yet."
            onViewDetails={handleViewDetails}
            onInstall={isAdmin ? handleInstall : undefined}
            onUninstall={isAdmin ? handleUninstall : undefined}
            onRefresh={handleRefresh}
          />
        ) : (
          <ExtensionList
            installedExtensions={installedArray}
            loading={false}
            emptyMessage="No extensions installed. Browse the store to find extensions."
            showFilters={false}
            onViewDetails={handleViewDetails}
            onUninstall={isAdmin ? handleUninstall : undefined}
            onRefresh={handleRefresh}
          />
        )}
      </div>

      {/* Dialogs */}
      <ExtensionDetailsDialog
        extensionId={selectedExtensionId}
        open={!!selectedExtensionId}
        onClose={() => setSelectedExtensionId(null)}
        onInstall={
          isAdmin
            ? () => {
                if (selectedExtensionId) {
                  handleInstall(selectedExtensionId)
                }
              }
            : undefined
        }
        onUninstall={
          isAdmin
            ? () => {
                if (selectedExtensionId) {
                  handleUninstall(selectedExtensionId)
                  setSelectedExtensionId(null)
                }
              }
            : undefined
        }
      />

      <InstallDialog
        extensionId={installExtensionId}
        open={showInstallDialog}
        onClose={() => {
          setShowInstallDialog(false)
          setInstallExtensionId(null)
        }}
      />

      {isAdmin && (
        <SideloadDialog open={showSideloadDialog} onClose={() => setShowSideloadDialog(false)} />
      )}
    </div>
  )
}
