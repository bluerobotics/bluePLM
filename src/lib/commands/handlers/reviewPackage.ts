/**
 * Drawing review commands.
 *
 * - `download-review-package { reviewId, destination, itemIds? }`: every item of the review (or
 *   the chosen ones) and its dependency closure at the pinned versions, written to
 *   `<destination>/<sanitized review title>/<vault-relative path>`. Deduplicated by hash,
 *   bounded parallelism, resumable, files read-only, references retargeted inside the package by
 *   the SOLIDWORKS service (Document Manager only), and `manifest.json` + `manifest.csv`.
 * - `generate-review-pdfs { fileVersionIds }`: render and store the PDF of each drawing version
 *   that has none yet, one at a time (SOLIDWORKS exports one document at a time anyway).
 *
 * The pipeline lives in `src/lib/reviewPackage`; this file is the glue to the command system and
 * the toasts.
 */

import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import {
  buildManifest,
  ensureDrawingPdf,
  fetchMergedClosure,
  isRetargetable,
  joinLocalPath,
  manifestToCsv,
  manifestToJson,
  MANIFEST_CSV,
  MANIFEST_JSON,
  sanitizeFolderName,
  stageFiles,
  type EnsureDrawingPdfResult,
  type PdfUnavailableReason,
} from '@/lib/reviewPackage'
import {
  indexRetargetResults,
  packageKey,
  previousPackagedHashes,
  type RetargetFileOutcome,
} from '@/lib/reviewPackage/manifest'
import { getReviewDetail } from '@/lib/supabase/reviews'
import {
  checkSwServiceFeature,
  SW_SERVICE_VERSION_RETARGET_REFERENCES,
} from '@/lib/swServiceVersion'
import { usePDMStore } from '@/stores/pdmStore'

import { ProgressTracker } from '../executor'
import type {
  Command,
  CommandContext,
  CommandResult,
  DownloadReviewPackageParams,
  GenerateReviewPdfsParams,
} from '../types'

/** Missing references named in the result details before the list is cut off. */
const DETAIL_LIMIT = 50

const key = (name: string) => `reviewPackage.${name}`

function failure(message: string): CommandResult {
  return { success: false, message, total: 0, succeeded: 0, failed: 0 }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function validateCommon(ctx: CommandContext): string | null {
  if (ctx.isOfflineMode) return t(key('validationOffline'))
  if (!ctx.user || !ctx.organization) return t(key('validationNotSignedIn'))
  if (!window.electronAPI) return t(key('validationDesktopOnly'))
  return null
}

/** Whether the service can retarget: running and at least the retargetReferences release. */
async function retargetAvailable(): Promise<boolean> {
  const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
  if (!status?.data?.running) return false
  return (
    checkSwServiceFeature(status.data.version ?? null, SW_SERVICE_VERSION_RETARGET_REFERENCES)
      .status !== 'incompatible'
  )
}

function localVaultRoots(): string[] {
  const state = usePDMStore.getState()
  const roots = new Set<string>()
  for (const vault of state.connectedVaults) if (vault.localPath) roots.add(vault.localPath)
  if (state.vaultPath) roots.add(state.vaultPath)
  return [...roots]
}

async function readPreviousManifest(root: string): Promise<string | null> {
  const api = window.electronAPI
  if (!api) return null
  const path = joinLocalPath(root, MANIFEST_JSON)
  if (!(await api.fileExists(path))) return null
  const read = await api.readTextFile(path)
  return read.success ? read.content : null
}

// ---------------------------------------------------------------------------
// download-review-package
// ---------------------------------------------------------------------------

export const downloadReviewPackageCommand: Command<DownloadReviewPackageParams> = {
  id: 'download-review-package',
  name: 'Download Review Package',
  description: 'Download review items and their references at the pinned versions',

  validate({ reviewId, destination }, ctx) {
    const common = validateCommon(ctx)
    if (common) return common
    if (!reviewId) return t(key('validationNoReview'))
    if (!destination?.trim()) return t(key('validationNoDestination'))
    return null
  },

  async execute({ reviewId, destination, itemIds }, ctx): Promise<CommandResult> {
    const startedAt = Date.now()
    const api = window.electronAPI
    // validateCommon refuses the web; this keeps the type honest.
    if (!api) return { success: false, message: t(key('validationDesktopOnly')), total: 0, succeeded: 0, failed: 0 }
    const orgId = ctx.organization!.id

    let progress: ProgressTracker | null = null
    try {
      const detail = await getReviewDetail(reviewId)
      const wanted = itemIds ? new Set(itemIds) : null
      const items = detail.items.filter((item) => !wanted || wanted.has(item.id))
      if (items.length === 0) {
        const message = t(key('noItems'))
        ctx.addToast('warning', message)
        return failure(message)
      }

      const title = sanitizeFolderName(detail.review.title)
      const root = joinLocalPath(destination.trim(), title)

      const closure = await fetchMergedClosure(items.map((item) => item.version.fileVersionId))
      const previous = previousPackagedHashes(await readPreviousManifest(root))

      progress = new ProgressTracker(
        ctx,
        'download-review-package',
        `download-review-package-${Date.now()}`,
        t(key('progressDownload'), { title }),
        Math.max(closure.files.length, 1),
      )
      const tracker = progress

      let reported = 0
      const staged = await stageFiles(closure.files, root, {
        orgId,
        isCancelled: () => tracker.isCancelled(),
        previousPackagedHashes: previous,
        onProgress: (p) => {
          while (reported < p.completed) {
            tracker.update()
            reported++
          }
        },
      })
      const cancelled = tracker.isCancelled()
      const present = staged.filter((s) => s.status !== 'failed')
      const failedFiles = staged.filter((s) => s.status === 'failed')

      // Point the packaged assemblies and drawings at each other, not at the vault.
      const retargetables = present.filter((s) => isRetargetable(s.packagePath))
      let retarget: Map<string, RetargetFileOutcome> | null = null
      let retargetNotRun = false
      if (!cancelled && retargetables.length > 0) {
        if (await retargetAvailable()) {
          tracker.setStatus(t(key('progressRetargeting')))
          const result = await api.solidworks.retargetReferences({
            packageRoot: root,
            files: retargetables.map((s) => s.localPath),
            vaultRoots: localVaultRoots(),
          })
          if (result.success && result.data) {
            retarget = indexRetargetResults(root, result.data.files)
          } else {
            retargetNotRun = true
            log.warn('[ReviewPackage]', 'Retargeting failed', {
              errorCode: result.errorCode,
              error: result.error,
            })
          }
        } else {
          retargetNotRun = true
        }
      }

      tracker.setStatus(t(key('progressFinishing')))

      // Hashes on disk after retargeting, so a later run can resume over these files.
      const packagedHashes = new Map<string, string>()
      for (const s of retargetables) {
        const hashed = await api.hashFile(s.localPath)
        if (hashed.success && hashed.hash)
          packagedHashes.set(packageKey(s.packagePath), hashed.hash)
      }

      if (present.length > 0) {
        await api.setReadonlyBatch(present.map((s) => ({ path: s.localPath, readonly: true })))
      }

      const manifest = buildManifest({
        reviewId,
        title: detail.review.title,
        generatedAt: new Date().toISOString(),
        closure,
        staged,
        retarget,
        packagedHashes,
      })
      const written =
        present.length > 0
          ? await api.reviewPackage.writeManifest(root, [
              { name: MANIFEST_JSON, content: manifestToJson(manifest) },
              { name: MANIFEST_CSV, content: manifestToCsv(manifest) },
            ])
          : { success: false, error: 'nothing downloaded' }

      // Summary
      const total = closure.files.length
      const notes: string[] = []
      if (closure.missing.length > 0) {
        notes.push(t(key('missingReferences'), { count: closure.missing.length }))
      }
      if (closure.conflicts.length > 0) {
        notes.push(t(key('versionConflicts'), { count: closure.conflicts.length }))
      }
      if (closure.files.some((f) => !f.exact)) notes.push(t(key('approximate')))
      if (retargetNotRun) {
        notes.push(t(key('retargetNotRun'), { version: SW_SERVICE_VERSION_RETARGET_REFERENCES }))
      }
      const retargetFailed = manifest.files.filter((f) => f.retargetStatus === 'failed').length
      if (retargetFailed > 0) notes.push(t(key('retargetFailed'), { count: retargetFailed }))
      if (!written.success && present.length > 0) {
        notes.push(t(key('manifestFailed'), { error: written.error ?? '' }))
      }
      if (present.length > 0) notes.push(t(key('openFresh')))

      const main = cancelled
        ? t(key('cancelled'))
        : failedFiles.length > 0
          ? t(key('downloadPartial'), { folder: root, failed: failedFiles.length, count: total })
          : t(key('downloadDone'), { folder: root, count: total })
      const clean =
        !cancelled &&
        failedFiles.length === 0 &&
        manifest.exact &&
        !retargetNotRun &&
        (written.success || present.length === 0)
      const message = [main, ...notes].join(' ')
      ctx.addToast(clean ? 'success' : 'warning', message)

      const details = [
        `${root}`,
        ...closure.missing
          .slice(0, DETAIL_LIMIT)
          .map((m) => `${m.parentPath ?? '?'} -> ${m.referencePath}`),
      ]
      log.info('[ReviewPackage]', 'Review package downloaded', {
        reviewId,
        root,
        files: total,
        downloaded: staged.filter((s) => s.status === 'downloaded').length,
        copied: staged.filter((s) => s.status === 'copied').length,
        skipped: staged.filter((s) => s.status === 'skipped').length,
        failed: failedFiles.length,
        missing: closure.missing.length,
        conflicts: closure.conflicts.length,
        exact: manifest.exact,
        retargetNotRun,
        cancelled,
      })

      return {
        success: !cancelled && failedFiles.length === 0,
        message,
        total,
        succeeded: present.length,
        failed: failedFiles.length,
        details,
        errors: failedFiles.map((f) => `${f.packagePath}: ${f.error ?? 'failed'}`),
        duration: Date.now() - startedAt,
      }
    } catch (err) {
      const message = t(key('failed'), { error: errorText(err) })
      log.warn('[ReviewPackage]', 'Review package download failed', {
        reviewId,
        error: errorText(err),
      })
      ctx.addToast('error', message)
      return failure(message)
    } finally {
      progress?.finish()
    }
  },
}

// ---------------------------------------------------------------------------
// generate-review-pdfs
// ---------------------------------------------------------------------------

function reasonLabel(reason: PdfUnavailableReason): string {
  return t(key(`reason.${reason}`), { version: SW_SERVICE_VERSION_RETARGET_REFERENCES })
}

function failureLabel(result: Extract<EnsureDrawingPdfResult, { status: 'failed' }>): string {
  if (result.errorCode === 'SAME_NAME_OPEN')
    return t(key('pdfSameNameOpen'), { files: result.error })
  return result.error
}

export const generateReviewPdfsCommand: Command<GenerateReviewPdfsParams> = {
  id: 'generate-review-pdfs',
  name: 'Generate Review PDFs',
  description: 'Render and store the PDF of drawing versions',

  validate({ fileVersionIds }, ctx) {
    const common = validateCommon(ctx)
    if (common) return common
    if (!fileVersionIds || fileVersionIds.length === 0) return t(key('validationNoVersions'))
    return null
  },

  async execute({ fileVersionIds }, ctx): Promise<CommandResult> {
    const startedAt = Date.now()
    const ids = [...new Set(fileVersionIds)]
    const progress = new ProgressTracker(
      ctx,
      'generate-review-pdfs',
      `generate-review-pdfs-${Date.now()}`,
      t(key('progressPdf')),
      ids.length,
    )

    let generated = 0
    let cached = 0
    let notDrawing = 0
    let unavailable: PdfUnavailableReason | null = null
    const failures: string[] = []

    try {
      for (const id of ids) {
        if (progress.isCancelled()) break
        const result = await ensureDrawingPdf(id)
        if (result.status === 'generated') generated++
        else if (result.status === 'cached') cached++
        else if (result.status === 'not_a_drawing') notDrawing++
        else if (result.status === 'failed') failures.push(failureLabel(result))
        else if (result.status === 'needs_solidworks') {
          // Every remaining version would hit the same wall on this machine.
          unavailable = result.reason
          break
        }
        progress.update()
      }
    } finally {
      progress.finish()
    }

    const parts: string[] = []
    if (generated > 0 || cached > 0) parts.push(t(key('pdfDone'), { generated, cached }))
    if (unavailable) parts.push(t(key('pdfNeedsSolidworks'), { reason: reasonLabel(unavailable) }))
    if (failures.length > 0) {
      parts.push(t(key('pdfFailed'), { count: failures.length, details: failures[0] }))
    }
    if (notDrawing > 0) parts.push(t(key('pdfNotDrawing'), { count: notDrawing }))
    const message = parts.join(' ')

    const severity = failures.length > 0 ? 'error' : unavailable ? 'warning' : 'success'
    if (message) ctx.addToast(severity, message)

    log.info('[ReviewPackage]', 'Review PDFs', {
      requested: ids.length,
      generated,
      cached,
      notDrawing,
      unavailable,
      failed: failures.length,
    })

    return {
      success: failures.length === 0 && !unavailable,
      message,
      total: ids.length,
      succeeded: generated + cached,
      // Versions left undone because this machine cannot render count as failed too.
      failed: ids.length - generated - cached - notDrawing,
      errors: failures.length > 0 ? failures : undefined,
      duration: Date.now() - startedAt,
    }
  },
}
