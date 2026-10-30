/**
 * The 5.0 schema, end to end on real Postgres (PGlite):
 *
 *   - supabase/core.sql + supabase/modules/* (the baseline) apply to an empty database
 *     and verify_and_stamp_schema() stamps 500;
 *   - a 4.10 database (supabase/legacy-4.10, the SQL of tag v4.10.0, stamped 112)
 *     with rows in it, upgraded by supabase/migrations/0500_from_4x.sql, ends up with
 *     exactly the baseline's tables, columns, constraints, indexes, functions (bodies
 *     and privileges), views, triggers, policies, enums, buckets and manifest, and
 *     with every row it had;
 *   - 0500 refuses a database that is not a verified 112 or whose data the 5.0
 *     constraints would reject, before it changes anything.
 *
 * The rehearsal on a copy of production (37k files, the Customers extension) is the
 * other half of this proof; it is in .cursor/plans/release-5.0.plan.md.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  actAs,
  actAsOwner,
  bootBaseline,
  bootLegacy,
  compareSnapshots,
  MIGRATIONS,
  readSql,
  rowCounts,
  seed,
  snapshot,
  type Snapshot,
} from './testing/schemaDb'

const MIGRATION_0500 = resolve(MIGRATIONS, '0500_from_4x.sql')

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ADMIN = '00000000-0000-0000-0000-000000000001'
const ALICE = '00000000-0000-0000-0000-000000000002'
const OTHER = '00000000-0000-0000-0000-000000000003'
const TEAM_A = '30000000-0000-0000-0000-000000000001'
const TEAM_B = '30000000-0000-0000-0000-000000000002'
const VA = '40000000-0000-0000-0000-000000000001'
const VB = '40000000-0000-0000-0000-000000000002'
const F1 = '50000000-0000-0000-0000-000000000001'
const F2 = '50000000-0000-0000-0000-000000000002'
const ROLE_A = '60000000-0000-0000-0000-000000000001'

/** A small 4.10 organization: users, teams, vaults, files (one checked out), history. */
const SEED_4X = `
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('${ADMIN}', 'admin@a.test', now()), ('${ALICE}', 'alice@a.test', now()), ('${OTHER}', 'other@b.test', now());
INSERT INTO organizations (id, name, slug, default_new_user_team_id) VALUES
  ('${ORG_A}', 'A', 'org-a', '${TEAM_A}'), ('${ORG_B}', 'B', 'org-b', NULL);
INSERT INTO users (id, email, org_id, role, last_online) VALUES
  ('${ADMIN}', 'admin@a.test', '${ORG_A}', 'admin', now()),
  ('${ALICE}', 'alice@a.test', '${ORG_A}', 'engineer', now()),
  ('${OTHER}', 'other@b.test', '${ORG_B}', 'admin', NULL);
INSERT INTO teams (id, org_id, name) VALUES ('${TEAM_A}', '${ORG_A}', 'Engineering'), ('${TEAM_B}', '${ORG_B}', 'Administrators');
INSERT INTO team_members (team_id, user_id) VALUES ('${TEAM_A}', '${ALICE}'), ('${TEAM_B}', '${OTHER}');
INSERT INTO vaults (id, org_id, name, slug) VALUES ('${VA}', '${ORG_A}', 'Main', 'main'), ('${VB}', '${ORG_B}', 'Other', 'other');
INSERT INTO vault_access (vault_id, user_id) VALUES ('${VA}', '${ALICE}');
INSERT INTO team_permissions (team_id, resource, actions, vault_id) VALUES ('${TEAM_A}', 'module:explorer', '{view,edit}', '${VA}');
INSERT INTO workflow_roles (id, org_id, name) VALUES ('${ROLE_A}', '${ORG_A}', 'Checker');
INSERT INTO team_reviewers (team_id, reviewer_type, workflow_role_id) VALUES ('${TEAM_A}', 'workflow_role', '${ROLE_A}');
INSERT INTO files (id, org_id, vault_id, file_path, file_name, extension, created_by, checked_out_by, checked_out_at) VALUES
  ('${F1}', '${ORG_A}', '${VA}', 'parts/one.sldprt', 'one.sldprt', '.sldprt', '${ADMIN}', '${ALICE}', now()),
  ('${F2}', '${ORG_A}', '${VA}', 'parts/two.sldprt', 'two.sldprt', '.sldprt', '${ADMIN}', NULL, NULL);
INSERT INTO file_versions (file_id, version, revision, content_hash, created_by) VALUES
  ('${F1}', 1, 'A', '${'1'.repeat(64)}', '${ADMIN}'), ('${F2}', 1, 'A', '${'2'.repeat(64)}', '${ADMIN}');
INSERT INTO activity (org_id, user_id, user_email, action, file_id) VALUES
  ('${ORG_A}', '${ADMIN}', 'admin@a.test', 'checkin', '${F1}'), ('${ORG_A}', '${ALICE}', 'alice@a.test', 'checkout', '${F1}');
INSERT INTO notifications (org_id, user_id, type, title, read) VALUES ('${ORG_A}', '${ALICE}', 'review', 'Review', true);
INSERT INTO pending_org_members (org_id, email, team_ids) VALUES ('${ORG_A}', 'new@a.test', '{${TEAM_A}}');
INSERT INTO backup_config (org_id) VALUES ('${ORG_A}');
INSERT INTO webhooks (org_id, name, url, secret) VALUES ('${ORG_A}', 'hook', 'https://example.test/hook', 's');
INSERT INTO integration_credentials (org_id, owner_type, owner_id, secret) VALUES ('${ORG_A}', 'odoo_saved_config', gen_random_uuid(), 'x');
INSERT INTO schema_remediation_log (remediation, release, rows_acted_on, subjects, detail)
  VALUES ('test', 112, 1, '[]', 'kept across 0500');
-- A check constraint that drifted from the 4.10 source on a long-lived database:
-- 0500 replaces it with the 5.0 definition rather than keeping both.
ALTER TABLE team_reviewers DROP CONSTRAINT team_reviewers_reviewer_type_check;
ALTER TABLE team_reviewers ADD CONSTRAINT team_reviewers_reviewer_type_check
  CHECK (reviewer_type IN ('user', 'role', 'workflow_role'));
`

/** 0500 as the migration runner applies it: one transaction around the file. */
async function apply0500(db: PGlite): Promise<void> {
  await actAsOwner(db)
  await db.exec('BEGIN')
  try {
    await db.exec(readSql(MIGRATION_0500))
    await db.exec('COMMIT')
  } catch (e) {
    await db.exec('ROLLBACK')
    throw e
  }
}

describe('supabase/migrations/0500_from_4x.sql', () => {
  let fresh: PGlite
  let upgraded: PGlite
  let freshSnap: Snapshot
  let before: Map<number, { name: string; n: number }>

  beforeAll(async () => {
    fresh = await bootBaseline()
    freshSnap = await snapshot(fresh)
    upgraded = await bootLegacy()
    await seed(upgraded, SEED_4X)
    before = await rowCounts(upgraded)
    await apply0500(upgraded)
  }, 240_000)

  afterAll(async () => {
    await fresh?.close()
    await upgraded?.close()
  })

  it('follows the runner contract: no transaction control, and it raises the release to its own number', () => {
    const sql = readSql(MIGRATION_0500)
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im)
    expect(sql).not.toMatch(/^-- blueplm:no-transaction/)
    expect(sql).toContain('LANGUAGE sql IMMUTABLE AS $$ SELECT 500 $$;')
  })

  it('leaves a 4.10 database identical to a fresh 5.0 baseline', async () => {
    const diffs = compareSnapshots(freshSnap, await snapshot(upgraded))
    expect(diffs).toEqual([])
  })

  it('keeps every row: tables are renamed, never recreated', async () => {
    const after = await rowCounts(upgraded)
    const changed: string[] = []
    for (const [oid, b] of before) {
      const a = after.get(oid)
      if (!a) {
        if (b.n > 0) changed.push(`${b.name}: dropped with ${b.n} row(s)`)
      } else if (a.n !== b.n) changed.push(`${b.name} -> ${a.name}: ${b.n} -> ${a.n}`)
    }
    expect(changed).toEqual([])
    const names = new Map([...after.values()].map((t) => [t.name, t.n]))
    expect(names.get('file')).toBe(2)
    expect(names.get('schema_remediation_log')).toBe(1)
    expect(names.get('integration_credential')).toBe(1)
  })

  it('keeps checkouts and renamed columns, and replaces a drifted constraint', async () => {
    await actAsOwner(upgraded)
    const co = await upgraded.query<{ id: string; checked_out_by: string }>(
      'SELECT id, checked_out_by FROM file WHERE checked_out_by IS NOT NULL',
    )
    expect(co.rows).toEqual([{ id: F1, checked_out_by: ALICE }])
    const n = await upgraded.query<{ is_read: boolean }>('SELECT is_read FROM notification')
    expect(n.rows).toEqual([{ is_read: true }])
    const c = await upgraded.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'public.team_reviewer'::regclass AND contype = 'c'`,
    )
    expect(c.rows.map((r) => r.def).join(' ')).not.toContain("'role'")
  })

  it('stamps 500 through verify_and_stamp_schema()', async () => {
    await actAsOwner(upgraded)
    const r = await upgraded.query<{ v: { stamped: boolean; version: number; problems: unknown[] } }>(
      'SELECT verify_and_stamp_schema() AS v',
    )
    expect(r.rows[0].v.problems).toEqual([])
    expect(r.rows[0].v).toMatchObject({ stamped: true, version: 500 })
  }, 240_000)
})

describe('0500 refuses a database it cannot upgrade, before changing anything', () => {
  it('not a verified 112', async () => {
    const db = await bootLegacy()
    try {
      await db.exec('UPDATE schema_version SET version = 111 WHERE id = 1')
      await expect(apply0500(db)).rejects.toThrow(/stamped 111, not 112/)
      const t = await db.query(`SELECT to_regclass('public.files') IS NOT NULL AS ok`)
      expect(t.rows).toEqual([{ ok: true }])
    } finally {
      await db.close()
    }
  }, 120_000)

  it('a file with no vault (file.vault_id becomes NOT NULL)', async () => {
    const db = await bootLegacy()
    try {
      await seed(db, SEED_4X)
      await seed(db, `UPDATE files SET vault_id = NULL WHERE id = '${F2}';`)
      await expect(apply0500(db)).rejects.toThrow(/have no vault/)
    } finally {
      await db.close()
    }
  }, 120_000)
})

describe('the 5.0 baseline', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootBaseline()
    await seed(
      db,
      `
      INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
        ('${ADMIN}', 'admin@a.test', now()), ('${ALICE}', 'alice@a.test', now()), ('${OTHER}', 'other@b.test', now());
      INSERT INTO organization (id, name, slug) VALUES ('${ORG_A}', 'A', 'org-a'), ('${ORG_B}', 'B', 'org-b');
      INSERT INTO app_user (id, email, org_id, role) VALUES
        ('${ADMIN}', 'admin@a.test', '${ORG_A}', 'admin'), ('${OTHER}', 'other@b.test', '${ORG_B}', 'admin');
      INSERT INTO app_user (id, email) VALUES ('${ALICE}', 'alice@a.test');
      INSERT INTO team (id, org_id, name) VALUES ('${TEAM_A}', '${ORG_A}', 'Engineering'), ('${TEAM_B}', '${ORG_B}', 'Administrators');
      INSERT INTO vault (id, org_id, name, slug) VALUES ('${VA}', '${ORG_A}', 'Main', 'main'), ('${VB}', '${ORG_B}', 'Other', 'other');
      `,
    )
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('names release 500, and client_min_version() is 5.0.0 for anon and authenticated alike', async () => {
    await actAsOwner(db)
    const v = await db.query<{ v: number }>('SELECT schema_release_version() AS v')
    expect(v.rows[0].v).toBe(500)
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`)
      const r = await db.query<{ v: string }>('SELECT client_min_version() AS v')
      expect(r.rows[0].v).toBe('5.0.0')
      await db.exec('RESET ROLE')
    }
  })

  it('keeps schema_version exactly as 4.x clients read it', async () => {
    await actAsOwner(db)
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schema_version' ORDER BY ordinal_position`,
    )
    expect(cols.rows.map((c) => c.column_name)).toEqual(['id', 'version', 'description', 'applied_at', 'applied_by'])
    await db.exec('SET ROLE anon')
    const r = await db.query<{ version: number }>('SELECT version FROM schema_version')
    expect(r.rows).toHaveLength(1)
    await db.exec('RESET ROLE')
  })

  it('gives anon no table privilege except SELECT on schema_version, and keeps schema_manifest_entry service-only', async () => {
    await actAsOwner(db)
    const r = await db.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
         AND has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`,
    )
    expect(r.rows.map((x) => x.relname)).toEqual(['schema_version'])
    const m = await db.query<{ a: boolean; u: boolean }>(
      `SELECT has_table_privilege('anon', 'schema_manifest_entry', 'SELECT') AS a,
              has_table_privilege('authenticated', 'schema_manifest_entry', 'SELECT') AS u`,
    )
    expect(m.rows[0]).toEqual({ a: false, u: false })
  })

  it('pins search_path on every SECURITY DEFINER function', async () => {
    await actAsOwner(db)
    const r = await db.query('SELECT * FROM check_definer_search_path()')
    expect(r.rows).toEqual([])
  })

  it('an invitation grants only teams and vaults of its own organization (O1)', async () => {
    await seed(
      db,
      `INSERT INTO pending_org_member (org_id, email, team_ids, vault_ids, invited_by)
       VALUES ('${ORG_A}', 'alice@a.test', '{${TEAM_A},${TEAM_B}}', '{${VA},${VB}}', '${ADMIN}');`,
    )
    await actAsOwner(db)
    await db.exec(`UPDATE app_user SET org_id = '${ORG_A}' WHERE id = '${ALICE}'`)
    const teams = await db.query<{ team_id: string }>('SELECT team_id FROM team_member WHERE user_id = $1', [ALICE])
    expect(teams.rows.map((t) => t.team_id)).toEqual([TEAM_A])
    const vaults = await db.query<{ vault_id: string }>('SELECT vault_id FROM vault_access WHERE user_id = $1', [ALICE])
    expect(vaults.rows.map((v) => v.vault_id)).toEqual([VA])
  })

  it('a signed-in member reads their organization through the renamed tables', async () => {
    await actAs(db, ADMIN)
    const r = await db.query<{ id: string }>('SELECT id FROM organization')
    expect(r.rows.map((o) => o.id)).toEqual([ORG_A])
    await actAsOwner(db)
  })
})

describe('the migration file layout', () => {
  it('0500 is the only migration and names the baseline it produces', () => {
    const sql = readFileSync(resolve(MIGRATIONS, '0500_from_4x.sql'), 'utf8')
    expect(sql).toContain('verify_and_stamp_schema()')
  })
})
