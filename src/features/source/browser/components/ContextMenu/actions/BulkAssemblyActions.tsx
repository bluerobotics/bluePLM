/**
 * Bulk Assembly Actions for context menu
 * Provides operations on assemblies and all their associated files:
 * - Download All (assembly + children + drawings)
 * - Check Out All
 * - Check In All  
 * - Remove Local All
 * - Pack and Go (ZIP export)
 * 
 * Only shown for single synced .sldasm files (not cloud-only, not multi-select)
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { 
  Package2, 
  ArrowDownToLine, 
  Lock, 
  Unlock, 
  Trash2, 
  Archive,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import type { ActionComponentProps } from './types'
import { ContextSubmenu } from '../components'
import { usePDMStore, type LocalFile } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'
import { resolveAssociatedFiles, type AssociatedFilesResult } from '@/lib/fileOperations/assemblyResolver'
import { packAndGoCommand } from '@/lib/commands/handlers/packAndGo'
import { log } from '@/lib/logger'
import { useTranslation } from '@/lib/i18n'

interface ConfirmationState {
  action: 'download' | 'checkout' | 'checkin' | 'delete' | 'packAndGo'
  title: string
  resolvedData: AssociatedFilesResult
  filesToProcess: LocalFile[]
  warnings: string[]
}

export function BulkAssemblyActions({
  multiSelect,
  firstFile,
  onClose,
}: ActionComponentProps) {
  const { t } = useTranslation()
  const [showSubmenu, setShowSubmenu] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [resolvedData, setResolvedData] = useState<AssociatedFilesResult | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmationState | null>(null)
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasFetchedRef = useRef(false)
  
  const { 
    files, 
    organization, 
    user,
    addToast 
  } = usePDMStore()

  // Check if file is a synced assembly that exists locally
  const isSyncedAssembly = useCallback(() => {
    const ext = firstFile.extension?.toLowerCase()
    if (ext !== '.sldasm') return false
    if (!firstFile.pdmData?.id) return false
    if (firstFile.diffStatus === 'cloud') return false
    return true
  }, [firstFile])

  // Only show for single synced .sldasm files
  const canShow = !multiSelect && isSyncedAssembly()

  // Reset state when submenu closes
  useEffect(() => {
    if (!showSubmenu) {
      hasFetchedRef.current = false
      setResolvedData(null)
    }
  }, [showSubmenu])

  // Resolve associated files when submenu opens
  useEffect(() => {
    if (showSubmenu && !hasFetchedRef.current && canShow && organization?.id) {
      hasFetchedRef.current = true
      setIsLoading(true)

      resolveAssociatedFiles(
        firstFile.pdmData!.id,
        organization.id,
        files,
        (msg) => log.debug('[BulkAssemblyActions]', msg)
      )
        .then(result => {
          setResolvedData(result)
          if (result.error) {
            log.error('[BulkAssemblyActions]', 'Failed to resolve assembly', { 
              error: result.error 
            })
          }
        })
        .catch(err => {
          log.error('[BulkAssemblyActions]', 'Exception resolving assembly', { 
            error: err instanceof Error ? err.message : String(err) 
          })
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [showSubmenu, canShow, firstFile, organization?.id, files])

  // Build warnings for confirmation dialog
  const buildWarnings = useCallback((
    action: ConfirmationState['action'],
    data: AssociatedFilesResult
  ): string[] => {
    const warnings: string[] = []
    const userId = user?.id

    // Check for files checked out by others
    const checkedOutByOthers: LocalFile[] = []
    for (const [, localFile] of data.allFiles) {
      if (localFile.pdmData?.checked_out_by && 
          localFile.pdmData.checked_out_by !== userId) {
        checkedOutByOthers.push(localFile)
      }
    }

    if (checkedOutByOthers.length > 0) {
      const names = checkedOutByOthers.slice(0, 3).map(f => f.name).join(', ')
      const suffix = checkedOutByOthers.length > 3 
        ? ` +${checkedOutByOthers.length - 3} more` 
        : ''
      warnings.push(`${checkedOutByOthers.length} file${checkedOutByOthers.length !== 1 ? 's' : ''} checked out by others: ${names}${suffix}`)
    }

    // Check for cloud-only files for non-download actions
    if (action !== 'download' && action !== 'packAndGo') {
      const cloudOnlyCount = [...data.allFiles.values()]
        .filter(f => f.diffStatus === 'cloud').length
      if (cloudOnlyCount > 0) {
        warnings.push(`${cloudOnlyCount} file${cloudOnlyCount !== 1 ? 's' : ''} exist only in the cloud (not downloaded)`)
      }
    }

    // Check for files not checked out by user (for checkin)
    if (action === 'checkin') {
      const notCheckedOutByUser = [...data.allFiles.values()]
        .filter(f => f.pdmData?.checked_out_by !== userId).length
      if (notCheckedOutByUser > 0) {
        warnings.push(`${notCheckedOutByUser} file${notCheckedOutByUser !== 1 ? 's are' : ' is'} not checked out by you`)
      }
    }

    return warnings
  }, [user?.id])

  // Handle action selection - show confirmation dialog
  const handleActionClick = useCallback((action: ConfirmationState['action']) => {
    if (!resolvedData || resolvedData.error) {
      addToast('error', t('contextMenu.assembly.resolveFailed'))
      return
    }

    const allLocalFiles = [...resolvedData.allFiles.values()]
    const warnings = buildWarnings(action, resolvedData)

    // Title based on action
    const titles: Record<ConfirmationState['action'], string> = {
      download: t('contextMenu.assembly.confirmDownloadTitle'),
      checkout: t('contextMenu.assembly.confirmCheckOutTitle'),
      checkin: t('contextMenu.assembly.confirmCheckInTitle'),
      delete: t('contextMenu.assembly.confirmRemoveLocalTitle'),
      packAndGo: t('contextMenu.assembly.confirmPackAndGoTitle'),
    }

    setConfirmState({
      action,
      title: titles[action],
      resolvedData,
      filesToProcess: allLocalFiles,
      warnings
    })
  }, [resolvedData, buildWarnings, addToast, t])

  // Execute the confirmed action
  const executeAction = useCallback(async () => {
    if (!confirmState || !firstFile.pdmData?.id) return

    const { action, filesToProcess } = confirmState
    const rootFileId = firstFile.pdmData.id

    setConfirmState(null)
    onClose()

    switch (action) {
      case 'download':
        executeCommand('bulk-download-assembly', { 
          files: filesToProcess, 
          rootFileId 
        })
        break
      case 'checkout':
        executeCommand('bulk-checkout-assembly', { 
          files: filesToProcess, 
          rootFileId 
        })
        break
      case 'checkin':
        executeCommand('bulk-checkin-assembly', { 
          files: filesToProcess, 
          rootFileId 
        })
        break
      case 'delete':
        executeCommand('bulk-delete-assembly', { 
          files: filesToProcess, 
          rootFileId 
        })
        break
      case 'packAndGo':
        // Pack and Go uses a different command signature
        const ctx = {
          organization,
          user,
          files,
          addToast,
          addProgressToast: usePDMStore.getState().addProgressToast,
          updateProgressToast: usePDMStore.getState().updateProgressToast,
          removeToast: usePDMStore.getState().removeToast,
        }
        await packAndGoCommand.execute({ file: firstFile }, ctx as Parameters<typeof packAndGoCommand.execute>[1])
        break
    }
  }, [confirmState, firstFile, onClose, organization, user, files, addToast])

  const handleMouseEnter = () => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current)
    }
    setShowSubmenu(true)
  }

  const handleMouseLeave = () => {
    submenuTimeoutRef.current = setTimeout(() => {
      setShowSubmenu(false)
    }, 150)
  }

  // Cancel confirmation
  const handleCancelConfirm = () => {
    setConfirmState(null)
  }

  // Don't render if not applicable
  if (!canShow) {
    return null
  }

  // Build stats display for confirmation
  const formatStats = (data: AssociatedFilesResult) => {
    const parts: string[] = []
    
    // Root assembly
    if (data.rootFile) {
      parts.push('1 assembly')
    }
    
    // Sub-assemblies and parts
    if (data.stats.subAssemblies > 0) {
      parts.push(`${data.stats.subAssemblies} sub-assembl${data.stats.subAssemblies === 1 ? 'y' : 'ies'}`)
    }
    if (data.stats.parts > 0) {
      parts.push(`${data.stats.parts} part${data.stats.parts !== 1 ? 's' : ''}`)
    }
    if (data.stats.drawings > 0) {
      parts.push(`${data.stats.drawings} drawing${data.stats.drawings !== 1 ? 's' : ''}`)
    }

    return parts.join(', ')
  }

  const totalFileCount = resolvedData 
    ? resolvedData.allFiles.size 
    : 0

  return (
    <>
      <div className="context-menu-separator" />
      <div 
        className="context-menu-item relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => {
          e.stopPropagation()
          setShowSubmenu(!showSubmenu)
        }}
      >
        <Package2 size={14} className="text-plm-accent-primary" />
        {t('contextMenu.assembly.title')}
        <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
        
        {showSubmenu && (
          <ContextSubmenu
            minWidth={220}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {isLoading ? (
              <div className="context-menu-item disabled">
                <Loader2 size={14} className="animate-spin" />
                <span className="animate-pulse">{t('contextMenu.assembly.resolving')}</span>
              </div>
            ) : resolvedData?.error ? (
              <div className="context-menu-item disabled text-plm-error">
                <AlertTriangle size={14} />
                {t('contextMenu.assembly.resolveFailed')}
              </div>
            ) : resolvedData && resolvedData.allFiles.size === 0 && resolvedData.stats.totalChildren === 0 ? (
              <div className="context-menu-item disabled text-plm-fg-muted">
                <AlertTriangle size={14} className="text-plm-warning" />
                {t('contextMenu.assembly.noComponents', 'No components found')}
              </div>
            ) : (
              <>
                {/* File count summary */}
                {resolvedData && (
                  <div className="px-3 py-1.5 text-xs text-plm-fg-muted border-b border-plm-border mb-1">
                    {totalFileCount} file{totalFileCount !== 1 ? 's' : ''} total
                    {resolvedData.stats.totalChildren > 0 && (
                      <div className="text-[10px] opacity-75 mt-0.5">
                        {formatStats(resolvedData)}
                      </div>
                    )}
                  </div>
                )}

                {/* Download All */}
                <div
                  className="context-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleActionClick('download')
                  }}
                >
                  <ArrowDownToLine size={14} className="text-plm-success" />
                  {t('contextMenu.assembly.downloadAll')}
                </div>

                {/* Check Out All */}
                <div
                  className="context-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleActionClick('checkout')
                  }}
                >
                  <Lock size={14} className="text-plm-warning" />
                  {t('contextMenu.assembly.checkOutAll')}
                </div>

                {/* Check In All */}
                <div
                  className="context-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleActionClick('checkin')
                  }}
                >
                  <Unlock size={14} className="text-plm-info" />
                  {t('contextMenu.assembly.checkInAll')}
                </div>

                <div className="context-menu-separator" />

                {/* Remove Local All */}
                <div
                  className="context-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleActionClick('delete')
                  }}
                >
                  <Trash2 size={14} />
                  {t('contextMenu.assembly.removeLocalAll')}
                </div>

                {/* Pack and Go */}
                <div
                  className="context-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleActionClick('packAndGo')
                  }}
                >
                  <Archive size={14} className="text-plm-accent-secondary" />
                  {t('contextMenu.assembly.packAndGo')}
                </div>
              </>
            )}
          </ContextSubmenu>
        )}
      </div>

      {/* Confirmation Dialog */}
      {confirmState && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/50 z-[200]"
            onClick={handleCancelConfirm}
          />
          
          {/* Dialog */}
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] bg-plm-bg-lighter border border-plm-border rounded-lg shadow-xl min-w-[400px] max-w-[500px]">
            {/* Header */}
            <div className="px-4 py-3 border-b border-plm-border">
              <h3 className="text-sm font-semibold text-plm-fg">
                {confirmState.title}
              </h3>
            </div>

            {/* Content */}
            <div className="px-4 py-3 space-y-3">
              {/* File breakdown */}
              <div className="text-sm text-plm-fg-muted">
                <p className="mb-2">
                  {t('contextMenu.assembly.confirmMessage').replace('{{count}}', String(confirmState.filesToProcess.length))}
                </p>
                
                {/* Stats breakdown */}
                {confirmState.resolvedData && (
                  <div className="bg-plm-bg rounded px-3 py-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>{t('contextMenu.assembly.assemblies')}:</span>
                      <span className="text-plm-fg">
                        {1 + confirmState.resolvedData.stats.subAssemblies}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('contextMenu.assembly.parts')}:</span>
                      <span className="text-plm-fg">
                        {confirmState.resolvedData.stats.parts}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('contextMenu.assembly.drawings')}:</span>
                      <span className="text-plm-fg">
                        {confirmState.resolvedData.stats.drawings}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Warnings */}
              {confirmState.warnings.length > 0 && (
                <div className="bg-plm-warning/10 border border-plm-warning/30 rounded px-3 py-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-plm-warning mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-plm-warning space-y-1">
                      {confirmState.warnings.map((warning, i) => (
                        <p key={i}>{warning}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-plm-border flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-sm rounded bg-plm-bg hover:bg-plm-bg-lighter border border-plm-border transition-colors"
                onClick={handleCancelConfirm}
              >
                {t('common.cancel')}
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded bg-plm-accent-primary hover:bg-plm-accent-primary/90 text-white transition-colors"
                onClick={executeAction}
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
