/**
 * Shared types for context menu action components
 */
import type { LocalFile } from '@/stores/pdmStore'

/**
 * Common props shared by all action components
 */
export interface ActionComponentProps {
  /** Files the context menu is operating on */
  contextFiles: LocalFile[]
  /** Whether multiple files are selected */
  multiSelect: boolean
  /** The first file in the selection */
  firstFile: LocalFile
  /** Callback to close the context menu */
  onClose: () => void
}

/**
 * Props for actions that need refresh capability
 */
export interface RefreshableActionProps extends ActionComponentProps {
  onRefresh: (silent?: boolean) => void
}

/**
 * File selection counts
 */
export interface SelectionCounts {
  fileCount: number
  folderCount: number
  syncedFilesCount: number
  unsyncedFilesCount: number
  checkoutableCount: number
  checkinableCount: number
  checkedOutByOthersCount: number
  cloudOnlyCount: number
}

/**
 * Computed selection state
 */
export interface SelectionState {
  isFolder: boolean
  allFolders: boolean
  allFiles: boolean
  allCloudOnly: boolean
  isSynced: boolean
  anySynced: boolean
  anyUnsynced: boolean
  allCheckedOut: boolean
  allCheckedIn: boolean
  allCheckedOutByOthers: boolean
  canCut: boolean
}
