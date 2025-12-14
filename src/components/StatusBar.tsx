import { usePDMStore } from '../stores/pdmStore'
import { Cloud, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

export function StatusBar() {
  const { 
    vaultPath, 
    isVaultConnected, 
    connectedVaults,
    statusMessage,
    isLoading,
    vaultName
  } = usePDMStore()
  
  const [appVersion, setAppVersion] = useState('')
  const [zoomFactor, setZoomFactor] = useState(1)
  
  useEffect(() => {
    window.electronAPI?.getVersion().then(v => setAppVersion(v))
    window.electronAPI?.getZoomFactor?.().then(z => setZoomFactor(z || 1))
  }, [])
  
  const handleZoomIn = useCallback(async () => {
    const newZoom = Math.min(2.0, zoomFactor + 0.1)
    const result = await window.electronAPI?.setZoomFactor?.(newZoom)
    if (result?.success && result.factor) {
      setZoomFactor(result.factor)
    }
  }, [zoomFactor])
  
  const handleZoomOut = useCallback(async () => {
    const newZoom = Math.max(0.5, zoomFactor - 0.1)
    const result = await window.electronAPI?.setZoomFactor?.(newZoom)
    if (result?.success && result.factor) {
      setZoomFactor(result.factor)
    }
  }, [zoomFactor])
  
  const handleResetZoom = useCallback(async () => {
    const result = await window.electronAPI?.setZoomFactor?.(1)
    if (result?.success && result.factor) {
      setZoomFactor(result.factor)
    }
  }, [])

  // Check if any vault is connected (legacy or multi-vault)
  const hasVaultConnected = isVaultConnected || connectedVaults.length > 0
  
  // Get display name from connected vaults or legacy
  const displayName = connectedVaults.length > 0 
    ? (connectedVaults.length === 1 ? connectedVaults[0].name : `${connectedVaults.length} vaults`)
    : (vaultName || vaultPath?.split(/[/\\]/).pop() || 'vault')

  // Show minimal status bar when no vault connected (splash screens)
  if (!hasVaultConnected) {
    return (
      <div className="bg-plm-activitybar border-t border-plm-border flex items-center justify-end px-3 py-[2px] text-xs text-plm-fg-dim select-none flex-shrink-0">
        <span className="text-plm-fg-muted">v{appVersion || '...'}</span>
      </div>
    )
  }

  return (
    <div className="bg-plm-activitybar border-t border-plm-border flex items-center justify-between px-3 py-[2px] text-xs text-plm-fg-dim select-none flex-shrink-0">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Vault status */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Cloud size={12} className="text-plm-success" />
          <span className="text-plm-fg-dim">
            Connected to {displayName}
          </span>
        </div>

        {/* Status message */}
        {statusMessage && (
          <span className={`truncate ${isLoading ? 'animate-pulse' : ''}`}>
            {statusMessage}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        {/* Zoom level control */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-0.5 rounded hover:bg-plm-bg-lighter text-plm-fg-muted hover:text-plm-fg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={handleResetZoom}
            className="text-plm-fg-dim hover:text-plm-fg transition-colors text-[10px] min-w-[36px] text-center"
            title="Reset Zoom (100%)"
          >
            {Math.round(zoomFactor * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-0.5 rounded hover:bg-plm-bg-lighter text-plm-fg-muted hover:text-plm-fg transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={12} />
          </button>
        </div>
        
        {/* Separator */}
        <div className="w-px h-3 bg-plm-border" />
        
        {/* App version */}
        <span className="text-plm-fg-muted text-[10px]">v{appVersion || '...'}</span>
      </div>
    </div>
  )
}
