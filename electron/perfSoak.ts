/**
 * The soak's main-process probe, CI only (.github/workflows/soak.yml, scripts/render-perf/soak.ts).
 *
 * Installed only in a perf boot (an unpackaged app started with BLUEPLM_PERF_BOOT=1) that also has
 * BLUEPLM_PERF_SOAK=1. It puts one object on `globalThis` that the soak runner reaches through
 * Playwright's `app.evaluate`: a sample of everything in this process that could grow over a
 * month (heap after GC, handles by type, IPC and window listeners, watchers, the log folder, every
 * Electron process's working set, the SolidWorks service's queue and memory), and the power events
 * a sleep and wake would send.
 */
import fs from 'fs'
import path from 'path'
import v8 from 'v8'
import vm from 'vm'

import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron'

import { openFileWatcherCount } from './handlers/fs'
import { getServiceHealthSnapshot } from './handlers/solidworks'
import { readProcessRssMb } from './handlers/swServiceHealth'

const MB = 1024 * 1024

export interface SoakMainProbe {
  sample(): Promise<Record<string, number>>
  suspend(): void
  resume(): void
}

declare global {
  // eslint-disable-next-line no-var
  var __blueplmSoakMain: SoakMainProbe | undefined
}

function folderBytes(dir: string): number {
  let total = 0
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += folderBytes(full)
    else {
      try {
        total += fs.statSync(full).size
      } catch {
        // Rotated away between the listing and the stat.
      }
    }
  }
  return total
}

export function installSoakMainProbe(): void {
  v8.setFlagsFromString('--expose-gc')
  const gc = vm.runInNewContext('gc') as () => void

  globalThis.__blueplmSoakMain = {
    async sample() {
      gc()
      const values: Record<string, number> = {}
      const memory = process.memoryUsage()
      values['main.heapMB'] = memory.heapUsed / MB
      values['main.rssMB'] = memory.rss / MB
      values['main.externalMB'] = memory.external / MB

      for (const type of process.getActiveResourcesInfo()) {
        values[`main.handles.${type}`] = (values[`main.handles.${type}`] ?? 0) + 1
      }
      values['main.ipcListeners'] = ipcMain.eventNames().reduce((n, name) => n + ipcMain.listenerCount(name), 0)
      let windowListeners = 0
      for (const window of BrowserWindow.getAllWindows()) {
        const contents = window.webContents
        windowListeners += contents.eventNames().reduce((n, name) => n + contents.listenerCount(name), 0)
        windowListeners += window.eventNames().reduce((n, name) => n + window.listenerCount(name), 0)
      }
      values['main.webContentsListeners'] = windowListeners
      values['main.windows'] = BrowserWindow.getAllWindows().length
      values['main.watchers'] = openFileWatcherCount()
      values['main.logDirMB'] = folderBytes(path.join(app.getPath('userData'), 'logs')) / MB

      for (const metric of app.getAppMetrics()) {
        const key = `process.${metric.type}MB`
        values[key] = (values[key] ?? 0) + metric.memory.workingSetSize / 1024
      }

      const service = getServiceHealthSnapshot()
      values['service.queueDepth'] = service.queueDepth
      values['service.pendingRequests'] = service.pendingRequests
      values['service.stdoutBufferChars'] = service.stdoutBufferChars
      if (service.pid) {
        const rss = await readProcessRssMb(service.pid)
        if (rss !== null) values['service.rssMB'] = rss
      }
      return values
    },
    suspend() {
      powerMonitor.emit('suspend')
    },
    resume() {
      powerMonitor.emit('resume')
    },
  }
}
