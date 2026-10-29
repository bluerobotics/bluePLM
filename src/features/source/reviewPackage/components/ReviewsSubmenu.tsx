/**
 * "Request review…" and "Add to review package" for a file or a multi-selection. Used by both
 * context-menu systems (file list and explorer tree) so they cannot drift apart again.
 */

import { PackagePlus, Send } from 'lucide-react'

import { t } from '@/lib/i18n'
import { usePDMStore } from '@/stores/pdmStore'
import { selectReviewPackageDraft } from '@/stores/slices/reviewsSlice'
import type { LocalFile } from '@/stores/types'

import { addFilesToReviewPackage } from '../addToPackage'
import { reviewableFiles } from '../lib/localCopy'

interface ReviewPackageMenuItemsProps {
  contextFiles: LocalFile[]
  onClose: () => void
}

export function ReviewPackageMenuItems({ contextFiles, onClose }: ReviewPackageMenuItemsProps) {
  const draftItemCount = usePDMStore((s) => selectReviewPackageDraft(s).items.length)
  const reviewable = reviewableFiles(contextFiles)
  if (reviewable.length === 0) return null

  const count = reviewable.length
  return (
    <>
      <div
        className="context-menu-item"
        onClick={() => {
          onClose()
          void addFilesToReviewPackage(reviewable)
        }}
      >
        <Send size={14} className="text-plm-accent" />
        {count > 1
          ? t('contextMenu.review.requestMany', { count })
          : t('contextMenu.review.request')}
      </div>
      {draftItemCount > 0 && (
        <div
          className="context-menu-item"
          onClick={() => {
            onClose()
            void addFilesToReviewPackage(reviewable, { openPane: false })
          }}
          title={t('contextMenu.review.addToPackageHint', { count: draftItemCount })}
        >
          <PackagePlus size={14} className="text-plm-fg-dim" />
          {t('contextMenu.review.addToPackage')}
        </div>
      )}
    </>
  )
}
