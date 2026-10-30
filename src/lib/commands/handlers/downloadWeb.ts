/**
 * The download command on BluePLM Web: the browser saves each selected cloud file.
 *
 * There is no vault folder, so folders are not created, nothing is made read-only, the sync index
 * is not written and store rows stay `cloud`. A folder in the selection contributes its cloud
 * files, as on the desktop, up to `WEB_DOWNLOAD_MAX_FILES`.
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

  if (plan.kind === 'empty') {
    return { success: true, message: 'No files to download', total: 0, succeeded: 0, failed: 0 }
  }

  const total = plan.items.length
  const suffix = total === 1 ? '_one' : '_other'
  ctx.addToast('info', t(`fileOps.webDownloadStarted${suffix}`, { count: total }))
  log.info('[Download]', 'Browser download', { orgId: organization.id, count: total })

  const { succeeded, failures } = await saveItemsInBrowser(organization.id, plan.items)
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
