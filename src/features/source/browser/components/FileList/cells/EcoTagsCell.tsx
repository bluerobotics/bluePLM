/**
 * ECO Tags column cell renderer
 */
import type { CellRendererBaseProps } from './types'

export function EcoTagsCell({ file }: CellRendererBaseProps): React.ReactNode {
  if (file.isDirectory) return null
  
  const ecoTags = file.pdmData?.eco_tags || []
  
  if (ecoTags.length === 0) {
    return <span className="text-plm-text/40">-</span>
  }
  
  return (
    <div className="flex flex-wrap gap-1 overflow-hidden">
      {ecoTags.map((tag: string, i: number) => (
        <span 
          key={i}
          className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 whitespace-nowrap"
          title={tag}
        >
          {tag}
        </span>
      ))}
    </div>
  )
}
