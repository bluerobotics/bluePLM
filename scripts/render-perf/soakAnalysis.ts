/**
 * Soak verdicts: is every sampled series flat once the app has warmed up? Pure, unit-tested.
 *
 * The criterion is slope, not delta. A series sampled over a compressed month is fitted with a
 * Theil-Sen line (the median of pairwise slopes, so one GC-noisy sample cannot move it), and the
 * slope per simulated day is projected to 30 days. A series passes when that projection is within
 * its bound. Samples before `warmupDays` are left out: caches fill and the JIT settles there.
 */
import { median } from './stats'

export interface SoakSample {
  /** Simulated days since the soak started (the fake clock's reading). */
  simDay: number
  /** Real minutes since the soak started. */
  realMinute: number
  values: Record<string, number>
}

export interface SeriesBound {
  /** Allowed growth over 30 simulated days, in the series' own unit. */
  per30Days: number
  /** Also allowed: this fraction of the series' warm median (counts that scale with the vault). */
  relative?: number
}

export interface SeriesVerdict {
  series: string
  samples: number
  first: number
  last: number
  slopePerDay: number
  projected30Days: number
  bound: number
  pass: boolean
}

/**
 * Bounds by series name prefix; the longest matching prefix wins. A series no prefix matches is
 * reported but never fails the run, so a new sampler cannot turn the soak red by itself.
 */
export const SOAK_BOUNDS: Record<string, SeriesBound> = {
  'renderer.heapMB': { per30Days: 32 },
  'renderer.domNodes': { per30Days: 1500 },
  'renderer.jsEventListeners': { per30Days: 100 },
  'renderer.documents': { per30Days: 2 },
  'renderer.timers': { per30Days: 20 },
  'renderer.intervals': { per30Days: 2 },
  'renderer.realtimeChannels': { per30Days: 0.5 },
  'renderer.ipcListeners': { per30Days: 2 },
  'renderer.fakeChannels': { per30Days: 0.5 },
  'renderer.authListeners': { per30Days: 1 },
  'renderer.idbUsageMB': { per30Days: 16 },
  'renderer.caches.': { per30Days: 50, relative: 0.05 },
  'store.': { per30Days: 50, relative: 0.02 },
  'main.heapMB': { per30Days: 16 },
  'main.rssMB': { per30Days: 64 },
  'main.handles.': { per30Days: 5 },
  'main.ipcListeners': { per30Days: 2 },
  'main.webContentsListeners': { per30Days: 5 },
  'main.watchers': { per30Days: 1 },
  'main.logDirMB': { per30Days: 24 },
  'process.': { per30Days: 96 },
  'service.': { per30Days: 64 },
}

export function boundFor(series: string, bounds: Record<string, SeriesBound> = SOAK_BOUNDS): SeriesBound | null {
  let best: string | null = null
  for (const prefix of Object.keys(bounds)) {
    if (series.startsWith(prefix) && (!best || prefix.length > best.length)) best = prefix
  }
  return best ? bounds[best] : null
}

/** Theil-Sen slope: the median of the slopes between every pair of points with distinct x. */
export function theilSen(points: ReadonlyArray<{ x: number; y: number }>): number {
  const slopes: number[] = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x
      if (dx !== 0) slopes.push((points[j].y - points[i].y) / dx)
    }
  }
  return slopes.length ? median(slopes) : 0
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function analyzeSoak(
  samples: readonly SoakSample[],
  options: { warmupDays: number; bounds?: Record<string, SeriesBound> },
): SeriesVerdict[] {
  const warm = samples.filter((s) => s.simDay >= options.warmupDays)
  const names = new Set(warm.flatMap((s) => Object.keys(s.values)))
  const verdicts: SeriesVerdict[] = []
  for (const series of [...names].sort()) {
    const points = warm
      .filter((s) => Number.isFinite(s.values[series]))
      .map((s) => ({ x: s.simDay, y: s.values[series] }))
    if (points.length < 3) continue
    const slopePerDay = theilSen(points)
    const projected = slopePerDay * 30
    const bound = boundFor(series, options.bounds)
    const level = Math.abs(median(points.map((p) => p.y)))
    const allowed = bound ? Math.max(bound.per30Days, (bound.relative ?? 0) * level) : Infinity
    verdicts.push({
      series,
      samples: points.length,
      first: r2(points[0].y),
      last: r2(points[points.length - 1].y),
      slopePerDay: r2(slopePerDay),
      projected30Days: r2(projected),
      bound: Number.isFinite(allowed) ? r2(allowed) : -1,
      pass: projected <= allowed,
    })
  }
  return verdicts
}

export function soakSummary(verdicts: readonly SeriesVerdict[], header: string): string {
  const failed = verdicts.filter((v) => !v.pass)
  const lines = [
    `## ${header}`,
    '',
    failed.length ? `**${failed.length} series grow faster than their bound.**` : 'Every bounded series is flat.',
    '',
    '| Series | Samples | First | Last | Slope / day | Projected 30 d | Bound | |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
    ...verdicts.map(
      (v) =>
        `| ${v.series} | ${v.samples} | ${v.first} | ${v.last} | ${v.slopePerDay} | ${v.projected30Days} | ${v.bound < 0 ? 'none' : v.bound} | ${v.pass ? 'ok' : '**grows**'} |`,
    ),
  ]
  return lines.join('\n') + '\n'
}
