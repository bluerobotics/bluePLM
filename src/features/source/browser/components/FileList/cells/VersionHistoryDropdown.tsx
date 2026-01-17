/**
 * VersionHistoryDropdown - Inline dropdown for version history and rollback
 * 
 * Replaces the need for a separate Versions tab by providing all version
 * functionality in a compact dropdown triggered from the version cell.
 * 
 * Features:
 * - Version list with Server/Local/Rolled back badges
 * - Rollback and roll forward actions
 * - Version notes (editable when file is checked out)
 * - Pending local version display with checkin note editing
 * - Download links for previous versions
 */
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { 
  ChevronRight, 
  RotateCcw, 
  ArrowUp, 
  Loader2, 
  MessageSquare, 
  Pencil,
  History
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { usePDMStore, type LocalFile } from '@/stores/pdmStore'
import { getFileVersions, rollbackToVersion, updateVersionNote } from '@/lib/supabase'
import { getDownloadUrl } from '@/lib/storage'
import { log } from '@/lib/logger'

interface VersionEntry {
  id: string
  version: number
  revision: string
  state: string
  comment: string | null
  content_hash: string
  file_size: number
  part_number?: string | null
  description?: string | null
  created_at: string
  created_by_user?: { email: string; full_name: string } | null
}

interface VersionHistoryDropdownProps {
  file: LocalFile
}

export function VersionHistoryDropdown({ file }: VersionHistoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [rollingBack, setRollingBack] = useState<number | null>(null)
  
  // Note editing state
  const [editingNoteVersionId, setEditingNoteVersionId] = useState<string | null>(null)
  const [editingNoteValue, setEditingNoteValue] = useState('')
  const [savingNoteVersionId, setSavingNoteVersionId] = useState<string | null>(null)
  
  // Local (pending) version note editing
  const [editingLocalNote, setEditingLocalNote] = useState(false)
  const [localNoteValue, setLocalNoteValue] = useState('')
  
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  
  const { 
    user, 
    organization, 
    addToast, 
    updateFileInStore,
    updatePendingVersionNote,
    updatePendingCheckinNote,
    addExpectedFileChanges,
    clearExpectedFileChanges,
    setLastOperationCompletedAt
  } = usePDMStore()

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const dropdownHeight = 400 // max-height of dropdown
      
      // Check if dropdown would overflow bottom of viewport
      const spaceBelow = viewportHeight - rect.bottom
      const shouldOpenUpward = spaceBelow < dropdownHeight && rect.top > spaceBelow
      
      setDropdownPosition({
        top: shouldOpenUpward ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: rect.left
      })
    }
  }, [isOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      // Check both dropdown and button (since they're in different DOM trees now)
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Load versions when dropdown opens
  useEffect(() => {
    if (!isOpen || !file.pdmData?.id) return
    
    const loadVersions = async () => {
      setIsLoading(true)
      try {
        const { versions: fileVersions, error } = await getFileVersions(file.pdmData!.id)
        if (!error && fileVersions) {
          setVersions(fileVersions as VersionEntry[])
        }
      } catch (err) {
        log.error('[VersionHistoryDropdown]', 'Failed to load versions', { error: err })
      } finally {
        setIsLoading(false)
      }
    }
    
    loadVersions()
  }, [isOpen, file.pdmData?.id])

  // Handle rollback/roll forward
  const handleRollback = async (targetVersion: number) => {
    if (!file.pdmData?.id || !user || !organization) return
    
    if (file.pdmData.checked_out_by !== user.id) {
      addToast('error', 'Check out the file first to switch versions')
      return
    }
    
    const currentVersion = file.pdmData.version || 0
    const isRollForward = targetVersion > currentVersion
    const actionLabel = isRollForward ? 'Roll forward' : 'Rollback'
    
    setRollingBack(targetVersion)
    
    try {
      const targetVersionRecord = versions.find(v => v.version === targetVersion)
      if (!targetVersionRecord) {
        addToast('error', `Version ${targetVersion} not found`)
        setRollingBack(null)
        return
      }
      
      const result = await rollbackToVersion(
        file.pdmData.id,
        user.id,
        targetVersion,
        isRollForward ? `Rolled forward to version ${targetVersion}` : `Rolled back to version ${targetVersion}`
      )
      
      if (result.success && result.targetVersionRecord) {
        // Use relativePath to match file watcher format (relative paths with forward slashes)
        addExpectedFileChanges([file.relativePath])
        
        const { url: downloadUrl, error: urlError } = await getDownloadUrl(
          organization.id,
          result.targetVersionRecord.content_hash
        )
        
        if (urlError || !downloadUrl) {
          addToast('warning', `${actionLabel} to v${targetVersion} - but could not get download URL: ${urlError}`)
        } else if (window.electronAPI) {
          const writeResult = await window.electronAPI.downloadUrl(downloadUrl, file.path)
          if (!writeResult.success) {
            addToast('warning', `${actionLabel} to v${targetVersion} - but could not write file: ${writeResult.error}`)
          }
        }
        
        setLastOperationCompletedAt(Date.now())
        
        const serverVersion = file.pdmData.version || 0
        const isRestoringToServerVersion = targetVersion === serverVersion
        
        updateFileInStore(file.path, {
          localActiveVersion: isRestoringToServerVersion ? undefined : targetVersion,
          localVersion: targetVersion, // Track the version we rolled back to
          localHash: isRestoringToServerVersion 
            ? file.pdmData.content_hash 
            : result.targetVersionRecord.content_hash,
          diffStatus: isRestoringToServerVersion ? undefined : 'modified'
        })
        
        setTimeout(() => clearExpectedFileChanges([file.relativePath]), 5000)
        
        addToast('success', `${actionLabel} to version ${targetVersion} of ${result.maxVersion}`)
        
        // Reload versions
        const { versions: fileVersions } = await getFileVersions(file.pdmData.id)
        if (fileVersions) {
          setVersions(fileVersions as VersionEntry[])
        }
      } else {
        addToast('error', result.error || `Failed to ${actionLabel.toLowerCase()}`)
      }
    } catch (err) {
      addToast('error', `${actionLabel} failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRollingBack(null)
    }
  }

  // Start editing version note
  const handleStartEditNote = (version: VersionEntry) => {
    const pendingNote = file.pendingVersionNotes?.[version.id]
    const currentNote = pendingNote !== undefined ? pendingNote : (version.comment || '')
    setEditingNoteVersionId(version.id)
    setEditingNoteValue(currentNote)
  }

  // Save version note
  const handleSaveNote = async (version: VersionEntry) => {
    if (!file.pdmData?.id || !user) return
    
    const trimmedNote = editingNoteValue.trim()
    const pendingNote = file.pendingVersionNotes?.[version.id]
    const originalNote = version.comment || ''
    
    const noteChanged = trimmedNote !== originalNote
    
    if (pendingNote === trimmedNote || (!noteChanged && pendingNote === undefined)) {
      setEditingNoteVersionId(null)
      setEditingNoteValue('')
      return
    }
    
    setSavingNoteVersionId(version.id)
    
    try {
      const result = await updateVersionNote(
        file.pdmData.id,
        version.id,
        user.id,
        trimmedNote
      )
      
      if (result.success) {
        setVersions(prev => prev.map(v => 
          v.id === version.id ? { ...v, comment: trimmedNote || null } : v
        ))
        if (file.pendingVersionNotes?.[version.id] !== undefined) {
          updatePendingVersionNote(file.path, version.id, '')
        }
        addToast('success', 'Note saved')
      } else {
        updatePendingVersionNote(file.path, version.id, trimmedNote)
        addToast('warning', `Note saved locally (will sync on check-in): ${result.error}`)
      }
    } catch {
      updatePendingVersionNote(file.path, version.id, trimmedNote)
      addToast('warning', 'Note saved locally (will sync on check-in)')
    } finally {
      setSavingNoteVersionId(null)
      setEditingNoteVersionId(null)
      setEditingNoteValue('')
    }
  }

  // Cancel note editing
  const handleCancelEditNote = () => {
    setEditingNoteVersionId(null)
    setEditingNoteValue('')
  }

  // Render version display text
  const renderVersionText = () => {
    if (file.isDirectory) return null
    
    const cloudVersion = file.pdmData?.version || null
    if (!cloudVersion) {
      return <span className="text-plm-fg-muted">-/-</span>
    }
    
    // After rollback
    if (file.localActiveVersion !== undefined && file.localActiveVersion !== cloudVersion) {
      return (
        <span className="text-plm-info" title={`Viewing version ${file.localActiveVersion} (latest is ${cloudVersion}). Check in to save.`}>
          {file.localActiveVersion}/{cloudVersion}
        </span>
      )
    }
    
    // Local changes
    if (file.diffStatus === 'modified') {
      return (
        <span className="text-plm-warning" title={`Local changes (will be version ${cloudVersion + 1})`}>
          {cloudVersion + 1}/{cloudVersion}
        </span>
      )
    } else if (file.diffStatus === 'moved') {
      return (
        <span className="text-plm-accent" title="File moved (version unchanged)">
          {cloudVersion}/{cloudVersion}
        </span>
      )
    } else if (file.diffStatus === 'outdated') {
      // Use tracked localVersion if available, otherwise show "?" for unknown
      const localVer = file.localVersion
      const localVerDisplay = localVer !== undefined ? localVer : '?'
      const tooltip = localVer !== undefined 
        ? `Local version ${localVer}, server has version ${cloudVersion}. Use Get Latest to update.`
        : `Newer version available on server (v${cloudVersion}). Local version unknown.`
      return (
        <span className="text-purple-400" title={tooltip}>
          {localVerDisplay}/{cloudVersion}
        </span>
      )
    }
    
    // In sync
    return <span>{cloudVersion}/{cloudVersion}</span>
  }

  // Don't show dropdown for directories or unsynced files
  if (file.isDirectory || !file.pdmData?.id) {
    return renderVersionText()
  }

  const serverVersion = file.pdmData?.version || 0
  const hasMetadataChanges = file.pendingMetadata && Object.keys(file.pendingMetadata).length > 0
  const isCheckedOutByMe = file.pdmData?.checked_out_by === user?.id
  const isRolledBack = file.localActiveVersion !== undefined && file.localActiveVersion !== serverVersion
  const hasNewChanges = hasMetadataChanges || (file.diffStatus === 'modified' && !isRolledBack)

  return (
    <div className="inline-flex items-center">
      <span className="mr-0.5">{renderVersionText()}</span>
      <button
        ref={buttonRef}
        className="p-0.5 -mr-1 hover:bg-plm-bg-light/50 rounded transition-colors flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        title="Click to view version history"
      >
        <ChevronRight 
          size={12} 
          className={`transition-colors ${isOpen ? 'text-plm-accent' : 'text-plm-fg-muted hover:text-plm-fg'}`} 
        />
      </button>

      {/* Dropdown Panel - rendered via portal to escape table stacking context */}
      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed bg-plm-bg border border-plm-border rounded-lg shadow-xl w-[320px] max-h-[400px] overflow-hidden flex flex-col"
          style={{ 
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            zIndex: 9999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-plm-border flex items-center gap-2 flex-shrink-0">
            <History size={14} className="text-plm-fg-muted" />
            <span className="text-xs font-medium text-plm-fg">Version History</span>
            {!isCheckedOutByMe && versions.length > 1 && (
              <span className="ml-auto text-[10px] text-plm-warning">Check out to rollback</span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-plm-fg-muted" size={20} />
              </div>
            ) : (
              <>
                {/* Pending local version (new changes, not rollback) */}
                {hasNewChanges && isCheckedOutByMe && !isRolledBack && (
                  <div className="p-2 rounded border bg-plm-accent/10 border-plm-accent">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">v{serverVersion + 1}</span>
                      <span className="px-1 py-0.5 text-[10px] bg-plm-accent/20 text-plm-accent rounded">Local</span>
                      <span className="px-1 py-0.5 text-[10px] bg-plm-warning/20 text-plm-warning rounded">Not checked in</span>
                    </div>
                    
                    {/* Editable note for pending version */}
                    <div className="group/note">
                      {editingLocalNote ? (
                        <div className="mb-1">
                          <textarea
                            value={localNoteValue}
                            onChange={(e) => setLocalNoteValue(e.target.value)}
                            placeholder="Add a check-in note..."
                            className="w-full bg-plm-bg border border-plm-border rounded px-2 py-1 text-xs text-plm-fg focus:outline-none focus:border-plm-accent focus:ring-1 focus:ring-plm-accent resize-none"
                            rows={2}
                            autoFocus
                            onBlur={() => {
                              updatePendingCheckinNote(file.path, localNoteValue)
                              setEditingLocalNote(false)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setLocalNoteValue(file.pendingCheckinNote || '')
                                setEditingLocalNote(false)
                              } else if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                updatePendingCheckinNote(file.path, localNoteValue)
                                setEditingLocalNote(false)
                              }
                            }}
                          />
                        </div>
                      ) : file.pendingCheckinNote ? (
                        <div 
                          className="flex items-start gap-1.5 cursor-pointer hover:bg-plm-bg rounded px-1 -mx-1 py-0.5"
                          onClick={() => {
                            setLocalNoteValue(file.pendingCheckinNote || '')
                            setEditingLocalNote(true)
                          }}
                          title="Click to edit note"
                        >
                          <MessageSquare size={10} className="text-plm-fg-muted mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-plm-fg-dim italic flex-1">"{file.pendingCheckinNote}"</span>
                          <Pencil size={10} className="text-plm-fg-muted opacity-0 group-hover/note:opacity-100 transition-opacity flex-shrink-0" />
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setLocalNoteValue('')
                            setEditingLocalNote(true)
                          }}
                          className="flex items-center gap-1 text-[10px] text-plm-fg-muted/50 hover:text-plm-accent transition-colors"
                        >
                          <MessageSquare size={10} />
                          <span>Add check-in note</span>
                        </button>
                      )}
                    </div>
                    
                    <div className="text-[10px] text-plm-fg-muted mt-1">
                      {hasMetadataChanges ? 'Metadata changes' : 'Content changes'}
                    </div>
                  </div>
                )}

                {/* Version list */}
                {versions.map((version) => {
                  const isServerVersion = version.version === serverVersion
                  // The version currently active on disk (for rollback UI, not the tracked localVersion field)
                  const activeVersion = file.localActiveVersion ?? file.localVersion ?? serverVersion
                  const isLocalVersion = isRolledBack 
                    ? version.version === file.localActiveVersion
                    : hasNewChanges 
                      ? false 
                      : version.version === serverVersion
                  
                  const canSwitch = !isLocalVersion && isCheckedOutByMe
                  const isRollForward = version.version > activeVersion
                  
                  return (
                    <div
                      key={version.id}
                      className={`p-2 rounded border transition-colors ${
                        isLocalVersion 
                          ? 'bg-plm-accent/10 border-plm-accent' 
                          : 'bg-plm-bg-light border-plm-border hover:border-plm-border-light'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium">v{version.version}</span>
                        <span className="text-xs text-plm-fg-muted">Rev {version.revision}</span>
                        {version.part_number && (
                          <span className="text-xs text-plm-fg-muted" title="Part Number">
                            {version.part_number}
                          </span>
                        )}
                        {isServerVersion && (
                          <span className="px-1 py-0.5 text-[10px] bg-plm-success/20 text-plm-success rounded">Server</span>
                        )}
                        {isLocalVersion && (
                          <span className="px-1 py-0.5 text-[10px] bg-plm-accent/20 text-plm-accent rounded">Local</span>
                        )}
                        {isLocalVersion && isRolledBack && (
                          <span className="px-1 py-0.5 text-[10px] bg-plm-info/20 text-plm-info rounded">Rolled back</span>
                        )}
                        
                        {/* Actions */}
                        <div className="ml-auto flex items-center gap-1">
                          {canSwitch && (
                            <button
                              onClick={() => handleRollback(version.version)}
                              disabled={rollingBack !== null}
                              className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded transition-colors disabled:opacity-50 ${
                                isRollForward 
                                  ? 'bg-plm-info/20 text-plm-info hover:bg-plm-info/30' 
                                  : 'bg-plm-warning/20 text-plm-warning hover:bg-plm-warning/30'
                              }`}
                              title={isRollForward ? 'Roll forward to this version' : 'Rollback to this version'}
                            >
                              {rollingBack === version.version ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : isRollForward ? (
                                <ArrowUp size={10} />
                              ) : (
                                <RotateCcw size={10} />
                              )}
                              {isRollForward ? 'Forward' : 'Rollback'}
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Version note */}
                      {(() => {
                        const isEditing = editingNoteVersionId === version.id
                        const isSaving = savingNoteVersionId === version.id
                        const canEdit = isCheckedOutByMe
                        const pendingNote = file.pendingVersionNotes?.[version.id]
                        const displayNote = pendingNote !== undefined ? pendingNote : version.comment
                        const hasPendingChange = pendingNote !== undefined && pendingNote !== (version.comment || '')
                        
                        if (isEditing) {
                          return (
                            <div className="mb-1">
                              <div className="relative">
                                <textarea
                                  value={editingNoteValue}
                                  onChange={(e) => setEditingNoteValue(e.target.value)}
                                  placeholder="Add a note..."
                                  className="w-full bg-plm-bg border border-plm-border rounded px-2 py-1 text-xs text-plm-fg focus:outline-none focus:border-plm-accent focus:ring-1 focus:ring-plm-accent resize-none"
                                  rows={2}
                                  autoFocus
                                  disabled={isSaving}
                                  onBlur={() => handleSaveNote(version)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                      handleCancelEditNote()
                                    } else if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault()
                                      handleSaveNote(version)
                                    }
                                  }}
                                />
                                {isSaving && (
                                  <div className="absolute right-2 top-1.5">
                                    <Loader2 size={12} className="animate-spin text-plm-fg-muted" />
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        }
                        
                        return (
                          <div className="group/note">
                            {displayNote ? (
                              <div 
                                className={`flex items-start gap-1.5 ${canEdit ? 'cursor-pointer hover:bg-plm-bg rounded px-1 -mx-1 py-0.5' : ''}`}
                                onClick={canEdit ? () => handleStartEditNote(version) : undefined}
                                title={canEdit ? 'Click to edit note' : undefined}
                              >
                                <MessageSquare size={10} className="text-plm-fg-muted mt-0.5 flex-shrink-0" />
                                <span className="text-xs text-plm-fg-dim italic flex-1 line-clamp-2">"{displayNote}"</span>
                                {hasPendingChange && (
                                  <span className="text-[10px] text-plm-warning" title="Unsaved changes">•</span>
                                )}
                                {canEdit && (
                                  <Pencil size={10} className="text-plm-fg-muted opacity-0 group-hover/note:opacity-100 transition-opacity flex-shrink-0" />
                                )}
                              </div>
                            ) : canEdit ? (
                              <button
                                onClick={() => handleStartEditNote(version)}
                                className="flex items-center gap-1 text-[10px] text-plm-fg-muted/50 hover:text-plm-accent transition-colors"
                              >
                                <MessageSquare size={10} />
                                <span>Add note</span>
                              </button>
                            ) : null}
                          </div>
                        )
                      })()}
                      
                      {/* Description */}
                      {version.description && (
                        <div className="text-[10px] text-plm-fg-dim mt-1 line-clamp-1" title={version.description}>
                          {version.description}
                        </div>
                      )}
                      
                      {/* Metadata */}
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-plm-fg-muted mt-1">
                        <span title={version.created_by_user?.email}>
                          {version.created_by_user?.full_name?.split(' ')[0] || version.created_by_user?.email?.split('@')[0] || 'Unknown'}
                        </span>
                        <span>•</span>
                        <span title={version.created_at ? format(new Date(version.created_at), 'MMM d, yyyy HH:mm:ss') : '-'}>
                          {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  )
                })}
                
                {versions.length === 0 && !isLoading && (
                  <div className="text-sm text-plm-fg-muted text-center py-4">
                    No version history
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
