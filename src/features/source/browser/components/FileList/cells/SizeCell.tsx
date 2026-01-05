/**
 * Size column cell renderer
 */
import { formatFileSize } from '@/lib/utils'
import type { CellRendererBaseProps } from './types'

export function SizeCell({ file }: CellRendererBaseProps): React.ReactNode {
  return file.isDirectory ? '' : formatFileSize(file.size)
}
