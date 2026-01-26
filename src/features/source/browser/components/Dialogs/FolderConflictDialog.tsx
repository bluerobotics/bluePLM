import { memo } from 'react'
import { AlertTriangle, Folder, FolderInput, Edit3, SkipForward, X } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'

export interface FolderConflictDialogProps {
  sourceFolder: LocalFile
  targetPath: string
  existingFolderPath: string
  /** Total number of folders with conflicts (for multi-folder moves) */
  totalConflicts: number
  /** Current conflict index (1-based, for "1 of 3" display) */
  currentIndex: number
  onResolve: (resolution: 'merge' | 'rename' | 'skip' | 'cancel', applyToAll: boolean) => void
  onCancel: () => void
}

/**
 * Dialog for resolving folder name conflicts when moving folders.
 * Offers options to Merge, Rename, Skip, or Cancel.
 */
export const FolderConflictDialog = memo(function FolderConflictDialog({
  sourceFolder,
  targetPath,
  existingFolderPath: _existingFolderPath,
  totalConflicts,
  currentIndex,
  onResolve,
  onCancel
}: FolderConflictDialogProps) {
  const showApplyToAll = totalConflicts > 1
  const displayTargetPath = targetPath || 'root folder'
  
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
            <h3 className="text-lg font-semibold text-plm-fg">Folder Already Exists</h3>
            {totalConflicts > 1 && (
              <p className="text-sm text-plm-fg-muted">
                Conflict {currentIndex} of {totalConflicts}
              </p>
            )}
          </div>
        </div>
        
        {/* Conflict details */}
        <div className="bg-plm-bg rounded border border-plm-border mb-4 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Folder size={16} className="text-plm-accent flex-shrink-0" />
            <span className="text-sm font-medium text-plm-fg truncate">{sourceFolder.name}</span>
          </div>
          <p className="text-sm text-plm-fg-dim">
            A folder with this name already exists in <span className="font-medium">{displayTargetPath}</span>
          </p>
        </div>
        
        <p className="text-sm text-plm-fg-dim mb-4">
          How would you like to handle this conflict?
        </p>
        
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onResolve('merge', false)}
            className="btn btn-primary w-full justify-start gap-2"
          >
            <FolderInput size={16} />
            Merge Folders
            <span className="text-xs opacity-70 ml-auto">Combine contents</span>
          </button>
          {showApplyToAll && (
            <button
              onClick={() => onResolve('merge', true)}
              className="btn btn-ghost w-full justify-start gap-2 text-plm-fg-muted text-sm py-1"
            >
              Merge All ({totalConflicts} folders)
            </button>
          )}
          
          <button
            onClick={() => onResolve('rename', false)}
            className="btn btn-secondary w-full justify-start gap-2"
          >
            <Edit3 size={16} />
            Keep Both (Rename)
            <span className="text-xs opacity-70 ml-auto">Add (2), (3), etc.</span>
          </button>
          {showApplyToAll && (
            <button
              onClick={() => onResolve('rename', true)}
              className="btn btn-ghost w-full justify-start gap-2 text-plm-fg-muted text-sm py-1"
            >
              Rename All ({totalConflicts} folders)
            </button>
          )}
          
          <button
            onClick={() => onResolve('skip', false)}
            className="btn btn-ghost w-full justify-start gap-2"
          >
            <SkipForward size={16} />
            Skip This Folder
            <span className="text-xs opacity-70 ml-auto">Don't move it</span>
          </button>
          {showApplyToAll && (
            <button
              onClick={() => onResolve('skip', true)}
              className="btn btn-ghost w-full justify-start gap-2 text-plm-fg-muted text-sm py-1"
            >
              Skip All Conflicts
            </button>
          )}
          
          <div className="border-t border-plm-border my-2" />
          
          <button
            onClick={() => onResolve('cancel', false)}
            className="btn btn-ghost w-full justify-start gap-2 text-plm-fg-muted"
          >
            <X size={16} />
            Cancel Move
          </button>
        </div>
      </div>
    </div>
  )
})
