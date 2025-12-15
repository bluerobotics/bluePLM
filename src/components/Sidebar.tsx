import { lazy, Suspense } from 'react'
import { usePDMStore } from '../stores/pdmStore'
import type { SettingsTab } from '../types/settings'
import { isModuleVisible } from '../types/modules'
import { Loader2 } from 'lucide-react'

// Eagerly loaded views (always needed)
import { SettingsNavigation } from './sidebar/SettingsNavigation'

// Lazy loaded views - only loaded when the module is enabled and selected
const ExplorerView = lazy(() => import('./sidebar/ExplorerView').then(m => ({ default: m.ExplorerView })))
const PendingView = lazy(() => import('./sidebar/PendingView').then(m => ({ default: m.PendingView })))
const SearchView = lazy(() => import('./sidebar/SearchView').then(m => ({ default: m.SearchView })))
const WorkflowsView = lazy(() => import('./sidebar/WorkflowsView').then(m => ({ default: m.WorkflowsView })))
const HistoryView = lazy(() => import('./sidebar/HistoryView').then(m => ({ default: m.HistoryView })))
const TrashView = lazy(() => import('./sidebar/TrashView').then(m => ({ default: m.TrashView })))
const TerminalView = lazy(() => import('./sidebar/TerminalView').then(m => ({ default: m.TerminalView })))
const ECOView = lazy(() => import('./sidebar/ECOView').then(m => ({ default: m.ECOView })))
const ECRView = lazy(() => import('./sidebar/ECRView').then(m => ({ default: m.ECRView })))
const ProductsView = lazy(() => import('./sidebar/ProductsView').then(m => ({ default: m.ProductsView })))
const ProcessView = lazy(() => import('./sidebar/ProcessView').then(m => ({ default: m.ProcessView })))
const ScheduleView = lazy(() => import('./sidebar/ScheduleView').then(m => ({ default: m.ScheduleView })))
const ReviewsView = lazy(() => import('./sidebar/ReviewsView').then(m => ({ default: m.ReviewsView })))
const GSDView = lazy(() => import('./sidebar/GSDView').then(m => ({ default: m.GSDView })))
const SuppliersView = lazy(() => import('./sidebar/SuppliersView').then(m => ({ default: m.SuppliersView })))
const SupplierPortalView = lazy(() => import('./sidebar/SupplierPortalView').then(m => ({ default: m.SupplierPortalView })))
const GoogleDriveView = lazy(() => import('./sidebar/GoogleDriveView').then(m => ({ default: m.GoogleDriveView })))

interface SidebarProps {
  onOpenVault: () => void
  onOpenRecentVault: (path: string) => void
  onRefresh: (silent?: boolean) => void
  settingsTab?: SettingsTab
  onSettingsTabChange?: (tab: SettingsTab) => void
}

// Fixed width for settings view (not resizable)
const SETTINGS_SIDEBAR_WIDTH = 200

// Loading fallback for lazy-loaded views
function ViewLoading() {
  return (
    <div className="flex items-center justify-center h-32 text-plm-fg-muted">
      <Loader2 size={20} className="animate-spin" />
    </div>
  )
}

// Fallback for disabled modules
function ModuleDisabled({ moduleName }: { moduleName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-plm-fg-muted p-4 text-center">
      <p className="text-sm">
        The <span className="font-medium">{moduleName}</span> module is disabled.
      </p>
      <p className="text-xs mt-1 text-plm-fg-dim">
        Enable it in Settings → Modules
      </p>
    </div>
  )
}

export function Sidebar({ onOpenVault, onOpenRecentVault, onRefresh, settingsTab = 'profile', onSettingsTabChange }: SidebarProps) {
  const { activeView, sidebarWidth, connectedVaults, moduleConfig } = usePDMStore()
  
  // Settings view uses fixed width, others use resizable width
  const effectiveWidth = activeView === 'settings' ? SETTINGS_SIDEBAR_WIDTH : sidebarWidth

  const renderView = () => {
    // Settings is always available
    if (activeView === 'settings') {
      return <SettingsNavigation activeTab={settingsTab} onTabChange={onSettingsTabChange || (() => {})} />
    }
    
    // Check if the module is enabled for all other views
    const moduleId = activeView as string
    const isEnabled = isModuleVisible(moduleId as any, moduleConfig)
    
    // Map view names to readable names for the disabled message
    const viewNames: Record<string, string> = {
      'explorer': 'Explorer',
      'pending': 'Pending Changes',
      'search': 'Search',
      'workflows': 'File Workflows',
      'history': 'History',
      'trash': 'Trash',
      'terminal': 'Terminal',
      'eco': 'ECO History',
      'ecr': 'ECR / Issues',
      'products': 'Products',
      'process': 'Process Editor',
      'schedule': 'Schedule',
      'reviews': 'Reviews',
      'gsd': 'GSD Summary',
      'suppliers': 'Suppliers',
      'supplier-portal': 'Supplier Portal',
      'google-drive': 'Google Drive',
    }
    
    switch (activeView) {
      // PDM Views
      case 'explorer':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <ExplorerView onOpenVault={onOpenVault} onOpenRecentVault={onOpenRecentVault} onRefresh={onRefresh} />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'pending':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <PendingView onRefresh={onRefresh} />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'search':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <SearchView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'workflows':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <WorkflowsView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'history':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <HistoryView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'trash':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <TrashView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'terminal':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <TerminalView onRefresh={onRefresh} />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      // PLM Views
      case 'eco':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <ECOView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'ecr':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <ECRView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'products':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <ProductsView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'process':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <ProcessView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'schedule':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <ScheduleView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'reviews':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <ReviewsView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'gsd':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <GSDView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'suppliers':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <SuppliersView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'supplier-portal':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <SupplierPortalView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      case 'google-drive':
        return isEnabled ? (
          <Suspense fallback={<ViewLoading />}>
            <GoogleDriveView />
          </Suspense>
        ) : <ModuleDisabled moduleName={viewNames[activeView]} />
        
      default:
        // Default to explorer if enabled, otherwise show disabled message
        return isModuleVisible('explorer', moduleConfig) ? (
          <Suspense fallback={<ViewLoading />}>
            <ExplorerView onOpenVault={onOpenVault} onOpenRecentVault={onOpenRecentVault} />
          </Suspense>
        ) : <ModuleDisabled moduleName="Explorer" />
    }
  }

  const getTitle = () => {
    switch (activeView) {
      // PDM Views
      case 'explorer':
        return 'EXPLORER'
      case 'pending':
        return 'PENDING'
      case 'search':
        return 'SEARCH'
      case 'workflows':
        return 'FILE WORKFLOWS'
      case 'history':
        return 'HISTORY'
      case 'trash':
        return 'TRASH'
      case 'terminal':
        return 'TERMINAL'
      // PLM Views
      case 'eco':
        return 'ECOs'
      case 'ecr':
        return 'ECRs / ISSUES'
      case 'products':
        return 'PRODUCTS'
      case 'process':
        return 'PROCESS EDITOR'
      case 'schedule':
        return 'SCHEDULE'
      case 'reviews':
        return 'REVIEWS'
      case 'gsd':
        return 'GSD SUMMARY'
      case 'suppliers':
        return 'SUPPLIERS'
      case 'supplier-portal':
        return 'SUPPLIER PORTAL'
      case 'google-drive':
        return 'GOOGLE DRIVE'
      // System Views
      case 'settings':
        return 'SETTINGS'
      default:
        return ''
    }
  }

  return (
    <div
      className="bg-plm-sidebar flex flex-col overflow-hidden"
      style={{ width: effectiveWidth }}
    >
      {/* Sidebar header - compact uppercase style for all views */}
      <div className="sidebar-header h-9 flex items-center justify-between px-4 text-[11px] font-semibold text-plm-fg-dim tracking-wide border-b border-plm-border">
        <span>{getTitle()}</span>
        {activeView === 'explorer' && connectedVaults.length > 0 && (
          <span className="text-plm-fg-muted font-normal">
            {connectedVaults.length} vault{connectedVaults.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {renderView()}
      </div>
    </div>
  )
}
