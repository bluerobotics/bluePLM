import { Suspense, lazy } from 'react'
import { Loader2 } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useLoadFiles, useVaultManagement } from '@/hooks'
import { SettingsContent } from '@/features/settings'
import { WelcomeScreen } from '@/components/shared/Screens'
import { TabBar } from './TabBar'
import { ResizeHandle } from './ResizeHandle'

// Lazy loaded main content components - only loaded when their module is active
const FilePane = lazy(() => import('@/features/source/browser').then(m => ({ default: m.FilePane })))
const DetailsPanel = lazy(() => import('@/features/source/details').then(m => ({ default: m.DetailsPanel })))
const GoogleDrivePanel = lazy(() => import('@/features/integrations/google-drive').then(m => ({ default: m.GoogleDrivePanel })))
const WorkflowsView = lazy(() => import('@/features/source/workflows/WorkflowsView').then(m => ({ default: m.WorkflowsView })))

// Loading fallback for lazy-loaded components
function ContentLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-plm-bg">
      <Loader2 size={24} className="animate-spin text-plm-fg-muted" />
    </div>
  )
}

interface MainContentProps {
  showWelcome: boolean
  activeView: string
  detailsPanelVisible: boolean
  isResizingSidebar: boolean
  isResizingRightPanel: boolean
  onResizeDetailsStart: () => void
  handleChangeOrg: () => Promise<void>
}

/**
 * Main content area that switches between different views:
 * - WelcomeScreen (when not connected)
 * - Settings
 * - Google Drive
 * - Workflows
 * - File Browser (default)
 */
export function MainContent({
  showWelcome,
  activeView,
  detailsPanelVisible,
  isResizingSidebar,
  isResizingRightPanel,
  onResizeDetailsStart,
  handleChangeOrg,
}: MainContentProps) {
  // Get settingsTab from store
  const settingsTab = usePDMStore(s => s.settingsTab)
  
  // Call hooks directly instead of receiving as props
  const { loadFiles } = useLoadFiles()
  const { handleOpenRecentVault } = useVaultManagement()

  return (
    <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${isResizingSidebar || isResizingRightPanel ? 'pointer-events-none' : ''}`}>
      {/* Tab bar (browser-like tabs) - only shown when tabs are enabled and in file explorer view */}
      {!showWelcome && activeView === 'explorer' && <TabBar />}
      
      {showWelcome ? (
        <WelcomeScreen 
          onOpenRecentVault={handleOpenRecentVault}
          onChangeOrg={handleChangeOrg}
        />
      ) : activeView === 'settings' ? (
        /* Settings View - replaces entire main content area */
        <SettingsContent activeTab={settingsTab} />
      ) : activeView === 'google-drive' ? (
        /* Google Drive View - replaces entire main content area (lazy loaded) */
        <Suspense fallback={<ContentLoading />}>
          <GoogleDrivePanel />
        </Suspense>
      ) : activeView === 'workflows' ? (
        /* Workflows View - replaces entire main content area (full screen, lazy loaded) */
        <Suspense fallback={<ContentLoading />}>
          <WorkflowsView />
        </Suspense>
      ) : (
        <>
          {/* File Pane (lazy loaded) */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
            <Suspense fallback={<ContentLoading />}>
              <FilePane onRefresh={loadFiles} />
            </Suspense>
          </div>

          {/* Details Panel (lazy loaded) */}
          {detailsPanelVisible && (
            <>
              <ResizeHandle
                direction="vertical"
                onResizeStart={onResizeDetailsStart}
              />
              <Suspense fallback={<ContentLoading />}>
                <DetailsPanel />
              </Suspense>
            </>
          )}
        </>
      )}
    </div>
  )
}
