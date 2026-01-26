import { useState, useEffect } from 'react'
import { log } from '@/lib/logger'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import { thumbnailCache } from '@/lib/thumbnailCache'
import {
  FileBox,
  Layers,
  FilePen,
  Loader2,
  RefreshCw,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react'

// File type icon
function SWFileIcon({ fileType, size = 16 }: { fileType: string; size?: number }) {
  switch (fileType) {
    case 'Part':
      return <FileBox size={size} className="text-cyan-400" />
    case 'Assembly':
      return <Layers size={size} className="text-amber-400" />
    case 'Drawing':
      return <FilePen size={size} className="text-violet-400" />
    default:
      return <FileBox size={size} className="text-plm-fg-muted" />
  }
}

// SolidWorks service hook
function useSolidWorksService() {
  const [status, setStatus] = useState<{ running: boolean; version?: string; directAccessEnabled?: boolean }>({ running: false })

  const checkStatus = async () => {
    try {
      const result = await window.electronAPI?.solidworks?.getServiceStatus()
      if (result?.success && result.data) {
        setStatus(result.data)
      }
    } catch {
      setStatus({ running: false })
    }
  }

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  return { status, checkStatus }
}

// Main preview panel for SolidWorks files
export function SWDatacardPanel({ file }: { file: LocalFile }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewZoom, setPreviewZoom] = useState(100)
  const [activeConfigName, setActiveConfigName] = useState<string | undefined>(undefined)
  
  const { status } = useSolidWorksService()
  const addToast = usePDMStore(s => s.addToast)
  
  const ext = file.extension?.toLowerCase() || ''
  const fileType = ext === '.sldprt' ? 'Part' : ext === '.sldasm' ? 'Assembly' : 'Drawing'

  // Reset zoom when file changes
  useEffect(() => {
    setPreviewZoom(100)
  }, [file?.path])

  // Load active configuration name
  useEffect(() => {
    const loadActiveConfig = async () => {
      if (!file?.path || !status.running) return
      
      try {
        const result = await window.electronAPI?.solidworks?.getConfigurations(file.path)
        if (result?.success && result.data?.configurations) {
          const configs = result.data.configurations as Array<{ name: string; isActive?: boolean }>
          const active = configs.find(c => c.isActive)
          setActiveConfigName(active?.name)
        }
      } catch (err) {
        log.debug('[SWPreview]', 'Failed to load configurations', { error: err })
      }
    }
    
    loadActiveConfig()
  }, [file?.path, status.running])

  // Load preview - Priority: OLE preview -> SW service -> OS thumbnail
  // Effect 1: Try OLE/thumbnail preview (works for older SW files in CFB format)
  useEffect(() => {
    const loadOlePreview = async () => {
      if (!file?.path) return
      
      setPreviewLoading(true)
      setPreview(null)
      
      try {
        // Try direct OLE preview extraction (works for older SW files)
        const oleResult = await window.electronAPI?.extractSolidWorksPreview?.(file.path)
        if (oleResult?.success && oleResult.data) {
          log.debug('[Preview]', 'Using OLE-extracted preview')
          setPreview(oleResult.data)
          setPreviewLoading(false)
          return
        }
        
        // OLE failed - Fall back to OS thumbnail as immediate fallback (uses cache)
        const thumbData = await thumbnailCache.get(file.path)
        if (thumbData) {
          log.debug('[Preview]', 'Using OS thumbnail fallback')
          setPreview(thumbData)
        }
      } catch (err) {
        log.error('[Preview]', 'Failed to load OLE preview', { error: err })
      } finally {
        setPreviewLoading(false)
      }
    }
    
    loadOlePreview()
  }, [file?.path])
  
  // Effect 2: Try SW service preview when service becomes available AND we don't have a preview
  useEffect(() => {
    const loadServicePreview = async () => {
      if (preview || !file?.path || !status.running) return
      
      log.debug('[Preview]', 'Attempting SW service preview', { fileName: file.name })
      setPreviewLoading(true)
      
      try {
        const previewResult = await window.electronAPI?.solidworks?.getPreview(file.path, activeConfigName)
        if (previewResult?.success && previewResult.data?.imageData) {
          const mimeType = previewResult.data.mimeType || 'image/png'
          log.debug('[Preview]', 'Using SW service preview')
          setPreview(`data:${mimeType};base64,${previewResult.data.imageData}`)
        } else if (previewResult?.error) {
          log.debug('[Preview]', 'SW service preview failed', { error: previewResult.error })
        }
      } catch (err) {
        log.error('[Preview]', 'Failed to load SW service preview', { error: err })
      } finally {
        setPreviewLoading(false)
      }
    }
    
    loadServicePreview()
  }, [file?.path, file?.name, activeConfigName, status.running, preview])

  // Handle mouse wheel zoom on preview
  const handlePreviewWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -10 : 10
    setPreviewZoom(prev => Math.max(50, Math.min(300, prev + delta)))
  }

  // Refresh preview
  const refreshPreview = async () => {
    setPreviewLoading(true)
    setPreview(null)
    try {
      const oleResult = await window.electronAPI?.extractSolidWorksPreview?.(file.path)
      if (oleResult?.success && oleResult.data) {
        setPreview(oleResult.data)
        return
      }
      
      if (status.running) {
        const previewResult = await window.electronAPI?.solidworks?.getPreview(file.path, activeConfigName)
        if (previewResult?.success && previewResult.data?.imageData) {
          const mimeType = previewResult.data.mimeType || 'image/png'
          setPreview(`data:${mimeType};base64,${previewResult.data.imageData}`)
          return
        }
      }
      
      // Fall back to OS thumbnail (uses cache)
      const thumbData = await thumbnailCache.get(file.path)
      if (thumbData) {
        setPreview(thumbData)
      }
    } catch {
      // Silent fail
    } finally {
      setPreviewLoading(false)
    }
  }

  // Open in eDrawings
  const handleOpenInEDrawings = async () => {
    if (!file?.path) return
    try {
      await window.electronAPI?.openInEDrawings(file.path)
    } catch {
      addToast('error', 'Failed to open in eDrawings')
    }
  }

  return (
    <div className="sw-preview-panel h-full flex flex-col">
      {/* Preview area - takes full height */}
      <div 
        className="flex-1 relative rounded-lg overflow-hidden bg-gradient-to-br from-slate-900/50 via-slate-800/50 to-slate-900/50"
        onWheel={handlePreviewWheel}
      >
        {/* Preview content */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {previewLoading ? (
            <Loader2 className="animate-spin text-cyan-400" size={48} />
          ) : preview ? (
            <img 
              src={preview} 
              alt={file.name}
              className="max-w-full max-h-full object-contain transition-transform duration-150"
              style={{ 
                transform: `scale(${previewZoom / 100})`,
                filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))'
              }}
              draggable={false}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-plm-fg-muted">
              <SWFileIcon fileType={fileType} size={64} />
              <span className="text-sm">No preview available</span>
            </div>
          )}
        </div>
        
        {/* Zoom controls - bottom */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
          <button
            onClick={() => setPreviewZoom(prev => Math.max(50, prev - 25))}
            className="p-1 hover:text-cyan-400 text-plm-fg-muted transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-plm-fg-muted w-10 text-center">{previewZoom}%</span>
          <button
            onClick={() => setPreviewZoom(prev => Math.min(300, prev + 25))}
            className="p-1 hover:text-cyan-400 text-plm-fg-muted transition-colors"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setPreviewZoom(100)}
            className="p-1 hover:text-cyan-400 text-plm-fg-muted transition-colors border-l border-white/20 ml-1 pl-2"
            title="Reset zoom"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        
        {/* Refresh button - top right */}
        <button
          onClick={refreshPreview}
          disabled={previewLoading}
          className="absolute top-3 right-3 p-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded text-plm-fg-muted hover:text-white transition-all"
          title="Refresh preview"
        >
          <RefreshCw size={14} className={previewLoading ? 'animate-spin' : ''} />
        </button>
      </div>
      
      {/* Action button */}
      <div className="flex-shrink-0 pt-3">
        <button
          onClick={handleOpenInEDrawings}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded text-sm text-plm-fg-muted hover:text-cyan-400 bg-plm-bg border border-plm-border/50 hover:border-cyan-400/50 transition-colors"
        >
          <ExternalLink size={14} />
          Open in eDrawings
        </button>
      </div>
    </div>
  )
}

export default SWDatacardPanel
