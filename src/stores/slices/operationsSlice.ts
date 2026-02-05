import { StateCreator } from 'zustand'
import type { PDMStoreState, OperationsSlice, QueuedOperation, OrphanedCheckout, StagedCheckin, MissingStorageFile } from '../types'
import type { NotificationWithDetails } from '../../types/database'
import { logExplorer } from '@/lib/userActionLogger'

/**
 * Check if two path arrays have any overlapping paths.
 * Used for operation deduplication.
 */
function hasPathOverlap(paths1: string[], paths2: string[]): boolean {
  const set1 = new Set(paths1)
  return paths2.some(p => set1.has(p))
}

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
  isOperationRunning: false,
  currentOperation: null,
  
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
  setIsLoading: (isLoading) => {
    const stack = new Error().stack?.split('\n').slice(1, 5).map(s => s.trim()).join(' | ') || 'no-stack'
    logExplorer('setIsLoading CALLED', { isLoading, stack })
    set({ isLoading })
  },
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
    const { operationQueue, currentOperation } = get()
    
    // Check if same operation type with overlapping paths is already queued
    const isDuplicateInQueue = operationQueue.some(op => 
      op.type === operation.type && hasPathOverlap(op.paths, operation.paths)
    )
    
    // Check if same operation type with overlapping paths is currently running
    const isDuplicateRunning = currentOperation?.type === operation.type && 
      hasPathOverlap(currentOperation.paths, operation.paths)
    
    if (isDuplicateInQueue || isDuplicateRunning) {
      // Skip queueing duplicate operation
      return null
    }
    
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
  
  setOperationRunning: (running) => set({ isOperationRunning: running }),
  
  processQueue: async () => {
    const { operationQueue, isOperationRunning, removeFromQueue, addToast } = get()
    
    // Don't start a new operation if one is already running (serial execution)
    if (isOperationRunning) return
    
    if (operationQueue.length === 0) return
    
    // Only process the FIRST operation (serial execution - FIFO)
    const operation = operationQueue[0]
    removeFromQueue(operation.id)
    
    // Mark that an operation is now running and track its details for deduplication
    set({ 
      isOperationRunning: true,
      currentOperation: { type: operation.type, paths: operation.paths }
    })
    
    try {
      await operation.execute()
    } catch (err) {
      addToast('error', `Operation failed: ${operation.label}`)
    } finally {
      // Operation completed - mark as not running and clear current operation
      // endSync() will call processQueue() to start the next operation
      set({ isOperationRunning: false, currentOperation: null })
    }
    
    // Process the next operation in the queue (if any)
    // Using setTimeout to allow state to settle before processing next
    setTimeout(() => get().processQueue(), 0)
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
