/**
 * The "Reviews" submenu for a file or a multi-selection, in the primary section of both context-menu
 * systems (file list and explorer tree) so they cannot drift apart:
 *
 *   Reviews ▸ New review…
 *             Add to review ▸      the unsent package being built, then open reviews you requested
 *             Remove from review ▸ the unsent package and open reviews holding one of the files
 *             View reviews
 *
 * Open reviews are looked up when the submenu opens (`listOpenReviewsForFiles`), never cached.
 */

import { useEffect, useRef, useState } from 'react'
import {
  ClipboardCheck,
  ListChecks,
  Loader2,
  MinusCircle,
  PackagePlus,
  PlusCircle,
  Send,
} from 'lucide-react'

import { ContextSubmenu } from '@/features/source/browser/components/ContextMenu/components'
import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { listOpenReviewsForFiles } from '@/lib/supabase/reviews'
import { usePDMStore } from '@/stores/pdmStore'
import { selectReviewPackageDraft } from '@/stores/slices/reviewsSlice'
import type { LocalFile } from '@/stores/types'
import type { OpenReviewForFiles } from '@/types/reviews'

import {
  addFilesToOpenReview,
  addFilesToReviewPackage,
  removeFilesFromOpenReview,
  removeFilesFromReviewPackage,
} from '../addToPackage'
import { reviewableFiles } from '../lib/localCopy'
import { reviewMenuTargets } from '../lib/reviewMenuTargets'

interface ReviewsSubmenuProps {
  contextFiles: LocalFile[]
  onClose: () => void
}

type Open = 'none' | 'root' | 'add' | 'remove'

/** Hover-open with a short grace period, like the other context submenus. */
function useHover(setOpen: (fn: (o: Open) => Open) => void, level: Exclude<Open, 'none'>) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return {
    onMouseEnter: () => {
      if (timer.current) clearTimeout(timer.current)
      // Entering a nested submenu keeps it open; re-entering the root does not close a nested one.
      setOpen((o) => (level === 'root' && o !== 'none' ? o : level))
    },
    onMouseLeave: () => {
      // The nested submenus are DOM children of the root item, so leaving the root leaves them all.
      timer.current = setTimeout(
        () => setOpen((o) => (level === 'root' ? 'none' : o === level ? 'root' : o)),
        150,
      )
    },
  }
}

export function ReviewsSubmenu({ contextFiles, onClose }: ReviewsSubmenuProps) {
  const draft = usePDMStore(selectReviewPackageDraft)
  const setActiveView = usePDMStore((s) => s.setActiveView)
  const [open, setOpen] = useState<Open>('none')
  const [reviews, setReviews] = useState<OpenReviewForFiles[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const reviewable = reviewableFiles(contextFiles)
  const fileIds = reviewable.map((f) => f.pdmData?.id).filter((id): id is string => !!id)
  const fileKey = fileIds.join(',')
  const rootOpen = open !== 'none'

  // Load once per opening of the submenu.
  useEffect(() => {
    if (!rootOpen || fileIds.length === 0) return
    let cancelled = false
    setReviews(null)
    setLoadFailed(false)
    listOpenReviewsForFiles(fileIds)
      .then((rows) => {
        if (!cancelled) setReviews(rows)
      })
      .catch((error: unknown) => {
        log.warn('[Reviews]', 'Listing open reviews for the context menu failed', { error })
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [rootOpen, fileKey]) // eslint-disable-line react-hooks/exhaustive-deps -- fileKey stands for fileIds

  const rootHover = useHover(setOpen, 'root')
  const addHover = useHover(setOpen, 'add')
  const removeHover = useHover(setOpen, 'remove')

  if (reviewable.length === 0) return null

  const targets = reviewMenuTargets(fileIds, draft.items, reviews ?? [])
  const count = reviewable.length
  const run = (action: () => Promise<void>) => {
    onClose()
    void action()
  }

  const loadingRow = (
    <div className="context-menu-item opacity-60">
      <Loader2 size={14} className="animate-spin" />
      {t('contextMenu.review.loading')}
    </div>
  )
  const failedRow = (
    <div className="context-menu-item disabled text-plm-fg-muted">
      {t('contextMenu.review.loadFailed')}
    </div>
  )

  return (
    <div
      className="context-menu-item relative"
      {...rootHover}
      onClick={(e) => {
        e.stopPropagation()
        setOpen((o) => (o === 'none' ? 'root' : 'none'))
      }}
    >
      <ClipboardCheck size={14} className="text-plm-accent" />
      {t('contextMenu.review.reviews')}
      <span className="text-xs text-plm-fg-muted ml-auto">▶</span>

      {rootOpen && (
        <ContextSubmenu minWidth={200} {...rootHover}>
          <div
            className="context-menu-item"
            onClick={(e) => {
              e.stopPropagation()
              run(() => addFilesToReviewPackage(reviewable))
            }}
          >
            <Send size={14} className="text-plm-accent" />
            {count > 1
              ? t('contextMenu.review.newReviewMany', { count })
              : t('contextMenu.review.newReview')}
          </div>

          {/* Add to review ▸ */}
          <div
            className="context-menu-item relative"
            {...addHover}
            onClick={(e) => e.stopPropagation()}
          >
            <PlusCircle size={14} className="text-plm-fg-dim" />
            {t('contextMenu.review.addTo')}
            <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
            {open === 'add' && (
              <ContextSubmenu minWidth={220} {...addHover}>
                {targets.addToDraft && (
                  <div
                    className="context-menu-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      run(() => addFilesToReviewPackage(reviewable, { openPane: false }))
                    }}
                  >
                    <PackagePlus size={14} className="text-plm-fg-dim" />
                    {t('contextMenu.review.draft', { count: draft.items.length })}
                  </div>
                )}
                {loadFailed
                  ? failedRow
                  : reviews === null
                    ? loadingRow
                    : targets.addTo.map((review) => (
                        <div
                          key={review.reviewId}
                          className="context-menu-item"
                          title={t('contextMenu.review.reviewHint', { count: review.itemCount })}
                          onClick={(e) => {
                            e.stopPropagation()
                            run(() => addFilesToOpenReview(reviewable, review))
                          }}
                        >
                          <ListChecks size={14} className="text-plm-fg-dim" />
                          <span className="truncate max-w-[260px]">{review.title}</span>
                        </div>
                      ))}
                {!targets.addToDraft &&
                  reviews !== null &&
                  !loadFailed &&
                  targets.addTo.length === 0 && (
                    <div className="context-menu-item disabled text-plm-fg-muted">
                      {t('contextMenu.review.noneToAdd')}
                    </div>
                  )}
              </ContextSubmenu>
            )}
          </div>

          {/* Remove from review ▸ */}
          <div
            className="context-menu-item relative"
            {...removeHover}
            onClick={(e) => e.stopPropagation()}
          >
            <MinusCircle size={14} className="text-plm-fg-dim" />
            {t('contextMenu.review.removeFrom')}
            <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
            {open === 'remove' && (
              <ContextSubmenu minWidth={220} {...removeHover}>
                {targets.removeFromDraft > 0 && (
                  <div
                    className="context-menu-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      onClose()
                      removeFilesFromReviewPackage(fileIds)
                    }}
                  >
                    <PackagePlus size={14} className="text-plm-fg-dim" />
                    {t('contextMenu.review.draft', { count: draft.items.length })}
                  </div>
                )}
                {loadFailed
                  ? failedRow
                  : reviews === null
                    ? loadingRow
                    : targets.removeFrom.map((review) => (
                        <div
                          key={review.reviewId}
                          className="context-menu-item"
                          title={t('contextMenu.review.reviewHint', { count: review.itemCount })}
                          onClick={(e) => {
                            e.stopPropagation()
                            run(() => removeFilesFromOpenReview(review, fileIds))
                          }}
                        >
                          <ListChecks size={14} className="text-plm-fg-dim" />
                          <span className="truncate max-w-[260px]">{review.title}</span>
                        </div>
                      ))}
                {targets.removeFromDraft === 0 &&
                  reviews !== null &&
                  !loadFailed &&
                  targets.removeFrom.length === 0 && (
                    <div className="context-menu-item disabled text-plm-fg-muted">
                      {t('contextMenu.review.noneToRemove')}
                    </div>
                  )}
              </ContextSubmenu>
            )}
          </div>

          <div className="context-menu-separator" />
          <div
            className="context-menu-item"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
              setActiveView('reviews')
            }}
          >
            <ListChecks size={14} className="text-plm-fg-dim" />
            {t('contextMenu.review.view')}
          </div>
        </ContextSubmenu>
      )}
    </div>
  )
}
