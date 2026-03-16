// src/features/source/context-menu/dialogs/MatchGhostFileDialog.tsx
import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, File, FileSearch, ArrowRight } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import { formatBytes } from '@/lib/utils'

interface MatchGhostFileDialogProps {
  isOpen: boolean
  onClose: () => void
  ghostFile: LocalFile | null
  candidates: LocalFile[]
  onConfirm: (selectedCandidate: LocalFile) => void
}

export function MatchGhostFileDialog({
  isOpen,
  onClose,
  ghostFile,
  candidates,
  onConfirm
}: MatchGhostFileDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(0)

  useEffect(() => {
    if (isOpen) setSelectedIndex(candidates.length > 0 ? 0 : -1)
  }, [isOpen, candidates.length])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && selectedIndex >= 0 && candidates[selectedIndex]) {
      e.preventDefault()
      onConfirm(candidates[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown' && selectedIndex < candidates.length - 1) {
      e.preventDefault()
      setSelectedIndex(prev => prev + 1)
    } else if (e.key === 'ArrowUp' && selectedIndex > 0) {
      e.preventDefault()
      setSelectedIndex(prev => prev - 1)
    }
  }, [onConfirm, onClose, selectedIndex, candidates])

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  if (!isOpen || !ghostFile) return null

  const hasCandidates = candidates.length > 0

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-plm-bg-light border border-plm-border rounded-lg p-6 max-w-lg w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-plm-warning/20 flex items-center justify-center">
            <FileSearch size={20} className="text-plm-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-plm-fg">
              Match Ghost File
            </h3>
            <p className="text-sm text-plm-fg-muted">
              Select the local file this server record should point to.
            </p>
          </div>
        </div>

        {/* Ghost file info */}
        <div className="bg-plm-bg rounded border border-plm-border p-3 mb-4">
          <div className="text-xs text-plm-fg-muted mb-1">Ghost file (stale server path)</div>
          <div className="flex items-center gap-2">
            <File size={16} className="text-plm-error shrink-0" />
            <span className="text-plm-fg font-medium truncate">{ghostFile.name}</span>
          </div>
          <div className="text-xs text-plm-fg-dim mt-1 truncate" title={ghostFile.relativePath}>
            {ghostFile.relativePath}
          </div>
        </div>

        {hasCandidates ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight size={14} className="text-plm-fg-muted" />
              <span className="text-sm text-plm-fg-muted">
                {candidates.length} candidate{candidates.length > 1 ? 's' : ''} found
              </span>
            </div>

            <div className="bg-plm-bg rounded border border-plm-border mb-4 max-h-48 overflow-y-auto">
              {candidates.map((candidate, i) => (
                <label
                  key={candidate.path}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-plm-bg-light transition-colors ${
                    i === selectedIndex ? 'bg-plm-accent/10 border-l-2 border-l-plm-accent' : 'border-l-2 border-l-transparent'
                  } ${i > 0 ? 'border-t border-plm-border' : ''}`}
                  onClick={() => setSelectedIndex(i)}
                >
                  <input
                    type="radio"
                    name="ghost-match-candidate"
                    checked={i === selectedIndex}
                    onChange={() => setSelectedIndex(i)}
                    className="accent-plm-accent"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <File size={14} className="text-plm-success shrink-0" />
                      <span className="text-sm text-plm-fg font-medium truncate">{candidate.name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-plm-fg-dim truncate" title={candidate.relativePath}>
                        {candidate.relativePath}
                      </span>
                      {candidate.size > 0 && (
                        <span className="text-xs text-plm-fg-muted whitespace-nowrap">
                          {formatBytes(candidate.size)}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </>
        ) : (
          <div className="bg-plm-warning/10 border border-plm-warning/30 rounded p-3 mb-4">
            <p className="text-sm text-plm-warning font-medium flex items-center gap-2">
              <AlertTriangle size={14} />
              No candidate files found
            </p>
            <p className="text-xs text-plm-fg-muted mt-1">
              No unmatched local files with the same extension were found in the same folder.
              The renamed file may be in a different folder or not yet added locally.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn btn-ghost"
          >
            Cancel
          </button>
          {hasCandidates && (
            <button
              onClick={() => {
                if (selectedIndex >= 0 && candidates[selectedIndex]) {
                  onConfirm(candidates[selectedIndex])
                }
              }}
              disabled={selectedIndex < 0}
              className="btn bg-plm-accent hover:bg-plm-accent/80 text-white"
            >
              <FileSearch size={14} />
              Match File
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
