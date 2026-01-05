import { memo } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import { copyToClipboard } from '@/lib/clipboard'
import { buildFullPath } from '@/lib/utils/path'

export interface PathActionsProps {
  currentPath: string
  vaultPath: string | null
  platform: string
  addToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
}

/**
 * Path action buttons (copy path, open in explorer)
 */
export const PathActions = memo(function PathActions({
  currentPath,
  vaultPath,
  platform,
  addToast
}: PathActionsProps) {
  const handleCopyPath = async () => {
    const fullPath = currentPath 
      ? buildFullPath(vaultPath!, currentPath)
      : vaultPath || ''
    const result = await copyToClipboard(fullPath)
    if (result.success) {
      addToast('success', 'Path copied to clipboard')
    }
  }

  const handleOpenInExplorer = () => {
    if (window.electronAPI && vaultPath) {
      const fullPath = currentPath 
        ? buildFullPath(vaultPath, currentPath)
        : vaultPath
      window.electronAPI.openInExplorer(fullPath)
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={handleCopyPath}
        className="p-1.5 rounded-md text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors"
        title="Copy current path"
      >
        <Copy size={16} />
      </button>
      <button
        onClick={handleOpenInExplorer}
        className="p-1.5 rounded-md text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors"
        title={platform === 'darwin' ? 'Reveal in Finder' : 'Open in Explorer'}
      >
        <ExternalLink size={16} />
      </button>
    </div>
  )
})
