/**
 * Google Drive Settings Component
 * 
 * Configuration UI for the Google Drive extension.
 * All operations go through the ExtensionClientAPI.
 * 
 * @module extensions/google-drive/client/components/GoogleDriveSettings
 */

import { useState, useEffect } from 'react'
import { 
  HardDrive, 
  Loader2, 
  Check, 
  RefreshCw,
  Clock,
  FileQuestion,
  FolderSync,
  Upload,
  Download,
  ArrowLeftRight,
  Plus,
  X,
  LogIn,
  LogOut,
  Calendar
} from 'lucide-react'
import type { ExtensionClientAPI } from '@/lib/extensions/api/types'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface GoogleDriveConfig {
  syncInterval: number
  syncOnFileChange: boolean
  excludePatterns: string[]
  syncDirection: 'bidirectional' | 'upload-only' | 'download-only'
}

interface ConnectionStatus {
  connected: boolean
  userEmail?: string
  userName?: string
  lastSyncAt?: string
}

interface GoogleDriveSettingsProps {
  api: ExtensionClientAPI
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Google Drive settings configuration component.
 */
export function GoogleDriveSettings({ api }: GoogleDriveSettingsProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false
  })

  // Config state
  const [config, setConfig] = useState<GoogleDriveConfig>({
    syncInterval: 300,
    syncOnFileChange: true,
    excludePatterns: [],
    syncDirection: 'bidirectional'
  })

  // Exclude pattern input
  const [newPattern, setNewPattern] = useState('')

  // ─────────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSettings()
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // Data Loading
  // ─────────────────────────────────────────────────────────────────────────────

  const loadSettings = async () => {
    setIsLoading(true)
    try {
      // Load connection status
      const statusResponse = await api.callOrgApi<ConnectionStatus>(
        '/extensions/blueplm.google-drive/status'
      )
      if (statusResponse.ok) {
        setConnectionStatus(statusResponse.data)
      }

      // Load config from local storage
      const storedConfig = await api.storage.get<GoogleDriveConfig>('config')
      if (storedConfig) {
        setConfig(prev => ({ ...prev, ...storedConfig }))
      }
    } catch (err) {
      console.error('Error loading settings:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Config Actions
  // ─────────────────────────────────────────────────────────────────────────────

  const saveConfig = async () => {
    setIsSaving(true)
    try {
      await api.storage.set('config', config)
      api.ui.showToast('Settings saved', 'success')
      
      // Emit config changed event so the main extension can react
      api.events.emit('config:changed')
    } catch (err) {
      api.ui.showToast('Failed to save settings', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const updateConfig = <K extends keyof GoogleDriveConfig>(
    key: K,
    value: GoogleDriveConfig[K]
  ) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const addExcludePattern = () => {
    if (newPattern.trim() && !config.excludePatterns.includes(newPattern.trim())) {
      updateConfig('excludePatterns', [...config.excludePatterns, newPattern.trim()])
      setNewPattern('')
    }
  }

  const removeExcludePattern = (pattern: string) => {
    updateConfig('excludePatterns', config.excludePatterns.filter(p => p !== pattern))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Connection Actions
  // ─────────────────────────────────────────────────────────────────────────────

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      await api.commands.executeCommand('google-drive.connect')
      // Reload status after a delay
      setTimeout(loadSettings, 3000)
    } catch (err) {
      api.ui.showToast('Failed to connect', 'error')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await api.commands.executeCommand('google-drive.disconnect')
      setConnectionStatus({ connected: false })
    } catch (err) {
      api.ui.showToast('Failed to disconnect', 'error')
    }
  }

  const handleManualSync = async () => {
    try {
      await api.commands.executeCommand('google-drive.sync')
      // Reload status after sync
      setTimeout(loadSettings, 1000)
    } catch (err) {
      api.ui.showToast('Sync failed', 'error')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const formatLastSync = (dateStr: string | undefined) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
    return date.toLocaleDateString()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 size={24} className="animate-spin text-plm-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 via-green-500 to-yellow-500 flex items-center justify-center shadow">
          <HardDrive size={24} className="text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-medium text-plm-fg">Google Drive</h3>
          <p className="text-sm text-plm-fg-muted">
            Sync files with Google Drive for backup and collaboration
          </p>
        </div>
      </div>

      {/* Connection Status */}
      <div className="p-4 bg-plm-bg rounded-lg border border-plm-border">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-plm-fg">Connection</h4>
          <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium ${
            connectionStatus.connected 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-gray-500/20 text-gray-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus.connected ? 'bg-green-400' : 'bg-gray-400'
            }`} />
            {connectionStatus.connected ? 'Connected' : 'Not connected'}
          </div>
        </div>

        {connectionStatus.connected ? (
          <div className="space-y-3">
            {/* User info */}
            <div className="flex items-center gap-3 p-3 bg-plm-sidebar rounded-lg">
              <div className="w-10 h-10 rounded-full bg-plm-accent flex items-center justify-center text-white font-medium">
                {connectionStatus.userName?.[0] || connectionStatus.userEmail?.[0] || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                {connectionStatus.userName && (
                  <p className="font-medium text-plm-fg truncate">{connectionStatus.userName}</p>
                )}
                <p className="text-sm text-plm-fg-muted truncate">{connectionStatus.userEmail}</p>
              </div>
            </div>

            {/* Last sync */}
            <div className="flex items-center gap-2 text-sm text-plm-fg-muted">
              <Calendar size={14} />
              <span>Last synced: {formatLastSync(connectionStatus.lastSyncAt)}</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleManualSync}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-plm-accent text-white rounded-lg hover:bg-plm-accent/90 transition-colors"
              >
                <RefreshCw size={16} />
                Sync Now
              </button>
              <button
                onClick={handleDisconnect}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-plm-sidebar text-plm-fg-muted rounded-lg hover:bg-plm-highlight transition-colors"
              >
                <LogOut size={16} />
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-plm-fg-muted mb-4">
              Connect your Google account to enable file synchronization.
            </p>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-gray-800 rounded-lg hover:bg-gray-100 transition-colors shadow disabled:opacity-50 font-medium"
            >
              {isConnecting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <LogIn size={18} />
              )}
              {isConnecting ? 'Connecting...' : 'Sign in with Google'}
            </button>
          </div>
        )}
      </div>

      {/* Sync Settings */}
      <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
        <h4 className="font-medium text-plm-fg flex items-center gap-2">
          <FolderSync size={18} />
          Sync Settings
        </h4>

        {/* Sync Interval */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-plm-fg-muted">
            <Clock size={14} />
            Sync Interval
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={60}
              max={3600}
              step={60}
              value={config.syncInterval}
              onChange={(e) => updateConfig('syncInterval', parseInt(e.target.value))}
              className="flex-1 h-2 bg-plm-sidebar rounded-lg appearance-none cursor-pointer accent-plm-accent"
            />
            <span className="text-sm text-plm-fg w-24 text-right">
              {config.syncInterval >= 3600 
                ? `${Math.floor(config.syncInterval / 3600)} hour${config.syncInterval >= 7200 ? 's' : ''}`
                : `${Math.floor(config.syncInterval / 60)} min`}
            </span>
          </div>
        </div>

        {/* Sync Direction */}
        <div className="space-y-2">
          <label className="text-sm text-plm-fg-muted">Sync Direction</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'bidirectional', label: 'Both Ways', icon: ArrowLeftRight },
              { value: 'upload-only', label: 'Upload Only', icon: Upload },
              { value: 'download-only', label: 'Download Only', icon: Download }
            ] as const).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => updateConfig('syncDirection', value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
                  config.syncDirection === value
                    ? 'border-plm-accent bg-plm-accent/10 text-plm-accent'
                    : 'border-plm-border hover:border-plm-accent/50 text-plm-fg-muted'
                }`}
              >
                <Icon size={20} />
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sync on file change */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-plm-fg">Sync when files change</label>
          <button
            onClick={() => updateConfig('syncOnFileChange', !config.syncOnFileChange)}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              config.syncOnFileChange ? 'bg-plm-accent' : 'bg-plm-border'
            }`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              config.syncOnFileChange ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Exclude Patterns */}
      <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
        <h4 className="font-medium text-plm-fg flex items-center gap-2">
          <FileQuestion size={18} />
          Exclude Patterns
        </h4>
        <p className="text-sm text-plm-fg-muted">
          Files matching these patterns will not be synced (e.g., *.tmp, .git/**)
        </p>

        {/* Add pattern input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addExcludePattern()}
            placeholder="e.g., *.tmp"
            className="flex-1 px-3 py-2 text-sm bg-plm-sidebar border border-plm-border rounded-lg focus:outline-none focus:border-plm-accent"
          />
          <button
            onClick={addExcludePattern}
            disabled={!newPattern.trim()}
            className="px-3 py-2 bg-plm-accent text-white rounded-lg hover:bg-plm-accent/90 transition-colors disabled:opacity-50"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Pattern list */}
        {config.excludePatterns.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {config.excludePatterns.map(pattern => (
              <div
                key={pattern}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-plm-sidebar rounded-full text-sm"
              >
                <code className="text-plm-fg-muted">{pattern}</code>
                <button
                  onClick={() => removeExcludePattern(pattern)}
                  className="text-plm-fg-muted hover:text-red-400 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={saveConfig}
        disabled={isSaving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-plm-accent text-white rounded-lg hover:bg-plm-accent/90 transition-colors disabled:opacity-50"
      >
        {isSaving ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Check size={18} />
        )}
        {isSaving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}

export default GoogleDriveSettings
