/**
 * Vault Setup Dialog
 * 
 * Shows when a user first connects to a vault.
 * Prompts for auto-download preferences before syncing begins.
 * 
 * Features:
 * - Displays vault name and stats (file count, total size)
 * - Shows sync status breakdown (local, server, synced, mismatched)
 * - Toggle for auto-download cloud files (default ON)
 * - Toggle for auto-download updates (default ON)
 * - Summary of what will happen after connecting
 * - Windows Defender exclusion warning (Windows only)
 */

import { useState } from 'react'
import { HardDrive, CloudDownload, Download, Check, X, ToggleLeft, ToggleRight, FileText, Cloud, MonitorSmartphone, CheckCircle2, AlertCircle, Loader2, Scale, Shield, Copy } from 'lucide-react'
import { formatFileSize } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'

// ============================================
// Types
// ============================================

interface VaultStats {
  fileCount: number
  totalSize: number
}

/** Extended stats that include sync status breakdown */
export interface VaultSyncStats {
  /** Total files on server (cloud) */
  serverFileCount: number
  /** Total size of files on server */
  serverTotalSize: number
  /** Number of files that exist locally */
  localFileCount: number
  /** Number of files synced (matching content) */
  syncedCount: number
  /** Files only on server (need download) */
  cloudOnlyCount: number
  /** Files only local (not uploaded) */
  localOnlyCount: number
  /** Files that are outdated (local version differs from server) */
  outdatedCount: number
  /** Whether sync stats are still loading */
  isLoading?: boolean
}

interface VaultSetupDialogProps {
  vaultId: string
  vaultName: string
  vaultDescription?: string | null
  /** Basic stats (server only) - used when no local files exist */
  stats?: VaultStats
  /** Extended sync stats - used when reconnecting with existing local files */
  syncStats?: VaultSyncStats
  /** Initial size limit value (from store) */
  initialSizeLimit?: number
  /** Local path where the vault will be stored (for Windows Defender warning) */
  vaultLocalPath?: string
  onComplete: (preferences: { autoDownloadCloudFiles: boolean; autoDownloadUpdates: boolean; autoDownloadSizeLimit: number }) => void
  onCancel: () => void
}

// ============================================
// Component
// ============================================

export function VaultSetupDialog({
  vaultId,
  vaultName,
  vaultDescription,
  stats,
  syncStats,
  initialSizeLimit = 1024,
  vaultLocalPath,
  onComplete,
  onCancel
}: VaultSetupDialogProps) {
  const { t } = useTranslation()
  const avExclusionWarningDismissed = usePDMStore(s => s.avExclusionWarningDismissed)
  const setAvExclusionWarningDismissed = usePDMStore(s => s.setAvExclusionWarningDismissed)
  
  // Default both toggles to OFF - users must explicitly opt-in to automatic downloads
  const [autoDownloadCloudFiles, setAutoDownloadCloudFiles] = useState(false)
  const [autoDownloadUpdates, setAutoDownloadUpdates] = useState(false)
  const [sizeLimit, setSizeLimit] = useState(initialSizeLimit)
  const [sizeLimitEnabled, setSizeLimitEnabled] = useState(initialSizeLimit > 0)
  const [pathCopied, setPathCopied] = useState(false)
  
  // Check if running on Windows
  const isWindows = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('win')
  
  // Show Windows Defender warning if on Windows, path provided, and not dismissed
  const showDefenderWarning = isWindows && vaultLocalPath && !avExclusionWarningDismissed
  
  // Copy vault path to clipboard
  const handleCopyPath = async () => {
    if (vaultLocalPath) {
      try {
        await navigator.clipboard.writeText(vaultLocalPath)
        setPathCopied(true)
        setTimeout(() => setPathCopied(false), 2000)
      } catch (err) {
        log.warn('[VaultSetup]', 'Failed to copy path to clipboard', { error: String(err) })
      }
    }
  }
  
  // Dismiss the warning permanently
  const handleDismissWarning = () => {
    setAvExclusionWarningDismissed(true)
    log.info('[VaultSetup]', 'User dismissed Windows Defender exclusion warning')
  }
  
  const handleConnect = () => {
    log.info('[VaultSetup]', 'User completed setup', {
      vaultId,
      vaultName,
      autoDownloadCloudFiles,
      autoDownloadUpdates,
      autoDownloadSizeLimit: sizeLimitEnabled ? sizeLimit : 0,
      fileCount: syncStats?.serverFileCount ?? stats?.fileCount ?? 0
    })
    onComplete({ 
      autoDownloadCloudFiles, 
      autoDownloadUpdates,
      autoDownloadSizeLimit: sizeLimitEnabled ? sizeLimit : 0
    })
  }
  
  const handleSkip = () => {
    log.info('[VaultSetup]', 'User skipped setup', { vaultId, vaultName })
    // When skipping, use defaults (OFF) - don't change existing settings
    onComplete({ autoDownloadCloudFiles: false, autoDownloadUpdates: false, autoDownloadSizeLimit: 1024 })
  }
  
  // Determine which stats to use - prefer syncStats if available
  const hasSyncStats = syncStats && !syncStats.isLoading
  const serverFileCount = hasSyncStats ? syncStats.serverFileCount : (stats?.fileCount ?? 0)
  const serverTotalSize = hasSyncStats ? syncStats.serverTotalSize : (stats?.totalSize ?? 0)
  
  // Calculate what will be downloaded
  const willDownload = autoDownloadCloudFiles && serverFileCount > 0
  const formattedSize = formatFileSize(serverTotalSize)
  const fileCountText = serverFileCount === 1 
    ? t('vaultSetup.fileCountSingular', '1 file')
    : t('vaultSetup.fileCount', '{{count}} files').replace('{{count}}', String(serverFileCount))
  
  // Check if there are any sync issues (mismatches)
  const hasSyncIssues = hasSyncStats && (syncStats.outdatedCount > 0 || syncStats.localOnlyCount > 0)
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-plm-bg-light border border-plm-border rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-plm-border bg-plm-accent/5">
          <div className="p-2 rounded-lg bg-plm-accent/10">
            <HardDrive size={20} className="text-plm-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-plm-fg truncate">
              {t('vaultSetup.title', 'Set Up Your Vault')}
            </h2>
            <p className="text-sm text-plm-fg-muted truncate">
              {vaultName}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-plm-bg transition-colors text-plm-fg-muted hover:text-plm-fg"
          >
            <X size={18} />
          </button>
        </div>
        
        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          
          {/* Vault Info - Simple stats when no sync stats, or detailed when available */}
          {syncStats?.isLoading ? (
            <div className="flex items-center gap-3 p-4 bg-plm-bg rounded-lg border border-plm-border">
              <Loader2 size={20} className="text-plm-accent animate-spin" />
              <span className="text-sm text-plm-fg-muted">Analyzing vault files...</span>
            </div>
          ) : hasSyncStats ? (
            /* Detailed sync breakdown */
            <div className="space-y-2">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-2">
                {/* Server Files */}
                <div className="flex items-center gap-3 p-2.5 bg-plm-bg rounded-lg border border-plm-border">
                  <div className="p-1.5 rounded bg-blue-500/10">
                    <Cloud size={14} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-plm-fg-muted">On Server</div>
                    <div className="font-medium text-sm text-plm-fg">{syncStats.serverFileCount} files</div>
                  </div>
                </div>
                
                {/* Local Files */}
                <div className="flex items-center gap-3 p-2.5 bg-plm-bg rounded-lg border border-plm-border">
                  <div className="p-1.5 rounded bg-amber-500/10">
                    <MonitorSmartphone size={14} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-plm-fg-muted">On Your Computer</div>
                    <div className="font-medium text-sm text-plm-fg">{syncStats.localFileCount} files</div>
                  </div>
                </div>
                
                {/* Synced */}
                <div className="flex items-center gap-3 p-2.5 bg-plm-bg rounded-lg border border-plm-border">
                  <div className="p-1.5 rounded bg-green-500/10">
                    <CheckCircle2 size={14} className="text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-plm-fg-muted">Already Synced</div>
                    <div className="font-medium text-sm text-plm-fg">{syncStats.syncedCount} files</div>
                  </div>
                </div>
                
                {/* Cloud Only (need download) */}
                <div className="flex items-center gap-3 p-2.5 bg-plm-bg rounded-lg border border-plm-border">
                  <div className={`p-1.5 rounded ${syncStats.cloudOnlyCount > 0 ? 'bg-plm-accent/10' : 'bg-plm-bg-light'}`}>
                    <CloudDownload size={14} className={syncStats.cloudOnlyCount > 0 ? 'text-plm-accent' : 'text-plm-fg-muted'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-plm-fg-muted">Need Download</div>
                    <div className="font-medium text-sm text-plm-fg">{syncStats.cloudOnlyCount} files</div>
                  </div>
                </div>
              </div>
              
              {/* Mismatches warning if any */}
              {hasSyncIssues && (
                <div className="flex items-start gap-2 p-2.5 bg-amber-500/5 rounded-lg border border-amber-500/20">
                  <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-600 dark:text-amber-400">
                    {syncStats.outdatedCount > 0 && (
                      <span>{syncStats.outdatedCount} file{syncStats.outdatedCount !== 1 ? 's' : ''} outdated (newer version on server)</span>
                    )}
                    {syncStats.outdatedCount > 0 && syncStats.localOnlyCount > 0 && <span> • </span>}
                    {syncStats.localOnlyCount > 0 && (
                      <span>{syncStats.localOnlyCount} file{syncStats.localOnlyCount !== 1 ? 's' : ''} local only (not uploaded)</span>
                    )}
                  </div>
                </div>
              )}
              
              {/* Total size */}
              {serverTotalSize > 0 && (
                <div className="text-xs text-plm-fg-muted text-center pt-1">
                  Total vault size: {formattedSize}
                </div>
              )}
              
              {/* Vault description */}
              {vaultDescription && (
                <p className="text-xs text-plm-fg-muted text-center">
                  {vaultDescription}
                </p>
              )}
            </div>
          ) : (
            /* Simple stats - no local files scanned */
            <div className="flex items-center gap-4 p-3 bg-plm-bg rounded-lg border border-plm-border">
              <div className="p-2.5 rounded-lg bg-plm-accent/10">
                <FileText size={20} className="text-plm-accent" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-plm-fg font-medium">
                  <span>{fileCountText}</span>
                  {serverTotalSize > 0 && (
                    <>
                      <span className="text-plm-fg-muted">•</span>
                      <span className="text-plm-fg-muted font-normal">{formattedSize}</span>
                    </>
                  )}
                </div>
                {vaultDescription && (
                  <p className="text-sm text-plm-fg-muted mt-0.5 line-clamp-2">
                    {vaultDescription}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Subtitle */}
          <p className="text-sm text-plm-fg-muted">
            {t('vaultSetup.subtitle', 'Configure how files are synced to your computer')}
          </p>
          
          {/* Toggles */}
          <div className="space-y-3">
            
            {/* Auto-download cloud files */}
            <div className="flex items-start justify-between gap-4 p-3 bg-plm-bg rounded-lg border border-plm-border">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-plm-highlight mt-0.5">
                  <CloudDownload size={16} className="text-plm-fg-muted" />
                </div>
                <div>
                  <div className="text-sm font-medium text-plm-fg">
                    {t('vaultSetup.autoDownloadCloudTitle', 'Auto-download cloud files')}
                  </div>
                  <div className="text-xs text-plm-fg-muted mt-0.5">
                    {t('vaultSetup.autoDownloadCloudDesc', 'Automatically download files that exist on the server but not on your computer')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setAutoDownloadCloudFiles(!autoDownloadCloudFiles)}
                className="flex-shrink-0 text-plm-accent"
              >
                {autoDownloadCloudFiles ? (
                  <ToggleRight size={28} />
                ) : (
                  <ToggleLeft size={28} className="text-plm-fg-muted" />
                )}
              </button>
            </div>
            
            {/* Auto-download updates */}
            <div className="flex items-start justify-between gap-4 p-3 bg-plm-bg rounded-lg border border-plm-border">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-plm-highlight mt-0.5">
                  <Download size={16} className="text-plm-fg-muted" />
                </div>
                <div>
                  <div className="text-sm font-medium text-plm-fg">
                    {t('vaultSetup.autoDownloadUpdatesTitle', 'Auto-download file updates')}
                  </div>
                  <div className="text-xs text-plm-fg-muted mt-0.5">
                    {t('vaultSetup.autoDownloadUpdatesDesc', 'Automatically download newer versions when files are updated on the server')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setAutoDownloadUpdates(!autoDownloadUpdates)}
                className="flex-shrink-0 text-plm-accent"
              >
                {autoDownloadUpdates ? (
                  <ToggleRight size={28} />
                ) : (
                  <ToggleLeft size={28} className="text-plm-fg-muted" />
                )}
              </button>
            </div>
            
            {/* Size limit for auto-downloads */}
            {(autoDownloadCloudFiles || autoDownloadUpdates) && (
              <div className="p-3 bg-plm-bg rounded-lg border border-plm-border space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-plm-highlight mt-0.5">
                      <Scale size={16} className="text-plm-fg-muted" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-plm-fg">
                        {t('vaultSetup.sizeLimitTitle', 'Skip large files')}
                      </div>
                      <div className="text-xs text-plm-fg-muted mt-0.5">
                        {t('vaultSetup.sizeLimitDesc', 'Avoid auto-downloading files larger than a specified size')}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSizeLimitEnabled(!sizeLimitEnabled)}
                    className="flex-shrink-0 text-plm-accent"
                  >
                    {sizeLimitEnabled ? (
                      <ToggleRight size={28} />
                    ) : (
                      <ToggleLeft size={28} className="text-plm-fg-muted" />
                    )}
                  </button>
                </div>
                
                {sizeLimitEnabled && (
                  <div className="flex items-center gap-2 ml-11">
                    <span className="text-sm text-plm-fg-muted">
                      {t('vaultSetup.maxFileSize', 'Max file size:')}
                    </span>
                    <input
                      type="number"
                      value={sizeLimit}
                      onChange={(e) => setSizeLimit(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      className="w-24 px-2 py-1 text-sm bg-plm-bg-light border border-plm-border rounded focus:border-plm-accent focus:outline-none text-plm-fg"
                    />
                    <span className="text-sm text-plm-fg-muted">MB</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Windows Defender Exclusion Warning */}
          {showDefenderWarning && (
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/30">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded bg-red-500/20 flex-shrink-0">
                  <Shield size={16} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-red-600 dark:text-red-400">
                    {t('vaultSetup.defenderWarningTitle', 'Windows Defender Exclusion Recommended')}
                  </div>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                    {t('vaultSetup.defenderWarningDesc', 'For best performance with SolidWorks files, add this folder to Windows Defender exclusions:')}
                  </p>
                  
                  {/* Vault path with copy button */}
                  <div className="flex items-center gap-2 mt-2 p-2 bg-plm-bg rounded border border-plm-border">
                    <code className="flex-1 text-xs text-plm-fg font-mono truncate">
                      {vaultLocalPath}
                    </code>
                    <button
                      onClick={handleCopyPath}
                      className="flex-shrink-0 p-1 rounded hover:bg-plm-highlight transition-colors"
                      title={t('common.copy', 'Copy')}
                    >
                      {pathCopied ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <Copy size={14} className="text-plm-fg-muted" />
                      )}
                    </button>
                  </div>
                  
                  {/* Instructions */}
                  <p className="text-xs text-plm-fg-muted mt-2">
                    {t('vaultSetup.defenderInstructions', 'Go to: Settings → Privacy & Security → Windows Security → Virus & threat protection → Manage settings → Exclusions → Add folder')}
                  </p>
                  
                  {/* Dismiss link */}
                  <button
                    onClick={handleDismissWarning}
                    className="text-xs text-plm-fg-muted hover:text-plm-fg mt-2 underline"
                  >
                    {t('vaultSetup.dontShowAgain', "Don't show this again")}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Summary */}
          <div className={`p-3 rounded-lg border ${willDownload ? 'bg-plm-accent/5 border-plm-accent/20' : 'bg-plm-bg border-plm-border'}`}>
            {willDownload ? (
              <div className="flex items-start gap-2">
                <CloudDownload size={16} className="text-plm-accent flex-shrink-0 mt-0.5" />
                <p className="text-sm text-plm-fg">
                  {hasSyncStats && syncStats.cloudOnlyCount > 0
                    ? `After connecting, BluePLM will download ${syncStats.cloudOnlyCount} file${syncStats.cloudOnlyCount !== 1 ? 's' : ''} (${formatFileSize(serverTotalSize)})`
                    : t('vaultSetup.summary', 'After connecting, BluePLM will download {{count}} files ({{size}})')
                        .replace('{{count}}', String(serverFileCount))
                        .replace('{{size}}', formattedSize)}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <FileText size={16} className="text-plm-fg-muted flex-shrink-0 mt-0.5" />
                <p className="text-sm text-plm-fg-muted">
                  {hasSyncStats && syncStats.syncedCount > 0
                    ? `All ${syncStats.syncedCount} files are already synced!`
                    : t('vaultSetup.summaryNoDownload', 'Files will only be downloaded when you request them')}
                </p>
              </div>
            )}
          </div>
          
        </div>
        
        {/* Footer */}
        <div className="px-5 py-4 border-t border-plm-border bg-plm-bg flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="px-4 py-2 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
          >
            {t('vaultSetup.skip', 'Skip Setup')}
          </button>
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 px-5 py-2.5 bg-plm-accent hover:bg-plm-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            <Check size={16} />
            {t('vaultSetup.connect', 'Connect Vault')}
          </button>
        </div>
        
      </div>
    </div>
  )
}
