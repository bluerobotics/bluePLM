/**
 * FilePane Hooks - Barrel Export
 * 
 * This module provides all hooks for the FilePane component organized by category.
 * Each hook is designed for a specific responsibility following the single-responsibility principle.
 * 
 * ## State Management Hooks
 * Local UI state management:
 * - `useContextMenuState` - Context menu visibility and position
 * - `useDialogState` - Confirmation dialogs (delete, custom, conflict)
 * - `useRenameState` - File rename and inline cell editing
 * - `useInlineActionHover` - Multi-select action button hover states
 * - `useDragState` - Drag-and-drop state and handlers
 * 
 * Note: SolidWorks configuration state (expandedConfigFiles, selectedConfigs, etc.)
 * is now in Zustand store (usePDMStore) following the same pattern as expandedFolders/selectedFiles.
 * 
 * ## File Operation Hooks
 * PDM file operations:
 * - `useFileOperations` - Download, upload, checkout, checkin, discard, move
 * - `useFileSelection` - Row click, shift-select, range selection
 * - `useDeleteHandler` - Delete confirmation workflow and execution
 * - `useAddFiles` - Add files/folders with conflict resolution
 * - `useDownloadOperation` - Download with progress tracking
 * 
 * ## Handler Hooks
 * Event handlers for UI interactions:
 * - `useColumnHandlers` - Column resize, drag-drop reorder, context menu
 * - `useContextMenuHandlers` - File and empty area context menu triggers
 * - `useFileEditHandlers` - Create folder, rename, inline cell editing
 * - `useConfigHandlers` - SolidWorks configuration management
 * - `useModalHandlers` - Review, checkout request, mention, share, ECO modals
 * - `useKeyboardNav` - Keyboard shortcuts and navigation
 * 
 * ## Modal State Hooks
 * State for collaboration modals:
 * - `useReviewModal` - Review request modal state
 * - `useCheckoutRequestModal` - Checkout request modal state
 * - `useMentionModal` - Mention/notify modal state
 * - `useShareModal` - Share link modal state
 * - `useECOModal` - ECO assignment modal state
 * 
 * ## Performance Hooks
 * Optimizations for large file lists:
 * - `useFolderMetrics` - Pre-computed folder stats (O(n) vs O(n²))
 * - `useSorting` - Memoized file sorting and filtering
 * 
 * ## Utility Hooks
 * General-purpose utilities:
 * - `useFileStatus` - Centralized file status computation
 * - `useNavigationHistory` - Back/forward folder navigation
 * 
 * ## Composite Hooks
 * Convenience hooks that compose others:
 * - `useFilePaneOperations` - Groups operation-related hooks
 * - `useFilePaneView` - Groups view-related state hooks
 * 
 * @module features/source/browser/hooks
 */

// Context menu state management
export { useContextMenuState } from './useContextMenuState'
export type { 
  UseContextMenuStateReturn,
  ContextMenuState,
  EmptyContextMenuState,
  ColumnContextMenuState,
  ConfigContextMenuState 
} from './useContextMenuState'

// Dialog state management
export { useDialogState } from './useDialogState'
export type {
  UseDialogStateReturn,
  CustomConfirmState,
  DeleteLocalCheckoutConfirmState,
  ConflictDialogState
} from './useDialogState'

// Configuration expansion state is now in Zustand store (usePDMStore.expandedConfigFiles, etc.)
// The useConfigState hook is deprecated - use usePDMStore directly

// Inline action button hover states
export { useInlineActionHover } from './useInlineActionHover'
export type { UseInlineActionHoverReturn } from './useInlineActionHover'

// Drag and drop state
export { useDragState } from './useDragState'
export type { UseDragStateReturn, SelectionBox } from './useDragState'

// Rename and inline editing state
export { useRenameState } from './useRenameState'
export type { UseRenameStateReturn } from './useRenameState'

// File operations (download, checkout, checkin, upload, etc.)
export { useFileOperations } from './useFileOperations'
export type { UseFileOperationsOptions, UseFileOperationsReturn } from './useFileOperations'

// Keyboard navigation and shortcuts
export { useKeyboardNav } from './useKeyboardNav'
export type { UseKeyboardNavOptions } from './useKeyboardNav'

// File selection (row click, shift-select, ctrl-select)
export { useFileSelection } from './useFileSelection'
export type { UseFileSelectionOptions, UseFileSelectionReturn } from './useFileSelection'

// Review request modal
export { useReviewModal } from './useReviewModal'
export type { UseReviewModalReturn, OrgUser } from './useReviewModal'

// Checkout request modal
export { useCheckoutRequestModal } from './useCheckoutRequestModal'
export type { UseCheckoutRequestModalReturn } from './useCheckoutRequestModal'

// Mention/notify modal
export { useMentionModal } from './useMentionModal'
export type { UseMentionModalReturn } from './useMentionModal'

// Share link modal
export { useShareModal } from './useShareModal'
export type { UseShareModalReturn } from './useShareModal'

// ECO (Engineering Change Order) modal
export { useECOModal } from './useECOModal'
export type { UseECOModalReturn, ECO } from './useECOModal'

// Navigation history (back/forward)
export { useNavigationHistory } from './useNavigationHistory'
export type { UseNavigationHistoryOptions, UseNavigationHistoryReturn } from './useNavigationHistory'

// Column handlers (resize, drag-drop reorder, context menu)
export { useColumnHandlers } from './useColumnHandlers'
export type { ColumnHandlersDeps, UseColumnHandlersReturn } from './useColumnHandlers'

// Context menu handlers (file and empty area)
export { useContextMenuHandlers } from './useContextMenuHandlers'
export type { ContextMenuHandlersDeps, UseContextMenuHandlersReturn } from './useContextMenuHandlers'

// File edit handlers (create folder, rename, inline cell editing)
export { useFileEditHandlers } from './useFileEditHandlers'
export type { FileEditHandlersDeps, UseFileEditHandlersReturn } from './useFileEditHandlers'

// Config handlers (SolidWorks configurations)
export { useConfigHandlers } from './useConfigHandlers'
export type { ConfigHandlersDeps, UseConfigHandlersReturn } from './useConfigHandlers'

// Modal handlers (review, checkout request, mention, share, ECO)
export { useModalHandlers } from './useModalHandlers'
export type { ModalHandlersDeps, UseModalHandlersReturn } from './useModalHandlers'

// Delete handler (delete dialog logic and execution)
export { useDeleteHandler } from './useDeleteHandler'
export type { UseDeleteHandlerOptions, UseDeleteHandlerReturn } from './useDeleteHandler'

// Add files/folders handlers
export { useAddFiles } from './useAddFiles'
export type { UseAddFilesOptions, UseAddFilesReturn } from './useAddFiles'

// Folder metrics (pre-computed folder stats for O(n) performance)
export { useFolderMetrics } from './useFolderMetrics'
export type { UseFolderMetricsOptions } from './useFolderMetrics'

// File sorting and filtering
export { useSorting } from './useSorting'
export type { UseSortingOptions, UseSortingReturn } from './useSorting'

// Download operation with progress tracking
export { useDownloadOperation } from './useDownloadOperation'

// File status (centralized status checks)
export { useFileStatus, getFileStatus, getStatusLabel, getStatusColorClass } from './useFileStatus'
export type { FileStatus } from './useFileStatus'

// Composite hooks (group related hooks for cleaner component code)
export { useFilePaneOperations } from './useFilePaneOperations'
export { useFilePaneView } from './useFilePaneView'