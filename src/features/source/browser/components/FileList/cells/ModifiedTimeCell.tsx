/**
 * Modified Time column cell renderer
 */
import { format } from 'date-fns'
import type { CellRendererBaseProps } from './types'

export function ModifiedTimeCell({ file }: CellRendererBaseProps): React.ReactNode {
  if (!file.modifiedTime) return '-'
  
  try {
    const date = new Date(file.modifiedTime)
    if (isNaN(date.getTime())) return '-'
    return format(date, 'MMM d, yyyy HH:mm')
  } catch {
    return '-'
  }
}
