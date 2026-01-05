/**
 * Size column cell renderer
 */
import { formatFileSize } from '@/types/pdm'
import type { CellRendererBaseProps } from './types'

export function SizeCell({ file }: CellRendererBaseProps): React.ReactNode {
  return file.isDirectory ? '' : formatFileSize(file.size)
}
