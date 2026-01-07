/**
 * Collaboration actions for context menu (review, notify, watch, share, ECO)
 */
import { 
  ArrowDown, 
  ClipboardList, 
  Eye, 
  EyeOff, 
  History, 
  Info, 
  Link, 
  Loader2, 
  Network,
  RefreshCw, 
  Send, 
  Users 
} from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'
import type { RefreshableActionProps, SelectionState } from './types'

interface CollaborationActionsProps extends RefreshableActionProps {
  state: SelectionState
  setDetailsPanelTab: (tab: 'properties' | 'history' | 'whereused') => void
  setDetailsPanelVisible: (visible: boolean) => void
  handleOpenReviewModal: (file: LocalFile) => void
  handleOpenCheckoutRequestModal: (file: LocalFile) => void
  handleOpenMentionModal: (file: LocalFile) => void
  handleOpenECOModal: (file: LocalFile) => void
  watchingFiles: Set<string>
  isTogglingWatch: boolean
  handleToggleWatch: (file: LocalFile) => void
  isCreatingShareLink: boolean
  handleQuickShareLink: (file: LocalFile) => void
}

export function CollaborationActions({
  contextFiles,
  multiSelect,
  firstFile,
  onClose,
  onRefresh,
  state,
  setDetailsPanelTab,
  setDetailsPanelVisible,
  handleOpenReviewModal,
  handleOpenCheckoutRequestModal,
  handleOpenMentionModal,
  handleOpenECOModal,
  watchingFiles,
  isTogglingWatch,
  handleToggleWatch,
  isCreatingShareLink,
  handleQuickShareLink,
}: CollaborationActionsProps) {
  const { user, files, addToast } = usePDMStore()
  const isFolder = firstFile.isDirectory

  // Check for SolidWorks files
  const swExtensions = ['.sldprt', '.sldasm', '.slddrw']
  const assemblyExtensions = ['.sldasm']
  const isSWFile = !isFolder && state.isSynced && swExtensions.includes(firstFile.extension.toLowerCase())
  const isAssemblyFile = !isFolder && state.isSynced && assemblyExtensions.includes(firstFile.extension.toLowerCase())
  
  // For folders, check for SW files inside
  const getSwFilesInFolder = () => {
    if (!isFolder || multiSelect) return []
    const folderPath = firstFile.relativePath
    return files.filter(f => 
      !f.isDirectory && 
      f.relativePath.startsWith(folderPath + '/') &&
      swExtensions.includes(f.extension.toLowerCase()) &&
      f.pdmData?.id
    )
  }
  const swFilesInFolder = getSwFilesInFolder()
  
  // Get assembly files in folder (for Extract References)
  const getAssemblyFilesInFolder = () => {
    if (!isFolder || multiSelect) return []
    const folderPath = firstFile.relativePath
    return files.filter(f => 
      !f.isDirectory && 
      f.relativePath.startsWith(folderPath + '/') &&
      assemblyExtensions.includes(f.extension.toLowerCase()) &&
      f.pdmData?.id
    )
  }
  const assemblyFilesInFolder = getAssemblyFilesInFolder()
  
  // Get synced assembly files from selection (for multi-select)
  const getAssemblyFilesInSelection = () => {
    if (!multiSelect) return []
    return contextFiles.filter(f => 
      !f.isDirectory && 
      assemblyExtensions.includes(f.extension.toLowerCase()) &&
      f.pdmData?.id
    )
  }
  const assemblyFilesInSelection = getAssemblyFilesInSelection()

  return (
    <>
      <div className="context-menu-separator" />
      
      {/* Show History - for folders */}
      {!multiSelect && isFolder && (
        <div 
          className="context-menu-item"
          onClick={() => {
            onClose()
            setDetailsPanelTab('history')
            setDetailsPanelVisible(true)
          }}
        >
          <History size={14} />
          Show History
        </div>
      )}
      
      {/* View History / Where Used - for synced files */}
      {!isFolder && state.isSynced && (
        <>
          <div 
            className="context-menu-item"
            onClick={() => {
              onClose()
              setDetailsPanelTab('history')
              setDetailsPanelVisible(true)
            }}
          >
            <History size={14} />
            View History
          </div>
          <div 
            className="context-menu-item"
            onClick={() => {
              onClose()
              setDetailsPanelTab('whereused')
              setDetailsPanelVisible(true)
            }}
          >
            <Link size={14} />
            Where Used
          </div>
        </>
      )}
      
      {/* Properties */}
      <div 
        className="context-menu-item"
        onClick={() => {
          onClose()
          setDetailsPanelTab('properties')
          setDetailsPanelVisible(true)
        }}
      >
        <Info size={14} />
        Properties
      </div>
      
      {/* Refresh Metadata - for synced SW files or folders containing them */}
      {isSWFile && (
        <div 
          className="context-menu-item"
          onClick={() => {
            onClose()
            executeCommand('sync-sw-metadata', { files: multiSelect ? contextFiles : [firstFile] }, { onRefresh })
          }}
        >
          <RefreshCw size={14} className="text-plm-accent" />
          Refresh Metadata
        </div>
      )}
      {isFolder && !multiSelect && swFilesInFolder.length > 0 && (
        <div 
          className="context-menu-item"
          onClick={() => {
            onClose()
            executeCommand('sync-sw-metadata', { files: swFilesInFolder }, { onRefresh })
          }}
        >
          <RefreshCw size={14} className="text-plm-accent" />
          Refresh Metadata ({swFilesInFolder.length} files)
        </div>
      )}
      
      {/* Extract References - for synced assembly files */}
      {isAssemblyFile && (
        <div 
          className="context-menu-item"
          onClick={() => {
            onClose()
            executeCommand('extract-references', { files: [firstFile] }, { onRefresh })
          }}
          title="Extract and store assembly component references to enable Contains/Where-Used queries"
        >
          <Network size={14} className="text-plm-accent" />
          Extract References
        </div>
      )}
      {/* Extract References - for multi-select with assemblies */}
      {multiSelect && assemblyFilesInSelection.length > 0 && (
        <div 
          className="context-menu-item"
          onClick={() => {
            onClose()
            executeCommand('extract-references', { files: assemblyFilesInSelection }, { onRefresh })
          }}
          title="Extract and store assembly component references to enable Contains/Where-Used queries"
        >
          <Network size={14} className="text-plm-accent" />
          Extract References ({assemblyFilesInSelection.length} {assemblyFilesInSelection.length === 1 ? 'assembly' : 'assemblies'})
        </div>
      )}
      {/* Extract References - for folders containing assemblies */}
      {isFolder && !multiSelect && assemblyFilesInFolder.length > 0 && (
        <div 
          className="context-menu-item"
          onClick={() => {
            onClose()
            executeCommand('extract-references', { files: assemblyFilesInFolder }, { onRefresh })
          }}
          title="Extract and store assembly component references for all assemblies in this folder"
        >
          <Network size={14} className="text-plm-accent" />
          Extract References ({assemblyFilesInFolder.length} {assemblyFilesInFolder.length === 1 ? 'assembly' : 'assemblies'})
        </div>
      )}
      
      {/* Request Review - for synced files */}
      {!multiSelect && !isFolder && state.isSynced && firstFile.pdmData?.id && (
        <div 
          className="context-menu-item"
          onClick={() => handleOpenReviewModal(firstFile)}
        >
          <Send size={14} className="text-plm-accent" />
          Request Review
        </div>
      )}
      
      {/* Request Checkout - for files checked out by others */}
      {!multiSelect && !isFolder && state.isSynced && firstFile.pdmData?.checked_out_by && firstFile.pdmData.checked_out_by !== user?.id && (
        <div 
          className="context-menu-item"
          onClick={() => handleOpenCheckoutRequestModal(firstFile)}
        >
          <ArrowDown size={14} className="text-plm-warning" />
          Request Checkout
        </div>
      )}
      
      {/* Notify Someone - for synced files */}
      {!multiSelect && !isFolder && state.isSynced && firstFile.pdmData?.id && (
        <div 
          className="context-menu-item"
          onClick={() => handleOpenMentionModal(firstFile)}
        >
          <Users size={14} className="text-plm-fg-dim" />
          Notify Someone
        </div>
      )}
      
      {/* Watch/Unwatch File - for synced files */}
      {!multiSelect && !isFolder && state.isSynced && firstFile.pdmData?.id && (
        <div 
          className={`context-menu-item ${isTogglingWatch ? 'opacity-50' : ''}`}
          onClick={() => handleToggleWatch(firstFile)}
        >
          {isTogglingWatch ? (
            <Loader2 size={14} className="animate-spin" />
          ) : watchingFiles.has(firstFile.pdmData.id) ? (
            <EyeOff size={14} className="text-plm-fg-muted" />
          ) : (
            <Eye size={14} className="text-plm-accent" />
          )}
          {watchingFiles.has(firstFile.pdmData!.id) ? 'Stop Watching' : 'Watch File'}
        </div>
      )}
      
      {/* Copy Share Link - for synced files and folders */}
      {!multiSelect && (state.isSynced || isFolder) && (
        <div 
          className={`context-menu-item ${isCreatingShareLink ? 'opacity-50' : ''}`}
          onClick={() => {
            if (isFolder) {
              addToast('info', 'Folder sharing coming soon! For now, share individual files.')
              onClose()
            } else if (!isCreatingShareLink && firstFile.pdmData?.id) {
              handleQuickShareLink(firstFile)
            }
          }}
        >
          {isCreatingShareLink ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Link size={14} className="text-plm-accent" />
          )}
          Copy Share Link
        </div>
      )}
      
      {/* Add to ECO - for synced files */}
      {!multiSelect && !isFolder && state.isSynced && firstFile.pdmData?.id && (
        <div 
          className="context-menu-item"
          onClick={() => handleOpenECOModal(firstFile)}
        >
          <ClipboardList size={14} className="text-plm-fg-dim" />
          Add to ECO
        </div>
      )}
    </>
  )
}
