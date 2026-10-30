/**
 * Renderer view of the in-app database upgrade and mandatory update IPC (BluePLM 5.0).
 * Main process: `electron/handlers/dbMigrations*.ts` and `electron/handlers/updater.ts`.
 * The connection string goes in through `setCredential` and never comes back out.
 */

export interface DbUpgradeContext {
  /**
   * The Supabase URL this app is signed in to; the string must name the same project. The main
   * process takes no user identity from the renderer: the remembered string belongs to the
   * operating-system profile (safeStorage) and the database decides what it may do.
   */
  supabaseUrl: string | null
}

export type DbUpgradePlanStepKind = 'baseline' | 'legacy' | 'adopt' | 'migration' | 'verify'

export interface DbUpgradePlanStep {
  kind: DbUpgradePlanStepKind
  version: number | null
  name: string
}

export type DbUpgradeStartState = 'empty' | 'from112' | 'legacy' | 'tracked' | 'unsupported'

export interface DbUpgradePlan {
  start: DbUpgradeStartState
  recordedVersion: number | null
  targetVersion: number
  steps: DbUpgradePlanStep[]
  upToDate: boolean
  refusal: { code: string; message: string } | null
}

export interface DbUpgradeError {
  step: DbUpgradePlanStep | null
  file: string | null
  message: string
  code: string | null
  detail: string | null
  hint: string | null
  where: string | null
  line: number | null
  statement: string | null
}

export interface DbUpgradeApplyResult {
  success: boolean
  plan: DbUpgradePlan | null
  appliedSteps: DbUpgradePlanStep[]
  finalVersion: number | null
  error: DbUpgradeError | null
}

export interface DbUpgradeProgress {
  phase: 'waiting-for-lock' | 'planning' | 'step' | 'done'
  stepIndex?: number
  stepCount?: number
  step?: DbUpgradePlanStep
}

/** Why a connection string was refused or a run could not start. */
export type DbUpgradeCredentialError =
  | 'format'
  | 'transaction-pooler'
  | 'no-password'
  | 'project-mismatch'
  | 'no-credential'
  | 'connect'
  | 'running'

export interface DbUpgradeBundleInfo {
  success: boolean
  error?: string
  baselineVersion?: number
  legacyVersion?: number
  hasBaseline?: boolean
  hasLegacy?: boolean
  migrations?: { version: number; name: string }[]
}

export type MandatoryUpdatePhase =
  | 'checking'
  | 'downloading'
  | 'installing'
  | 'no-update'
  | 'error'
  /** macOS: the build cannot install itself; the user downloads it from `downloadUrl`. */
  | 'manual'

export interface MandatoryUpdateState {
  phase: MandatoryUpdatePhase
  minVersion: string
  version?: string
  percent?: number
  seconds?: number
  message?: string
  downloadUrl?: string
}

export interface DbUpgradeAPI {
  setMandatoryUpdate: (minVersion: string) => Promise<{
    success: boolean
    error?: string
    manual?: boolean
    downloadUrl?: string
  }>
  onMandatoryUpdateState: (callback: (state: MandatoryUpdateState) => void) => () => void
  dbUpgrade: {
    getBundle: () => Promise<DbUpgradeBundleInfo>
    getCredentialStatus: (
      ctx: DbUpgradeContext,
    ) => Promise<{ held: boolean; remembered: boolean; canRemember: boolean }>
    setCredential: (
      input: DbUpgradeContext & { connectionString: string; remember: boolean },
    ) => Promise<{ success: boolean; remembered?: boolean; error?: DbUpgradeCredentialError }>
    forgetCredential: () => Promise<{ success: boolean }>
    plan: (ctx: DbUpgradeContext) => Promise<{
      success: boolean
      plan?: DbUpgradePlan
      error?: DbUpgradeCredentialError
      message?: string
    }>
    apply: (input: DbUpgradeContext & { appliedBy: string | null; automatic: boolean }) => Promise<{
      success: boolean
      result?: DbUpgradeApplyResult
      error?: DbUpgradeCredentialError
      message?: string
    }>
    onProgress: (callback: (progress: DbUpgradeProgress) => void) => () => void
  }
}
