/**
 * Quick export: the PDF and STEP export shortcuts (Settings > Keyboard shortcuts).
 *
 * Select files, press the shortcut, and the selection is queued for export to the quick export
 * folder (Settings > Export), or next to each file when no folder is set. PDF exports the
 * selected drawings. STEP exports the selected parts and assemblies, and for a selected drawing
 * the model it references, named with the drawing's metadata (the menu's "Export STEP (Model)").
 */
import { t } from '@/lib/i18n'
import { hasDesktop } from '@/lib/platform'
import { usePDMStore, type LocalFile } from '@/stores/pdmStore'
import { isSolidWorksAlive } from '@/types/solidworks'

import { createExportQueue, type ExportJob } from './exportQueue'
import { exportFiles, exportStepFromDrawings, filesForFormat } from './solidworksExport'

const exportQueue = createExportQueue((job) =>
  job.kind === 'step-from-drawing'
    ? exportStepFromDrawings(job.files, job.outputFolder)
    : exportFiles(job.kind, job.files, job.outputFolder),
)

/** Queue an export behind any export already running. */
export function enqueueExport(job: ExportJob) {
  return exportQueue.enqueue(job)
}

export type QuickExportKind = 'pdf' | 'step'

/** Rows with no file on disk behind them cannot be opened by SOLIDWORKS. */
function hasLocalContent(file: LocalFile): boolean {
  return (
    file.diffStatus !== 'cloud' && file.diffStatus !== 'moved_away' && file.diffStatus !== 'deleted'
  )
}

export interface QuickExportPlan {
  jobs: Omit<ExportJob, 'outputFolder'>[]
  /** Selected files this export does not apply to, or that are not on disk */
  skipped: number
}

export function planQuickExport(kind: QuickExportKind, selection: LocalFile[]): QuickExportPlan {
  const files = selection.filter((f) => !f.isDirectory)
  const onDisk = files.filter(hasLocalContent)
  const jobs: QuickExportPlan['jobs'] = []

  if (kind === 'pdf') {
    const drawings = filesForFormat('pdf', onDisk)
    if (drawings.length > 0) jobs.push({ kind: 'pdf', files: drawings })
  } else {
    const models = filesForFormat('step', onDisk)
    const drawings = filesForFormat('pdf', onDisk)
    if (models.length > 0) jobs.push({ kind: 'step', files: models })
    if (drawings.length > 0) jobs.push({ kind: 'step-from-drawing', files: drawings })
  }

  const planned = jobs.reduce((sum, job) => sum + job.files.length, 0)
  return { jobs, skipped: files.length - planned }
}

/** Run by the export shortcuts on the file pane's selection. */
export function quickExport(kind: QuickExportKind, selection: LocalFile[]): void {
  if (!hasDesktop()) return
  const state = usePDMStore.getState()
  const label = kind === 'pdf' ? 'PDF' : 'STEP'

  // A status that was never checked is treated as available, as the context menu does.
  if (
    state.solidworksStatusLastChecked !== null &&
    !isSolidWorksAlive(state.solidworksServiceStatus)
  ) {
    state.addToast('warning', t('contextMenu.quickExport.serviceNotRunning'))
    return
  }

  const plan = planQuickExport(kind, selection)
  if (plan.jobs.length === 0) {
    state.addToast(
      'info',
      kind === 'pdf'
        ? t('contextMenu.quickExport.nothingPdf')
        : t('contextMenu.quickExport.nothingStep'),
    )
    return
  }

  const outputFolder = state.quickExportFolder || undefined
  let queued = 0
  let ahead = 0
  plan.jobs.forEach((job, index) => {
    const result = enqueueExport({ ...job, outputFolder })
    queued += result.queued
    if (index === 0) ahead = result.ahead
  })

  if (queued === 0) {
    state.addToast('info', t('contextMenu.quickExport.alreadyQueued', { format: label }))
    return
  }

  const destination = outputFolder ?? t('contextMenu.quickExport.nextToFiles')
  const message =
    ahead > 0
      ? t('contextMenu.quickExport.queuedBehind', {
          count: queued,
          format: label,
          destination,
          ahead,
        })
      : t('contextMenu.quickExport.queued', { count: queued, format: label, destination })
  state.addToast(
    'info',
    plan.skipped > 0
      ? `${message} ${t('contextMenu.quickExport.skipped', { count: plan.skipped })}`
      : message,
  )
}
