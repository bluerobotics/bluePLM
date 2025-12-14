/**
 * OrphanedCheckoutDialog
 * 
 * Shows when a file you had checked out was force-checked-in from another computer.
 * Gives the user options to handle their orphaned local changes:
 * - Discard local changes & get latest
 * - Re-checkout & keep local changes  
 * - Save local as backup copy
 * - Upload local changes as new version
 * 
 * Supports handling multiple orphaned files at once with "Apply to All" functionality.
 */

import { useState } from 'react'
import { 
  Monitor, 
  X, 
  Download, 
  Upload, 
  Copy, 
  RefreshCw,
  AlertTriangle,
  File,
  Loader2,
  Check,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { usePDMStore, OrphanedCheckout } from '../stores/pdmStore'
import { executeCommand } from '../lib/commands'

type ActionType = 'discard' | 'recheckout' | 'backup' | 'upload'

interface ActionConfig {
  key: ActionType
  label: string
  shortLabel: string
  description: string
  icon: typeof Download
  variant: 'default' | 'warning' | 'success' | 'danger'
}

const ACTIONS: ActionConfig[] = [
  {
    key: 'discard',
    label: 'Discard Local Changes',
    shortLabel: 'Discard',
    description: 'Delete your local file and download the latest version from server',
    icon: Download,
    variant: 'danger'
  },
  {
    key: 'recheckout',
    label: 'Re-Checkout & Keep Local',
    shortLabel: 'Re-Checkout',
    description: 'Check out the file again while keeping your local changes',
    icon: RefreshCw,
    variant: 'warning'
  },
  {
    key: 'backup',
    label: 'Save as Backup',
    shortLabel: 'Backup',
    description: 'Save your local file as a backup copy, then get the latest version',
    icon: Copy,
    variant: 'default'
  },
  {
    key: 'upload',
    label: 'Upload as New Version',
    shortLabel: 'Upload',
    description: 'Check out and immediately check in your local changes as a new version',
    icon: Upload,
    variant: 'success'
  }
]

interface OrphanedCheckoutDialogProps {
  checkout: OrphanedCheckout
  onClose: () => void
  onRefresh?: (silent?: boolean) => void
}

// Hook to create action handlers for a checkout
function useOrphanedActions(
  checkout: OrphanedCheckout,
  vaultPath: string | null,
  onRefresh?: (silent?: boolean) => void
) {
  const getFullLocalPath = () => {
    if (!vaultPath) return checkout.localPath
    const isWindows = vaultPath.includes('\\')
    const sep = isWindows ? '\\' : '/'
    return `${vaultPath}${sep}${checkout.filePath.replace(/[/\\]/g, sep)}`
  }

  const createTempFile = (diffStatus?: 'cloud') => {
    const fullPath = getFullLocalPath()
    return {
      path: fullPath,
      relativePath: checkout.filePath,
      name: checkout.fileName,
      isDirectory: false,
      extension: '.' + checkout.fileName.split('.').pop(),
      size: 0,
      modifiedTime: new Date().toISOString(),
      pdmData: { id: checkout.fileId } as any,
      ...(diffStatus && { diffStatus })
    }
  }

  const handleDiscard = async () => {
    const fullPath = getFullLocalPath()
    const deleteResult = await window.electronAPI?.deleteItem(fullPath)
    if (!deleteResult?.success) {
      throw new Error(`Failed to delete local file: ${deleteResult?.error || 'Unknown error'}`)
    }
    await executeCommand('download', { files: [createTempFile('cloud')] }, { onRefresh })
  }

  const handleReCheckout = async () => {
    const fullPath = getFullLocalPath()
    await executeCommand('checkout', { files: [createTempFile()] }, { onRefresh })
    await window.electronAPI?.setReadonly(fullPath, false)
  }

  const handleBackup = async () => {
    const fullPath = getFullLocalPath()
    const isWindows = fullPath.includes('\\')
    const sep = isWindows ? '\\' : '/'
    
    const ext = checkout.fileName.includes('.') 
      ? '.' + checkout.fileName.split('.').pop() 
      : ''
    const baseName = checkout.fileName.replace(ext, '')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupName = `${baseName}_backup_${timestamp}${ext}`
    
    const dir = fullPath.substring(0, fullPath.lastIndexOf(sep))
    const backupPath = `${dir}${sep}${backupName}`
    
    const copyResult = await window.electronAPI?.copyFile(fullPath, backupPath)
    if (!copyResult?.success) {
      throw new Error(`Failed to create backup: ${copyResult?.error || 'Unknown error'}`)
    }
    
    const deleteResult = await window.electronAPI?.deleteItem(fullPath)
    if (deleteResult?.success) {
      await executeCommand('download', { files: [createTempFile('cloud')] }, { onRefresh })
    }
  }

  const handleUpload = async () => {
    await executeCommand('checkout', { files: [createTempFile()] }, { onRefresh })
    await new Promise(resolve => setTimeout(resolve, 500))
    await executeCommand('checkin', { files: [createTempFile()] }, { onRefresh })
  }

  return {
    discard: handleDiscard,
    recheckout: handleReCheckout,
    backup: handleBackup,
    upload: handleUpload
  }
}

export function OrphanedCheckoutDialog({ checkout, onClose, onRefresh }: OrphanedCheckoutDialogProps) {
  const { removeOrphanedCheckout, addToast, vaultPath } = usePDMStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingAction, setProcessingAction] = useState<string | null>(null)
  
  const actions = useOrphanedActions(checkout, vaultPath, onRefresh)

  const handleAction = async (actionKey: ActionType) => {
    setIsProcessing(true)
    setProcessingAction(actionKey)
    
    try {
      await actions[actionKey]()
      
      const messages: Record<ActionType, string> = {
        discard: `Downloaded latest version of ${checkout.fileName}`,
        recheckout: `Re-checked out ${checkout.fileName}. Your local changes are preserved.`,
        backup: `Saved backup and downloaded latest version of ${checkout.fileName}`,
        upload: `Uploaded ${checkout.fileName} as new version`
      }
      
      addToast('success', messages[actionKey])
      removeOrphanedCheckout(checkout.fileId)
      onClose()
    } catch (err) {
      addToast('error', `Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
      setProcessingAction(null)
    }
  }

  const ActionButton = ({ action }: { action: ActionConfig }) => {
    const isThisAction = processingAction === action.key
    const variantClasses = {
      default: 'hover:bg-plm-bg-lighter border-plm-border',
      warning: 'hover:bg-plm-warning/10 border-plm-warning/30',
      success: 'hover:bg-plm-success/10 border-plm-success/30',
      danger: 'hover:bg-plm-error/10 border-plm-error/30'
    }
    const iconClasses = {
      default: 'text-plm-fg',
      warning: 'text-plm-warning',
      success: 'text-plm-success',
      danger: 'text-plm-error'
    }
    const Icon = action.icon
    
    return (
      <button
        onClick={() => handleAction(action.key)}
        disabled={isProcessing}
        className={`
          w-full p-3 rounded-lg border transition-colors text-left
          ${variantClasses[action.variant]}
          ${isProcessing && !isThisAction ? 'opacity-50 cursor-not-allowed' : ''}
          ${isThisAction ? 'ring-2 ring-plm-accent' : ''}
        `}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${iconClasses[action.variant]}`}>
            {isThisAction ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Icon size={20} />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium text-plm-fg">{action.label}</div>
            <div className="text-sm text-plm-fg-muted">{action.description}</div>
          </div>
          {isThisAction && (
            <Check size={16} className="text-plm-accent mt-1" />
          )}
        </div>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-plm-bg-light border border-plm-border rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-plm-border bg-plm-warning/5">
          <div className="flex items-center gap-2 text-plm-warning">
            <Monitor size={20} />
            <span className="font-semibold">Orphaned Checkout</span>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded hover:bg-plm-bg transition-colors text-plm-fg-muted hover:text-plm-fg disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* File info */}
          <div className="flex items-center gap-3 p-3 bg-plm-bg rounded-lg border border-plm-border mb-4">
            <File size={24} className="text-plm-warning flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-plm-fg truncate">{checkout.fileName}</div>
              <div className="text-xs text-plm-fg-muted truncate">{checkout.filePath}</div>
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-plm-warning/10 border border-plm-warning/30 rounded-lg p-3 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-plm-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-plm-fg">
                  This file was <strong>checked in from {checkout.checkedInBy}</strong>. 
                  You have local changes that may not match the server version.
                </p>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2">
            {ACTIONS.map(action => (
              <ActionButton key={action.key} action={action} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-plm-bg border-t border-plm-border">
          <p className="text-xs text-plm-fg-muted text-center">
            Server version: v{checkout.newVersion} • Checked in at {new Date(checkout.checkedInAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Individual file row in the list view
 */
interface FileRowProps {
  checkout: OrphanedCheckout
  isSelected: boolean
  onToggleSelect: () => void
  onAction: (action: ActionType) => Promise<void>
  isProcessing: boolean
  processingAction: ActionType | null
  isExpanded: boolean
  onToggleExpand: () => void
}

function FileRow({ 
  checkout, 
  isSelected, 
  onToggleSelect, 
  onAction, 
  isProcessing,
  processingAction,
  isExpanded,
  onToggleExpand
}: FileRowProps) {
  const isThisProcessing = processingAction !== null
  
  return (
    <div className={`border border-plm-border rounded-lg overflow-hidden ${isSelected ? 'ring-2 ring-plm-accent' : ''}`}>
      {/* Main row */}
      <div className="flex items-center gap-2 p-2 bg-plm-bg-light">
        {/* Checkbox */}
        <button
          onClick={onToggleSelect}
          disabled={isProcessing}
          className="p-1 rounded hover:bg-plm-bg transition-colors disabled:opacity-50"
        >
          {isSelected ? (
            <CheckSquare size={18} className="text-plm-accent" />
          ) : (
            <Square size={18} className="text-plm-fg-muted" />
          )}
        </button>
        
        {/* Expand/collapse */}
        <button
          onClick={onToggleExpand}
          className="p-1 rounded hover:bg-plm-bg transition-colors"
        >
          {isExpanded ? (
            <ChevronDown size={16} className="text-plm-fg-muted" />
          ) : (
            <ChevronRight size={16} className="text-plm-fg-muted" />
          )}
        </button>
        
        {/* File info */}
        <File size={16} className="text-plm-warning flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-plm-fg text-sm truncate">{checkout.fileName}</div>
          <div className="text-xs text-plm-fg-muted truncate">{checkout.filePath}</div>
        </div>
        
        {/* Processing indicator */}
        {isThisProcessing && (
          <div className="flex items-center gap-1 text-plm-accent">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">{ACTIONS.find(a => a.key === processingAction)?.shortLabel}</span>
          </div>
        )}
        
        {/* Quick action buttons (visible when not expanded) */}
        {!isExpanded && !isThisProcessing && (
          <div className="flex items-center gap-1">
            {ACTIONS.map(action => {
              const Icon = action.icon
              const colorClass = {
                default: 'text-plm-fg-muted hover:text-plm-fg',
                warning: 'text-plm-warning/60 hover:text-plm-warning',
                success: 'text-plm-success/60 hover:text-plm-success',
                danger: 'text-plm-error/60 hover:text-plm-error'
              }[action.variant]
              
              return (
                <button
                  key={action.key}
                  onClick={() => onAction(action.key)}
                  disabled={isProcessing}
                  title={action.label}
                  className={`p-1.5 rounded hover:bg-plm-bg transition-colors disabled:opacity-50 ${colorClass}`}
                >
                  <Icon size={14} />
                </button>
              )
            })}
          </div>
        )}
      </div>
      
      {/* Expanded details */}
      {isExpanded && (
        <div className="p-3 bg-plm-bg border-t border-plm-border">
          <div className="text-xs text-plm-fg-muted mb-2">
            Checked in from <span className="font-medium text-plm-fg">{checkout.checkedInBy}</span> at {new Date(checkout.checkedInAt).toLocaleString()} • v{checkout.newVersion}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ACTIONS.map(action => {
              const Icon = action.icon
              const bgClass = {
                default: 'bg-plm-bg-lighter hover:bg-plm-bg-light',
                warning: 'bg-plm-warning/10 hover:bg-plm-warning/20',
                success: 'bg-plm-success/10 hover:bg-plm-success/20',
                danger: 'bg-plm-error/10 hover:bg-plm-error/20'
              }[action.variant]
              const textClass = {
                default: 'text-plm-fg',
                warning: 'text-plm-warning',
                success: 'text-plm-success',
                danger: 'text-plm-error'
              }[action.variant]
              
              return (
                <button
                  key={action.key}
                  onClick={() => onAction(action.key)}
                  disabled={isProcessing}
                  className={`flex items-center gap-2 p-2 rounded-lg text-left ${bgClass} transition-colors disabled:opacity-50`}
                >
                  <Icon size={14} className={textClass} />
                  <span className="text-xs font-medium text-plm-fg">{action.shortLabel}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Container component that shows all orphaned checkouts in a list view
 */
export function OrphanedCheckoutsContainer({ onRefresh }: { onRefresh?: (silent?: boolean) => void }) {
  const { orphanedCheckouts, removeOrphanedCheckout, clearOrphanedCheckouts, addToast, vaultPath } = usePDMStore()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingFileId, setProcessingFileId] = useState<string | null>(null)
  const [processingAction, setProcessingAction] = useState<ActionType | null>(null)
  const [showBulkConfirm, setShowBulkConfirm] = useState<ActionType | null>(null)

  if (orphanedCheckouts.length === 0) return null

  const allSelected = orphanedCheckouts.length > 0 && selectedIds.size === orphanedCheckouts.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < orphanedCheckouts.length

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orphanedCheckouts.map(c => c.fileId)))
    }
  }

  const toggleSelect = (fileId: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(fileId)) {
      newSet.delete(fileId)
    } else {
      newSet.add(fileId)
    }
    setSelectedIds(newSet)
  }

  const toggleExpand = (fileId: string) => {
    const newSet = new Set(expandedIds)
    if (newSet.has(fileId)) {
      newSet.delete(fileId)
    } else {
      newSet.add(fileId)
    }
    setExpandedIds(newSet)
  }

  // Create action handler for a specific checkout
  const createActionHandler = (checkout: OrphanedCheckout) => {
    const getFullLocalPath = () => {
      if (!vaultPath) return checkout.localPath
      const isWindows = vaultPath.includes('\\')
      const sep = isWindows ? '\\' : '/'
      return `${vaultPath}${sep}${checkout.filePath.replace(/[/\\]/g, sep)}`
    }

    const createTempFile = (diffStatus?: 'cloud') => {
      const fullPath = getFullLocalPath()
      return {
        path: fullPath,
        relativePath: checkout.filePath,
        name: checkout.fileName,
        isDirectory: false,
        extension: '.' + checkout.fileName.split('.').pop(),
        size: 0,
        modifiedTime: new Date().toISOString(),
        pdmData: { id: checkout.fileId } as any,
        ...(diffStatus && { diffStatus })
      }
    }

    return {
      discard: async () => {
        const fullPath = getFullLocalPath()
        const deleteResult = await window.electronAPI?.deleteItem(fullPath)
        if (!deleteResult?.success) {
          throw new Error(`Failed to delete local file: ${deleteResult?.error || 'Unknown error'}`)
        }
        await executeCommand('download', { files: [createTempFile('cloud')] }, { onRefresh })
      },
      recheckout: async () => {
        const fullPath = getFullLocalPath()
        await executeCommand('checkout', { files: [createTempFile()] }, { onRefresh })
        await window.electronAPI?.setReadonly(fullPath, false)
      },
      backup: async () => {
        const fullPath = getFullLocalPath()
        const isWindows = fullPath.includes('\\')
        const sep = isWindows ? '\\' : '/'
        
        const ext = checkout.fileName.includes('.') 
          ? '.' + checkout.fileName.split('.').pop() 
          : ''
        const baseName = checkout.fileName.replace(ext, '')
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const backupName = `${baseName}_backup_${timestamp}${ext}`
        
        const dir = fullPath.substring(0, fullPath.lastIndexOf(sep))
        const backupPath = `${dir}${sep}${backupName}`
        
        const copyResult = await window.electronAPI?.copyFile(fullPath, backupPath)
        if (!copyResult?.success) {
          throw new Error(`Failed to create backup: ${copyResult?.error || 'Unknown error'}`)
        }
        
        const deleteResult = await window.electronAPI?.deleteItem(fullPath)
        if (deleteResult?.success) {
          await executeCommand('download', { files: [createTempFile('cloud')] }, { onRefresh })
        }
      },
      upload: async () => {
        await executeCommand('checkout', { files: [createTempFile()] }, { onRefresh })
        await new Promise(resolve => setTimeout(resolve, 500))
        await executeCommand('checkin', { files: [createTempFile()] }, { onRefresh })
      }
    }
  }

  // Handle single file action
  const handleSingleAction = async (checkout: OrphanedCheckout, action: ActionType) => {
    setIsProcessing(true)
    setProcessingFileId(checkout.fileId)
    setProcessingAction(action)
    
    try {
      const actions = createActionHandler(checkout)
      await actions[action]()
      
      addToast('success', `${ACTIONS.find(a => a.key === action)?.shortLabel}: ${checkout.fileName}`)
      removeOrphanedCheckout(checkout.fileId)
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(checkout.fileId)
        return next
      })
    } catch (err) {
      addToast('error', `Failed on ${checkout.fileName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
      setProcessingFileId(null)
      setProcessingAction(null)
    }
  }

  // Handle bulk action on selected files
  const handleBulkAction = async (action: ActionType) => {
    const selectedCheckouts = orphanedCheckouts.filter(c => selectedIds.has(c.fileId))
    if (selectedCheckouts.length === 0) return
    
    setIsProcessing(true)
    setShowBulkConfirm(null)
    
    let successCount = 0
    let failCount = 0
    
    for (const checkout of selectedCheckouts) {
      setProcessingFileId(checkout.fileId)
      setProcessingAction(action)
      
      try {
        const actions = createActionHandler(checkout)
        await actions[action]()
        successCount++
        removeOrphanedCheckout(checkout.fileId)
      } catch (err) {
        failCount++
        console.error(`Failed to process ${checkout.fileName}:`, err)
      }
    }
    
    setIsProcessing(false)
    setProcessingFileId(null)
    setProcessingAction(null)
    setSelectedIds(new Set())
    
    const actionName = ACTIONS.find(a => a.key === action)?.shortLabel || action
    if (failCount === 0) {
      addToast('success', `${actionName}: ${successCount} file${successCount !== 1 ? 's' : ''} processed`)
    } else {
      addToast('warning', `${actionName}: ${successCount} succeeded, ${failCount} failed`)
    }
  }

  // Dismiss all without action
  const handleDismissAll = () => {
    clearOrphanedCheckouts()
    addToast('info', 'Dismissed all orphaned checkout notifications')
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-plm-bg-light border border-plm-border rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-plm-border bg-plm-warning/5 flex-shrink-0">
          <div className="flex items-center gap-2 text-plm-warning">
            <Monitor size={20} />
            <span className="font-semibold">
              {orphanedCheckouts.length} Orphaned Checkout{orphanedCheckouts.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={handleDismissAll}
            disabled={isProcessing}
            title="Dismiss all (no action taken)"
            className="p-1 rounded hover:bg-plm-bg transition-colors text-plm-fg-muted hover:text-plm-fg disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Explanation */}
        <div className="px-4 py-3 bg-plm-warning/5 border-b border-plm-border flex-shrink-0">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-plm-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm text-plm-fg">
              These files were checked in from another machine while you had local changes.
              Choose how to handle each file, or apply an action to all selected files.
            </div>
          </div>
        </div>

        {/* Select all bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-plm-border bg-plm-bg flex-shrink-0">
          <button
            onClick={toggleSelectAll}
            disabled={isProcessing}
            className="flex items-center gap-2 text-sm text-plm-fg hover:text-plm-accent transition-colors disabled:opacity-50"
          >
            {allSelected ? (
              <CheckSquare size={16} className="text-plm-accent" />
            ) : someSelected ? (
              <div className="relative">
                <Square size={16} className="text-plm-fg-muted" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2 h-0.5 bg-plm-accent rounded" />
                </div>
              </div>
            ) : (
              <Square size={16} className="text-plm-fg-muted" />
            )}
            <span>Select All</span>
          </button>
          
          <span className="text-xs text-plm-fg-muted">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Click file to expand options'}
          </span>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {orphanedCheckouts.map(checkout => (
            <FileRow
              key={checkout.fileId}
              checkout={checkout}
              isSelected={selectedIds.has(checkout.fileId)}
              onToggleSelect={() => toggleSelect(checkout.fileId)}
              onAction={(action) => handleSingleAction(checkout, action)}
              isProcessing={isProcessing && processingFileId === checkout.fileId}
              processingAction={processingFileId === checkout.fileId ? processingAction : null}
              isExpanded={expandedIds.has(checkout.fileId)}
              onToggleExpand={() => toggleExpand(checkout.fileId)}
            />
          ))}
        </div>

        {/* Bulk action footer */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-3 bg-plm-bg border-t border-plm-border flex-shrink-0">
            <div className="text-xs text-plm-fg-muted mb-2">
              Apply to {selectedIds.size} selected file{selectedIds.size !== 1 ? 's' : ''}:
            </div>
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map(action => {
                const Icon = action.icon
                const bgClass = {
                  default: 'bg-plm-bg-lighter hover:bg-plm-bg-light border-plm-border',
                  warning: 'bg-plm-warning/10 hover:bg-plm-warning/20 border-plm-warning/30',
                  success: 'bg-plm-success/10 hover:bg-plm-success/20 border-plm-success/30',
                  danger: 'bg-plm-error/10 hover:bg-plm-error/20 border-plm-error/30'
                }[action.variant]
                const iconClass = {
                  default: 'text-plm-fg',
                  warning: 'text-plm-warning',
                  success: 'text-plm-success',
                  danger: 'text-plm-error'
                }[action.variant]
                
                return (
                  <button
                    key={action.key}
                    onClick={() => setShowBulkConfirm(action.key)}
                    disabled={isProcessing}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${bgClass} transition-colors disabled:opacity-50`}
                  >
                    <Icon size={14} className={iconClass} />
                    <span className="text-sm font-medium text-plm-fg">{action.shortLabel} All</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Bulk action confirmation modal */}
        {showBulkConfirm && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="bg-plm-bg-light border border-plm-border rounded-lg p-4 max-w-sm mx-4 shadow-xl">
              <div className="text-plm-fg font-medium mb-2">
                Confirm Bulk Action
              </div>
              <p className="text-sm text-plm-fg-muted mb-4">
                Apply "{ACTIONS.find(a => a.key === showBulkConfirm)?.label}" to {selectedIds.size} file{selectedIds.size !== 1 ? 's' : ''}?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowBulkConfirm(null)}
                  className="px-3 py-1.5 rounded-lg border border-plm-border hover:bg-plm-bg transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleBulkAction(showBulkConfirm)}
                  className="px-3 py-1.5 rounded-lg bg-plm-accent text-white hover:bg-plm-accent-dark transition-colors text-sm font-medium"
                >
                  Apply to All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
