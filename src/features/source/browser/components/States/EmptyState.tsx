import { memo } from 'react'
import { Upload, FolderPlus } from 'lucide-react'

export interface EmptyStateProps {
  onAddFiles?: () => void
  onAddFolder?: () => void
  onCreateFolder?: () => void
}

/**
 * Empty state component shown when no files are in the current folder
 */
export const EmptyState = memo(function EmptyState({
  onAddFiles,
  onAddFolder,
  onCreateFolder
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Upload className="empty-state-icon" />
      <div className="empty-state-title">No files yet</div>
      <div className="empty-state-description">
        Drag and drop files or folders here, or click below
      </div>
      <div className="flex gap-2 mt-4">
        {onAddFiles && (
          <button
            onClick={onAddFiles}
            className="btn btn-primary btn-sm"
          >
            <Upload size={14} />
            Add Files
          </button>
        )}
        {onAddFolder && (
          <button
            onClick={onAddFolder}
            className="btn btn-outline btn-sm"
          >
            <FolderPlus size={14} />
            Add Folder
          </button>
        )}
        {onCreateFolder && (
          <button
            onClick={onCreateFolder}
            className="btn btn-outline btn-sm"
          >
            <FolderPlus size={14} />
            New Folder
          </button>
        )}
      </div>
    </div>
  )
})
