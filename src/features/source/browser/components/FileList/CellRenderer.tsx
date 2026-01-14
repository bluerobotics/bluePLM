/**
 * Cell renderer - uses strategy pattern to delegate to column-specific components
 * 
 * Props have been simplified from 20+ to just 2 (file, columnId).
 * Cell components now get handlers from FilePaneHandlersContext.
 */
import type React from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { useFilePaneContext } from '../../context'

// Import all cell components
import {
  NameCell,
  StateCell,
  RevisionCell,
  VersionCell,
  ItemNumberCell,
  TabNumberCell,
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
  tabNumber: TabNumberCell,
  description: DescriptionCell,
  fileStatus: FileStatusCell,
  checkedOutBy: CheckedOutByCell,
  ecoTags: EcoTagsCell,
  extension: ExtensionCell,
  size: SizeCell,
  modifiedTime: ModifiedTimeCell,
}

/**
 * Simplified cell renderer props - handlers come from context
 */
export interface CellRendererProps {
  file: LocalFile
  columnId: string
}

/**
 * Main cell renderer - delegates to appropriate cell component based on columnId
 * 
 * Cell components get handlers from FilePaneHandlersContext, eliminating prop drilling.
 */
export function CellRenderer({
  file,
  columnId,
}: CellRendererProps): React.ReactNode {
  const { customMetadataColumns } = useFilePaneContext()
  
  // Check if this is a known column
  const Renderer = cellRenderers[columnId]
  if (Renderer) {
    return <Renderer file={file} />
  }
  
  // Check if this is a custom metadata column
  if (columnId.startsWith('custom_')) {
    const columnName = columnId.replace('custom_', '')
    return (
      <CustomCell 
        file={file}
        columnName={columnName}
        customMetadataColumns={customMetadataColumns}
      />
    )
  }
  
  // Unknown column
  return ''
}
