import { useState, useRef, useCallback } from 'react'
import { logExplorer } from '@/lib/userActionLogger'

export interface UseNavigationHistoryOptions {
  initialPath?: string
  setCurrentFolder: (path: string) => void
  expandedFolders: Set<string>
  toggleFolder: (path: string) => void
  tabsEnabled?: boolean
  activeTabId?: string | null
  updateTabFolder?: (tabId: string, folder: string) => void
}

export interface UseNavigationHistoryReturn {
  // Navigation history state
  navigationHistory: string[]
  historyIndex: number
  isNavigatingRef: React.MutableRefObject<boolean>
  
  // Navigation actions
  navigateToFolder: (folderPath: string) => void
  navigateUp: () => void
  navigateToRoot: () => void
  navigateBack: () => void
  navigateForward: () => void
  
  // Navigation state
  canGoBack: boolean
  canGoForward: boolean
}

/**
 * Hook to manage folder navigation history (back/forward)
 */
export function useNavigationHistory({
  initialPath = '',
  setCurrentFolder,
  expandedFolders,
  toggleFolder,
  tabsEnabled,
  activeTabId,
  updateTabFolder
}: UseNavigationHistoryOptions): UseNavigationHistoryReturn {
  const [navigationHistory, setNavigationHistory] = useState<string[]>([initialPath])
  const [historyIndex, setHistoryIndex] = useState(0)
  const isNavigatingRef = useRef(false)

  const navigateToFolder = useCallback((folderPath: string) => {
    const startTime = performance.now()
    logExplorer('navigateToFolder START', { folder: folderPath || '(root)', historyIndex })
    
    setCurrentFolder(folderPath)
    
    // Add to navigation history (unless we're going back/forward)
    if (!isNavigatingRef.current) {
      setNavigationHistory(prev => {
        // Remove any forward history and add new path
        const newHistory = [...prev.slice(0, historyIndex + 1), folderPath]
        return newHistory
      })
      setHistoryIndex(prev => prev + 1)
    }
    
    // Sync with active tab when tabs are enabled
    if (tabsEnabled && activeTabId && updateTabFolder) {
      updateTabFolder(activeTabId, folderPath)
    }
    
    if (folderPath === '') {
      logExplorer('navigateToFolder END', { folder: '(root)', durationMs: Math.round(performance.now() - startTime) })
      return // Root doesn't need expansion
    }
    
    // Expand the folder and all its parents in the sidebar
    const parts = folderPath.split('/')
    let expandCount = 0
    for (let i = 1; i <= parts.length; i++) {
      const ancestorPath = parts.slice(0, i).join('/')
      if (!expandedFolders.has(ancestorPath)) {
        toggleFolder(ancestorPath)
        expandCount++
      }
    }
    
    logExplorer('navigateToFolder END', { 
      folder: folderPath, 
      durationMs: Math.round(performance.now() - startTime),
      expandedAncestors: expandCount
    })
  }, [setCurrentFolder, historyIndex, tabsEnabled, activeTabId, updateTabFolder, expandedFolders, toggleFolder])

  const navigateUp = useCallback(() => {
    // Get current path from history
    const currentPath = navigationHistory[historyIndex]
    if (!currentPath || currentPath === '') {
      logExplorer('navigateUp SKIP', { reason: 'already at root' })
      return
    }
    
    const parts = currentPath.split('/')
    parts.pop()
    const parentPath = parts.join('/')
    logExplorer('navigateUp', { from: currentPath, to: parentPath || '(root)' })
    navigateToFolder(parentPath)
  }, [navigationHistory, historyIndex, navigateToFolder])

  const navigateToRoot = useCallback(() => {
    logExplorer('navigateToRoot', { historyIndex })
    setCurrentFolder('')
    
    // Add to navigation history (unless we're going back/forward)
    if (!isNavigatingRef.current) {
      setNavigationHistory(prev => {
        const newHistory = [...prev.slice(0, historyIndex + 1), '']
        return newHistory
      })
      setHistoryIndex(prev => prev + 1)
    }
    
    // Sync with active tab when tabs are enabled
    if (tabsEnabled && activeTabId && updateTabFolder) {
      updateTabFolder(activeTabId, '')
    }
  }, [setCurrentFolder, historyIndex, tabsEnabled, activeTabId, updateTabFolder])

  const navigateBack = useCallback(() => {
    if (historyIndex <= 0) {
      logExplorer('navigateBack SKIP', { reason: 'at start of history' })
      return
    }
    
    isNavigatingRef.current = true
    const newIndex = historyIndex - 1
    const targetFolder = navigationHistory[newIndex]
    logExplorer('navigateBack', { 
      fromIndex: historyIndex, 
      toIndex: newIndex, 
      targetFolder: targetFolder || '(root)',
      historyLength: navigationHistory.length
    })
    setHistoryIndex(newIndex)
    setCurrentFolder(targetFolder)
    
    // Sync with active tab when tabs are enabled
    if (tabsEnabled && activeTabId && updateTabFolder) {
      updateTabFolder(activeTabId, targetFolder)
    }
    
    isNavigatingRef.current = false
  }, [historyIndex, navigationHistory, setCurrentFolder, tabsEnabled, activeTabId, updateTabFolder])

  const navigateForward = useCallback(() => {
    if (historyIndex >= navigationHistory.length - 1) {
      logExplorer('navigateForward SKIP', { reason: 'at end of history' })
      return
    }
    
    isNavigatingRef.current = true
    const newIndex = historyIndex + 1
    const targetFolder = navigationHistory[newIndex]
    logExplorer('navigateForward', { 
      fromIndex: historyIndex, 
      toIndex: newIndex, 
      targetFolder: targetFolder || '(root)',
      historyLength: navigationHistory.length
    })
    setHistoryIndex(newIndex)
    setCurrentFolder(targetFolder)
    
    // Sync with active tab when tabs are enabled
    if (tabsEnabled && activeTabId && updateTabFolder) {
      updateTabFolder(activeTabId, targetFolder)
    }
    
    isNavigatingRef.current = false
  }, [historyIndex, navigationHistory, setCurrentFolder, tabsEnabled, activeTabId, updateTabFolder])

  return {
    navigationHistory,
    historyIndex,
    isNavigatingRef,
    navigateToFolder,
    navigateUp,
    navigateToRoot,
    navigateBack,
    navigateForward,
    canGoBack: historyIndex > 0,
    canGoForward: historyIndex < navigationHistory.length - 1
  }
}
