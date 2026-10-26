/**
 * Render-performance boot, CI only (.github/workflows/render-perf.yml).
 *
 * On when the app is unpackaged and started with BLUEPLM_PERF_BOOT=1; inert in every packaged
 * build, whatever the environment says. When on, the main process:
 * - keeps its state in BLUEPLM_PERF_USER_DATA, so each run starts cold (set here, before any
 *   module reads the userData path; main.ts imports this module first),
 * - loads `dist/perf.html`, which the perf build alone emits (src/perf/app/boot.ts),
 * - cancels every network request from the window,
 * - passes PERF_BOOT_ARG to the preload, which then exposes the real API as `electronAPIReal`
 *   so the renderer can install its fakes as `electronAPI`.
 */
import { app } from 'electron'

import { isPerfBootRequested } from './perfBootFlag'

export { PERF_BOOT_ARG } from './perfBootFlag'

export const isPerfBoot = isPerfBootRequested(app.isPackaged, process.env)

/** A perf boot the soak drives (scripts/render-perf/soak.ts): main-process probes, `?soak=1` page. */
export const isSoakBoot = isPerfBoot && process.env.BLUEPLM_PERF_SOAK === '1'

if (isPerfBoot && process.env.BLUEPLM_PERF_USER_DATA) {
  app.setPath('userData', process.env.BLUEPLM_PERF_USER_DATA)
}

/** URL patterns the perf boot cancels: the window works from the fakes alone. */
export const PERF_BLOCKED_URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*']
