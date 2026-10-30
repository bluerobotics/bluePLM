/**
 * Security audit follow-up (schema 112), run against real Postgres (PGlite) with
 * the statements loaded verbatim from supabase/: backup secrets readable by
 * admins only (members get get_backup_status() without them), audit rows that
 * name the caller as their actor, session rows kept in the caller's organization,
 * and the orphan-function sweep in core.sql.
 *
 * auth.uid(), users, is_org_admin() and the authenticated role are stubbed with
 * the same shapes; is_org_admin() is the role column alone here.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ADMIN = '00000000-0000-0000-0000-000000000001'
const MEMBER = '00000000-0000-0000-0000-000000000002'
const OTHER = '00000000-0000-0000-0000-000000000003' // member of org B

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')
const CORE = read('supabase/core.sql')
const M10 = read('supabase/modules/10-source-files.sql')

const STUBS = `
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE TABLE organizations (id uuid PRIMARY KEY);
CREATE TABLE users (id uuid PRIMARY KEY, org_id uuid, role text);
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') $$;
CREATE TABLE backup_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid UNIQUE, bucket text,
  access_key_encrypted text, secret_key_encrypted text, restic_password_encrypted text,
  designated_machine_name text
);
CREATE TABLE activity (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, user_id uuid, action text);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, user_id uuid, from_user_id uuid, title text
);
CREATE TABLE user_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, org_id uuid, machine_id text);
-- Orphans as production carries them: one callable, one trigger function in use.
CREATE FUNCTION get_eco_files(uuid) RETURNS SETOF uuid LANGUAGE sql AS $$ SELECT $1 $$;
CREATE FUNCTION update_rfq_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TABLE rfqs (id uuid PRIMARY KEY);
CREATE TRIGGER rfqs_touch BEFORE UPDATE ON rfqs FOR EACH ROW EXECUTE FUNCTION update_rfq_timestamp();
`

function fn(sql: string, header: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${header}`)
  expect(start, header).toBeGreaterThan(-1)
  const end = /^\$\$[^\n]*;$/m.exec(sql.slice(start))
  expect(end, header).not.toBeNull()
  return sql.slice(start, start + (end?.index ?? 0) + (end?.[0].length ?? 0))
}

function policy(sql: string, name: string, table: string): string {
  const start = sql.indexOf(`CREATE POLICY "${name}"\n  ON ${table} `)
  expect(start, name).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf(';\n', start) + 1)
}

function orphanSweep(): string {
  const start = CORE.indexOf('-- ORPHAN FUNCTIONS (schema 112)')
  expect(start).toBeGreaterThan(-1)
  return CORE.slice(start, CORE.indexOf('END $$;', start) + 'END $$;'.length)
}

let db: PGlite

async function as(userId: string): Promise<void> {
  await db.exec(
    `RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${userId}', false); SET ROLE authenticated;`,
  )
}

async function refused(sql: string, params: unknown[] = []): Promise<boolean> {
  try {
    await db.query(sql, params)
    return false
  } catch {
    return true
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  await db.exec(
    [
      fn(M10, 'get_backup_status()'),
      'ALTER TABLE backup_config ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE activity ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;',
      policy(M10, 'Users can view org backup config', 'backup_config'),
      policy(M10, 'Users can log activity', 'activity'),
      policy(CORE, 'System can create notifications', 'notifications'),
      policy(CORE, 'Users can manage their sessions', 'user_sessions'),
      orphanSweep(),
    ].join('\n\n'),
  )
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    INSERT INTO organizations VALUES ('${ORG_A}'), ('${ORG_B}');
    INSERT INTO users VALUES ('${ADMIN}', '${ORG_A}', 'admin'), ('${MEMBER}', '${ORG_A}', 'engineer'),
                             ('${OTHER}', '${ORG_B}', 'engineer');
    INSERT INTO backup_config (org_id, bucket, access_key_encrypted, secret_key_encrypted, restic_password_encrypted,
                               designated_machine_name)
      VALUES ('${ORG_A}', 'b', 'AKIA', 'SECRET', 'restic-pw', 'backup-pc');
  `)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('backup secrets (schema 112)', () => {
  it('an admin reads the backup configuration with its secrets', async () => {
    await as(ADMIN)
    const r = await db.query<{ restic_password_encrypted: string }>(
      'SELECT restic_password_encrypted FROM backup_config',
    )
    expect(r.rows).toEqual([{ restic_password_encrypted: 'restic-pw' }])
  })

  it('a member reads no row, and the status without any secret', async () => {
    await as(MEMBER)
    expect((await db.query('SELECT 1 FROM backup_config')).rows).toHaveLength(0)
    const r = await db.query<{ s: Record<string, unknown> }>('SELECT get_backup_status() AS s')
    const status = r.rows[0].s
    expect(status).toMatchObject({ bucket: 'b', designated_machine_name: 'backup-pc', credentials_set: true })
    expect(JSON.stringify(status)).not.toMatch(/AKIA|SECRET|restic-pw/)
  })

  it('another organization gets nothing', async () => {
    await as(OTHER)
    const r = await db.query<{ s: unknown }>('SELECT get_backup_status() AS s')
    expect(r.rows[0].s).toBeNull()
  })
})

describe('audit rows name the caller (schema 112)', () => {
  it('activity cannot be written in somebody else’s name', async () => {
    await as(MEMBER)
    expect(
      await refused('INSERT INTO activity (org_id, user_id, action) VALUES ($1, $2, $3)', [ORG_A, ADMIN, 'delete']),
    ).toBe(true)
    expect(
      await refused('INSERT INTO activity (org_id, user_id, action) VALUES ($1, $2, $3)', [ORG_A, MEMBER, 'checkin']),
    ).toBe(false)
  })

  it('a notification always carries its sender', async () => {
    await as(MEMBER)
    const insert = 'INSERT INTO notifications (org_id, user_id, from_user_id, title) VALUES ($1, $2, $3, $4)'
    expect(await refused(insert, [ORG_A, ADMIN, null, 'System notice'])).toBe(true)
    expect(await refused(insert, [ORG_A, ADMIN, ADMIN, 'Spoofed'])).toBe(true)
  })

  it('a session row stays in the caller’s organization', async () => {
    await as(MEMBER)
    const insert = 'INSERT INTO user_sessions (user_id, org_id, machine_id) VALUES ($1, $2, $3)'
    expect(await refused(insert, [MEMBER, ORG_B, 'pc'])).toBe(true)
    expect(await refused(insert, [MEMBER, ORG_A, 'pc'])).toBe(false)
  })
})

describe('orphan functions (schema 112)', () => {
  it('drops a callable orphan and keeps a trigger function still in use, revoked', async () => {
    await db.exec('RESET ROLE')
    const r = await db.query<{ eco: string | null; rfq: string | null; can: boolean }>(
      `SELECT to_regprocedure('public.get_eco_files(uuid)')::text AS eco,
              to_regprocedure('public.update_rfq_timestamp()')::text AS rfq,
              has_function_privilege('authenticated', 'public.update_rfq_timestamp()', 'EXECUTE') AS can`,
    )
    expect(r.rows[0]).toEqual({ eco: null, rfq: 'update_rfq_timestamp()', can: false })
  })
})
