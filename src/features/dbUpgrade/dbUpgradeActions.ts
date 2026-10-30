/**
 * The gate check and the upgrade run, as plain functions over the store so the screens, the
 * launch check and "Check again" share one path.
 */
import { usePDMStore } from '@/stores/pdmStore'
import { getCurrentConfig } from '@/lib/supabase'
import { log } from '@/lib/logger'
import { hasDesktop } from '@/lib/platform'
import type { DbUpgradeContext } from '@/types/electron/dbUpgrade'

import { decideGate, REQUIRED_SCHEMA_VERSION } from './gateDecision'
import { readClientMinVersion, readIsOrgAdmin, readRecordedVersion } from './readDbState'

export const APP_VERSION: string = import.meta.env.PACKAGE_VERSION || '0.0.0'

/** After a successful upgrade the app reloads, so every slice reads the new schema from scratch. */
const RELOAD_AFTER_SUCCESS_MS = 2000

let checkInFlight: Promise<void> | null = null

export function dbUpgradeContext(): DbUpgradeContext | null {
  // Only offered to a signed-in user the gate sent to the admin screen.
  if (!usePDMStore.getState().dbGate.userId) return null
  return { supabaseUrl: getCurrentConfig()?.url ?? null }
}

/**
 * Reads the database and decides the gate for this user. A read that fails for network reasons
 * keeps the previous decision (or lets the app through on the first check): the app's own
 * offline handling covers that, and blocking on a timeout would lock people out for nothing.
 */
export function runDbGateCheck(userId: string, userEmail: string | null): Promise<void> {
  checkInFlight ??= (async () => {
    const store = usePDMStore.getState()
    if (store.dbGate.userId !== userId) {
      store.setDbGate({ status: 'checking', userId, userEmail, recordedVersion: null })
    }
    try {
      const recorded = await readRecordedVersion()
      if (!recorded.ok) {
        if (usePDMStore.getState().dbGate.status === 'checking') {
          usePDMStore.getState().setDbGate({ status: 'clear' })
        }
        return
      }
      const clientMinVersion = await readClientMinVersion()
      const needsUpgrade =
        recorded.version === null || recorded.version < REQUIRED_SCHEMA_VERSION
      const isAdmin = needsUpgrade ? await readIsOrgAdmin() : false
      const decision = decideGate({
        appVersion: APP_VERSION,
        recordedVersion: recorded.version,
        clientMinVersion,
        isAdmin,
        hasDesktop: hasDesktop(),
      })
      log.info('[DbUpgrade]', 'Gate decided', {
        decision,
        recordedVersion: recorded.version,
        clientMinVersion,
      })
      usePDMStore.getState().setDbGate({
        status: decision,
        recordedVersion: recorded.version,
        clientMinVersion,
        userId,
        userEmail,
        checkedAt: Date.now(),
      })
      if (decision === 'db-upgrade-admin') void maybeAutoApply()
    } catch (error) {
      log.error('[DbUpgrade]', 'Gate check failed', { error: String(error) })
    }
  })().finally(() => {
    checkInFlight = null
  })
  return checkInFlight
}

/** With a connection remembered on this computer for this admin, upgrade without asking. */
async function maybeAutoApply(): Promise<void> {
  const api = window.electronAPI?.dbUpgrade
  const ctx = dbUpgradeContext()
  if (!api || !ctx) return
  if (usePDMStore.getState().dbUpgradeRun.phase !== 'idle') return
  try {
    const status = await api.getCredentialStatus(ctx)
    if (status.remembered) await applyDbUpgrade(true)
  } catch (error) {
    log.warn('[DbUpgrade]', 'Automatic upgrade check failed', { error: String(error) })
  }
}

/** Hands the connection string to the main process. Returns an error code or null. */
export async function submitConnectionString(
  connectionString: string,
  remember: boolean,
): Promise<string | null> {
  const api = window.electronAPI?.dbUpgrade
  const ctx = dbUpgradeContext()
  if (!api || !ctx) return 'no-credential'
  const result = await api.setCredential({ ...ctx, connectionString, remember })
  return result.success ? null : (result.error ?? 'format')
}

export async function planDbUpgrade(): Promise<void> {
  const api = window.electronAPI?.dbUpgrade
  const ctx = dbUpgradeContext()
  const { setDbUpgradeRun } = usePDMStore.getState()
  if (!api || !ctx) return
  setDbUpgradeRun({ phase: 'planning', errorCode: null, errorMessage: null, result: null })
  const response = await api.plan(ctx)
  if (response.success && response.plan) {
    setDbUpgradeRun({ phase: 'planned', plan: response.plan })
  } else {
    setDbUpgradeRun({
      phase: 'failed',
      errorCode: response.error ?? 'connect',
      errorMessage: response.message ?? null,
    })
  }
}

export async function applyDbUpgrade(automatic: boolean): Promise<void> {
  const api = window.electronAPI?.dbUpgrade
  const ctx = dbUpgradeContext()
  const { setDbUpgradeRun, dbGate } = usePDMStore.getState()
  if (!api || !ctx) return
  setDbUpgradeRun({
    phase: 'applying',
    automatic,
    progress: null,
    result: null,
    errorCode: null,
    errorMessage: null,
  })
  const unsubscribe = api.onProgress((progress) => setDbUpgradeRun({ progress }))
  try {
    const response = await api.apply({
      ...ctx,
      appliedBy: dbGate.userEmail,
      automatic,
    })
    const result = response.result ?? null
    if (response.success && result?.success) {
      setDbUpgradeRun({ phase: 'succeeded', result, plan: result.plan })
      setTimeout(() => window.location.reload(), RELOAD_AFTER_SUCCESS_MS)
      return
    }
    setDbUpgradeRun({
      phase: 'failed',
      result,
      plan: result?.plan ?? usePDMStore.getState().dbUpgradeRun.plan,
      errorCode: result ? null : (response.error ?? 'connect'),
      errorMessage: response.message ?? null,
    })
  } catch (error) {
    setDbUpgradeRun({ phase: 'failed', errorCode: 'connect', errorMessage: String(error) })
  } finally {
    unsubscribe()
  }
}
