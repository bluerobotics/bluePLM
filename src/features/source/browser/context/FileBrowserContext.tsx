import { createContext, useContext, useState, useRef, useMemo, useEffect, type ReactNode } from 'react'
import { usePDMStore, type LocalFile } from '@/stores/pdmStore'
import type { 
  ContextMenuState, 
  ColumnContextMenuState,
  ConfigContextMenuState,
  CustomConfirmState,
  DeleteLocalCheckoutConfirmState,
  ConflictDialogState,
  SelectionBox,
  ConfigWithDepth,
  FolderMetrics
} from '../types'
import type { FileMetadataColumn } from '@/types/database'

// Context value type - provides all state needed by FileBrowser child components
export interface FileBrowserContextValue {
  // Core state from store
  files: LocalFile[]
  selectedFiles: string[]
  currentFolder: string
  vaultPath: string | null
  user: { id: string; avatar_url?: string | null; full_name?: string | null; email?: string } | null
  
  // Store-derived settings
  columns: { id: string; label: string; width: number; visible: boolean; sortable: boolean }[]
  lowercaseExtensions: boolean
  listRowSize: number
  
  // Custom metadata columns (from organization)
  customMetadataColumns: FileMetadataColumn[]
  
  // Local state
  contextMenu: ContextMenuState | null
  setContextMenu: (menu: ContextMenuState | null) => void
  emptyContextMenu: { x: number; y: number } | null
  setEmptyContextMenu: (menu: { x: number; y: number } | null) => void
  columnContextMenu: ColumnContextMenuState | null
  setColumnContextMenu: (menu: ColumnContextMenuState | null) => void
  configContextMenu: ConfigContextMenuState | null
  setConfigContextMenu: (menu: ConfigContextMenuState | null) => void
  
  // Drag state
  isDraggingOver: boolean
  setIsDraggingOver: (dragging: boolean) => void
  isExternalDrag: boolean
  setIsExternalDrag: (external: boolean) => void
  dragOverFolder: string | null
  setDragOverFolder: (folder: string | null) => void
  draggedFiles: LocalFile[]
  setDraggedFiles: (files: LocalFile[]) => void
  
  // Selection
  selectionBox: SelectionBox | null
  setSelectionBox: (box: SelectionBox | null) => void
  lastClickedIndex: number | null
  setLastClickedIndex: (index: number | null) => void
  
  // Rename state
  renamingFile: LocalFile | null
  setRenamingFile: (file: LocalFile | null) => void
  renameValue: string
  setRenameValue: (value: string) => void
  
  // Delete state
  deleteConfirm: LocalFile | null
  setDeleteConfirm: (file: LocalFile | null) => void
  deleteEverywhere: boolean
  setDeleteEverywhere: (everywhere: boolean) => void
  
  // Dialog states
  customConfirm: CustomConfirmState | null
  setCustomConfirm: (confirm: CustomConfirmState | null) => void
  deleteLocalCheckoutConfirm: DeleteLocalCheckoutConfirmState | null
  setDeleteLocalCheckoutConfirm: (confirm: DeleteLocalCheckoutConfirmState | null) => void
  conflictDialog: ConflictDialogState | null
  setConflictDialog: (dialog: ConflictDialogState | null) => void
  
  // Column state
  resizingColumn: string | null
  setResizingColumn: (column: string | null) => void
  draggingColumn: string | null
  setDraggingColumn: (column: string | null) => void
  dragOverColumn: string | null
  setDragOverColumn: (column: string | null) => void
  
  // Configuration state (SolidWorks)
  expandedConfigFiles: Set<string>
  setExpandedConfigFiles: React.Dispatch<React.SetStateAction<Set<string>>>
  fileConfigurations: Map<string, ConfigWithDepth[]>
  setFileConfigurations: React.Dispatch<React.SetStateAction<Map<string, ConfigWithDepth[]>>>
  loadingConfigs: Set<string>
  setLoadingConfigs: React.Dispatch<React.SetStateAction<Set<string>>>
  selectedConfigs: Set<string>
  setSelectedConfigs: React.Dispatch<React.SetStateAction<Set<string>>>
  
  // Clipboard
  clipboard: { files: LocalFile[]; operation: 'copy' | 'cut' } | null
  setClipboard: (clipboard: { files: LocalFile[]; operation: 'copy' | 'cut' } | null) => void
  
  // Editing
  editingCell: { path: string; column: string } | null
  setEditingCell: (cell: { path: string; column: string } | null) => void
  editValue: string
  setEditValue: (value: string) => void
  
  // New folder
  isCreatingFolder: boolean
  setIsCreatingFolder: (creating: boolean) => void
  newFolderName: string
  setNewFolderName: (name: string) => void
  
  // Machine ID
  currentMachineId: string | null
  
  // Folder metrics (computed from files)
  folderMetrics: Map<string, FolderMetrics>
  setFolderMetrics: (metrics: Map<string, FolderMetrics>) => void
  
  // Inline action hover states (for multi-select highlighting)
  isDownloadHovered: boolean
  setIsDownloadHovered: (hovered: boolean) => void
  isUploadHovered: boolean
  setIsUploadHovered: (hovered: boolean) => void
  isCheckoutHovered: boolean
  setIsCheckoutHovered: (hovered: boolean) => void
  isCheckinHovered: boolean
  setIsCheckinHovered: (hovered: boolean) => void
  isUpdateHovered: boolean
  setIsUpdateHovered: (hovered: boolean) => void
  
  // Refs
  tableRef: React.RefObject<HTMLDivElement | null>
  contextMenuRef: React.RefObject<HTMLDivElement | null>
  renameInputRef: React.RefObject<HTMLInputElement | null>
  newFolderInputRef: React.RefObject<HTMLInputElement | null>
  inlineEditInputRef: React.RefObject<HTMLInputElement | null>
  
  // Callbacks
  onRefresh: (silent?: boolean) => void
}

const FileBrowserContext = createContext<FileBrowserContextValue | null>(null)

export interface FileBrowserProviderProps {
  children: ReactNode
  onRefresh: (silent?: boolean) => void
  /** Optional custom metadata columns from organization */
  customMetadataColumns?: FileMetadataColumn[]
}

export function FileBrowserProvider({ children, onRefresh, customMetadataColumns = [] }: FileBrowserProviderProps) {
  // Get store state
  const files = usePDMStore(s => s.files)
  const selectedFiles = usePDMStore(s => s.selectedFiles)
  const currentFolder = usePDMStore(s => s.currentFolder)
  const vaultPath = usePDMStore(s => s.vaultPath)
  const user = usePDMStore(s => s.user)
  const columns = usePDMStore(s => s.columns)
  const lowercaseExtensions = usePDMStore(s => s.lowercaseExtensions)
  const listRowSize = usePDMStore(s => s.listRowSize)
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [emptyContextMenu, setEmptyContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [columnContextMenu, setColumnContextMenu] = useState<ColumnContextMenuState | null>(null)
  const [configContextMenu, setConfigContextMenu] = useState<ConfigContextMenuState | null>(null)
  
  // Drag state
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isExternalDrag, setIsExternalDrag] = useState(false)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [draggedFiles, setDraggedFiles] = useState<LocalFile[]>([])
  
  // Selection
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)
  
  // Rename state
  const [renamingFile, setRenamingFile] = useState<LocalFile | null>(null)
  const [renameValue, setRenameValue] = useState('')
  
  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<LocalFile | null>(null)
  const [deleteEverywhere, setDeleteEverywhere] = useState(false)
  
  // Dialog states
  const [customConfirm, setCustomConfirm] = useState<CustomConfirmState | null>(null)
  const [deleteLocalCheckoutConfirm, setDeleteLocalCheckoutConfirm] = useState<DeleteLocalCheckoutConfirmState | null>(null)
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState | null>(null)
  
  // Column state
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  
  // Configuration state
  const [expandedConfigFiles, setExpandedConfigFiles] = useState<Set<string>>(new Set())
  const [fileConfigurations, setFileConfigurations] = useState<Map<string, ConfigWithDepth[]>>(new Map())
  const [loadingConfigs, setLoadingConfigs] = useState<Set<string>>(new Set())
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(new Set())
  
  // Clipboard
  const [clipboard, setClipboard] = useState<{ files: LocalFile[]; operation: 'copy' | 'cut' } | null>(null)
  
  // Editing
  const [editingCell, setEditingCell] = useState<{ path: string; column: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  
  // New folder
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  
  // Machine ID (loaded once)
  const [currentMachineId, setCurrentMachineId] = useState<string | null>(null)
  
  // Folder metrics
  const [folderMetrics, setFolderMetrics] = useState<Map<string, FolderMetrics>>(new Map())
  
  // Inline action hover states
  const [isDownloadHovered, setIsDownloadHovered] = useState(false)
  const [isUploadHovered, setIsUploadHovered] = useState(false)
  const [isCheckoutHovered, setIsCheckoutHovered] = useState(false)
  const [isCheckinHovered, setIsCheckinHovered] = useState(false)
  const [isUpdateHovered, setIsUpdateHovered] = useState(false)
  
  // Refs
  const tableRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const newFolderInputRef = useRef<HTMLInputElement>(null)
  const inlineEditInputRef = useRef<HTMLInputElement>(null)
  
  // Load machine ID on mount
  useEffect(() => {
    window.electronAPI?.getMachineId?.().then((id) => {
      if (id) setCurrentMachineId(id)
    })
  }, [])
  
  const value = useMemo<FileBrowserContextValue>(() => ({
    // Core state
    files,
    selectedFiles,
    currentFolder,
    vaultPath,
    user,
    
    // Store-derived settings
    columns,
    lowercaseExtensions,
    listRowSize,
    
    // Custom metadata columns
    customMetadataColumns,
    
    // Context menus
    contextMenu, setContextMenu,
    emptyContextMenu, setEmptyContextMenu,
    columnContextMenu, setColumnContextMenu,
    configContextMenu, setConfigContextMenu,
    
    // Drag
    isDraggingOver, setIsDraggingOver,
    isExternalDrag, setIsExternalDrag,
    dragOverFolder, setDragOverFolder,
    draggedFiles, setDraggedFiles,
    
    // Selection
    selectionBox, setSelectionBox,
    lastClickedIndex, setLastClickedIndex,
    
    // Rename
    renamingFile, setRenamingFile,
    renameValue, setRenameValue,
    
    // Delete
    deleteConfirm, setDeleteConfirm,
    deleteEverywhere, setDeleteEverywhere,
    
    // Dialogs
    customConfirm, setCustomConfirm,
    deleteLocalCheckoutConfirm, setDeleteLocalCheckoutConfirm,
    conflictDialog, setConflictDialog,
    
    // Columns
    resizingColumn, setResizingColumn,
    draggingColumn, setDraggingColumn,
    dragOverColumn, setDragOverColumn,
    
    // Configurations
    expandedConfigFiles, setExpandedConfigFiles,
    fileConfigurations, setFileConfigurations,
    loadingConfigs, setLoadingConfigs,
    selectedConfigs, setSelectedConfigs,
    
    // Clipboard
    clipboard, setClipboard,
    
    // Editing
    editingCell, setEditingCell,
    editValue, setEditValue,
    
    // New folder
    isCreatingFolder, setIsCreatingFolder,
    newFolderName, setNewFolderName,
    
    // Machine ID
    currentMachineId,
    
    // Folder metrics
    folderMetrics, setFolderMetrics,
    
    // Inline action hover states
    isDownloadHovered, setIsDownloadHovered,
    isUploadHovered, setIsUploadHovered,
    isCheckoutHovered, setIsCheckoutHovered,
    isCheckinHovered, setIsCheckinHovered,
    isUpdateHovered, setIsUpdateHovered,
    
    // Refs
    tableRef,
    contextMenuRef,
    renameInputRef,
    newFolderInputRef,
    inlineEditInputRef,
    
    // Callbacks
    onRefresh,
  }), [
    files, selectedFiles, currentFolder, vaultPath, user,
    columns, lowercaseExtensions, listRowSize, customMetadataColumns,
    contextMenu, emptyContextMenu, columnContextMenu, configContextMenu,
    isDraggingOver, isExternalDrag, dragOverFolder, draggedFiles,
    selectionBox, lastClickedIndex,
    renamingFile, renameValue,
    deleteConfirm, deleteEverywhere,
    customConfirm, deleteLocalCheckoutConfirm, conflictDialog,
    resizingColumn, draggingColumn, dragOverColumn,
    expandedConfigFiles, fileConfigurations, loadingConfigs, selectedConfigs,
    clipboard, editingCell, editValue,
    isCreatingFolder, newFolderName,
    currentMachineId, folderMetrics,
    isDownloadHovered, isUploadHovered, isCheckoutHovered, isCheckinHovered, isUpdateHovered,
    onRefresh
  ])
  
  return (
    <FileBrowserContext.Provider value={value}>
      {children}
    </FileBrowserContext.Provider>
  )
}

export function useFileBrowserContext() {
  const context = useContext(FileBrowserContext)
  if (!context) {
    throw new Error('useFileBrowserContext must be used within FileBrowserProvider')
  }
  return context
}
