/**
 * Probes the soak (scripts/render-perf/soak.ts) reads in the page: live timers and intervals, and
 * a fake clock that runs the app's `Date` faster than real time so a month of date-based logic
 * (presence, "last N days", stale checks) passes in hours. CI only, through the perf boot.
 *
 * Both install before any app module is evaluated (boot.ts), so every timer the app makes is seen.
 * Timer delays are not scaled: debounces and retries keep their real lengths.
 */

export interface TimerProbe {
  /** One-shot timers scheduled and not yet fired or cleared. */
  liveTimeouts(): number
  /** Intervals set and not yet cleared. */
  liveIntervals(): number
}

export function installTimerProbe(target: typeof globalThis = globalThis): TimerProbe {
  const timeouts = new Set<unknown>()
  const intervals = new Set<unknown>()
  const realSetTimeout = target.setTimeout.bind(target)
  const realClearTimeout = target.clearTimeout.bind(target)
  const realSetInterval = target.setInterval.bind(target)
  const realClearInterval = target.clearInterval.bind(target)

  const patchedSetTimeout = (handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id: ReturnType<typeof setTimeout> = realSetTimeout(
      (...a: unknown[]) => {
        timeouts.delete(id)
        if (typeof handler === 'function') (handler as (...x: unknown[]) => void)(...a)
      },
      timeout,
      ...args,
    )
    timeouts.add(id)
    return id
  }
  const patchedClearTimeout = (id?: ReturnType<typeof setTimeout>) => {
    timeouts.delete(id)
    intervals.delete(id)
    realClearTimeout(id)
  }
  const patchedSetInterval = (handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = realSetInterval(handler, timeout, ...args)
    intervals.add(id)
    return id
  }
  const patchedClearInterval = (id?: ReturnType<typeof setInterval>) => {
    intervals.delete(id)
    timeouts.delete(id)
    realClearInterval(id)
  }
  Object.assign(target, {
    setTimeout: patchedSetTimeout,
    clearTimeout: patchedClearTimeout,
    setInterval: patchedSetInterval,
    clearInterval: patchedClearInterval,
  })
  return { liveTimeouts: () => timeouts.size, liveIntervals: () => intervals.size }
}

export interface FakeClock {
  /** Simulated milliseconds since the clock was installed. */
  elapsedMs(): number
  /** Jump the clock forward, as a sleep of the machine does. */
  advance(ms: number): void
  /** Run `speed` simulated milliseconds per real one from now on. */
  setSpeed(speed: number): void
}

/**
 * Replace `Date` with one whose "now" runs `speed` times faster than `performance.now()`.
 * `new Date(x)`, `Date.parse` and `Date.UTC` behave as before; only the current time moves, and it
 * never moves backwards when the speed changes.
 */
export function installFakeClock(speed = 1, target: typeof globalThis = globalThis): FakeClock {
  const RealDate = target.Date
  const installedAt = RealDate.now()
  let baseSim = installedAt
  let basePerf = performance.now()
  let rate = speed
  const now = () => baseSim + (performance.now() - basePerf) * rate

  class SoakDate extends RealDate {
    constructor(...args: ConstructorParameters<DateConstructor> | []) {
      if (args.length === 0) super(now())
      else super(...(args as ConstructorParameters<DateConstructor>))
    }

    static now(): number {
      return now()
    }
  }
  target.Date = SoakDate as DateConstructor
  return {
    elapsedMs: () => now() - installedAt,
    advance(ms) {
      baseSim += ms
    },
    setSpeed(next) {
      baseSim = now()
      basePerf = performance.now()
      rate = next
    },
  }
}
