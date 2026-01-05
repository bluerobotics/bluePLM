/**
 * Shared types for cell renderer components
 * 
 * Cell components now get handlers from FilePaneHandlersContext,
 * so these props are simplified to just the file data.
 */
import type React from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import type { FileMetadataColumn } from '@/types/database'

/**
 * Simplified base props for cell renderers
 * Cells get handlers from useFilePaneHandlers() hook
 */
export interface CellRendererBaseProps {
  file: LocalFile
}

/**
 * Cell renderer component type
 */
export type CellRendererComponent = React.FC<CellRendererBaseProps>

/**
 * Custom column props - extends base with column-specific data
 */
export interface CustomCellProps extends CellRendererBaseProps {
  columnName: string
  customMetadataColumns: FileMetadataColumn[]
}
