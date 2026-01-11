import { useMemo, useCallback } from 'react'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import type { TreeMap } from '../types'

/**
 * Represents a flattened tree item with depth information for virtualization
 */
export interface FlattenedTreeItem {
  /** The file/folder data */
  file: LocalFile
  /** Depth level in the tree (0 = root, 1 = first level, etc.) */
  depth: number
  /** Index in the flattened array (used for range selection) */
  flatIndex: number
  /** Whether this item has children (for folders) */
  hasChildren: boolean
  /** Whether this folder is expanded (only relevant for directories) */
  isExpanded: boolean
}

interface UseFlattenedTreeOptions {
  /** The tree structure from useVaultTree */
  tree: TreeMap
  /** Sorting function for children */
  sortChildren: (children: LocalFile[]) => LocalFile[]
}

/**
 * Hook to flatten a hierarchical tree structure into a virtualized-friendly array.
 * 
 * This hook converts the recursive tree structure into a flat array while preserving
 * depth information for proper indentation. Only expanded folders have their children
 * included in the output.
 * 
 * Performance: Uses memoization to avoid recalculating when tree/expandedFolders unchanged.
 * 
 * @example
 * const { flattenedItems, getVisibleFiles, getIndexByPath, getPathByIndex } = useFlattenedTree({
 *   tree,
 *   sortChildren
 * })
 */
export function useFlattenedTree({ tree, sortChildren }: UseFlattenedTreeOptions) {
  const expandedFolders = usePDMStore(s => s.expandedFolders)
  
  /**
   * Flatten the tree into an array with depth tracking.
   * Only includes items that should be visible (folders are expanded).
   */
  const flattenedItems = useMemo((): FlattenedTreeItem[] => {
    const result: FlattenedTreeItem[] = []
    let currentIndex = 0
    
    const addItems = (items: LocalFile[], depth: number) => {
      const sortedItems = sortChildren(items)
      
      for (const item of sortedItems) {
        const isExpanded = item.isDirectory && expandedFolders.has(item.relativePath)
        const children = tree[item.relativePath] || []
        const hasChildren = item.isDirectory && children.length > 0
        
        result.push({
          file: item,
          depth,
          flatIndex: currentIndex++,
          hasChildren,
          isExpanded
        })
        
        // Recursively add children if folder is expanded
        if (isExpanded && hasChildren) {
          addItems(children, depth + 1)
        }
      }
    }
    
    // Start with root items (depth 0, but we use 1 since they're inside a vault)
    addItems(tree[''] || [], 1)
    
    return result
  }, [tree, expandedFolders, sortChildren])
  
  /**
   * Get all visible files as LocalFile array (for selection box intersection)
   */
  const getVisibleFiles = useCallback((): LocalFile[] => {
    return flattenedItems.map(item => item.file)
  }, [flattenedItems])
  
  /**
   * Get the flat index for a file path (for shift-click range selection)
   */
  const getIndexByPath = useCallback((path: string): number => {
    return flattenedItems.findIndex(item => item.file.path === path)
  }, [flattenedItems])
  
  /**
   * Get file at a specific flat index
   */
  const getItemByIndex = useCallback((index: number): FlattenedTreeItem | undefined => {
    return flattenedItems[index]
  }, [flattenedItems])
  
  /**
   * Create a map from path to flat index for quick lookups
   */
  const pathToIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    flattenedItems.forEach((item, index) => {
      map.set(item.file.path, index)
    })
    return map
  }, [flattenedItems])
  
  /**
   * Get range of files between two indices (for shift-click selection)
   */
  const getFilesInRange = useCallback((startIndex: number, endIndex: number): LocalFile[] => {
    const start = Math.min(startIndex, endIndex)
    const end = Math.max(startIndex, endIndex)
    return flattenedItems.slice(start, end + 1).map(item => item.file)
  }, [flattenedItems])
  
  return {
    flattenedItems,
    getVisibleFiles,
    getIndexByPath,
    getItemByIndex,
    getFilesInRange,
    pathToIndexMap,
    totalCount: flattenedItems.length
  }
}
