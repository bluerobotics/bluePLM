/**
 * The migration runner against real Postgres (PGlite), on a small SQL tree laid out like
 * `supabase/`: a baseline that installs schema 500, a 4.10 snapshot that stamps 112, a 0500
 * migration from 112 and later migrations. The tree is synthetic on purpose: these tests pin the
 * runner's decisions (which starting state, what runs, in which transaction, what is recorded),
 * not the BluePLM schema, which has its own PGlite proof.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'

import {
  checksumOf,
  loadSqlBundle,
  locateStatement,
  splitStatements,
  type SqlBundle,
} from './dbMigrationsBundle'
import { applyMigrations, planMigrations, type SqlClient } from './dbMigrationsRunner'

const VERIFY_FN = (release: number, required: string[]) => `
CREATE OR REPLACE FUNCTION schema_release_version() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT ${release} $$;
CREATE OR REPLACE FUNCTION verify_and_stamp_schema() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
${required
  .map(
    (t) =>
      `  IF to_regclass('public.${t}') IS NULL THEN RAISE EXCEPTION 'verification failed: ${t} missing'; END IF;`,
  )
  .join('\n')}
  UPDATE schema_version SET version = schema_release_version() WHERE id = 1;
END $$;
`

const VERIFY_SCRIPT = `-- verify
SELECT 1;
DO $$ BEGIN PERFORM verify_and_stamp_schema(); END $$;
`

const TREE: Record<string, string> = {
  'core.sql': `
CREATE TABLE schema_version (id int PRIMARY KEY, version int NOT NULL);
INSERT INTO schema_version VALUES (1, 0);
CREATE TABLE organization (id int PRIMARY KEY, name text, slug text);
${VERIFY_FN(500, ['organization', 'file'])}`,
  'modules/10-files.sql': `CREATE TABLE file (id int PRIMARY KEY, org_id int REFERENCES organization(id));\n`,
  'tools/verify-schema.sql': VERIFY_SCRIPT,
  'migrations/0500_from_4x.sql': `
ALTER TABLE organizations RENAME TO organization;
ALTER TABLE files RENAME TO file;
${VERIFY_FN(500, ['organization', 'file'])}`,
  'migrations/0501_file_size.sql': `
ALTER TABLE file ADD COLUMN size int;
${VERIFY_FN(501, ['organization', 'file'])}`,
  'legacy-4.10/core.sql': `
CREATE TABLE IF NOT EXISTS schema_version (id int PRIMARY KEY, version int NOT NULL);
INSERT INTO schema_version VALUES (1, 0) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS organizations (id int PRIMARY KEY, name text);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug text;
${VERIFY_FN(112, ['organizations', 'files'])}`,
  'legacy-4.10/modules/10-source-files.sql': `CREATE TABLE IF NOT EXISTS files (id int PRIMARY KEY, org_id int);\n`,
  'legacy-4.10/tools/verify-schema.sql': VERIFY_SCRIPT,
}

const dirs: string[] = []
const dbs: PGlite[] = []

afterEach(async () => {
  for (const db of dbs.splice(0)) await db.close()
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function writeTree(extra: Record<string, string | null> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueplm-sql-'))
  dirs.push(root)
  const files: Record<string, string | null> = { ...TREE, ...extra }
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) continue
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), text)
  }
  return root
}

function bundleOf(extra: Record<string, string | null> = {}): SqlBundle {
  return loadSqlBundle(writeTree(extra))
}

async function newDb(): Promise<{ db: PGlite; client: SqlClient }> {
  const db = new PGlite()
  dbs.push(db)
  const client: SqlClient = {
    query: async <T,>(sql: string, params?: unknown[]) => {
      const r = await db.query<T>(sql, params as unknown[] | undefined)
      return { rows: r.rows }
    },
    exec: async (sql: string) => {
      await db.exec(sql)
    },
  }
  return { db, client }
}

const opts = { appliedBy: 'admin@example.com', appVersion: '5.0.0', lockPollMs: 10 }

async function version(client: SqlClient): Promise<number> {
  const { rows } = await client.query<{ v: number }>('SELECT version AS v FROM schema_version')
  return rows[0].v
}

async function tracked(client: SqlClient) {
  const { rows } = await client.query<{
    version: number
    name: string
    checksum: string
    applied_by: string
    app_version: string
    applied_at: string
  }>('SELECT * FROM schema_migration ORDER BY version')
  return rows
}

async function tableExists(client: SqlClient, name: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('public.' || $1) IS NOT NULL AS ok`,
    [name],
  )
  return rows[0].ok
}

/** A 4.10 database stamped 112, installed the way the SQL editor did it. */
async function install112(client: SqlClient, bundle: SqlBundle): Promise<void> {
  for (const f of bundle.legacy!.files) await client.exec(f.sql)
  await client.exec(bundle.legacy!.verify.sql)
}

describe('starting states', () => {
  it('empty database: baseline, migrations after 500, verify; 0500 recorded but not run', async () => {
    const bundle = bundleOf()
    const { client } = await newDb()

    const plan = await planMigrations(client, bundle)
    expect(plan.start).toBe('empty')
    expect(plan.steps.map((s) => s.kind)).toEqual(['baseline', 'migration', 'verify'])
    expect(plan.targetVersion).toBe(501)

    const result = await applyMigrations(client, bundle, opts)
    expect(result.error).toBeNull()
    expect(result.success).toBe(true)
    expect(result.finalVersion).toBe(501)
    expect(await version(client)).toBe(501)

    const rows = await tracked(client)
    expect(rows.map((r) => r.version)).toEqual([500, 501])
    expect(rows[0].checksum).toBe(bundle.migrations[0].checksum)
    expect(rows[1]).toMatchObject({ applied_by: 'admin@example.com (postgres)', app_version: '5.0.0' })
    expect(await tableExists(client, 'organizations')).toBe(false)
  })

  it('verified 112: runs 0500_from_4x and later migrations, then verify', async () => {
    const bundle = bundleOf()
    const { client } = await newDb()
    await install112(client, bundle)
    expect(await version(client)).toBe(112)

    const plan = await planMigrations(client, bundle)
    expect(plan.start).toBe('from112')
    expect(plan.steps.map((s) => s.name)).toEqual([
      '0500_from_4x',
      '0501_file_size',
      'tools/verify-schema.sql',
    ])

    const result = await applyMigrations(client, bundle, opts)
    expect(result.error).toBeNull()
    expect(await version(client)).toBe(501)
    expect(await tableExists(client, 'organization')).toBe(true)
    expect(await tableExists(client, 'organizations')).toBe(false)
    expect((await tracked(client)).map((r) => r.version)).toEqual([500, 501])
  })

  it('below 112: applies the 4.10 snapshot, which must stamp 112, then continues', async () => {
    const bundle = bundleOf()
    const { client } = await newDb()
    await client.exec(`
      CREATE TABLE schema_version (id int PRIMARY KEY, version int NOT NULL);
      INSERT INTO schema_version VALUES (1, 100);
      CREATE TABLE organizations (id int PRIMARY KEY, name text);
      INSERT INTO organizations VALUES (1, 'Acme');`)

    const plan = await planMigrations(client, bundle)
    expect(plan.start).toBe('legacy')
    expect(plan.steps.map((s) => s.kind)).toEqual(['legacy', 'migration', 'migration', 'verify'])

    const result = await applyMigrations(client, bundle, opts)
    expect(result.error).toBeNull()
    expect(await version(client)).toBe(501)
    const { rows } = await client.query<{ name: string }>('SELECT name FROM organization')
    expect(rows).toEqual([{ name: 'Acme' }])
  })

  it('tables but no schema_version is treated as below 112', async () => {
    const bundle = bundleOf()
    const { client } = await newDb()
    await client.exec('CREATE TABLE organizations (id int PRIMARY KEY, name text);')
    expect((await planMigrations(client, bundle)).start).toBe('legacy')
  })

  it('installed by hand at 500 (no tracking rows): adopts migrations up to the release', async () => {
    const bundle = bundleOf()
    const { client } = await newDb()
    for (const f of bundle.baseline) await client.exec(f.sql)

    const plan = await planMigrations(client, bundle)
    expect(plan.start).toBe('tracked')
    expect(plan.steps.map((s) => s.kind)).toEqual(['adopt', 'migration', 'verify'])

    const result = await applyMigrations(client, bundle, opts)
    expect(result.error).toBeNull()
    expect(await version(client)).toBe(501)
    expect((await tracked(client)).map((r) => r.version)).toEqual([500, 501])
  })

  it('refuses a stamped version no release wrote', async () => {
    const bundle = bundleOf()
    const { client } = await newDb()
    await client.exec(`CREATE TABLE schema_version (id int PRIMARY KEY, version int NOT NULL);
      INSERT INTO schema_version VALUES (1, 200);`)
    const plan = await planMigrations(client, bundle)
    expect(plan.refusal?.code).toBe('unsupported-version')
    const result = await applyMigrations(client, bundle, opts)
    expect(result.success).toBe(false)
    expect(await version(client)).toBe(200)
  })
})

describe('re-runs and refusals', () => {
  it('a second run applies nothing and leaves the tracking table as it was', async () => {
    const bundle = bundleOf()
    const { client } = await newDb()
    await applyMigrations(client, bundle, opts)
    const before = await tracked(client)

    const plan = await planMigrations(client, bundle)
    expect(plan.upToDate).toBe(true)
    expect(plan.steps).toEqual([])

    const again = await applyMigrations(client, bundle, opts)
    expect(again.success).toBe(true)
    expect(again.appliedSteps).toEqual([])
    expect(await tracked(client)).toEqual(before)
  })

  it('a changed applied migration refuses and runs nothing, not even a new one', async () => {
    const { client } = await newDb()
    await applyMigrations(client, bundleOf(), opts)
    const before = await tracked(client)

    const edited = bundleOf({
      'migrations/0501_file_size.sql': `${TREE['migrations/0501_file_size.sql']}\n-- edited\n`,
      'migrations/0502_more.sql': 'CREATE TABLE more (id int);\n',
    })
    const plan = await planMigrations(client, edited)
    expect(plan.refusal?.code).toBe('checksum-mismatch')
    expect(plan.refusal?.message).toContain('0501_file_size')

    const result = await applyMigrations(client, edited, opts)
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('0501_file_size')
    expect(await tableExists(client, 'more')).toBe(false)
    expect(await tracked(client)).toEqual(before)
  })

  it('a database with a migration the app does not ship refuses', async () => {
    const { client } = await newDb()
    await applyMigrations(
      client,
      bundleOf({ 'migrations/0502_more.sql': 'CREATE TABLE more (id int);\n' }),
      opts,
    )
    const plan = await planMigrations(client, bundleOf())
    expect(plan.refusal?.code).toBe('unknown-migration')
  })

  it('a pending migration numbered below the newest applied one refuses', async () => {
    const { client } = await newDb()
    await applyMigrations(
      client,
      bundleOf({
        'migrations/0501_file_size.sql': null,
        'migrations/0502_more.sql': 'CREATE TABLE more (id int);\n',
      }),
      opts,
    )
    const plan = await planMigrations(client, bundleOf({ 'migrations/0502_more.sql': 'CREATE TABLE more (id int);\n' }))
    expect(plan.refusal?.code).toBe('out-of-order')
  })

  it('a failing migration rolls back its statements and its tracking row, and names the statement', async () => {
    const { client } = await newDb()
    await applyMigrations(client, bundleOf(), opts)
    const before = await tracked(client)

    const failing = bundleOf({
      'migrations/0502_broken.sql':
        '-- adds a table, then fails\nCREATE TABLE t502 (id int);\nINSERT INTO t502 SELECT id FROM no_such_table;\n',
    })
    const result = await applyMigrations(client, failing, opts)
    expect(result.success).toBe(false)
    expect(result.appliedSteps).toEqual([])
    expect(result.error).toMatchObject({
      file: 'migrations/0502_broken.sql',
      line: 3,
      step: { kind: 'migration', name: '0502_broken' },
    })
    expect(result.error?.statement).toContain('no_such_table')
    expect(result.error?.message).toMatch(/no_such_table/)
    expect(await tableExists(client, 't502')).toBe(false)
    expect(await tracked(client)).toEqual(before)
    expect(await version(client)).toBe(501)
  })

  it('a failed verification reports the verify step and leaves the version unstamped', async () => {
    const { client } = await newDb()
    const bundle = bundleOf({
      'modules/10-files.sql': '-- the module that creates file is missing\nSELECT 1;\n',
      'migrations/0501_file_size.sql': null,
    })
    const result = await applyMigrations(client, bundle, opts)
    expect(result.success).toBe(false)
    expect(result.error?.step?.kind).toBe('verify')
    expect(result.error?.message).toContain('file missing')
    expect(await version(client)).toBe(0)
  })

  it('every migration applied but the stamp withheld: the plan is verify alone, and it stamps', async () => {
    const { client } = await newDb()
    const good = bundleOf()
    await install112(client, good)

    // 0500 and 0501 commit, then verification refuses: the stamp stays at 112.
    const refusing = bundleOf({
      'tools/verify-schema.sql': "DO $$ BEGIN RAISE EXCEPTION 'verification refused'; END $$;\n",
    })
    const first = await applyMigrations(client, refusing, opts)
    expect(first.success).toBe(false)
    expect(first.error?.step?.kind).toBe('verify')
    expect((await tracked(client)).map((r) => r.version)).toEqual([500, 501])
    expect(await version(client)).toBe(112)

    const plan = await planMigrations(client, good)
    expect(plan.upToDate).toBe(false)
    expect(plan.refusal).toBeNull()
    expect(plan.targetVersion).toBe(501)
    expect(plan.steps.map((s) => s.kind)).toEqual(['verify'])

    // Still refusing: it fails again rather than reporting success over an unstamped database.
    expect((await applyMigrations(client, refusing, opts)).success).toBe(false)

    const fixed = await applyMigrations(client, good, opts)
    expect(fixed.error).toBeNull()
    expect(fixed.appliedSteps.map((s) => s.kind)).toEqual(['verify'])
    expect(await version(client)).toBe(501)
    expect((await planMigrations(client, good)).upToDate).toBe(true)
  })

  it('redacts secrets from error messages', async () => {
    const { client } = await newDb()
    const result = await applyMigrations(
      client,
      bundleOf({ 'migrations/0501_file_size.sql': "SELECT 'hunter2-secret'::int;\n" }),
      { ...opts, redact: (s) => s.split('hunter2-secret').join('[redacted]') },
    )
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error)).not.toContain('hunter2-secret')
  })
})

describe('-- blueplm:no-transaction', () => {
  const ENUM = `CREATE TYPE mood AS ENUM ('sad');\nCREATE TABLE feeling (m mood);\n`
  const BODY = [
    "ALTER TYPE mood ADD VALUE IF NOT EXISTS 'happy';",
    "INSERT INTO feeling SELECT 'happy' WHERE NOT EXISTS (SELECT 1 FROM feeling WHERE m = 'happy');",
    'VACUUM feeling;',
  ].join('\n')
  // Raises the release to 502 so verification can stamp it.
  const STAMP_502 = VERIFY_FN(502, ['organization', 'file'])

  async function at501(): Promise<SqlClient> {
    const { client } = await newDb()
    await applyMigrations(client, bundleOf(), opts)
    await client.exec(ENUM)
    return client
  }

  it('without the marker the file fails inside its transaction and is not recorded', async () => {
    const client = await at501()
    const result = await applyMigrations(
      client,
      bundleOf({ 'migrations/0502_mood.sql': `${BODY}\n` }),
      opts,
    )
    expect(result.success).toBe(false)
    expect((await tracked(client)).map((r) => r.version)).toEqual([500, 501])
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_enum WHERE enumlabel = 'happy'`,
    )
    expect(rows[0].n).toBe(0)
  })

  it('with the marker the statements run one by one outside a transaction and the file is recorded', async () => {
    const client = await at501()
    const bundle = bundleOf({
      'migrations/0502_mood.sql': `-- blueplm:no-transaction\n${BODY}\n${STAMP_502}`,
    })
    expect(bundle.migrations.find((m) => m.version === 502)?.noTransaction).toBe(true)
    const plan = await planMigrations(client, bundle)
    expect(plan.steps.map((s) => s.name)).toEqual(['0502_mood', 'tools/verify-schema.sql'])

    const result = await applyMigrations(client, bundle, opts)
    expect(result.error).toBeNull()
    expect(await version(client)).toBe(502)
    expect((await tracked(client)).map((r) => r.version)).toEqual([500, 501, 502])
    const { rows } = await client.query<{ m: string }>('SELECT m::text FROM feeling')
    expect(rows).toEqual([{ m: 'happy' }])
  })

  it('a failure part-way keeps earlier statements, records nothing and names the statement', async () => {
    const client = await at501()
    const bundle = bundleOf({
      'migrations/0502_mood.sql': `-- blueplm:no-transaction\n${BODY}\nSELECT * FROM no_such_table;\n`,
    })
    const result = await applyMigrations(client, bundle, opts)
    expect(result.success).toBe(false)
    expect(result.error).toMatchObject({ file: 'migrations/0502_mood.sql', line: 5 })
    expect(result.error?.statement).toContain('no_such_table')
    expect((await tracked(client)).map((r) => r.version)).toEqual([500, 501])
    const { rows } = await client.query<{ m: string }>('SELECT m::text FROM feeling')
    expect(rows).toEqual([{ m: 'happy' }])

    // Fixed and re-run: the idempotent file runs again from the top and is recorded once.
    const fixed = bundleOf({
      'migrations/0502_mood.sql': `-- blueplm:no-transaction\n${BODY}\n${STAMP_502}`,
    })
    const retry = await applyMigrations(client, fixed, opts)
    expect(retry.error).toBeNull()
    expect((await tracked(client)).map((r) => r.version)).toEqual([500, 501, 502])
  })
})

describe('bundle loader and statement locator', () => {
  it('checksums ignore CRLF and a BOM', () => {
    expect(checksumOf('SELECT 1;\r\nSELECT 2;\r\n')).toBe(checksumOf('SELECT 1;\nSELECT 2;\n'))
    expect(checksumOf('﻿SELECT 1;\n')).toBe(checksumOf('SELECT 1;\n'))
  })

  it('refuses a migration whose name breaks the layout', () => {
    expect(() => bundleOf({ 'migrations/12_bad.sql': 'SELECT 1;' })).toThrow(/NNNN_name/)
  })

  it('splits on top-level semicolons only', () => {
    const sql = [
      "SELECT 'a;b';",
      'DO $$ BEGIN PERFORM 1; END $$;',
      'CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $body$ SELECT 1; $body$;',
      '-- a comment; with a semicolon',
      '/* block; /* nested; */ comment */ SELECT "we;ird";',
      "SELECT E'it\\'s;';",
    ].join('\n')
    expect(splitStatements(sql)).toHaveLength(5)
  })

  it('locates a position in a script', () => {
    const sql = '-- header\nSELECT 1;\n\n-- why\nSELECT * FROM missing;\n'
    const at = locateStatement(sql, sql.indexOf('missing') + 1)
    expect(at).toEqual({ line: 5, statement: 'SELECT * FROM missing;' })
  })

  it('loads the SQL the app ships', () => {
    const bundle = loadSqlBundle(path.resolve(__dirname, '../../supabase'))
    expect(bundle.baseline[0]?.relPath).toBe('core.sql')
    expect(bundle.legacy?.files.map((f) => f.relPath)).toEqual([
      'legacy-4.10/core.sql',
      'legacy-4.10/modules/10-source-files.sql',
      'legacy-4.10/modules/15-inspection.sql',
      'legacy-4.10/modules/20-change-control.sql',
      'legacy-4.10/modules/30-supply-chain.sql',
      'legacy-4.10/modules/40-integrations.sql',
      'legacy-4.10/modules/50-extensions.sql',
    ])
    expect(bundle.verify).not.toBeNull()
    for (const m of bundle.migrations) expect(m.version).toBeGreaterThanOrEqual(500)
  })
})
