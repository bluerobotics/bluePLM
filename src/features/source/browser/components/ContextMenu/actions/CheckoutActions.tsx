/**
 * Checkout/checkin actions for context menu
 */
import React from 'react'
import { ArrowDown, ArrowUp, RefreshCw, Undo2, Unlock } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'
import { getCountLabel } from '../../../utils/formatting'
import type { RefreshableActionProps, SelectionCounts, SelectionState } from './types'

interface CheckoutActionsProps extends RefreshableActionProps {
  counts: SelectionCounts
  state: SelectionState
  syncedFilesInSelection: LocalFile[]
  handleCheckoutFolder: (folder: LocalFile) => void
  handleCheckinFolder: (folder: LocalFile) => void
  handleBulkStateChange: (files: LocalFile[], newState: string) => void
  showStateSubmenu: boolean
  setShowStateSubmenu: (show: boolean) => void
  stateSubmenuTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
}

export function CheckoutActions({
  contextFiles,
  multiSelect,
  firstFile,
  onClose,
  onRefresh,
  counts,
  state,
  syncedFilesInSelection,
  handleCheckoutFolder,
  handleCheckinFolder,
  handleBulkStateChange,
  showStateSubmenu,
  setShowStateSubmenu,
  stateSubmenuTimeoutRef,
}: CheckoutActionsProps) {
  const { user, getEffectiveRole } = usePDMStore()
  const effectiveRole = getEffectiveRole()
  const isAdmin = effectiveRole === 'admin'
  
  const fileCount = counts.fileCount
  const folderCount = counts.folderCount
  const countLabel = getCountLabel(fileCount, folderCount)

  return (
    <>
      {/* Check Out - for synced files or folders */}
      {state.allFolders && !multiSelect ? (
        <div 
          className={`context-menu-item ${!state.anySynced || counts.checkoutableCount === 0 ? 'disabled' : ''}`}
          onClick={() => {
            if (!state.anySynced || counts.checkoutableCount === 0) return
            handleCheckoutFolder(firstFile)
            onClose()
          }}
          title={!state.anySynced ? 'Download files first to enable checkout' : counts.checkoutableCount === 0 ? 'All files already checked out' : ''}
        >
          <ArrowDown size={14} className={!state.anySynced || counts.checkoutableCount === 0 ? 'text-plm-fg-muted' : 'text-plm-warning'} />
          Check Out {counts.checkoutableCount > 0 ? `${counts.checkoutableCount} files` : ''}
          {!state.anySynced && <span className="text-xs text-plm-fg-muted ml-auto">(download first)</span>}
          {state.anySynced && counts.checkoutableCount === 0 && <span className="text-xs text-plm-fg-muted ml-auto">(already out)</span>}
        </div>
      ) : (
        <div 
          className={`context-menu-item ${!state.anySynced || state.allCheckedOut ? 'disabled' : ''}`}
          onClick={() => {
            if (!state.anySynced || state.allCheckedOut || !user) return
            onClose()
            executeCommand('checkout', { files: contextFiles }, { onRefresh })
          }}
          title={!state.anySynced ? 'Download files first to enable checkout' : state.allCheckedOut ? 'Already checked out' : ''}
        >
          <ArrowDown size={14} className={!state.anySynced ? 'text-plm-fg-muted' : 'text-plm-warning'} />
          Check Out {multiSelect ? countLabel : ''}
          {!state.anySynced && <span className="text-xs text-plm-fg-muted ml-auto">(download first)</span>}
          {state.anySynced && state.allCheckedOut && <span className="text-xs text-plm-fg-muted ml-auto">(already out)</span>}
        </div>
      )}
      
      {/* Check In - only for synced files */}
      {state.anySynced && (
        state.allFolders && !multiSelect ? (
          <div 
            className={`context-menu-item ${counts.checkinableCount === 0 ? 'disabled' : ''}`}
            onClick={() => {
              if (counts.checkinableCount === 0) return
              handleCheckinFolder(firstFile)
              onClose()
            }}
            title={counts.checkinableCount === 0 ? 'No files checked out by you' : ''}
          >
            <ArrowUp size={14} className={counts.checkinableCount === 0 ? 'text-plm-fg-muted' : 'text-plm-success'} />
            Check In {counts.checkinableCount > 0 ? `${counts.checkinableCount} files` : ''}
            {counts.checkinableCount === 0 && <span className="text-xs text-plm-fg-muted ml-auto">(none checked out)</span>}
          </div>
        ) : (
          <div 
            className={`context-menu-item ${state.allCheckedIn || counts.checkinableCount === 0 ? 'disabled' : ''}`}
            onClick={() => {
              if (state.allCheckedIn || counts.checkinableCount === 0 || !user) return
              onClose()
              executeCommand('checkin', { files: contextFiles }, { onRefresh })
            }}
            title={state.allCheckedIn ? 'Already checked in' : (state.allCheckedOutByOthers ? 'Checked out by someone else' : (counts.checkinableCount === 0 ? 'No files checked out by you' : ''))}
          >
            <ArrowUp size={14} className={state.allCheckedIn || counts.checkinableCount === 0 ? 'text-plm-fg-muted' : 'text-plm-success'} />
            Check In {multiSelect ? countLabel : ''}
            {state.allCheckedIn && <span className="text-xs text-plm-fg-muted ml-auto">(already in)</span>}
            {!state.allCheckedIn && state.allCheckedOutByOthers && <span className="text-xs text-plm-fg-muted ml-auto">(by others)</span>}
          </div>
        )
      )}
      
      {/* Discard Checkout - for files checked out by current user */}
      {counts.checkinableCount > 0 && (
        <div 
          className="context-menu-item text-plm-warning"
          onClick={() => {
            onClose()
            executeCommand('discard', { files: contextFiles }, { onRefresh })
          }}
          title="Discard local changes and revert to server version"
        >
          <Undo2 size={14} />
          Discard Checkout {counts.checkinableCount > 1 ? `(${counts.checkinableCount})` : ''}
        </div>
      )}
      
      {/* Admin: Force Release - for files checked out by others */}
      {isAdmin && counts.checkedOutByOthersCount > 0 && (
        <div 
          className="context-menu-item text-plm-error"
          onClick={() => {
            onClose()
            executeCommand('force-release', { files: contextFiles }, { onRefresh })
          }}
          title="Admin: Immediately release checkout. User's unsaved changes will be orphaned."
        >
          <Unlock size={14} />
          Force Release {counts.checkedOutByOthersCount > 1 ? `(${counts.checkedOutByOthersCount})` : ''}
        </div>
      )}
      
      {/* Change State - for synced files */}
      {state.anySynced && (
        <div 
          className="context-menu-item relative"
          onMouseEnter={() => {
            if (stateSubmenuTimeoutRef.current) {
              clearTimeout(stateSubmenuTimeoutRef.current)
            }
            setShowStateSubmenu(true)
          }}
          onMouseLeave={() => {
            stateSubmenuTimeoutRef.current = setTimeout(() => {
              setShowStateSubmenu(false)
            }, 150)
          }}
          onClick={(e) => {
            e.stopPropagation()
            setShowStateSubmenu(!showStateSubmenu)
          }}
        >
          <RefreshCw size={14} />
          Change State
          <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
          
          {/* State Submenu */}
          {showStateSubmenu && (
            <div 
              className="absolute left-full top-0 ml-1 min-w-[160px] bg-plm-bg-lighter border border-plm-border rounded-md py-1 shadow-lg z-[100]"
              style={{ marginTop: '-4px' }}
              onMouseEnter={() => {
                if (stateSubmenuTimeoutRef.current) {
                  clearTimeout(stateSubmenuTimeoutRef.current)
                }
                setShowStateSubmenu(true)
              }}
              onMouseLeave={() => {
                stateSubmenuTimeoutRef.current = setTimeout(() => {
                  setShowStateSubmenu(false)
                }, 150)
              }}
            >
              {(['wip', 'in_review', 'released', 'obsolete'] as const).map((stateOption) => {
                const stateColors: Record<string, string> = {
                  wip: 'var(--plm-wip)',
                  in_review: 'var(--plm-in-review)',
                  released: 'var(--plm-released)',
                  obsolete: 'var(--plm-obsolete)'
                }
                const stateLabels: Record<string, string> = {
                  wip: 'Work in Progress',
                  in_review: 'In Review',
                  released: 'Released',
                  obsolete: 'Obsolete'
                }
                return (
                  <div 
                    key={stateOption}
                    className="context-menu-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      onClose()
                      setShowStateSubmenu(false)
                      handleBulkStateChange(syncedFilesInSelection, stateOption)
                    }}
                  >
                    <span 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stateColors[stateOption] }}
                    />
                    {stateLabels[stateOption]}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
