import { useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import type { ContextMenuState, EmptyContextMenuState } from './useContextMenuState'
import { logContextMenu } from '@/lib/userActionLogger'

export interface ContextMenuHandlersDeps {
  // Selection state
  selectedFiles: string[]
  setSelectedFiles: (paths: string[]) => void
  
  // Context menu state setters
  setContextMenu: (state: ContextMenuState | null) => void
  setEmptyContextMenu: (state: EmptyContextMenuState | null) => void
}

export interface UseContextMenuHandlersReturn {
  handleContextMenu: (e: React.MouseEvent, file: LocalFile) => void
  handleEmptyContextMenu: (e: React.MouseEvent) => void
}

/**
 * Hook for managing context menu event handlers.
 * Works with useContextMenuState for state management.
 */
export function useContextMenuHandlers(deps: ContextMenuHandlersDeps): UseContextMenuHandlersReturn {
  const {
    selectedFiles,
    setSelectedFiles,
    setContextMenu,
    setEmptyContextMenu,
  } = deps

  const handleContextMenu = useCallback((e: React.MouseEvent, file: LocalFile) => {
    e.preventDefault()
    e.stopPropagation()
    logContextMenu('Opened file context menu', file.relativePath)
    setEmptyContextMenu(null)
    
    // Only keep multi-selection if there are multiple files selected AND 
    // the right-clicked file is part of that selection
    // Otherwise, select just the right-clicked file
    if (!(selectedFiles.length > 1 && selectedFiles.includes(file.path))) {
      setSelectedFiles([file.path])
    }
    
    // Move context menu to new position (works even if already open)
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }, [selectedFiles, setSelectedFiles, setContextMenu, setEmptyContextMenu])

  const handleEmptyContextMenu = useCallback((e: React.MouseEvent) => {
    // Only trigger if clicking on empty space, not on a file row
    const target = e.target as HTMLElement
    if (target.closest('tr') && target.closest('tbody')) return
    
    e.preventDefault()
    setContextMenu(null)
    // Move empty context menu to new position (works even if already open)
    setEmptyContextMenu({ x: e.clientX, y: e.clientY })
  }, [setContextMenu, setEmptyContextMenu])

  return {
    handleContextMenu,
    handleEmptyContextMenu,
  }
}
