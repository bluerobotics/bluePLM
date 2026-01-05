/**
 * Source Files Feature
 * 
 * Core PDM file management functionality
 */

// Main file browser (browser exports most common types)
export * from './browser'

// Sidebar views - only export main components, not types that conflict
export { FileTree } from './explorer'
export { 
  VaultTreeItem, 
  FolderTreeItem, 
  FileTreeItem, 
  PinnedFoldersSection,
  RecentVaultsSection,
  NoVaultAccessMessage,
  FileActionButtons,
  FolderActionButtons
} from './explorer'

export { PendingView } from './pending'
export { HistoryView } from './history'
export { TrashView } from './trash'
export { DetailsPanel } from './details'

// Backup functionality
export * from './backup'

// Context menu exports - only non-conflicting items
// (pane already exports FileContextMenu, dialogs, etc.)
export {
  ClipboardItems,
  FileOperationItems,
  PDMItems,
  CollaborationItems,
  NavigationItems,
  AdminItems,
  DeleteItems,
  useMenuPosition,
  formatSize,
  getCountLabel,
  plural,
  SW_EXTENSIONS,
  MENU_PADDING,
  SUBMENU_WIDTH,
  DEFAULT_SHARE_EXPIRY_DAYS,
  MAX_VISIBLE_FILES
} from './context-menu'

// Context menu dialogs that don't conflict with pane
export {
  DeleteLocalConfirmDialog,
  ForceCheckinDialog,
  PropertiesDialog,
  ReviewRequestDialog,
  CheckoutRequestDialog,
  MentionDialog,
  ShareLinkDialog,
  AddToECODialog
} from './context-menu'

// Workflows feature (File Workflows for source files)
// Only export main components to avoid type conflicts with browser
export { WorkflowsView, WorkflowCard, WorkflowsList, WorkflowToolbar } from './workflows'
export { WorkflowCanvas, WorkflowCanvasProvider, useWorkflowCanvasContext } from './workflows'
export type { WorkflowCanvasContextValue } from './workflows'