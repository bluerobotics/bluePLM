/**
 * Notifications Settings Page
 * 
 * Allows users to configure notification preferences including:
 * - Per-category toast and sound toggles
 * - Quiet hours scheduling
 * - Global sound settings with volume control
 */
import { useState } from 'react'
import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Moon,
  Clock,
  ToggleLeft,
  ToggleRight,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileCheck,
  GitBranch,
  CheckSquare,
  FileEdit,
  ShoppingCart,
  Shield,
  Settings,
  Users,
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CATEGORY_DESCRIPTIONS,
  type NotificationCategory,
} from '@/types/notifications'

// Map category icon names to actual Lucide components
const CATEGORY_ICONS: Record<NotificationCategory, React.ReactNode> = {
  fileOperations: <FileCheck size={18} />,
  workflow: <GitBranch size={18} />,
  reviews: <CheckSquare size={18} />,
  changeControl: <FileEdit size={18} />,
  purchasing: <ShoppingCart size={18} />,
  quality: <Shield size={18} />,
  system: <Settings size={18} />,
  collaboration: <Users size={18} />,
}

export function NotificationsSettings() {
  // ═══════════════════════════════════════════════════════════════════════════
  // Store Selectors
  // ═══════════════════════════════════════════════════════════════════════════
  
  const notificationCategories = usePDMStore(s => s.notificationCategories)
  const toggleCategoryToast = usePDMStore(s => s.toggleCategoryToast)
  const toggleCategorySound = usePDMStore(s => s.toggleCategorySound)
  const setAllCategoriesToastEnabled = usePDMStore(s => s.setAllCategoriesToastEnabled)
  const setAllCategoriesSoundEnabled = usePDMStore(s => s.setAllCategoriesSoundEnabled)
  
  const quietHours = usePDMStore(s => s.quietHours)
  const toggleQuietHours = usePDMStore(s => s.toggleQuietHours)
  const setQuietHoursStart = usePDMStore(s => s.setQuietHoursStart)
  const setQuietHoursEnd = usePDMStore(s => s.setQuietHoursEnd)
  
  const soundSettings = usePDMStore(s => s.soundSettings)
  const toggleSound = usePDMStore(s => s.toggleSound)
  const setSoundVolume = usePDMStore(s => s.setSoundVolume)
  
  const resetNotificationPreferences = usePDMStore(s => s.resetNotificationPreferences)
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Local UI State
  // ═══════════════════════════════════════════════════════════════════════════
  
  const [expandedCategories, setExpandedCategories] = useState(true)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Computed Values
  // ═══════════════════════════════════════════════════════════════════════════
  
  const allToastsEnabled = NOTIFICATION_CATEGORIES.every(
    cat => notificationCategories[cat].toastEnabled
  )
  const someToastsEnabled = NOTIFICATION_CATEGORIES.some(
    cat => notificationCategories[cat].toastEnabled
  )
  const allSoundsEnabled = NOTIFICATION_CATEGORIES.every(
    cat => notificationCategories[cat].soundEnabled
  )
  const someSoundsEnabled = NOTIFICATION_CATEGORIES.some(
    cat => notificationCategories[cat].soundEnabled
  )
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleToggleAllToasts = () => {
    setAllCategoriesToastEnabled(!allToastsEnabled)
  }
  
  const handleToggleAllSounds = () => {
    setAllCategoriesSoundEnabled(!allSoundsEnabled)
  }
  
  const handleReset = () => {
    resetNotificationPreferences()
    setShowResetConfirm(false)
  }
  
  return (
    <div className="space-y-8">
      {/* Header with master controls */}
      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
          Notification Preferences
        </h2>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-lg bg-plm-accent text-white">
              <Bell size={18} />
            </div>
            <div>
              <div className="text-base font-medium text-plm-fg">
                Manage Notifications
              </div>
              <div className="text-sm text-plm-fg-muted">
                Control which events trigger in-app notifications and sounds
              </div>
            </div>
          </div>
          
          {/* Master toggles */}
          <div className="flex gap-4 pt-3 border-t border-plm-border">
            <button
              onClick={handleToggleAllToasts}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                allToastsEnabled
                  ? 'bg-plm-accent/20 text-plm-accent border border-plm-accent/30'
                  : someToastsEnabled
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'bg-plm-highlight text-plm-fg-muted border border-plm-border'
              }`}
            >
              {allToastsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
              {allToastsEnabled ? 'All Toasts On' : someToastsEnabled ? 'Some Toasts On' : 'All Toasts Off'}
            </button>
            <button
              onClick={handleToggleAllSounds}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                allSoundsEnabled
                  ? 'bg-plm-accent/20 text-plm-accent border border-plm-accent/30'
                  : someSoundsEnabled
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'bg-plm-highlight text-plm-fg-muted border border-plm-border'
              }`}
            >
              {allSoundsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {allSoundsEnabled ? 'All Sounds On' : someSoundsEnabled ? 'Some Sounds On' : 'All Sounds Off'}
            </button>
          </div>
        </div>
      </section>
      
      {/* Notification Categories */}
      <section>
        <button
          onClick={() => setExpandedCategories(!expandedCategories)}
          className="w-full flex items-center justify-between text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3 hover:text-plm-fg transition-colors"
        >
          <span>Notification Categories</span>
          {expandedCategories ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {expandedCategories && (
          <div className="bg-plm-bg rounded-lg border border-plm-border overflow-hidden">
            <div className="px-4 py-3 border-b border-plm-border bg-plm-bg-secondary">
              <div className="flex items-center justify-between text-xs font-medium text-plm-fg-muted uppercase tracking-wide">
                <span>Category</span>
                <div className="flex items-center gap-6">
                  <span className="w-16 text-center">Toast</span>
                  <span className="w-16 text-center">Sound</span>
                </div>
              </div>
            </div>
            
            <div className="divide-y divide-plm-border">
              {NOTIFICATION_CATEGORIES.map((category) => {
                const preference = notificationCategories[category]
                return (
                  <div
                    key={category}
                    className="flex items-center justify-between px-4 py-3 hover:bg-plm-highlight/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-plm-highlight text-plm-fg-muted">
                        {CATEGORY_ICONS[category]}
                      </div>
                      <div>
                        <div className="text-base font-medium text-plm-fg">
                          {NOTIFICATION_CATEGORY_LABELS[category]}
                        </div>
                        <div className="text-sm text-plm-fg-muted">
                          {NOTIFICATION_CATEGORY_DESCRIPTIONS[category]}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      {/* Toast toggle */}
                      <div className="w-16 flex justify-center">
                        <button
                          onClick={() => toggleCategoryToast(category)}
                          className="text-plm-accent"
                          title={preference.toastEnabled ? 'Disable toast notifications' : 'Enable toast notifications'}
                        >
                          {preference.toastEnabled ? (
                            <ToggleRight size={28} />
                          ) : (
                            <ToggleLeft size={28} className="text-plm-fg-muted" />
                          )}
                        </button>
                      </div>
                      
                      {/* Sound toggle */}
                      <div className="w-16 flex justify-center">
                        <button
                          onClick={() => toggleCategorySound(category)}
                          className={`transition-opacity ${!soundSettings.enabled ? 'opacity-40 cursor-not-allowed' : 'text-plm-accent'}`}
                          disabled={!soundSettings.enabled}
                          title={
                            !soundSettings.enabled
                              ? 'Enable global sound first'
                              : preference.soundEnabled
                              ? 'Disable sound for this category'
                              : 'Enable sound for this category'
                          }
                        >
                          {preference.soundEnabled ? (
                            <ToggleRight size={28} />
                          ) : (
                            <ToggleLeft size={28} className="text-plm-fg-muted" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
      
      {/* Quiet Hours */}
      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
          Quiet Hours
        </h2>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-plm-highlight">
                <Moon size={18} className="text-plm-fg-muted" />
              </div>
              <div>
                <div className="text-base text-plm-fg">Enable Quiet Hours</div>
                <div className="text-sm text-plm-fg-muted mt-0.5">
                  Silence notifications during specified hours
                </div>
              </div>
            </div>
            <button
              onClick={toggleQuietHours}
              className="text-plm-accent"
            >
              {quietHours.enabled ? (
                <ToggleRight size={28} />
              ) : (
                <ToggleLeft size={28} className="text-plm-fg-muted" />
              )}
            </button>
          </div>
          
          {quietHours.enabled && (
            <div className="pt-3 border-t border-plm-border">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-plm-fg-muted" />
                  <span className="text-sm text-plm-fg-muted">From</span>
                  <input
                    type="time"
                    value={quietHours.startTime}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    className="px-3 py-1.5 bg-plm-bg-secondary border border-plm-border rounded-lg text-base text-plm-fg focus:border-plm-accent focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-plm-fg-muted">To</span>
                  <input
                    type="time"
                    value={quietHours.endTime}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    className="px-3 py-1.5 bg-plm-bg-secondary border border-plm-border rounded-lg text-base text-plm-fg focus:border-plm-accent focus:outline-none"
                  />
                </div>
              </div>
              <p className="text-xs text-plm-fg-dim mt-3">
                Notifications will be silenced between {quietHours.startTime} and {quietHours.endTime}. 
                They will still appear in your notification center.
              </p>
            </div>
          )}
        </div>
      </section>
      
      {/* Sound Settings */}
      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
          Sound Settings
        </h2>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-plm-highlight">
                {soundSettings.enabled ? (
                  <Volume2 size={18} className="text-plm-fg-muted" />
                ) : (
                  <VolumeX size={18} className="text-plm-fg-muted" />
                )}
              </div>
              <div>
                <div className="text-base text-plm-fg">Notification Sounds</div>
                <div className="text-sm text-plm-fg-muted mt-0.5">
                  Play sounds for new notifications
                </div>
              </div>
            </div>
            <button
              onClick={toggleSound}
              className="text-plm-accent"
            >
              {soundSettings.enabled ? (
                <ToggleRight size={28} />
              ) : (
                <ToggleLeft size={28} className="text-plm-fg-muted" />
              )}
            </button>
          </div>
          
          {soundSettings.enabled && (
            <div className="pt-3 border-t border-plm-border">
              <div className="flex items-center gap-4">
                <VolumeX size={16} className="text-plm-fg-muted flex-shrink-0" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={soundSettings.volume}
                  onChange={(e) => setSoundVolume(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-plm-highlight rounded-lg appearance-none cursor-pointer accent-plm-accent"
                />
                <Volume2 size={16} className="text-plm-fg-muted flex-shrink-0" />
                <span className="w-12 text-sm text-plm-fg-muted text-right">
                  {soundSettings.volume}%
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
      
      {/* Reset to Defaults */}
      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
          Reset
        </h2>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border">
          {!showResetConfirm ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-plm-highlight">
                  <RotateCcw size={18} className="text-plm-fg-muted" />
                </div>
                <div>
                  <div className="text-base text-plm-fg">Reset to Defaults</div>
                  <div className="text-sm text-plm-fg-muted mt-0.5">
                    Restore all notification settings to their default values
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-4 py-2 text-sm font-medium text-plm-fg-muted hover:text-plm-fg bg-plm-highlight hover:bg-plm-border rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-plm-warning/20">
                  <RotateCcw size={18} className="text-plm-warning" />
                </div>
                <div>
                  <div className="text-base text-plm-fg">Confirm Reset</div>
                  <div className="text-sm text-plm-warning mt-0.5">
                    This will reset all notification preferences. This cannot be undone.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-plm-fg-muted hover:text-plm-fg bg-plm-highlight hover:bg-plm-border rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-white bg-plm-error hover:bg-plm-error/80 rounded-lg transition-colors"
                >
                  Reset All
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
