/**
 * Extension column cell renderer
 */
import { useFileBrowserContext } from '../../../context'
import type { CellRendererBaseProps } from './types'

export function ExtensionCell({ file }: CellRendererBaseProps): React.ReactNode {
  const { lowercaseExtensions } = useFileBrowserContext()
  
  if (!file.extension) return ''
  
  const ext = file.extension.replace('.', '')
  // Default to lowercase if setting is undefined
  return lowercaseExtensions !== false ? ext.toLowerCase() : ext.toUpperCase()
}
