import { Info, Play, Square, Loader2, RefreshCw, Database } from 'lucide-react'
import { useSolidWorksSettings } from '../hooks'
import { executeCommand } from '@/lib/commands'

export function ServiceTab() {
  const {
    status,
    isStarting,
    isStopping,
    startService,
    stopService,
    hasError,
    autoStartSolidworksService,
    setAutoStartSolidworksService,
    overallStatus,
    overallStatusConfig,
    syncedSwFiles,
    isSyncingMetadata,
    setIsSyncingMetadata,
    lastMetadataSyncResult,
    setLastMetadataSyncResult,
    addToast,
  } = useSolidWorksSettings()

  const handleSyncAllVaultMetadata = async () => {
    if (!status.running) {
      addToast('error', 'SolidWorks service must be running to sync metadata')
      return
    }
    
    if (syncedSwFiles.length === 0) {
      addToast('info', 'No SolidWorks files found in vault to sync')
      return
    }
    
    setIsSyncingMetadata(true)
    setLastMetadataSyncResult(null)
    
    try {
      const result = await executeCommand('sync-sw-metadata', { files: syncedSwFiles })
      
      // Parse result to show stats
      // Result message is like "Synced 10 files: 5 updated, 5 unchanged"
      const updated = result.details?.filter(d => d.includes('updated')).length || 
        (result.message?.match(/(\d+) updated/)?.[1] ? parseInt(result.message.match(/(\d+) updated/)![1]) : 0)
      const unchanged = result.message?.match(/(\d+) unchanged/)?.[1] 
        ? parseInt(result.message.match(/(\d+) unchanged/)![1]) 
        : result.succeeded - updated
      
      setLastMetadataSyncResult({
        updated: updated,
        unchanged: unchanged,
        failed: result.failed
      })
      
      if (result.failed > 0) {
        addToast('warning', `Synced ${result.succeeded}/${result.total} files. ${result.failed} failed.`)
      } else if (updated > 0) {
        addToast('success', `Metadata synced! ${updated} file${updated > 1 ? 's' : ''} updated.`)
      } else {
        addToast('info', 'All metadata is already up to date')
      }
    } catch (err) {
      addToast('error', `Metadata sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSyncingMetadata(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Service Control */}
      <div className="space-y-3">
        <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
          SolidWorks Service
        </label>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
          {/* Overall Integration Status Banner */}
          <div className={`flex items-center gap-3 p-3 rounded-lg border ${
            overallStatus === 'online' ? 'bg-green-500/10 border-green-500/30' :
            overallStatus === 'partial' ? 'bg-yellow-500/10 border-yellow-500/30' :
            overallStatus === 'offline' ? 'bg-red-500/10 border-red-500/30' :
            'bg-plm-bg-secondary border-plm-border'
          }`}>
            <div className={`w-3 h-3 rounded-full ${overallStatusConfig[overallStatus].color}`} />
            <div className="flex-1">
              <div className={`text-sm font-medium ${overallStatusConfig[overallStatus].textColor}`}>
                {overallStatusConfig[overallStatus].label}
              </div>
              <div className="text-xs text-plm-fg-muted">
                {overallStatusConfig[overallStatus].description}
              </div>
            </div>
          </div>

          {/* Detailed Status indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-2">
                {/* SolidWorks API Status */}
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    status.running && status.swInstalled
                      ? 'bg-green-500' 
                      : status.running && !status.swInstalled
                        ? 'bg-yellow-500'
                        : hasError 
                          ? 'bg-red-500' 
                          : 'bg-plm-fg-dim'
                  }`} />
                  <span className="text-sm text-plm-fg-muted">SolidWorks API:</span>
                  <span className={`text-sm font-medium ${
                    status.running && status.swInstalled 
                      ? 'text-green-400' 
                      : status.running && !status.swInstalled
                        ? 'text-yellow-400'
                        : hasError 
                          ? 'text-red-400' 
                          : 'text-plm-fg-dim'
                  }`}>
                    {status.running 
                      ? (status.swInstalled ? 'Connected' : 'Not Installed')
                      : hasError ? 'Error' : 'Stopped'}
                  </span>
                </div>
                {/* Document Manager API Status */}
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    status.running && status.dmApiAvailable
                      ? 'bg-green-500'
                      : status.running && !status.dmApiAvailable
                        ? 'bg-red-500'
                        : 'bg-plm-fg-dim'
                  }`} />
                  <span className="text-sm text-plm-fg-muted">Document Manager API:</span>
                  <span className={`text-sm font-medium ${
                    status.running && status.dmApiAvailable
                      ? 'text-green-400'
                      : status.running && !status.dmApiAvailable
                        ? 'text-red-400'
                        : 'text-plm-fg-dim'
                  }`}>
                    {status.running 
                      ? (status.dmApiAvailable ? 'Connected' : 'Not Available')
                      : 'Stopped'}
                  </span>
                  {status.running && !status.dmApiAvailable && status.dmApiError && (
                    <span className="text-xs text-red-400/70" title={status.dmApiError}>
                      (No license key)
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Start/Stop button */}
            {status.running ? (
              <button
                onClick={stopService}
                disabled={isStopping}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                {isStopping ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Square size={16} />
                )}
                {isStopping ? 'Stopping...' : 'Stop Service'}
              </button>
            ) : (
              <button
                onClick={startService}
                disabled={isStarting}
                className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/30 transition-colors disabled:opacity-50"
              >
                {isStarting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Play size={16} />
                )}
                {isStarting ? 'Starting...' : 'Start Service'}
              </button>
            )}
          </div>
          
          {/* Auto-start toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-plm-border">
            <div>
              <div className="text-sm text-plm-fg">Auto-start on app launch</div>
              <div className="text-xs text-plm-fg-muted">
                Automatically start the service when BluePLM opens
              </div>
            </div>
            <button
              onClick={() => setAutoStartSolidworksService(!autoStartSolidworksService)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                autoStartSolidworksService ? 'bg-plm-accent' : 'bg-plm-bg-secondary'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoStartSolidworksService ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          {/* Help text */}
          <div className="flex items-start gap-2 text-sm text-plm-fg-muted pt-2">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              The SolidWorks service enables BOM extraction, property reading, and file export features.
              It requires SolidWorks to be installed on this computer.
            </span>
          </div>
        </div>
      </div>

      {/* Vault Metadata Sync */}
      <div className="space-y-3">
        <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
          Vault Metadata Sync
        </label>
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
          <div className="flex items-start gap-2 text-sm text-plm-fg-muted">
            <Database size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              Extract part numbers, descriptions, and revisions from SolidWorks custom properties 
              and sync them to the database. This is useful after bulk imports or if metadata 
              wasn't extracted during initial check-in.
            </span>
          </div>
          
          {/* File count and sync button */}
          <div className="flex items-center justify-between pt-2 border-t border-plm-border">
            <div>
              <div className="text-sm text-plm-fg">
                {syncedSwFiles.length > 0 
                  ? `${syncedSwFiles.length} SolidWorks file${syncedSwFiles.length > 1 ? 's' : ''} in vault`
                  : 'No SolidWorks files found'
                }
              </div>
              <div className="text-xs text-plm-fg-muted">
                Parts, assemblies, and drawings with server records
              </div>
            </div>
            <button
              onClick={handleSyncAllVaultMetadata}
              disabled={isSyncingMetadata || !status.running || syncedSwFiles.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !status.running 
                  ? 'bg-plm-bg-secondary text-plm-fg-dim cursor-not-allowed'
                  : isSyncingMetadata
                    ? 'bg-plm-accent/50 text-white cursor-wait'
                    : 'bg-plm-accent text-white hover:bg-plm-accent/80'
              }`}
              title={!status.running ? 'Start the SolidWorks service first' : undefined}
            >
              {isSyncingMetadata ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              {isSyncingMetadata ? 'Syncing...' : 'Sync All Vault Metadata'}
            </button>
          </div>
          
          {/* Last sync result */}
          {lastMetadataSyncResult && (
            <div className="flex items-center gap-4 text-sm pt-2 border-t border-plm-border">
              <span className="text-plm-fg-muted">Last sync:</span>
              {lastMetadataSyncResult.updated > 0 && (
                <span className="text-green-400">
                  {lastMetadataSyncResult.updated} updated
                </span>
              )}
              {lastMetadataSyncResult.unchanged > 0 && (
                <span className="text-plm-fg-dim">
                  {lastMetadataSyncResult.unchanged} unchanged
                </span>
              )}
              {lastMetadataSyncResult.failed > 0 && (
                <span className="text-red-400">
                  {lastMetadataSyncResult.failed} failed
                </span>
              )}
            </div>
          )}
          
          {/* Warning if service not running */}
          {!status.running && (
            <div className="flex items-center gap-2 text-sm text-yellow-400 pt-2 border-t border-plm-border">
              <Info size={14} />
              Start the SolidWorks service to enable metadata extraction
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
