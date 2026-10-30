/**
 * The export shortcuts: which selected files each one exports, and the queue that lets them be
 * pressed file after file while earlier exports still run.
 */
import { describe, expect, it } from 'vitest'

import type { LocalFile } from '@/stores/pdmStore'

import { createExportQueue, type ExportJob } from './exportQueue'
import { planQuickExport } from './quickExport'

function localFile(name: string, overrides: Partial<LocalFile> = {}): LocalFile {
  return {
    name,
    path: `C:\\vault\\${name}`,
    relativePath: name,
    isDirectory: false,
    extension: `.${name.split('.').pop()}`,
    size: 1,
    modifiedTime: 'now',
    ...overrides,
  } as LocalFile
}

const names = (files: LocalFile[]) => files.map((f) => f.name)

describe('planQuickExport', () => {
  const part = localFile('a.SLDPRT')
  const asm = localFile('b.sldasm')
  const drawing = localFile('c.slddrw')
  const other = localFile('notes.txt')
  const folder = localFile('sub', { isDirectory: true, extension: '' })

  it('exports PDF of the selected drawings only', () => {
    const plan = planQuickExport('pdf', [part, drawing, other, folder])
    expect(plan.jobs.map((j) => [j.kind, names(j.files)])).toEqual([['pdf', ['c.slddrw']]])
    expect(plan.skipped).toBe(2)
  })

  it('exports STEP of parts and assemblies, and of the model behind a drawing', () => {
    const plan = planQuickExport('step', [part, asm, drawing])
    expect(plan.jobs.map((j) => [j.kind, names(j.files)])).toEqual([
      ['step', ['a.SLDPRT', 'b.sldasm']],
      ['step-from-drawing', ['c.slddrw']],
    ])
    expect(plan.skipped).toBe(0)
  })

  it('skips files with nothing on disk', () => {
    const cloud = localFile('d.slddrw', { diffStatus: 'cloud' })
    const stub = localFile('e.slddrw', { diffStatus: 'moved_away' })
    const plan = planQuickExport('pdf', [cloud, stub])
    expect(plan.jobs).toEqual([])
    expect(plan.skipped).toBe(2)
  })
})

describe('createExportQueue', () => {
  function deferredRunner() {
    const started: ExportJob[] = []
    const finishers: Array<() => void> = []
    const run = (job: ExportJob) =>
      new Promise<void>((resolve) => {
        started.push(job)
        finishers.push(resolve)
      })
    const finishNext = async () => {
      finishers.shift()?.()
      // Let the queue pick up the next job
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return { run, started, finishNext }
  }

  it('runs jobs one at a time, in the order queued', async () => {
    const { run, started, finishNext } = deferredRunner()
    const queue = createExportQueue(run)

    expect(queue.enqueue({ kind: 'pdf', files: [localFile('a.slddrw')] })).toEqual({
      queued: 1,
      ahead: 0,
    })
    expect(queue.enqueue({ kind: 'pdf', files: [localFile('b.slddrw')] })).toEqual({
      queued: 1,
      ahead: 1,
    })
    expect(started.map((j) => names(j.files))).toEqual([['a.slddrw']])

    await finishNext()
    expect(started.map((j) => names(j.files))).toEqual([['a.slddrw'], ['b.slddrw']])
    await finishNext()
    expect(queue.size()).toBe(0)
  })

  it('does not queue a file already waiting for the same export to the same place', async () => {
    const { run, started, finishNext } = deferredRunner()
    const queue = createExportQueue(run)
    const a = localFile('a.slddrw')
    const b = localFile('b.slddrw')

    queue.enqueue({ kind: 'pdf', files: [a] }) // running
    queue.enqueue({ kind: 'pdf', files: [b], outputFolder: 'D:\\out' }) // waiting
    expect(queue.enqueue({ kind: 'pdf', files: [b], outputFolder: 'D:\\out' }).queued).toBe(0)
    // Another format or destination is a different export
    expect(queue.enqueue({ kind: 'dxf', files: [b], outputFolder: 'D:\\out' }).queued).toBe(1)
    expect(queue.enqueue({ kind: 'pdf', files: [b] }).queued).toBe(1)
    // The running job is no longer waiting, so pressing again queues it once more
    expect(queue.enqueue({ kind: 'pdf', files: [a] }).queued).toBe(1)

    for (let i = 0; i < 5; i++) await finishNext()
    expect(started).toHaveLength(5)
  })

  it('keeps going after a job throws', async () => {
    const ran: string[] = []
    const queue = createExportQueue(async (job) => {
      ran.push(job.files[0].name)
      if (job.files[0].name === 'a.slddrw') throw new Error('boom')
    })
    queue.enqueue({ kind: 'pdf', files: [localFile('a.slddrw')] })
    queue.enqueue({ kind: 'pdf', files: [localFile('b.slddrw')] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(ran).toEqual(['a.slddrw', 'b.slddrw'])
  })
})
