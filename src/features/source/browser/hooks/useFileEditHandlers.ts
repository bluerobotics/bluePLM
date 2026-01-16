import { useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'
import { buildFullPath } from '@/lib/utils/path'

// SolidWorks file extensions that support custom properties
const SW_EXTENSIONS = ['.sldprt', '.sldasm', '.slddrw']

export interface FileEditHandlersDeps {
  // State
  files: LocalFile[]
  vaultPath: string | null
  currentPath: string
  user: { id: string } | null
  
  // Rename state
  renamingFile: LocalFile | null
  setRenamingFile: (file: LocalFile | null) => void
  renameValue: string
  setRenameValue: (value: string) => void
  renameInputRef: React.RefObject<HTMLInputElement | null>
  
  // New folder state
  isCreatingFolder: boolean
  setIsCreatingFolder: (creating: boolean) => void
  newFolderName: string
  setNewFolderName: (name: string) => void
  newFolderInputRef: React.RefObject<HTMLInputElement | null>
  
  // Inline edit state
  editingCell: { path: string; column: string } | null
  setEditingCell: (cell: { path: string; column: string } | null) => void
  editValue: string
  setEditValue: (value: string) => void
  inlineEditInputRef: React.RefObject<HTMLInputElement | null>
  
  // Context menu state
  setContextMenu: (state: { x: number; y: number; file: LocalFile } | null) => void
  setEmptyContextMenu: (state: { x: number; y: number } | null) => void
  
  // Toast and store actions
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void
  updatePendingMetadata: (path: string, updates: { part_number?: string | null; description?: string | null; revision?: string }) => void
  onRefresh: (silent?: boolean) => void
  
  // Auto-save to SolidWorks file
  saveConfigsToSWFile: (file: LocalFile) => Promise<void>
}

export interface UseFileEditHandlersReturn {
  handleCreateFolder: () => Promise<void>
  startCreatingFolder: () => void
  handleRename: () => Promise<void>
  startRenaming: (file: LocalFile) => void
  handleStartCellEdit: (file: LocalFile, column: string) => void
  handleSaveCellEdit: () => Promise<void>
  handleCancelCellEdit: () => void
  isFileEditable: (file: LocalFile) => boolean
}

/**
 * Hook for managing file editing operations: create folder, rename, inline cell editing.
 */
export function useFileEditHandlers(deps: FileEditHandlersDeps): UseFileEditHandlersReturn {
  const {
    files,
    vaultPath,
    currentPath,
    user,
    renamingFile,
    setRenamingFile,
    renameValue,
    setRenameValue,
    renameInputRef,
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
    saveConfigsToSWFile,
  } = deps

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim() || !vaultPath || !window.electronAPI) {
      setIsCreatingFolder(false)
      setNewFolderName('')
      return
    }

    const folderName = newFolderName.trim()
    const folderPath = currentPath 
      ? buildFullPath(vaultPath, `${currentPath}/${folderName}`)
      : buildFullPath(vaultPath, folderName)

    try {
      const result = await window.electronAPI.createFolder(folderPath)
      if (result.success) {
        addToast('success', `Created folder "${folderName}"`)
        onRefresh()
      } else {
        addToast('error', `Failed to create folder: ${result.error}`)
      }
    } catch (err) {
      addToast('error', `Failed to create folder: ${err instanceof Error ? err.message : String(err)}`)
    }

    setIsCreatingFolder(false)
    setNewFolderName('')
  }, [newFolderName, vaultPath, currentPath, setIsCreatingFolder, setNewFolderName, addToast, onRefresh])

  const startCreatingFolder = useCallback(() => {
    setEmptyContextMenu(null)
    setIsCreatingFolder(true)
    setNewFolderName('New Folder')
    // Focus input after render
    setTimeout(() => {
      newFolderInputRef.current?.focus()
      newFolderInputRef.current?.select()
    }, 10)
  }, [setEmptyContextMenu, setIsCreatingFolder, setNewFolderName, newFolderInputRef])

  const startRenaming = useCallback((file: LocalFile) => {
    setContextMenu(null)
    setRenamingFile(file)
    setRenameValue(file.name)
    // Focus input after render
    setTimeout(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }, 10)
  }, [setContextMenu, setRenamingFile, setRenameValue, renameInputRef])

  const handleRename = useCallback(async () => {
    if (!renamingFile || !renameValue.trim() || !vaultPath) {
      setRenamingFile(null)
      setRenameValue('')
      return
    }

    const newName = renameValue.trim()
    if (newName === renamingFile.name) {
      setRenamingFile(null)
      setRenameValue('')
      return
    }

    // Use command system for rename (handles both local and server)
    await executeCommand('rename', { file: renamingFile, newName }, { onRefresh })
    
    setRenamingFile(null)
    setRenameValue('')
  }, [renamingFile, renameValue, vaultPath, setRenamingFile, setRenameValue, onRefresh])

  // Check if file metadata is editable
  // - Unsynced files (no pdmData.id): always editable (local-only files)
  // - Synced files (has pdmData.id): must be checked out by current user
  const isFileEditable = useCallback((file: LocalFile): boolean => {
    // Unsynced local files are always editable (allows setting BR number before first sync)
    if (!file.pdmData?.id) {
      return true
    }
    // Synced files must be checked out by current user
    return file.pdmData?.checked_out_by === user?.id
  }, [user?.id])

  // Handle inline cell editing for metadata fields (itemNumber, description, revision, state)
  const handleStartCellEdit = useCallback((file: LocalFile, column: string) => {
    // Check if user is logged in
    if (!user?.id) {
      addToast('info', 'Sign in to edit metadata')
      return
    }
    
    // Check drawing field lockouts (these fields are typically inherited from the model)
    const isDrawing = file.extension?.toLowerCase() === '.slddrw'
    if (isDrawing) {
      const { lockDrawingRevision, lockDrawingItemNumber, lockDrawingDescription } = usePDMStore.getState()
      
      if (column === 'revision' && lockDrawingRevision) {
        addToast('info', 'Drawing revision is driven by the drawing file')
        return
      }
      if (column === 'itemNumber' && lockDrawingItemNumber) {
        addToast('info', 'Drawing item number is inherited from the referenced model')
        return
      }
      if (column === 'description' && lockDrawingDescription) {
        addToast('info', 'Drawing description is inherited from the referenced model')
        return
      }
    }
    
    // For synced files, check checkout status
    if (file.pdmData?.id) {
      if (!file.pdmData.checked_out_by) {
        addToast('info', 'Check out file to edit metadata')
        return
      }
      
      if (file.pdmData.checked_out_by !== user.id) {
        const checkedOutUser = (file.pdmData as any).checked_out_user
        const checkedOutName = checkedOutUser?.full_name || checkedOutUser?.email || 'another user'
        addToast('info', `File is checked out by ${checkedOutName}`)
        return
      }
    }
    // Unsynced files (no pdmData.id) are always editable - allows setting metadata before first sync
    
    // Get the current value based on column (check pendingMetadata first, then pdmData)
    let currentValue = ''
    switch (column) {
      case 'itemNumber':
        currentValue = file.pendingMetadata?.part_number ?? file.pdmData?.part_number ?? ''
        break
      case 'description':
        currentValue = file.pendingMetadata?.description ?? file.pdmData?.description ?? ''
        break
      case 'revision':
        currentValue = file.pendingMetadata?.revision ?? file.pdmData?.revision ?? 'A'
        break
    }
    
    setEditingCell({ path: file.path, column })
    setEditValue(currentValue)
    
    setTimeout(() => {
      inlineEditInputRef.current?.focus()
      inlineEditInputRef.current?.select()
    }, 0)
  }, [user?.id, addToast, setEditingCell, setEditValue, inlineEditInputRef])
  
  const handleSaveCellEdit = useCallback(async () => {
    if (!editingCell || !user) {
      setEditingCell(null)
      setEditValue('')
      return
    }
    
    const file = files.find(f => f.path === editingCell.path)
    if (!file) {
      setEditingCell(null)
      setEditValue('')
      return
    }
    // Allow saving for both synced and unsynced files
    // Unsynced files store metadata in pendingMetadata which gets synced on first upload
    
    const trimmedValue = editValue.trim()
    
    // Check if value actually changed (consider pending metadata too)
    let currentValue = ''
    switch (editingCell.column) {
      case 'itemNumber':
        currentValue = file.pendingMetadata?.part_number !== undefined 
          ? (file.pendingMetadata.part_number || '') 
          : (file.pdmData?.part_number || '')
        break
      case 'description':
        currentValue = file.pendingMetadata?.description !== undefined 
          ? (file.pendingMetadata.description || '') 
          : (file.pdmData?.description || '')
        break
      case 'revision':
        currentValue = file.pendingMetadata?.revision !== undefined 
          ? file.pendingMetadata.revision 
          : (file.pdmData?.revision || 'A')
        break
    }
    
    if (trimmedValue === currentValue) {
      setEditingCell(null)
      setEditValue('')
      return
    }
    
    // For item number, description, revision - save locally only (syncs on check-in)
    const pendingUpdates: { part_number?: string | null; description?: string | null; revision?: string } = {}
    switch (editingCell.column) {
        case 'itemNumber':
          pendingUpdates.part_number = trimmedValue || null
          break
        case 'description':
          pendingUpdates.description = trimmedValue || null
          break
        case 'revision':
          if (!trimmedValue) {
            addToast('error', 'Revision cannot be empty')
            return
          }
          pendingUpdates.revision = trimmedValue.toUpperCase()
          break
    }
    
    // Update pending metadata in store
    updatePendingMetadata(file.path, pendingUpdates)
    
    // Clear edit state first so UI is responsive
    setEditingCell(null)
    setEditValue('')
    
    // Auto-save to SolidWorks file if applicable
    const ext = file.extension?.toLowerCase() || ''
    if (SW_EXTENSIONS.includes(ext)) {
      // Need to get updated file with new pending metadata
      const updatedFile = { ...file, pendingMetadata: { ...file.pendingMetadata, ...pendingUpdates } }
      await saveConfigsToSWFile(updatedFile)
    }
  }, [editingCell, user, files, editValue, setEditingCell, setEditValue, addToast, updatePendingMetadata, saveConfigsToSWFile])
  
  const handleCancelCellEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [setEditingCell, setEditValue])

  return {
    handleCreateFolder,
    startCreatingFolder,
    handleRename,
    startRenaming,
    handleStartCellEdit,
    handleSaveCellEdit,
    handleCancelCellEdit,
    isFileEditable,
  }
}
