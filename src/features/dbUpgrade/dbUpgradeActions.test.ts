/**
 * The gate never retries a failed automatic upgrade on its own (audit H1). With a remembered
 * connection, a run whose verification withheld the stamp used to "succeed" as up to date,
 * reload, find the database still below 500 and run again, every two seconds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./readDbState', () => ({
  readRecordedVersion: vi.fn(async () => ({ ok: true, version: 112 })),
  readClientMinVersion: vi.fn(async () => null),
  readIsOrgAdmin: vi.fn(async () => true),
}))
vi.mock('@/lib/platform', () => ({ hasDesktop: () => true, IS_WEB_BUILD: false }))

import { usePDMStore } from '@/stores/pdmStore'
import { INITIAL_DB_GATE, INITIAL_DB_UPGRADE_RUN } from '@/stores/slices/dbUpgradeSlice'
import type { DbUpgradeApplyResult } from '@/types/electron/dbUpgrade'

import { resetAutoApplyForTests, runDbGateCheck, setReloadForTests } from './dbUpgradeActions'

const verifyFailed: DbUpgradeApplyResult = {
  success: false,
  plan: null,
  appliedSteps: [],
  finalVersion: 112,
  error: {
    step: { kind: 'verify', version: null, name: 'tools/verify-schema.sql' },
    file: 'tools/verify-schema.sql',
    message: 'Schema verification failed',
    code: 'P0001',
    detail: null,
    hint: null,
    where: null,
    line: null,
    statement: null,
  },
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0))
}

let apply: ReturnType<typeof vi.fn>
let reload: ReturnType<typeof vi.fn<() => void>>

function installBridge(result: DbUpgradeApplyResult) {
  apply = vi.fn(async () => ({ success: result.success, result }))
  reload = vi.fn<() => void>()
  const fakeWindow = {
    electronAPI: {
      dbUpgrade: {
        getCredentialStatus: vi.fn(async () => ({ held: false, remembered: true, canRemember: true })),
        apply,
        onProgress: () => () => {},
      },
    },
  }
  vi.stubGlobal('window', fakeWindow)
  setReloadForTests(reload)
}

beforeEach(() => {
  vi.useRealTimers()
  resetAutoApplyForTests()
  usePDMStore.setState({ dbGate: INITIAL_DB_GATE, dbUpgradeRun: INITIAL_DB_UPGRADE_RUN })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('automatic upgrade with a remembered connection', () => {
  it('a failed verify shows its error and is not retried by later gate checks', async () => {
    installBridge(verifyFailed)

    await runDbGateCheck('user-1', 'admin@example.com')
    await flush()
    expect(usePDMStore.getState().dbGate.status).toBe('db-upgrade-admin')
    expect(apply).toHaveBeenCalledTimes(1)
    expect(usePDMStore.getState().dbUpgradeRun.phase).toBe('failed')
    expect(usePDMStore.getState().dbUpgradeRun.result?.error?.step?.kind).toBe('verify')

    // The half-hourly re-check, or a "Check again", must not start another automatic run.
    await runDbGateCheck('user-1', 'admin@example.com')
    await flush()
    usePDMStore.getState().resetDbUpgradeRun()
    await runDbGateCheck('user-1', 'admin@example.com')
    await flush()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
  })

  it('a run that reports success but leaves the database below 500 does not reload', async () => {
    installBridge({ ...verifyFailed, success: true, error: null })

    await runDbGateCheck('user-1', 'admin@example.com')
    await flush()
    await new Promise((r) => setTimeout(r, 2100))
    expect(reload).not.toHaveBeenCalled()
    const run = usePDMStore.getState().dbUpgradeRun
    expect(run.phase).toBe('failed')
    expect(run.result?.error?.message).toContain('112')
  })
})
