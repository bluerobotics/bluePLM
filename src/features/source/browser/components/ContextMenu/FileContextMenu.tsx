/**
 * File context menu component
 * Composes action components for a clean, maintainable structure
 */
import React from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'

// Import action components
import {
  OpenActions,
  AssemblyActions,
  FileSystemActions,
  ClipboardActions,
  SyncActions,
  CheckoutActions,
  CollaborationActions,
  DeleteActions,
  ExportActions,
  MetadataActions,
  useContextMenuSelectionState,
} from './actions'

export interface FileContextMenuProps {
  // Core menu data (required)
  contextMenu: { x: number; y: number; file: LocalFile }
  contextMenuAdjustedPos: { x: number; y: number } | null
  onClose: () => void
  
  // Ref for positioning (from useContextMenuState)
  contextMenuRef: React.RefObject<HTMLDivElement | null>
  
  // Files and context
  getContextMenuFiles: () => LocalFile[]
  
  // Platform (not in context)
  platform: string
  
  // Handlers for file operations
  onRefresh: (silent?: boolean) => void
  navigateToFolder: (path: string) => void
  startRenaming: (file: LocalFile) => void
  
  // Clipboard operations
  handleCopy: () => void
  handleCut: () => void
  handlePaste: () => void
  
  // Checkout folder operations
  handleCheckoutFolder: (folder: LocalFile) => void
  handleCheckinFolder: (folder: LocalFile) => void
  
  // State change
  handleBulkStateChange: (files: LocalFile[], newState: string) => void
  
  // Modals and panels
  setDetailsPanelTab: (tab: 'properties' | 'whereused') => void
  setDetailsPanelVisible: (visible: boolean) => void
  handleOpenReviewModal: (file: LocalFile) => void
  handleOpenCheckoutRequestModal: (file: LocalFile) => void
  handleOpenMentionModal: (file: LocalFile) => void
  handleOpenECOModal: (file: LocalFile) => void
  
  // Watch and share
  watchingFiles: Set<string>
  isTogglingWatch: boolean
  handleToggleWatch: (file: LocalFile) => void
  isCreatingShareLink: boolean
  handleQuickShareLink: (file: LocalFile) => void
  
  // Delete operations
  setDeleteConfirm: (file: LocalFile | null) => void
  setDeleteEverywhere: (value: boolean) => void
  setCustomConfirm: (state: {
    title: string
    message: string
    warning?: string
    confirmText: string
    confirmDanger?: boolean
    onConfirm: () => void
  } | null) => void
  setDeleteLocalCheckoutConfirm: (state: {
    checkedOutFiles: LocalFile[]
    allFilesToProcess: LocalFile[]
    contextFiles: LocalFile[]
  } | null) => void
  
  // Undo
  undoStack: Array<{ type: 'delete'; file: LocalFile; originalPath: string }>
  handleUndo: () => void
  
  // Submenu state
  showIgnoreSubmenu: boolean
  setShowIgnoreSubmenu: (value: boolean) => void
  showStateSubmenu: boolean
  setShowStateSubmenu: (value: boolean) => void
  ignoreSubmenuTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
  stateSubmenuTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
  
  // Files currently saving metadata
  savingConfigsToSW?: Set<string>
}

export function FileContextMenu({
  // Core menu data
  contextMenu,
  contextMenuAdjustedPos,
  onClose,
  contextMenuRef,
  getContextMenuFiles,
  platform,
  // Handlers
  onRefresh,
  navigateToFolder,
  startRenaming,
  handleCopy,
  handleCut,
  handlePaste,
  handleCheckoutFolder,
  handleCheckinFolder,
  handleBulkStateChange,
  setDetailsPanelTab,
  setDetailsPanelVisible,
  handleOpenReviewModal,
  handleOpenCheckoutRequestModal,
  handleOpenMentionModal,
  handleOpenECOModal,
  watchingFiles,
  isTogglingWatch,
  handleToggleWatch,
  isCreatingShareLink,
  handleQuickShareLink,
  setDeleteConfirm,
  setDeleteEverywhere,
  setCustomConfirm,
  setDeleteLocalCheckoutConfirm,
  undoStack,
  handleUndo,
  showIgnoreSubmenu,
  setShowIgnoreSubmenu,
  showStateSubmenu,
  setShowStateSubmenu,
  ignoreSubmenuTimeoutRef,
  stateSubmenuTimeoutRef,
  savingConfigsToSW,
}: FileContextMenuProps) {
  // Get user from store
  const { user } = usePDMStore()
  
  // Get context files
  const contextFiles = getContextMenuFiles()
  const multiSelect = contextFiles.length > 1
  const firstFile = contextFiles[0]

  // Use the selection state hook to compute counts and state
  const { counts, state, syncedFilesInSelection, unsyncedFilesInSelection } = 
    useContextMenuSelectionState({
      contextFiles,
      userId: user?.id,
    })

  // Close menu and clear submenus
  const handleCloseMenu = () => {
    onClose()
    setShowIgnoreSubmenu(false)
    setShowStateSubmenu(false)
    if (ignoreSubmenuTimeoutRef.current) {
      clearTimeout(ignoreSubmenuTimeoutRef.current)
    }
    if (stateSubmenuTimeoutRef.current) {
      clearTimeout(stateSubmenuTimeoutRef.current)
    }
  }

  return (
    <>
      {/* Overlay to close menu on click */}
      <div 
        className="fixed inset-0 z-50" 
        onClick={handleCloseMenu}
        onContextMenu={(e) => {
          e.preventDefault()
          handleCloseMenu()
        }}
      />
      
      {/* Context menu */}
      <div 
        ref={contextMenuRef}
        className="context-menu z-[60]"
        style={{ 
          left: contextMenuAdjustedPos?.x ?? contextMenu.x, 
          top: contextMenuAdjustedPos?.y ?? contextMenu.y 
        }}
      >
        {/* Open actions (open file, open folder, open all) */}
        <OpenActions
          contextFiles={contextFiles}
          multiSelect={multiSelect}
          firstFile={firstFile}
          onClose={onClose}
          navigateToFolder={navigateToFolder}
        />
        
        {/* Assembly actions (insert into open SolidWorks assembly) */}
        <AssemblyActions
          contextFiles={contextFiles}
          multiSelect={multiSelect}
          firstFile={firstFile}
          onClose={onClose}
        />
        
        {/* Sync actions (download, ignore, first check in) */}
        <SyncActions
          contextFiles={contextFiles}
          multiSelect={multiSelect}
          firstFile={firstFile}
          onClose={onClose}
          onRefresh={onRefresh}
          counts={counts}
          state={state}
          unsyncedFilesInSelection={unsyncedFilesInSelection}
          showIgnoreSubmenu={showIgnoreSubmenu}
          setShowIgnoreSubmenu={setShowIgnoreSubmenu}
          ignoreSubmenuTimeoutRef={ignoreSubmenuTimeoutRef}
        />
        
        {/* File system actions (show in explorer, copy path, pin, rename) */}
        <FileSystemActions
          contextFiles={contextFiles}
          multiSelect={multiSelect}
          firstFile={firstFile}
          onClose={onClose}
          platform={platform}
          startRenaming={startRenaming}
          userId={user?.id}
        />
        
        {/* Clipboard actions (copy, cut, paste) */}
        <ClipboardActions
          contextFiles={contextFiles}
          multiSelect={multiSelect}
          firstFile={firstFile}
          onClose={onClose}
          handleCopy={handleCopy}
          handleCut={handleCut}
          handlePaste={handlePaste}
        />
        
        {/* Checkout actions (checkout, checkin, discard, force release, change state) */}
        <CheckoutActions
          contextFiles={contextFiles}
          multiSelect={multiSelect}
          firstFile={firstFile}
          onClose={onClose}
          onRefresh={onRefresh}
          counts={counts}
          state={state}
          syncedFilesInSelection={syncedFilesInSelection}
          handleCheckoutFolder={handleCheckoutFolder}
          handleCheckinFolder={handleCheckinFolder}
          handleBulkStateChange={handleBulkStateChange}
          showStateSubmenu={showStateSubmenu}
          setShowStateSubmenu={setShowStateSubmenu}
          stateSubmenuTimeoutRef={stateSubmenuTimeoutRef}
          savingConfigsToSW={savingConfigsToSW}
        />
        
        {/* Collaboration actions (history, where used, properties, review, notify, watch, share, ECO) */}
        <CollaborationActions
          contextFiles={contextFiles}
          multiSelect={multiSelect}
          firstFile={firstFile}
          onClose={onClose}
          onRefresh={onRefresh}
          state={state}
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
        />
        
        {/* Export actions (SolidWorks STEP, IGES, STL, PDF, DXF) */}
        <ExportActions
          contextFiles={contextFiles}
          multiSelect={multiSelect}
          firstFile={firstFile}
          onClose={onClose}
        />
        
        {/* Metadata actions (refresh metadata from SolidWorks files) */}
        <MetadataActions
          contextFiles={contextFiles}
          multiSelect={multiSelect}
          firstFile={firstFile}
          onClose={onClose}
          onRefresh={onRefresh}
        />
        
        {/* Delete actions (remove local, delete locally, delete from server, delete both, undo) */}
        <DeleteActions
          contextFiles={contextFiles}
          multiSelect={multiSelect}
          firstFile={firstFile}
          onClose={onClose}
          onRefresh={onRefresh}
          counts={counts}
          state={state}
          setDeleteConfirm={setDeleteConfirm}
          setDeleteEverywhere={setDeleteEverywhere}
          setCustomConfirm={setCustomConfirm}
          setDeleteLocalCheckoutConfirm={setDeleteLocalCheckoutConfirm}
          undoStack={undoStack}
          handleUndo={handleUndo}
        />
      </div>
    </>
  )
}
