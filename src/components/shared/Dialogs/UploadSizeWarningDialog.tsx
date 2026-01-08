/**
 * Upload Size Warning Dialog
 * 
 * Shows when the user tries to upload files that exceed their configured
 * size threshold. Gives options to:
 * - Upload anyway (include all files)
 * - Skip large files (only upload files under threshold)
 * - Cancel (abort the entire operation)
 */

import { AlertTriangle, Upload, SkipForward, X, FileWarning } from 'lucide-react'
import { formatFileSize } from '@/lib/utils'

export interface LargeFile {
  name: string
  relativePath: string
  size: number
}

interface UploadSizeWarningDialogProps {
  /** Files that exceed the size threshold */
  largeFiles: LargeFile[]
  /** Total number of files being uploaded */
  totalFiles: number
  /** Size threshold in MB */
  thresholdMB: number
  /** Called when user chooses to upload all files anyway */
  onUploadAll: () => void
  /** Called when user chooses to skip large files */
  onSkipLarge: () => void
  /** Called when user cancels the operation */
  onCancel: () => void
}

export function UploadSizeWarningDialog({
  largeFiles,
  totalFiles,
  thresholdMB,
  onUploadAll,
  onSkipLarge,
  onCancel
}: UploadSizeWarningDialogProps) {
  const smallFilesCount = totalFiles - largeFiles.length
  const totalLargeSize = largeFiles.reduce((acc, f) => acc + f.size, 0)
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-plm-bg-light border border-plm-border rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-plm-border bg-plm-warning/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-plm-warning/10">
              <FileWarning size={20} className="text-plm-warning" />
            </div>
            <div>
              <h2 className="font-semibold text-plm-fg">
                Large Files Detected
              </h2>
              <p className="text-sm text-plm-fg-muted">
                {largeFiles.length} file{largeFiles.length !== 1 ? 's' : ''} exceed{largeFiles.length === 1 ? 's' : ''} {thresholdMB} MB
              </p>
            </div>
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
          
          {/* Warning message */}
          <div className="flex items-start gap-3 p-3 bg-plm-warning/5 rounded-lg border border-plm-warning/20">
            <AlertTriangle size={18} className="text-plm-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm text-plm-fg">
              <p>
                You're about to upload <strong>{largeFiles.length} file{largeFiles.length !== 1 ? 's' : ''}</strong> larger 
                than your {thresholdMB} MB threshold ({formatFileSize(totalLargeSize)} total).
              </p>
              {smallFilesCount > 0 && (
                <p className="text-plm-fg-muted mt-1">
                  {smallFilesCount} other file{smallFilesCount !== 1 ? 's' : ''} will upload normally.
                </p>
              )}
            </div>
          </div>
          
          {/* Large files list */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            <div className="text-xs text-plm-fg-muted uppercase tracking-wide font-medium px-1">
              Large files:
            </div>
            {largeFiles.map((file, index) => (
              <div 
                key={index}
                className="flex items-center justify-between gap-3 px-3 py-2 bg-plm-bg rounded-lg border border-plm-border"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-plm-fg truncate font-medium">
                    {file.name}
                  </div>
                  <div className="text-xs text-plm-fg-muted truncate">
                    {file.relativePath}
                  </div>
                </div>
                <div className="flex-shrink-0 px-2 py-1 bg-plm-warning/10 text-plm-warning rounded text-xs font-medium">
                  {formatFileSize(file.size)}
                </div>
              </div>
            ))}
          </div>
          
        </div>
        
        {/* Footer with action buttons */}
        <div className="px-5 py-4 border-t border-plm-border bg-plm-bg flex items-center justify-between gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
          >
            Cancel
          </button>
          
          <div className="flex items-center gap-2">
            {smallFilesCount > 0 && (
              <button
                onClick={onSkipLarge}
                className="flex items-center gap-2 px-4 py-2 bg-plm-highlight hover:bg-plm-border text-plm-fg rounded-lg text-sm font-medium transition-colors"
              >
                <SkipForward size={16} />
                Skip Large Files
              </button>
            )}
            <button
              onClick={onUploadAll}
              className="flex items-center gap-2 px-4 py-2 bg-plm-accent hover:bg-plm-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Upload size={16} />
              Upload All
            </button>
          </div>
        </div>
        
      </div>
    </div>
  )
}
