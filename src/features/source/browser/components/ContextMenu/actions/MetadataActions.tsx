/**
 * Metadata actions for SolidWorks files in context menu
 * Provides "Refresh Metadata" option to extract metadata from local/synced files
 */
import { useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import type { RefreshableActionProps } from './types'
import { useSolidWorksStatus } from '@/hooks/useSolidWorksStatus'
import { executeCommand } from '@/lib/commands'

export function MetadataActions({
  contextFiles,
  multiSelect,
  firstFile,
  onClose,
  onRefresh,
}: RefreshableActionProps) {
  const { status } = useSolidWorksStatus()
  const swServiceRunning = status.running && status.dmApiAvailable
  const [isRefreshing, setIsRefreshing] = useState(false)

  const ext = firstFile.extension?.toLowerCase() || ''
  const isSolidWorksFile = ['.sldprt', '.sldasm', '.slddrw'].includes(ext)

  // Only show for SolidWorks files
  if (!isSolidWorksFile) {
    return null
  }

  // For multi-select, only show if all files are SolidWorks files
  if (multiSelect) {
    const allSwFiles = contextFiles.every(f => {
      const fExt = f.extension?.toLowerCase() || ''
      return ['.sldprt', '.sldasm', '.slddrw'].includes(fExt)
    })
    if (!allSwFiles) return null
  }

  // Filter to only SolidWorks files
  const swFiles = contextFiles.filter(f => {
    const fExt = f.extension?.toLowerCase() || ''
    return ['.sldprt', '.sldasm', '.slddrw'].includes(fExt)
  })

  const handleRefreshMetadata = async () => {
    if (!swServiceRunning || isRefreshing) return
    
    setIsRefreshing(true)
    onClose()
    
    try {
      await executeCommand('refresh-local-metadata', { files: swFiles }, { onRefresh })
    } finally {
      setIsRefreshing(false)
    }
  }

  const fileCount = swFiles.length
  const countLabel = fileCount > 1 ? ` (${fileCount})` : ''

  return (
    <>
      <div 
        className={`context-menu-item ${!swServiceRunning || isRefreshing ? 'opacity-50' : ''}`}
        onClick={handleRefreshMetadata}
        title={!swServiceRunning ? 'SolidWorks service not running' : 'Read metadata from file'}
      >
        {isRefreshing ? (
          <Loader2 size={14} className="animate-spin text-plm-info" />
        ) : (
          <RefreshCw size={14} className="text-plm-info" />
        )}
        Refresh Metadata{countLabel}
      </div>
    </>
  )
}
