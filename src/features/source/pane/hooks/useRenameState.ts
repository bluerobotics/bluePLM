import { useState, useCallback, useRef } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface UseRenameStateReturn {
  // Renaming file
  renamingFile: LocalFile | null
  setRenamingFile: (file: LocalFile | null) => void
  renameValue: string
  setRenameValue: (value: string) => void
  renameInputRef: React.RefObject<HTMLInputElement | null>
  
  // New folder creation
  isCreatingFolder: boolean
  setIsCreatingFolder: (creating: boolean) => void
  newFolderName: string
  setNewFolderName: (name: string) => void
  newFolderInputRef: React.RefObject<HTMLInputElement | null>
  
  // Inline cell editing
  editingCell: { path: string; column: string } | null
  setEditingCell: (cell: { path: string; column: string } | null) => void
  editValue: string
  setEditValue: (value: string) => void
  inlineEditInputRef: React.RefObject<HTMLInputElement | null>
  
  // Helper functions
  startRename: (file: LocalFile) => void
  cancelRename: () => void
  startNewFolder: () => void
  cancelNewFolder: () => void
  startCellEdit: (path: string, column: string, currentValue: string) => void
  cancelCellEdit: () => void
}

/**
 * Hook for managing rename and inline editing state.
 */
export function useRenameState(): UseRenameStateReturn {
  // Renaming file
  const [renamingFile, setRenamingFile] = useState<LocalFile | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  
  // New folder creation
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderInputRef = useRef<HTMLInputElement | null>(null)
  
  // Inline cell editing
  const [editingCell, setEditingCell] = useState<{ path: string; column: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const inlineEditInputRef = useRef<HTMLInputElement | null>(null)
  
  const startRename = useCallback((file: LocalFile) => {
    const name = file.name
    const extension = file.isDirectory ? '' : (name.includes('.') ? '.' + name.split('.').pop() : '')
    const nameWithoutExt = extension ? name.slice(0, -extension.length) : name
    
    setRenamingFile(file)
    setRenameValue(nameWithoutExt)
  }, [])
  
  const cancelRename = useCallback(() => {
    setRenamingFile(null)
    setRenameValue('')
  }, [])
  
  const startNewFolder = useCallback(() => {
    setIsCreatingFolder(true)
    setNewFolderName('')
  }, [])
  
  const cancelNewFolder = useCallback(() => {
    setIsCreatingFolder(false)
    setNewFolderName('')
  }, [])
  
  const startCellEdit = useCallback((path: string, column: string, currentValue: string) => {
    setEditingCell({ path, column })
    setEditValue(currentValue)
  }, [])
  
  const cancelCellEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])
  
  return {
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
    startRename,
    cancelRename,
    startNewFolder,
    cancelNewFolder,
    startCellEdit,
    cancelCellEdit,
  }
}
