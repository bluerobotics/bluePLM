/**
 * The pinned version of one review item, with its markups. The bytes always come from the stored
 * PDF of that version (`resolveReviewItemPreview`), never the reviewer's local working copy
 * (audit C1/C2). Markups are keyed by (review, round, item); an earlier round's markups are shown
 * read-only, drawn on the PDF of the version that round reviewed, which may be older than the
 * version pinned now.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilePlus2, FileQuestion, Loader2 } from 'lucide-react'

import { CommentSidebar } from '@/features/source/details/components/CommentSidebar'
import {
  PdfAnnotationViewer,
  type AnnotationOverlay,
  type NewAnnotationData,
} from '@/features/source/details/components/PdfAnnotationViewer'
import { executeCommand } from '@/lib/commands'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { resolveReviewItemPreview } from '@/lib/reviewPackage'
import { usePDMStore } from '@/stores/pdmStore'
import type { ReviewItemDetail } from '@/types/reviews'

type Preview = Awaited<ReturnType<typeof resolveReviewItemPreview>>

/** The preview is a file in the review PDF cache, outside the vault `readFile` is confined to. */
function readCachedPdf(filePath: string) {
  const api = window.electronAPI
  return api ? api.reviewPackage.readCachedPdf(filePath) : Promise.resolve(undefined)
}

interface ItemPreviewProps {
  reviewId: string
  item: ReviewItemDetail
  /** The round whose markups are shown. */
  round: number
  /** Markups can be added (current round, open review, requester or reviewer). */
  canMarkup: boolean
}

export function ItemPreview({ reviewId, item, round, canMarkup }: ItemPreviewProps) {
  const annotations = usePDMStore((s) => s.annotations)
  const activeAnnotationId = usePDMStore((s) => s.activeAnnotationId)
  const hoveredAnnotationId = usePDMStore((s) => s.hoveredAnnotationId)
  const setActiveAnnotationId = usePDMStore((s) => s.setActiveAnnotationId)
  const setHoveredAnnotationId = usePDMStore((s) => s.setHoveredAnnotationId)
  const setShowCommentInput = usePDMStore((s) => s.setShowCommentInput)
  const setPendingAnnotation = usePDMStore((s) => s.setPendingAnnotation)
  const clearAnnotations = usePDMStore((s) => s.clearAnnotations)
  const commentsVisible = usePDMStore((s) => s.reviewCommentsVisible)
  const toggleReviewComments = usePDMStore((s) => s.toggleReviewComments)

  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const roundEntry = item.rounds.find((r) => r.roundNumber === round)
  /** The version the shown round reviewed: its PDF is the one the round's markups were made on. */
  const shownVersionId = roundEntry?.fileVersionId ?? item.version.fileVersionId
  const sameVersion = shownVersionId === item.version.fileVersionId
  const markupVersion = roundEntry?.version ?? item.version.version

  useEffect(() => {
    let cancelled = false
    setPreview(null)
    setError(null)
    resolveReviewItemPreview(item, shownVersionId)
      .then((result) => {
        if (!cancelled) setPreview(result)
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        log.warn('[Reviews]', 'Loading the review preview failed', { error: loadError, itemId: item.id })
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
    return () => {
      cancelled = true
    }
    // The shown version and its PDF decide the preview; `attempt` retries after generating.
  }, [item.id, shownVersionId, item.pdf?.storageHash, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  // Annotations are shared store state: leave none behind for the next surface.
  useEffect(() => () => clearAnnotations(), [clearAnnotations])

  const overlays = useMemo<AnnotationOverlay[]>(() => {
    const result: AnnotationOverlay[] = []
    for (const ann of annotations) {
      if (ann.position && ann.page_number != null) {
        result.push({ id: ann.id, pageNumber: ann.page_number, position: ann.position, resolved: ann.resolved })
      }
    }
    return result
  }, [annotations])

  const handleCreate = useCallback(
    (data: NewAnnotationData) => {
      setPendingAnnotation(data)
      setShowCommentInput(true)
      // The comment input lives in the sidebar, so a new markup brings it back.
      if (!usePDMStore.getState().reviewCommentsVisible) toggleReviewComments()
    },
    [setPendingAnnotation, setShowCommentInput, toggleReviewComments],
  )

  const generate = async () => {
    setGenerating(true)
    try {
      await executeCommand('generate-review-pdfs', { fileVersionIds: [shownVersionId] })
      setAttempt((n) => n + 1)
    } finally {
      setGenerating(false)
    }
  }

  const fileName = item.file.fileName
  const editable = canMarkup && sameVersion

  return (
    <div className="flex-1 flex min-h-0 min-w-0">
      <div className={`${commentsVisible ? 'flex-[7]' : 'flex-1'} min-w-0 h-full flex flex-col`}>
        {error ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-plm-error">
            {t('reviewDetail.preview.failed', { message: error })}
          </div>
        ) : !preview ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-plm-fg-muted" />
          </div>
        ) : preview.kind === 'pdf' ? (
          <PdfAnnotationViewer
            key={preview.localPath}
            filePath={preview.localPath}
            readData={readCachedPdf}
            fileName={fileName}
            fileVersion={markupVersion}
            initialScale="page-fit"
            annotations={overlays}
            hoveredAnnotationId={hoveredAnnotationId}
            activeAnnotationId={activeAnnotationId}
            onAnnotationCreate={editable ? handleCreate : undefined}
            onAnnotationClick={setActiveAnnotationId}
            onAnnotationHover={setHoveredAnnotationId}
          />
        ) : preview.kind === 'pdf_pending' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <FileQuestion size={32} className="text-plm-fg-muted/50" />
            <p className="text-sm text-plm-fg">{t('reviewDetail.preview.pending')}</p>
            <p className="text-xs text-plm-fg-muted max-w-sm">{t('reviewDetail.preview.pendingHint')}</p>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-plm-accent/15 text-plm-accent hover:bg-plm-accent/25 disabled:opacity-50"
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <FilePlus2 size={12} />}
              {t('reviewDetail.preview.generate')}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <FileQuestion size={32} className="text-plm-fg-muted/50" />
            <p className="text-sm text-plm-fg">{t('reviewDetail.preview.unsupported')}</p>
            <p className="text-xs text-plm-fg-muted max-w-sm">{t('reviewDetail.preview.unsupportedHint')}</p>
          </div>
        )}
      </div>
      {/* Comments: the top-bar right-pane toggle hides and shows them in the Reviews view */}
      {commentsVisible && (
        <div className="flex-[3] min-w-[220px] max-w-[400px] border-l border-plm-border">
          {!sameVersion && (
            <div className="px-3 py-1.5 text-[10px] text-plm-warning border-b border-plm-border">
              {t('reviewDetail.preview.otherVersion', { version: markupVersion })}
            </div>
          )}
          <CommentSidebar
            fileId={item.fileId}
            fileName={fileName}
            fileVersion={markupVersion}
            review={{ reviewId, round, itemId: item.id }}
            readOnly={!editable}
          />
        </div>
      )}
    </div>
  )
}
