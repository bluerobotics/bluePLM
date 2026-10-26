/**
 * Soak runner: one app process left running for a compressed month of use, sampled twice a
 * simulated day, judged on slope. CI only (.github/workflows/soak.yml). Never run it on a
 * developer machine: it opens the app.
 *
 *   BLUEPLM_PERF_BUILD=1 npx vite build
 *   npx tsx scripts/render-perf/soak.ts --out soak-out [--days 30] [--hours 4.5]
 *
 * A simulated day is 14 working hours and a 10-hour sleep. Each working hour runs the page's
 * `__blueplmSoak.hour()` (src/perf/app/soak.ts): other users' realtime traffic, folder browsing,
 * metadata edits, checkouts, SolidWorks service calls and watcher bursts. Each day also has four
 * network drops with rejoins, a token refresh every hour and the sleep (renderer hidden and
 * offline, the clock jumped, the main process told suspend and resume). Every few days all
 * realtime channels die without rejoining, and the health monitor must bring them back.
 *
 * The page's `Date` runs fast (soakProbes.ts) so date-based logic sees the month; timer delays
 * stay real. After `--warmup-days`, every bounded series must be flat: its Theil-Sen slope
 * projected to 30 days within its bound (soakAnalysis.ts).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron, type CDPSession, type ElectronApplication, type Page } from 'playwright'

// window.__blueplmSoak's type (a global augmentation).
import type { SoakHourSpec } from '../../src/perf/app/soak'

import { analyzeSoak, soakSummary, type SoakSample } from './soakAnalysis'

interface Options {
  out: string
  days: number
  hours: number
  warmupDays: number
}

function parseArgs(argv: string[]): Options {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  // An empty argument (a scheduled run has no inputs) falls back to the environment, then the default.
  return {
    out: get('out') || 'soak-out',
    days: Number(get('days') || process.env.SOAK_DAYS || 30),
    hours: Number(get('hours') || process.env.SOAK_HOURS || 4.5),
    warmupDays: Number(get('warmup-days') || process.env.SOAK_WARMUP_DAYS || 3),
  }
}

const WORK_HOURS = 14
const SLEEP_HOURS = 24 - WORK_HOURS
const HOUR_MS = 3_600_000
const DROP_HOURS = new Set([2, 6, 9, 12])
const SAMPLE_HOURS = new Set([0, 7])
/** Days on which every channel dies silently; the health monitor must recover it. */
const SILENT_DEATH_EVERY_DAYS = 6
const RECOVERY_DEADLINE_MS = 6 * 60_000
/** Quiet time before a sample: longer than the app's debounces (watcher, realtime, toasts). */
const SETTLE_MS = 20_000

/** One working hour of a busy office (about 40 users): 2,100 file updates a simulated day. */
const HOUR: SoakHourSpec = {
  realtimeUpdates: 150,
  inserts: 6,
  activity: 40,
  folderVisits: 2,
  metadataEdits: 6,
  checkouts: 2,
  swCalls: 10,
  watcherBursts: 2,
}

function say(message: string): void {
  process.stdout.write(`[soak] ${message}\n`)
}

async function launch(): Promise<{ app: ElectronApplication; page: Page; cdp: CDPSession; logs: string[] }> {
  const userData = mkdtempSync(join(tmpdir(), 'blueplm-soak-'))
  const app = await _electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      BLUEPLM_PERF_BOOT: '1',
      BLUEPLM_PERF_SOAK: '1',
      BLUEPLM_PERF_USER_DATA: userData,
      NODE_ENV: 'production',
    },
    timeout: 120_000,
  })
  const logs: string[] = []
  const listen = (w: Page) => {
    w.on('console', (message) => {
      if (message.type() !== 'error' && message.type() !== 'warning') return
      if (logs.length >= 400) logs.shift()
      logs.push(`${message.type()}: ${message.text().slice(0, 400)}`)
    })
    w.on('pageerror', (error) => logs.push(`pageerror: ${error.stack ?? error.message}`))
  }
  app.windows().forEach(listen)
  app.on('window', listen)
  const deadline = Date.now() + 120_000
  let page: Page | undefined
  while (!page && Date.now() < deadline) {
    page = app.windows().find((w) => w.url().includes('/perf.html'))
    if (!page) await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!page) throw new Error(`no perf.html window; windows: ${app.windows().map((w) => w.url()).join(', ')}`)
  const cdp = await page.context().newCDPSession(page)
  return { app, page, cdp, logs }
}

async function rendererCounters(cdp: CDPSession): Promise<Record<string, number>> {
  // DevTools keeps every console message's arguments alive; users run without it (see run.ts).
  await cdp.send('Runtime.discardConsoleEntries').catch(() => undefined)
  await cdp.send('HeapProfiler.collectGarbage')
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  const counters = (await cdp.send('Memory.getDOMCounters')) as { documents: number; nodes: number; jsEventListeners: number }
  return {
    'renderer.heapMB': usedSize / (1024 * 1024),
    'renderer.documents': counters.documents,
    'renderer.domNodesAll': counters.nodes,
    'renderer.jsEventListeners': counters.jsEventListeners,
  }
}

async function mainCounters(app: ElectronApplication): Promise<Record<string, number>> {
  return app.evaluate(async () => {
    const probe = (globalThis as { __blueplmSoakMain?: { sample(): Promise<Record<string, number>> } }).__blueplmSoakMain
    return probe ? probe.sample() : {}
  })
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  mkdirSync(options.out, { recursive: true })
  const realBudgetMs = options.hours * HOUR_MS
  const workHours = options.days * WORK_HOURS
  // The app's clock runs at the month's pace; each hour's end also catches it up to the schedule.
  const clockSpeed = (options.days * 24 * HOUR_MS) / realBudgetMs
  say(`${options.days} simulated days in ${options.hours} h: ${workHours} working hours, clock x${clockSpeed.toFixed(0)}`)

  const { app, page, cdp, logs } = await launch()
  const samples: SoakSample[] = []
  const recoveries: Array<{ day: number; recovered: boolean; waitedMs: number }> = []
  const totals = { delivered: 0, checkoutsOk: 0, checkoutsFailed: 0, swOk: 0, swFailed: 0, drops: 0, sleeps: 0, tokenRefreshes: 0 }
  const startedAt = Date.now()
  let failure: unknown = null

  const sample = async (simDay: number) => {
    // At rest, so each sample sees the app between bursts, not in the middle of one: debounces and
    // the reloads a rejoin starts have run out.
    await page.evaluate(() => window.__blueplmPerf!.waitForQuiet(2000, 60_000))
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    await page.evaluate(() => window.__blueplmPerf!.waitForQuiet(1000, 30_000))
    const values: Record<string, number> = {
      ...(await rendererCounters(cdp)),
      ...(await page.evaluate(() => window.__blueplmSoak!.sample())),
      ...(await mainCounters(app)),
    }
    samples.push({ simDay: Math.round(simDay * 1000) / 1000, realMinute: Math.round((Date.now() - startedAt) / 600) / 100, values })
    say(`day ${simDay.toFixed(2)}: heap ${values['renderer.heapMB']?.toFixed(1)} MB, main ${values['main.heapMB']?.toFixed(1)} MB, files ${values['store.files']}`)
    writeFileSync(join(options.out, 'samples.json'), JSON.stringify(samples))
  }

  try {
    await page.waitForFunction(
      () => {
        if (document.title.startsWith('perf-boot-failed')) throw new Error(document.title)
        return !!window.__blueplmPerf?.loaded && !!window.__blueplmSoak
      },
      null,
      { timeout: 300_000, polling: 500 },
    )
    await page.evaluate(() => window.__blueplmPerf!.waitForQuiet(2000, 120_000))
    await page.evaluate((speed) => window.__blueplmSoak!.setClockSpeed(speed), clockSpeed)

    for (let day = 0; day < options.days; day++) {
      for (let hour = 0; hour < WORK_HOURS; hour++) {
        const simDay = day + hour / 24
        // Each working hour has its slot of the real budget; what the work leaves is idle time,
        // in which the app's own timers (health checks, refreshes, retries) run as they would.
        const slotEnds = startedAt + ((day * WORK_HOURS + hour + 1) * realBudgetMs) / workHours
        if (SAMPLE_HOURS.has(hour)) await sample(simDay)

        const result = await page.evaluate((spec) => window.__blueplmSoak!.hour(spec), HOUR)
        totals.delivered += result.delivered
        totals.checkoutsOk += result.checkouts.ok
        totals.checkoutsFailed += result.checkouts.failed
        totals.swOk += result.swCalls.ok
        totals.swFailed += result.swCalls.failed
        totals.tokenRefreshes += await page.evaluate(() => window.__blueplmSoak!.tokenRefresh())

        if (DROP_HOURS.has(hour)) {
          await page.evaluate(() => window.__blueplmSoak!.dropNetwork())
          await new Promise((resolve) => setTimeout(resolve, 1500))
          await page.evaluate(() => window.__blueplmSoak!.restoreNetwork())
          totals.drops++
        }

        if (hour === 10 && day > 0 && day % SILENT_DEATH_EVERY_DAYS === 0) {
          const before = await page.evaluate(() => window.__blueplmSoak!.sample())
          const resubscribed = (v: Record<string, number>) => v['events.health.realtime-resubscribed'] ?? 0
          await page.evaluate(() => window.__blueplmSoak!.killRealtimeSilently())
          const waitStart = Date.now()
          let recovered = false
          while (Date.now() - waitStart < RECOVERY_DEADLINE_MS) {
            await new Promise((resolve) => setTimeout(resolve, 5000))
            const now = await page.evaluate(() => window.__blueplmSoak!.sample())
            if (resubscribed(now) > resubscribed(before)) {
              recovered = true
              break
            }
          }
          recoveries.push({ day, recovered, waitedMs: Date.now() - waitStart })
          say(`day ${day}: silent realtime death ${recovered ? 'recovered' : 'NOT recovered'} after ${Math.round((Date.now() - waitStart) / 1000)} s`)
          if (!recovered) await page.evaluate(() => window.__blueplmSoak!.restoreNetwork())
        }

        const idle = slotEnds - Date.now()
        if (idle > 0) await new Promise((resolve) => setTimeout(resolve, idle))
        // Keep the app's clock on the schedule: never behind the hours done.
        await page.evaluate((t) => window.__blueplmSoak!.catchUpClock(t), (day * 24 + hour + 1) * HOUR_MS)
      }

      // The night: suspend, a 10-hour jump of the app's clock, resume.
      await app.evaluate(() => (globalThis as { __blueplmSoakMain?: { suspend(): void } }).__blueplmSoakMain?.suspend())
      await page.evaluate((ms) => window.__blueplmSoak!.sleepWake(ms), SLEEP_HOURS * HOUR_MS)
      await app.evaluate(() => (globalThis as { __blueplmSoakMain?: { resume(): void } }).__blueplmSoakMain?.resume())
      totals.sleeps++
      const elapsed = Date.now() - startedAt
      say(`day ${day + 1}/${options.days} done in ${Math.round(elapsed / 60_000)} min`)
      if (elapsed > realBudgetMs * 1.25) {
        say(`over the time budget; stopping after ${day + 1} days`)
        break
      }
    }
    await sample(samples.length ? Math.ceil(samples[samples.length - 1].simDay) : 0)
  } catch (error) {
    failure = error
    process.stderr.write(`[soak] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  } finally {
    await app.close().catch(() => {})
  }

  const verdicts = analyzeSoak(samples, { warmupDays: options.warmupDays })
  const failed = verdicts.filter((v) => !v.pass)
  const unrecovered = recoveries.filter((r) => !r.recovered)
  const summary =
    soakSummary(verdicts, `Soak: ${samples.length ? samples[samples.length - 1].simDay : 0} simulated days`) +
    `\nRealtime events delivered: ${totals.delivered}. Checkouts ${totals.checkoutsOk} ok / ${totals.checkoutsFailed} failed. ` +
    `Service calls ${totals.swOk} ok / ${totals.swFailed} failed. Drops ${totals.drops}, sleeps ${totals.sleeps}, token refreshes ${totals.tokenRefreshes}.\n` +
    `Silent realtime deaths: ${recoveries.length}, recovered ${recoveries.length - unrecovered.length}.\n` +
    (failure ? `\n**The soak stopped early:** ${failure instanceof Error ? failure.message : String(failure)}\n` : '')
  writeFileSync(join(options.out, 'summary.md'), summary)
  writeFileSync(
    join(options.out, 'soak-result.json'),
    JSON.stringify(
      {
        schema: 1,
        sha: process.env.GITHUB_SHA ?? 'local',
        ref: process.env.GITHUB_REF ?? 'local',
        runId: process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
        date: new Date().toISOString(),
        options,
        hour: HOUR,
        totals,
        recoveries,
        verdicts,
        samples,
        consoleErrors: logs.slice(-100),
        failure: failure ? String(failure) : null,
      },
      null,
      2,
    ),
  )
  say(`wrote ${options.out}/soak-result.json; ${failed.length} series grow, ${unrecovered.length} unrecovered`)
  process.exit(failure || failed.length || unrecovered.length ? 1 : 0)
}

main().catch((error: unknown) => {
  process.stderr.write(`[soak] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exit(1)
})
