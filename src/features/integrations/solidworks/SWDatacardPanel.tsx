import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { log } from '@/lib/logger'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import { buildThumbnailUrl } from '@/lib/thumbnailUrl'
import { useRetryableImage } from '@/hooks/useRetryableImage'
import {
  FileBox,
  Layers,
  FilePen,
  RefreshCw,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react'

// Zoom bounds for the preview, in percent. 100% = fit-to-view.
const MIN_PREVIEW_ZOOM = 25
const MAX_PREVIEW_ZOOM = 800
const WHEEL_ZOOM_STEP = 15
const BUTTON_ZOOM_STEP = 25

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
  const [status, setStatus] = useState<{
    running: boolean
    version?: string
    directAccessEnabled?: boolean
  }>({ running: false })

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
  const [refreshToken, setRefreshToken] = useState(0)
  const [previewZoom, setPreviewZoom] = useState(100)
  const [activeConfigName, setActiveConfigName] = useState<string | undefined>(undefined)

  // Scrollable preview: the image is rendered at real pixel dimensions (not CSS-scaled) inside an
  // overflow-auto, safe-centered container, so zooming stays as sharp as the source allows and the
  // user can scroll/pan to any part of a zoomed drawing.
  const scrollRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(previewZoom)
  zoomRef.current = previewZoom
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)

  const { status } = useSolidWorksService()
  const addToast = usePDMStore((s) => s.addToast)

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
          const active = configs.find((c) => c.isActive)
          setActiveConfigName(active?.name)
        }
      } catch (error) {
        log.debug('[SWPreview]', 'Failed to load configurations', { error: error })
      }
    }

    loadActiveConfig()
  }, [file?.path, status.running])

  // Preview URL. The main process resolves it against the thumbnail cache,
  // preferring the full-resolution OLE stream and falling back to the Document
  // Manager image, so the ordering that used to live in two effects here is now
  // done once per file version instead of on every mount.
  const previewUrl = useMemo(
    () => buildThumbnailUrl(file, 'preview', { refreshToken, configuration: activeConfigName }),
    [file, refreshToken, activeConfigName],
  )

  const { src: preview, onError: onPreviewError } = useRetryableImage(previewUrl)

  // Re-measure the source image whenever the URL changes (file/config/refresh).
  useEffect(() => {
    setNaturalSize(null)
  }, [previewUrl])

  // Track the available area so 100% means "fit to view".
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Scale that fits the whole image in view (the baseline for 100%). Subtract the container's
  // p-4 padding (16px/side) so a fitted image doesn't spill into it and spawn tiny scrollbars.
  const fitScale = useMemo(() => {
    const availW = containerSize.w - 32
    const availH = containerSize.h - 32
    if (!naturalSize || availW < 10 || availH < 10) return 1
    return Math.min(availW / naturalSize.w, availH / naturalSize.h)
  }, [naturalSize, containerSize])

  // Real pixel size to render the image at for the current zoom.
  const displaySize = useMemo(() => {
    if (!naturalSize) return null
    const s = fitScale * (previewZoom / 100)
    return { w: Math.round(naturalSize.w * s), h: Math.round(naturalSize.h * s) }
  }, [naturalSize, fitScale, previewZoom])

  // Ctrl/Cmd + wheel zooms centered on the cursor; plain wheel scrolls/pans (browser default).
  // Attached natively (not via React onWheel) so preventDefault reliably blocks Electron's app zoom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const rect = el.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      const contentX = el.scrollLeft + cursorX
      const contentY = el.scrollTop + cursorY

      const oldZoom = zoomRef.current
      const delta = e.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP
      const newZoom = Math.max(MIN_PREVIEW_ZOOM, Math.min(MAX_PREVIEW_ZOOM, oldZoom + delta))
      if (newZoom === oldZoom) return

      const ratio = newZoom / oldZoom
      pendingScrollRef.current = {
        left: contentX * ratio - cursorX,
        top: contentY * ratio - cursorY,
      }
      setPreviewZoom(newZoom)
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // Keep the cursor's content point fixed across a zoom change.
  useLayoutEffect(() => {
    const target = pendingScrollRef.current
    const el = scrollRef.current
    if (!target || !el) return
    pendingScrollRef.current = null
    el.scrollLeft = Math.max(0, target.left)
    el.scrollTop = Math.max(0, target.top)
  }, [previewZoom])

  // Discard the cached image and re-extract. Only needed when the stored
  // preview is wrong despite the file being unchanged; an actual edit changes
  // the URL on its own.
  const refreshPreview = () => {
    setRefreshToken(Date.now())
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
      <div className="flex-1 relative rounded-lg overflow-hidden bg-gradient-to-br from-slate-900/50 via-slate-800/50 to-slate-900/50">
        {/* Scrollable, safe-centered preview content. Ctrl+wheel zooms, plain wheel/scrollbars pan. */}
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-auto p-4 [display:grid] [place-items:safe_center]"
        >
          {preview ? (
            <img
              src={preview}
              alt={file.name}
              decoding="async"
              onError={onPreviewError}
              onLoad={(e) =>
                setNaturalSize({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
              style={
                displaySize
                  ? {
                      width: displaySize.w,
                      height: displaySize.h,
                      maxWidth: 'none',
                      maxHeight: 'none',
                      filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))',
                    }
                  : {
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))',
                    }
              }
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
            onClick={() =>
              setPreviewZoom((prev) => Math.max(MIN_PREVIEW_ZOOM, prev - BUTTON_ZOOM_STEP))
            }
            className="p-1 hover:text-cyan-400 text-plm-fg-muted transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-plm-fg-muted w-10 text-center">{previewZoom}%</span>
          <button
            onClick={() =>
              setPreviewZoom((prev) => Math.min(MAX_PREVIEW_ZOOM, prev + BUTTON_ZOOM_STEP))
            }
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
          className="absolute top-3 right-3 p-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded text-plm-fg-muted hover:text-white transition-all"
          title="Refresh preview"
        >
          <RefreshCw size={14} />
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

