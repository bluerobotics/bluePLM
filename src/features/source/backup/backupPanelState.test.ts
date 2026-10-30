// @vitest-environment jsdom
/**
 * What the backup page overhaul fixed, pinned:
 * - the designated computer's backup service runs at app level (useBackupHeartbeat), starts when
 *   this computer is designated and stops when it is released, without the settings page open;
 * - a desktop backup runs through one runner that refuses a second run and marks the
 *   organization's backup started and complete;
 * - the overview's health rules (backupAttention).
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BackupConfig } from '@/lib/backup'

const lib = vi.hoisted(() => ({
  getBackupConfig: vi.fn(),
  isThisDesignatedMachine: vi.fn(),
  startBackupService: vi.fn(),
  stopBackupService: vi.fn(),
  serviceRunning: false,
  markBackupStarted: vi.fn(async () => true),
  markBackupComplete: vi.fn(async () => true),
  runBackup: vi.fn(),
}))

vi.mock('@/lib/backup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/backup')>()
  return {
    ...actual,
    getBackupConfig: lib.getBackupConfig,
    isThisDesignatedMachine: lib.isThisDesignatedMachine,
    startBackupService: (...args: unknown[]) => {
      lib.serviceRunning = true
      lib.startBackupService(...args)
    },
    stopBackupService: () => {
      lib.serviceRunning = false
      lib.stopBackupService()
    },
    isBackupServiceRunning: () => lib.serviceRunning,
    markBackupStarted: lib.markBackupStarted,
    markBackupComplete: lib.markBackupComplete,
    runBackup: lib.runBackup,
  }
})
vi.mock('@/lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/platform')>()),
  hasDesktop: () => true,
}))

const { useBackupHeartbeat } = await import('@/hooks/useBackupHeartbeat')
const { getDesktopBackupState, runDesktopBackup, subscribeDesktopBackup } = await import('@/lib/desktopBackupRunner')
const { backupAttention, STALE_BACKUP_HOURS } = await import('./BackupOverview')

const CONFIG = { org_id: 'org-1', designated_machine_id: 'm-1', is_schedule_enabled: true } as unknown as BackupConfig

beforeEach(() => {
  vi.useFakeTimers()
  lib.serviceRunning = false
  for (const fn of Object.values(lib)) if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset()
  lib.markBackupStarted.mockResolvedValue(true)
  lib.markBackupComplete.mockResolvedValue(true)
  lib.getBackupConfig.mockResolvedValue(CONFIG)
})
afterEach(() => {
  vi.useRealTimers()
})

async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe('app-level backup service (useBackupHeartbeat)', () => {
  it('starts on the designated computer and stops when the designation is released', async () => {
    lib.isThisDesignatedMachine.mockResolvedValue(true)
    const { unmount } = renderHook(() => useBackupHeartbeat('org-1'))
    await flush()
    expect(lib.startBackupService).toHaveBeenCalledTimes(1)

    // Released from another machine: the next minute's check stops the service here.
    lib.isThisDesignatedMachine.mockResolvedValue(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(lib.serviceRunning).toBe(false)

    // Designated again: started again, without a restart of the app.
    lib.isThisDesignatedMachine.mockResolvedValue(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(lib.startBackupService).toHaveBeenCalledTimes(2)

    unmount()
    expect(lib.serviceRunning).toBe(false)
  })

  it('does nothing on a computer that is not designated', async () => {
    lib.isThisDesignatedMachine.mockResolvedValue(false)
    renderHook(() => useBackupHeartbeat('org-1'))
    await flush()
    expect(lib.startBackupService).not.toHaveBeenCalled()
  })
})

describe('desktop backup runner', () => {
  it('backs up each vault, marks the run in the database and reports its state', async () => {
    vi.useRealTimers()
    let release: () => void = () => {}
    lib.runBackup.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve({ success: true, snapshotId: 'abcdef123' }))),
    )
    const states: boolean[] = []
    const unsubscribe = subscribeDesktopBackup((s) => states.push(s.running))
    const notify = vi.fn()

    const run = runDesktopBackup(CONFIG, [{ id: 'v1', name: 'Main', localPath: 'C:/v' }], notify)
    await Promise.resolve()
    expect(getDesktopBackupState().running).toBe(true)

    // A second run while one is running is refused, not started alongside.
    const second = await runDesktopBackup(CONFIG, [{ id: 'v1', name: 'Main', localPath: 'C:/v' }], notify)
    expect(second).toEqual({ succeeded: 0, failed: 0 })
    expect(notify).toHaveBeenCalledWith('info', expect.stringMatching(/already running/))

    await vi.waitFor(() => expect(lib.runBackup).toHaveBeenCalledTimes(1))
    release()
    expect(await run).toEqual({ succeeded: 1, failed: 0 })
    expect(lib.markBackupStarted).toHaveBeenCalledWith('org-1')
    expect(lib.markBackupComplete).toHaveBeenCalledWith('org-1')
    expect(getDesktopBackupState()).toEqual({ running: false, progress: null })
    expect(states[0]).toBe(true)
    expect(states.at(-1)).toBe(false)
    unsubscribe()
  })

  it('refuses to run with no vaults', async () => {
    const notify = vi.fn()
    expect(await runDesktopBackup(CONFIG, [], notify)).toEqual({ succeeded: 0, failed: 0 })
    expect(lib.markBackupStarted).not.toHaveBeenCalled()
  })
})

describe('backupAttention', () => {
  const now = Date.parse('2026-10-30T12:00:00Z')
  const recent = new Date(now - 3_600_000).toISOString()

  it('is quiet for a scheduled, recent, online desktop backup', () => {
    expect(backupAttention(CONFIG, recent, true, now)).toEqual([])
  })

  it('names each problem', () => {
    const stale = new Date(now - (STALE_BACKUP_HOURS + 1) * 3_600_000).toISOString()
    expect(backupAttention(CONFIG, stale, true, now)).toHaveLength(1)
    expect(backupAttention(CONFIG, null, true, now)).toHaveLength(1)
    expect(backupAttention(CONFIG, recent, false, now)).toHaveLength(1)
    expect(backupAttention({ ...CONFIG, designated_machine_id: null }, recent, false, now)).toHaveLength(1)
    expect(backupAttention({ ...CONFIG, is_schedule_enabled: false }, recent, true, now)).toHaveLength(1)
  })

  it('checks the server worker, not a computer, when the server runs backups', () => {
    const server = { ...CONFIG, run_location: 'server', designated_machine_id: null } as BackupConfig
    const seen = new Date(now - 60_000).toISOString()
    expect(backupAttention({ ...server, server_worker_seen_at: seen }, recent, false, now)).toEqual([])
    expect(backupAttention({ ...server, server_worker_seen_at: null }, recent, false, now)).toHaveLength(1)
  })
})
