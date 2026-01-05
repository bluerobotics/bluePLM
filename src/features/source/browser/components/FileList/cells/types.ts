/**
 * Shared types for cell renderer components
 */
import type React from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import type { FileMetadataColumn } from '@/types/database'

/**
 * Common props passed to all cell renderers
 */
export interface CellRendererBaseProps {
  file: LocalFile
  
  // Handlers
  handleRename: () => void
  isBeingProcessed: (path: string) => boolean
  getFolderCheckoutStatus: (path: string) => 'mine' | 'others' | 'both' | null
  isFolderSynced: (path: string) => boolean
  isFileEditable: (file: LocalFile) => boolean
  
  // Config handlers
  canHaveConfigs: (file: LocalFile) => boolean
  toggleFileConfigExpansion: (file: LocalFile) => void
  hasPendingConfigChanges: (file: LocalFile) => boolean
  savingConfigsToSW: Set<string>
  saveConfigsToSWFile: (file: LocalFile) => void
  
  // Inline editing handlers
  handleSaveCellEdit: () => void
  handleCancelCellEdit: () => void
  handleStartCellEdit: (file: LocalFile, column: string) => void
  
  // Selected file lists
  selectedDownloadableFiles: LocalFile[]
  selectedUploadableFiles: LocalFile[]
  selectedCheckoutableFiles: LocalFile[]
  selectedCheckinableFiles: LocalFile[]
  selectedUpdatableFiles: LocalFile[]
  
  // Inline action handlers
  handleInlineDownload: (e: React.MouseEvent, file: LocalFile) => void
  handleInlineUpload: (e: React.MouseEvent, file: LocalFile) => void
  handleInlineCheckout: (e: React.MouseEvent, file: LocalFile) => void
  handleInlineCheckin: (e: React.MouseEvent, file: LocalFile) => void
}

/**
 * Cell renderer component type
 */
export type CellRendererComponent = React.FC<CellRendererBaseProps>

/**
 * Custom column props
 */
export interface CustomCellProps extends CellRendererBaseProps {
  columnName: string
  customMetadataColumns: FileMetadataColumn[]
}
