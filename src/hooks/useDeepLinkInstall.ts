/**
 * useDeepLinkInstall - Hook for handling deep link extension installs
 *
 * Listens for `deep-link:install-extension` IPC events from the main process
 * and navigates to the extension store to trigger installation.
 *
 * This should be used at the App level to ensure deep links are handled
 * regardless of what view the user is currently on.
 */
import { useEffect } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { log } from '@/lib/logger'
import { isBackendConfigured, resolveCommunityShareLink } from '@/lib/community'
import { buildFullPath } from '@/lib/utils/path'
import { t } from '@/lib/i18n'

/**
 * Hook to listen for deep link install events and navigate appropriately.
 *
 * When a deep link like `blueplm://install/my-extension` is received:
 * 1. Navigates to the settings view
 * 2. Switches to the extension-store tab
 * 3. Stores the pending install so ExtensionStoreView can show the install dialog
 */
export function useDeepLinkInstall(): void {
  const setActiveView = usePDMStore((s) => s.setActiveView)
  const setSettingsTab = usePDMStore((s) => s.setSettingsTab)
  const setPendingDeepLinkInstall = usePDMStore((s) => s.setPendingDeepLinkInstall)
  const fetchStoreExtensions = usePDMStore((s) => s.fetchStoreExtensions)
  const addToast = usePDMStore((s) => s.addToast)
  const activeVaultId = usePDMStore((s) => s.activeVaultId)
  const vaultPath = usePDMStore((s) => s.vaultPath)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onDeepLinkInstall) {
      log.debug('[DeepLink]', 'Deep link API not available')
      return
    }

    const unsubscribe = api.onDeepLinkInstall((data) => {
      log.info('[DeepLink]', 'Received install request', {
        extensionId: data.extensionId,
        version: data.version,
      })

      // Show a toast to indicate we're handling the deep link
      addToast('info', `Opening extension installer for ${data.extensionId}...`, 3000)

      // Ensure store extensions are loaded
      fetchStoreExtensions()

      // Navigate to the extension store
      setActiveView('settings')
      setSettingsTab('extension-store')

      // Store the pending install - ExtensionStoreView will pick this up
      setPendingDeepLinkInstall({
        extensionId: data.extensionId,
        version: data.version,
      })

      // Acknowledge the deep link was received
      api.acknowledgeDeepLink?.(data.extensionId, true)
    })

    return () => {
      unsubscribe()
    }
  }, [setActiveView, setSettingsTab, setPendingDeepLinkInstall, fetchStoreExtensions, addToast])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onDeepLinkShare) return
    return api.onDeepLinkShare(async ({ token }) => {
      if (!isBackendConfigured('community')) {
        addToast('warning', t('mdbSetup.shareRequiresMdb'))
        return
      }
      try {
        const { file } = await resolveCommunityShareLink(token)
        if (file.vaultId !== activeVaultId || !vaultPath) {
          addToast('info', t('mdbSetup.sharedFileConnectVault', { name: file.fileName }))
          return
        }
        const opened = await api.openFile(buildFullPath(vaultPath, file.canonicalPath))
        if (!opened.success)
          addToast(
            'error',
            opened.error || t('mdbSetup.sharedFileOpenFailed', { name: file.fileName }),
          )
      } catch (error) {
        addToast(
          'error',
          error instanceof Error ? error.message : t('mdbSetup.sharedFileResolveFailed'),
        )
      }
    })
  }, [activeVaultId, vaultPath, addToast])
}
