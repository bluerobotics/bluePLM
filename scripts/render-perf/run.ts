/**
 * Render-performance runner: launches the built app in its perf boot (src/perf/app/boot.ts) with
 * Playwright, drives it, records DevTools traces and writes one result JSON.
 *
 * CI only (.github/workflows/render-perf.yml). Never run it on a developer machine: it opens the app.
 *
 *   BLUEPLM_PERF_BUILD=1 npx vite build
 *   npx tsx scripts/render-perf/run.ts --out perf-out [--reps 3] [--session-minutes 30]
 *
 * Each repetition is a fresh process with an empty profile (a cold start), then the scenarios:
 * search all files, scroll the 30k-row result end to end, expand a deep tree, select files with
 * the details panel open, and a realtime burst of 500 file updates. After the repetitions, one
 * long session repeats those operations for `--session-minutes` and samples the JS heap after a
 * forced GC every minute (leak check).
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron, type CDPSession, type ElectronApplication, type Page } from 'playwright'

// window.__blueplmPerf's type (a global augmentation).
import type {} from '../../src/perf/app/control'

import type { RenderPerfResult } from './compare'
import {
  cpuTimeByFunction,
  frameStats,
  heapStats,
  median,
  retainedByStack,
  type CpuProfile,
  type HeapSample,
  type SamplingHeapNode,
} from './stats'
import { probeRetainers, type HeapSnapshot, type ProbeReport } from './heapRetainers'
import { SourceMapLookup, type RawSourceMap } from './sourceMap'
import { mainThreadBreakdown, TraceStreamParser, type TraceEvent } from './traceMetrics'

interface Options {
  out: string
  reps: number
  sessionMinutes: number
}

function parseArgs(argv: string[]): Options {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  return {
    out: get('out') ?? 'perf-out',
    // An empty argument (a workflow run with no inputs) falls back to the environment, then the default.
    reps: Number(get('reps') || process.env.RENDER_PERF_REPS || 3),
    sessionMinutes: Number(get('session-minutes') || process.env.RENDER_PERF_SESSION_MINUTES || 30),
  }
}

// What the Performance panel's summary needs. `toplevel` and `v8.execute` were tried and dropped:
// per-IPC and per-interrupt events made a 30k-row scroll trace larger than a string can hold.
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
]

/** Traces over this size are measured but not kept as artifacts. */
const MAX_SAVED_TRACE_BYTES = 150 * 1024 * 1024

function say(message: string): void {
  process.stdout.write(`[render-perf] ${message}\n`)
}

/** The app's main window: the one loading perf.html, not the hidden extension host. */
async function appWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const page = app.windows().find((w) => w.url().endsWith('/perf.html'))
    if (page) return page
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`no perf.html window; windows: ${app.windows().map((w) => w.url()).join(', ')}`)
}

interface Launched {
  app: ElectronApplication
  page: Page
  cdp: CDPSession
  launchedAt: number
  userData: string
  /** The last console lines from the page, for a failure report. */
  consoleLines: string[]
}

async function launch(): Promise<Launched> {
  const userData = mkdtempSync(join(tmpdir(), 'blueplm-perf-'))
  const launchedAt = Date.now()
  const app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      BLUEPLM_PERF_BOOT: '1',
      BLUEPLM_PERF_USER_DATA: userData,
      NODE_ENV: 'production',
    },
    timeout: 120_000,
  })
  // Listen from the first window on: a boot that fails early says so before the runner attaches.
  const consoleLines: string[] = []
  const listen = (w: Page) => {
    w.on('console', (message) => {
      if (consoleLines.length >= 400) consoleLines.shift()
      consoleLines.push(`${message.type()}: ${message.text().slice(0, 500)}`)
    })
    w.on('pageerror', (error) => consoleLines.push(`pageerror: ${error.stack ?? error.message}`))
  }
  app.windows().forEach(listen)
  app.on('window', listen)
  const page = await appWindow(app)
  const cdp = await page.context().newCDPSession(page)
  return { app, page, cdp, launchedAt, userData, consoleLines }
}

/** What the page and the main process looked like when a run failed: text only, no screenshot. */
async function writeFailure(out: string, label: string, launched: Launched, error: unknown): Promise<void> {
  const dir = join(out, `failure-${label}`)
  mkdirSync(dir, { recursive: true })
  const page = await launched.page
    .evaluate(() => ({
      title: document.title,
      url: location.href,
      stage: document.documentElement.dataset.perfBootStage ?? null,
      electronAPI: typeof window.electronAPI,
      electronAPIReal: typeof (window as Window & { electronAPIReal?: unknown }).electronAPIReal,
      scripts: [...document.scripts].map((el) => el.src || '(inline)'),
      resources: performance.getEntriesByType('resource').map((r) => r.name).slice(0, 40),
      perf: window.__blueplmPerf
        ? { state: window.__blueplmPerf.state(), rows: window.__blueplmPerf.rowCount(), loaded: window.__blueplmPerf.loaded, misses: window.__blueplmPerf.misses().slice(0, 60) }
        : null,
      text: document.body?.innerText.slice(0, 4000) ?? '',
    }))
    .catch((e: unknown) => ({ evaluateFailed: String(e) }))
  writeFileSync(
    join(dir, 'failure.json'),
    JSON.stringify({ error: error instanceof Error ? error.stack : String(error), page, console: launched.consoleLines }, null, 2),
  )
  const logs = join(launched.userData, 'logs')
  if (existsSync(logs)) cpSync(logs, join(dir, 'main-logs'), { recursive: true })
  say(`failure details in ${dir}`)
}

async function startTrace(cdp: CDPSession): Promise<void> {
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    traceConfig: { recordMode: 'recordUntilFull', includedCategories: TRACE_CATEGORIES, excludedCategories: ['*'] },
  })
}

async function stopTrace(cdp: CDPSession, saveAs?: string): Promise<TraceEvent[]> {
  const complete = new Promise<string>((resolve) =>
    cdp.once('Tracing.tracingComplete', (event) => resolve(event.stream ?? '')),
  )
  await cdp.send('Tracing.end')
  const stream = await complete
  const parser = new TraceStreamParser()
  let saved = 0
  let saving = !!saveAs
  if (saveAs) writeFileSync(saveAs, '')
  for (;;) {
    const { data, eof, base64Encoded } = await cdp.send('IO.read', { handle: stream, size: 4 * 1024 * 1024 })
    const text = base64Encoded ? Buffer.from(data, 'base64').toString('utf8') : data
    parser.push(text)
    if (saving && saveAs) {
      saved += text.length
      if (saved > MAX_SAVED_TRACE_BYTES) {
        rmSync(saveAs, { force: true })
        saving = false
      } else {
        appendFileSync(saveAs, text)
      }
    }
    if (eof) break
  }
  await cdp.send('IO.close', { handle: stream })
  return parser.events
}

async function heapMB(cdp: CDPSession): Promise<number> {
  // With DevTools attached the inspector keeps every console message's arguments alive (the app
  // logs each realtime event with its data). Without DevTools, as users run it, nothing holds
  // them; left in, they read as ~0.8 KB per realtime event of 'leak' allocated in emitRealtime.
  await cdp.send('Runtime.discardConsoleEntries').catch(() => undefined)
  await cdp.send('HeapProfiler.collectGarbage')
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  return usedSize / (1024 * 1024)
}

async function startProfile(cdp: CDPSession): Promise<void> {
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
  await cdp.send('Profiler.start')
}

/** Stop the CPU profile, save it beside the traces, and keep its summary in topFunctions. */
async function stopProfile(cdp: CDPSession, name: string, traceDir: string): Promise<void> {
  const { profile } = await cdp.send('Profiler.stop')
  await cdp.send('Profiler.disable')
  writeFileSync(join(traceDir, `${name}.cpuprofile`), JSON.stringify(profile))
  const byFunction = cpuTimeByFunction(profile as unknown as CpuProfile, { frameName: sourceFrameName(), top: 2000 })
  topFunctions[name] = {
    self: byFunction.self.slice(0, 25),
    total: byFunction.total.slice(0, 25),
    // React's own frames fill the top of `total`; the app's functions are what to act on.
    app: byFunction.total.filter(([frame]) => frame.includes(' src/')).slice(0, 25),
  }
}

/** Take a heap snapshot and report what holds the oldest tagged realtime rows. */
async function snapshotProbes(cdp: CDPSession): Promise<ProbeReport> {
  let json = ''
  const onChunk = (event: { chunk: string }) => {
    json += event.chunk
  }
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk)
  try {
    await cdp.send('Runtime.discardConsoleEntries').catch(() => undefined)
    await cdp.send('HeapProfiler.collectGarbage')
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk)
  }
  return probeRetainers(JSON.parse(json) as HeapSnapshot)
}

/** Run `body` under a trace and the in-page long task window; returns both with its own result. */
async function measured<T>(
  page: Page,
  cdp: CDPSession,
  name: string,
  traceDir: string | null,
  body: () => Promise<T>,
): Promise<{ result: T; metrics: Record<string, number>; quietAt: number }> {
  await page.evaluate(() => window.__blueplmPerf!.waitForQuiet(500, 15_000))
  const from = await page.evaluate(() => window.__blueplmPerf!.now())
  // The first repetition also samples the JS stacks: the trace says how long script ran, the
  // profile says in which functions.
  if (traceDir) await startProfile(cdp)
  await startTrace(cdp)
  const result = await body()
  const to = await page.evaluate(() => window.__blueplmPerf!.waitForQuiet(300, 30_000))
  const events = await stopTrace(cdp, traceDir ? join(traceDir, `${name}.json`) : undefined)
  if (traceDir) await stopProfile(cdp, name, traceDir)
  const lt = await page.evaluate(([a, b]) => window.__blueplmPerf!.longTasks(a, b), [from, to + 1] as const)
  const breakdown = mainThreadBreakdown(events)
  if (breakdown && !topSelfTime[name]) topSelfTime[name] = breakdown.top
  return {
    result,
    quietAt: to,
    metrics: {
      longTasks: lt.count,
      totalBlockingMs: lt.totalBlockingMs,
      longestTaskMs: lt.longestMs,
      ...(breakdown
        ? {
            scriptingMs: breakdown.scriptingMs,
            layoutMs: breakdown.layoutMs + breakdown.styleMs,
            paintMs: breakdown.paintMs,
            gcMs: breakdown.gcMs,
          }
        : {}),
    },
  }
}

/** Per scenario, the trace event names with the most main-thread self time (first repetition wins). */
const topSelfTime: Record<string, Array<[string, number]>> = {}
/** Per scenario, the functions with the most sampled time (first repetition, source-mapped). */
const topFunctions: Record<string, ReturnType<typeof cpuTimeByFunction> & { app: Array<[string, number]> }> = {}

const SEARCH = 'Bracket' // every synthetic file name has it
const DEEP_FOLDER = 'P00/Assy-00/Sub-00'
const TREE_PATHS = ['P01', ...Array.from({ length: 12 }, (_, a) => `P01/Assy-${String(a).padStart(2, '0')}`)]

async function clickRows(page: Page, count: number): Promise<number[]> {
  const times: number[] = []
  const rows = page.locator('tr[data-path]:not(.config-drawing-row)')
  const total = Math.min(count, await rows.count())
  for (let i = 0; i < total; i++) {
    const start = await page.evaluate(() => window.__blueplmPerf!.now())
    await rows.nth(i).click({ modifiers: i >= total / 2 ? ['Control'] : [] })
    const end = await page.evaluate(() => window.__blueplmPerf!.waitForQuiet(200, 10_000))
    times.push(end - start)
  }
  return times
}

async function repetition(rep: number, out: string): Promise<{ metrics: Record<string, number>; misses: Array<[string, number]> }> {
  const traceDir = rep === 1 ? join(out, 'traces') : null
  if (traceDir) mkdirSync(traceDir, { recursive: true })
  const launched = await launch()
  const { app, page, cdp, launchedAt } = launched
  const metrics: Record<string, number> = {}
  try {
    if (traceDir) await startProfile(cdp)
    await startTrace(cdp)
    await page.waitForFunction(
      () => {
        if (document.title.startsWith('perf-boot-failed')) throw new Error(document.title)
        return !!window.__blueplmPerf?.loaded
      },
      null,
      { timeout: 240_000, polling: 250 },
    )
    const loaded = await page.evaluate(() => window.__blueplmPerf!.loaded!)
    const coldEvents = await stopTrace(cdp, traceDir ? join(traceDir, 'cold-start.json') : undefined)
    if (traceDir) await stopProfile(cdp, 'cold-start', traceDir)
    const coldLt = await page.evaluate((at) => window.__blueplmPerf!.longTasks(0, at + 1), loaded.at)
    const cold = mainThreadBreakdown(coldEvents)
    if (cold && !topSelfTime['cold-start']) topSelfTime['cold-start'] = cold.top
    Object.assign(metrics, {
      'coldStart.launchToLoadedMs': Math.round(loaded.epochMs - launchedAt),
      'coldStart.navigationToLoadedMs': Math.round(loaded.at),
      'coldStart.longTasks': coldLt.count,
      'coldStart.totalBlockingMs': coldLt.totalBlockingMs,
      'coldStart.longestTaskMs': coldLt.longestMs,
      ...(cold
        ? {
            'coldStart.scriptingMs': cold.scriptingMs,
            'coldStart.layoutMs': cold.layoutMs + cold.styleMs,
            'coldStart.paintMs': cold.paintMs,
            'coldStart.gcMs': cold.gcMs,
          }
        : {}),
    })
    say(`rep ${rep}: vault looks loaded ${metrics['coldStart.launchToLoadedMs']} ms after launch`)

    const idle = await page.evaluate(() => window.__blueplmPerf!.sampleFrames(1000))
    const vsyncMs = median(idle.frames.slice(1).map((t, i) => t - idle.frames[i])) || 1000 / 60
    metrics['display.vsyncMs'] = Math.round(vsyncMs * 100) / 100

    const search = await measured(page, cdp, 'search', traceDir, async () => {
      const start = await page.evaluate(() => window.__blueplmPerf!.now())
      await page.evaluate((q) => window.__blueplmPerf!.search(q), SEARCH)
      return start
    })
    metrics['search.settleMs'] = Math.round(search.quietAt - search.result)
    metrics['search.rows'] = await page.evaluate(() => window.__blueplmPerf!.rowCount())
    for (const [k, v] of Object.entries(search.metrics)) metrics[`search.${k}`] = v

    const scroll = await measured(page, cdp, 'scroll', traceDir, () =>
      page.evaluate(() => window.__blueplmPerf!.scrollFileList(400)),
    )
    const fs = frameStats(scroll.result.frames, vsyncMs)
    Object.assign(metrics, {
      'scroll.distancePx': scroll.result.distance,
      'scroll.frames': fs.frames,
      'scroll.durationMs': fs.durationMs,
      'scroll.fps': fs.fps,
      'scroll.p50FrameMs': fs.p50FrameMs,
      'scroll.p95FrameMs': fs.p95FrameMs,
      'scroll.maxFrameMs': fs.maxFrameMs,
      'scroll.droppedFrames': fs.droppedFrames,
      'scroll.jankyFrames': fs.jankyFrames,
    })
    for (const [k, v] of Object.entries(scroll.metrics)) metrics[`scroll.${k}`] = v

    await page.evaluate(() => window.__blueplmPerf!.search(''))
    const tree = await measured(page, cdp, 'tree', traceDir, async () => {
      const start = await page.evaluate(() => window.__blueplmPerf!.now())
      await page.evaluate(
        (paths) => window.__blueplmPerf!.expandFolders(paths),
        ['P00', 'P00/Assy-00', DEEP_FOLDER, ...TREE_PATHS],
      )
      return start
    })
    metrics['tree.settleMs'] = Math.round(tree.quietAt - tree.result)
    for (const [k, v] of Object.entries(tree.metrics)) metrics[`tree.${k}`] = v

    await page.evaluate((p) => window.__blueplmPerf!.openFolder(p), DEEP_FOLDER)
    const select = await measured(page, cdp, 'select', traceDir, () => clickRows(page, 10))
    metrics['select.clicks'] = select.result.length
    metrics['select.medianClickMs'] = Math.round(median(select.result))
    metrics['select.maxClickMs'] = Math.round(Math.max(...select.result))
    for (const [k, v] of Object.entries(select.metrics)) metrics[`select.${k}`] = v

    const realtime = await measured(page, cdp, 'realtime', traceDir, async () => {
      const start = await page.evaluate(() => window.__blueplmPerf!.now())
      const delivered = await page.evaluate(() => window.__blueplmPerf!.realtimeBurst(500))
      return { start, delivered }
    })
    metrics['realtime.delivered'] = realtime.result.delivered
    metrics['realtime.settleMs'] = Math.round(realtime.quietAt - realtime.result.start)
    for (const [k, v] of Object.entries(realtime.metrics)) metrics[`realtime.${k}`] = v

    const misses = await page.evaluate(() => window.__blueplmPerf!.misses())
    return { metrics, misses }
  } catch (error) {
    await writeFailure(out, `rep-${rep}`, launched, error)
    throw error
  } finally {
    await app.close().catch(() => {})
  }
}

/** The steps of one cycle of ordinary use, for the long session. Deterministic: `n` picks the folders. */
function sessionSteps(page: Page, n: number): Array<[string, () => Promise<unknown>]> {
  const project = `P${String(n % 20).padStart(2, '0')}`
  const assembly = `${project}/Assy-${String(n % 12).padStart(2, '0')}`
  const folder = `${assembly}/Sub-${String(n % 10).padStart(2, '0')}`
  return [
    ['expand', () => page.evaluate((paths) => window.__blueplmPerf!.expandFolders(paths), [project, assembly, folder])],
    ['open-folder', () => page.evaluate((p) => window.__blueplmPerf!.openFolder(p), folder)],
    ['select', () => clickRows(page, 4)],
    ['search', () => page.evaluate(() => window.__blueplmPerf!.search('Rev-A'))],
    ['scroll', () => page.evaluate(() => window.__blueplmPerf!.scrollFileList(4000))],
    ['scroll-top', () => page.evaluate(() => window.__blueplmPerf!.scrollFileListToTop())],
    ['clear-search', () => page.evaluate(() => window.__blueplmPerf!.search(''))],
    ['realtime-50', () => page.evaluate(() => window.__blueplmPerf!.realtimeBurst(50))],
    ['collapse', () => (n % 5 === 4 ? page.evaluate(() => window.__blueplmPerf!.collapseAll()) : Promise.resolve())],
    ['settle', () => page.evaluate(() => window.__blueplmPerf!.waitForQuiet(300, 20_000))],
  ]
}

/**
 * Names a profile frame by its source position, through the perf build's source maps: the
 * function as written (`name` from the map, else V8's) and `src/...:line`.
 */
function sourceFrameName(): (callFrame: SamplingHeapNode['callFrame']) => string {
  const maps = new Map<string, SourceMapLookup | null>()
  const mapFor = (url: string) => {
    if (!maps.has(url)) {
      let lookup: SourceMapLookup | null = null
      try {
        const file = fileURLToPath(url)
        if (existsSync(`${file}.map`)) lookup = new SourceMapLookup(JSON.parse(readFileSync(`${file}.map`, 'utf8')) as RawSourceMap)
      } catch {
        lookup = null
      }
      maps.set(url, lookup)
    }
    return maps.get(url) ?? null
  }
  return (callFrame) => {
    const fn = callFrame.functionName || '(anonymous)'
    if (!callFrame.url.startsWith('file:')) return fn
    const original = mapFor(callFrame.url)?.lookup(callFrame.lineNumber + 1, callFrame.columnNumber)
    if (!original) return `${fn} ${callFrame.url.slice(callFrame.url.lastIndexOf('/') + 1)}:${callFrame.lineNumber + 1}`
    const source = original.source.replace(/^(\.\.\/)+/, '').replace(/^.*node_modules\//, 'node_modules/')
    return `${original.name ?? fn} ${source}:${original.line}`
  }
}

/** Every this many cycles, the heap is measured after each step, to say which step keeps memory. */
const STEP_HEAP_EVERY = 10

interface SessionResult {
  metrics: Record<string, number>
  heap: HeapSample[]
  /** MB retained per step, summed over the cycles measured step by step. */
  heapByStep: Record<string, number>
  /** Live memory at the end of the session by allocation stack (sampling heap profile). */
  retained: Array<{ stack: string; MB: number }>
}

async function longSession(minutes: number, out: string): Promise<SessionResult> {
  const launched = await launch()
  const { app, page, cdp } = launched
  try {
    await page.waitForFunction(() => !!window.__blueplmPerf?.loaded, null, { timeout: 240_000, polling: 250 })
    await page.evaluate(() => window.__blueplmPerf!.waitForQuiet(1000, 60_000))
    await cdp.send('HeapProfiler.enable')
    await cdp.send('HeapProfiler.collectGarbage')
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 64 * 1024 })
    const heapByStep: Record<string, number> = {}
    const start = Date.now()
    const startPage = await page.evaluate(() => window.__blueplmPerf!.now())
    const heap: HeapSample[] = [{ minute: 0, usedMB: await heapMB(cdp) }]
    let nextSample = 1
    let cycles = 0
    while (Date.now() - start < minutes * 60_000) {
      const n = cycles++
      const measureSteps = n % STEP_HEAP_EVERY === STEP_HEAP_EVERY - 1
      let before = measureSteps ? await heapMB(cdp) : 0
      for (const [name, step] of sessionSteps(page, n)) {
        await step()
        if (!measureSteps) continue
        const after = await heapMB(cdp)
        heapByStep[name] = Math.round(((heapByStep[name] ?? 0) + after - before) * 10) / 10
        before = after
      }
      const elapsed = (Date.now() - start) / 60_000
      if (elapsed >= nextSample) {
        heap.push({ minute: Math.round(elapsed * 100) / 100, usedMB: await heapMB(cdp) })
        nextSample = Math.floor(elapsed) + 1
      }
    }
    const end = await page.evaluate(() => window.__blueplmPerf!.now())
    heap.push({ minute: Math.round(((Date.now() - start) / 60_000) * 100) / 100, usedMB: await heapMB(cdp) })
    const lt = await page.evaluate(([a, b]) => window.__blueplmPerf!.longTasks(a, b), [startPage, end] as const)
    await cdp.send('Runtime.discardConsoleEntries').catch(() => undefined)
    await cdp.send('HeapProfiler.collectGarbage')
    const { profile } = await cdp.send('HeapProfiler.getSamplingProfile')
    await cdp.send('HeapProfiler.stopSampling')
    writeFileSync(join(out, 'session-heap.heapprofile'), JSON.stringify(profile))
    const probes = await snapshotProbes(cdp)
    writeFileSync(join(out, 'session-probes.json'), JSON.stringify(probes, null, 2))
    say(`session: ${probes.alive} realtime rows alive (newest event ${probes.newestEvent})`)
    const retained = retainedByStack(profile.head as SamplingHeapNode, { frameName: sourceFrameName() })
    const hs = heapStats(heap)
    say(`session: ${cycles} cycles, heap ${hs.startMB} -> ${hs.endMB} MB`)
    return {
      heap,
      heapByStep,
      retained,
      metrics: {
        'session.cycles': cycles,
        'session.heapStartMB': hs.startMB,
        'session.heapEndMB': hs.endMB,
        'session.heapPeakMB': hs.peakMB,
        'session.heapGrowthMB': hs.growthMB,
        // A rate fitted over a few minutes is noise; judged only on a session of 10 minutes or more.
        ...(minutes >= 10 ? { 'session.heapSlopeMBPer10Min': hs.slopeMBPer10Min } : {}),
        'session.longTasks': lt.count,
        'session.totalBlockingMs': lt.totalBlockingMs,
      },
    }
  } catch (error) {
    await writeFailure(out, 'session', launched, error)
    throw error
  } finally {
    await app.close().catch(() => {})
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  mkdirSync(options.out, { recursive: true })
  const reps: Array<Record<string, number>> = []
  let misses: Array<[string, number]> = []
  for (let rep = 1; rep <= options.reps; rep++) {
    const result = await repetition(rep, options.out)
    reps.push(result.metrics)
    if (rep === 1) misses = result.misses
  }
  const session = options.sessionMinutes > 0 ? await longSession(options.sessionMinutes, options.out) : null

  const metrics: Record<string, number> = {}
  for (const key of new Set(reps.flatMap((r) => Object.keys(r)))) {
    metrics[key] = median(reps.map((r) => r[key]).filter((v) => v !== undefined))
  }
  if (session) Object.assign(metrics, session.metrics)

  const result: RenderPerfResult & {
    repetitions: typeof reps
    heap: HeapSample[]
    heapByStep: Record<string, number>
    retained: SessionResult['retained']
    topSelfTime: typeof topSelfTime
    topFunctions: typeof topFunctions
    unmodelled: typeof misses
  } = {
    schema: 1,
    sha: process.env.GITHUB_SHA ?? 'local',
    ref: process.env.GITHUB_REF ?? 'local',
    runId: process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
    date: new Date().toISOString(),
    fileCount: 30_000,
    reps: options.reps,
    sessionMinutes: options.sessionMinutes,
    metrics,
    repetitions: reps,
    heap: session?.heap ?? [],
    heapByStep: session?.heapByStep ?? {},
    retained: session?.retained ?? [],
    topSelfTime,
    topFunctions,
    unmodelled: misses.slice(0, 50),
  }
  writeFileSync(join(options.out, 'result.json'), JSON.stringify(result, null, 2))
  say(`wrote ${join(options.out, 'result.json')}`)
}

main().catch((error: unknown) => {
  process.stderr.write(`[render-perf] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exit(1)
})
