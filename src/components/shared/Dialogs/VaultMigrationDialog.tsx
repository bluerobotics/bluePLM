/**
 * Vault Migration Dialog
 * 
 * Shows after a major version upgrade when connecting to an existing vault.
 * Runs a health check to verify file integrity and offers one-click fixes.
 * 
 * States:
 * 1. Scanning - Shows progress while checking files
 * 2. Success - All files synced correctly (auto-dismiss after 2s)
 * 3. Issues Found - Lists files needing attention with Fix All button
 * 4. Fixing - Shows progress while re-syncing files
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, CheckCircle, AlertTriangle, Upload, ArrowRight, Loader2 } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { 
  checkVaultHealth, 
  resyncFiles, 
  type HealthCheckResult, 
  type HealthCheckProgress
} from '@/lib/vaultHealthCheck'
import { log } from '@/lib/logger'

// ============================================
// Types
// ============================================

type DialogPhase = 'scanning' | 'success' | 'issues' | 'fixing' | 'complete'

interface VaultMigrationDialogProps {
  vaultPath: string
  vaultId: string
  orgId: string
  appVersion: string
  onComplete: () => void
  onRefresh?: (silent?: boolean) => void
}

// ============================================
// Component
// ============================================

export function VaultMigrationDialog({
  vaultPath,
  vaultId,
  orgId,
  appVersion,
  onComplete,
  onRefresh
}: VaultMigrationDialogProps) {
  const { addToast } = usePDMStore()
  
  // Dialog state
  const [phase, setPhase] = useState<DialogPhase>('scanning')
  const [progress, setProgress] = useState<HealthCheckProgress | null>(null)
  const [result, setResult] = useState<HealthCheckResult | null>(null)
  const [fixProgress, setFixProgress] = useState<{ current: number; total: number; fileName: string } | null>(null)
  const [fixResult, setFixResult] = useState<{ succeeded: number; failed: number } | null>(null)
  
  // Run health check on mount
  useEffect(() => {
    let cancelled = false
    
    const runHealthCheck = async () => {
      log.info('[VaultMigration]', 'Starting health check', { vaultPath, vaultId })
      
      try {
        const healthResult = await checkVaultHealth(
          vaultPath,
          vaultId,
          orgId,
          (prog) => {
            if (!cancelled) {
              setProgress(prog)
            }
          }
        )
        
        if (cancelled) return
        
        setResult(healthResult)
        
        if (healthResult.filesNeedingReupload.length === 0) {
          // All good - show success briefly then auto-close
          setPhase('success')
          log.info('[VaultMigration]', 'No issues found, auto-closing')
          
          // Acknowledge migration and close after 2s
          setTimeout(async () => {
            if (!cancelled) {
              await window.electronAPI?.acknowledgeMigration()
              onComplete()
            }
          }, 2000)
        } else {
          // Issues found
          setPhase('issues')
          log.info('[VaultMigration]', 'Issues found', { 
            count: healthResult.filesNeedingReupload.length 
          })
        }
      } catch (err) {
        log.error('[VaultMigration]', 'Health check failed', { error: err })
        if (!cancelled) {
          addToast('error', 'Vault health check failed')
          await window.electronAPI?.acknowledgeMigration()
          onComplete()
        }
      }
    }
    
    runHealthCheck()
    
    return () => {
      cancelled = true
    }
  }, [vaultPath, vaultId, orgId, addToast, onComplete])
  
  // Handle Fix All
  const handleFixAll = useCallback(async () => {
    if (!result) return
    
    setPhase('fixing')
    log.info('[VaultMigration]', 'Starting resync', { 
      count: result.filesNeedingReupload.length 
    })
    
    try {
      const resyncResult = await resyncFiles(
        result.filesNeedingReupload,
        (current, total, fileName) => {
          setFixProgress({ current, total, fileName })
        }
      )
      
      setFixResult(resyncResult)
      setPhase('complete')
      
      if (resyncResult.succeeded > 0) {
        addToast('success', `Re-synced ${resyncResult.succeeded} file${resyncResult.succeeded > 1 ? 's' : ''}`)
      }
      if (resyncResult.failed > 0) {
        addToast('warning', `${resyncResult.failed} file${resyncResult.failed > 1 ? 's' : ''} failed to sync`)
      }
      
      // Refresh files and close
      onRefresh?.(true)
      
      setTimeout(async () => {
        await window.electronAPI?.acknowledgeMigration()
        onComplete()
      }, 1500)
      
    } catch (err) {
      log.error('[VaultMigration]', 'Resync failed', { error: err })
      addToast('error', 'Failed to re-sync files')
      setPhase('issues') // Go back to issues view
    }
  }, [result, addToast, onComplete, onRefresh])
  
  // Handle Continue (skip fixing)
  const handleContinue = useCallback(async () => {
    log.info('[VaultMigration]', 'User skipped fixing issues')
    addToast('info', 'Some files may show as needing attention')
    await window.electronAPI?.acknowledgeMigration()
    onComplete()
  }, [addToast, onComplete])
  
  // ============================================
  // Render
  // ============================================
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-plm-bg-light border border-plm-border rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-plm-border bg-plm-accent/5">
          <div className="p-2 rounded-lg bg-plm-accent/10">
            <RefreshCw size={20} className={`text-plm-accent ${phase === 'scanning' || phase === 'fixing' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h2 className="font-semibold text-plm-fg">
              {phase === 'scanning' && 'Reconciling Vault...'}
              {phase === 'success' && 'Vault Ready!'}
              {phase === 'issues' && 'Vault Update Complete'}
              {phase === 'fixing' && 'Re-syncing Files...'}
              {phase === 'complete' && 'All Files Synced!'}
            </h2>
            <p className="text-sm text-plm-fg-muted">
              Updated to version {appVersion}
            </p>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          
          {/* Scanning Phase */}
          {phase === 'scanning' && (
            <div className="px-5 py-8 text-center">
              <Loader2 size={48} className="mx-auto text-plm-accent animate-spin mb-4" />
              <p className="text-plm-fg font-medium mb-2">
                {progress?.message || 'Checking vault integrity...'}
              </p>
              {progress && progress.total > 0 && (
                <div className="w-full max-w-xs mx-auto mt-4">
                  <div className="h-2 bg-plm-bg rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-plm-accent transition-all duration-300"
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-plm-fg-muted mt-2">
                    {progress.current} / {progress.total}
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Success Phase */}
          {phase === 'success' && result && (
            <div className="px-5 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-plm-success/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-plm-success" />
              </div>
              <p className="text-plm-fg font-medium text-lg mb-2">
                Your vault is ready!
              </p>
              <p className="text-plm-fg-muted">
                {result.syncedCount} file{result.syncedCount !== 1 ? 's' : ''} synced correctly
              </p>
            </div>
          )}
          
          {/* Issues Phase */}
          {phase === 'issues' && result && (
            <div className="px-5 py-4">
              <p className="text-plm-fg mb-4">
                Your vault has been reconciled after the update to version {appVersion}.
              </p>
              
              {/* Synced count */}
              <div className="flex items-center gap-2 text-plm-success mb-4">
                <CheckCircle size={18} />
                <span className="font-medium">{result.syncedCount} files synced correctly</span>
              </div>
              
              {/* Files needing re-upload */}
              <div className="bg-plm-warning/5 border border-plm-warning/20 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 text-plm-warning mb-2">
                  <AlertTriangle size={18} />
                  <span className="font-medium">
                    {result.filesNeedingReupload.length} file{result.filesNeedingReupload.length !== 1 ? 's' : ''} need to be re-uploaded
                  </span>
                </div>
                <p className="text-sm text-plm-fg-muted mb-3">
                  These files exist locally but need to be synced to the cloud.
                </p>
                
                {/* File list */}
                <div className="max-h-48 overflow-y-auto border border-plm-border rounded-lg bg-plm-bg">
                  {result.filesNeedingReupload.map((file) => (
                    <div
                      key={file.fileId}
                      className="flex items-center justify-between px-3 py-2 border-b border-plm-border/50 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-plm-fg truncate font-medium">{file.fileName}</p>
                        <p className="text-xs text-plm-fg-muted truncate">{file.filePath}</p>
                      </div>
                      <span className="flex-shrink-0 text-xs text-plm-fg-muted bg-plm-bg-light px-2 py-0.5 rounded">
                        v{file.version}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Outdated files info */}
              {result.outdatedFiles.length > 0 && (
                <p className="text-sm text-plm-fg-muted">
                  Additionally, {result.outdatedFiles.length} file{result.outdatedFiles.length !== 1 ? 's have' : ' has'} newer versions on the server.
                </p>
              )}
            </div>
          )}
          
          {/* Fixing Phase */}
          {phase === 'fixing' && fixProgress && (
            <div className="px-5 py-8 text-center">
              <Loader2 size={48} className="mx-auto text-plm-accent animate-spin mb-4" />
              <p className="text-plm-fg font-medium mb-2">
                Re-syncing {fixProgress.current} of {fixProgress.total}...
              </p>
              <p className="text-sm text-plm-fg-muted truncate max-w-md mx-auto">
                {fixProgress.fileName}
              </p>
              <div className="w-full max-w-xs mx-auto mt-4">
                <div className="h-2 bg-plm-bg rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-plm-accent transition-all duration-300"
                    style={{ width: `${Math.round((fixProgress.current / fixProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Complete Phase */}
          {phase === 'complete' && fixResult && (
            <div className="px-5 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-plm-success/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-plm-success" />
              </div>
              <p className="text-plm-fg font-medium text-lg mb-2">
                All files synced!
              </p>
              <p className="text-plm-fg-muted">
                {fixResult.succeeded} file{fixResult.succeeded !== 1 ? 's' : ''} re-uploaded successfully
              </p>
            </div>
          )}
          
        </div>
        
        {/* Footer - only show for issues phase */}
        {phase === 'issues' && (
          <div className="px-5 py-4 border-t border-plm-border bg-plm-bg flex items-center justify-between">
            <button
              onClick={handleContinue}
              className="px-4 py-2 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
            >
              Continue without fixing
            </button>
            <button
              onClick={handleFixAll}
              className="flex items-center gap-2 px-5 py-2.5 bg-plm-accent hover:bg-plm-accent-hover text-white rounded-lg font-medium transition-colors"
            >
              <Upload size={16} />
              Fix All
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        
      </div>
    </div>
  )
}

// ============================================
// Export Container (reads from store state)
// ============================================

interface VaultMigrationContainerProps {
  onComplete: () => void
  onRefresh?: (silent?: boolean) => void
}

/**
 * Container that shows the migration dialog when needed.
 * Checks migration status and vault connection state.
 */
export function VaultMigrationContainer({ onComplete, onRefresh }: VaultMigrationContainerProps) {
  const { organization, vaultPath, activeVaultId } = usePDMStore()
  const [migrationStatus, setMigrationStatus] = useState<{
    pending: boolean
    toVersion: string
  } | null>(null)
  const [shouldShow, setShouldShow] = useState(false)
  
  // Check migration status on mount
  useEffect(() => {
    const checkMigration = async () => {
      const status = await window.electronAPI?.getMigrationStatus()
      if (status?.pending) {
        setMigrationStatus({
          pending: true,
          toVersion: status.toVersion
        })
      }
    }
    checkMigration()
  }, [])
  
  // Determine if we should show the dialog
  useEffect(() => {
    if (migrationStatus?.pending && organization && vaultPath && activeVaultId) {
      setShouldShow(true)
    }
  }, [migrationStatus, organization, vaultPath, activeVaultId])
  
  if (!shouldShow || !organization || !vaultPath || !activeVaultId) {
    return null
  }
  
  return (
    <VaultMigrationDialog
      vaultPath={vaultPath}
      vaultId={activeVaultId}
      orgId={organization.id}
      appVersion={migrationStatus?.toVersion || 'unknown'}
      onComplete={() => {
        setShouldShow(false)
        onComplete()
      }}
      onRefresh={onRefresh}
    />
  )
}
