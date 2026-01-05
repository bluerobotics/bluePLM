import { memo } from 'react'
import { Upload } from 'lucide-react'

export interface DragOverlayProps {
  currentFolder: string | null
  isVisible: boolean
}

/**
 * Overlay shown when dragging files from outside the app
 */
export const DragOverlay = memo(function DragOverlay({
  currentFolder,
  isVisible
}: DragOverlayProps) {
  if (!isVisible) return null
  
  return (
    <div className="absolute inset-0 z-40 bg-plm-accent/10 border-2 border-dashed border-plm-accent rounded-lg flex items-center justify-center pointer-events-none">
      <div className="bg-plm-bg-light border border-plm-accent rounded-xl p-6 flex flex-col items-center gap-3 shadow-xl">
        <div className="w-16 h-16 rounded-full bg-plm-accent/20 flex items-center justify-center">
          <Upload size={32} className="text-plm-accent" />
        </div>
        <div className="text-lg font-semibold text-plm-fg">Drop to add files</div>
        <div className="text-sm text-plm-fg-muted">
          {currentFolder 
            ? `Files will be added to "${currentFolder.split('/').pop()}"` 
            : 'Files will be added to vault root'}
        </div>
      </div>
    </div>
  )
})
