import { StateCreator } from 'zustand'
import type { PDMStoreState, ToastsSlice, ToastType, ToastMessage } from '../types'

// ============================================================================
// Progress Toast Update Batching
// ============================================================================
// These variables batch progress toast updates to reduce React re-renders.
// Multiple updateProgressToast calls within a short window are coalesced,
// and only the latest value is applied. This prevents UI jitter when progress
// updates arrive faster than the animation duration.

interface PendingProgressUpdate {
  current: number
  percent: number
  speed?: string
  label?: string
}

const pendingProgressUpdates = new Map<string, PendingProgressUpdate>()
let progressFlushScheduled = false
let progressFlushSetFn: ((state: Partial<PDMStoreState>) => void) | null = null
let progressFlushGetFn: (() => PDMStoreState) | null = null

/**
 * Schedules a flush of pending progress updates.
 * Uses requestAnimationFrame for smooth visual updates synced to the display refresh.
 */
function scheduleProgressFlush(
  get: () => PDMStoreState,
  set: (state: Partial<PDMStoreState>) => void
): void {
  // Store references for the flush callback
  progressFlushSetFn = set
  progressFlushGetFn = get
  
  if (progressFlushScheduled) return
  progressFlushScheduled = true
  
  // Use requestAnimationFrame to sync updates with display refresh
  // This is better than setTimeout/queueMicrotask for visual updates
  requestAnimationFrame(() => {
    progressFlushScheduled = false
    
    if (pendingProgressUpdates.size === 0 || !progressFlushSetFn || !progressFlushGetFn) return
    
    const updates = new Map(pendingProgressUpdates)
    pendingProgressUpdates.clear()
    
    // Use get() to read current state, then set() with the transformed result
    const currentState = progressFlushGetFn()
    const updatedToasts: ToastMessage[] = currentState.toasts.map(t => {
      if (t.type !== 'progress') return t
      const update = updates.get(t.id)
      if (!update) return t
      return {
        ...t,
        progress: {
          ...t.progress!,
          current: update.current,
          percent: update.percent,
          speed: update.speed,
          label: update.label
        }
      }
    })
    
    progressFlushSetFn({ toasts: updatedToasts })
  })
}

export const createToastsSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  ToastsSlice
> = (set, get) => ({
  // Initial state
  toasts: [],
  
  // Actions
  addToast: (type: ToastType, message: string, duration = 5000) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const toast: ToastMessage = { id, type, message, duration }
    set(state => ({ toasts: [...state.toasts, toast] }))
  },
  
  addProgressToast: (id: string, message: string, total: number, queued?: boolean) => {
    set(state => ({ 
      toasts: [...state.toasts, { 
        id, 
        type: 'progress', 
        message, 
        duration: 0, // Don't auto-dismiss progress toasts
        progress: { current: 0, total, percent: 0, queued }
      }] 
    }))
  },
  
  setProgressToastActive: (id: string) => {
    set(state => ({
      toasts: state.toasts.map(t => 
        t.id === id && t.type === 'progress' && t.progress
          ? { ...t, progress: { ...t.progress, queued: false } }
          : t
      )
    }))
  },
  
  updateProgressToast: (id: string, current: number, percent: number, speed?: string, label?: string) => {
    // Batch updates: store the latest values and schedule a flush
    // This coalesces rapid updates into a single state change per animation frame
    pendingProgressUpdates.set(id, { current, percent, speed, label })
    scheduleProgressFlush(get, set)
  },
  
  requestCancelProgressToast: (id: string) => {
    set(state => ({
      toasts: state.toasts.map(t => 
        t.id === id && t.type === 'progress' && t.progress
          ? { ...t, progress: { ...t.progress, cancelRequested: true } }
          : t
      )
    }))
  },
  
  isProgressToastCancelled: (id: string) => {
    const toast = get().toasts.find(t => t.id === id)
    return toast?.progress?.cancelRequested || false
  },
  
  removeToast: (id: string) => {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },
})
