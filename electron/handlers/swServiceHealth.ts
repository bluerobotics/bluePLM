// Long-session health of the SolidWorks service child process.
//
// The app stays open for weeks and the service with it. Three things can drift without anyone
// noticing until the service is unusable: the command queue (folder browsing queues a preview per
// file), the stdout line buffer (a reply with no newline), and the service itself (memory and
// command latency creeping up inside a .NET process that holds COM objects). The first two get
// hard caps here. The third gets a verdict the main process checks between jobs: when the
// service has drifted, it is restarted through the same path as the user's "force restart", but
// only while no command is queued or running, so no caller sees its work cancelled.

import { execFile } from 'child_process'

/** Commands waiting beyond this are shed, lowest priority and oldest first. */
export const SW_QUEUE_LIMIT = 500

/**
 * Longest unterminated stdout line kept. The largest replies are base64 previews of a few MB; a
 * line past this is a service that stopped sending newlines, and waiting longer cannot help.
 */
export const SW_STDOUT_LINE_LIMIT = 128 * 1024 * 1024

/** How often the main process checks the service between jobs. */
export const SW_HEALTH_CHECK_INTERVAL_MS = 5 * 60_000

export interface ServiceHealthOptions {
  /** Restart when the service's working set passes this. */
  maxRssMb: number
  /** Restart when the recent median latency passes this multiple of the baseline... */
  latencyFactor: number
  /** ...and is also this much slower in absolute terms (a 2 ms baseline tripling is noise). */
  latencyMinIncreaseMs: number
  /** Completions that make the baseline after a start, and the rolling window after it. */
  window: number
  /** Never restart more often than this, whatever the readings say. */
  minRestartIntervalMs: number
}

export const DEFAULT_SERVICE_HEALTH: ServiceHealthOptions = {
  maxRssMb: 1536,
  latencyFactor: 4,
  latencyMinIncreaseMs: 1500,
  window: 40,
  minRestartIntervalMs: 30 * 60_000,
}

/**
 * Actions whose latency says something about the service, not about the file: metadata reads and
 * writes on the Document Manager path. Exports, previews of huge assemblies and opens in
 * SolidWorks vary with the file and are left out.
 */
const MEASURED_ACTIONS = new Set([
  'ping',
  'getProperties',
  'setProperties',
  'setPropertiesBatch',
  'getConfigurations',
  'getReferences',
  'getServiceStatus',
])

export interface ServiceHealthSnapshot {
  rssMb: number | null
  baselineMs: number | null
  recentMs: number | null
  restarts: number
  lastRestartReason: string | null
}

export interface ServiceHealth {
  recordCompletion(action: string, elapsedMs: number): void
  recordRss(mb: number | null): void
  /** Why the service should be restarted now, or null. `now` is Date.now(). */
  verdict(now: number): string | null
  /** A fresh process: forget the readings, keep the restart history. */
  onStarted(now: number): void
  onRestarted(reason: string, now: number): void
  snapshot(): ServiceHealthSnapshot
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function createServiceHealth(options: ServiceHealthOptions = DEFAULT_SERVICE_HEALTH): ServiceHealth {
  let baseline: number[] = []
  let recent: number[] = []
  let rssMb: number | null = null
  let restarts = 0
  let lastRestartAt = -Infinity
  let lastRestartReason: string | null = null

  return {
    recordCompletion(action, elapsedMs) {
      if (!MEASURED_ACTIONS.has(action) || !Number.isFinite(elapsedMs)) return
      if (baseline.length < options.window) {
        baseline.push(elapsedMs)
        return
      }
      recent.push(elapsedMs)
      if (recent.length > options.window) recent.splice(0, recent.length - options.window)
    },
    recordRss(mb) {
      rssMb = mb
    },
    verdict(now) {
      if (now - lastRestartAt < options.minRestartIntervalMs) return null
      if (rssMb !== null && rssMb > options.maxRssMb) {
        return `service memory ${Math.round(rssMb)} MB is over ${options.maxRssMb} MB`
      }
      if (baseline.length >= options.window && recent.length >= options.window) {
        const base = medianOf(baseline)
        const now50 = medianOf(recent)
        if (now50 > base * options.latencyFactor && now50 - base > options.latencyMinIncreaseMs) {
          return `service latency ${Math.round(now50)} ms is over ${options.latencyFactor}x its ${Math.round(base)} ms baseline`
        }
      }
      return null
    },
    onStarted() {
      baseline = []
      recent = []
      rssMb = null
    },
    onRestarted(reason, now) {
      restarts++
      lastRestartAt = now
      lastRestartReason = reason
      baseline = []
      recent = []
      rssMb = null
    },
    snapshot: () => ({
      rssMb,
      baselineMs: baseline.length ? medianOf(baseline) : null,
      recentMs: recent.length ? medianOf(recent) : null,
      restarts,
      lastRestartReason,
    }),
  }
}

/**
 * Remove commands past `limit` from `queue`, lowest priority first and oldest first within a
 * priority, and return them so the caller can answer each one. The queue is mutated in place.
 */
export function shedQueue<T extends { priority: number; queuedAt: number }>(queue: T[], limit: number): T[] {
  const excess = queue.length - limit
  if (excess <= 0) return []
  const doomed = new Set(
    [...queue].sort((a, b) => a.priority - b.priority || a.queuedAt - b.queuedAt).slice(0, excess),
  )
  const shed = queue.filter((item) => doomed.has(item))
  const kept = queue.filter((item) => !doomed.has(item))
  queue.length = 0
  queue.push(...kept)
  return shed
}

/** Working set of `pid` in MB on Windows (tasklist), or null when it cannot be read. */
export function readProcessRssMb(pid: number): Promise<number | null> {
  if (process.platform !== 'win32') return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
      { windowsHide: true, timeout: 10_000 },
      (error, stdout) => {
        if (error) return resolve(null)
        resolve(parseTasklistMemoryMb(stdout))
      },
    )
  })
}

/** `"name.exe","1234","Console","1","123,456 K"` -> 120.6 (MB). Any locale's digit grouping. */
export function parseTasklistMemoryMb(line: string): number | null {
  const fields = line.trim().match(/"([^"]*)"/g)
  if (!fields || fields.length < 5) return null
  const kb = Number(fields[4].replace(/[^0-9]/g, ''))
  return Number.isFinite(kb) && kb > 0 ? Math.round((kb / 1024) * 10) / 10 : null
}

export interface ServiceHealthMonitorDeps {
  health: ServiceHealth
  /** The running service's PID, if one is running. */
  pid(): number | undefined
  /** True while any command is queued, running or awaiting a reply. */
  busy(): boolean
  restart(reason: string): Promise<{ success: boolean; error?: string }>
  log(message: string): void
  warn(message: string): void
  readRssMb?: (pid: number) => Promise<number | null>
  now?: () => number
}

export interface ServiceHealthMonitor {
  start(): void
  stop(): void
  /** One check: read the service's memory, and restart it if it has drifted and is idle. */
  check(): Promise<'healthy' | 'waiting-for-idle' | 'restarted' | 'restart-failed' | 'not-running'>
}

/** Checks the service every `intervalMs` and restarts it between jobs when it has drifted. */
export function createServiceHealthMonitor(
  deps: ServiceHealthMonitorDeps,
  intervalMs = SW_HEALTH_CHECK_INTERVAL_MS,
): ServiceHealthMonitor {
  const readRss = deps.readRssMb ?? readProcessRssMb
  const now = deps.now ?? Date.now
  let timer: ReturnType<typeof setInterval> | null = null
  let running = false

  const check: ServiceHealthMonitor['check'] = async () => {
    const pid = deps.pid()
    if (running || !pid) return 'not-running'
    running = true
    try {
      deps.health.recordRss(await readRss(pid))
      const reason = deps.health.verdict(now())
      if (!reason) return 'healthy'
      if (deps.busy()) {
        deps.log(`[SolidWorks] [HEALTH] ${reason}; restart waits for the service to be idle`)
        return 'waiting-for-idle'
      }
      deps.warn(`[SolidWorks] [HEALTH] ${reason}; restarting the service between jobs`)
      deps.health.onRestarted(reason, now())
      const result = await deps.restart(`HEALTH RESTART: ${reason}`)
      deps.log(`[SolidWorks] [HEALTH] Restart ${result.success ? 'succeeded' : `failed: ${result.error ?? 'unknown'}`}`)
      return result.success ? 'restarted' : 'restart-failed'
    } catch (error) {
      deps.warn(`[SolidWorks] [HEALTH] Health check failed: ${String(error)}`)
      return 'restart-failed'
    } finally {
      running = false
    }
  }

  return {
    start() {
      if (timer) return
      timer = setInterval(() => void check(), intervalMs)
      ;(timer as { unref?: () => void }).unref?.()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
    check,
  }
}
