import { describe, expect, it } from 'vitest'

import { analyzeSoak, boundFor, soakSummary, theilSen, type SoakSample } from './soakAnalysis'

const sample = (simDay: number, values: Record<string, number>): SoakSample => ({
  simDay,
  realMinute: simDay * 10,
  values,
})

describe('theilSen', () => {
  it('recovers a straight line', () => {
    expect(theilSen([0, 1, 2, 3].map((x) => ({ x, y: 2 * x + 5 })))).toBe(2)
  })

  it('ignores one outlier that would tilt least squares', () => {
    const points = [0, 1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 100 }))
    points[6].y = 400
    expect(theilSen(points)).toBe(0)
  })

  it('is zero with fewer than two distinct x', () => {
    expect(theilSen([{ x: 1, y: 3 }])).toBe(0)
    expect(theilSen([{ x: 1, y: 3 }, { x: 1, y: 9 }])).toBe(0)
  })
})

describe('boundFor', () => {
  it('takes the longest matching prefix', () => {
    expect(boundFor('renderer.heapMB')?.per30Days).toBe(32)
    expect(boundFor('store.files', { 'store.': { per30Days: 1 }, 'store.files': { per30Days: 9 } })?.per30Days).toBe(9)
    expect(boundFor('unknown.series')).toBeNull()
  })
})

describe('analyzeSoak', () => {
  it('passes a flat series and fails a growing one, ignoring warmup', () => {
    const samples = Array.from({ length: 31 }, (_, day) =>
      sample(day, {
        // Warmup climbs, then flat.
        'renderer.heapMB': day < 3 ? 50 + day * 40 : 170 + (day % 2),
        // 2 MB a day: 60 MB over 30 days, over the 32 MB bound.
        'main.heapMB': 40 + day * 2,
      }),
    )
    const verdicts = analyzeSoak(samples, { warmupDays: 3 })
    const byName = Object.fromEntries(verdicts.map((v) => [v.series, v]))
    expect(byName['renderer.heapMB'].pass).toBe(true)
    expect(byName['renderer.heapMB'].slopePerDay).toBe(0)
    expect(byName['main.heapMB'].pass).toBe(false)
    expect(byName['main.heapMB'].projected30Days).toBe(60)
  })

  it('scales the bound with the level for relative series', () => {
    // 30k files growing by 10 a day is 300 over 30 days: under 2% of their level (about 600).
    const samples = Array.from({ length: 10 }, (_, day) => sample(day, { 'store.files': 30_000 + day * 10 }))
    const [verdict] = analyzeSoak(samples, { warmupDays: 0 })
    expect(verdict.bound).toBeCloseTo(600.9, 1)
    expect(verdict.pass).toBe(true)
  })

  it('reports an unbounded series without failing it', () => {
    const samples = Array.from({ length: 5 }, (_, day) => sample(day, { 'novel.counter': day * 1000 }))
    const [verdict] = analyzeSoak(samples, { warmupDays: 0 })
    expect(verdict.bound).toBe(-1)
    expect(verdict.pass).toBe(true)
  })

  it('skips series with fewer than three warm samples', () => {
    expect(analyzeSoak([sample(5, { a: 1 }), sample(6, { a: 2 })], { warmupDays: 0 })).toEqual([])
  })

  it('summarises as a markdown table that names the failing series', () => {
    const samples = Array.from({ length: 5 }, (_, day) => sample(day, { 'renderer.timers': day * 10 }))
    const text = soakSummary(analyzeSoak(samples, { warmupDays: 0 }), 'Soak')
    expect(text).toContain('1 series grow faster')
    expect(text).toContain('| renderer.timers |')
    expect(text).toContain('**grows**')
  })
})
