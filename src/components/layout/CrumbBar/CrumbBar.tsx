import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ChevronRight,
  ChevronUp,
  Home,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Folder,
} from 'lucide-react'
import { buildFullPath } from '@/lib/utils/path'
import { logExplorer } from '@/lib/userActionLogger'

// Parse a full path back to relative path
function parsePathToRelative(fullPath: string, vaultPath: string): string {
  const isWindows = vaultPath.includes('\\')
  const sep = isWindows ? '\\' : '/'
  const normalizedVault = vaultPath.replace(/[/\\]/g, sep)
  const normalizedFull = fullPath.replace(/[/\\]/g, sep)

  if (normalizedFull.toLowerCase().startsWith(normalizedVault.toLowerCase())) {
    let relative = normalizedFull.slice(normalizedVault.length)
    // Remove leading separator
    if (relative.startsWith(sep)) {
      relative = relative.slice(1)
    }
    // Convert to forward slashes for internal use
    return relative.replace(/\\/g, '/')
  }
  return ''
}

interface CrumbBarProps {
  /** Current relative path (using forward slashes internally) */
  currentPath: string
  /** Full vault path */
  vaultPath: string
  /** Display name for the vault root */
  vaultName: string
  /** Called when navigating to a folder path (relative path with forward slashes) */
  onNavigate: (relativePath: string) => void
  /** Called when navigating to root */
  onNavigateRoot: () => void
  /** Called when navigating up one level */
  onNavigateUp: () => void
  /** Called when going back in history */
  onBack?: () => void
  /** Called when going forward in history */
  onForward?: () => void
  /** Called when refreshing */
  onRefresh?: () => void
  /** Whether a refresh operation is in progress */
  isRefreshing?: boolean
  /** Whether back navigation is available */
  canGoBack?: boolean
  /** Whether forward navigation is available */
  canGoForward?: boolean
  /** Optional class name */
  className?: string
  /** Drag-drop: called when dragging over a path segment */
  onCrumbDragOver?: (e: React.DragEvent, path: string) => void
  /** Drag-drop: called when drag leaves a path segment */
  onCrumbDragLeave?: (e: React.DragEvent) => void
  /** Drag-drop: called when dropping on a path segment */
  onCrumbDrop?: (e: React.DragEvent, path: string) => void
  /** Drag-drop: currently highlighted path segment (for drop target styling) */
  dragOverPath?: string | null
  /** Returns child folders for a given parent path (for breadcrumb dropdowns) */
  getChildFolders?: (parentPath: string) => Array<{ name: string; relativePath: string }>
}

export function CrumbBar({
  currentPath,
  vaultPath,
  vaultName,
  onNavigate,
  onNavigateRoot,
  onNavigateUp,
  onBack,
  onForward,
  onRefresh,
  isRefreshing = false,
  canGoBack = false,
  canGoForward = false,
  className = '',
  onCrumbDragOver,
  onCrumbDragLeave,
  onCrumbDrop,
  dragOverPath,
  getChildFolders,
}: CrumbBarProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Get the full path for display in edit mode
  const fullPath = currentPath ? buildFullPath(vaultPath, currentPath) : vaultPath

  // Enter edit mode
  const startEditing = useCallback(() => {
    setOpenDropdown(null)
    setEditValue(fullPath)
    setIsEditing(true)
  }, [fullPath])

  // Exit edit mode
  const stopEditing = useCallback(() => {
    setIsEditing(false)
    setEditValue('')
  }, [])

  // Handle path submission
  const handleSubmit = useCallback(() => {
    const trimmedPath = editValue.trim()
    if (!trimmedPath) {
      stopEditing()
      return
    }

    // Parse the path back to relative
    const relativePath = parsePathToRelative(trimmedPath, vaultPath)

    if (relativePath === '') {
      // Navigating to root or path equals vault path
      onNavigateRoot()
    } else {
      onNavigate(relativePath)
    }

    stopEditing()
  }, [editValue, vaultPath, onNavigate, onNavigateRoot, stopEditing])

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Handle click outside to close edit mode
  useEffect(() => {
    if (!isEditing) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        stopEditing()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isEditing, stopEditing])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (openDropdown === null) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openDropdown])

  const handleDropdownToggle = useCallback((parentPath: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenDropdown((prev) => (prev === parentPath ? null : parentPath))
  }, [])

  const handleDropdownNavigate = useCallback(
    (relativePath: string) => {
      setOpenDropdown(null)
      onNavigate(relativePath)
    },
    [onNavigate],
  )

  // Handle keyboard events in edit mode
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      stopEditing()
    }
  }

  // Split path into segments
  const pathParts = currentPath ? currentPath.split('/').filter(Boolean) : []

  return (
    <div ref={containerRef} className={`flex items-center flex-1 min-w-0 gap-1 ${className}`}>
      {/* Navigation buttons - OUTSIDE the crumb field (Chrome-style) */}
      <div className="flex items-center gap-1 flex-shrink-0 mr-1">
        {/* Back */}
        <button
          onClick={onBack}
          disabled={!canGoBack}
          className="p-1.5 rounded-md text-plm-fg-dim hover:text-plm-fg hover:bg-plm-highlight transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Back"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Forward */}
        <button
          onClick={onForward}
          disabled={!canGoForward}
          className="p-1.5 rounded-md text-plm-fg-dim hover:text-plm-fg hover:bg-plm-highlight transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Forward"
        >
          <ArrowRight size={20} />
        </button>

        {/* Up */}
        <button
          onClick={onNavigateUp}
          disabled={!currentPath}
          className="p-1.5 rounded-md text-plm-fg-dim hover:text-plm-fg hover:bg-plm-highlight transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Up one level"
        >
          <ChevronUp size={20} />
        </button>

        {/* Refresh */}
        <button
          onClick={() => {
            logExplorer('Refresh button clicked')
            onRefresh?.()
          }}
          disabled={isRefreshing}
          className="p-1.5 rounded-md text-plm-fg-dim hover:text-plm-fg hover:bg-plm-highlight transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={isRefreshing ? 'Refreshing...' : 'Refresh'}
        >
          <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Crumb field - dark rounded area (Chrome omnibox style) */}
      <div
        className={`flex items-center flex-1 min-w-0 h-9 bg-plm-bg rounded-full px-3 transition-colors ${
          isEditing ? 'ring-2 ring-plm-accent' : 'hover:bg-plm-bg-light'
        }`}
      >
        {isEditing ? (
          // Edit mode - text input with full path
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={stopEditing}
            className="w-full h-full bg-transparent text-sm text-plm-fg focus:outline-none"
            placeholder="Enter path..."
          />
        ) : (
          // Breadcrumb mode - clickable path segments
          <div
            className="flex items-center gap-0.5 flex-1 min-w-0 h-full cursor-text"
            onClick={(e) => {
              // Only enter edit mode if clicking on the background, not on a button
              if ((e.target as HTMLElement).closest('button') === null) {
                startEditing()
              }
            }}
            title="Click to edit path"
          >
            {/* Root/Home button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onNavigateRoot()
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCrumbDragOver?.(e, '')
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCrumbDragLeave?.(e)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCrumbDrop?.(e, '')
              }}
              className={`flex items-center gap-2 text-plm-fg-dim hover:text-plm-fg hover:bg-plm-highlight transition-colors px-2 py-1 rounded-md flex-shrink-0 ${
                dragOverPath === '' ? 'ring-2 ring-plm-accent ring-dashed bg-plm-accent/20' : ''
              }`}
              title="Go to vault root"
            >
              <Home size={18} />
              <span className="truncate max-w-[150px] text-sm">{vaultName}</span>
            </button>

            {/* Root dropdown arrow */}
            {getChildFolders && (
              <div
                className="relative flex-shrink-0"
                ref={openDropdown === '__root__' ? dropdownRef : undefined}
              >
                <button
                  onClick={(e) => handleDropdownToggle('__root__', e)}
                  className={`p-0.5 rounded text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors ${
                    openDropdown === '__root__' ? 'bg-plm-highlight text-plm-fg' : ''
                  }`}
                  title="Show folders"
                >
                  <ChevronRight size={14} />
                </button>
                {openDropdown === '__root__' && (
                  <BreadcrumbDropdown
                    folders={getChildFolders('')}
                    onNavigate={handleDropdownNavigate}
                    currentSegmentPath={pathParts[0] ? pathParts[0] : null}
                  />
                )}
              </div>
            )}

            {/* Path segments */}
            {pathParts.map((part, i) => {
              const pathUpToHere = pathParts.slice(0, i + 1).join('/')
              const isLast = i === pathParts.length - 1
              const isDragTarget = dragOverPath === pathUpToHere
              const dropdownKey = `segment:${pathUpToHere}`

              return (
                <div key={pathUpToHere} className="flex items-center gap-0.5 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onNavigate(pathUpToHere)
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onCrumbDragOver?.(e, pathUpToHere)
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onCrumbDragLeave?.(e)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onCrumbDrop?.(e, pathUpToHere)
                    }}
                    className={`px-2 py-1 rounded-md truncate max-w-[150px] hover:bg-plm-highlight transition-colors text-sm ${
                      isLast ? 'text-plm-fg font-medium' : 'text-plm-fg-dim hover:text-plm-fg'
                    } ${isDragTarget ? 'ring-2 ring-plm-accent ring-dashed bg-plm-accent/20' : ''}`}
                    title={part}
                  >
                    {part}
                  </button>
                  {/* Dropdown arrow for this segment's children */}
                  {getChildFolders && (
                    <div
                      className="relative flex-shrink-0"
                      ref={openDropdown === dropdownKey ? dropdownRef : undefined}
                    >
                      <button
                        onClick={(e) => handleDropdownToggle(dropdownKey, e)}
                        className={`p-0.5 rounded text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors ${
                          openDropdown === dropdownKey ? 'bg-plm-highlight text-plm-fg' : ''
                        }`}
                        title="Show folders"
                      >
                        <ChevronRight size={14} />
                      </button>
                      {openDropdown === dropdownKey && (
                        <BreadcrumbDropdown
                          folders={getChildFolders(pathUpToHere)}
                          onNavigate={handleDropdownNavigate}
                          currentSegmentPath={isLast ? null : pathParts.slice(0, i + 2).join('/')}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Empty spacer to make the clickable area extend to the right */}
            <div className="flex-1 min-w-[20px] h-full" />
          </div>
        )}
      </div>
    </div>
  )
}

interface BreadcrumbDropdownProps {
  folders: Array<{ name: string; relativePath: string }>
  onNavigate: (relativePath: string) => void
  /** The path of the currently-active child at this level (bolded in the list) */
  currentSegmentPath: string | null
}

function BreadcrumbDropdown({ folders, onNavigate, currentSegmentPath }: BreadcrumbDropdownProps) {
  if (folders.length === 0) {
    return (
      <div className="absolute top-full left-0 mt-1 z-50 bg-plm-bg-lighter border border-plm-border rounded-lg shadow-lg py-1 min-w-[160px]">
        <div className="px-3 py-1.5 text-xs text-plm-fg-muted italic">No subfolders</div>
      </div>
    )
  }

  return (
    <div className="absolute top-full left-0 mt-1 z-50 bg-plm-bg-lighter border border-plm-border rounded-lg shadow-lg py-1 min-w-[160px] max-h-[300px] overflow-y-auto">
      {folders.map((folder) => {
        const isActive = folder.relativePath === currentSegmentPath
        return (
          <button
            key={folder.relativePath}
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(folder.relativePath)
            }}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-plm-highlight transition-colors ${
              isActive ? 'text-plm-fg font-medium' : 'text-plm-fg-dim hover:text-plm-fg'
            }`}
          >
            <Folder size={14} className="flex-shrink-0 text-plm-accent" />
            <span className="truncate">{folder.name}</span>
          </button>
        )
      })}
    </div>
  )
}
