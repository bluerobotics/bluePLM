/**
 * `window.__blueplmPerf`: what the render-performance runner (scripts/render-perf/run.ts) reads
 * and drives inside the page.
 *
 * Measurement is in-page where the page knows best: when the vault first looks loaded (the store
 * holds the whole vault, nothing is loading, and file rows are on screen, two frames later so
 * they are painted), long tasks from the first script onwards, and frame timestamps while a
 * scenario runs. CPU breakdown and heap come from DevTools traces taken by the runner.
 *
 * Scenario setup goes through store actions (open a folder, search, expand tree folders), the same
 * actions the UI's handlers call; clicks and scrolling are real input from the runner or here.
 */
import type { usePDMStore } from '@/stores/pdmStore'
import type { Row } from '@/test/fakeSupabase'

import type { PerfBackend } from './backend'
import { PERF_OTHER_USER_ID } from './backend'

export interface LongTaskSummary {
  count: number
  totalBlockingMs: number
  longestMs: number
}

export interface FrameRun {
  /** rAF timestamps (ms, performance.now) from the start to the end of the scenario. */
  frames: number[]
}

export interface PerfControl {
  bootStartedAt: number
  /** performance.now() and epoch ms when the vault first looked loaded. */
  loaded: { at: number; epochMs: number } | null
  fileCount: number
  longTasks(fromMs: number, toMs: number): LongTaskSummary
  now(): number
  /**
   * Resolve after `ms` with no long task, or after `timeoutMs`. Returns when the work settled: the
   * end of the last long task that ran after this call, or the call itself when none did.
   */
  waitForQuiet(ms: number, timeoutMs: number): Promise<number>
  scrollFileList(pxPerFrame: number): Promise<FrameRun & { distance: number }>
  scrollFileListToTop(): Promise<void>
  sampleFrames(durationMs: number): Promise<FrameRun>
  openFolder(path: string): Promise<void>
  search(query: string): Promise<void>
  expandFolders(paths: string[]): Promise<void>
  collapseAll(): Promise<void>
  realtimeBurst(count: number): Promise<number>
  rowCount(): number
  misses(): Array<[string, number]>
  state(): { files: number; filesLoaded: boolean; isLoading: boolean; statusMessage: string }
}

declare global {
  interface Window {
    __blueplmPerf?: PerfControl
  }
}

const LONG_TASK_LIMIT = 20_000
const BLOCKING_THRESHOLD_MS = 50

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))
const twoFrames = async () => {
  await nextFrame()
  return nextFrame()
}

export function summarizeLongTasks(
  tasks: ReadonlyArray<{ start: number; duration: number }>,
  fromMs: number,
  toMs: number,
): LongTaskSummary {
  let count = 0
  let totalBlockingMs = 0
  let longestMs = 0
  for (const task of tasks) {
    if (task.start < fromMs || task.start >= toMs) continue
    count++
    totalBlockingMs += Math.max(0, task.duration - BLOCKING_THRESHOLD_MS)
    longestMs = Math.max(longestMs, task.duration)
  }
  return { count, totalBlockingMs: Math.round(totalBlockingMs), longestMs: Math.round(longestMs) }
}

function scrollContainer(): HTMLElement | null {
  let el: HTMLElement | null = document.querySelector('tr[data-path]')
  while (el) {
    const style = getComputedStyle(el)
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentElement
  }
  return null
}

export function installControl(
  backend: PerfBackend,
  store: typeof usePDMStore,
  bootStartedAt: number,
): PerfControl {
  const tasks: Array<{ start: number; duration: number }> = []
  let lastTaskEnd = 0
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (tasks.length >= LONG_TASK_LIMIT) tasks.splice(0, LONG_TASK_LIMIT / 2)
        tasks.push({ start: entry.startTime, duration: entry.duration })
        lastTaskEnd = Math.max(lastTaskEnd, entry.startTime + entry.duration)
      }
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    // No long task timing: the summaries read zero and the trace still has the tasks.
  }

  const versions = new Map<number, number>()
  let burstCursor = 0
  // Every realtime row carries its event number and file: the runner's heap snapshot then tells
  // which rows outlive the file's next update, and what holds them (scripts/render-perf/heapRetainers.ts).
  let probeSeq = 0

  const control: PerfControl = {
    bootStartedAt,
    loaded: null,
    fileCount: backend.vault.serverRows.length,
    longTasks: (fromMs, toMs) => summarizeLongTasks(tasks, fromMs, toMs),
    now: () => performance.now(),

    async waitForQuiet(ms, timeoutMs) {
      const calledAt = performance.now()
      const deadline = calledAt + timeoutMs
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        const now = performance.now()
        if (now - lastTaskEnd >= ms || now >= deadline) return Math.min(now, Math.max(calledAt, lastTaskEnd))
      }
    },

    async scrollFileList(pxPerFrame) {
      const el = scrollContainer()
      if (!el) throw new Error('perf: no scrollable file list on screen')
      const frames: number[] = [await nextFrame()]
      const start = el.scrollTop
      while (el.scrollTop + el.clientHeight < el.scrollHeight - 1) {
        el.scrollTop += pxPerFrame
        frames.push(await nextFrame())
      }
      return { frames, distance: el.scrollTop - start }
    },

    async scrollFileListToTop() {
      const el = scrollContainer()
      if (el) el.scrollTop = 0
      await twoFrames()
    },

    async sampleFrames(durationMs) {
      const frames: number[] = [await nextFrame()]
      while (frames[frames.length - 1] - frames[0] < durationMs) frames.push(await nextFrame())
      return { frames }
    },

    async openFolder(path) {
      const state = store.getState()
      state.setSearchQuery('')
      state.setCurrentFolder(path)
      await twoFrames()
    },

    async search(query) {
      store.getState().setSearchQuery(query)
      await twoFrames()
    },

    async expandFolders(paths) {
      const { expandedFolders, toggleFolder } = store.getState()
      for (const path of paths) if (!expandedFolders.has(path)) toggleFolder(path)
      await twoFrames()
    },

    async collapseAll() {
      const { expandedFolders, toggleFolder } = store.getState()
      for (const path of [...expandedFolders]) toggleFolder(path)
      await twoFrames()
    },

    async realtimeBurst(count) {
      const total = backend.vault.serverRows.length
      let delivered = 0
      for (let i = 0; i < count; i++) {
        const index = (burstCursor + i * 59) % total
        const version = (versions.get(index) ?? backend.vault.serverRows[index].version) + 1
        const old: Row = { ...backend.fileRow(index), version: version - 1 }
        versions.set(index, version)
        const next = {
          ...backend.fileRow(index),
          version,
          content_hash: String(old.content_hash).slice(0, 56) + String(version).padStart(8, '0'),
          updated_at: new Date().toISOString(),
          updated_by: PERF_OTHER_USER_ID,
          checked_out_by: i % 10 === 0 ? PERF_OTHER_USER_ID : old.checked_out_by,
          __probe: `p${probeSeq++}f${index}`,
        }
        delivered += backend.db.emitRealtime('file', 'UPDATE', next, old)
      }
      burstCursor = (burstCursor + count) % total
      await twoFrames()
      return delivered
    },

    rowCount: () => document.querySelectorAll('tr[data-path]').length,
    misses: () => [...backend.misses].sort((a, b) => b[1] - a[1]),
    state() {
      const s = store.getState()
      return {
        files: s.files.length,
        filesLoaded: s.filesLoaded,
        isLoading: s.isLoading,
        statusMessage: s.statusMessage,
      }
    },
  }

  // Watch for the vault looking loaded: the whole vault in the store, nothing loading, rows drawn.
  const expected = control.fileCount
  const watch = async () => {
    for (;;) {
      await nextFrame()
      const s = store.getState()
      if (s.filesLoaded && !s.isLoading && s.files.length >= expected && control.rowCount() > 0) break
    }
    const at = await twoFrames()
    control.loaded = { at, epochMs: performance.timeOrigin + at }
    performance.mark('blueplm-perf:vault-looks-loaded')
  }
  void watch()

  window.__blueplmPerf = control
  return control
}
