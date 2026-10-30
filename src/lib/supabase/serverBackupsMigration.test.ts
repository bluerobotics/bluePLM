/**
 * supabase/migrations/0501_server_backups.sql on real Postgres (PGlite), applied to the
 * 5.0 baseline as the migration runner applies it: it stamps 501 through
 * verify_and_stamp_schema(), every table the backup worker exports resolves to a valid
 * organization-scoped query against the real 5.0 tables, rows of another organization
 * never come back, the table list here and the SQL's agree, and only service_role can
 * call either function.
 */
import type { PGlite } from '@electric-sql/pglite'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BACKUP_TABLES } from '../../../api/src/backup/source'
import { actAs, actAsOwner, bootBaseline, MIGRATIONS, readSql, seed } from './testing/schemaDb'

const MIGRATION = resolve(MIGRATIONS, '0501_server_backups.sql')
const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ALICE = '00000000-0000-0000-0000-000000000001'
const BOB = '00000000-0000-0000-0000-000000000002'
const VAULT_A = '00000000-0000-0000-0000-0000000000a1'
const VAULT_B = '00000000-0000-0000-0000-0000000000b1'

type Page = { missing: boolean; rows: Array<Record<string, unknown>> }

let db: PGlite

beforeAll(async () => {
  db = await bootBaseline()
  await actAsOwner(db)
  await db.exec(readSql(MIGRATION))
  await seed(
    db,
    `
    INSERT INTO organization (id, name, slug) VALUES ('${ORG_A}', 'A', 'a'), ('${ORG_B}', 'B', 'b');
    INSERT INTO app_user (id, email, org_id) VALUES ('${ALICE}', 'alice@a.test', '${ORG_A}'), ('${BOB}', 'bob@b.test', '${ORG_B}');
    INSERT INTO vault (id, org_id, name, slug) VALUES ('${VAULT_A}', '${ORG_A}', 'VA', 'va'), ('${VAULT_B}', '${ORG_B}', 'VB', 'vb');
    INSERT INTO file (id, org_id, vault_id, file_path, file_name, extension, created_by)
      SELECT ('00000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid,
             CASE WHEN g % 2 = 0 THEN '${ORG_A}'::uuid ELSE '${ORG_B}'::uuid END,
             CASE WHEN g % 2 = 0 THEN '${VAULT_A}'::uuid ELSE '${VAULT_B}'::uuid END,
             'p/f' || g || '.sldprt', 'f' || g || '.sldprt', '.sldprt',
             CASE WHEN g % 2 = 0 THEN '${ALICE}'::uuid ELSE '${BOB}'::uuid END
        FROM generate_series(100, 129) g;
    INSERT INTO file_version (file_id, version, revision, content_hash, created_by)
      SELECT id, 1, 'A', md5(id::text), created_by FROM file;
    INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
      ('vault', '${ORG_A}/ab/${'a'.repeat(64)}', '{"size": 10}'),
      ('vault', '${ORG_A}/${'b'.repeat(64)}', '{"size": 20}'),
      ('vault', '${ORG_B}/cd/${'c'.repeat(64)}', '{"size": 30}'),
      ('org-extensions', '${ORG_A}/pkg.bpx', '{"size": 40}');
    `,
  )
}, 240_000)

afterAll(async () => {
  await db?.close()
})

async function asServiceRole(): Promise<void> {
  await actAsOwner(db)
  await db.exec('SET ROLE service_role')
}

async function exportAll(table: string, org = ORG_A, limit = 4): Promise<Page> {
  await asServiceRole()
  const all: Page = { missing: false, rows: [] }
  let after: string | null = null
  for (;;) {
    const res: { rows: Array<{ page: Page }> } = await db.query<{ page: Page }>(
      'SELECT backup_list_org_rows($1, $2, $3, $4) AS page',
      [org, table, after, limit],
    )
    const page: Page = res.rows[0].page
    if (page.missing) return page
    all.rows.push(...page.rows)
    if (page.rows.length < limit) break
    after = String(page.rows[page.rows.length - 1].id)
  }
  return all
}

describe('supabase/migrations/0501_server_backups.sql', () => {
  it('follows the runner contract: no transaction control, and it raises the release to 501', () => {
    const sql = readSql(MIGRATION)
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im)
    expect(sql).not.toMatch(/^-- blueplm:no-transaction/)
    expect(sql).toContain('LANGUAGE sql IMMUTABLE AS $$ SELECT 501 $$;')
  })

  it('stamps 501 through verify_and_stamp_schema()', async () => {
    await actAsOwner(db)
    const r = await db.query<{ v: { stamped: boolean; version: number; problems: unknown[] } }>(
      'SELECT verify_and_stamp_schema() AS v',
    )
    expect(r.rows[0].v.problems).toEqual([])
    expect(r.rows[0].v).toMatchObject({ stamped: true, version: 501 })
  }, 240_000)

  it('knows exactly the tables the worker exports', () => {
    const inSql = [...readSql(MIGRATION).matchAll(/WHEN '([a-z_]+)' THEN/g)].map((m) => m[1]).sort()
    expect(inSql).toEqual([...BACKUP_TABLES].sort())
  })

  it('exports every table through a valid query on the real 5.0 tables', async () => {
    const missing: string[] = []
    for (const table of BACKUP_TABLES) {
      const page = await exportAll(table)
      if (page.missing) missing.push(table)
    }
    // The baseline installs every module, so nothing the worker exports is missing.
    expect(missing).toEqual([])
  })

  it('exports only the organization, through every page', async () => {
    const files = await exportAll('file')
    expect(files.rows).toHaveLength(15)
    expect(new Set(files.rows.map((f) => f.org_id))).toEqual(new Set([ORG_A]))
    const versions = await exportAll('file_version')
    expect(versions.rows).toHaveLength(15)
    expect((await exportAll('organization')).rows.map((o) => o.id)).toEqual([ORG_A])
    expect((await exportAll('app_user')).rows.map((u) => u.id)).toEqual([ALICE])
  })

  it('refuses a table it does not know, such as the one holding the backup secrets', async () => {
    await asServiceRole()
    await expect(db.query(`SELECT backup_list_org_rows('${ORG_A}', 'backup_config', NULL, 10)`)).rejects.toThrow(
      /unknown table/,
    )
  })

  it("lists only the organization's vault objects", async () => {
    await asServiceRole()
    const res = await db.query<{ name: string; size: number }>(
      `SELECT * FROM backup_list_vault_objects('${ORG_A}', NULL, 100)`,
    )
    expect(res.rows.map((r) => r.name)).toEqual([`${ORG_A}/ab/${'a'.repeat(64)}`, `${ORG_A}/${'b'.repeat(64)}`])
  })

  it('is callable by service_role only', async () => {
    for (const role of ['authenticated', 'anon']) {
      if (role === 'authenticated') await actAs(db, ALICE)
      else {
        await actAsOwner(db)
        await db.exec('SET ROLE anon')
      }
      await expect(db.query(`SELECT backup_list_org_rows('${ORG_A}', 'file', NULL, 10)`)).rejects.toThrow(
        /permission denied/,
      )
      await expect(db.query(`SELECT * FROM backup_list_vault_objects('${ORG_A}', NULL, 10)`)).rejects.toThrow(
        /permission denied/,
      )
    }
    await actAsOwner(db)
  })

  it('adds the columns the worker, the app and the 0502 monitor read, with their checks', async () => {
    await actAsOwner(db)
    const cols = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('backup_config', 'backup_history')`,
    )
    const have = new Set(cols.rows.map((c) => `${c.table_name}.${c.column_name}`))
    for (const c of [
      'backup_config.run_location',
      'backup_config.last_scheduled_slot_at',
      'backup_config.verify_requested_at',
      'backup_config.verify_requested_by',
      'backup_config.verify_mode',
      'backup_config.server_worker_seen_at',
      'backup_config.server_worker_version',
      'backup_history.kind',
      'backup_history.trigger',
      'backup_history.runner',
      'backup_history.report',
    ]) {
      expect(have.has(c), c).toBe(true)
    }
    await expect(
      db.query(`INSERT INTO backup_config (org_id, run_location) VALUES ('${ORG_A}', 'laptop')`),
    ).rejects.toThrow(/backup_config_run_location_check/)
    await expect(
      db.query(
        `INSERT INTO backup_history (org_id, machine_id, machine_name, kind) VALUES ('${ORG_A}', 'm', 'm', 'nap')`,
      ),
    ).rejects.toThrow(/backup_history_kind_check/)
  })

  it('shows members the new configuration columns through backup_get_status(), still without the secrets', async () => {
    await actAsOwner(db)
    await db.exec(`DELETE FROM backup_config WHERE org_id = '${ORG_A}'`)
    await db.exec(
      `INSERT INTO backup_config (org_id, bucket, access_key_encrypted, secret_key_encrypted, restic_password_encrypted, run_location)
       VALUES ('${ORG_A}', 'b', 'k', 's', 'p', 'server')`,
    )
    await actAs(db, ALICE)
    const r = await db.query<{ s: Record<string, unknown> }>('SELECT backup_get_status() AS s')
    expect(r.rows[0].s).toMatchObject({ run_location: 'server', credentials_set: true })
    expect(r.rows[0].s).not.toHaveProperty('restic_password_encrypted')
    await actAsOwner(db)
  })
})
