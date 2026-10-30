/**
 * When a scheduled backup is due.
 *
 * A schedule is one wall-clock time per day in a time zone. The runner keeps
 * the last slot it ran (`backup_config.last_scheduled_slot`) and asks for the
 * most recent slot at or before now: if that slot is newer than the last one
 * run, it is due. A runner that was down at the scheduled minute therefore runs
 * the missed slot as soon as it is back, once, instead of skipping the day (the
 * desktop scheduler before schedule 113 matched the exact minute and lost any
 * slot it was not awake for). A runner down for several days runs only the
 * latest slot: one fresh backup, not a backlog of identical ones.
 *
 * No last slot means the schedule has never run, and the most recent slot is
 * due: enabling a schedule takes a first backup right away.
 *
 * Pure and dependency-free: the API worker and the desktop renderer both use it.
 */

export interface BackupSchedule {
  enabled: boolean
  hour: number
  minute: number
  /** IANA zone; an unknown zone falls back to UTC. */
  timezone: string
}

const DAY_MS = 24 * 60 * 60 * 1000

// Building a DateTimeFormat costs far more than using one, so one per zone.
const formatters = new Map<string, Intl.DateTimeFormat | null>()

function formatter(timezone: string): Intl.DateTimeFormat | null {
  if (!formatters.has(timezone)) {
    try {
      formatters.set(
        timezone,
        new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hourCycle: 'h23',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
        }),
      )
    } catch {
      formatters.set(timezone, null)
    }
  }
  return formatters.get(timezone) ?? null
}

function validZone(timezone: string): string {
  return formatter(timezone) ? timezone : 'UTC'
}

/** The wall-clock fields of `instant` in `timezone`. */
function wallClock(instant: number, timezone: string) {
  const parts = (formatter(timezone) ?? formatter('UTC')!).formatToParts(new Date(instant))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** Offset of `timezone` from UTC at `instant`, in milliseconds. */
function zoneOffset(instant: number, timezone: string): number {
  const w = wallClock(instant, timezone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

/**
 * The instant at which the wall clock in `timezone` reads the given date and
 * time. A time that does not exist (the hour skipped at a spring-forward
 * change) resolves to the later candidate, so 2:30 becomes 3:30 that morning; a
 * time that exists twice (fall back) resolves to the first. This is the
 * "compatible" disambiguation of Temporal and of most calendars.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): number {
  const zone = validZone(timezone)
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const first = guess - zoneOffset(guess, zone)
  const second = guess - zoneOffset(first, zone)
  const reads = (instant: number) => {
    const w = wallClock(instant, zone)
    return w.year === year && w.month === month && w.day === day && w.hour === hour && w.minute === minute
  }
  const matching = [first, second].filter(reads).sort((a, b) => a - b)
  if (matching.length > 0) return matching[0]
  return Math.max(first, second)
}

/** The most recent scheduled slot at or before `now` (epoch ms). */
export function latestSlot(schedule: BackupSchedule, now: number): number {
  const zone = validZone(schedule.timezone)
  const today = wallClock(now, zone)
  const slotToday = zonedTimeToUtc(today.year, today.month, today.day, schedule.hour, schedule.minute, zone)
  if (slotToday <= now) return slotToday
  const yesterday = wallClock(now - DAY_MS, zone)
  return zonedTimeToUtc(yesterday.year, yesterday.month, yesterday.day, schedule.hour, schedule.minute, zone)
}

/** The next scheduled slot strictly after `now` (epoch ms). */
export function nextSlot(schedule: BackupSchedule, now: number): number {
  const zone = validZone(schedule.timezone)
  const today = wallClock(now, zone)
  const slotToday = zonedTimeToUtc(today.year, today.month, today.day, schedule.hour, schedule.minute, zone)
  if (slotToday > now) return slotToday
  const tomorrow = wallClock(now + DAY_MS, zone)
  return zonedTimeToUtc(tomorrow.year, tomorrow.month, tomorrow.day, schedule.hour, schedule.minute, zone)
}

/**
 * The slot to run now, or null when nothing is due. `lastRunSlot` is the slot
 * the runner last started (ISO string or epoch ms), whatever its outcome: a
 * failed run is reported, not retried every minute until the next slot.
 */
export function dueSlot(
  schedule: BackupSchedule,
  now: number,
  lastRunSlot: string | number | null | undefined,
): number | null {
  if (!schedule.enabled) return null
  const slot = latestSlot(schedule, now)
  if (lastRunSlot === null || lastRunSlot === undefined || lastRunSlot === '') return slot
  const last = typeof lastRunSlot === 'number' ? lastRunSlot : Date.parse(lastRunSlot)
  if (Number.isNaN(last)) return slot
  return slot > last ? slot : null
}
