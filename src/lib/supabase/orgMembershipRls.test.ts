/**
 * Organization membership and cross-tenant reads (schema 111), run against real
 * Postgres (PGlite) with the statements loaded verbatim from supabase/core.sql:
 * the users / organizations policies, verified_auth_email(), ensure_user_org_id(),
 * join_org_by_slug(), apply_pending_team_memberships() and handle_new_user().
 *
 * The attacks these pin (security audit 2026-10-30, C1 C3 H1): rewriting your own
 * users.email to an invitee's address and calling ensure_user_org_id() to take the
 * invitation's organization and role; signing up with somebody else's address and
 * being bound to their invitation before confirming it; joining any organization
 * by its slug; reading every organization's row and every user.
 *
 * auth.users, is_org_admin() and the authenticated role are stubbed with the same
 * shapes. is_org_admin() is the role column alone here.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ADMIN_A = '00000000-0000-0000-0000-000000000001'
const MEMBER_B = '00000000-0000-0000-0000-000000000002'
const ATTACKER = '00000000-0000-0000-0000-000000000003' // confirmed, no organization
const INVITEE = '00000000-0000-0000-0000-000000000004' // signs up later
const DOMAIN_USER = '00000000-0000-0000-0000-000000000005' // @corp-a.com, confirmed
const TEAM_A = '30000000-0000-0000-0000-000000000001'
const INVITEE_EMAIL = 'invitee@corp-a.com'

const CORE = readFileSync(resolve(process.cwd(), 'supabase/core.sql'), 'utf8').replace(/\r\n/g, '\n')

const STUBS = `
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}'
);
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE TYPE user_role AS ENUM ('admin', 'engineer', 'viewer');
CREATE TABLE organizations (
  id uuid PRIMARY KEY, name text, slug text UNIQUE, email_domains text[] NOT NULL DEFAULT '{}',
  settings jsonb DEFAULT '{}', default_new_user_team_id uuid, google_drive_client_secret text
);
CREATE TABLE users (
  id uuid PRIMARY KEY, email text, full_name text, avatar_url text,
  org_id uuid REFERENCES organizations(id), role user_role DEFAULT 'engineer', last_online timestamptz
);
CREATE TABLE teams (id uuid PRIMARY KEY, org_id uuid);
CREATE TABLE team_members (team_id uuid, user_id uuid, added_by uuid, UNIQUE (team_id, user_id));
CREATE TABLE vault_access (vault_id uuid, user_id uuid, granted_by uuid, UNIQUE (vault_id, user_id));
CREATE TABLE pending_org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, email text, role user_role DEFAULT 'engineer',
  team_ids uuid[] DEFAULT '{}', vault_ids uuid[] DEFAULT '{}', invited_by uuid,
  claimed_at timestamptz, claimed_by uuid
);
CREATE TABLE blocked_users (org_id uuid, email text);
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') $$;
CREATE FUNCTION is_org_member(p_org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT p_org_id IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND org_id = p_org_id) $$;
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

let db: PGlite

async function as(userId: string): Promise<void> {
  await db.exec(
    `RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${userId}', false); SET ROLE authenticated;`,
  )
}

async function rpc<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ r: T }>(sql, params)
  return r.rows[0].r
}

async function orgOf(userId: string): Promise<{ org_id: string | null; role: string }> {
  await db.exec('RESET ROLE')
  const r = await db.query<{ org_id: string | null; role: string }>('SELECT org_id, role FROM users WHERE id = $1', [
    userId,
  ])
  return r.rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  await db.exec(
    [
      fn(CORE, 'verified_auth_email(p_user_id UUID)'),
      fn(CORE, 'my_verified_email()'),
      fn(CORE, 'apply_pending_team_memberships(p_user_id UUID)'),
      fn(CORE, 'claim_pending_membership()'),
      fn(CORE, 'handle_new_user()'),
      fn(CORE, 'ensure_user_org_id()'),
      fn(CORE, 'join_org_by_slug(p_org_slug TEXT)'),
      `CREATE TRIGGER claim_pending_membership_trigger AFTER INSERT OR UPDATE OF org_id ON users
         FOR EACH ROW WHEN (NEW.org_id IS NOT NULL) EXECUTE FUNCTION claim_pending_membership();`,
      `CREATE TRIGGER on_auth_user_created AFTER INSERT OR UPDATE ON auth.users
         FOR EACH ROW EXECUTE FUNCTION handle_new_user();`,
      'ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE users ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE pending_org_members ENABLE ROW LEVEL SECURITY;',
      policy(CORE, 'Authenticated users can view organizations', 'organizations'),
      policy(CORE, 'Authenticated users can view users', 'users'),
      policy(CORE, 'Users can update their own profile', 'users'),
      policy(CORE, 'Admins can update org users', 'users'),
      policy(CORE, 'Admins can view pending members', 'pending_org_members'),
    ].join('\n\n'),
  )
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    INSERT INTO organizations (id, name, slug, email_domains, google_drive_client_secret) VALUES
      ('${ORG_A}', 'A', 'org-a', '{corp-a.com}', 'secret-a'),
      ('${ORG_B}', 'B', 'org-b', '{}', 'secret-b');
    INSERT INTO teams VALUES ('${TEAM_A}', '${ORG_A}');
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
      ('${ADMIN_A}', 'admin@corp-a.com', now()),
      ('${MEMBER_B}', 'member@corp-b.com', now()),
      ('${ATTACKER}', 'attacker@evil.test', now()),
      ('${DOMAIN_USER}', 'dana@corp-a.com', now());
    -- handle_new_user created the rows without an organization; seat the two members.
    UPDATE users SET org_id = '${ORG_A}', role = 'admin' WHERE id = '${ADMIN_A}';
    UPDATE users SET org_id = '${ORG_B}' WHERE id = '${MEMBER_B}';
    INSERT INTO pending_org_members (org_id, email, role, team_ids, invited_by) VALUES
      ('${ORG_A}', '${INVITEE_EMAIL}', 'admin', '{${TEAM_A}}', '${ADMIN_A}');
  `)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('C1: the email that decides membership is the verified one (schema 111)', () => {
  it('a user cannot rewrite their own email', async () => {
    await as(ATTACKER)
    let refused = false
    try {
      await db.query('UPDATE users SET email = $1 WHERE id = $2', [INVITEE_EMAIL, ATTACKER])
    } catch {
      refused = true
    }
    expect(refused).toBe(true)
    const own = await db.query('UPDATE users SET full_name = $1 WHERE id = $2', ['Mallory', ATTACKER])
    expect(own.affectedRows).toBe(1)
  })

  it('an admin cannot rewrite an address either', async () => {
    await as(ADMIN_A)
    let refused = false
    try {
      await db.query('UPDATE users SET email = $1 WHERE id = $2', [INVITEE_EMAIL, ADMIN_A])
    } catch {
      refused = true
    }
    expect(refused).toBe(true)
  })

  it('a forged users.email claims nothing through ensure_user_org_id', async () => {
    await db.exec(`RESET ROLE; UPDATE users SET email = '${INVITEE_EMAIL}' WHERE id = '${ATTACKER}'`)
    await as(ATTACKER)
    const r = await rpc<{ has_org: boolean }>('SELECT ensure_user_org_id() AS r')
    expect(r.has_org).toBe(false)
    expect((await orgOf(ATTACKER)).org_id).toBeNull()
    await db.exec(`RESET ROLE; UPDATE users SET email = 'attacker@evil.test' WHERE id = '${ATTACKER}'`)
  })

  it('signing up with an invitee address binds nothing until the address is confirmed', async () => {
    await db.exec(`RESET ROLE; INSERT INTO auth.users (id, email) VALUES ('${INVITEE}', '${INVITEE_EMAIL}')`)
    expect(await orgOf(INVITEE)).toEqual({ org_id: null, role: 'engineer' })
    await as(INVITEE)
    expect((await rpc<{ has_org: boolean }>('SELECT ensure_user_org_id() AS r')).has_org).toBe(false)
    expect((await db.query('SELECT 1 FROM pending_org_members')).rows).toHaveLength(0)

    await db.exec(`RESET ROLE; UPDATE auth.users SET email_confirmed_at = now() WHERE id = '${INVITEE}'`)
    expect(await orgOf(INVITEE)).toEqual({ org_id: ORG_A, role: 'admin' })
    const teams = await db.query('SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2', [INVITEE, TEAM_A])
    expect(teams.rows).toHaveLength(1)
    const claimed = await db.query<{ claimed_by: string }>('SELECT claimed_by FROM pending_org_members')
    expect(claimed.rows[0].claimed_by).toBe(INVITEE)
  })

  it('a confirmed address in email_domains still joins through ensure_user_org_id', async () => {
    await as(DOMAIN_USER)
    const r = await rpc<{ has_org: boolean; resolved_by: string }>('SELECT ensure_user_org_id() AS r')
    expect(r).toMatchObject({ has_org: true, resolved_by: 'email_domain' })
    expect((await orgOf(DOMAIN_USER)).org_id).toBe(ORG_A)
  })
})

describe('C3: a slug is not an invitation (schema 111)', () => {
  it('join_org_by_slug refuses an address with no invitation and no domain match', async () => {
    await as(ATTACKER)
    const r = await rpc<{ success: boolean }>('SELECT join_org_by_slug($1) AS r', ['org-b'])
    expect(r.success).toBe(false)
    expect((await orgOf(ATTACKER)).org_id).toBeNull()
  })

  it('join_org_by_slug admits an invited address', async () => {
    await db.exec(`RESET ROLE; INSERT INTO pending_org_members (org_id, email, invited_by)
                   VALUES ('${ORG_B}', 'attacker@evil.test', '${MEMBER_B}')`)
    await as(ATTACKER)
    const r = await rpc<{ success: boolean }>('SELECT join_org_by_slug($1) AS r', ['org-b'])
    expect(r.success).toBe(true)
    expect((await orgOf(ATTACKER)).org_id).toBe(ORG_B)
    await db.exec(`RESET ROLE; UPDATE users SET org_id = NULL WHERE id = '${ATTACKER}'`)
  })
})

describe('H1: organizations and users are readable inside the caller organization only (schema 111)', () => {
  it('an account with no organization reads no organization and only its own user row', async () => {
    await as(ATTACKER)
    expect((await db.query('SELECT 1 FROM organizations')).rows).toHaveLength(0)
    const users = await db.query<{ id: string }>('SELECT id FROM users')
    expect(users.rows.map((u) => u.id)).toEqual([ATTACKER])
  })

  it('a member reads their own organization (secret included) and its members, nothing else', async () => {
    await as(MEMBER_B)
    const orgs = await db.query<{ id: string; google_drive_client_secret: string }>(
      'SELECT id, google_drive_client_secret FROM organizations',
    )
    expect(orgs.rows).toEqual([{ id: ORG_B, google_drive_client_secret: 'secret-b' }])
    const users = await db.query<{ id: string }>('SELECT id FROM users ORDER BY id')
    expect(users.rows.map((u) => u.id)).toEqual([MEMBER_B])
    await as(ADMIN_A)
    const a = await db.query<{ id: string }>('SELECT id FROM users ORDER BY id')
    expect(a.rows.map((u) => u.id)).toEqual([ADMIN_A, INVITEE, DOMAIN_USER])
  })
})
