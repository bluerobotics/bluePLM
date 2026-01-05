/**
 * Cell renderer - uses strategy pattern to delegate to column-specific components
 */
import type React from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { useFileBrowserContext } from '../../context'

// Import all cell components
import {
  NameCell,
  StateCell,
  RevisionCell,
  VersionCell,
  ItemNumberCell,
  DescriptionCell,
  FileStatusCell,
  CheckedOutByCell,
  EcoTagsCell,
  ExtensionCell,
  SizeCell,
  ModifiedTimeCell,
  CustomCell,
  type CellRendererBaseProps,
} from './cells'

/**
 * Cell renderer lookup table - maps column ID to component
 */
const cellRenderers: Record<string, React.FC<CellRendererBaseProps>> = {
  name: NameCell,
  state: StateCell,
  revision: RevisionCell,
  version: VersionCell,
  itemNumber: ItemNumberCell,
  description: DescriptionCell,
  fileStatus: FileStatusCell,
  checkedOutBy: CheckedOutByCell,
  ecoTags: EcoTagsCell,
  extension: ExtensionCell,
  size: SizeCell,
  modifiedTime: ModifiedTimeCell,
}

export interface CellRendererProps {
  // Per-cell data
  file: LocalFile
  columnId: string
  
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
 * Main cell renderer - delegates to appropriate cell component based on columnId
 */
export function CellRenderer({
  columnId,
  ...props
}: CellRendererProps): React.ReactNode {
  const { customMetadataColumns } = useFileBrowserContext()
  
  // Check if this is a known column
  const Renderer = cellRenderers[columnId]
  if (Renderer) {
    return <Renderer {...props} />
  }
  
  // Check if this is a custom metadata column
  if (columnId.startsWith('custom_')) {
    const columnName = columnId.replace('custom_', '')
    return (
      <CustomCell 
        {...props} 
        columnName={columnName}
        customMetadataColumns={customMetadataColumns}
      />
    )
  }
  
  // Unknown column
  return ''
}
