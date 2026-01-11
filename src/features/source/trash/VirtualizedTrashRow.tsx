/**
 * VirtualizedTrashRow - A single row in the virtualized trash list
 * 
 * This component renders an individual trash item for the virtualizer.
 * Handles files, folder records, aggregated folders, and nested folder headers.
 */
import { memo } from 'react'
import { 
  FileText, 
  User, 
  Clock, 
  AlertTriangle,
  FolderOpen,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { DeletedFile } from '@/types/pdm'
import type { FlattenedTrashItem } from './hooks/useFlattenedTrash'
import { getFileIconType } from '@/lib/utils'

interface VirtualizedTrashRowProps {
  /** The flattened trash item data */
  item: FlattenedTrashItem
  /** Style from virtualizer (contains transform for positioning) */
  style: React.CSSProperties
  /** Whether this item is currently selected */
  isSelected: boolean
  /** Set of selected file IDs */
  selectedFiles: Set<string>
  /** Toggle file selection */
  onToggleSelection: (fileId: string, isShiftClick: boolean, isCtrlClick: boolean) => void
  /** Toggle folder expansion (for nested view) */
  onToggleFolderExpand?: (folderPath: string) => void
  /** Select all files in a folder (for nested view) */
  onSelectFolder?: (folderPath: string) => void
  /** Check if folder is selected */
  isFolderSelected?: (folderPath: string) => boolean
  /** Check if folder is partially selected */
  isFolderPartiallySelected?: (folderPath: string) => boolean
  /** Whether folder is expanded (for nested view) */
  isFolderExpanded?: boolean
  /** Handle folder click in folder view (selects files within) */
  onFolderViewClick?: (folderPath: string, allFilesSelected: boolean) => void
  /** Get files in folder for folder view selection state */
  getFilesInFolder?: (folderPath: string) => DeletedFile[]
  /** View mode for styling differences */
  viewMode: 'files' | 'folders' | 'nested'
}

/** File type icon component */
function FileIcon({ extension, size = 16 }: { extension: string; size?: number }) {
  const iconType = getFileIconType(extension)
  
  const getIconColor = () => {
    switch (iconType) {
      case 'part': return 'text-amber-500'
      case 'assembly': return 'text-blue-500'
      case 'drawing': return 'text-purple-500'
      case 'step': return 'text-green-500'
      case 'pdf': return 'text-red-500'
      default: return 'text-plm-fg-muted'
    }
  }
  
  return <FileText size={size} className={getIconColor()} />
}

/** Calculate days until permanent deletion */
function getDaysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt)
  const expires = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000)
  const now = new Date()
  const msRemaining = expires.getTime() - now.getTime()
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)))
}

/**
 * Custom comparison function for VirtualizedTrashRow memo.
 */
function arePropsEqual(
  prevProps: VirtualizedTrashRowProps,
  nextProps: VirtualizedTrashRowProps
): boolean {
  // Item identity
  if (prevProps.item.key !== nextProps.item.key) return false
  if (prevProps.item.type !== nextProps.item.type) return false
  if (prevProps.item.flatIndex !== nextProps.item.flatIndex) return false
  
  // Selection state
  if (prevProps.isSelected !== nextProps.isSelected) return false
  
  // Folder expansion state
  if (prevProps.isFolderExpanded !== nextProps.isFolderExpanded) return false
  
  // View mode
  if (prevProps.viewMode !== nextProps.viewMode) return false
  
  // Style (position)
  if (prevProps.style.transform !== nextProps.style.transform) return false
  
  // For folder items, check selection state
  if (prevProps.item.type === 'nested-folder' || prevProps.item.type === 'folder-aggregated') {
    const prevPath = prevProps.item.nestedFolder?.path || prevProps.item.folderData?.path
    const nextPath = nextProps.item.nestedFolder?.path || nextProps.item.folderData?.path
    
    if (prevPath && nextPath && prevProps.isFolderSelected && nextProps.isFolderSelected) {
      if (prevProps.isFolderSelected(prevPath) !== nextProps.isFolderSelected(nextPath)) return false
      if (prevProps.isFolderPartiallySelected?.(prevPath) !== nextProps.isFolderPartiallySelected?.(nextPath)) return false
    }
  }
  
  return true
}

/**
 * Memoized row component for virtualized trash list
 */
export const VirtualizedTrashRow = memo(function VirtualizedTrashRow({
  item,
  style,
  isSelected,
  selectedFiles,
  onToggleSelection,
  onToggleFolderExpand,
  onSelectFolder,
  isFolderSelected,
  isFolderPartiallySelected,
  isFolderExpanded,
  onFolderViewClick,
  getFilesInFolder,
  viewMode
}: VirtualizedTrashRowProps) {
  const { type, file, folderData, nestedFolder, depth } = item
  
  // Render file row (used in files view and nested view)
  if (type === 'file' && file) {
    const daysRemaining = getDaysRemaining(file.deleted_at)
    const isNested = viewMode === 'nested'
    const indentPx = isNested ? (depth * 16 + 24) : 0
    
    return (
      <div
        style={{ ...style, paddingLeft: isNested ? `${indentPx}px` : undefined }}
        onClick={(e) => onToggleSelection(file.id, e.shiftKey, e.ctrlKey || e.metaKey)}
        className={`px-3 py-2 cursor-pointer border-l-2 transition-colors ${
          isSelected
            ? 'bg-plm-accent/10 border-plm-accent'
            : 'hover:bg-plm-bg-light border-transparent'
        }`}
      >
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(file.id, false, true)}
            onClick={(e) => e.stopPropagation()}
            className="w-3.5 h-3.5 mt-0.5 rounded border-plm-border text-plm-accent focus:ring-plm-accent focus:ring-offset-0 cursor-pointer flex-shrink-0"
          />
          <FileIcon extension={file.extension} size={16} />
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="text-sm text-plm-fg truncate" title={file.file_name}>
              {file.file_name}
            </div>
            {!isNested && (
              <div className="text-xs text-plm-fg-muted truncate mt-0.5" title={file.file_path}>
                {file.file_path}
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-plm-fg-muted mt-1">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {formatDistanceToNow(new Date(file.deleted_at), { addSuffix: true })}
              </span>
              {file.deleted_by_user && (
                <span className="flex items-center gap-1">
                  <User size={10} />
                  {file.deleted_by_user.full_name || file.deleted_by_user.email.split('@')[0]}
                </span>
              )}
            </div>
            {daysRemaining <= 7 && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${
                daysRemaining <= 3 ? 'text-plm-error' : 'text-plm-warning'
              }`}>
                <AlertTriangle size={10} />
                {daysRemaining === 0 
                  ? 'Expires today!' 
                  : `Expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`
                }
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  
  // Render folder record (actual folder deletion record)
  if (type === 'folder-record' && file) {
    const daysRemaining = getDaysRemaining(file.deleted_at)
    
    return (
      <div
        style={style}
        onClick={(e) => onToggleSelection(file.id, e.shiftKey, e.ctrlKey || e.metaKey)}
        className={`px-3 py-2 cursor-pointer border-l-2 transition-colors ${
          isSelected
            ? 'bg-plm-accent/10 border-plm-accent'
            : 'hover:bg-plm-bg-light border-transparent'
        }`}
      >
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(file.id, false, true)}
            onClick={(e) => e.stopPropagation()}
            className="w-3.5 h-3.5 mt-0.5 rounded border-plm-border text-plm-accent focus:ring-plm-accent focus:ring-offset-0 cursor-pointer flex-shrink-0"
          />
          <FolderOpen size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="text-sm text-plm-fg truncate" title={file.file_name}>
              {file.file_name}
            </div>
            <div className="text-xs text-plm-fg-muted truncate mt-0.5" title={file.file_path}>
              {file.file_path}
            </div>
            <div className="flex items-center gap-3 text-xs text-plm-fg-muted mt-1">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {formatDistanceToNow(new Date(file.deleted_at), { addSuffix: true })}
              </span>
              {file.deleted_by_user && (
                <span className="flex items-center gap-1">
                  <User size={10} />
                  {file.deleted_by_user.full_name || file.deleted_by_user.email.split('@')[0]}
                </span>
              )}
            </div>
            {daysRemaining <= 7 && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${
                daysRemaining <= 3 ? 'text-plm-error' : 'text-plm-warning'
              }`}>
                <AlertTriangle size={10} />
                {daysRemaining === 0 
                  ? 'Expires today!' 
                  : `Expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`
                }
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  
  // Render aggregated folder (top-level folder extracted from file paths)
  if (type === 'folder-aggregated' && folderData) {
    const daysRemaining = getDaysRemaining(folderData.latestDelete)
    const filesInFolder = getFilesInFolder?.(folderData.path) || []
    const allFilesSelected = filesInFolder.length > 0 && filesInFolder.every(f => selectedFiles.has(f.id))
    const someFilesSelected = filesInFolder.some(f => selectedFiles.has(f.id)) && !allFilesSelected
    
    const handleClick = () => {
      onFolderViewClick?.(folderData.path, allFilesSelected)
    }
    
    return (
      <div
        style={style}
        onClick={handleClick}
        className={`px-3 py-2 cursor-pointer border-l-2 transition-colors ${
          allFilesSelected
            ? 'bg-plm-accent/10 border-plm-accent'
            : someFilesSelected
            ? 'bg-plm-accent/5 border-plm-accent/50'
            : 'hover:bg-plm-bg-light border-transparent'
        }`}
      >
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={allFilesSelected}
            ref={(el) => { if (el) el.indeterminate = someFilesSelected }}
            onChange={handleClick}
            onClick={(e) => e.stopPropagation()}
            className="w-3.5 h-3.5 mt-0.5 rounded border-plm-border text-plm-accent focus:ring-plm-accent focus:ring-offset-0 cursor-pointer flex-shrink-0"
          />
          <FolderOpen size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="text-sm text-plm-fg truncate flex items-center gap-2" title={folderData.name}>
              {folderData.name}
              <span className="text-xs text-plm-fg-muted">
                ({folderData.count} file{folderData.count !== 1 ? 's' : ''})
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-plm-fg-muted mt-1">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {formatDistanceToNow(new Date(folderData.latestDelete), { addSuffix: true })}
              </span>
              {folderData.deletedBy && (
                <span className="flex items-center gap-1">
                  <User size={10} />
                  {folderData.deletedBy.full_name || folderData.deletedBy.email.split('@')[0]}
                </span>
              )}
            </div>
            {daysRemaining <= 7 && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${
                daysRemaining <= 3 ? 'text-plm-error' : 'text-plm-warning'
              }`}>
                <AlertTriangle size={10} />
                {daysRemaining === 0 
                  ? 'Expires today!' 
                  : `Expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`
                }
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  
  // Render nested folder header
  if (type === 'nested-folder' && nestedFolder) {
    const indentPx = nestedFolder.depth * 16 + 8
    const folderSelected = isFolderSelected?.(nestedFolder.path) ?? false
    const folderPartial = isFolderPartiallySelected?.(nestedFolder.path) ?? false
    
    return (
      <div
        style={{ ...style, paddingLeft: `${indentPx}px` }}
        className={`pr-2 py-1.5 flex items-center gap-1.5 cursor-pointer border-l-2 transition-colors ${
          folderSelected
            ? 'bg-plm-accent/10 border-plm-accent'
            : folderPartial
            ? 'bg-plm-accent/5 border-plm-accent/50'
            : 'hover:bg-plm-bg-light border-transparent'
        }`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFolderExpand?.(nestedFolder.path) }}
          className="p-0.5 hover:bg-plm-bg rounded text-plm-fg-muted"
        >
          {isFolderExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <input
          type="checkbox"
          checked={folderSelected}
          ref={(el) => { if (el) el.indeterminate = folderPartial }}
          onChange={() => onSelectFolder?.(nestedFolder.path)}
          className="w-3.5 h-3.5 rounded border-plm-border text-plm-accent focus:ring-plm-accent focus:ring-offset-0 cursor-pointer"
        />
        <div
          onClick={() => onSelectFolder?.(nestedFolder.path)}
          className="flex-1 flex items-center gap-1.5 min-w-0"
        >
          <FolderOpen size={14} className={`flex-shrink-0 ${nestedFolder.recursiveCount === 0 ? 'text-plm-fg-muted/50' : 'text-plm-fg-muted'}`} />
          <span className={`text-sm truncate ${nestedFolder.recursiveCount === 0 ? 'text-plm-fg-muted' : 'text-plm-fg'}`} title={nestedFolder.path}>
            {nestedFolder.name}
          </span>
          <span className="text-xs text-plm-fg-muted">
            ({nestedFolder.recursiveCount}{nestedFolder.directFileCount > 0 ? ` here` : ''}{nestedFolder.recursiveCount === 0 ? ' - empty' : ''})
          </span>
        </div>
      </div>
    )
  }
  
  // Fallback (shouldn't happen)
  return null
}, arePropsEqual)
