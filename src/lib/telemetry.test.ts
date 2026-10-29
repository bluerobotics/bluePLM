import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('telemetry configuration restore', () => {
  let values: Map<string, string>

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not persist start or stop and restores saved settings stopped', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { telemetry } = await import('./telemetry')

    telemetry.loadConfig()
    telemetry.start()
    expect(values.has('telemetry.config')).toBe(false)
    expect(telemetry.isRunning()).toBe(true)

    telemetry.stop()
    expect(values.has('telemetry.config')).toBe(false)
    expect(telemetry.isRunning()).toBe(false)

    vi.resetModules()
    const disabledReload = await import('./telemetry')
    disabledReload.telemetry.loadConfig()
    expect(disabledReload.telemetry.isRunning()).toBe(false)

    values.set(
      'telemetry.config',
      JSON.stringify({ enabled: true, sampleRateHz: 1, retentionSeconds: 10 }),
    )
    vi.resetModules()
    const optedInReload = await import('./telemetry')
    optedInReload.telemetry.loadConfig()
    expect(optedInReload.telemetry.getConfig().enabled).toBe(false)
    expect(optedInReload.telemetry.isRunning()).toBe(false)
    optedInReload.telemetry.stop()

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('resizes history to restored retention before a manual recording', async () => {
    values.set(
      'telemetry.config',
      JSON.stringify({ enabled: true, sampleRateHz: 60, retentionSeconds: 300 }),
    )
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { telemetry } = await import('./telemetry')

    telemetry.loadConfig()
    expect(telemetry.isRunning()).toBe(false)
    telemetry.start()
    const sample = intervalSpy.mock.calls[0]?.[0]
    expect(typeof sample).toBe('function')
    for (let index = 0; index < 18_001; index++) {
      ;(sample as () => void)()
    }

    expect(telemetry.getHistory()).toHaveLength(18_000)
    expect(telemetry.getConfig()).toEqual({
      enabled: true,
      sampleRateHz: 60,
      retentionSeconds: 300,
    })
    telemetry.stop()
  })

  it('clamps invalid saved settings and remains stopped', async () => {
    values.set(
      'telemetry.config',
      JSON.stringify({ enabled: 'yes', sampleRateHz: 1000, retentionSeconds: -20 }),
    )
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { telemetry } = await import('./telemetry')

    expect(telemetry.loadConfig()).toEqual({
      enabled: false,
      sampleRateHz: 60,
      retentionSeconds: 10,
    })
    expect(telemetry.isRunning()).toBe(false)
    expect(intervalSpy).not.toHaveBeenCalled()
  })

  it('stops a running recording when saved config is loaded', async () => {
    values.set(
      'telemetry.config',
      JSON.stringify({ enabled: true, sampleRateHz: 10, retentionSeconds: 20 }),
    )
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { telemetry } = await import('./telemetry')

    telemetry.start()
    telemetry.loadConfig()

    expect(intervalSpy).toHaveBeenCalledTimes(1)
    expect(telemetry.isRunning()).toBe(false)
    expect(telemetry.getConfig().enabled).toBe(false)
  })

  it('keeps recording usable when browser storage cannot be written', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage unavailable')
      },
    })
    const { telemetry } = await import('./telemetry')

    expect(() => telemetry.start()).not.toThrow()
    expect(telemetry.isRunning()).toBe(true)
    expect(() => telemetry.stop()).not.toThrow()
    expect(telemetry.isRunning()).toBe(false)
  })
})
