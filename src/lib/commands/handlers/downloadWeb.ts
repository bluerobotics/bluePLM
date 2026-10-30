/**
 * The download command on BluePLM Web: the browser saves one selected file directly, or several
 * (a folder contributes its cloud files, as on the desktop) as one zip.
 *
 * There is no vault folder, so folders are not created, nothing is made read-only, the sync index
 * is not written and store rows stay `cloud`. Limits: `WEB_DOWNLOAD_MAX_FILES` and
 * `WEB_DOWNLOAD_MAX_BYTES`.
 */

import type { CommandContext, CommandResult } from '../types'
import { getCloudOnlyFilesFromSelection } from '../types'
import type { LocalFile } from '../../../stores/pdmStore'
import { log } from '@/lib/logger'
import { t } from '@/lib/i18n'
import { planWebDownload, saveItemsInBrowser } from '@/lib/webDownload'

export async function executeWebDownload(
  files: LocalFile[],
  ctx: CommandContext,
): Promise<CommandResult> {
  const organization = ctx.organization!
  const cloudFiles = getCloudOnlyFilesFromSelection(ctx.files, files, ctx.serverFiles)
  const selectedCloud = getCloudOnlyFilesFromSelection(ctx.files, files)
  const plan = planWebDownload(cloudFiles)
  const skippedNoHash = Math.max(0, selectedCloud.length - cloudFiles.length)

  if (skippedNoHash > 0) {
    const suffix = skippedNoHash === 1 ? '_one' : '_other'
    ctx.addToast('warning', t(`fileOps.downloadSkippedNoHash${suffix}`, { count: skippedNoHash }))
  }

  if (plan.kind === 'too-many') {
    ctx.addToast('error', t('fileOps.webDownloadTooMany', { count: plan.count, max: plan.max }))
    return {
      success: false,
      message: `Too many files for a browser download (${plan.count} > ${plan.max})`,
      total: plan.count,
      succeeded: 0,
      failed: plan.count,
    }
  }

  if (plan.kind === 'too-large') {
    const gigabytes = (bytes: number) => (bytes / 1024 ** 3).toFixed(1)
    ctx.addToast(
      'error',
      t('fileOps.webDownloadTooLarge', { size: gigabytes(plan.bytes), max: gigabytes(plan.maxBytes) }),
    )
    return {
      success: false,
      message: `Too large for a browser download (${plan.bytes} > ${plan.maxBytes} bytes)`,
      total: 0,
      succeeded: 0,
      failed: 0,
    }
  }

  if (plan.kind === 'empty') {
    return { success: true, message: 'No files to download', total: 0, succeeded: 0, failed: 0 }
  }

  const total = plan.items.length
  log.info('[Download]', 'Browser download', { orgId: organization.id, count: total })

  let succeeded: number
  let failures: Array<{ name: string; error: string }>
  if (total === 1) {
    ctx.addToast('info', t('fileOps.webDownloadStarted_one', { count: total }))
    ;({ succeeded, failures } = await saveItemsInBrowser(organization.id, plan.items))
  } else {
    const toastId = `web-zip-${Date.now()}`
    ctx.addProgressToast(toastId, t('fileOps.webDownloadZipping', { count: total }), total)
    try {
      const result = await saveItemsInBrowser(
        organization.id,
        plan.items,
        (done) => ctx.updateProgressToast(toastId, done, Math.round((done / total) * 100)),
        () => ctx.isProgressToastCancelled(toastId),
      )
      if (result.cancelled) {
        return { success: false, message: 'Download cancelled', total, succeeded: 0, failed: 0 }
      }
      ;({ succeeded, failures } = result)
    } finally {
      ctx.removeToast(toastId)
    }
  }
  for (const failure of failures.slice(0, 3)) {
    ctx.addToast('error', t('fileOps.webDownloadFailed', failure))
  }
  const errors = failures.map((f) => `${f.name}: ${f.error}`)
  if (errors.length > 0) {
    log.warn('[Download]', 'Browser download failures', { count: errors.length, errors })
  }

  return {
    success: errors.length === 0,
    message: `Downloaded ${succeeded} file${succeeded === 1 ? '' : 's'}`,
    total,
    succeeded,
    failed: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  }
}
