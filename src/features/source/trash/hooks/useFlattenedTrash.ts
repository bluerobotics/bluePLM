import { useMemo } from 'react'
import type { DeletedFile } from '@/types/pdm'

/**
 * Represents a flattened trash item for virtualization
 */
export interface FlattenedTrashItem {
  /** Unique key for React rendering */
  key: string
  /** Type of item: 'file', 'folder-record', 'folder-aggregated', or 'nested-folder' */
  type: 'file' | 'folder-record' | 'folder-aggregated' | 'nested-folder'
  /** The deleted file data (for files and folder-records) */
  file?: DeletedFile
  /** Aggregated folder data (for folder-aggregated items) */
  folderData?: {
    name: string
    path: string
    count: number
    latestDelete: string
    deletedBy?: DeletedFile['deleted_by_user']
  }
  /** Nested folder data (for nested view folders) */
  nestedFolder?: {
    path: string
    name: string
    depth: number
    recursiveCount: number
    directFileCount: number
  }
  /** Files in this nested folder (only for nested-folder type when expanded) */
  nestedFiles?: DeletedFile[]
  /** Depth level for indentation (0 = root) */
  depth: number
  /** Index in the flattened array */
  flatIndex: number
}

/** Row heights for each item type */
export const TRASH_ROW_HEIGHT = {
  file: 72,           // File rows are taller with path and metadata
  folder: 72,         // Folder rows match file height
  nestedFolder: 36,   // Nested folder headers are compact
  nestedFile: 64      // Nested files are slightly shorter (no path)
}

interface UseFlattenedTrashOptions {
  viewMode: 'files' | 'folders' | 'nested'
  /** Files sorted by time (for files view) */
  filesSortedByTime: DeletedFile[]
  /** Actual folder deletion records (for folders view) */
  deletedFoldersOnly: DeletedFile[]
  /** Top-level folders aggregated from file paths (for folders view) */
  topLevelFolders: Array<{
    name: string
    path: string
    count: number
    latestDelete: string
    deletedBy?: DeletedFile['deleted_by_user']
  }>
  /** Grouped files by folder path (for nested view) */
  groupedByFolder: Map<string, DeletedFile[]>
  /** Set of expanded folder paths (for nested view) */
  expandedFolders: Set<string>
  /** Function to get recursive file count for a folder */
  getRecursiveFileCount: (folderPath: string) => number
}

/**
 * Hook to flatten trash items into a virtualization-friendly array.
 * 
 * Handles all three view modes:
 * - files: Simple flat list of deleted files
 * - folders: Folder records and aggregated folder stats
 * - nested: Hierarchical folder structure with collapsible sections
 */
export function useFlattenedTrash({
  viewMode,
  filesSortedByTime,
  deletedFoldersOnly,
  topLevelFolders,
  groupedByFolder,
  expandedFolders,
  getRecursiveFileCount
}: UseFlattenedTrashOptions) {
  const flattenedItems = useMemo((): FlattenedTrashItem[] => {
    const result: FlattenedTrashItem[] = []
    let currentIndex = 0

    if (viewMode === 'files') {
      // Simple flat list of files
      for (const file of filesSortedByTime) {
        result.push({
          key: file.id,
          type: 'file',
          file,
          depth: 0,
          flatIndex: currentIndex++
        })
      }
    } else if (viewMode === 'folders') {
      // First add actual folder records
      for (const folder of deletedFoldersOnly) {
        result.push({
          key: `folder-${folder.id}`,
          type: 'folder-record',
          file: folder,
          depth: 0,
          flatIndex: currentIndex++
        })
      }
      
      // Then add aggregated top-level folders
      for (const folder of topLevelFolders) {
        result.push({
          key: `agg-${folder.path}`,
          type: 'folder-aggregated',
          folderData: folder,
          depth: 0,
          flatIndex: currentIndex++
        })
      }
    } else {
      // Nested view - hierarchical structure
      const sortedFolders = [...groupedByFolder.entries()].sort((a, b) => 
        a[0].localeCompare(b[0])
      )
      
      for (const [folderPath, files] of sortedFolders) {
        const folderName = folderPath === '/' ? '(root)' : folderPath.split('/').pop() || folderPath
        const folderDepth = folderPath === '/' ? 0 : folderPath.split('/').length - 1
        const recursiveCount = getRecursiveFileCount(folderPath)
        const isExpanded = expandedFolders.has(folderPath)
        
        // Add folder header
        result.push({
          key: `nested-${folderPath}`,
          type: 'nested-folder',
          nestedFolder: {
            path: folderPath,
            name: folderName,
            depth: folderDepth,
            recursiveCount,
            directFileCount: files.length
          },
          depth: folderDepth,
          flatIndex: currentIndex++
        })
        
        // Add files if folder is expanded
        if (isExpanded) {
          for (const file of files) {
            result.push({
              key: file.id,
              type: 'file',
              file,
              depth: folderDepth + 1,
              flatIndex: currentIndex++
            })
          }
        }
      }
    }

    return result
  }, [
    viewMode, 
    filesSortedByTime, 
    deletedFoldersOnly, 
    topLevelFolders, 
    groupedByFolder, 
    expandedFolders,
    getRecursiveFileCount
  ])

  /**
   * Get the estimated size for a specific item
   */
  const getItemSize = (index: number): number => {
    const item = flattenedItems[index]
    if (!item) return TRASH_ROW_HEIGHT.file
    
    switch (item.type) {
      case 'file':
        return viewMode === 'nested' ? TRASH_ROW_HEIGHT.nestedFile : TRASH_ROW_HEIGHT.file
      case 'folder-record':
      case 'folder-aggregated':
        return TRASH_ROW_HEIGHT.folder
      case 'nested-folder':
        return TRASH_ROW_HEIGHT.nestedFolder
      default:
        return TRASH_ROW_HEIGHT.file
    }
  }

  return {
    flattenedItems,
    totalCount: flattenedItems.length,
    getItemSize
  }
}
