import { describe, expect, it } from 'vitest'

import { dueSlot, latestSlot, nextSlot, zonedTimeToUtc } from './schedule.js'

const at = (iso: string) => Date.parse(iso)
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

describe('backup schedule', () => {
  const nightly = { enabled: true, hour: 2, minute: 30, timezone: 'America/Los_Angeles' }

  it('converts wall-clock time in a zone, across daylight saving', () => {
    expect(iso(zonedTimeToUtc(2026, 7, 1, 2, 30, 'America/Los_Angeles'))).toBe('2026-07-01T09:30:00.000Z')
    expect(iso(zonedTimeToUtc(2026, 12, 1, 2, 30, 'America/Los_Angeles'))).toBe('2026-12-01T10:30:00.000Z')
    // 2:30 does not exist on 2026-03-08 in Los Angeles: it becomes 3:30 PDT that morning.
    expect(iso(zonedTimeToUtc(2026, 3, 8, 2, 30, 'America/Los_Angeles'))).toBe('2026-03-08T10:30:00.000Z')
    // 1:30 happens twice on 2026-11-01: the first (PDT) is the slot.
    expect(iso(zonedTimeToUtc(2026, 11, 1, 1, 30, 'America/Los_Angeles'))).toBe('2026-11-01T08:30:00.000Z')
    expect(iso(zonedTimeToUtc(2026, 3, 29, 1, 30, 'Europe/London'))).toBe('2026-03-29T01:30:00.000Z')
    expect(iso(zonedTimeToUtc(2026, 7, 1, 0, 0, 'Asia/Kolkata'))).toBe('2026-06-30T18:30:00.000Z')
    expect(iso(zonedTimeToUtc(2026, 3, 8, 2, 30, 'Not/AZone'))).toBe('2026-03-08T02:30:00.000Z')
  })

  it('finds the latest and next slot', () => {
    expect(iso(latestSlot(nightly, at('2026-07-01T12:00:00Z')))).toBe('2026-07-01T09:30:00.000Z')
    expect(iso(latestSlot(nightly, at('2026-07-01T08:00:00Z')))).toBe('2026-06-30T09:30:00.000Z')
    expect(iso(nextSlot(nightly, at('2026-07-01T08:00:00Z')))).toBe('2026-07-01T09:30:00.000Z')
    expect(iso(nextSlot(nightly, at('2026-07-01T09:30:00Z')))).toBe('2026-07-02T09:30:00.000Z')
  })

  it('runs a slot once, and not again until the next one', () => {
    const now = at('2026-07-01T09:31:00Z')
    const slot = dueSlot(nightly, now, '2026-06-30T09:30:00.000Z')
    expect(iso(slot)).toBe('2026-07-01T09:30:00.000Z')
    expect(dueSlot(nightly, now + 60_000, slot)).toBeNull()
    expect(dueSlot(nightly, at('2026-07-02T09:29:00Z'), slot)).toBeNull()
    expect(iso(dueSlot(nightly, at('2026-07-02T09:30:00Z'), slot))).toBe('2026-07-02T09:30:00.000Z')
  })

  it('catches up a missed slot once, however long the runner was down', () => {
    // Down from 2026-06-28 to the afternoon of 2026-07-01.
    const slot = dueSlot(nightly, at('2026-07-01T22:00:00Z'), '2026-06-28T09:30:00.000Z')
    expect(iso(slot)).toBe('2026-07-01T09:30:00.000Z')
    expect(dueSlot(nightly, at('2026-07-01T22:01:00Z'), slot)).toBeNull()
  })

  it('takes a first backup as soon as a schedule is enabled, and none while disabled', () => {
    expect(dueSlot(nightly, at('2026-07-01T22:00:00Z'), null)).not.toBeNull()
    expect(dueSlot({ ...nightly, enabled: false }, at('2026-07-01T22:00:00Z'), null)).toBeNull()
  })

  it('runs exactly once a local day through a whole year of hourly ticks, DST included', () => {
    let last: number | null = null
    const runs: number[] = []
    for (let t = at('2026-01-01T00:00:00Z'); t < at('2027-01-01T00:00:00Z'); t += 60 * 60_000) {
      const slot = dueSlot(nightly, t, last)
      if (slot !== null) {
        runs.push(slot)
        last = slot
      }
    }
    // The first tick catches up 2025-12-31's slot; then one per day of 2026.
    expect(runs.length).toBe(366)
    const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' })
    expect(new Set(runs.map((r) => localDay.format(r))).size).toBe(366)
  })
})
