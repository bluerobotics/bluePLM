import { memo } from 'react'
import { AlertTriangle, File, Pencil, Copy, ArrowUp } from 'lucide-react'
import type { FileConflict } from '../../types'

export interface ConflictDialogProps {
  conflicts: FileConflict[]
  nonConflictsCount: number
  onResolve: (resolution: 'overwrite' | 'rename' | 'skip', applyToAll: boolean) => void
  onCancel: () => void
}

/**
 * Dialog for resolving file conflicts when copying/moving files
 */
export const ConflictDialog = memo(function ConflictDialog({
  conflicts,
  nonConflictsCount,
  onResolve,
  onCancel
}: ConflictDialogProps) {
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onCancel}
    >
      <div 
        className="bg-plm-bg-light border border-plm-border rounded-lg p-6 max-w-lg w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-plm-warning/20 flex items-center justify-center">
            <AlertTriangle size={20} className="text-plm-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-plm-fg">File Conflicts</h3>
            <p className="text-sm text-plm-fg-muted">
              {conflicts.length} file{conflicts.length > 1 ? 's' : ''} already exist{conflicts.length === 1 ? 's' : ''}
            </p>
          </div>
        </div>
        
        {/* List of conflicting files */}
        <div className="bg-plm-bg rounded border border-plm-border mb-4 max-h-40 overflow-y-auto">
          {conflicts.slice(0, 10).map((conflict, i) => (
            <div key={i} className="px-3 py-2 text-sm text-plm-fg-dim border-b border-plm-border last:border-b-0 flex items-center gap-2">
              <File size={14} className="text-plm-fg-muted flex-shrink-0" />
              <span className="truncate">{conflict.relativePath}</span>
            </div>
          ))}
          {conflicts.length > 10 && (
            <div className="px-3 py-2 text-sm text-plm-fg-muted italic">
              ...and {conflicts.length - 10} more
            </div>
          )}
        </div>
        
        <p className="text-sm text-plm-fg-dim mb-4">
          What would you like to do with the conflicting files?
        </p>
        
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onResolve('overwrite', true)}
            className="btn btn-warning w-full justify-start gap-2"
          >
            <Pencil size={16} />
            Overwrite All
            <span className="text-xs opacity-70 ml-auto">Replace existing files</span>
          </button>
          <button
            onClick={() => onResolve('rename', true)}
            className="btn btn-primary w-full justify-start gap-2"
          >
            <Copy size={16} />
            Keep Both (Rename)
            <span className="text-xs opacity-70 ml-auto">Add (1), (2), etc.</span>
          </button>
          <button
            onClick={() => onResolve('skip', true)}
            className="btn btn-ghost w-full justify-start gap-2"
          >
            <ArrowUp size={16} />
            Skip Conflicts
            <span className="text-xs opacity-70 ml-auto">Only add {nonConflictsCount} new files</span>
          </button>
          <button
            onClick={onCancel}
            className="btn btn-ghost w-full text-plm-fg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
})
