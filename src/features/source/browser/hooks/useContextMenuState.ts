import { useState, useRef } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface ContextMenuState {
  x: number
  y: number
  file: LocalFile
}

export interface EmptyContextMenuState {
  x: number
  y: number
}

export interface ColumnContextMenuState {
  x: number
  y: number
}

export interface ConfigContextMenuState {
  x: number
  y: number
  filePath: string
  configName: string
}

export interface RefRowContextMenuState {
  x: number
  y: number
  item: import('@/stores/types').DrawingRefItem
}

export interface UseContextMenuStateReturn {
  // File context menu
  contextMenu: ContextMenuState | null
  setContextMenu: (state: ContextMenuState | null) => void
  contextMenuAdjustedPos: { x: number; y: number } | null
  setContextMenuAdjustedPos: (pos: { x: number; y: number } | null) => void
  contextMenuRef: React.RefObject<HTMLDivElement | null>
  
  // Empty context menu
  emptyContextMenu: EmptyContextMenuState | null
  setEmptyContextMenu: (state: EmptyContextMenuState | null) => void
  emptyContextMenuAdjustedPos: { x: number; y: number } | null
  setEmptyContextMenuAdjustedPos: (pos: { x: number; y: number } | null) => void
  emptyContextMenuRef: React.RefObject<HTMLDivElement | null>
  
  // Column context menu
  columnContextMenu: ColumnContextMenuState | null
  setColumnContextMenu: (state: ColumnContextMenuState | null) => void
  
  // Config context menu
  configContextMenu: ConfigContextMenuState | null
  setConfigContextMenu: (state: ConfigContextMenuState | null) => void
  
  // Ref row context menu (for DrawingRefRow / ConfigDrawingRow)
  refRowContextMenu: RefRowContextMenuState | null
  setRefRowContextMenu: (state: RefRowContextMenuState | null) => void
  
  // Submenus
  showIgnoreSubmenu: boolean
  setShowIgnoreSubmenu: (show: boolean) => void
  showStateSubmenu: boolean
  setShowStateSubmenu: (show: boolean) => void
  ignoreSubmenuTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
  stateSubmenuTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
  
  // Close all menus
  closeAllMenus: () => void
}

export function useContextMenuState(): UseContextMenuStateReturn {
  // File context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [contextMenuAdjustedPos, setContextMenuAdjustedPos] = useState<{ x: number; y: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  
  // Empty area context menu
  const [emptyContextMenu, setEmptyContextMenu] = useState<EmptyContextMenuState | null>(null)
  const [emptyContextMenuAdjustedPos, setEmptyContextMenuAdjustedPos] = useState<{ x: number; y: number } | null>(null)
  const emptyContextMenuRef = useRef<HTMLDivElement | null>(null)
  
  // Column header context menu
  const [columnContextMenu, setColumnContextMenu] = useState<ColumnContextMenuState | null>(null)
  
  // Configuration context menu
  const [configContextMenu, setConfigContextMenu] = useState<ConfigContextMenuState | null>(null)
  
  // Ref row context menu (DrawingRefRow / ConfigDrawingRow)
  const [refRowContextMenu, setRefRowContextMenu] = useState<RefRowContextMenuState | null>(null)
  
  // Submenus
  const [showIgnoreSubmenu, setShowIgnoreSubmenu] = useState(false)
  const [showStateSubmenu, setShowStateSubmenu] = useState(false)
  const ignoreSubmenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const stateSubmenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const closeAllMenus = () => {
    setContextMenu(null)
    setContextMenuAdjustedPos(null)
    setEmptyContextMenu(null)
    setEmptyContextMenuAdjustedPos(null)
    setColumnContextMenu(null)
    setConfigContextMenu(null)
    setRefRowContextMenu(null)
    setShowIgnoreSubmenu(false)
    setShowStateSubmenu(false)
    if (ignoreSubmenuTimeoutRef.current) {
      clearTimeout(ignoreSubmenuTimeoutRef.current)
    }
    if (stateSubmenuTimeoutRef.current) {
      clearTimeout(stateSubmenuTimeoutRef.current)
    }
  }
  
  return {
    contextMenu,
    setContextMenu,
    contextMenuAdjustedPos,
    setContextMenuAdjustedPos,
    contextMenuRef,
    emptyContextMenu,
    setEmptyContextMenu,
    emptyContextMenuAdjustedPos,
    setEmptyContextMenuAdjustedPos,
    emptyContextMenuRef,
    columnContextMenu,
    setColumnContextMenu,
    configContextMenu,
    setConfigContextMenu,
    refRowContextMenu,
    setRefRowContextMenu,
    showIgnoreSubmenu,
    setShowIgnoreSubmenu,
    showStateSubmenu,
    setShowStateSubmenu,
    ignoreSubmenuTimeoutRef,
    stateSubmenuTimeoutRef,
    closeAllMenus,
  }
}
