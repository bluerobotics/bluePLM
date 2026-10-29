/**
 * Entry points into the review package draft: from a file selection (context menus, a state
 * change into review) and from one version in version history.
 *
 * A file selection always resolves to the server's latest checked-in version, looked up fresh,
 * never the renderer's cached `pdmData.version` and never the local working copy.
 */

import { log } from '@/lib/logger'
import { t } from '@/lib/i18n'
import {
  addReviewItems,
  getLatestCheckedInVersions,
  removeReviewItems,
} from '@/lib/supabase/reviews'
import { describeReviewError } from '@/features/source/reviews/lib/reviewErrors'
import { usePDMStore } from '@/stores/pdmStore'
import { selectReviewPackageDraft } from '@/stores/slices/reviewsSlice'
import type { LocalFile } from '@/stores/types'
import type { ReviewPackageDraftItem } from '@/types/reviewPackageDraft'
import type { OpenReviewForFiles } from '@/types/reviews'

import { reviewableFiles } from './lib/localCopy'

export interface AddToPackageOptions {
  /** Open the right-panel pane after adding (default true). */
  openPane?: boolean
}

function announce(outcome: { added: number; replaced: number; dropped: number }, skipped: number) {
  const { addToast } = usePDMStore.getState()
  if (outcome.added > 0 || outcome.replaced > 0) {
    addToast('success', t('reviewBuilder.toast.added', { count: outcome.added + outcome.replaced }))
  } else if (skipped === 0 && outcome.dropped === 0) {
    addToast('info', t('reviewBuilder.toast.alreadyIn'))
  }
  if (skipped > 0) addToast('warning', t('reviewBuilder.toast.noVersion', { count: skipped }))
  if (outcome.dropped > 0) addToast('warning', t('reviewBuilder.toast.full', { count: outcome.dropped }))
}

function openPaneIfAsked(options?: AddToPackageOptions) {
  if (options?.openPane === false) return
  usePDMStore.getState().setReviewPackagePaneOpen(true)
}

/** Add files at their latest checked-in versions. Folders and unsynced files are ignored. */
export async function addFilesToReviewPackage(
  files: readonly LocalFile[],
  options?: AddToPackageOptions,
): Promise<void> {
  const state = usePDMStore.getState()
  if (!state.user) return
  const candidates = reviewableFiles(files)
  const fileIds = candidates.map((f) => f.pdmData?.id).filter((id): id is string => !!id)
  if (fileIds.length === 0) {
    state.addToast('info', t('reviewBuilder.toast.nothingReviewable'))
    return
  }

  try {
    const latest = await getLatestCheckedInVersions(fileIds)
    const items: ReviewPackageDraftItem[] = latest.map((v) => ({
      fileId: v.fileId,
      fileVersionId: v.fileVersionId,
      version: v.version,
      revision: v.revision,
      state: v.state,
      fileName: v.fileName,
      filePath: v.filePath,
      extension: v.extension,
      vaultId: v.vaultId,
      latestVersion: v.version,
    }))
    const outcome = usePDMStore.getState().addReviewPackageItems(items)
    announce(outcome, new Set(fileIds).size - items.length)
    openPaneIfAsked(options)
  } catch (error) {
    log.error('[ReviewPackage]', 'Adding files to the review package failed', { error })
    state.addToast(
      'error',
      t('reviewBuilder.toast.addFailed', { message: error instanceof Error ? error.message : String(error) }),
    )
  }
}

/** One row of `file_versions`, as version history lists it. */
export interface VersionRowForPackage {
  id: string
  version: number
  revision: string | null
  state: string | null
}

/** Add one specific version of a synced file (from version history). */
export function addVersionToReviewPackage(
  file: LocalFile,
  version: VersionRowForPackage,
  latestVersion: number,
  options?: AddToPackageOptions,
): void {
  const fileId = file.pdmData?.id
  if (!fileId) return
  const outcome = usePDMStore.getState().addReviewPackageItems([
    {
      fileId,
      fileVersionId: version.id,
      version: version.version,
      revision: version.revision || null,
      state: version.state || null,
      fileName: file.name,
      filePath: file.pdmData?.file_path ?? file.relativePath,
      extension: file.extension || null,
      vaultId: file.pdmData?.vault_id ?? null,
      latestVersion: Math.max(latestVersion, version.version),
    },
  ])
  announce(outcome, 0)
  openPaneIfAsked(options)
}

/**
 * Add files to an open review at their latest checked-in versions. Files the review already holds
 * are left out; a newer version of one of those goes in through resubmit.
 */
export async function addFilesToOpenReview(
  files: readonly LocalFile[],
  review: OpenReviewForFiles,
): Promise<void> {
  const state = usePDMStore.getState()
  const contained = new Set(review.containedFileIds)
  const fileIds = reviewableFiles(files)
    .map((f) => f.pdmData?.id)
    .filter((id): id is string => !!id && !contained.has(id))
  if (fileIds.length === 0) {
    state.addToast('info', t('contextMenu.review.toast.alreadyInReview', { title: review.title }))
    return
  }

  try {
    const latest = await getLatestCheckedInVersions(fileIds)
    if (latest.length === 0) {
      state.addToast('warning', t('reviewBuilder.toast.noVersion', { count: fileIds.length }))
      return
    }
    const result = await addReviewItems(
      review.reviewId,
      latest.map((v) => v.fileVersionId),
    )
    state.addToast(
      'success',
      t('contextMenu.review.toast.added', { count: result.added, title: review.title }),
    )
    const skipped = fileIds.length - latest.length
    if (skipped > 0)
      state.addToast('warning', t('reviewBuilder.toast.noVersion', { count: skipped }))
    usePDMStore.getState().requestReviewQueueRefresh()
  } catch (error) {
    log.error('[Reviews]', 'Adding files to an open review failed', {
      error,
      reviewId: review.reviewId,
    })
    state.addToast(
      'error',
      t('contextMenu.review.toast.addFailed', { message: describeReviewError(error) }),
    )
  }
}

/** Take files out of an open review. */
export async function removeFilesFromOpenReview(
  review: OpenReviewForFiles,
  fileIds: readonly string[],
): Promise<void> {
  const state = usePDMStore.getState()
  const ids = fileIds.filter((id) => review.containedFileIds.includes(id))
  if (ids.length === 0) return
  try {
    const result = await removeReviewItems(review.reviewId, ids)
    state.addToast(
      'success',
      t('contextMenu.review.toast.removed', { count: result.removed, title: review.title }),
    )
    usePDMStore.getState().requestReviewQueueRefresh()
  } catch (error) {
    log.error('[Reviews]', 'Removing files from an open review failed', {
      error,
      reviewId: review.reviewId,
    })
    state.addToast(
      'error',
      t('contextMenu.review.toast.removeFailed', { message: describeReviewError(error) }),
    )
  }
}

/** Take files out of the unsent package being built. */
export function removeFilesFromReviewPackage(fileIds: readonly string[]): void {
  const state = usePDMStore.getState()
  const inDraft = new Set(selectReviewPackageDraft(state).items.map((i) => i.fileId))
  const ids = fileIds.filter((id) => inDraft.has(id))
  for (const id of ids) state.removeReviewPackageItem(id)
  if (ids.length > 0)
    state.addToast('success', t('contextMenu.review.toast.removedFromDraft', { count: ids.length }))
}
