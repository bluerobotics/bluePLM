/**
 * ReviewPreviewPane - Full-screen PDF viewer for the Reviews view.
 *
 * When a user double-clicks a review row, this component fills the entire
 * main content area with the PdfAnnotationViewer + CommentSidebar, reusing
 * the same annotation pipeline from the DetailsPanel.
 *
 * Includes a compact toolbar at the top with a back button and file name.
 */

import { useCallback, useEffect, useMemo } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import {
  PdfAnnotationViewer,
  type AnnotationOverlay,
  type NewAnnotationData,
} from '@/features/source/details/components/PdfAnnotationViewer'
import { CommentSidebar } from '@/features/source/details/components/CommentSidebar'

export function ReviewPreviewPane() {
  const reviewPreviewFile = usePDMStore(s => s.reviewPreviewFile)
  const clearReviewPreviewFile = usePDMStore(s => s.clearReviewPreviewFile)

  // Annotation store selectors
  const annotations = usePDMStore(s => s.annotations)
  const setActiveAnnotationId = usePDMStore(s => s.setActiveAnnotationId)
  const setShowCommentInput = usePDMStore(s => s.setShowCommentInput)
  const setPendingAnnotation = usePDMStore(s => s.setPendingAnnotation)
  const clearAnnotations = usePDMStore(s => s.clearAnnotations)

  // Clear annotations when the preview file changes or unmounts
  useEffect(() => {
    return () => {
      clearAnnotations()
    }
  }, [reviewPreviewFile?.filePath, clearAnnotations])

  // Map store annotations to AnnotationOverlay[] for the PDF viewer
  const overlays = useMemo<AnnotationOverlay[]>(() => {
    const result: AnnotationOverlay[] = []
    for (const ann of annotations) {
      if (ann.position && ann.page_number != null) {
        result.push({
          id: ann.id,
          pageNumber: ann.page_number,
          position: ann.position,
          resolved: ann.resolved,
        })
      }
      for (const reply of ann.replies ?? []) {
        if (reply.position && reply.page_number != null) {
          result.push({
            id: reply.id,
            pageNumber: reply.page_number,
            position: reply.position,
            resolved: reply.resolved,
          })
        }
      }
    }
    return result
  }, [annotations])

  // When user selects an area on the PDF, open the comment input
  const handleAnnotationCreate = useCallback(
    (data: NewAnnotationData) => {
      setPendingAnnotation(data)
      setShowCommentInput(true)
    },
    [setPendingAnnotation, setShowCommentInput],
  )

  // When user clicks an existing annotation overlay, highlight it in the sidebar
  const handleAnnotationClick = useCallback(
    (annotationId: string) => {
      setActiveAnnotationId(annotationId)
    },
    [setActiveAnnotationId],
  )

  const handleBack = useCallback(() => {
    clearReviewPreviewFile()
  }, [clearReviewPreviewFile])

  if (!reviewPreviewFile) return null

  const { filePath, fileId, fileName, fileVersion } = reviewPreviewFile

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Compact toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-plm-border bg-plm-sidebar shrink-0">
        <button
          onClick={handleBack}
          className="p-1 rounded hover:bg-plm-accent/10 text-plm-fg-muted hover:text-plm-fg transition-colors"
          title="Back to reviews list"
        >
          <ArrowLeft size={16} />
        </button>
        <FileText size={14} className="text-plm-accent flex-shrink-0" />
        <span className="text-xs font-medium text-plm-fg truncate">{fileName}</span>
        {fileVersion != null && (
          <span className="text-[10px] text-plm-fg-muted flex-shrink-0 bg-plm-bg-light px-1.5 py-0.5 rounded">
            v{fileVersion}
          </span>
        )}
      </div>

      {/* PDF Viewer + Comment Sidebar */}
      <div className="flex-1 flex min-h-0">
        {/* PDF Viewer */}
        <div className={fileId ? 'flex-[7] min-w-0' : 'w-full'}>
          <PdfAnnotationViewer
            filePath={filePath}
            fileName={fileName}
            fileVersion={fileVersion ?? undefined}
            annotations={overlays}
            onAnnotationCreate={fileId ? handleAnnotationCreate : undefined}
            onAnnotationClick={fileId ? handleAnnotationClick : undefined}
          />
        </div>

        {/* Comment Sidebar - only when file has a database ID */}
        {fileId && (
          <div className="flex-[3] min-w-[220px] max-w-[400px] border-l border-plm-border">
            <CommentSidebar
              fileId={fileId}
              fileName={fileName}
              fileVersion={fileVersion ?? undefined}
            />
          </div>
        )}
      </div>
    </div>
  )
}
