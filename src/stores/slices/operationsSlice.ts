import { StateCreator } from 'zustand'
import type { PDMStoreState, OperationsSlice, QueuedOperation, OrphanedCheckout, StagedCheckin, MissingStorageFile } from '../types'
import type { NotificationWithDetails } from '../../types/database'

export const createOperationsSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  OperationsSlice
> = (set, get) => ({
  // Initial state - Loading
  isLoading: false,
  isRefreshing: false,
  statusMessage: '',
  filesLoaded: false,
  
  // Initial state - Sync
  syncProgress: {
    isActive: false,
    operation: 'upload',
    current: 0,
    total: 0,
    percent: 0,
    speed: '',
    cancelRequested: false
  },
  
  // Initial state - Queue
  operationQueue: [],
  
  // Initial state - Notifications & Reviews
  unreadNotificationCount: 0,
  pendingReviewCount: 0,
  notifications: [],
  notificationsLoading: false,
  notificationsLoaded: false,
  
  // Initial state - Orphaned checkouts
  orphanedCheckouts: [],
  
  // Initial state - Staged check-ins
  stagedCheckins: [],
  
  // Initial state - Missing storage files
  missingStorageFiles: [],
  
  // Initial state - Pending large upload
  pendingLargeUpload: null,
  
  // Initial state - File watcher suppression
  lastOperationCompletedAt: 0,
  expectedFileChanges: new Set<string>(),
  
  // Actions - Loading
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsRefreshing: (isRefreshing) => set({ isRefreshing }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setFilesLoaded: (filesLoaded) => set({ filesLoaded }),
  
  // Actions - Sync
  setSyncProgress: (progress) => set(state => ({ 
    syncProgress: { ...state.syncProgress, ...progress } 
  })),
  startSync: (total, operation = 'upload') => set({ 
    syncProgress: { isActive: true, operation, current: 0, total, percent: 0, speed: '', cancelRequested: false } 
  }),
  updateSyncProgress: (current, percent, speed) => set(state => ({ 
    syncProgress: { ...state.syncProgress, current, percent, speed } 
  })),
  requestCancelSync: () => set(state => ({ 
    syncProgress: { ...state.syncProgress, cancelRequested: true } 
  })),
  endSync: () => {
    set({ 
      syncProgress: { isActive: false, operation: 'upload', current: 0, total: 0, percent: 0, speed: '', cancelRequested: false },
      // Record completion timestamp for file watcher suppression
      lastOperationCompletedAt: Date.now()
    })
    // Process the queue after ending sync so the next operation can start
    // Using 0ms delay to allow state to settle before processing next operation
    setTimeout(() => get().processQueue(), 0)
  },
  
  // Actions - Queue
  queueOperation: (operation) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const fullOperation: QueuedOperation = { ...operation, id }
    
    set(state => ({
      operationQueue: [...state.operationQueue, fullOperation]
    }))
    
    // Try to process the queue immediately (direct call, no delay)
    get().processQueue()
    
    return id
  },
  
  removeFromQueue: (id) => set(state => ({
    operationQueue: state.operationQueue.filter(op => op.id !== id)
  })),
  
  hasPathConflict: (paths) => {
    const { processingOperations } = get()
    
    // Check if any of the requested paths overlap with currently processing paths
    for (const path of paths) {
      for (const processingPath of processingOperations.keys()) {
        // Check if paths overlap (one contains the other or they're the same)
        if (path === processingPath || 
            path.startsWith(processingPath + '/') || 
            path.startsWith(processingPath + '\\') ||
            processingPath.startsWith(path + '/') || 
            processingPath.startsWith(path + '\\')) {
          return true
        }
      }
    }
    return false
  },
  
  processQueue: async () => {
    const { operationQueue, hasPathConflict, removeFromQueue, addToast } = get()
    
    if (operationQueue.length === 0) return
    
    // Collect all operations that can run in parallel (no path conflicts)
    // Track paths we're about to start processing to avoid starting conflicting ops
    const operationsToStart: QueuedOperation[] = []
    const pathsBeingStarted = new Set<string>()
    
    // Helper to check if paths conflict with paths we're about to start
    const conflictsWithPending = (paths: string[]): boolean => {
      for (const path of paths) {
        for (const pendingPath of pathsBeingStarted) {
          // Check if paths overlap (one contains the other or they're the same)
          if (path === pendingPath || 
              path.startsWith(pendingPath + '/') || 
              path.startsWith(pendingPath + '\\') ||
              pendingPath.startsWith(path + '/') || 
              pendingPath.startsWith(path + '\\')) {
            return true
          }
        }
      }
      return false
    }
    
    // Find all non-conflicting operations
    for (const operation of operationQueue) {
      // Check against currently processing AND operations we're about to start
      if (!hasPathConflict(operation.paths) && !conflictsWithPending(operation.paths)) {
        operationsToStart.push(operation)
        // Add this operation's paths to the pending set
        operation.paths.forEach(p => pathsBeingStarted.add(p))
      }
    }
    
    // Start all non-conflicting operations in parallel
    for (const operation of operationsToStart) {
      removeFromQueue(operation.id)
      
      // Execute without awaiting - run in parallel
      // Each operation will call endSync() when done, which triggers processQueue()
      operation.execute().catch(() => {
        addToast('error', `Operation failed: ${operation.label}`)
      })
    }
    
    // Note: processQueue will be called again via endSync() when each operation completes
  },
  
  // Actions - Notifications & Reviews
  setUnreadNotificationCount: (count) => set({ unreadNotificationCount: count }),
  setPendingReviewCount: (count) => set({ pendingReviewCount: count }),
  incrementNotificationCount: () => set(state => ({ unreadNotificationCount: state.unreadNotificationCount + 1 })),
  decrementNotificationCount: (amount = 1) => set(state => ({ 
    unreadNotificationCount: Math.max(0, state.unreadNotificationCount - amount) 
  })),
  
  // Actions - Notifications List
  setNotifications: (notifications: NotificationWithDetails[]) => set({ 
    notifications, 
    notificationsLoaded: true,
    unreadNotificationCount: notifications.filter(n => !n.read).length 
  }),
  
  setNotificationsLoading: (loading: boolean) => set({ notificationsLoading: loading }),
  
  addNotification: (notification: NotificationWithDetails) => set((state) => {
    const notifications = [notification, ...state.notifications]
    return { 
      notifications,
      unreadNotificationCount: notifications.filter(n => !n.read).length
    }
  }),
  
  updateNotification: (id: string, updates: Partial<NotificationWithDetails>) => set((state) => {
    const notifications = state.notifications.map(n => 
      n.id === id ? { ...n, ...updates } : n
    )
    return {
      notifications,
      unreadNotificationCount: notifications.filter(n => !n.read).length
    }
  }),
  
  removeNotification: (id: string) => set((state) => {
    const notification = state.notifications.find(n => n.id === id)
    const notifications = state.notifications.filter(n => n.id !== id)
    return {
      notifications,
      unreadNotificationCount: notification && !notification.read 
        ? state.unreadNotificationCount - 1 
        : state.unreadNotificationCount
    }
  }),
  
  markNotificationRead: (id: string) => set((state) => {
    const notification = state.notifications.find(n => n.id === id)
    if (!notification || notification.read) return state
    
    return {
      notifications: state.notifications.map(n => 
        n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n
      ),
      unreadNotificationCount: Math.max(0, state.unreadNotificationCount - 1)
    }
  }),
  
  // Named markAllRead to avoid confusion with supabase helper markAllNotificationsRead
  markAllRead: () => set((state) => ({
    notifications: state.notifications.map(n => ({ 
      ...n, 
      read: true, 
      read_at: n.read_at || new Date().toISOString() 
    })),
    unreadNotificationCount: 0
  })),
  
  clearNotifications: () => set({ 
    notifications: [], 
    notificationsLoaded: false,
    unreadNotificationCount: 0 
  }),
  
  // Actions - Orphaned checkouts
  addOrphanedCheckout: (checkout: OrphanedCheckout) => set(state => ({
    orphanedCheckouts: [...state.orphanedCheckouts.filter(c => c.fileId !== checkout.fileId), checkout]
  })),
  removeOrphanedCheckout: (fileId) => set(state => ({
    orphanedCheckouts: state.orphanedCheckouts.filter(c => c.fileId !== fileId)
  })),
  clearOrphanedCheckouts: () => set({ orphanedCheckouts: [] }),
  
  // Actions - Staged check-ins
  stageCheckin: (checkin: StagedCheckin) => set(state => ({
    stagedCheckins: [...state.stagedCheckins.filter(c => c.relativePath !== checkin.relativePath), checkin]
  })),
  unstageCheckin: (relativePath) => set(state => ({
    stagedCheckins: state.stagedCheckins.filter(c => c.relativePath !== relativePath)
  })),
  updateStagedCheckinComment: (relativePath, comment) => set(state => ({
    stagedCheckins: state.stagedCheckins.map(c => 
      c.relativePath === relativePath ? { ...c, comment } : c
    )
  })),
  clearStagedCheckins: () => set({ stagedCheckins: [] }),
  getStagedCheckin: (relativePath) => get().stagedCheckins.find(c => c.relativePath === relativePath),
  
  // Actions - Missing storage files
  setMissingStorageFiles: (files: MissingStorageFile[]) => set({ missingStorageFiles: files }),
  clearMissingStorageFiles: () => set({ missingStorageFiles: [] }),
  
  // Actions - Pending large upload
  setPendingLargeUpload: (upload) => set({ pendingLargeUpload: upload }),
  clearPendingLargeUpload: () => set({ pendingLargeUpload: null }),
  
  // Actions - File watcher suppression
  addExpectedFileChanges: (paths: string[]) => set(state => {
    const newSet = new Set(state.expectedFileChanges)
    for (const path of paths) {
      newSet.add(path)
    }
    return { expectedFileChanges: newSet }
  }),
  
  clearExpectedFileChanges: (paths: string[]) => set(state => {
    const newSet = new Set(state.expectedFileChanges)
    for (const path of paths) {
      newSet.delete(path)
    }
    return { expectedFileChanges: newSet }
  }),
  
  setLastOperationCompletedAt: (timestamp: number) => set({ lastOperationCompletedAt: timestamp }),
})
