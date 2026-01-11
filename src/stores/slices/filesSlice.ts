import { StateCreator } from 'zustand'
import type { PDMStoreState, FilesSlice, LocalFile, DiffStatus, OperationType } from '../types'
import type { PDMFile } from '../../types/pdm'
import { buildFullPath } from '@/lib/utils/path'
import { recordMetric } from '@/lib/performanceMetrics'

// ============================================================================
// Processing Operations Batching
// ============================================================================
// These variables batch processingOperations Map updates to reduce React re-renders.
// Multiple add/remove calls within the same microtask are combined into a single state update.
// This is critical for performance when processing 60+ files in batch operations.
//
// We use queueMicrotask to schedule flushes, which runs at the end of the current
// microtask queue. This ensures UI sees processing state immediately after the
// synchronous code that adds the processing operation completes, preventing
// intermediate states like "green cloud during checkin".

let pendingProcessingAdds = new Map<string, OperationType>()
let pendingProcessingRemoves = new Set<string>()
let processingFlushScheduled = false


/**
 * Flushes pending processing operations changes immediately.
 * Used internally by scheduleProcessingFlush and flushProcessingSync.
 */
function doProcessingFlush(
  get: () => PDMStoreState,
  set: (state: Partial<PDMStoreState>) => void
): void {
  processingFlushScheduled = false
  
  // Early exit if nothing to flush
  if (pendingProcessingAdds.size === 0 && pendingProcessingRemoves.size === 0) {
    return
  }
  
  const currentState = get()
  const newMap = new Map(currentState.processingOperations)
  
  // Apply removes first, then adds (adds override removes for same path)
  pendingProcessingRemoves.forEach(p => newMap.delete(p))
  pendingProcessingAdds.forEach((opType, p) => newMap.set(p, opType))
  
  // Clear pending batches
  pendingProcessingRemoves.clear()
  pendingProcessingAdds.clear()
  
  set({ processingOperations: newMap })
}

/**
 * Schedules a flush of pending processing operations changes.
 * Uses queueMicrotask for immediate processing at the end of the current task,
 * ensuring the UI sees processing state before any async operations start.
 * 
 * @param get - Zustand get function from slice
 * @param set - Zustand set function from slice
 */
function scheduleProcessingFlush(
  get: () => PDMStoreState, 
  set: (state: Partial<PDMStoreState>) => void
): void {
  if (processingFlushScheduled) return
  processingFlushScheduled = true
  
  queueMicrotask(() => doProcessingFlush(get, set))
}

/**
 * Flushes pending processing operations synchronously.
 * Use this in critical paths where the UI MUST show the processing state
 * before any async work begins (e.g., before starting file operations).
 * 
 * @param get - Zustand get function from slice
 * @param set - Zustand set function from slice
 */
function flushProcessingSync(
  get: () => PDMStoreState,
  set: (state: Partial<PDMStoreState>) => void
): void {
  // Cancel any scheduled flush since we're flushing now
  processingFlushScheduled = false
  doProcessingFlush(get, set)
}

export const createFilesSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  FilesSlice
> = (set, get) => ({
  // Initial state
  files: [],
  serverFiles: [],
  serverFolderPaths: new Set<string>(),
  selectedFiles: [],
  expandedFolders: new Set<string>(),
  currentFolder: '',
  persistedPendingMetadata: {},
  sortColumn: 'name',
  sortDirection: 'asc',
  
  // Initial state - Search
  searchQuery: '',
  searchType: 'all',
  searchResults: [],
  isSearching: false,
  recentSearches: [],
  
  // Initial state - Filters
  workflowStateFilter: [],
  extensionFilter: [],
  historyFolderFilter: null,
  trashFolderFilter: null,
  ignorePatterns: {},
  
  // Initial state - Processing (Map tracks operation type per path for inline button spinners)
  processingOperations: new Map<string, import('../types').OperationType>(),
  
  // Initial state - SolidWorks Configurations
  expandedConfigFiles: new Set<string>(),
  selectedConfigs: new Set<string>(),
  fileConfigurations: new Map<string, import('../types').SWConfiguration[]>(),
  loadingConfigs: new Set<string>(),
  
  // Actions - Files
  setFiles: (files) => {
    // Restore any persisted pending metadata to the files
    const { persistedPendingMetadata } = get()
    const filesWithRestoredMetadata = files.map(f => {
      const persisted = persistedPendingMetadata[f.path]
      if (persisted) {
        // Restore pending metadata and mark as modified if it's a synced file
        return { 
          ...f, 
          pendingMetadata: persisted,
          diffStatus: f.pdmData && !['outdated', 'deleted', 'deleted_remote'].includes(f.diffStatus || '') 
            ? 'modified' as const
            : f.diffStatus
        }
      }
      return f
    })
    set({ files: filesWithRestoredMetadata })
  },
  
  setServerFiles: (serverFiles) => set({ serverFiles }),
  setServerFolderPaths: (serverFolderPaths) => set({ serverFolderPaths }),
  
  updateFileInStore: (path, updates) => {
    set(state => ({
      files: state.files.map(f => 
        f.path === path ? { ...f, ...updates } : f
      )
    }))
  },
  
  // Batch update multiple files in a single state change (avoids N re-renders)
  updateFilesInStore: (updates) => {
    if (updates.length === 0) return
    // Build a map for O(1) lookups
    const updateMap = new Map(updates.map(u => [u.path, u.updates]))
    set(state => ({
      files: state.files.map(f => {
        const fileUpdates = updateMap.get(f.path)
        return fileUpdates ? { ...f, ...fileUpdates } : f
      })
    }))
  },
  
  /**
   * Atomic update: combines file updates + clearing processing state in a single set() call.
   * 
   * This prevents two sequential re-renders that would otherwise occur when calling
   * updateFilesInStore() followed by removeProcessingFolders(). With 8000+ files,
   * each re-render triggers expensive O(N x depth) folderMetrics computation in
   * useVaultTree.ts, causing ~5 second UI freezes.
   * 
   * The key optimization is doing BOTH updates in ONE set() call, so React only
   * re-renders once instead of twice.
   * 
   * @param updates - Array of file path + partial updates to apply
   * @param pathsToClearProcessing - Paths to remove from processingOperations Map
   */
  updateFilesAndClearProcessing: (updates, pathsToClearProcessing) => {
    const startTime = performance.now()
    window.electronAPI?.log('info', '[Store] updateFilesAndClearProcessing START', { 
      updateCount: updates.length, 
      clearCount: pathsToClearProcessing.length,
      timestamp: Date.now() 
    })
    recordMetric('Store', 'updateFilesAndClearProcessing START', { 
      updateCount: updates.length, 
      clearCount: pathsToClearProcessing.length 
    })
    
    // Clear these paths from pending batches to avoid double processing
    // This ensures the scheduled flush doesn't undo our direct update
    for (const path of pathsToClearProcessing) {
      pendingProcessingAdds.delete(path)
      pendingProcessingRemoves.delete(path)
    }
    
    // Build a map for O(1) file update lookups
    const updateMap = updates.length > 0 
      ? new Map(updates.map(u => [u.path, u.updates]))
      : null
    
    // Build the set of paths to clear for O(1) lookups
    const pathsToClear = new Set(pathsToClearProcessing)
    
    // Single atomic state update - one re-render instead of two
    set(state => {
      // Build new processingOperations Map with paths removed
      const newProcessingOps = new Map(state.processingOperations)
      for (const path of pathsToClear) {
        newProcessingOps.delete(path)
      }
      
      // Build new files array with updates applied
      const newFiles = updateMap 
        ? state.files.map(f => {
            const fileUpdates = updateMap.get(f.path)
            return fileUpdates ? { ...f, ...fileUpdates } : f
          })
        : state.files
      
      return {
        files: newFiles,
        processingOperations: newProcessingOps
      }
    })
    
    const durationMs = performance.now() - startTime
    window.electronAPI?.log('info', '[Store] updateFilesAndClearProcessing COMPLETE', { 
      durationMs: Math.round(durationMs * 100) / 100,
      timestamp: Date.now() 
    })
    recordMetric('Store', 'updateFilesAndClearProcessing COMPLETE', { 
      durationMs: Math.round(durationMs * 100) / 100 
    })
  },
  
  removeFilesFromStore: (paths) => {
    const pathSet = new Set(paths)
    set(state => ({
      files: state.files.filter(f => !pathSet.has(f.path)),
      selectedFiles: state.selectedFiles.filter(p => !pathSet.has(p))
    }))
  },
  
  updatePendingMetadata: (path, metadata) => {
    set(state => {
      // Calculate new pending metadata
      const file = state.files.find(f => f.path === path)
      const existingPending = file?.pendingMetadata || state.persistedPendingMetadata[path] || {}
      
      // Handle config_tabs merge specially (per-config tab numbers)
      let newConfigTabs = existingPending.config_tabs
      if (metadata.config_tabs) {
        newConfigTabs = {
          ...(existingPending.config_tabs || {}),
          ...metadata.config_tabs
        }
      }
      
      // Handle config_descriptions merge specially (per-config descriptions)
      let newConfigDescriptions = existingPending.config_descriptions
      if (metadata.config_descriptions) {
        newConfigDescriptions = {
          ...(existingPending.config_descriptions || {}),
          ...metadata.config_descriptions
        }
      }
      
      const newPending = { 
        ...existingPending, 
        ...metadata,
        config_tabs: newConfigTabs,
        config_descriptions: newConfigDescriptions
      }
      
      return {
        // Update file in files array
        files: state.files.map(f => {
          if (f.path === path) {
            // Also update the pdmData to show the changes immediately in UI
            const updatedPdmData = f.pdmData ? {
              ...f.pdmData,
              part_number: metadata.part_number !== undefined ? metadata.part_number : f.pdmData.part_number,
              description: metadata.description !== undefined ? metadata.description : f.pdmData.description,
              revision: metadata.revision !== undefined ? metadata.revision : f.pdmData.revision,
            } : f.pdmData
            return { 
              ...f, 
              pendingMetadata: newPending,
              pdmData: updatedPdmData,
              // Mark as modified if it has pdmData (synced file)
              diffStatus: f.pdmData ? 'modified' : f.diffStatus
            }
          }
          return f
        }),
        // Also persist for app restart survival
        persistedPendingMetadata: {
          ...state.persistedPendingMetadata,
          [path]: newPending
        }
      }
    })
  },
  
  clearPendingMetadata: (path) => {
    set(state => {
      // Destructure to exclude `path` key, using _ for intentionally discarded value
      const { [path]: _, ...remainingPersisted } = state.persistedPendingMetadata
      return {
        files: state.files.map(f => 
          f.path === path ? { ...f, pendingMetadata: undefined } : f
        ),
        persistedPendingMetadata: remainingPersisted
      }
    })
  },
  
  clearPendingConfigMetadata: (path) => {
    set(state => {
      const file = state.files.find(f => f.path === path)
      const existingPending = file?.pendingMetadata
      
      // If no pending metadata, nothing to clear
      if (!existingPending) return state
      
      // Destructure to exclude config_tabs and config_descriptions (intentionally discarded)
      const { config_tabs, config_descriptions, ...remainingPending } = existingPending
      
      // Check if there's anything left after removing config metadata
      const hasRemainingPending = Object.keys(remainingPending).some(k => remainingPending[k as keyof typeof remainingPending] !== undefined)
      const newPending = hasRemainingPending ? remainingPending : undefined
      
      // Update persisted metadata too
      const existingPersistedPending = state.persistedPendingMetadata[path]
      let newPersistedMetadata = state.persistedPendingMetadata
      if (existingPersistedPending) {
        // Destructure to exclude config fields (prefixed with _ to indicate intentionally unused)
        const { config_tabs: _ct, config_descriptions: _cd, ...remainingPersistedPending } = existingPersistedPending
        const hasRemainingPersistedPending = Object.keys(remainingPersistedPending).some(k => remainingPersistedPending[k as keyof typeof remainingPersistedPending] !== undefined)
        if (hasRemainingPersistedPending) {
          newPersistedMetadata = { ...state.persistedPendingMetadata, [path]: remainingPersistedPending }
        } else {
          // Destructure to exclude `path` key (intentionally discarded)
          const { [path]: _, ...rest } = state.persistedPendingMetadata
          newPersistedMetadata = rest
        }
      }
      
      return {
        files: state.files.map(f => 
          f.path === path ? { ...f, pendingMetadata: newPending } : f
        ),
        persistedPendingMetadata: newPersistedMetadata
      }
    })
  },
  
  // Batch clear persisted pending metadata for multiple paths (used during checkout)
  clearPersistedPendingMetadataForPaths: (paths) => {
    set(state => {
      const pathSet = new Set(paths)
      const newPersisted = Object.fromEntries(
        Object.entries(state.persistedPendingMetadata).filter(([p]) => !pathSet.has(p))
      )
      return { persistedPendingMetadata: newPersisted }
    })
  },
  
  renameFileInStore: (oldPath, newPath, newNameOrRelPath, isMove = false) => {
    const { files, selectedFiles } = get()
    
    // Update file in the files array
    const updatedFiles = files.map(f => {
      if (f.path === oldPath) {
        let newRelativePath: string
        let newName: string
        
        if (isMove) {
          // For moves, newNameOrRelPath is the full new relative path
          newRelativePath = newNameOrRelPath
          newName = newNameOrRelPath.includes('/') 
            ? newNameOrRelPath.split('/').pop()! 
            : newNameOrRelPath
        } else {
          // For renames, newNameOrRelPath is just the new filename
          newName = newNameOrRelPath
          const pathParts = f.relativePath.split('/')
          pathParts[pathParts.length - 1] = newName
          newRelativePath = pathParts.join('/')
        }
        
        // If the file is synced and being moved, mark it as 'moved'
        const shouldMarkAsMoved = isMove && f.pdmData?.id
        
        return {
          ...f,
          path: newPath,
          name: newName,
          relativePath: newRelativePath,
          extension: newName.includes('.') ? newName.split('.').pop()?.toLowerCase() || '' : '',
          // Set diffStatus to 'moved' if this is a synced file being moved
          ...(shouldMarkAsMoved ? { diffStatus: 'moved' as const } : {})
        }
      }
      return f
    })
    
    // Update selected files if the renamed file was selected
    const updatedSelectedFiles = selectedFiles.map(p => p === oldPath ? newPath : p)
    
    set({ 
      files: updatedFiles,
      selectedFiles: updatedSelectedFiles
    })
  },
  
  setSelectedFiles: (selectedFiles) => set({ selectedFiles }),
  
  toggleFileSelection: (path, multiSelect = false) => {
    const { selectedFiles } = get()
    if (multiSelect) {
      if (selectedFiles.includes(path)) {
        set({ selectedFiles: selectedFiles.filter(p => p !== path) })
      } else {
        set({ selectedFiles: [...selectedFiles, path] })
      }
    } else {
      set({ selectedFiles: [path] })
    }
  },
  
  selectAllFiles: () => {
    const { files } = get()
    set({ selectedFiles: files.filter(f => !f.isDirectory).map(f => f.path) })
  },
  
  clearSelection: () => set({ selectedFiles: [] }),
  
  toggleFolder: (path) => {
    const { expandedFolders } = get()
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    set({ expandedFolders: newExpanded })
  },
  
  setCurrentFolder: (currentFolder) => set({ currentFolder }),
  
  // Actions - Realtime Updates (incremental without full refresh)
  addCloudFile: (pdmFile) => {
    const { files, vaultPath } = get()
    if (!vaultPath) return
    
    // Check if file already exists (by server ID or path)
    const existingByPath = files.find(f => 
      f.relativePath.toLowerCase() === pdmFile.file_path.toLowerCase()
    )
    if (existingByPath) {
      // File already exists locally - update its pdmData instead
      set(state => ({
        files: state.files.map(f => 
          f.relativePath.toLowerCase() === pdmFile.file_path.toLowerCase()
            ? { ...f, pdmData: pdmFile, isSynced: true, diffStatus: f.localHash === pdmFile.content_hash ? undefined : 'outdated' }
            : f
        )
      }))
      return
    }
    
    // Add cloud parent folders if needed
    const pathParts = pdmFile.file_path.split('/')
    const newFiles: LocalFile[] = []
    
    // Create cloud folders for parents that don't exist
    let currentPath = ''
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i]
      const folderExists = files.some(f => 
        f.relativePath.toLowerCase() === currentPath.toLowerCase()
      )
      if (!folderExists && !newFiles.some(f => f.relativePath === currentPath)) {
        newFiles.push({
          name: pathParts[i],
          path: buildFullPath(vaultPath, currentPath),
          relativePath: currentPath,
          isDirectory: true,
          extension: '',
          size: 0,
          modifiedTime: '',
          diffStatus: 'cloud'
        })
      }
    }
    
    // Add the cloud file itself - mark as 'cloud' (available for download)
    newFiles.push({
      name: pdmFile.file_name,
      path: buildFullPath(vaultPath, pdmFile.file_path),
      relativePath: pdmFile.file_path,
      isDirectory: false,
      extension: pdmFile.extension,
      size: pdmFile.file_size || 0,
      modifiedTime: pdmFile.updated_at || '',
      pdmData: pdmFile,
      isSynced: false,
      diffStatus: 'cloud'
    })
    
    set(state => ({ files: [...state.files, ...newFiles] }))
  },
  
  updateFilePdmData: (fileId, pdmData) => {
    set(state => ({
      files: state.files.map(f => {
        if (f.pdmData?.id === fileId) {
          const updatedPdmData = { ...f.pdmData, ...pdmData } as PDMFile
          // Recompute diff status if content hash changed
          let newDiffStatus = f.diffStatus
          if (pdmData.content_hash && f.localHash) {
            if (pdmData.content_hash !== f.localHash) {
              newDiffStatus = 'outdated'
            } else if (f.diffStatus === 'outdated') {
              newDiffStatus = undefined
            }
          }
          
          // Handle checkout status changes for files marked as 'deleted'
          if (f.diffStatus === 'deleted' && 'checked_out_by' in pdmData && pdmData.checked_out_by === null) {
            newDiffStatus = 'cloud'
          }
          
          return { 
            ...f, 
            pdmData: updatedPdmData,
            diffStatus: newDiffStatus
          }
        }
        return f
      })
    }))
  },
  
  removeCloudFile: (fileId) => {
    set(state => ({
      files: state.files.filter(f => {
        // Only remove cloud-only files
        if (f.pdmData?.id === fileId && f.diffStatus === 'cloud') {
          return false
        }
        return true
      }).map(f => {
        // Mark locally existing files as 'deleted_remote'
        if (f.pdmData?.id === fileId && f.diffStatus !== 'cloud') {
          return { ...f, pdmData: undefined, isSynced: false, diffStatus: 'deleted_remote' as const }
        }
        return f
      })
    }))
  },
  
  // Actions - Search
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchType: (searchType) => set({ searchType }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setIsSearching: (isSearching) => set({ isSearching }),
  addRecentSearch: (query) => {
    const { recentSearches } = get()
    const filtered = recentSearches.filter(s => s.toLowerCase() !== query.toLowerCase())
    set({ recentSearches: [query, ...filtered].slice(0, 20) })
  },
  clearRecentSearches: () => set({ recentSearches: [] }),
  
  // Actions - Sort & Filter
  setSortColumn: (sortColumn) => set({ sortColumn }),
  setSortDirection: (sortDirection) => set({ sortDirection }),
  toggleSort: (column) => {
    const { sortColumn, sortDirection } = get()
    if (sortColumn === column) {
      set({ sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' })
    } else {
      set({ sortColumn: column, sortDirection: 'asc' })
    }
  },
  setWorkflowStateFilter: (workflowStateFilter) => set({ workflowStateFilter }),
  setExtensionFilter: (extensionFilter) => set({ extensionFilter }),
  setHistoryFolderFilter: (folderPath) => set({ historyFolderFilter: folderPath }),
  setTrashFolderFilter: (folderPath) => set({ trashFolderFilter: folderPath }),
  
  // Actions - Ignore Patterns
  addIgnorePattern: (vaultId, pattern) => {
    const { ignorePatterns } = get()
    const current = ignorePatterns[vaultId] || []
    if (!current.includes(pattern)) {
      set({
        ignorePatterns: {
          ...ignorePatterns,
          [vaultId]: [...current, pattern]
        }
      })
    }
  },
  removeIgnorePattern: (vaultId, pattern) => {
    const { ignorePatterns } = get()
    const current = ignorePatterns[vaultId] || []
    set({
      ignorePatterns: {
        ...ignorePatterns,
        [vaultId]: current.filter(p => p !== pattern)
      }
    })
  },
  setIgnorePatterns: (vaultId, patterns) => {
    const { ignorePatterns } = get()
    set({
      ignorePatterns: {
        ...ignorePatterns,
        [vaultId]: patterns
      }
    })
  },
  getIgnorePatterns: (vaultId) => {
    return get().ignorePatterns[vaultId] || []
  },
  isPathIgnored: (vaultId, relativePath) => {
    const patterns = get().ignorePatterns[vaultId] || []
    const normalizedPath = relativePath.replace(/\\/g, '/').toLowerCase()
    
    for (const pattern of patterns) {
      const normalizedPattern = pattern.toLowerCase()
      
      // Extension pattern: *.ext
      if (normalizedPattern.startsWith('*.')) {
        const ext = normalizedPattern.slice(1) // ".ext"
        if (normalizedPath.endsWith(ext)) return true
      }
      // Folder pattern: foldername/ or foldername/**
      else if (normalizedPattern.endsWith('/') || normalizedPattern.endsWith('/**')) {
        const folderPattern = normalizedPattern.replace(/\/\*\*$/, '/').replace(/\/$/, '')
        if (normalizedPath === folderPattern || 
            normalizedPath.startsWith(folderPattern + '/') ||
            normalizedPath.includes('/' + folderPattern + '/') ||
            normalizedPath.includes('/' + folderPattern)) {
          return true
        }
      }
      // Exact match pattern
      else if (normalizedPath === normalizedPattern || 
               normalizedPath.endsWith('/' + normalizedPattern)) {
        return true
      }
      // Simple wildcard matching for other patterns
      else if (normalizedPattern.includes('*')) {
        const regex = new RegExp(
          '^' + normalizedPattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        )
        if (regex.test(normalizedPath)) return true
      }
    }
    
    return false
  },
  
  // Actions - Processing (with operation type for inline button spinners)
  // These functions use batching to reduce React re-renders during bulk operations.
  // Multiple add/remove calls within the same microtask are combined into a single state update.
  
  addProcessingFolder: (path, operationType) => {
    // Add to pending batch (overrides any pending remove)
    pendingProcessingRemoves.delete(path)
    pendingProcessingAdds.set(path, operationType)
    scheduleProcessingFlush(get, set)
  },
  
  addProcessingFolders: (paths, operationType) => {
    if (paths.length === 0) return
    // Add all to pending batch
    for (const path of paths) {
      pendingProcessingRemoves.delete(path)
      pendingProcessingAdds.set(path, operationType)
    }
    scheduleProcessingFlush(get, set)
  },
  
  addProcessingFoldersSync: (paths, operationType) => {
    if (paths.length === 0) return
    // Add all to pending batch
    for (const path of paths) {
      pendingProcessingRemoves.delete(path)
      pendingProcessingAdds.set(path, operationType)
    }
    // Flush synchronously so UI shows spinner BEFORE async operations begin
    flushProcessingSync(get, set)
  },
  
  removeProcessingFolder: (path) => {
    // Add to pending removes (cancel any pending add)
    pendingProcessingAdds.delete(path)
    pendingProcessingRemoves.add(path)
    scheduleProcessingFlush(get, set)
  },
  
  removeProcessingFolders: (paths) => {
    if (paths.length === 0) return
    // Add all to pending removes
    for (const path of paths) {
      pendingProcessingAdds.delete(path)
      pendingProcessingRemoves.add(path)
    }
    scheduleProcessingFlush(get, set)
  },
  clearProcessingFolders: () => set({ processingOperations: new Map() }),
  getProcessingOperation: (path, _isDirectory = false) => {
    const { processingOperations } = get()
    const normalizedPath = path.replace(/\\/g, '/')
    
    // Direct lookup first - works for both files and folders
    if (processingOperations.has(path)) {
      return processingOperations.get(path)!
    }
    if (processingOperations.has(normalizedPath)) {
      return processingOperations.get(normalizedPath)!
    }
    
    // Check if THIS path is INSIDE any processing folder (downward propagation)
    // This makes spinners propagate DOWN to children, not UP to parents
    for (const [processingPath, opType] of processingOperations) {
      const normalizedProcessingPath = processingPath.replace(/\\/g, '/')
      // Check if THIS path is inside a processing folder
      if (normalizedPath.startsWith(normalizedProcessingPath + '/')) {
        return opType
      }
    }
    
    return null
  },
  
  // Actions - SolidWorks Configurations
  toggleConfigExpansion: (filePath: string) => {
    const { expandedConfigFiles } = get()
    const newExpanded = new Set(expandedConfigFiles)
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath)
      // Also clear selected configs for this file when collapsing
      const { selectedConfigs } = get()
      const newSelected = new Set([...selectedConfigs].filter(key => !key.startsWith(filePath + '::')))
      set({ expandedConfigFiles: newExpanded, selectedConfigs: newSelected })
    } else {
      newExpanded.add(filePath)
      set({ expandedConfigFiles: newExpanded })
    }
  },
  
  setExpandedConfigFiles: (paths: Set<string>) => set({ expandedConfigFiles: paths }),
  
  setSelectedConfigs: (configs: Set<string>) => set({ selectedConfigs: configs }),
  
  setFileConfigurations: (filePath: string, configs: import('../types').SWConfiguration[]) => {
    const { fileConfigurations } = get()
    const newMap = new Map(fileConfigurations)
    newMap.set(filePath, configs)
    set({ fileConfigurations: newMap })
  },
  
  clearFileConfigurations: (filePath: string) => {
    const { fileConfigurations } = get()
    const newMap = new Map(fileConfigurations)
    newMap.delete(filePath)
    set({ fileConfigurations: newMap })
  },
  
  setLoadingConfigs: (paths: Set<string>) => set({ loadingConfigs: paths }),
  
  addLoadingConfig: (filePath: string) => {
    const { loadingConfigs } = get()
    set({ loadingConfigs: new Set(loadingConfigs).add(filePath) })
  },
  
  removeLoadingConfig: (filePath: string) => {
    const { loadingConfigs } = get()
    const newSet = new Set(loadingConfigs)
    newSet.delete(filePath)
    set({ loadingConfigs: newSet })
  },
  
  // Getters
  getSelectedFileObjects: () => {
    const { files, selectedFiles } = get()
    return files.filter(f => selectedFiles.includes(f.path))
  },
  
  getVisibleFiles: () => {
    const { files, expandedFolders, workflowStateFilter, extensionFilter, searchQuery } = get()
    
    let visible = files.filter(file => {
      // Check if parent folder is expanded
      const parts = file.relativePath.split('/')
      if (parts.length > 1) {
        // Check all ancestor folders
        for (let i = 1; i <= parts.length - 1; i++) {
          const ancestorPath = parts.slice(0, i).join('/')
          if (!expandedFolders.has(ancestorPath)) {
            return false
          }
        }
      }
      return true
    })
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      visible = visible.filter(f => 
        f.name.toLowerCase().includes(query) ||
        f.relativePath.toLowerCase().includes(query) ||
        f.pdmData?.part_number?.toLowerCase().includes(query) ||
        f.pdmData?.description?.toLowerCase().includes(query)
      )
    }
    
    // Apply workflow state filter
    if (workflowStateFilter.length > 0) {
      visible = visible.filter(f => 
        f.isDirectory || !f.pdmData?.workflow_state_id || workflowStateFilter.includes(f.pdmData.workflow_state_id)
      )
    }
    
    // Apply extension filter
    if (extensionFilter.length > 0) {
      visible = visible.filter(f => 
        f.isDirectory || extensionFilter.includes(f.extension)
      )
    }
    
    return visible
  },
  
  getFileByPath: (path) => {
    const { files } = get()
    return files.find(f => f.path === path)
  },
  
  getDeletedFiles: () => {
    const { files, serverFiles, vaultPath } = get()
    if (!vaultPath) return []
    
    const localPaths = new Set(files.map(f => f.relativePath.toLowerCase()))
    
    return serverFiles
      .filter(sf => !localPaths.has(sf.file_path.toLowerCase()))
      .map(sf => ({
        name: sf.name,
        path: buildFullPath(vaultPath, sf.file_path),
        relativePath: sf.file_path,
        isDirectory: false,
        extension: sf.extension,
        size: 0,
        modifiedTime: '',
        diffStatus: 'deleted' as DiffStatus,
        pdmData: { id: sf.id } as any
      }))
  },
  
  getFolderDiffCounts: (folderPath: string) => {
    const { files } = get()
    
    let added = 0
    let modified = 0
    let moved = 0
    let deleted = 0
    let outdated = 0
    let cloud = 0
    let cloudNew = 0
    
    const prefix = folderPath ? folderPath + '/' : ''
    for (const file of files) {
      if (file.isDirectory) continue
      
      if (folderPath) {
        if (!file.relativePath.startsWith(prefix)) continue
      }
      
      if (file.diffStatus === 'added') added++
      else if (file.diffStatus === 'modified') modified++
      else if (file.diffStatus === 'moved') moved++
      else if (file.diffStatus === 'deleted') deleted++
      else if (file.diffStatus === 'outdated') outdated++
      else if (file.diffStatus === 'cloud') cloud++
    }
    
    return { added, modified, moved, deleted, outdated, cloud, cloudNew }
  }
})
