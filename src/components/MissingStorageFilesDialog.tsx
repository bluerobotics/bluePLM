/**
 * Missing Storage Files Dialog
 * 
 * Shows when files appear as "needs update" but the actual file content
 * is missing from cloud storage. This happens when a check-in partially
 * failed (database updated but upload failed).
 * 
 * Solution: Check out the files and check them back in to re-upload.
 */

import { useState } from 'react'
import { X, AlertTriangle, CloudOff, Download, CheckCircle, RefreshCw } from 'lucide-react'
import { usePDMStore, MissingStorageFile } from '../stores/pdmStore'
import { executeCommand } from '../lib/commands/executor'

interface MissingStorageFilesDialogProps {
  files: MissingStorageFile[]
  onClose: () => void
  onRefresh?: (silent?: boolean) => void
}

function MissingStorageFilesDialogInner({ files, onClose, onRefresh }: MissingStorageFilesDialogProps) {
  const { clearMissingStorageFiles, addToast } = usePDMStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set(files.map(f => f.fileId)))
  
  const toggleFile = (fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (next.has(fileId)) {
        next.delete(fileId)
      } else {
        next.add(fileId)
      }
      return next
    })
  }
  
  const toggleAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set())
    } else {
      setSelectedFiles(new Set(files.map(f => f.fileId)))
    }
  }
  
  const handleCheckoutSelected = async () => {
    const selectedFilesList = files.filter(f => selectedFiles.has(f.fileId))
    if (selectedFilesList.length === 0) {
      addToast('info', 'No files selected')
      return
    }
    
    setIsProcessing(true)
    try {
      // Get the full file objects from the store to pass to checkout
      const allFiles = usePDMStore.getState().files
      const filesToCheckout = allFiles.filter(f => 
        selectedFilesList.some(sf => sf.fileId === f.pdmData?.id)
      )
      
      if (filesToCheckout.length === 0) {
        addToast('error', 'Could not find files in vault')
        return
      }
      
      const result = await executeCommand('checkout', { files: filesToCheckout }, { onRefresh })
      
      if (result.succeeded > 0) {
        addToast('success', `Checked out ${result.succeeded} file${result.succeeded > 1 ? 's' : ''}. Now check them in to re-upload.`)
        // Remove the successfully checked out files from the missing list
        const remainingFiles = files.filter(f => !selectedFiles.has(f.fileId))
        if (remainingFiles.length === 0) {
          clearMissingStorageFiles()
          onClose()
        } else {
          usePDMStore.getState().setMissingStorageFiles(remainingFiles)
        }
      }
      if (result.failed > 0) {
        addToast('warning', `${result.failed} file${result.failed > 1 ? 's' : ''} failed to check out`)
      }
    } catch (err) {
      addToast('error', `Checkout failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }
  
  const handleDismiss = () => {
    clearMissingStorageFiles()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-plm-bg-light border border-plm-border rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-plm-border bg-plm-error/5 flex-shrink-0">
          <div className="flex items-center gap-2 text-plm-error">
            <CloudOff size={20} />
            <span className="font-semibold">
              {files.length} File{files.length !== 1 ? 's' : ''} Missing from Cloud Storage
            </span>
          </div>
          <button
            onClick={handleDismiss}
            disabled={isProcessing}
            title="Dismiss"
            className="p-1 rounded hover:bg-plm-bg transition-colors text-plm-fg-muted hover:text-plm-fg disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Explanation */}
        <div className="px-4 py-3 bg-plm-error/5 border-b border-plm-border flex-shrink-0">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-plm-error flex-shrink-0 mt-0.5" />
            <div className="text-sm text-plm-fg">
              <p className="mb-2">
                These files show as <strong>"needs update"</strong> but the file content is missing from cloud storage.
                This usually happens when a check-in partially failed (database was updated but the file upload failed).
              </p>
              <p className="text-plm-fg-muted">
                <strong>To fix:</strong> Check out the files, then check them back in. This will re-upload the file content.
              </p>
            </div>
          </div>
        </div>

        {/* Select all bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-plm-border bg-plm-bg flex-shrink-0">
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              selectedFiles.size === files.length 
                ? 'bg-plm-accent border-plm-accent' 
                : 'border-plm-border hover:border-plm-fg-muted'
            }`}>
              {selectedFiles.size === files.length && <CheckCircle size={12} className="text-white" />}
            </div>
            Select All ({selectedFiles.size}/{files.length})
          </button>
          
          <button
            onClick={handleCheckoutSelected}
            disabled={isProcessing || selectedFiles.size === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-plm-accent hover:bg-plm-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Download size={14} />
                Check Out Selected ({selectedFiles.size})
              </>
            )}
          </button>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {files.map((file) => (
            <div
              key={file.fileId}
              onClick={() => !isProcessing && toggleFile(file.fileId)}
              className={`flex items-center gap-3 px-4 py-3 border-b border-plm-border/50 cursor-pointer transition-colors ${
                selectedFiles.has(file.fileId) ? 'bg-plm-accent/10' : 'hover:bg-plm-bg'
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {/* Checkbox */}
              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                selectedFiles.has(file.fileId)
                  ? 'bg-plm-accent border-plm-accent'
                  : 'border-plm-border'
              }`}>
                {selectedFiles.has(file.fileId) && <CheckCircle size={12} className="text-white" />}
              </div>
              
              {/* File info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-plm-fg truncate">{file.fileName}</div>
                <div className="text-xs text-plm-fg-muted truncate">{file.filePath}</div>
              </div>
              
              {/* Version badge */}
              <div className="flex-shrink-0 px-2 py-0.5 bg-plm-bg rounded text-xs text-plm-fg-muted">
                v{file.version}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-plm-border bg-plm-bg flex-shrink-0">
          <div className="flex items-center justify-between">
            <button
              onClick={handleDismiss}
              disabled={isProcessing}
              className="px-3 py-1.5 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors disabled:opacity-50"
            >
              Dismiss for now
            </button>
            <div className="text-xs text-plm-fg-muted">
              These files will continue to show as "needs update" until fixed
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Container component that reads from the store and renders the dialog if needed
 */
export function MissingStorageFilesContainer({ onRefresh }: { onRefresh?: (silent?: boolean) => void }) {
  const { missingStorageFiles, clearMissingStorageFiles } = usePDMStore()
  
  if (missingStorageFiles.length === 0) return null
  
  return (
    <MissingStorageFilesDialogInner
      files={missingStorageFiles}
      onClose={clearMissingStorageFiles}
      onRefresh={onRefresh}
    />
  )
}

export default MissingStorageFilesContainer

