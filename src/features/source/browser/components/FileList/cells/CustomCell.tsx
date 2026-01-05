/**
 * Custom metadata column cell renderer
 */
import { format } from 'date-fns'
import type { CustomCellProps } from './types'

export function CustomCell({ file, columnName, customMetadataColumns }: CustomCellProps): React.ReactNode {
  const customValue = file.pdmData?.custom_properties?.[columnName]
  
  if (customValue === null || customValue === undefined) {
    return <span className="text-plm-fg-muted/50">—</span>
  }
  
  // Find the column definition for type-specific formatting
  const columnDef = customMetadataColumns.find(c => c.name === columnName)
  
  if (columnDef?.data_type === 'boolean') {
    return customValue === 'true' || customValue === 'Yes' || customValue === '1' ? (
      <span className="text-plm-success">Yes</span>
    ) : (
      <span className="text-plm-fg-muted">No</span>
    )
  }
  
  if (columnDef?.data_type === 'date' && customValue) {
    try {
      const date = new Date(customValue as string)
      if (!isNaN(date.getTime())) {
        return format(date, 'MMM d, yyyy')
      }
    } catch {
      // Fall through to default display
    }
  }
  
  return String(customValue)
}
