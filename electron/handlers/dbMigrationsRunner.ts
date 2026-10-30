// Migration runner: decides what a database needs and applies it. Talks to Postgres through the
// two-method SqlClient below, so the app drives it over `pg` (dbMigrationsPg.ts) and the tests
// drive it over PGlite with the same code. No Electron, no logging, no credentials here.
//
// Starting states (planMigrations):
//   empty      no schema_version and no tables in public -> the 5.0 baseline (core.sql, then
//              modules by name) in one transaction, recording every migration up to 500 as
//              applied, then the later migrations, then verify.
//   from112    schema_version = 112 (stamped only by 4.x verification) -> every migration from
//              0500_from_4x.sql on, then verify.
//   legacy     below 112, or tables with no schema_version -> tag v4.10.0's SQL (one transaction
//              per file, as the SQL editor ran it), its verify, which must stamp 112, then as from112.
//   tracked    schema_migration has rows -> the migrations not recorded yet, then verify. A
//              recorded checksum that no longer matches its file, a recorded migration the app
//              does not ship, or a pending file numbered below the newest applied one refuses.
//              A database installed by hand at 500+ with no rows is adopted: the migrations up
//              to schema_release_version() are recorded without running.
//   unsupported  a stamped version between 112 and 500 that no released app wrote.
//
// Every migration runs in its own transaction together with its schema_migration row, so a
// failure leaves both the schema and the tracking table as they were. The exception is a file
// whose first line is `-- blueplm:no-transaction` (ALTER TYPE ... ADD VALUE used later in the
// file, CREATE INDEX CONCURRENTLY): it runs one statement at a time with no transaction and is
// recorded only after every statement succeeded, so it must be idempotent. The whole run holds a
// session-level advisory lock, and the plan is recomputed once the lock is held.
import {
  BASELINE_VERSION,
  LEGACY_VERSION,
  locateStatement,
  splitStatements,
  type MigrationFile,
  type SqlBundle,
  type SqlFile,
} from './dbMigrationsBundle'

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  /** Runs a multi-statement script (simple query protocol). */
  exec(sql: string): Promise<void>
}

export type StartState = 'empty' | 'from112' | 'legacy' | 'tracked' | 'unsupported'

export type PlanStepKind = 'baseline' | 'legacy' | 'adopt' | 'migration' | 'verify'

export interface PlanStep {
  kind: PlanStepKind
  /** Schema version the step brings the database to (null for verify). */
  version: number | null
  /** What the admin reads: a migration name, or a short label for the other kinds. */
  name: string
}

export type RefusalCode =
  | 'checksum-mismatch'
  | 'unknown-migration'
  | 'out-of-order'
  | 'unsupported-version'
  | 'missing-baseline'
  | 'missing-legacy'
  | 'missing-0500'
  | 'missing-verify'

export interface MigrationPlan {
  start: StartState
  recordedVersion: number | null
  targetVersion: number
  steps: PlanStep[]
  upToDate: boolean
  refusal: { code: RefusalCode; message: string } | null
}

export interface ApplyProgress {
  phase: 'waiting-for-lock' | 'planning' | 'step' | 'done'
  stepIndex?: number
  stepCount?: number
  step?: PlanStep
}

export interface ApplyError {
  /** The step that failed, when one did. */
  step: PlanStep | null
  /** File the failing statement is in (relative path), when known. */
  file: string | null
  message: string
  code: string | null
  detail: string | null
  hint: string | null
  /** PL/pgSQL context ("PL/pgSQL function ... line 5 at RAISE"). */
  where: string | null
  line: number | null
  statement: string | null
}

export interface ApplyResult {
  success: boolean
  plan: MigrationPlan | null
  appliedSteps: PlanStep[]
  finalVersion: number | null
  error: ApplyError | null
}

export interface ApplyOptions {
  /** A label for applied_by (the admin's email); the database session user is always added. */
  appliedBy: string | null
  appVersion: string
  onProgress?: (progress: ApplyProgress) => void
  /** How long to wait for another admin's run to finish. */
  lockTimeoutMs?: number
  lockPollMs?: number
  /** Removes secrets from any message before it leaves the runner. */
  redact?: (text: string) => string
}

/** Session advisory lock key for schema migrations ("BPLM" in ASCII). */
export const MIGRATION_LOCK_KEY = 1112558669

const TRACKING_DDL = `
CREATE TABLE IF NOT EXISTS public.schema_migration (
  version integer PRIMARY KEY,
  name text NOT NULL,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text,
  app_version text
);
ALTER TABLE public.schema_migration ENABLE ROW LEVEL SECURITY;
DO $blueplm_runner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.schema_migration FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.schema_migration FROM authenticated;
  END IF;
END
$blueplm_runner$;
`

interface AppliedRow {
  version: number
  name: string
  checksum: string
}

interface DbFacts {
  hasSchemaVersion: boolean
  recordedVersion: number | null
  releaseVersion: number | null
  publicTableCount: number
  applied: AppliedRow[]
}

async function readFacts(client: SqlClient): Promise<DbFacts> {
  const { rows } = await client.query<{
    sv: boolean
    sm: boolean
    rv: boolean
    tables: number
  }>(
    `SELECT to_regclass('public.schema_version') IS NOT NULL AS sv,
            to_regclass('public.schema_migration') IS NOT NULL AS sm,
            to_regprocedure('public.schema_release_version()') IS NOT NULL AS rv,
            (SELECT count(*)::int FROM pg_tables
              WHERE schemaname = 'public' AND tablename <> 'schema_migration') AS tables`,
  )
  const f = rows[0]
  let recordedVersion: number | null = null
  if (f.sv) {
    const r = await client.query<{ v: number | null }>(
      'SELECT max(version)::int AS v FROM public.schema_version',
    )
    recordedVersion = r.rows[0]?.v ?? null
  }
  let releaseVersion: number | null = null
  if (f.rv) {
    const r = await client.query<{ v: number }>('SELECT public.schema_release_version()::int AS v')
    releaseVersion = r.rows[0]?.v ?? null
  }
  let applied: AppliedRow[] = []
  if (f.sm) {
    const r = await client.query<AppliedRow>(
      'SELECT version, name, checksum FROM public.schema_migration ORDER BY version',
    )
    applied = r.rows
  }
  return {
    hasSchemaVersion: f.sv,
    recordedVersion,
    releaseVersion,
    publicTableCount: Number(f.tables),
    applied,
  }
}

const migrationStep = (m: MigrationFile): PlanStep => ({
  kind: 'migration',
  version: m.version,
  name: m.name,
})
const VERIFY_STEP: PlanStep = { kind: 'verify', version: null, name: 'tools/verify-schema.sql' }

function refuse(
  start: StartState,
  recordedVersion: number | null,
  code: RefusalCode,
  message: string,
): MigrationPlan {
  return {
    start,
    recordedVersion,
    targetVersion: recordedVersion ?? 0,
    steps: [],
    upToDate: false,
    refusal: { code, message },
  }
}

function finish(
  start: StartState,
  recordedVersion: number | null,
  steps: PlanStep[],
  bundle: SqlBundle,
): MigrationPlan {
  const versions = steps.map((s) => s.version ?? 0)
  const targetVersion = Math.max(recordedVersion ?? 0, ...versions, 0)
  if (steps.length === 0 && recordedVersion === targetVersion) {
    return { start, recordedVersion, targetVersion, steps, upToDate: true, refusal: null }
  }
  if (!bundle.verify) {
    return refuse(start, recordedVersion, 'missing-verify', 'The app has no tools/verify-schema.sql.')
  }
  return {
    start,
    recordedVersion,
    targetVersion,
    steps: [...steps, VERIFY_STEP],
    upToDate: false,
    refusal: null,
  }
}

/** Works out what the database needs. Reads only. */
export async function planMigrations(client: SqlClient, bundle: SqlBundle): Promise<MigrationPlan> {
  const facts = await readFacts(client)
  const recorded = facts.recordedVersion

  // Tracked: the runner (or an adopted install) has been here before.
  if (facts.applied.length > 0) {
    const byVersion = new Map(bundle.migrations.map((m) => [m.version, m]))
    const unknown = facts.applied.filter((row) => !byVersion.has(row.version))
    if (unknown.length > 0) {
      return refuse(
        'tracked',
        recorded,
        'unknown-migration',
        `The database has migrations this app does not ship (${unknown
          .map((r) => r.name)
          .join(', ')}). Update BluePLM.`,
      )
    }
    const changed = facts.applied.filter((row) => byVersion.get(row.version)?.checksum !== row.checksum)
    if (changed.length > 0) {
      return refuse(
        'tracked',
        recorded,
        'checksum-mismatch',
        `Applied migrations differ from the files this app ships (${changed
          .map((r) => r.name)
          .join(', ')}). A released migration must never change; nothing was run.`,
      )
    }
    const done = new Set(facts.applied.map((r) => r.version))
    const newest = Math.max(...done)
    const pending = bundle.migrations.filter((m) => !done.has(m.version))
    const late = pending.filter((m) => m.version < newest)
    if (late.length > 0) {
      return refuse(
        'tracked',
        recorded,
        'out-of-order',
        `Migrations numbered below the newest applied one (${newest}) are not applied: ${late
          .map((m) => m.name)
          .join(', ')}. Nothing was run.`,
      )
    }
    return finish('tracked', recorded, pending.map(migrationStep), bundle)
  }

  // Installed at 5.0 or later without the runner (SQL editor): adopt what it already has.
  if (facts.releaseVersion !== null && facts.releaseVersion >= BASELINE_VERSION) {
    const release = facts.releaseVersion
    const adopted = bundle.migrations.filter((m) => m.version <= release)
    const pending = bundle.migrations.filter((m) => m.version > release)
    const steps: PlanStep[] = [
      ...(adopted.length > 0
        ? [{ kind: 'adopt' as const, version: release, name: `Record migrations up to ${release}` }]
        : []),
      ...pending.map(migrationStep),
    ]
    return finish('tracked', recorded, steps, bundle)
  }

  const from112 = (start: StartState, prefix: PlanStep[]): MigrationPlan => {
    if (!bundle.migrations.some((m) => m.version === BASELINE_VERSION)) {
      return refuse(start, recorded, 'missing-0500', 'The app has no 0500 migration.')
    }
    return finish(start, recorded, [...prefix, ...bundle.migrations.map(migrationStep)], bundle)
  }

  if (recorded === LEGACY_VERSION) return from112('from112', [])

  if (!facts.hasSchemaVersion && facts.publicTableCount === 0) {
    if (bundle.baseline.length === 0) {
      return refuse('empty', recorded, 'missing-baseline', 'The app has no baseline SQL.')
    }
    const later = bundle.migrations.filter((m) => m.version > BASELINE_VERSION)
    return finish(
      'empty',
      recorded,
      [
        { kind: 'baseline', version: BASELINE_VERSION, name: 'Install the 5.0 baseline' },
        ...later.map(migrationStep),
      ],
      bundle,
    )
  }

  if (recorded === null || recorded < LEGACY_VERSION) {
    if (!bundle.legacy) {
      return refuse('legacy', recorded, 'missing-legacy', 'The app has no 4.10 SQL snapshot.')
    }
    return from112('legacy', [
      { kind: 'legacy', version: LEGACY_VERSION, name: 'Bring the database to 4.10 (schema 112)' },
    ])
  }

  return refuse(
    'unsupported',
    recorded,
    'unsupported-version',
    `The database is at schema ${recorded}, which no released BluePLM records. Nothing was run.`,
  )
}

// ---------------------------------------------------------------------------
// Applying

interface PgLikeError {
  message?: unknown
  code?: unknown
  detail?: unknown
  hint?: unknown
  where?: unknown
  position?: unknown
}

class StepFailure extends Error {
  constructor(
    readonly error: unknown,
    readonly file: SqlFile | null,
    /** Offset of the statement in the file when it was sent on its own. */
    readonly statementOffset = 0,
  ) {
    super('step failed')
  }
}

function describeError(
  err: unknown,
  step: PlanStep | null,
  file: SqlFile | null,
  redact: (s: string) => string,
  statementOffset = 0,
): ApplyError {
  const e = (err ?? {}) as PgLikeError
  const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? redact(v) : null)
  // A statement sent on its own reports its position within itself; with no position at all,
  // point at the statement's first character.
  const raw = e.position === undefined || e.position === null ? NaN : Number(e.position)
  const position = Number.isFinite(raw)
    ? statementOffset + raw
    : statementOffset > 0
      ? statementOffset + 1
      : NaN
  const located = file && Number.isFinite(position) ? locateStatement(file.sql, position) : null
  return {
    step,
    file: file?.relPath ?? null,
    message: text(e.message) ?? redact(String(err)),
    code: text(e.code),
    detail: text(e.detail),
    hint: text(e.hint),
    where: text(e.where),
    line: located?.line ?? null,
    statement: located?.statement ? redact(located.statement) : null,
  }
}

async function runFile(client: SqlClient, file: SqlFile): Promise<void> {
  try {
    await client.exec(file.sql)
  } catch (err) {
    throw new StepFailure(err, file)
  }
}

/**
 * A `-- blueplm:no-transaction` file: each statement on its own, so Postgres does not see a
 * transaction block (a multi-statement query string is one implicit transaction).
 */
async function runFileStatementByStatement(client: SqlClient, file: SqlFile): Promise<void> {
  for (const span of splitStatements(file.sql)) {
    const statement = file.sql.slice(span.start, span.end)
    if (!statement.replace(/--[^\n]*/g, '').trim()) continue
    try {
      await client.exec(statement)
    } catch (err) {
      throw new StepFailure(err, file, span.start)
    }
  }
}

async function inTransaction(client: SqlClient, body: () => Promise<void>): Promise<void> {
  await client.exec('BEGIN')
  try {
    await body()
    await client.exec('COMMIT')
  } catch (err) {
    try {
      await client.exec('ROLLBACK')
    } catch {
      // The connection is gone; the server rolls the transaction back on its own.
    }
    throw err
  }
}

async function record(
  client: SqlClient,
  rows: MigrationFile[],
  options: ApplyOptions,
): Promise<void> {
  for (const m of rows) {
    await client.query(
      `INSERT INTO public.schema_migration (version, name, checksum, applied_by, app_version)
       VALUES ($1, $2, $3,
               CASE WHEN $4::text IS NULL THEN current_user::text
                    ELSE $4::text || ' (' || current_user || ')' END,
               $5)`,
      [m.version, m.name, m.checksum, options.appliedBy, options.appVersion],
    )
  }
}

async function recordedVersion(client: SqlClient): Promise<number | null> {
  const { rows } = await client.query<{ v: number | null }>(
    `SELECT CASE WHEN to_regclass('public.schema_version') IS NULL THEN NULL
            ELSE (SELECT max(version)::int FROM public.schema_version) END AS v`,
  )
  return rows[0]?.v ?? null
}

async function runStep(
  client: SqlClient,
  bundle: SqlBundle,
  plan: MigrationPlan,
  step: PlanStep,
  options: ApplyOptions,
): Promise<void> {
  switch (step.kind) {
    case 'baseline':
      await inTransaction(client, async () => {
        for (const file of bundle.baseline) await runFile(client, file)
        await client.exec(TRACKING_DDL)
        await record(
          client,
          bundle.migrations.filter((m) => m.version <= BASELINE_VERSION),
          options,
        )
      })
      return
    case 'legacy': {
      const legacy = bundle.legacy
      if (!legacy) throw new Error('The app has no 4.10 SQL snapshot.')
      for (const file of legacy.files) {
        await inTransaction(client, () => runFile(client, file))
      }
      await inTransaction(client, () => runFile(client, legacy.verify))
      const v = await recordedVersion(client)
      if (v !== LEGACY_VERSION) {
        throw new Error(
          `The 4.10 verification did not record schema ${LEGACY_VERSION} (the database records ${v ?? 'none'}).`,
        )
      }
      return
    }
    case 'adopt':
      await inTransaction(client, async () => {
        await client.exec(TRACKING_DDL)
        await record(
          client,
          bundle.migrations.filter((m) => m.version <= (step.version ?? 0)),
          options,
        )
      })
      return
    case 'migration': {
      const file = bundle.migrations.find((m) => m.version === step.version)
      if (!file) throw new Error(`Migration ${step.name} is not in the app.`)
      if (file.noTransaction) {
        await inTransaction(client, () => client.exec(TRACKING_DDL))
        await runFileStatementByStatement(client, file)
        await inTransaction(client, () => record(client, [file], options))
        return
      }
      await inTransaction(client, async () => {
        await client.exec(TRACKING_DDL)
        await runFile(client, file)
        await record(client, [file], options)
      })
      return
    }
    case 'verify': {
      const verify = bundle.verify
      if (!verify) throw new Error('The app has no tools/verify-schema.sql.')
      await inTransaction(client, () => runFile(client, verify))
      const v = await recordedVersion(client)
      if (v !== plan.targetVersion) {
        throw new Error(
          `Verification finished but the database records schema ${v ?? 'none'}, not ${plan.targetVersion}.`,
        )
      }
      return
    }
  }
}

async function acquireLock(client: SqlClient, options: ApplyOptions): Promise<void> {
  const deadline = Date.now() + (options.lockTimeoutMs ?? 10 * 60 * 1000)
  let announced = false
  for (;;) {
    const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [
      MIGRATION_LOCK_KEY,
    ])
    if (rows[0]?.ok) return
    if (Date.now() >= deadline) {
      throw new Error('Another database upgrade is still running. Try again when it has finished.')
    }
    if (!announced) {
      options.onProgress?.({ phase: 'waiting-for-lock' })
      announced = true
    }
    await new Promise((r) => setTimeout(r, options.lockPollMs ?? 2000))
  }
}

/** Plans under the advisory lock and applies every step. Never throws. */
export async function applyMigrations(
  client: SqlClient,
  bundle: SqlBundle,
  options: ApplyOptions,
): Promise<ApplyResult> {
  const redact = options.redact ?? ((s: string) => s)
  const appliedSteps: PlanStep[] = []
  let plan: MigrationPlan | null = null
  let current: PlanStep | null = null
  let locked = false
  try {
    await acquireLock(client, options)
    locked = true
    options.onProgress?.({ phase: 'planning' })
    plan = await planMigrations(client, bundle)
    if (plan.refusal) {
      return {
        success: false,
        plan,
        appliedSteps,
        finalVersion: plan.recordedVersion,
        error: describeError(new Error(plan.refusal.message), null, null, redact),
      }
    }
    for (const [index, step] of plan.steps.entries()) {
      current = step
      options.onProgress?.({ phase: 'step', stepIndex: index, stepCount: plan.steps.length, step })
      await runStep(client, bundle, plan, step, options)
      appliedSteps.push(step)
    }
    current = null
    const finalVersion = await recordedVersion(client)
    options.onProgress?.({ phase: 'done' })
    return { success: true, plan, appliedSteps, finalVersion, error: null }
  } catch (err) {
    const failure = err instanceof StepFailure ? err : null
    let finalVersion: number | null = null
    try {
      finalVersion = await recordedVersion(client)
    } catch {
      // Connection lost; the version is unknown.
    }
    return {
      success: false,
      plan,
      appliedSteps,
      finalVersion,
      error: describeError(
        failure ? failure.error : err,
        current,
        failure?.file ?? null,
        redact,
        failure?.statementOffset ?? 0,
      ),
    }
  } finally {
    if (locked) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      } catch {
        // Closing the session releases it.
      }
    }
  }
}
