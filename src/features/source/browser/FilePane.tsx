import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import { log } from '@/lib/logger'
// getEffectiveExportSettings is now used in useConfigHandlers hook
// Note: FileIcon is now used inside file-pane/ListRowIcon.tsx
import { 
  supabase,
  updateFileMetadata, 
  isWatchingFile
} from '@/lib/supabase'
import type { FileMetadataColumn } from '@/types/database'
// Shared inline action button components now used in CellRenderer
// Use command system for PDM operations
import { executeCommand } from '@/lib/commands'
// CrumbBar is now used inside FileToolbar
import { useTranslation } from '@/lib/i18n'

// Shared hooks from Agent 1's foundation
import { useClipboard } from '@/hooks/useClipboard'
import { useSelectionCategories } from '@/hooks/useSelectionCategories'
import { useSelectionBox } from '@/hooks/useSelectionBox'
import { useSlowDoubleClick } from '@/hooks/useSlowDoubleClick'

// Import extracted components from this feature module
import { 
  FileGridView,
  CellRenderer,
  FileListBody,
  EmptyState,
  LoadingState,
  NoVaultEmptyState,
  SelectionBoxOverlay,
  DragOverlay,
  ColumnHeaders,
  CustomConfirmDialog,
  ConflictDialog,
  DeleteConfirmDialog,
  DeleteLocalCheckoutDialog,
  ColumnContextMenu,
  ConfigContextMenu,
  EmptyContextMenu,
  FileContextMenu,
  ReviewRequestModal,
  CheckoutRequestModal,
  NotifyModal,
  ShareLinkModal,
  ECOModal,
  FileToolbar,
  // Context
  FilePaneProvider,
  FilePaneHandlersProvider,
  type FilePaneHandlersContextValue,
  // Utilities
  getFileProcessingOperation,
  getFolderProcessingOperation,
  matchesKeybinding,
} from './'

// Import types directly to avoid circular dependency with barrel file
import { COLUMN_TRANSLATION_KEYS } from './types'

// Import hooks for folder metrics and sorting
import { useFolderMetrics } from './hooks/useFolderMetrics'
import { useSorting } from './hooks/useSorting'

// Import state management hooks
import {
  useContextMenuState,
  useDialogState,
  useInlineActionHover,
  useDragState,
  useRenameState,
  useFileOperations,
  useKeyboardNav,
  useFileSelection,
  useReviewModal,
  useCheckoutRequestModal,
  useMentionModal,
  useShareModal,
  useECOModal,
  useNavigationHistory,
  useColumnHandlers,
  useContextMenuHandlers,
  useFileEditHandlers,
  useConfigHandlers,
  useModalHandlers,
  useDeleteHandler,
  useAddFiles
} from './hooks'


// Column ID to translation key mapping - imported from types
const columnTranslationKeys = COLUMN_TRANSLATION_KEYS

interface FilePaneProps {
  onRefresh: (silent?: boolean) => void
}

// NOTE: FileIconCard and ListRowIcon components have been extracted to file-pane/
// They are now imported at the top of this file


export function FilePane({ onRefresh }: FilePaneProps) {
  const { t } = useTranslation()
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SELECTIVE ZUSTAND SELECTORS
  // Split monolithic usePDMStore() into individual selectors to prevent
  // unnecessary re-renders. Each selector only triggers re-render when its
  // specific value changes.
  //
  // Pattern: Use useShallow() wrapper for object/array selectors to enable
  // shallow equality comparison (Zustand v5+ API).
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ─── Data Selectors (arrays/objects use useShallow wrapper) ────────────────
  const files = usePDMStore(s => s.files)
  const selectedFiles = usePDMStore(useShallow(s => s.selectedFiles))
  const columns = usePDMStore(useShallow(s => s.columns))
  const connectedVaults = usePDMStore(useShallow(s => s.connectedVaults))
  const expandedFolders = usePDMStore(s => s.expandedFolders)
  const processingOperations = usePDMStore(s => s.processingOperations)
  const keybindings = usePDMStore(useShallow(s => s.keybindings))
  
  // ─── Primitive Selectors (no equality function needed) ─────────────────────
  const sortColumn = usePDMStore(s => s.sortColumn)
  const sortDirection = usePDMStore(s => s.sortDirection)
  const isLoading = usePDMStore(s => s.isLoading)
  const filesLoaded = usePDMStore(s => s.filesLoaded)
  const vaultPath = usePDMStore(s => s.vaultPath)
  const currentFolder = usePDMStore(s => s.currentFolder)
  const vaultName = usePDMStore(s => s.vaultName)
  const activeVaultId = usePDMStore(s => s.activeVaultId)
  const searchQuery = usePDMStore(s => s.searchQuery)
  const searchType = usePDMStore(s => s.searchType)
  const lowercaseExtensions = usePDMStore(s => s.lowercaseExtensions)
  const detailsPanelVisible = usePDMStore(s => s.detailsPanelVisible)
  const viewMode = usePDMStore(s => s.viewMode)
  const iconSize = usePDMStore(s => s.iconSize)
  const listRowSize = usePDMStore(s => s.listRowSize)
  const hideSolidworksTempFiles = usePDMStore(s => s.hideSolidworksTempFiles)
  const tabsEnabled = usePDMStore(s => s.tabsEnabled)
  const activeTabId = usePDMStore(s => s.activeTabId)
  
  // ─── User & Organization Selectors ─────────────────────────────────────────
  const user = usePDMStore(s => s.user)
  const organization = usePDMStore(s => s.organization)
  
  // ─── Action Selectors (grouped by domain, useShallow wrapper) ──────────────
  // Selection actions
  const { setSelectedFiles, toggleFileSelection, clearSelection } = usePDMStore(
    useShallow(s => ({
      setSelectedFiles: s.setSelectedFiles,
      toggleFileSelection: s.toggleFileSelection,
      clearSelection: s.clearSelection
    }))
  )
  
  // Column actions
  const { setColumnWidth, reorderColumns, toggleColumnVisibility, toggleSort } = usePDMStore(
    useShallow(s => ({
      setColumnWidth: s.setColumnWidth,
      reorderColumns: s.reorderColumns,
      toggleColumnVisibility: s.toggleColumnVisibility,
      toggleSort: s.toggleSort
    }))
  )
  
  // Folder navigation actions
  const { setCurrentFolder, toggleFolder, updateTabFolder } = usePDMStore(
    useShallow(s => ({
      setCurrentFolder: s.setCurrentFolder,
      toggleFolder: s.toggleFolder,
      updateTabFolder: s.updateTabFolder
    }))
  )
  
  // Toast actions
  const { addToast, addProgressToast, updateProgressToast, removeToast } = usePDMStore(
    useShallow(s => ({
      addToast: s.addToast,
      addProgressToast: s.addProgressToast,
      updateProgressToast: s.updateProgressToast,
      removeToast: s.removeToast
    }))
  )
  
  // File mutation actions
  const { renameFileInStore, updateFileInStore, updatePendingMetadata } = usePDMStore(
    useShallow(s => ({
      renameFileInStore: s.renameFileInStore,
      updateFileInStore: s.updateFileInStore,
      updatePendingMetadata: s.updatePendingMetadata
    }))
  )
  
  // Processing operation actions
  const { addProcessingFolder, addProcessingFolders, removeProcessingFolder, removeProcessingFolders, getProcessingOperation } = usePDMStore(
    useShallow(s => ({
      addProcessingFolder: s.addProcessingFolder,
      addProcessingFolders: s.addProcessingFolders,
      removeProcessingFolder: s.removeProcessingFolder,
      removeProcessingFolders: s.removeProcessingFolders,
      getProcessingOperation: s.getProcessingOperation
    }))
  )
  
  // Details panel actions
  const { setDetailsPanelTab, toggleDetailsPanel } = usePDMStore(
    useShallow(s => ({
      setDetailsPanelTab: s.setDetailsPanelTab,
      toggleDetailsPanel: s.toggleDetailsPanel
    }))
  )
  
  // View mode actions
  const { setViewMode, setIconSize, setListRowSize } = usePDMStore(
    useShallow(s => ({
      setViewMode: s.setViewMode,
      setIconSize: s.setIconSize,
      setListRowSize: s.setListRowSize
    }))
  )
  
  // Status message action (single function)
  const setStatusMessage = usePDMStore(s => s.setStatusMessage)
  
  // Helper function to get translated column label
  const getColumnLabel = (columnId: string): string => {
    const key = columnTranslationKeys[columnId]
    return key ? t(key) : columnId
  }
  
  // Helper to ensure details panel is visible
  const setDetailsPanelVisible = (visible: boolean) => {
    if (visible && !detailsPanelVisible) toggleDetailsPanel()
  }
  
  // Get current vault ID (from activeVaultId or first connected vault)
  // Note: currentVaultId now computed inside FileContextMenu
  
  const displayVaultName = vaultName || vaultPath?.split(/[/\\]/).pop() || 'Vault'

  // ===== STATE MANAGEMENT HOOKS =====
  // Context menu state (context menus, submenus, and refs)
  const {
    contextMenu, setContextMenu,
    emptyContextMenu, setEmptyContextMenu,
    columnContextMenu, setColumnContextMenu,
    configContextMenu, setConfigContextMenu,
    contextMenuAdjustedPos, setContextMenuAdjustedPos,
    contextMenuRef,
    showIgnoreSubmenu, setShowIgnoreSubmenu,
    showStateSubmenu, setShowStateSubmenu,
    ignoreSubmenuTimeoutRef, stateSubmenuTimeoutRef
  } = useContextMenuState()

  // Dialog state (confirmations, delete dialogs, conflict resolution)
  const {
    deleteConfirm, setDeleteConfirm,
    deleteEverywhere, setDeleteEverywhere,
    customConfirm, setCustomConfirm,
    deleteLocalCheckoutConfirm, setDeleteLocalCheckoutConfirm,
    conflictDialog, setConflictDialog
  } = useDialogState()

  // Rename and inline editing state (file rename, new folder, cell editing)
  const {
    renamingFile, setRenamingFile,
    renameValue, setRenameValue,
    renameInputRef,
    isCreatingFolder, setIsCreatingFolder,
    newFolderName, setNewFolderName,
    newFolderInputRef,
    editingCell, setEditingCell,
    editValue, setEditValue,
    inlineEditInputRef
  } = useRenameState()

  // Inline action button hover states (for multi-select highlighting)
  // Note: hover states are now provided via FilePaneContext to CellRenderer
  const { resetHoverStates } = useInlineActionHover()
  const [platform, setPlatform] = useState<string>('win32')
  const [undoStack, setUndoStack] = useState<Array<{ type: 'delete'; file: LocalFile; originalPath: string }>>([])
  
  // Navigation history (back/forward)
  const {
    navigateToFolder,
    navigateUp,
    navigateToRoot,
    navigateBack,
    navigateForward,
    canGoBack,
    canGoForward
  } = useNavigationHistory({
    setCurrentFolder,
    expandedFolders,
    toggleFolder,
    tabsEnabled,
    activeTabId,
    updateTabFolder
  })

  // Context menu handlers (file and empty area)
  const {
    handleContextMenu,
    handleEmptyContextMenu,
  } = useContextMenuHandlers({
    selectedFiles,
    setSelectedFiles,
    setContextMenu,
    setEmptyContextMenu,
  })

  // Current machine ID for multi-device checkout detection (loaded once)
  const [currentMachineId, setCurrentMachineId] = useState<string | null>(null)

  // File operations (checkout, checkin, download, upload, etc.)
  const {
    handleDownload: handleInlineDownload,
    handleCheckout: handleInlineCheckout,
    handleCheckin: handleInlineCheckin,
    handleUpload: handleInlineUpload,
    handleMoveFiles,
    selectedDownloadableFiles,
    selectedCheckoutableFiles,
    selectedCheckinableFiles,
    selectedUploadableFiles
  } = useFileOperations({
    files,
    selectedFiles,
    userId: user?.id,
    currentMachineId,
    vaultPath,
    onRefresh,
    addToast,
    addProgressToast,
    updateProgressToast,
    removeToast,
    setCustomConfirm,
    addProcessingFolder,
    removeProcessingFolder,
    renameFileInStore,
    resetHoverStates
  })

  // Drag and drop state and handlers
  const {
    isDraggingOver,
    isExternalDrag,
    dragOverFolder,
    draggingColumn, setDraggingColumn,
    dragOverColumn, setDragOverColumn,
    resizingColumn, setResizingColumn,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFolderDragOver,
    handleFolderDragLeave,
    handleDropOnFolder,
  } = useDragState({
    files,
    selectedFiles,
    userId: user?.id,
    vaultPath,
    currentFolder,
    onRefresh,
    addToast,
    addProgressToast,
    updateProgressToast,
    removeToast,
    setStatusMessage,
    handleMoveFiles
  })

  // Column handlers (resize, drag-drop reorder, context menu)
  const {
    handleColumnResize,
    handleColumnDragStart,
    handleColumnDragOver,
    handleColumnDragLeave,
    handleColumnDrop,
    handleColumnDragEnd,
    handleColumnHeaderContextMenu,
  } = useColumnHandlers({
    columns,
    setColumnWidth,
    reorderColumns,
    draggingColumn,
    setDraggingColumn,
    setDragOverColumn,
    setResizingColumn,
    setColumnContextMenu,
  })
  
  // Configuration local state (refs and UI state that can't be in Zustand)
  // Config expansion/selection state is now in Zustand store (like expandedFolders/selectedFiles)
  const lastClickedConfigRef = useRef<string | null>(null)
  const justSavedConfigs = useRef<Set<string>>(new Set())
  const [isExportingConfigs, setIsExportingConfigs] = useState(false)
  const [savingConfigsToSW, setSavingConfigsToSW] = useState<Set<string>>(new Set())
  
  // Config state setter from store (for context menu callbacks)
  const setSelectedConfigs = usePDMStore(s => s.setSelectedConfigs)

  // Config handlers (SolidWorks configurations)
  const {
    handleConfigTabChange,
    handleConfigDescriptionChange,
    handleConfigRowClick,
    handleConfigContextMenu,
    handleExportConfigs,
    canHaveConfigs,
    saveConfigsToSWFile,
    hasPendingMetadataChanges,
    getSelectedConfigsForFile,
    toggleFileConfigExpansion,
  } = useConfigHandlers({
    files,
    lastClickedConfigRef,
    justSavedConfigs,
    configContextMenu,
    setConfigContextMenu,
    setIsExportingConfigs,
    setSavingConfigsToSW,
    setSelectedFiles,
    organization,
    addToast,
  })

  // Clipboard operations using shared hook
  const {
    clipboard,
    setClipboard,
    handleCopy,
    handleCut,
    handlePaste: sharedHandlePaste
  } = useClipboard({
    files,
    selectedFiles,
    userId: user?.id,
    onRefresh,
    addToast
  })
  
  // Wrap paste to provide current folder and show status message
  // Also handles pasting files from Windows Explorer (Ctrl+C in Explorer, then Ctrl+V here)
  const handlePaste = useCallback(async () => {
    // First check if we have internal clipboard content
    if (clipboard && vaultPath) {
      setStatusMessage(`Pasting ${clipboard.files.length} item${clipboard.files.length > 1 ? 's' : ''}...`)
      await sharedHandlePaste(currentFolder || '')
      setStatusMessage('')
      return
    }
    
    // No internal clipboard - check for external file paths from Windows Explorer
    if (window.electronAPI?.readFilePathsFromClipboard && vaultPath) {
      try {
        const result = await window.electronAPI.readFilePathsFromClipboard()
        if (result.success && result.filePaths && result.filePaths.length > 0) {
          const filePaths = result.filePaths
          const totalFiles = filePaths.length
          const toastId = `paste-external-${Date.now()}`
          
          setStatusMessage(`Pasting ${totalFiles} file${totalFiles > 1 ? 's' : ''} from Explorer...`)
          addProgressToast(toastId, `Adding ${totalFiles} file${totalFiles > 1 ? 's' : ''}...`, totalFiles)
          
          let successCount = 0
          let errorCount = 0
          
          for (let i = 0; i < filePaths.length; i++) {
            const sourcePath = filePaths[i]
            const fileName = sourcePath.split(/[/\\]/).pop() || 'unknown'
            const destPath = currentFolder 
              ? `${vaultPath}/${currentFolder}/${fileName}`.replace(/\\/g, '/')
              : `${vaultPath}/${fileName}`.replace(/\\/g, '/')
            
            const copyResult = await window.electronAPI.copyFile(sourcePath, destPath)
            if (copyResult.success) {
              successCount++
            } else {
              errorCount++
              log.error('[Paste]', `Failed to copy ${fileName}`, { error: copyResult.error })
            }
            
            const percent = Math.round(((i + 1) / totalFiles) * 100)
            updateProgressToast(toastId, i + 1, percent)
          }
          
          removeToast(toastId)
          setStatusMessage('')
          
          if (errorCount === 0) {
            addToast('success', `Pasted ${successCount} file${successCount > 1 ? 's' : ''} from Explorer`)
          } else {
            addToast('warning', `Pasted ${successCount}, failed ${errorCount}`)
          }
          
          // Refresh file list
          setTimeout(() => onRefresh(true), 100)
          return
        }
      } catch (err) {
        log.error('[Paste]', 'Failed to read clipboard file paths', { error: err })
      }
    }
    
    addToast('info', 'Nothing to paste')
  }, [clipboard, vaultPath, currentFolder, sharedHandlePaste, addToast, setStatusMessage, addProgressToast, updateProgressToast, removeToast, onRefresh])

  const tableRef = useRef<HTMLDivElement>(null)

  // Review request modal state
  const {
    showReviewModal, setShowReviewModal,
    reviewModalFile, setReviewModalFile,
    orgUsers, setOrgUsers,
    loadingUsers, setLoadingUsers,
    selectedReviewers, setSelectedReviewers,
    reviewMessage, setReviewMessage,
    reviewDueDate, setReviewDueDate,
    reviewPriority, setReviewPriority,
    isSubmittingReview, setIsSubmittingReview
  } = useReviewModal()

  // Checkout request modal state
  const {
    showCheckoutRequestModal, setShowCheckoutRequestModal,
    checkoutRequestFile, setCheckoutRequestFile,
    checkoutRequestMessage, setCheckoutRequestMessage,
    isSubmittingCheckoutRequest, setIsSubmittingCheckoutRequest
  } = useCheckoutRequestModal()

  // Mention/notify modal state
  const {
    showMentionModal, setShowMentionModal,
    mentionFile, setMentionFile,
    selectedMentionUsers, setSelectedMentionUsers,
    mentionMessage, setMentionMessage,
    isSubmittingMention, setIsSubmittingMention
  } = useMentionModal()

  // Watch file state
  const [watchingFiles, setWatchingFiles] = useState<Set<string>>(new Set())
  const [isTogglingWatch, setIsTogglingWatch] = useState(false)

  // Share link modal state
  const {
    showShareModal, setShowShareModal,
    shareFile, setShareFile,
    generatedShareLink, setGeneratedShareLink,
    isCreatingShareLink, setIsCreatingShareLink,
    copiedLink, setCopiedLink
  } = useShareModal()

  // ECO modal state (ECO list comes from store via ecosSlice)
  const {
    showECOModal, setShowECOModal,
    ecoFile, setEcoFile,
    activeECOs,
    loadingECOs,
    selectedECO, setSelectedECO,
    ecoNotes, setEcoNotes,
    isAddingToECO, setIsAddingToECO
  } = useECOModal()

  // Modal handlers (review, checkout request, mention, share, ECO)
  const {
    handleOpenReviewModal,
    handleToggleReviewer,
    handleSubmitReviewRequest,
    handleOpenCheckoutRequestModal,
    handleSubmitCheckoutRequest,
    handleOpenMentionModal,
    handleToggleMentionUser,
    handleSubmitMention,
    handleToggleWatch,
    handleQuickShareLink,
    handleCopyShareLink,
    handleOpenECOModal,
    handleAddToECO,
  } = useModalHandlers({
    user,
    organization,
    activeVaultId,
    setShowReviewModal,
    setReviewModalFile,
    setOrgUsers,
    setLoadingUsers,
    selectedReviewers,
    setSelectedReviewers,
    reviewMessage,
    setReviewMessage,
    reviewDueDate,
    setReviewDueDate,
    reviewPriority,
    setReviewPriority,
    setIsSubmittingReview,
    reviewModalFile,
    setShowCheckoutRequestModal,
    setCheckoutRequestFile,
    checkoutRequestFile,
    checkoutRequestMessage,
    setCheckoutRequestMessage,
    setIsSubmittingCheckoutRequest,
    setShowMentionModal,
    setMentionFile,
    mentionFile,
    selectedMentionUsers,
    setSelectedMentionUsers,
    mentionMessage,
    setMentionMessage,
    setIsSubmittingMention,
    watchingFiles,
    setWatchingFiles,
    setIsTogglingWatch,
    setShowShareModal,
    setShareFile,
    setIsCreatingShareLink,
    generatedShareLink,
    setGeneratedShareLink,
    setCopiedLink,
    setShowECOModal,
    setEcoFile,
    ecoFile,
    selectedECO,
    setSelectedECO,
    ecoNotes,
    setEcoNotes,
    setIsAddingToECO,
    setContextMenu,
    addToast,
  })

  // Custom metadata columns from organization settings
  const [customMetadataColumns, setCustomMetadataColumns] = useState<FileMetadataColumn[]>([])

  // Use store's currentFolder instead of local state
  const currentPath = currentFolder

  // File edit handlers (create folder, rename, inline cell editing)
  const {
    handleCreateFolder,
    startCreatingFolder,
    handleRename,
    startRenaming,
    handleStartCellEdit,
    handleSaveCellEdit,
    handleCancelCellEdit,
    isFileEditable,
  } = useFileEditHandlers({
    files,
    vaultPath,
    currentPath,
    user,
    renamingFile,
    setRenamingFile,
    renameValue,
    setRenameValue,
    renameInputRef,
    isCreatingFolder,
    setIsCreatingFolder,
    newFolderName,
    setNewFolderName,
    newFolderInputRef,
    editingCell,
    setEditingCell,
    editValue,
    setEditValue,
    inlineEditInputRef,
    setContextMenu,
    setEmptyContextMenu,
    addToast,
    updatePendingMetadata,
    onRefresh,
  })
  
  // Use the sorting hook for memoized sorted/filtered files
  const { sortedFiles, isSearching } = useSorting({
    files,
    currentPath,
    sortColumn: sortColumn as import('./types').SortColumn,
    sortDirection: sortDirection as import('./types').SortDirection,
    searchQuery,
    searchType,
    hideSolidworksTempFiles,
    toggleSort
  })

  // File selection (row click, shift/ctrl-click range selection)
  const {
    lastClickedIndex,
    setLastClickedIndex,
    handleRowClick: baseHandleRowClick,
  } = useFileSelection({
    sortedFiles,
    selectedFiles,
    setSelectedFiles,
    toggleFileSelection
  })

  // Slow double-click to rename (Windows Explorer-style)
  const { handleSlowDoubleClick, resetSlowDoubleClick } = useSlowDoubleClick({
    onRename: startRenaming,
    canRename: (file) => {
      // Can rename if: not synced OR checked out by current user
      const isSynced = !!file.pdmData
      const isCheckedOutByMe = file.pdmData?.checked_out_by === user?.id
      return !isSynced || isCheckedOutByMe
    },
    allowDirectories: true  // Allow renaming folders too
  })

  // Combined row click handler: selection + slow double-click detection
  const handleRowClick = useCallback((e: React.MouseEvent, file: LocalFile, index: number) => {
    baseHandleRowClick(e, file, index)
    
    // Only trigger slow double-click for normal clicks (not shift/ctrl selections)
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      handleSlowDoubleClick(file)
    }
  }, [baseHandleRowClick, handleSlowDoubleClick])

  // Selection box (marquee/drag-box selection)
  const { selectionBox, selectionHandlers } = useSelectionBox({
    containerRef: tableRef,
    getVisibleItems: () => sortedFiles,
    rowSelector: 'tbody tr',
    setSelectedFiles,
    clearSelection,
    excludeSelector: 'th'  // Don't start selection when clicking headers
  })

  // Delete handler (delete dialog logic and execution)
  const {
    filesToDelete,
    syncedFilesCount,
    showDeleteDialog,
    handleCancelDelete,
    handleToggleDeleteEverywhere,
    handleConfirmDelete,
  } = useDeleteHandler({
    deleteConfirm,
    setDeleteConfirm,
    deleteEverywhere,
    setDeleteEverywhere,
    selectedFiles,
    sortedFiles,
    files,
    user,
    clearSelection,
    addProcessingFolders,
    removeProcessingFolders,
    setUndoStack,
    onRefresh,
    addToast,
    addProgressToast,
    removeToast,
  })

  // Add files and folders handlers
  const { handleAddFiles, handleAddFolder } = useAddFiles({
    vaultPath,
    currentFolder,
    files,
    selectedFiles,
    onRefresh,
    addToast,
    addProgressToast,
    updateProgressToast,
    removeToast,
    setStatusMessage,
    setConflictDialog,
  })

  // Use the folder metrics hook for pre-computed folder stats (O(n) instead of O(n²))
  const folderMetrics = useFolderMetrics({
    files,
    userId: user?.id,
    userFullName: user?.full_name ?? undefined,
    userEmail: user?.email,
    userAvatarUrl: user?.avatar_url ?? undefined,
    hideSolidworksTempFiles
  })
  
  // Use shared selection categories hook for efficient O(n) calculation
  const selectionCategories = useSelectionCategories({
    files,
    selectedFiles,
    userId: user?.id
  })
  
  // Get updatable files from shared categories (replaces local useMemo)
  const selectedUpdatableFiles = selectionCategories.updatable

  // Check if all files in a folder are synced (truly synced, not just content-matched)
  // Uses pre-computed folderMetrics for O(1) lookup
  const isFolderSynced = useCallback((folderPath: string): boolean => {
    const fm = folderMetrics.get(folderPath)
    if (!fm) return false // Empty folder or not found = not synced
    return fm.isSynced
  }, [folderMetrics])

  // Get folder checkout status: 'mine' | 'others' | 'both' | null
  // Uses pre-computed folderMetrics for O(1) lookup
  const getFolderCheckoutStatus = useCallback((folderPath: string): 'mine' | 'others' | 'both' | null => {
    const fm = folderMetrics.get(folderPath)
    if (!fm) return null
    
    if (fm.hasMyCheckedOutFiles && fm.hasOthersCheckedOutFiles) return 'both'
    if (fm.hasMyCheckedOutFiles) return 'mine'
    if (fm.hasOthersCheckedOutFiles) return 'others'
    return null
  }, [folderMetrics])

  // Check if a file/folder is affected by any processing operation
  const isBeingProcessed = useCallback((relativePath: string, isDirectory: boolean = false) => {
    if (isDirectory) {
      return getFolderProcessingOperation(relativePath, processingOperations) !== null
    }
    return getFileProcessingOperation(relativePath, processingOperations) !== null
  }, [processingOperations])
  
  // Load current machine ID once for multi-device checkout detection
  useEffect(() => {
    const loadMachineId = async () => {
      try {
        const { getMachineId } = await import('@/lib/backup')
        const machineId = await getMachineId()
        setCurrentMachineId(machineId)
      } catch {
        setCurrentMachineId(null)
      }
    }
    loadMachineId()
  }, [])
  
  // Load custom metadata columns from organization settings
  useEffect(() => {
    const loadCustomColumns = async () => {
      if (!organization?.id) {
        setCustomMetadataColumns([])
        return
      }
      
      try {
        const { data, error } = await supabase
          .from('file_metadata_columns')
          .select('*')
          .eq('org_id', organization.id)
          .order('sort_order')
        
        if (error) {
          log.error('[FilePane]', 'Failed to load custom metadata columns', { error })
          return
        }
        
        setCustomMetadataColumns(data || [])
      } catch (err) {
        log.error('[FilePane]', 'Failed to load custom metadata columns', { error: err })
      }
    }
    
    loadCustomColumns()
  }, [organization?.id])
  
  // Check if user is watching a file when context menu opens
  useEffect(() => {
    if (contextMenu && user?.id && contextMenu.file.pdmData?.id) {
      isWatchingFile(contextMenu.file.pdmData.id, user.id).then(({ watching }) => {
        if (watching) {
          setWatchingFiles(prev => new Set(prev).add(contextMenu.file.pdmData!.id))
        }
      })
    }
  }, [contextMenu, user?.id])

  // Get the files that the context menu should operate on
  const getContextMenuFiles = (): LocalFile[] => {
    if (!contextMenu) return []
    
    // Only use multi-selection if MORE than 1 file is selected AND the right-clicked file is in that selection
    // This ensures that right-clicking on a single file always operates on just that file
    if (selectedFiles.length > 1 && selectedFiles.includes(contextMenu.file.path)) {
      return sortedFiles.filter(f => selectedFiles.includes(f.path))
    }
    
    // Otherwise just the right-clicked file
    return [contextMenu.file]
  }

  // Handle bulk state change for multiple files
  const handleBulkStateChange = async (filesToChange: LocalFile[], newState: string) => {
    if (!user) return
    
    const syncedFiles = filesToChange.filter(f => f.pdmData?.id && !f.isDirectory)
    if (syncedFiles.length === 0) {
      addToast('info', 'No synced files to update')
      return
    }
    
    let succeeded = 0
    let failed = 0
    
    setStatusMessage(`Changing state to ${newState}...`)
    
    const results = await Promise.all(syncedFiles.map(async (file) => {
      try {
        const result = await updateFileMetadata(file.pdmData!.id, user.id, {
          state: newState as 'not_tracked' | 'wip' | 'in_review' | 'released' | 'obsolete'
        })
        
        if (result.success && result.file) {
          updateFileInStore(file.path, {
            pdmData: { ...file.pdmData!, ...result.file }
          })
          return true
        }
        return false
      } catch {
        return false
      }
    }))
    
    for (const success of results) {
      if (success) succeeded++
      else failed++
    }
    
    setStatusMessage('')
    
    if (failed > 0) {
      addToast('warning', `Updated state for ${succeeded}/${syncedFiles.length} files`)
    } else {
      addToast('success', `Changed ${succeeded} file${succeeded > 1 ? 's' : ''} to ${newState}`)
    }
  }

  // Check out a folder (all synced files in it) - uses command system
  const handleCheckoutFolder = (folder: LocalFile) => {
    executeCommand('checkout', { files: [folder] }, { onRefresh })
  }

  // Check in a folder (all synced files, uploading any changes) - uses command system
  const handleCheckinFolder = (folder: LocalFile) => {
    executeCommand('checkin', { files: [folder] }, { onRefresh })
  }

  // Undo last action
  const handleUndo = async () => {
    if (undoStack.length === 0) {
      addToast('info', 'Nothing to undo')
      return
    }

    const lastAction = undoStack[undoStack.length - 1]
    
    if (lastAction.type === 'delete') {
      // Unfortunately, once deleted via shell.trashItem, we can't programmatically restore
      // The user needs to restore from Recycle Bin manually
      addToast('info', `"${lastAction.file.name}" was moved to Recycle Bin. Restore it from there.`, 6000)
    }
    
    // Remove from undo stack
    setUndoStack(prev => prev.slice(0, -1))
  }

  // Get platform for UI text
  useEffect(() => {
    window.electronAPI?.getPlatform().then(setPlatform)
  }, [])
  
  // Adjust context menu position to stay within viewport
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setContextMenuAdjustedPos(null)
      return
    }
    
    const menu = contextMenuRef.current
    const rect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    
    let newX = contextMenu.x
    let newY = contextMenu.y
    
    // Check right overflow
    if (contextMenu.x + rect.width > viewportWidth - 10) {
      newX = viewportWidth - rect.width - 10
    }
    
    // Check bottom overflow
    if (contextMenu.y + rect.height > viewportHeight - 10) {
      newY = viewportHeight - rect.height - 10
    }
    
    // Ensure minimum position
    newX = Math.max(10, newX)
    newY = Math.max(10, newY)
    
    setContextMenuAdjustedPos({ x: newX, y: newY })
  }, [contextMenu])

  // Helper function to check if a keyboard event matches a keybinding
  // Uses the imported matchesKeybinding utility from file-browser utils
  const checkKeybinding = useCallback((e: KeyboardEvent, action: keyof typeof keybindings): boolean => {
    return matchesKeybinding(e, keybindings[action])
  }, [keybindings])

  // Keyboard navigation and shortcuts (extracted to hook)
  useKeyboardNav({
    files,
    sortedFiles,
    selectedFiles,
    setSelectedFiles,
    lastClickedIndex,
    setLastClickedIndex,
    currentPath,
    vaultPath,
    clipboard,
    setClipboard,
    matchesKeybinding: checkKeybinding,
    navigateToFolder,
    navigateUp,
    handleCopy,
    handleCut,
    handlePaste,
    handleUndo,
    setDeleteConfirm,
    setDeleteEverywhere,
    clearSelection,
    toggleDetailsPanel,
    onRefresh
  })

  const handleRowDoubleClick = async (file: LocalFile) => {
    // Reset slow double-click state on fast double-click (prevents rename trigger)
    resetSlowDoubleClick()
    
    if (file.isDirectory) {
      // Navigate into folder - allow even for cloud-only folders
      navigateToFolder(file.relativePath)
    } else if (file.diffStatus === 'cloud') {
      // Cloud-only file: download first, then open
      const result = await executeCommand('download', { files: [file] }, { onRefresh, silent: true })
      if (result.success && window.electronAPI) {
        window.electronAPI.openFile(file.path)
      }
    } else if (window.electronAPI) {
      // Open file
      window.electronAPI.openFile(file.path)
    }
  }

  // Listen for menu events (File > Add Files / Add Folder)
  useEffect(() => {
    if (!window.electronAPI) return
    
    const cleanup = window.electronAPI.onMenuEvent((event) => {
      if (event === 'menu:add-files') {
        handleAddFiles()
      } else if (event === 'menu:add-folder') {
        handleAddFolder()
      }
    })
    
    return cleanup
  }, [vaultPath, currentFolder, selectedFiles, files]) // Re-subscribe when these deps change

  // Create handlers context value for cell components (eliminates prop drilling)
  const handlersContextValue = useMemo<FilePaneHandlersContextValue>(() => ({
    // Inline action handlers
    handleInlineDownload,
    handleInlineUpload,
    handleInlineCheckout,
    handleInlineCheckin,
    // Computed selection arrays
    selectedDownloadableFiles,
    selectedUploadableFiles,
    selectedCheckoutableFiles,
    selectedCheckinableFiles,
    selectedUpdatableFiles,
    // Status functions
    isBeingProcessed,
    getProcessingOperation,
    getFolderCheckoutStatus,
    isFolderSynced,
    isFileEditable,
    // Config handlers
    canHaveConfigs,
    toggleFileConfigExpansion,
    hasPendingMetadataChanges,
    savingConfigsToSW,
    saveConfigsToSWFile,
    // Edit handlers
    handleRename,
    handleSaveCellEdit,
    handleCancelCellEdit,
    handleStartCellEdit,
  }), [
    handleInlineDownload, handleInlineUpload, handleInlineCheckout, handleInlineCheckin,
    selectedDownloadableFiles, selectedUploadableFiles, selectedCheckoutableFiles,
    selectedCheckinableFiles, selectedUpdatableFiles,
    isBeingProcessed, getProcessingOperation, getFolderCheckoutStatus, isFolderSynced, isFileEditable,
    canHaveConfigs, toggleFileConfigExpansion, hasPendingMetadataChanges,
    savingConfigsToSW, saveConfigsToSWFile,
    handleRename, handleSaveCellEdit, handleCancelCellEdit, handleStartCellEdit,
  ])

  // Simplified renderCellContent - handlers come from context
  const renderCellContent = (file: LocalFile, columnId: string) => {
    return <CellRenderer file={file} columnId={columnId} />
  }

  // Combine default columns with custom metadata columns
  const allColumns = [
    ...columns,
    ...customMetadataColumns
      .filter(c => c.visible)
      .map(c => ({
        id: `custom_${c.name}`,
        label: c.label,
        width: c.width,
        visible: c.visible,
        sortable: c.sortable
      }))
  ]
  
  const visibleColumns = allColumns.filter(c => c.visible)

  // Prepare rename state to pass to context (fixes duplicate state bug)
  const renameStateForContext = {
    renamingFile,
    setRenamingFile,
    renameValue,
    setRenameValue,
    renameInputRef,
    isCreatingFolder,
    setIsCreatingFolder,
    newFolderName,
    setNewFolderName,
    newFolderInputRef,
    editingCell,
    setEditingCell,
    editValue,
    setEditValue,
    inlineEditInputRef
  }

  return (
    <FilePaneProvider 
      onRefresh={onRefresh} 
      customMetadataColumns={customMetadataColumns}
      renameState={renameStateForContext}
      tableRef={tableRef}
      folderMetrics={folderMetrics}
    >
    <FilePaneHandlersProvider handlers={handlersContextValue}>
    <div 
      className="flex-1 flex flex-col overflow-hidden relative min-w-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay - only show for external file drops (from outside the app) */}
      <DragOverlay 
        isVisible={isDraggingOver && isExternalDrag && !dragOverFolder}
        currentFolder={currentFolder}
      />

      {/* Toolbar with breadcrumb - Chrome-style lighter bar */}
      <FileToolbar
        currentPath={currentPath}
        vaultPath={vaultPath}
        vaultName={displayVaultName}
        onNavigate={navigateToFolder}
        onNavigateRoot={navigateToRoot}
        onNavigateUp={navigateUp}
        onNavigateBack={navigateBack}
        onNavigateForward={navigateForward}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onRefresh={() => onRefresh()}
        isSearching={!!isSearching}
        searchQuery={searchQuery}
        searchType={searchType}
        matchCount={sortedFiles.length}
        viewMode={viewMode}
        iconSize={iconSize}
        listRowSize={listRowSize}
        onViewModeChange={setViewMode}
        onIconSizeChange={setIconSize}
        onListRowSizeChange={setListRowSize}
        onAddFiles={handleAddFiles}
        onAddFolder={handleAddFolder}
        platform={platform}
        addToast={addToast}
      />

      {/* File View - List or Icons */}
      <div 
        ref={tableRef} 
        className="flex-1 overflow-auto relative"
        onContextMenu={handleEmptyContextMenu}
        {...selectionHandlers}
      >
        {/* Selection box overlay */}
        {selectionBox && <SelectionBoxOverlay box={selectionBox} />}
        
        {/* Icon Grid View */}
        {viewMode === 'icons' && (
          <FileGridView
            files={sortedFiles}
            allFiles={files}
            iconSize={iconSize}
            selectedFiles={selectedFiles}
            clipboard={clipboard}
            processingPaths={processingOperations}
            currentMachineId={currentMachineId}
            lowercaseExtensions={lowercaseExtensions !== false}
            userId={user?.id}
            userFullName={user?.full_name ?? undefined}
            userEmail={user?.email}
            userAvatarUrl={user?.avatar_url ?? undefined}
            onSelect={handleRowClick}
            onDoubleClick={handleRowDoubleClick}
            onContextMenu={handleContextMenu}
            onDownload={handleInlineDownload}
            onCheckout={handleInlineCheckout}
            onCheckin={handleInlineCheckin}
            onUpload={handleInlineUpload}
          />
        )}
        
        {/* List View Table */}
        {viewMode === 'list' && (
        <table className={`file-table ${selectionBox ? 'selecting' : ''}`}>
          <ColumnHeaders
            columns={visibleColumns}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            resizingColumn={resizingColumn}
            draggingColumn={draggingColumn}
            dragOverColumn={dragOverColumn}
            getColumnLabel={getColumnLabel}
            onSort={toggleSort}
            onResize={handleColumnResize}
            onContextMenu={handleColumnHeaderContextMenu}
            onDragStart={handleColumnDragStart}
            onDragOver={handleColumnDragOver}
            onDragLeave={handleColumnDragLeave}
            onDrop={handleColumnDrop}
            onDragEnd={handleColumnDragEnd}
          />
          <FileListBody
            displayFiles={sortedFiles}
            visibleColumns={visibleColumns}
            isBeingProcessed={isBeingProcessed}
            handleCreateFolder={handleCreateFolder}
            onRowClick={handleRowClick}
            onRowDoubleClick={handleRowDoubleClick}
            onContextMenu={handleContextMenu}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onFolderDragOver={handleFolderDragOver}
            onFolderDragLeave={handleFolderDragLeave}
            onDropOnFolder={handleDropOnFolder}
            onConfigRowClick={handleConfigRowClick}
            onConfigContextMenu={handleConfigContextMenu}
            onConfigDescriptionChange={handleConfigDescriptionChange}
            onConfigTabChange={handleConfigTabChange}
            renderCellContent={renderCellContent}
          />
        </table>
        )}

        {/* Empty state - no vault connected */}
        {(!vaultPath || connectedVaults.length === 0) && <NoVaultEmptyState />}
        
        {/* Empty state - vault connected but no files in current folder */}
        {vaultPath && connectedVaults.length > 0 && sortedFiles.length === 0 && !isLoading && filesLoaded && (
          <EmptyState onAddFiles={handleAddFiles} onAddFolder={handleAddFolder} />
        )}

        {vaultPath && connectedVaults.length > 0 && (isLoading || !filesLoaded) && <LoadingState message="Loading vault..." />}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <FileContextMenu
          contextMenu={contextMenu}
          contextMenuAdjustedPos={contextMenuAdjustedPos}
          onClose={() => setContextMenu(null)}
          getContextMenuFiles={getContextMenuFiles}
          platform={platform}
          onRefresh={onRefresh}
          navigateToFolder={navigateToFolder}
          startRenaming={startRenaming}
          handleCopy={handleCopy}
          handleCut={handleCut}
          handlePaste={handlePaste}
          handleCheckoutFolder={handleCheckoutFolder}
          handleCheckinFolder={handleCheckinFolder}
          handleBulkStateChange={handleBulkStateChange}
          setDetailsPanelTab={setDetailsPanelTab}
          setDetailsPanelVisible={setDetailsPanelVisible}
          handleOpenReviewModal={handleOpenReviewModal}
          handleOpenCheckoutRequestModal={handleOpenCheckoutRequestModal}
          handleOpenMentionModal={handleOpenMentionModal}
          handleOpenECOModal={handleOpenECOModal}
          watchingFiles={watchingFiles}
          isTogglingWatch={isTogglingWatch}
          handleToggleWatch={handleToggleWatch}
          isCreatingShareLink={isCreatingShareLink}
          handleQuickShareLink={handleQuickShareLink}
          setDeleteConfirm={setDeleteConfirm}
          setDeleteEverywhere={setDeleteEverywhere}
          setCustomConfirm={setCustomConfirm}
          setDeleteLocalCheckoutConfirm={setDeleteLocalCheckoutConfirm}
          undoStack={undoStack}
          handleUndo={handleUndo}
          showIgnoreSubmenu={showIgnoreSubmenu}
          setShowIgnoreSubmenu={setShowIgnoreSubmenu}
          showStateSubmenu={showStateSubmenu}
          setShowStateSubmenu={setShowStateSubmenu}
          ignoreSubmenuTimeoutRef={ignoreSubmenuTimeoutRef}
          stateSubmenuTimeoutRef={stateSubmenuTimeoutRef}
        />
      )}

      {/* Configuration context menu */}
      {configContextMenu && (() => {
        const file = files.find(f => f.path === configContextMenu.filePath)
        const selectedConfigNames = getSelectedConfigsForFile(configContextMenu.filePath)
        const configCount = selectedConfigNames.length || 1
        const isPartOrAsm = file?.extension?.toLowerCase() === '.sldprt' || file?.extension?.toLowerCase() === '.sldasm'
        
        return (
          <ConfigContextMenu
            configContextMenu={configContextMenu}
            configCount={configCount}
            isPartOrAsm={isPartOrAsm}
            isExportingConfigs={isExportingConfigs}
            onExportConfigs={handleExportConfigs}
            onClearSelection={() => {
              setSelectedConfigs(new Set())
              setConfigContextMenu(null)
            }}
            onClose={() => {
              setConfigContextMenu(null)
              setSelectedConfigs(new Set())
            }}
          />
        )
      })()}

      {/* Column context menu */}
      {columnContextMenu && (
        <ColumnContextMenu
          x={columnContextMenu.x}
          y={columnContextMenu.y}
          columns={columns}
          getColumnLabel={getColumnLabel}
          onToggleVisibility={toggleColumnVisibility}
          onClose={() => setColumnContextMenu(null)}
        />
      )}

      {/* Empty space context menu */}
      {emptyContextMenu && (
        <EmptyContextMenu
          x={emptyContextMenu.x}
          y={emptyContextMenu.y}
          hasClipboard={!!clipboard}
          hasUndoStack={undoStack.length > 0}
          onNewFolder={startCreatingFolder}
          onAddFiles={handleAddFiles}
          onAddFolder={handleAddFolder}
          onPaste={handlePaste}
          onRefresh={onRefresh}
          onUndo={handleUndo}
          onClose={() => setEmptyContextMenu(null)}
        />
      )}

      {/* File conflict resolution dialog */}
      {conflictDialog && (
        <ConflictDialog
          conflicts={conflictDialog.conflicts}
          nonConflictsCount={conflictDialog.nonConflicts.length}
          onResolve={conflictDialog.onResolve}
          onCancel={() => setConflictDialog(null)}
        />
      )}

      {/* Custom confirmation dialog */}
      {customConfirm && (
        <CustomConfirmDialog
          title={customConfirm.title}
          message={customConfirm.message}
          warning={customConfirm.warning}
          confirmText={customConfirm.confirmText}
          confirmDanger={customConfirm.confirmDanger}
          onConfirm={customConfirm.onConfirm}
          onCancel={() => setCustomConfirm(null)}
        />
      )}

      {/* Delete Local Checkout Confirmation Dialog - only when files are checked out */}
      {deleteLocalCheckoutConfirm && (
        <DeleteLocalCheckoutDialog
          checkedOutFiles={deleteLocalCheckoutConfirm.checkedOutFiles}
          onCheckinFirst={async () => {
            const contextFilesToUse = deleteLocalCheckoutConfirm.contextFiles
            setDeleteLocalCheckoutConfirm(null)
            await executeCommand('checkin', { files: contextFilesToUse }, { onRefresh })
            executeCommand('delete-local', { files: contextFilesToUse }, { onRefresh })
          }}
          onDiscardChanges={() => {
            const contextFilesToUse = deleteLocalCheckoutConfirm.contextFiles
            setDeleteLocalCheckoutConfirm(null)
            executeCommand('delete-local', { files: contextFilesToUse }, { onRefresh })
          }}
          onCancel={() => setDeleteLocalCheckoutConfirm(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <DeleteConfirmDialog
          filesToDelete={filesToDelete}
          deleteEverywhere={deleteEverywhere}
          syncedFilesCount={syncedFilesCount}
          onToggleDeleteEverywhere={handleToggleDeleteEverywhere}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
      
      {/* Review Request Modal */}
      {showReviewModal && reviewModalFile && (
        <ReviewRequestModal
          file={reviewModalFile}
          orgUsers={orgUsers}
          loadingUsers={loadingUsers}
          selectedReviewers={selectedReviewers}
          reviewDueDate={reviewDueDate}
          reviewPriority={reviewPriority}
          reviewMessage={reviewMessage}
          isSubmitting={isSubmittingReview}
          onToggleReviewer={handleToggleReviewer}
          onDueDateChange={setReviewDueDate}
          onPriorityChange={(priority) => setReviewPriority(priority as 'low' | 'normal' | 'high' | 'urgent')}
          onMessageChange={setReviewMessage}
          onSubmit={handleSubmitReviewRequest}
          onClose={() => { setShowReviewModal(false); setSelectedReviewers([]); setReviewMessage(''); setReviewDueDate(''); setReviewPriority('normal'); }}
        />
      )}
      
      {/* Checkout Request Modal */}
      {showCheckoutRequestModal && checkoutRequestFile && (
        <CheckoutRequestModal
          file={checkoutRequestFile}
          message={checkoutRequestMessage}
          isSubmitting={isSubmittingCheckoutRequest}
          onMessageChange={setCheckoutRequestMessage}
          onSubmit={handleSubmitCheckoutRequest}
          onClose={() => { setShowCheckoutRequestModal(false); setCheckoutRequestMessage(''); }}
        />
      )}
      
      {/* Notify/Mention Modal */}
      {showMentionModal && mentionFile && (
        <NotifyModal
          file={mentionFile}
          orgUsers={orgUsers}
          loadingUsers={loadingUsers}
          selectedUsers={selectedMentionUsers}
          message={mentionMessage}
          isSubmitting={isSubmittingMention}
          onToggleUser={handleToggleMentionUser}
          onMessageChange={setMentionMessage}
          onSubmit={handleSubmitMention}
          onClose={() => { setShowMentionModal(false); setSelectedMentionUsers([]); setMentionMessage(''); }}
        />
      )}
      
      {/* Share Link Modal - fallback if clipboard fails */}
      {showShareModal && shareFile && generatedShareLink && (
        <ShareLinkModal
          shareLink={generatedShareLink}
          copied={copiedLink}
          onCopy={handleCopyShareLink}
          onClose={() => { setShowShareModal(false); setGeneratedShareLink(null); }}
        />
      )}
      
      {/* Add to ECO Modal */}
      {showECOModal && ecoFile && (
        <ECOModal
          file={ecoFile}
          activeECOs={activeECOs}
          loadingECOs={loadingECOs}
          selectedECO={selectedECO}
          notes={ecoNotes}
          isSubmitting={isAddingToECO}
          onSelectECO={setSelectedECO}
          onNotesChange={setEcoNotes}
          onSubmit={handleAddToECO}
          onClose={() => { setShowECOModal(false); setSelectedECO(null); setEcoNotes(''); }}
        />
      )}
    </div>
    </FilePaneHandlersProvider>
    </FilePaneProvider>
  )
}
