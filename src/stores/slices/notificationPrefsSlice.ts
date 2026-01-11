/**
 * Notification Preferences Slice
 * 
 * Manages user preferences for in-app toast notifications, sounds, and quiet hours.
 * All state is persisted via Zustand persist middleware.
 */
import { StateCreator } from 'zustand'
import type { PDMStoreState, NotificationPrefsSlice } from '../types'
import type { 
  NotificationCategory, 
  CategoryPreference,
  QuietHoursConfig,
  SoundSettings,
} from '../../types/notifications'
import { 
  getDefaultCategoryPreferences,
  getDefaultNotificationPreferences,
  DEFAULT_QUIET_HOURS,
  DEFAULT_SOUND_SETTINGS,
} from '../../types/notifications'

export const createNotificationPrefsSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  NotificationPrefsSlice
> = (set) => ({
  // ═══════════════════════════════════════════════════════════════
  // Initial State
  // ═══════════════════════════════════════════════════════════════
  
  notificationCategories: getDefaultCategoryPreferences(),
  quietHours: { ...DEFAULT_QUIET_HOURS },
  soundSettings: { ...DEFAULT_SOUND_SETTINGS },
  
  // ═══════════════════════════════════════════════════════════════
  // Category Actions
  // ═══════════════════════════════════════════════════════════════
  
  setCategoryPreference: (category: NotificationCategory, preference: Partial<CategoryPreference>) => 
    set((state) => ({
      notificationCategories: {
        ...state.notificationCategories,
        [category]: {
          ...state.notificationCategories[category],
          ...preference,
        },
      },
    })),
  
  toggleCategoryToast: (category: NotificationCategory) =>
    set((state) => ({
      notificationCategories: {
        ...state.notificationCategories,
        [category]: {
          ...state.notificationCategories[category],
          toastEnabled: !state.notificationCategories[category].toastEnabled,
        },
      },
    })),
  
  toggleCategorySound: (category: NotificationCategory) =>
    set((state) => ({
      notificationCategories: {
        ...state.notificationCategories,
        [category]: {
          ...state.notificationCategories[category],
          soundEnabled: !state.notificationCategories[category].soundEnabled,
        },
      },
    })),
  
  setAllCategoriesToastEnabled: (enabled: boolean) =>
    set((state) => {
      const updated = { ...state.notificationCategories }
      for (const key of Object.keys(updated) as NotificationCategory[]) {
        updated[key] = { ...updated[key], toastEnabled: enabled }
      }
      return { notificationCategories: updated }
    }),
  
  setAllCategoriesSoundEnabled: (enabled: boolean) =>
    set((state) => {
      const updated = { ...state.notificationCategories }
      for (const key of Object.keys(updated) as NotificationCategory[]) {
        updated[key] = { ...updated[key], soundEnabled: enabled }
      }
      return { notificationCategories: updated }
    }),
  
  // ═══════════════════════════════════════════════════════════════
  // Quiet Hours Actions
  // ═══════════════════════════════════════════════════════════════
  
  setQuietHours: (config: Partial<QuietHoursConfig>) =>
    set((state) => ({
      quietHours: {
        ...state.quietHours,
        ...config,
      },
    })),
  
  toggleQuietHours: () =>
    set((state) => ({
      quietHours: {
        ...state.quietHours,
        enabled: !state.quietHours.enabled,
      },
    })),
  
  setQuietHoursStart: (time: string) =>
    set((state) => ({
      quietHours: {
        ...state.quietHours,
        startTime: time,
      },
    })),
  
  setQuietHoursEnd: (time: string) =>
    set((state) => ({
      quietHours: {
        ...state.quietHours,
        endTime: time,
      },
    })),
  
  // ═══════════════════════════════════════════════════════════════
  // Sound Actions
  // ═══════════════════════════════════════════════════════════════
  
  setSoundSettings: (settings: Partial<SoundSettings>) =>
    set((state) => ({
      soundSettings: {
        ...state.soundSettings,
        ...settings,
      },
    })),
  
  toggleSound: () =>
    set((state) => ({
      soundSettings: {
        ...state.soundSettings,
        enabled: !state.soundSettings.enabled,
      },
    })),
  
  setSoundVolume: (volume: number) =>
    set(() => ({
      soundSettings: {
        enabled: true, // Auto-enable when setting volume
        volume: Math.max(0, Math.min(100, volume)),
      },
    })),
  
  // ═══════════════════════════════════════════════════════════════
  // Reset Action
  // ═══════════════════════════════════════════════════════════════
  
  resetNotificationPreferences: () => {
    const defaults = getDefaultNotificationPreferences()
    set({
      notificationCategories: defaults.categories,
      quietHours: defaults.quietHours,
      soundSettings: defaults.sound,
    })
  },
})
