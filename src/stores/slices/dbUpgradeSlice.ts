/**
 * Database upgrade gate and the in-app migration run (BluePLM 5.0).
 *
 * `dbGate` is what the gate decided for the signed-in user: nothing to do, an upgrade an admin
 * runs here, an upgrade to wait for, or an app update. `dbUpgradeRun` follows one run of the
 * migration runner in the main process. Nothing here is persisted, and the connection string is
 * never in the store: it goes straight to the main process.
 */
import { StateCreator } from 'zustand'

import type { DbGateDecision } from '../../features/dbUpgrade/gateDecision'
import type {
  DbUpgradeApplyResult,
  DbUpgradePlan,
  DbUpgradeProgress,
  MandatoryUpdateState,
} from '../../types/electron/dbUpgrade'
import type { PDMStoreState } from '../types'

export type DbGateStatus = 'unknown' | 'checking' | DbGateDecision

export interface DbGateState {
  status: DbGateStatus
  recordedVersion: number | null
  clientMinVersion: string | null
  /** Who the decision was made for; a different sign-in re-checks. */
  userId: string | null
  /** Recorded as applied_by in schema_migration. */
  userEmail: string | null
  checkedAt: number | null
}

export type DbUpgradeRunPhase = 'idle' | 'planning' | 'planned' | 'applying' | 'succeeded' | 'failed'

export interface DbUpgradeRunState {
  phase: DbUpgradeRunPhase
  /** Started at launch from a remembered connection, not by a click. */
  automatic: boolean
  plan: DbUpgradePlan | null
  progress: DbUpgradeProgress | null
  result: DbUpgradeApplyResult | null
  /** Short code for a refusal before the runner started (format, connect, project-mismatch, ...). */
  errorCode: string | null
  /** Connection error text from the main process, already stripped of secrets. */
  errorMessage: string | null
}

export interface DbUpgradeSlice {
  dbGate: DbGateState
  dbUpgradeRun: DbUpgradeRunState
  mandatoryUpdate: MandatoryUpdateState | null
  setDbGate: (patch: Partial<DbGateState>) => void
  setDbUpgradeRun: (patch: Partial<DbUpgradeRunState>) => void
  resetDbUpgradeRun: () => void
  setMandatoryUpdate: (state: MandatoryUpdateState | null) => void
}

export const INITIAL_DB_GATE: DbGateState = {
  status: 'unknown',
  recordedVersion: null,
  clientMinVersion: null,
  userId: null,
  userEmail: null,
  checkedAt: null,
}

export const INITIAL_DB_UPGRADE_RUN: DbUpgradeRunState = {
  phase: 'idle',
  automatic: false,
  plan: null,
  progress: null,
  result: null,
  errorCode: null,
  errorMessage: null,
}

export const createDbUpgradeSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  DbUpgradeSlice
> = (set) => ({
  dbGate: INITIAL_DB_GATE,
  dbUpgradeRun: INITIAL_DB_UPGRADE_RUN,
  mandatoryUpdate: null,
  setDbGate: (patch) => set((state) => ({ dbGate: { ...state.dbGate, ...patch } })),
  setDbUpgradeRun: (patch) =>
    set((state) => ({ dbUpgradeRun: { ...state.dbUpgradeRun, ...patch } })),
  resetDbUpgradeRun: () => set({ dbUpgradeRun: INITIAL_DB_UPGRADE_RUN }),
  setMandatoryUpdate: (mandatoryUpdate) => set({ mandatoryUpdate }),
})
