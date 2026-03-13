/**
 * PdfAnnotationViewer — Direct pdf.js rendering with annotation support.
 *
 * Renders each page as canvas + TextLayer using pdfjs-dist directly.
 * No wrapper library, no patches. Chrome-level rendering quality via
 * HiDPI-aware canvas sizing and pdf.js TextLayer for crisp text selection.
 */

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, memo } from 'react'
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'

import { log } from '@/lib/logger'
import {
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Columns,
  Eye,
  ExternalLink,
  MousePointerSquareDashed,
} from 'lucide-react'

GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'

// ============================================================================
// Types (public API — unchanged from previous implementation)
// ============================================================================

export type PdfScaleValue = number | 'page-width' | 'page-fit' | 'auto'

export interface NewAnnotationData {
  pageNumber: number
  position: {
    x: number
    y: number
    width: number
    height: number
    pageWidth: number
    pageHeight: number
  }
  selectedText?: string
  annotationType: 'area' | 'text' | 'highlight'
}

export interface AnnotationOverlay {
  id: string
  pageNumber: number
  position: {
    x: number
    y: number
    width: number
    height: number
    pageWidth: number
    pageHeight: number
  }
  color?: string
  resolved?: boolean
}

export interface PdfAnnotationViewerProps {
  filePath: string
  fileName: string
  fileVersion?: number
  onAnnotationCreate?: (annotation: NewAnnotationData) => void
  onAnnotationClick?: (annotationId: string) => void
  onAnnotationHover?: (annotationId: string | null) => void
  annotations?: AnnotationOverlay[]
  pendingAnnotation?: NewAnnotationData | null
  hoveredAnnotationId?: string | null
  activeAnnotationId?: string | null
  initialScale?: PdfScaleValue
}

// ============================================================================
// Constants
// ============================================================================

const RESOLVED_OPACITY = 0.3
const SCROLLBAR_WIDTH = 15
const PAGE_GAP = 8
const MIN_SCALE = 0.1
const MAX_SCALE = 5

// ============================================================================
// Helpers
// ============================================================================

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

type FitMode = 'width' | 'page' | null

// ============================================================================
// AnnotationBoxOverlay — percentage-positioned, scale-independent
// ============================================================================

function AnnotationBoxOverlay({
  position,
  color = 'rgba(59, 130, 246, 0.8)',
  isHovered = false,
  isActive = false,
  isPending = false,
  opacity = 1,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  position: { x: number; y: number; width: number; height: number; pageWidth: number; pageHeight: number }
  color?: string
  isHovered?: boolean
  isActive?: boolean
  isPending?: boolean
  opacity?: number
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const interactive = !isPending

  return (
    <div
      data-annotation-overlay
      style={{
        position: 'absolute',
        left: `${(position.x / position.pageWidth) * 100}%`,
        top: `${(position.y / position.pageHeight) * 100}%`,
        width: `${(position.width / position.pageWidth) * 100}%`,
        height: `${(position.height / position.pageHeight) * 100}%`,
        border: isActive
          ? '2px solid rgba(59, 130, 246, 1)'
          : `2px solid ${color}`,
        background: color.replace(/[\d.]+\)$/, '0.15)'),
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: interactive ? 'pointer' : 'default',
        zIndex: isActive || isHovered ? 5 : 4,
        opacity,
        transition: 'outline 0.15s, box-shadow 0.15s, border-color 0.15s',
        ...(isActive
          ? {
              outline: '2px solid rgba(59, 130, 246, 1)',
              outlineOffset: '2px',
              boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.3), 0 0 12px rgba(59, 130, 246, 0.4)',
            }
          : isHovered
            ? {
                outline: '2px solid rgba(59, 130, 246, 0.9)',
                outlineOffset: '1px',
                boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)',
              }
            : {}),
      }}
      onClick={interactive ? onClick : undefined}
      onMouseEnter={interactive ? onMouseEnter : undefined}
      onMouseLeave={interactive ? onMouseLeave : undefined}
    />
  )
}

// ============================================================================
// PdfPage — canvas + text layer + annotation overlays + area selection
// ============================================================================

interface PdfPageProps {
  page: PDFPageProxy
  scale: number
  annotations: AnnotationOverlay[]
  pendingAnnotation?: NewAnnotationData | null
  hoveredAnnotationId?: string | null
  activeAnnotationId?: string | null
  areaSelectActive: boolean
  onAnnotationCreate?: (annotation: NewAnnotationData) => void
  onAnnotationClick?: (annotationId: string) => void
  onAnnotationHover?: (annotationId: string | null) => void
}

const PdfPage = memo(function PdfPage({
  page,
  scale,
  annotations,
  pendingAnnotation,
  hoveredAnnotationId,
  activeAnnotationId,
  areaSelectActive,
  onAnnotationCreate,
  onAnnotationClick,
  onAnnotationHover,
}: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textDivRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const textLayerRef = useRef<InstanceType<typeof TextLayer> | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [selRect, setSelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const pageNumber = page.pageNumber
  const unscaledVp = useMemo(() => page.getViewport({ scale: 1 }), [page])
  const viewport = useMemo(() => page.getViewport({ scale }), [page, scale])

  // Lazy rendering via IntersectionObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '500px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Canvas rendering — HiDPI aware
  useEffect(() => {
    if (!isVisible || !canvasRef.current) return

    renderTaskRef.current?.cancel()

    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const task = page.render({ canvasContext: ctx, viewport })
    renderTaskRef.current = task
    task.promise.catch(() => {})

    return () => { task.cancel() }
  }, [isVisible, viewport, page])

  // Text layer rendering
  useEffect(() => {
    if (!isVisible || !textDivRef.current) return

    textLayerRef.current?.cancel()
    const container = textDivRef.current
    container.replaceChildren()

    let cancelled = false

    page.getTextContent().then((textContent) => {
      if (cancelled || !textDivRef.current) return
      const tl = new TextLayer({
        textContentSource: textContent,
        container: textDivRef.current,
        viewport,
      })
      textLayerRef.current = tl
      tl.render().catch(() => {})
    })

    return () => {
      cancelled = true
      textLayerRef.current?.cancel()
    }
  }, [isVisible, viewport, page])

  // Area selection via capture-phase listener (works for both Alt+drag and area-select mode)
  useEffect(() => {
    const el = containerRef.current
    if (!el || !onAnnotationCreate) return

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (!areaSelectActive && !e.altKey) return
      if ((e.target as HTMLElement).closest('[data-annotation-overlay]')) return

      e.preventDefault()
      e.stopPropagation()

      const rect = el.getBoundingClientRect()
      const startX = e.clientX - rect.left
      const startY = e.clientY - rect.top

      const handleMove = (ev: MouseEvent) => {
        const mx = Math.max(0, Math.min(ev.clientX - rect.left, viewport.width))
        const my = Math.max(0, Math.min(ev.clientY - rect.top, viewport.height))
        setSelRect({
          x: Math.min(startX, mx),
          y: Math.min(startY, my),
          w: Math.abs(mx - startX),
          h: Math.abs(my - startY),
        })
      }

      const handleUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
        setSelRect(null)

        const mx = Math.max(0, Math.min(ev.clientX - rect.left, viewport.width))
        const my = Math.max(0, Math.min(ev.clientY - rect.top, viewport.height))
        const x1 = Math.min(startX, mx)
        const y1 = Math.min(startY, my)
        const w = Math.abs(mx - startX)
        const h = Math.abs(my - startY)

        if (w < 5 || h < 5) return

        onAnnotationCreate({
          pageNumber,
          position: {
            x: x1 / scale,
            y: y1 / scale,
            width: w / scale,
            height: h / scale,
            pageWidth: unscaledVp.width,
            pageHeight: unscaledVp.height,
          },
          annotationType: 'area',
        })
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    }

    el.addEventListener('mousedown', handleMouseDown, { capture: true })
    return () => el.removeEventListener('mousedown', handleMouseDown, { capture: true })
  }, [areaSelectActive, onAnnotationCreate, pageNumber, scale, viewport.width, viewport.height, unscaledVp.width, unscaledVp.height])

  const pageAnnotations = useMemo(
    () => annotations.filter((a) => a.pageNumber === pageNumber),
    [annotations, pageNumber],
  )

  const pagePending = pendingAnnotation?.pageNumber === pageNumber ? pendingAnnotation : null

  return (
    <div
      ref={containerRef}
      data-page-number={pageNumber}
      className="pdf-page"
      style={{
        width: Math.floor(viewport.width),
        height: Math.floor(viewport.height),
        position: 'relative',
        marginBottom: PAGE_GAP,
        background: 'white',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        cursor: areaSelectActive ? 'crosshair' : undefined,
      }}
    >
      {isVisible && (
        <>
          <canvas ref={canvasRef} style={{ display: 'block', position: 'absolute', inset: 0 }} />
          <div ref={textDivRef} className="pdf-text-layer" />

          {pageAnnotations.map((ann) => (
            <AnnotationBoxOverlay
              key={ann.id}
              position={ann.position}
              color={ann.color}
              isHovered={hoveredAnnotationId === ann.id}
              isActive={activeAnnotationId === ann.id}
              opacity={ann.resolved ? RESOLVED_OPACITY : 1}
              onClick={() => onAnnotationClick?.(ann.id)}
              onMouseEnter={() => onAnnotationHover?.(ann.id)}
              onMouseLeave={() => onAnnotationHover?.(null)}
            />
          ))}

          {pagePending && (
            <AnnotationBoxOverlay
              position={pagePending.position}
              color="rgba(59, 130, 246, 0.8)"
              isPending
            />
          )}

          {selRect && selRect.w > 0 && selRect.h > 0 && (
            <div
              style={{
                position: 'absolute',
                left: selRect.x,
                top: selRect.y,
                width: selRect.w,
                height: selRect.h,
                border: '2px dashed rgba(59, 130, 246, 0.8)',
                background: 'rgba(59, 130, 246, 0.1)',
                pointerEvents: 'none',
                zIndex: 11,
              }}
            />
          )}
        </>
      )}
    </div>
  )
})

// ============================================================================
// ZoomToolbar
// ============================================================================

function ZoomToolbar({
  scale,
  fitMode,
  onScaleChange,
  onFitWidth,
  onFitPage,
  areaSelectActive,
  onAreaSelectToggle,
}: {
  scale: number
  fitMode: FitMode
  onScaleChange: (scale: number) => void
  onFitWidth: () => void
  onFitPage: () => void
  areaSelectActive: boolean
  onAreaSelectToggle: () => void
}) {
  const displayPercent = useMemo(() => {
    if (fitMode === 'width') return 'Width'
    if (fitMode === 'page') return 'Fit'
    return `${Math.round(scale * 100)}%`
  }, [scale, fitMode])

  return (
    <div className="flex items-center justify-center gap-1 py-1.5 px-2 border-t border-plm-border bg-plm-panel">
      <button
        onClick={onAreaSelectToggle}
        className={`p-1 rounded transition-colors ${
          areaSelectActive
            ? 'bg-plm-accent/20 text-plm-accent'
            : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light'
        }`}
        title={areaSelectActive ? 'Disable area selection (Alt+Drag)' : 'Enable area selection'}
        aria-label="Toggle area selection"
        aria-pressed={areaSelectActive}
      >
        <MousePointerSquareDashed size={15} />
      </button>

      <div className="w-px h-4 bg-plm-border mx-1" />

      <button
        onClick={() => onScaleChange(Math.max(scale - 0.25, MIN_SCALE))}
        className="p-1 rounded text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light transition-colors disabled:opacity-30"
        title="Zoom out (Ctrl+-)"
        aria-label="Zoom out"
        disabled={scale <= MIN_SCALE}
      >
        <ZoomOut size={15} />
      </button>

      <span className="text-xs text-plm-fg-muted w-12 text-center select-none tabular-nums">
        {displayPercent}
      </span>

      <button
        onClick={() => onScaleChange(Math.min(scale + 0.25, MAX_SCALE))}
        className="p-1 rounded text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light transition-colors disabled:opacity-30"
        title="Zoom in (Ctrl++)"
        aria-label="Zoom in"
        disabled={scale >= MAX_SCALE}
      >
        <ZoomIn size={15} />
      </button>

      <div className="w-px h-4 bg-plm-border mx-1" />

      <button
        onClick={onFitWidth}
        className={`p-1 rounded transition-colors ${
          fitMode === 'width'
            ? 'bg-plm-accent/20 text-plm-accent'
            : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light'
        }`}
        title="Fit to width"
        aria-label="Fit to width"
      >
        <Columns size={15} />
      </button>

      <button
        onClick={onFitPage}
        className={`p-1 rounded transition-colors ${
          fitMode === 'page'
            ? 'bg-plm-accent/20 text-plm-accent'
            : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light'
        }`}
        title="Fit to page"
        aria-label="Fit to page"
      >
        <Maximize size={15} />
      </button>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function PdfAnnotationViewer({
  filePath,
  fileName: _fileName,
  fileVersion,
  onAnnotationCreate,
  onAnnotationClick,
  onAnnotationHover,
  annotations = [],
  pendingAnnotation,
  hoveredAnnotationId,
  activeAnnotationId,
  initialScale,
}: PdfAnnotationViewerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<PDFPageProxy[]>([])
  const [scale, setScale] = useState(1)
  const [fitMode, setFitMode] = useState<FitMode>(initialScale === 'page-fit' ? 'page' : 'width')
  const [areaSelectActive, setAreaSelectActive] = useState(!!onAnnotationCreate)
  const [localPending, setLocalPending] = useState<NewAnnotationData | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pdfAreaRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null)

  // ── Load PDF bytes and create document ──────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let task: ReturnType<typeof getDocument> | null = null

    setLoading(true)
    setError(null)
    setPages([])

    const load = async () => {
      const result = await window.electronAPI?.readFile(filePath)
      if (cancelled) return

      if (!result?.success || !result.data) {
        setError('Failed to read PDF file from disk.')
        log.error('[PdfViewer]', 'readFile failed', { filePath, success: result?.success })
        setLoading(false)
        return
      }

      task = getDocument({ data: base64ToUint8Array(result.data) })
      const doc = await task.promise
      if (cancelled) { doc.destroy(); return }

      const ps = await Promise.all(
        Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1)),
      )
      if (cancelled) { doc.destroy(); return }

      docRef.current?.destroy()
      docRef.current = doc
      setPages(ps)
      setLoading(false)
    }

    load().catch((err) => {
      if (cancelled) return
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Failed to load PDF: ${msg}`)
      log.error('[PdfViewer]', 'PDF load error', { filePath, error: err })
      setLoading(false)
    })

    return () => {
      cancelled = true
      task?.destroy()
    }
  }, [filePath, fileVersion])

  // Cleanup document on unmount
  useEffect(() => () => { docRef.current?.destroy() }, [])

  // ── Compute fit scale ──────────────────────────────────────────────────
  const computeFitScale = useCallback(
    (mode: 'width' | 'page'): number | null => {
      if (pages.length === 0) return null
      const container = pdfAreaRef.current
      if (!container || container.clientWidth < 10 || container.clientHeight < 10) return null

      const uv = pages[0].getViewport({ scale: 1 })
      const availW = container.clientWidth - SCROLLBAR_WIDTH
      const availH = container.clientHeight

      const s =
        mode === 'width'
          ? availW / uv.width
          : Math.min(availW / uv.width, availH / uv.height)

      return Math.round(Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)) * 100) / 100
    },
    [pages],
  )

  // ── Initial fit scale (once pages are ready) ──────────────────────────
  useEffect(() => {
    if (pages.length === 0) return

    if (typeof initialScale === 'number') {
      setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, initialScale)))
      setFitMode(null)
      return
    }

    const mode: 'width' | 'page' = initialScale === 'page-fit' ? 'page' : 'width'
    const s = computeFitScale(mode)
    if (s) {
      setScale(s)
      setFitMode(mode)
    }
  }, [pages, initialScale, computeFitScale])

  // ── Auto-refit on container resize ─────────────────────────────────────
  useEffect(() => {
    const container = pdfAreaRef.current
    if (!container || pages.length === 0) return

    let lastW = container.clientWidth
    let lastH = container.clientHeight

    const observer = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (Math.abs(w - lastW) < 5 && Math.abs(h - lastH) < 5) return
      lastW = w
      lastH = h

      const fm = fitMode
      if (!fm) return
      const s = computeFitScale(fm)
      if (s) setScale(s)
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [pages, fitMode, computeFitScale])

  // ── Apply pending scroll correction after scale change ─────────────────
  useLayoutEffect(() => {
    const target = pendingScrollRef.current
    const scrollEl = scrollRef.current
    if (!target || !scrollEl) return
    pendingScrollRef.current = null
    scrollEl.scrollLeft = Math.max(0, target.left)
    scrollEl.scrollTop = Math.max(0, target.top)
  }, [scale])

  // ── Keyboard zoom (viewport-centered) ──────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const zoom = (delta: number) => {
        e.preventDefault()
        const scrollEl = scrollRef.current
        if (scrollEl) {
          const cx = scrollEl.clientWidth / 2
          const cy = scrollEl.clientHeight / 2
          const contentX = scrollEl.scrollLeft + cx
          const contentY = scrollEl.scrollTop + cy
          const oldScale = scaleRef.current
          const newScale = Math.round(Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale + delta)) * 100) / 100
          if (newScale === oldScale) return
          const ratio = newScale / oldScale
          pendingScrollRef.current = { left: contentX * ratio - cx, top: contentY * ratio - cy }
          setFitMode(null)
          setScale(newScale)
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        zoom(0.25)
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        zoom(-0.25)
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        const s = computeFitScale('page')
        if (s) { setScale(s); setFitMode('page') }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [computeFitScale])

  // ── Ctrl+wheel zoom (cursor-centered) ──────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const scrollEl = scrollRef.current
      if (!scrollEl) return

      const rect = scrollEl.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      const contentX = scrollEl.scrollLeft + cursorX
      const contentY = scrollEl.scrollTop + cursorY

      const oldScale = scaleRef.current
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const newScale = Math.round(Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale + delta)) * 100) / 100
      if (newScale === oldScale) return

      const ratio = newScale / oldScale
      pendingScrollRef.current = {
        left: contentX * ratio - cursorX,
        top: contentY * ratio - cursorY,
      }

      setFitMode(null)
      setScale(newScale)
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // ── Fit-to-width / Fit-to-page handlers ────────────────────────────────
  const handleFitWidth = useCallback(() => {
    const s = computeFitScale('width')
    if (s) { setScale(s); setFitMode('width') }
  }, [computeFitScale])

  const handleFitPage = useCallback(() => {
    const s = computeFitScale('page')
    if (s) { setScale(s); setFitMode('page') }
  }, [computeFitScale])

  // ── Annotation creation wrapper (local pending for immediate feedback) ──
  const handleAnnotationCreate = useCallback(
    (data: NewAnnotationData) => {
      setLocalPending(data)
      onAnnotationCreate?.(data)
    },
    [onAnnotationCreate],
  )

  useEffect(() => {
    if (!pendingAnnotation) setLocalPending(null)
  }, [pendingAnnotation])

  const effectivePending = localPending ?? pendingAnnotation

  // ── Text selection → annotation creation ───────────────────────────────
  useEffect(() => {
    if (!onAnnotationCreate || areaSelectActive) return
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const handleMouseUp = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return

      const range = sel.getRangeAt(0)
      const startNode =
        range.startContainer instanceof HTMLElement
          ? range.startContainer
          : range.startContainer.parentElement
      if (!startNode) return

      const pageEl = startNode.closest('[data-page-number]') as HTMLElement | null
      if (!pageEl || !scrollEl.contains(pageEl)) return

      const pageNum = parseInt(pageEl.dataset.pageNumber || '0', 10)
      if (!pageNum || pageNum < 1 || pageNum > pages.length) return

      const rangeRect = range.getBoundingClientRect()
      const pageRect = pageEl.getBoundingClientRect()
      const currentScale = scaleRef.current

      const uv = pages[pageNum - 1].getViewport({ scale: 1 })
      const x = (rangeRect.left - pageRect.left) / currentScale
      const y = (rangeRect.top - pageRect.top) / currentScale
      const w = rangeRect.width / currentScale
      const h = rangeRect.height / currentScale

      if (w < 2 || h < 2) return

      const data: NewAnnotationData = {
        pageNumber: pageNum,
        position: { x, y, width: w, height: h, pageWidth: uv.width, pageHeight: uv.height },
        selectedText: sel.toString(),
        annotationType: 'text',
      }

      setLocalPending(data)
      onAnnotationCreate(data)
      sel.removeAllRanges()
    }

    scrollEl.addEventListener('mouseup', handleMouseUp)
    return () => scrollEl.removeEventListener('mouseup', handleMouseUp)
  }, [onAnnotationCreate, areaSelectActive, pages])

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-plm-fg-muted">
          <Loader2 className="animate-spin" size={20} />
          <span>Loading PDF...</span>
        </div>
      </div>
    )
  }

  if (error || pages.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-sm text-plm-fg-muted text-center">
          <Eye size={48} className="mx-auto mb-4 opacity-30" />
          <div>{error || 'Failed to load PDF'}</div>
          <button
            onClick={() => window.electronAPI?.openFile(filePath)}
            className="btn btn-secondary gap-2 mt-4"
          >
            <ExternalLink size={14} />
            Open Externally
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col min-h-0">
      <div ref={pdfAreaRef} className="flex-1 min-h-0 relative">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-auto"
          style={{ background: 'var(--plm-bg-light)' }}
        >
          <div className="flex flex-col items-center py-2">
            {pages.map((page) => (
              <PdfPage
                key={page.pageNumber}
                page={page}
                scale={scale}
                annotations={annotations}
                pendingAnnotation={effectivePending}
                hoveredAnnotationId={hoveredAnnotationId}
                activeAnnotationId={activeAnnotationId}
                areaSelectActive={areaSelectActive}
                onAnnotationCreate={onAnnotationCreate ? handleAnnotationCreate : undefined}
                onAnnotationClick={onAnnotationClick}
                onAnnotationHover={onAnnotationHover}
              />
            ))}
          </div>
        </div>
      </div>

      <ZoomToolbar
        scale={scale}
        fitMode={fitMode}
        onScaleChange={(s) => { setFitMode(null); setScale(s) }}
        onFitWidth={handleFitWidth}
        onFitPage={handleFitPage}
        areaSelectActive={areaSelectActive}
        onAreaSelectToggle={() => setAreaSelectActive((prev) => !prev)}
      />
    </div>
  )
}
