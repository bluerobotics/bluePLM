/**
 * Checkout/checkin actions for context menu
 */
import React from 'react'
import { ArrowDown, ArrowUp, RefreshCw, Undo2, Unlock } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'
import { checkOperationPermission, getPermissionRequirement } from '@/lib/permissions'
import { getCountLabel } from '@/lib/utils'
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
  const { user, getEffectiveRole, hasPermission, addToast } = usePDMStore()
  const effectiveRole = getEffectiveRole()
  const isAdmin = effectiveRole === 'admin'
  
  // Permission checks
  const canCheckout = checkOperationPermission('checkout', hasPermission)
  const canCheckin = checkOperationPermission('checkin', hasPermission)
  const canDiscard = checkOperationPermission('discard', hasPermission)
  const canForceRelease = checkOperationPermission('force-release', hasPermission)
  
  const fileCount = counts.fileCount
  const folderCount = counts.folderCount
  const countLabel = getCountLabel(fileCount, folderCount)
  
  // Compute disabled states
  const checkoutDisabled = !canCheckout.allowed || !state.anySynced || (state.allFolders ? counts.checkoutableCount === 0 : state.allCheckedOut)
  const checkoutReason = !canCheckout.allowed
    ? `Requires ${getPermissionRequirement('checkout')}`
    : !state.anySynced
      ? 'Download files first to enable checkout'
      : (state.allFolders ? counts.checkoutableCount === 0 : state.allCheckedOut)
        ? 'All files already checked out'
        : ''
  
  const checkinDisabled = !canCheckin.allowed || state.allCheckedIn || counts.checkinableCount === 0
  const checkinReason = !canCheckin.allowed
    ? `Requires ${getPermissionRequirement('checkin')}`
    : state.allCheckedIn
      ? 'Already checked in'
      : state.allCheckedOutByOthers
        ? 'Checked out by someone else'
        : counts.checkinableCount === 0
          ? 'No files checked out by you'
          : ''
  
  const discardDisabled = !canDiscard.allowed
  const discardReason = !canDiscard.allowed ? `Requires ${getPermissionRequirement('discard')}` : ''
  
  const forceReleaseDisabled = !canForceRelease.allowed
  const forceReleaseReason = !canForceRelease.allowed ? `Requires ${getPermissionRequirement('force-release')}` : ''

  return (
    <>
      {/* Check Out - for synced files or folders */}
      {state.allFolders && !multiSelect ? (
        <div 
          className={`context-menu-item ${checkoutDisabled ? 'disabled' : ''}`}
          onClick={() => {
            if (!canCheckout.allowed) {
              addToast('error', canCheckout.reason || getPermissionRequirement('checkout'))
              return
            }
            if (!state.anySynced || counts.checkoutableCount === 0) return
            handleCheckoutFolder(firstFile)
            onClose()
          }}
          title={checkoutReason}
        >
          <ArrowDown size={14} className={checkoutDisabled ? 'text-plm-fg-muted' : 'text-plm-warning'} />
          Check Out {counts.checkoutableCount > 0 ? `${counts.checkoutableCount} files` : ''}
          {!canCheckout.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
          {canCheckout.allowed && !state.anySynced && <span className="text-xs text-plm-fg-muted ml-auto">(download first)</span>}
          {canCheckout.allowed && state.anySynced && counts.checkoutableCount === 0 && <span className="text-xs text-plm-fg-muted ml-auto">(already out)</span>}
        </div>
      ) : (
        <div 
          className={`context-menu-item ${checkoutDisabled ? 'disabled' : ''}`}
          onClick={() => {
            if (!canCheckout.allowed) {
              addToast('error', canCheckout.reason || getPermissionRequirement('checkout'))
              return
            }
            if (!state.anySynced || state.allCheckedOut || !user) return
            onClose()
            executeCommand('checkout', { files: contextFiles }, { onRefresh })
          }}
          title={checkoutReason}
        >
          <ArrowDown size={14} className={checkoutDisabled ? 'text-plm-fg-muted' : 'text-plm-warning'} />
          Check Out {multiSelect ? countLabel : ''}
          {!canCheckout.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
          {canCheckout.allowed && !state.anySynced && <span className="text-xs text-plm-fg-muted ml-auto">(download first)</span>}
          {canCheckout.allowed && state.anySynced && state.allCheckedOut && <span className="text-xs text-plm-fg-muted ml-auto">(already out)</span>}
        </div>
      )}
      
      {/* Check In - only for synced files */}
      {state.anySynced && (
        state.allFolders && !multiSelect ? (
          <div 
            className={`context-menu-item ${checkinDisabled ? 'disabled' : ''}`}
            onClick={() => {
              if (!canCheckin.allowed) {
                addToast('error', canCheckin.reason || getPermissionRequirement('checkin'))
                return
              }
              if (counts.checkinableCount === 0) return
              handleCheckinFolder(firstFile)
              onClose()
            }}
            title={checkinReason}
          >
            <ArrowUp size={14} className={checkinDisabled ? 'text-plm-fg-muted' : 'text-plm-success'} />
            Check In {counts.checkinableCount > 0 ? `${counts.checkinableCount} files` : ''}
            {!canCheckin.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
            {canCheckin.allowed && counts.checkinableCount === 0 && <span className="text-xs text-plm-fg-muted ml-auto">(none checked out)</span>}
          </div>
        ) : (
          <div 
            className={`context-menu-item ${checkinDisabled ? 'disabled' : ''}`}
            onClick={() => {
              if (!canCheckin.allowed) {
                addToast('error', canCheckin.reason || getPermissionRequirement('checkin'))
                return
              }
              if (state.allCheckedIn || counts.checkinableCount === 0 || !user) return
              onClose()
              executeCommand('checkin', { files: contextFiles }, { onRefresh })
            }}
            title={checkinReason}
          >
            <ArrowUp size={14} className={checkinDisabled ? 'text-plm-fg-muted' : 'text-plm-success'} />
            Check In {multiSelect ? countLabel : ''}
            {!canCheckin.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
            {canCheckin.allowed && state.allCheckedIn && <span className="text-xs text-plm-fg-muted ml-auto">(already in)</span>}
            {canCheckin.allowed && !state.allCheckedIn && state.allCheckedOutByOthers && <span className="text-xs text-plm-fg-muted ml-auto">(by others)</span>}
          </div>
        )
      )}
      
      {/* Discard Checkout - for files checked out by current user */}
      {counts.checkinableCount > 0 && (
        <div 
          className={`context-menu-item ${discardDisabled ? 'disabled' : 'text-plm-warning'}`}
          onClick={() => {
            if (!canDiscard.allowed) {
              addToast('error', canDiscard.reason || getPermissionRequirement('discard'))
              return
            }
            onClose()
            executeCommand('discard', { files: contextFiles }, { onRefresh })
          }}
          title={discardDisabled ? discardReason : 'Discard local changes and revert to server version'}
        >
          <Undo2 size={14} />
          Discard Checkout {counts.checkinableCount > 1 ? `(${counts.checkinableCount})` : ''}
          {!canDiscard.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
        </div>
      )}
      
      {/* Admin: Force Release - for files checked out by others */}
      {isAdmin && counts.checkedOutByOthersCount > 0 && (
        <div 
          className={`context-menu-item ${forceReleaseDisabled ? 'disabled' : 'text-plm-error'}`}
          onClick={() => {
            if (!canForceRelease.allowed) {
              addToast('error', canForceRelease.reason || getPermissionRequirement('force-release'))
              return
            }
            onClose()
            executeCommand('force-release', { files: contextFiles }, { onRefresh })
          }}
          title={forceReleaseDisabled ? forceReleaseReason : "Admin: Immediately release checkout. User's unsaved changes will be orphaned."}
        >
          <Unlock size={14} />
          Force Release {counts.checkedOutByOthersCount > 1 ? `(${counts.checkedOutByOthersCount})` : ''}
          {!canForceRelease.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
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
