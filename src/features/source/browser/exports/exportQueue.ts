/**
 * One queue for every SOLIDWORKS export, so the export shortcuts can be pressed file after file
 * while earlier exports are still running. Jobs run one at a time, in the order queued; the
 * context menu's Export submenus queue here too, so the two never call the service at once.
 *
 * A file already waiting for the same export to the same place is not queued twice.
 */
import { log } from '@/lib/logger'
import type { LocalFile } from '@/stores/pdmStore'

/** `step-from-drawing` exports the model each drawing references. */
export type ExportJobKind = 'step' | 'iges' | 'stl' | 'pdf' | 'dxf' | 'step-from-drawing'

export interface ExportJob {
  kind: ExportJobKind
  files: LocalFile[]
  /** Absolute folder to write into; undefined writes next to each source file */
  outputFolder?: string
}

export type ExportJobRunner = (job: ExportJob) => Promise<void>

export interface EnqueueResult {
  /** Files queued by this call (the rest were already waiting for the same export) */
  queued: number
  /** Jobs running or waiting ahead of this one when it was queued */
  ahead: number
}

function fileKey(job: ExportJob, file: LocalFile): string {
  return `${job.kind}|${job.outputFolder ?? ''}|${file.path.toLowerCase()}`
}

export function createExportQueue(run: ExportJobRunner) {
  const waiting: ExportJob[] = []
  const waitingKeys = new Set<string>()
  let running = false

  async function drain(): Promise<void> {
    if (running) return
    running = true
    try {
      while (waiting.length > 0) {
        const job = waiting.shift()!
        for (const file of job.files) waitingKeys.delete(fileKey(job, file))
        try {
          await run(job)
        } catch (error) {
          log.error('[Export]', 'Queued export failed', { kind: job.kind, error })
        }
      }
    } finally {
      running = false
    }
  }

  function enqueue(job: ExportJob): EnqueueResult {
    const files = job.files.filter((file) => !waitingKeys.has(fileKey(job, file)))
    const ahead = waiting.length + (running ? 1 : 0)
    if (files.length === 0) return { queued: 0, ahead }

    const queuedJob = { ...job, files }
    for (const file of files) waitingKeys.add(fileKey(queuedJob, file))
    waiting.push(queuedJob)
    void drain()
    return { queued: files.length, ahead }
  }

  /** Jobs running or waiting */
  function size(): number {
    return waiting.length + (running ? 1 : 0)
  }

  return { enqueue, size }
}
