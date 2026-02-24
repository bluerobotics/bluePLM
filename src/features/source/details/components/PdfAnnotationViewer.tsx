/**
 * PdfAnnotationViewer - Enterprise PDF viewer with annotation support.
 *
 * Replaces the iframe-based PDF preview with react-pdf-highlighter-plus,
 * enabling area/text highlights, zoom controls, and annotation overlays.
 *
 * Loads PDF data from the local filesystem via Electron IPC, converts
 * base64 to a Uint8Array for pdf.js consumption, and renders using the
 * PdfLoader → PdfHighlighter component tree.
 *
 * Annotation position data is emitted via callbacks so parent components
 * can handle persistence (e.g. saving to Supabase).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  PdfLoader,
  PdfHighlighter,
  TextHighlight,
  AreaHighlight,
  useHighlightContainerContext,
} from 'react-pdf-highlighter-plus'
import type {
  Highlight,
  PdfSelection,
  ScaledPosition,
  PdfScaleValue,
  PdfHighlighterUtils,
  Scaled,
} from 'react-pdf-highlighter-plus'
import 'react-pdf-highlighter-plus/style/style.css'

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

// ============================================================================
// Types
// ============================================================================

/**
 * Simplified, storage-friendly annotation position data.
 * Emitted when a user creates a new annotation (area select or text select).
 * The parent component is responsible for persisting this to the database.
 */
export interface NewAnnotationData {
  /** 1-indexed page number */
  pageNumber: number
  /** Position in page coordinate space */
  position: {
    x: number
    y: number
    width: number
    height: number
    /** Page width at time of creation (for ratio-based scaling) */
    pageWidth: number
    /** Page height at time of creation (for ratio-based scaling) */
    pageHeight: number
  }
  /** Selected text content, if this was a text selection */
  selectedText?: string
  /** The type of annotation */
  annotationType: 'area' | 'text' | 'highlight'
}

/**
 * An existing annotation overlay to render on the PDF.
 * These come from the database and are displayed as colored rectangles.
 */
export interface AnnotationOverlay {
  id: string
  /** 1-indexed page number */
  pageNumber: number
  /** Position in page coordinate space */
  position: {
    x: number
    y: number
    width: number
    height: number
    pageWidth: number
    pageHeight: number
  }
  /** Highlight color (CSS color string). Defaults to accent blue. */
  color?: string
  /** Whether this annotation has been resolved. Renders at reduced opacity. */
  resolved?: boolean
}

/** Props for the PdfAnnotationViewer component */
export interface PdfAnnotationViewerProps {
  /** Absolute path to the PDF file on disk */
  filePath: string
  /** Display name of the file */
  fileName: string
  /** Current file version (for cache-busting on version changes) */
  fileVersion?: number
  /** Called when the user creates a new annotation via area or text selection */
  onAnnotationCreate?: (annotation: NewAnnotationData) => void
  /** Called when the user clicks an existing annotation overlay */
  onAnnotationClick?: (annotationId: string) => void
  /** Existing annotations to display as overlays */
  annotations?: AnnotationOverlay[]
}

// ============================================================================
// Constants
// ============================================================================

/** pdf.js worker URL matching the installed pdfjs-dist version */
const PDFJS_WORKER_SRC = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'

/** Reduced opacity multiplier for resolved annotations */
const RESOLVED_OPACITY = 0.3

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a base64 string to a Uint8Array for pdf.js consumption.
 * This avoids creating a data URL (which can hit size limits for large PDFs).
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * Convert our simplified AnnotationOverlay position to the library's
 * ScaledPosition format used by react-pdf-highlighter-plus.
 */
function overlayToScaledPosition(overlay: AnnotationOverlay): ScaledPosition {
  const { position, pageNumber } = overlay
  const boundingRect: Scaled = {
    x1: position.x,
    y1: position.y,
    x2: position.x + position.width,
    y2: position.y + position.height,
    width: position.pageWidth,
    height: position.pageHeight,
    pageNumber,
  }
  return {
    boundingRect,
    rects: [boundingRect],
  }
}

/**
 * Convert a ScaledPosition from the library back to our simplified position format.
 */
function scaledPositionToAnnotation(
  position: ScaledPosition,
  selectedText?: string,
  annotationType: 'area' | 'text' | 'highlight' = 'area',
): NewAnnotationData {
  const { boundingRect } = position
  return {
    pageNumber: boundingRect.pageNumber,
    position: {
      x: boundingRect.x1,
      y: boundingRect.y1,
      width: boundingRect.x2 - boundingRect.x1,
      height: boundingRect.y2 - boundingRect.y1,
      pageWidth: boundingRect.width,
      pageHeight: boundingRect.height,
    },
    selectedText,
    annotationType,
  }
}

/**
 * Convert our AnnotationOverlay array to the Highlight format used by the library.
 */
function overlaysToHighlights(overlays: AnnotationOverlay[]): Array<Highlight & { color?: string; resolved?: boolean }> {
  return overlays.map((overlay) => ({
    id: overlay.id,
    type: 'area' as const,
    position: overlayToScaledPosition(overlay),
    color: overlay.color,
    resolved: overlay.resolved,
  }))
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Renders individual highlights within the PdfHighlighter context.
 * This is the child of PdfHighlighter and uses the highlight container context
 * hook to access the current highlight data and viewport conversion utilities.
 */
function HighlightContainer({
  onAnnotationClick,
}: {
  onAnnotationClick?: (annotationId: string) => void
}) {
  const {
    highlight,
    isScrolledTo,
  } = useHighlightContainerContext<Highlight & { color?: string; resolved?: boolean }>()

  const isResolved = highlight.resolved === true
  const opacity = isResolved ? RESOLVED_OPACITY : 1

  const handleClick = useCallback(() => {
    onAnnotationClick?.(highlight.id)
  }, [highlight.id, onAnnotationClick])

  if (highlight.type === 'text') {
    return (
      <div style={{ opacity }} onClick={handleClick}>
        <TextHighlight
          isScrolledTo={isScrolledTo}
          highlight={highlight}
        />
      </div>
    )
  }

  // Area highlight (default)
  return (
    <div
      style={{ opacity, cursor: 'pointer' }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Annotation ${highlight.id}${isResolved ? ' (resolved)' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <AreaHighlight
        isScrolledTo={isScrolledTo}
        highlight={highlight}
        onChange={() => {
          // Area highlights are read-only for now; resize is not supported
        }}
      />
    </div>
  )
}

/**
 * Zoom toolbar rendered at the bottom of the viewer.
 * Provides zoom in/out, fit-width, fit-page, and area select toggle.
 */
function ZoomToolbar({
  scale,
  onScaleChange,
  areaSelectActive,
  onAreaSelectToggle,
}: {
  scale: PdfScaleValue
  onScaleChange: (scale: PdfScaleValue) => void
  areaSelectActive: boolean
  onAreaSelectToggle: () => void
}) {
  /** Compute display percentage from the current scale value */
  const displayPercent = useMemo(() => {
    if (typeof scale === 'number') {
      return `${Math.round(scale * 100)}%`
    }
    // Named scales don't have a numeric value; show the label
    switch (scale) {
      case 'page-width': return 'Width'
      case 'page-fit': return 'Fit'
      case 'auto': return 'Auto'
      default: return String(scale)
    }
  }, [scale])

  const handleZoomIn = useCallback(() => {
    const current = typeof scale === 'number' ? scale : 1
    onScaleChange(Math.min(current + 0.25, 5))
  }, [scale, onScaleChange])

  const handleZoomOut = useCallback(() => {
    const current = typeof scale === 'number' ? scale : 1
    onScaleChange(Math.max(current - 0.25, 0.25))
  }, [scale, onScaleChange])

  const handleFitWidth = useCallback(() => {
    onScaleChange('page-width')
  }, [onScaleChange])

  const handleFitPage = useCallback(() => {
    onScaleChange('page-fit')
  }, [onScaleChange])

  return (
    <div className="flex items-center justify-center gap-1 py-1.5 px-2 border-t border-plm-border bg-plm-panel">
      {/* Area select toggle */}
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

      {/* Zoom controls */}
      <button
        onClick={handleZoomOut}
        className="p-1 rounded text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light transition-colors disabled:opacity-30"
        title="Zoom out (Ctrl+-)"
        aria-label="Zoom out"
        disabled={typeof scale === 'number' && scale <= 0.25}
      >
        <ZoomOut size={15} />
      </button>

      <span className="text-xs text-plm-fg-muted w-12 text-center select-none tabular-nums">
        {displayPercent}
      </span>

      <button
        onClick={handleZoomIn}
        className="p-1 rounded text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light transition-colors disabled:opacity-30"
        title="Zoom in (Ctrl++)"
        aria-label="Zoom in"
        disabled={typeof scale === 'number' && scale >= 5}
      >
        <ZoomIn size={15} />
      </button>

      <div className="w-px h-4 bg-plm-border mx-1" />

      {/* Fit controls */}
      <button
        onClick={handleFitWidth}
        className={`p-1 rounded transition-colors ${
          scale === 'page-width'
            ? 'bg-plm-accent/20 text-plm-accent'
            : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light'
        }`}
        title="Fit to width"
        aria-label="Fit to width"
      >
        <Columns size={15} />
      </button>

      <button
        onClick={handleFitPage}
        className={`p-1 rounded transition-colors ${
          scale === 'page-fit'
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

/**
 * PdfAnnotationViewer renders a PDF with annotation overlay support.
 *
 * It loads the PDF from the local filesystem via Electron IPC, converts
 * the base64 data to a Uint8Array, and renders using react-pdf-highlighter-plus.
 *
 * @example
 * ```tsx
 * <PdfAnnotationViewer
 *   filePath={file.path}
 *   fileName={file.name}
 *   fileVersion={file.pdmData?.version}
 *   annotations={existingAnnotations}
 *   onAnnotationCreate={(data) => console.log('New annotation', data)}
 *   onAnnotationClick={(id) => console.log('Clicked', id)}
 * />
 * ```
 */
export function PdfAnnotationViewer({
  filePath,
  fileName: _fileName,
  fileVersion,
  onAnnotationCreate,
  onAnnotationClick,
  annotations = [],
}: PdfAnnotationViewerProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState<PdfScaleValue>('auto')
  const [areaSelectActive, setAreaSelectActive] = useState(!!onAnnotationCreate)

  // Ref to track the current file path for stale-response prevention
  const currentPathRef = useRef(filePath)

  // Ref to the library's utils for imperative viewer control
  const highlighterUtilsRef = useRef<PdfHighlighterUtils | null>(null)

  // ── PDF Loading ────────────────────────────────────────────────────────
  useEffect(() => {
    currentPathRef.current = filePath
    let cancelled = false

    const loadPdf = async () => {
      setLoading(true)
      setError(null)
      setPdfData(null)

      try {
        const result = await window.electronAPI?.readFile(filePath)

        // Guard against stale responses (user switched files)
        if (cancelled || currentPathRef.current !== filePath) return

        if (!result?.success || !result.data) {
          setError('Failed to read PDF file from disk.')
          log.error('[PdfViewer]', 'readFile failed', { filePath, success: result?.success })
          return
        }

        const bytes = base64ToUint8Array(result.data)
        setPdfData(bytes)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setError(`Failed to load PDF: ${message}`)
        log.error('[PdfViewer]', 'PDF load error', { filePath, error: err })
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadPdf()

    return () => {
      cancelled = true
    }
  }, [filePath, fileVersion])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when not in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setScale((prev) => {
          const current = typeof prev === 'number' ? prev : 1
          return Math.min(current + 0.25, 5)
        })
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        setScale((prev) => {
          const current = typeof prev === 'number' ? prev : 1
          return Math.max(current - 0.25, 0.25)
        })
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        setScale('auto')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ── Imperative zoom ───────────────────────────────────────────────────
  // The library only applies pdfScaleValue on init/resize, not on prop change.
  // Work around this by setting currentScaleValue on the viewer directly.
  useEffect(() => {
    const viewer = highlighterUtilsRef.current?.getViewer()
    if (viewer) {
      viewer.currentScaleValue = scale.toString()
    }
  }, [scale])

  // ── Convert annotation overlays to Highlight objects ────────────────────
  const highlights = useMemo(
    () => overlaysToHighlights(annotations),
    [annotations],
  )

  // ── Area selection handler ─────────────────────────────────────────────
  const enableAreaSelection = useCallback(
    (event: MouseEvent) => {
      // Enable area selection either when Alt is held or when area select mode is active
      return event.altKey || areaSelectActive
    },
    [areaSelectActive],
  )

  // ── Selection finished handler ─────────────────────────────────────────
  const handleSelection = useCallback(
    (selection: PdfSelection) => {
      if (!onAnnotationCreate) return

      const ghost = selection.makeGhostHighlight()
      const hasText = Boolean(ghost.content?.text)

      const annotationData = scaledPositionToAnnotation(
        ghost.position,
        ghost.content?.text,
        hasText ? 'text' : 'area',
      )

      onAnnotationCreate(annotationData)
    },
    [onAnnotationCreate],
  )

  // ── Document init parameters for PdfLoader ─────────────────────────────
  // Memoize to prevent PdfLoader from re-loading on every render.
  // The `data` key is the Uint8Array. We pass it as DocumentInitParameters.
  const documentParams = useMemo(() => {
    if (!pdfData) return null
    return { data: pdfData.slice() } // slice() to create a transferable copy
  }, [pdfData])

  // ── Render ─────────────────────────────────────────────────────────────

  // Loading state
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

  // Error state with fallback
  if (error || !documentParams) {
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
    <div className="w-full h-full flex flex-col min-h-0">
      {/* PDF Viewer */}
      <div className="flex-1 min-h-0 relative">
        <PdfLoader
          document={documentParams}
          workerSrc={PDFJS_WORKER_SRC}
          beforeLoad={() => (
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex items-center gap-2 text-plm-fg-muted">
                <Loader2 className="animate-spin" size={20} />
                <span>Rendering PDF...</span>
              </div>
            </div>
          )}
          errorMessage={(err) => (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-sm text-plm-fg-muted text-center">
                <Eye size={48} className="mx-auto mb-4 opacity-30" />
                <div>PDF rendering failed: {err.message}</div>
                <button
                  onClick={() => window.electronAPI?.openFile(filePath)}
                  className="btn btn-secondary gap-2 mt-4"
                >
                  <ExternalLink size={14} />
                  Open Externally
                </button>
              </div>
            </div>
          )}
        >
          {(pdfDocument) => (
            <PdfHighlighter
              pdfDocument={pdfDocument}
              highlights={highlights}
              pdfScaleValue={scale}
              enableAreaSelection={enableAreaSelection}
              onSelection={handleSelection}
              areaSelectionMode={areaSelectActive}
              utilsRef={(utils) => { highlighterUtilsRef.current = utils }}
            >
              <HighlightContainer onAnnotationClick={onAnnotationClick} />
            </PdfHighlighter>
          )}
        </PdfLoader>
      </div>

      {/* Zoom Toolbar */}
      <ZoomToolbar
        scale={scale}
        onScaleChange={setScale}
        areaSelectActive={areaSelectActive}
        onAreaSelectToggle={() => setAreaSelectActive((prev) => !prev)}
      />
    </div>
  )
}
