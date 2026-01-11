/**
 * Notification Filter Hook
 * 
 * Provides filtering logic for notifications based on user preferences:
 * - Category-based filtering (per-category enable/disable)
 * - Quiet hours (time-based suppression, supports spanning midnight)
 * - Sound playback (when enabled for category and globally)
 */
import { useCallback, useMemo } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import type { NotificationCategory } from '@/types/notifications'

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * Parse a time string in 24-hour format (HH:MM) to minutes since midnight.
 * @param time - Time string like "22:00" or "07:00"
 * @returns Minutes since midnight (0-1439)
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Get current time as minutes since midnight.
 * @returns Minutes since midnight (0-1439)
 */
function getCurrentTimeMinutes(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

/**
 * Check if current time is within quiet hours range.
 * Handles the case where quiet hours span midnight (e.g., 22:00-07:00).
 * 
 * @param startTime - Start time in 24-hour format (e.g., "22:00")
 * @param endTime - End time in 24-hour format (e.g., "07:00")
 * @returns true if currently within quiet hours
 */
function isWithinQuietHours(startTime: string, endTime: string): boolean {
  const current = getCurrentTimeMinutes()
  const start = parseTimeToMinutes(startTime)
  const end = parseTimeToMinutes(endTime)
  
  if (start === end) {
    // Same time means no quiet hours
    return false
  }
  
  if (start < end) {
    // Normal range (e.g., 09:00-17:00)
    // In quiet hours if: start <= current < end
    return current >= start && current < end
  } else {
    // Spans midnight (e.g., 22:00-07:00)
    // In quiet hours if: current >= start OR current < end
    return current >= start || current < end
  }
}

// ============================================================================
// Sound Playback
// ============================================================================

// Notification sound (simple beep using Web Audio API)
let audioContext: AudioContext | null = null

/**
 * Play a notification sound at the specified volume.
 * Uses Web Audio API for cross-platform compatibility.
 * 
 * @param volume - Volume level 0-100
 */
function playNotificationBeep(volume: number): void {
  try {
    // Lazy initialize AudioContext (browsers require user gesture)
    if (!audioContext) {
      audioContext = new AudioContext()
    }
    
    // Resume if suspended (required after tab becomes inactive)
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }
    
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    // Connect nodes
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    // Configure sound (pleasant notification tone)
    oscillator.frequency.value = 880 // A5 note
    oscillator.type = 'sine'
    
    // Volume: convert 0-100 to 0-0.3 (keep it gentle)
    const normalizedVolume = Math.max(0, Math.min(100, volume)) / 100 * 0.3
    gainNode.gain.value = normalizedVolume
    
    // Fade out for smooth sound
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.15
    )
    
    // Play for 150ms
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.15)
  } catch (error) {
    // Silently fail - audio may not be available in all contexts
    console.debug('[NotificationFilter] Failed to play sound:', error)
  }
}

// ============================================================================
// Hook Types
// ============================================================================

export interface NotificationFilterResult {
  /**
   * Check if a toast notification should be shown for the given category.
   * Returns false if:
   * - The category has toasts disabled
   * - Quiet hours are active
   */
  shouldShowToast: (category: NotificationCategory) => boolean
  
  /**
   * Play a notification sound for the given category if:
   * - Global sound is enabled
   * - Category sound is enabled
   * - Not in quiet hours
   */
  playNotificationSound: (category: NotificationCategory) => void
  
  /**
   * Check if currently within quiet hours (for UI display).
   */
  isQuietHoursActive: boolean
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook for filtering notifications based on user preferences.
 * 
 * @example
 * ```tsx
 * const { shouldShowToast, playNotificationSound } = useNotificationFilter()
 * 
 * if (shouldShowToast('fileOperations')) {
 *   addToast('info', 'File was checked out')
 *   playNotificationSound('fileOperations')
 * }
 * ```
 */
export function useNotificationFilter(): NotificationFilterResult {
  // Subscribe to notification preferences from store
  const notificationCategories = usePDMStore(s => s.notificationCategories)
  const quietHours = usePDMStore(s => s.quietHours)
  const soundSettings = usePDMStore(s => s.soundSettings)
  
  // Memoize quiet hours active check
  const isQuietHoursActive = useMemo(() => {
    if (!quietHours.enabled) return false
    return isWithinQuietHours(quietHours.startTime, quietHours.endTime)
  }, [quietHours.enabled, quietHours.startTime, quietHours.endTime])
  
  // Check if toast should be shown for category
  const shouldShowToast = useCallback((category: NotificationCategory): boolean => {
    // Check if quiet hours are active
    if (quietHours.enabled && isWithinQuietHours(quietHours.startTime, quietHours.endTime)) {
      return false
    }
    
    // Check if category has toasts enabled
    const categoryPrefs = notificationCategories[category]
    if (!categoryPrefs?.toastEnabled) {
      return false
    }
    
    return true
  }, [notificationCategories, quietHours])
  
  // Play notification sound for category
  const playNotificationSound = useCallback((category: NotificationCategory): void => {
    // Check if global sound is enabled
    if (!soundSettings.enabled) return
    
    // Check if quiet hours are active
    if (quietHours.enabled && isWithinQuietHours(quietHours.startTime, quietHours.endTime)) {
      return
    }
    
    // Check if category sound is enabled
    const categoryPrefs = notificationCategories[category]
    if (!categoryPrefs?.soundEnabled) {
      return
    }
    
    // Play the sound
    playNotificationBeep(soundSettings.volume)
  }, [notificationCategories, quietHours, soundSettings])
  
  return {
    shouldShowToast,
    playNotificationSound,
    isQuietHoursActive,
  }
}

// ============================================================================
// Non-Hook Utilities (for use outside React components)
// ============================================================================

/**
 * Check if a notification should be shown based on current store state.
 * Use this when you don't have access to React hooks (e.g., in callbacks, event handlers).
 * 
 * @param category - The notification category to check
 * @returns true if the notification should be shown
 */
export function shouldShowToast(category: NotificationCategory): boolean {
  const state = usePDMStore.getState()
  const { notificationCategories, quietHours } = state
  
  // Check quiet hours
  if (quietHours.enabled && isWithinQuietHours(quietHours.startTime, quietHours.endTime)) {
    return false
  }
  
  // Check category preference
  const categoryPrefs = notificationCategories[category]
  return categoryPrefs?.toastEnabled ?? true
}

/**
 * Play a notification sound based on current store state.
 * Use this when you don't have access to React hooks (e.g., in callbacks, event handlers).
 * 
 * @param category - The notification category
 */
export function playNotificationSound(category: NotificationCategory): void {
  const state = usePDMStore.getState()
  const { notificationCategories, quietHours, soundSettings } = state
  
  // Check global sound
  if (!soundSettings.enabled) return
  
  // Check quiet hours
  if (quietHours.enabled && isWithinQuietHours(quietHours.startTime, quietHours.endTime)) {
    return
  }
  
  // Check category sound
  const categoryPrefs = notificationCategories[category]
  if (!categoryPrefs?.soundEnabled) {
    return
  }
  
  playNotificationBeep(soundSettings.volume)
}
