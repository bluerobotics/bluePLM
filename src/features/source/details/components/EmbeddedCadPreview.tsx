import type { LocalFile } from '@/stores/pdmStore'
import { SWDatacardPanel } from '@/features/integrations/solidworks'

import { hasLocalCadPreviewContent, supportsSolidWorksDatacard } from './cadPreviewCapabilities'
import { EDrawingsEmbeddedPreview } from './EDrawingsEmbeddedPreview'

interface EmbeddedCadPreviewProps {
  file: LocalFile
  onOpenExternal: () => void
}

/** Keeps the SolidWorks configuration controls available beside the native preview. */
export function EmbeddedCadPreview({ file, onOpenExternal }: EmbeddedCadPreviewProps) {
  const hasLocalContent = hasLocalCadPreviewContent(file.diffStatus)
  const showSolidWorksDatacard = supportsSolidWorksDatacard(file.extension)

  return (
    <div className="h-full min-h-0 flex gap-3">
      <EDrawingsEmbeddedPreview
        fileName={file.name}
        filePath={file.path}
        hasLocalContent={hasLocalContent}
        onOpenExternal={onOpenExternal}
      />
      {showSolidWorksDatacard && (
        <aside className="w-72 flex-shrink-0 min-h-0">
          <SWDatacardPanel file={file} />
        </aside>
      )}
    </div>
  )
}
