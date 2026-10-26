// @vitest-environment jsdom
/**
 * The soak's page side in jsdom: the perf boot with `?soak=1`, driven through
 * `window.__blueplmSoak` the way scripts/render-perf/soak.ts drives it in Electron. Proves each
 * driver runs against the real App before a weekly CI run spends hours on it, and that a cycle of
 * hours, drops, sleeps and token refreshes leaves the app's subscriptions where they were.
 */
import { cleanup, render } from '@testing-library/react'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { installDomShims } from '@/test/render'

import type { SoakHourSpec } from './soak'

vi.mock('@/lib/supabase/client', async () => await import('./supabaseClient'))

afterAll(async () => {
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 200))
})

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const HOUR: SoakHourSpec = {
  realtimeUpdates: 60,
  inserts: 4,
  activity: 5,
  folderVisits: 1,
  metadataEdits: 3,
  checkouts: 1,
  swCalls: 2,
  watcherBursts: 1,
}

describe('soak boot', () => {
  it('runs every driver over the real App and leaves its subscriptions level', async () => {
    window.history.replaceState({}, '', '/perf.html?soak=1')
    installDomShims()
    const { installPerfBoot } = await import('./boot')
    await installPerfBoot(400)
    const { App } = await import('@/app/App')
    render(<App />)

    const perf = window.__blueplmPerf!
    const deadline = Date.now() + 45_000
    while (!perf.loaded && Date.now() < deadline) await pause(100)
    expect(perf.loaded).toBeTruthy()
    const soak = window.__blueplmSoak!
    expect(soak).toBeDefined()

    await perf.waitForQuiet(300, 10_000)
    const before = await soak.sample()
    expect(before['renderer.realtimeChannels']).toBeGreaterThan(0)
    expect(before['store.files']).toBeGreaterThanOrEqual(400)

    soak.setClockSpeed(200)
    for (let cycle = 0; cycle < 3; cycle++) {
      const result = await soak.hour(HOUR)
      expect(result.delivered).toBeGreaterThan(0)
      expect(soak.tokenRefresh()).toBeGreaterThan(0)
      expect(soak.dropNetwork()).toBeGreaterThan(0)
      expect(soak.restoreNetwork()).toBeGreaterThan(0)
      await soak.sleepWake(10 * 3_600_000)
      await perf.waitForQuiet(300, 10_000)
    }
    expect(soak.simElapsedMs()).toBeGreaterThan(30 * 3_600_000)

    const after = await soak.sample()
    for (const series of ['renderer.realtimeChannels', 'renderer.fakeChannels', 'renderer.ipcListeners', 'renderer.authListeners']) {
      expect(after[series], series).toBe(before[series])
    }
    // Inserted rows are deleted again an hour later: the vault stays its size, plus the last
    // hour's inserts and the one folder they live in.
    expect(after['store.files']).toBeLessThanOrEqual(before['store.files'] + HOUR.inserts + 1)
  }, 120_000)

  it('the health monitor brings back realtime that died without a rejoin', async () => {
    const soak = window.__blueplmSoak!
    const { getAppHealthMonitor } = await import('@/lib/health/appHealthMonitor')
    const monitor = getAppHealthMonitor()!
    expect(monitor).not.toBeNull()
    const channels = (await soak.sample())['renderer.fakeChannels']

    expect(soak.killRealtimeSilently()).toBeGreaterThan(0)
    await monitor.tick() // first seen errored
    soak.catchUpClock(soak.simElapsedMs() + 4 * 60_000)
    const made = await monitor.tick()
    expect(made.map((r) => r.kind)).toContain('realtime-resubscribed')

    const after = await soak.sample()
    expect(after['renderer.fakeChannels']).toBe(channels)
    expect(after['events.health.realtime-resubscribed']).toBe(1)
  }, 60_000)
})
