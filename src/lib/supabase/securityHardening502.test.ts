/**
 * Migration 0502 (security hardening and monitoring) run against real Postgres (PGlite), loaded
 * verbatim from supabase/migrations/0502_security_hardening.sql on top of stubs of the 5.0 objects
 * it uses: auth.uid(), auth.users, organization, app_user, team, team_member, vault, the vault
 * access tables, file, folder, color_swatch, module_access, pending_org_member, notification,
 * storage.objects, auth.audit_log_entries and the stamp's existing checks (stubbed empty, so only
 * 0502's own checks can report).
 *
 * Covers: can_access_module answering for the caller only; realtime tombstones and their RLS;
 * the publication invariant; email_domains (remediation, normalization, public domains, proof of
 * control, one organization per domain); the function inventory check and the stamp; the security
 * triggers, security_monitor_run() and the RLS on the monitoring tables.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { TOMBSTONE_TABLES } from '@/lib/realtimeTombstones'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ORG_C = '00000000-0000-0000-0000-00000000000c'
const ADMIN_A = '00000000-0000-0000-0000-000000000001' // role admin, admin@acme.com
const ALICE = '00000000-0000-0000-0000-000000000002' // member of A, grant on VA1
const CAROL = '00000000-0000-0000-0000-000000000003' // member of A, no vault grant
const ADMIN_B = '00000000-0000-0000-0000-000000000004' // role admin of B, admin@beta.com
const TEAM_ADMIN_A = '00000000-0000-0000-0000-000000000005' // A, Administrators team
const NEWBIE = '00000000-0000-0000-0000-000000000006' // no org yet, newbie@acme.com
const INVITEE = '00000000-0000-0000-0000-000000000007' // no org yet, invited@acme.com
const GMAIL_ADMIN = '00000000-0000-0000-0000-000000000008' // role admin of C, someone@gmail.com
const ADMINS_TEAM_A = '30000000-0000-0000-0000-000000000001'
const PLAIN_TEAM_A = '30000000-0000-0000-0000-000000000002'
const VA1 = '40000000-0000-0000-0000-000000000001'
const VA2 = '40000000-0000-0000-0000-000000000002'
const VB1 = '40000000-0000-0000-0000-000000000003'

const MIGRATION = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0502_security_hardening.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

const STUBS = `
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
CREATE TABLE auth.audit_log_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payload json, created_at timestamptz DEFAULT now());
CREATE ROLE authenticated;
CREATE ROLE anon;

CREATE TABLE organization (id uuid PRIMARY KEY, name text, email_domains text[] NOT NULL DEFAULT '{}');
CREATE TABLE app_user (
  id uuid PRIMARY KEY, email text NOT NULL, org_id uuid REFERENCES organization(id),
  role text NOT NULL DEFAULT 'engineer', created_at timestamptz DEFAULT now()
);
CREATE TABLE team (id uuid PRIMARY KEY, org_id uuid, name text);
CREATE TABLE team_member (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid, user_id uuid);
CREATE TABLE vault (id uuid PRIMARY KEY, org_id uuid);
CREATE TABLE vault_access (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vault_id uuid, user_id uuid);
CREATE TABLE team_vault_access (team_id uuid, vault_id uuid);
CREATE TABLE file (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, vault_id uuid, file_name text);
CREATE TABLE folder (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, vault_id uuid);
CREATE TABLE color_swatch (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, org_id uuid, color text);
CREATE TABLE module_access (org_id uuid, module_id text, user_id uuid, team_id uuid);
CREATE TABLE pending_org_member (org_id uuid, email text, claimed_at timestamptz);
CREATE TABLE blocked_user (org_id uuid, email text);
CREATE TABLE supplier_contact (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE);
CREATE ROLE supabase_auth_admin;
CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid NOT NULL,
  type text NOT NULL, category text, title text NOT NULL, message text, priority text,
  entity_type text, entity_id uuid, expires_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE schema_version (id int PRIMARY KEY, version int, description text, applied_at timestamptz, applied_by text);
INSERT INTO schema_version VALUES (1, 500, '5.0', now(), 'test');
CREATE TABLE schema_manifest_entry (
  kind text, name text, module text, probe text, requires text, since_version int, PRIMARY KEY (kind, name)
);
INSERT INTO schema_manifest_entry VALUES ('function', 'verify_and_stamp_schema()', 'core', NULL, 'check_release_residue', 500);
CREATE TABLE schema_remediation_log (remediation text, rows_acted_on int, subjects jsonb, detail text);

CREATE TABLE backup_config (
  org_id uuid PRIMARY KEY, is_schedule_enabled boolean DEFAULT false, run_location text NOT NULL DEFAULT 'desktop',
  server_worker_seen_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE backup_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, started_at timestamptz DEFAULT now(),
  completed_at timestamptz, status text NOT NULL DEFAULT 'running', kind text NOT NULL DEFAULT 'backup',
  runner text, error_message text, error_details jsonb
);

CREATE SCHEMA storage;
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);

GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON app_user, team, team_member, vault, vault_access, team_vault_access, organization TO authenticated;
GRANT UPDATE ON organization TO authenticated;

CREATE FUNCTION schema_remediation_record(p_name text, p_rows int, p_subjects jsonb, p_detail text)
RETURNS int LANGUAGE sql AS
  $$ INSERT INTO schema_remediation_log VALUES (p_name, p_rows, p_subjects, p_detail) RETURNING rows_acted_on $$;
CREATE FUNCTION is_org_admin(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM app_user u WHERE u.id = p_user_id AND (u.role = 'admin' OR EXISTS (
    SELECT 1 FROM team_member tm JOIN team t ON t.id = tm.team_id
    WHERE tm.user_id = u.id AND t.org_id = u.org_id AND t.name = 'Administrators')))
$$;
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT is_org_admin(auth.uid()) $$;
CREATE FUNCTION user_get_verified_email(p_user_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT lower(email) FROM auth.users WHERE id = p_user_id AND email_confirmed_at IS NOT NULL $$;
CREATE FUNCTION my_accessible_vault_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT v.id FROM vault v JOIN app_user u ON u.id = auth.uid() AND u.org_id = v.org_id
  WHERE is_org_admin()
     OR EXISTS (SELECT 1 FROM vault_access va WHERE va.vault_id = v.id AND va.user_id = u.id)
     OR EXISTS (SELECT 1 FROM team_vault_access tva JOIN team_member tm ON tm.team_id = tva.team_id
                WHERE tva.vault_id = v.id AND tm.user_id = u.id)
$$;
CREATE FUNCTION schema_release_version() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 500 $$;
CREATE FUNCTION schema_release_description() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT '5.0' $$;
CREATE FUNCTION is_org_gate_status_blocking(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;
CREATE FUNCTION check_schema_release() RETURNS TABLE (module text, identity text, status text, detail text)
  LANGUAGE sql AS $$ SELECT NULL::text, NULL::text, NULL::text, NULL::text WHERE false $$;
CREATE FUNCTION check_org_gates() RETURNS TABLE (signature text, status text, detail text)
  LANGUAGE sql AS $$ SELECT NULL::text, NULL::text, NULL::text WHERE false $$;
CREATE FUNCTION check_anon_reach() RETURNS TABLE (identity text, severity text, detail text)
  LANGUAGE sql AS $$ SELECT NULL::text, NULL::text, NULL::text WHERE false $$;
CREATE FUNCTION check_null_unsafe_org_gates() RETURNS TABLE (signature text, detail text)
  LANGUAGE sql AS $$ SELECT NULL::text, NULL::text WHERE false $$;
CREATE FUNCTION check_unbound_entity_args() RETURNS TABLE (signature text, detail text)
  LANGUAGE sql AS $$ SELECT NULL::text, NULL::text WHERE false $$;
CREATE FUNCTION check_definer_search_path() RETURNS TABLE (signature text, detail text)
  LANGUAGE sql AS $$ SELECT NULL::text, NULL::text WHERE false $$;
CREATE FUNCTION check_withdrawn_execute() RETURNS TABLE (module text, signature text, status text, detail text)
  LANGUAGE sql AS $$ SELECT NULL::text, NULL::text, NULL::text, NULL::text WHERE false $$;
CREATE FUNCTION check_release_residue() RETURNS TABLE (identity text, residue text, detail text)
  LANGUAGE sql AS $$ SELECT NULL::text, NULL::text, NULL::text WHERE false $$;
`

const SEED = `
INSERT INTO organization (id, name, email_domains) VALUES
  ('${ORG_A}', 'Acme', ARRAY['acme.com', 'GMAIL.com', 'shared.com']),
  ('${ORG_B}', 'Beta', ARRAY['beta.com']),
  ('${ORG_C}', 'Gamma', ARRAY['shared.com']);
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('${ADMIN_A}', 'admin@acme.com', now()), ('${ALICE}', 'alice@acme.com', now()),
  ('${CAROL}', 'carol@acme.com', now()), ('${ADMIN_B}', 'admin@beta.com', now()),
  ('${TEAM_ADMIN_A}', 'boss@acme.com', now()), ('${NEWBIE}', 'newbie@acme.com', now()),
  ('${INVITEE}', 'invited@acme.com', now()), ('${GMAIL_ADMIN}', 'someone@gmail.com', now());
INSERT INTO app_user (id, email, org_id, role) VALUES
  ('${ADMIN_A}', 'admin@acme.com', '${ORG_A}', 'admin'),
  ('${ALICE}', 'alice@acme.com', '${ORG_A}', 'engineer'),
  ('${CAROL}', 'carol@acme.com', '${ORG_A}', 'engineer'),
  ('${ADMIN_B}', 'admin@beta.com', '${ORG_B}', 'admin'),
  ('${TEAM_ADMIN_A}', 'boss@acme.com', '${ORG_A}', 'engineer'),
  ('${NEWBIE}', 'newbie@acme.com', NULL, 'engineer'),
  ('${INVITEE}', 'invited@acme.com', NULL, 'engineer'),
  ('${GMAIL_ADMIN}', 'someone@gmail.com', '${ORG_C}', 'admin');
INSERT INTO team (id, org_id, name) VALUES
  ('${ADMINS_TEAM_A}', '${ORG_A}', 'Administrators'), ('${PLAIN_TEAM_A}', '${ORG_A}', 'Engineering');
INSERT INTO team_member (team_id, user_id) VALUES ('${ADMINS_TEAM_A}', '${TEAM_ADMIN_A}');
INSERT INTO vault (id, org_id) VALUES ('${VA1}', '${ORG_A}'), ('${VA2}', '${ORG_A}'), ('${VB1}', '${ORG_B}');
INSERT INTO vault_access (vault_id, user_id) VALUES ('${VA1}', '${ALICE}');
INSERT INTO module_access (org_id, module_id, user_id) VALUES ('${ORG_A}', 'eco', '${ALICE}');
INSERT INTO pending_org_member (org_id, email) VALUES ('${ORG_A}', 'invited@acme.com'), ('${ORG_B}', 'Guest@Gmail.com');
INSERT INTO blocked_user (org_id, email) VALUES ('${ORG_A}', 'banned@acme.com');
INSERT INTO supplier_contact (email) VALUES ('sales@vendor.example');
`

let db: PGlite
let hasPublication = false

async function as(userId: string | null): Promise<void> {
  await db.exec(
    userId
      ? `RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${userId}', false); SET ROLE authenticated;`
      : `RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`,
  )
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await rows<T>(sql, params))[0]
}

async function error(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  try {
    await db.exec('CREATE PUBLICATION supabase_realtime FOR TABLE file, folder;')
    hasPublication = true
  } catch {
    hasPublication = false
  }
  await db.exec(SEED)
  await db.exec(MIGRATION)
}, 60_000)

describe('1. can_access_module answers for the caller only', () => {
  it('refuses another user id from a client', async () => {
    await as(CAROL)
    expect(await error(`SELECT can_access_module('eco', '${ADMIN_B}')`)).toMatch(/calling user only/)
    expect(await error(`SELECT can_access_module('eco', '${ALICE}')`)).toMatch(/calling user only/)
  })

  it('answers for the caller, with or without the id', async () => {
    await as(ALICE)
    expect((await one<{ ok: boolean }>(`SELECT can_access_module('eco') AS ok`)).ok).toBe(true)
    expect((await one<{ ok: boolean }>(`SELECT can_access_module('eco', '${ALICE}') AS ok`)).ok).toBe(true)
    await as(CAROL)
    expect((await one<{ ok: boolean }>(`SELECT can_access_module('eco') AS ok`)).ok).toBe(false)
  })

  it('a server caller may still ask about any user', async () => {
    await as(null)
    expect((await one<{ ok: boolean }>(`SELECT can_access_module('eco', '${CAROL}') AS ok`)).ok).toBe(false)
    expect((await one<{ ok: boolean }>(`SELECT can_access_module('eco', '${ALICE}') AS ok`)).ok).toBe(true)
  })
})

describe('2. realtime deletes arrive as tombstones under RLS', () => {
  it('a purged file is visible to readers of its vault only', async () => {
    await as(null)
    const f = await one<{ id: string }>(
      `INSERT INTO file (org_id, vault_id, file_name) VALUES ('${ORG_A}', '${VA1}', 'a.sldprt') RETURNING id`,
    )
    const g = await one<{ id: string }>(
      `INSERT INTO file (org_id, vault_id, file_name) VALUES ('${ORG_A}', '${VA2}', 'b.sldprt') RETURNING id`,
    )
    await db.query(`DELETE FROM file WHERE id IN ($1, $2)`, [f.id, g.id])

    const seen = async (user: string) => {
      await as(user)
      return (await rows<{ row_id: string }>(`SELECT row_id FROM realtime_tombstone WHERE table_name = 'file'`))
        .map((r) => r.row_id)
        .sort()
    }
    expect(await seen(ALICE)).toEqual([f.id])
    expect(await seen(CAROL)).toEqual([])
    expect(await seen(ADMIN_A)).toEqual([f.id, g.id].sort())
    expect(await seen(ADMIN_B)).toEqual([])
  })

  it('one statement deleting many rows writes one tombstone each', async () => {
    await as(null)
    await db.exec(`INSERT INTO folder (org_id, vault_id) SELECT '${ORG_A}', '${VA1}' FROM generate_series(1, 5)`)
    await db.exec(`DELETE FROM folder`)
    expect((await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM realtime_tombstone WHERE table_name = 'folder'`)).n).toBe(5)
  })

  it('a personal swatch is seen by its owner only; an org swatch by the organization', async () => {
    await as(null)
    const mine = await one<{ id: string }>(
      `INSERT INTO color_swatch (user_id, org_id, color) VALUES ('${ALICE}', NULL, '#fff') RETURNING id`,
    )
    const org = await one<{ id: string }>(
      `INSERT INTO color_swatch (user_id, org_id, color) VALUES (NULL, '${ORG_A}', '#000') RETURNING id`,
    )
    await db.exec(`DELETE FROM color_swatch`)
    await as(ALICE)
    const alice = (await rows<{ row_id: string }>(`SELECT row_id FROM realtime_tombstone WHERE table_name = 'color_swatch'`)).map((r) => r.row_id)
    expect(alice.sort()).toEqual([mine.id, org.id].sort())
    await as(CAROL)
    const carol = (await rows<{ row_id: string }>(`SELECT row_id FROM realtime_tombstone WHERE table_name = 'color_swatch'`)).map((r) => r.row_id)
    expect(carol).toEqual([org.id])
  })

  it('a lost team membership names its member and resolves the organization through the team', async () => {
    await as(null)
    await db.exec(`INSERT INTO team_member (team_id, user_id) VALUES ('${PLAIN_TEAM_A}', '${CAROL}')`)
    await db.exec(`DELETE FROM team_member WHERE team_id = '${PLAIN_TEAM_A}' AND user_id = '${CAROL}'`)
    const t = await one<{ org_id: string; subject_user_id: string }>(
      `SELECT org_id, subject_user_id FROM realtime_tombstone WHERE table_name = 'team_member'`,
    )
    expect(t).toEqual({ org_id: ORG_A, subject_user_id: CAROL })
  })

  it('the client listens for exactly the tables the migration writes tombstones for', () => {
    const block = /FOREACH t IN ARRAY ARRAY\[([^\]]*)\]/.exec(MIGRATION)?.[1] ?? ''
    const tables = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(tables.sort()).toEqual([...TOMBSTONE_TABLES].sort())
  })

  it('clients cannot write tombstones', async () => {
    await as(ADMIN_A)
    expect(await error(`INSERT INTO realtime_tombstone (org_id, table_name, row_id) VALUES ('${ORG_A}', 'file', 'x')`)).not.toBeNull()
  })

  it('the publication publishes inserts and updates only, and carries the tombstones', async () => {
    if (!hasPublication) return
    await as(null)
    const p = await one<{ pubdelete: boolean; pubtruncate: boolean; pubinsert: boolean }>(
      `SELECT pubinsert, pubdelete, pubtruncate FROM pg_publication WHERE pubname = 'supabase_realtime'`,
    )
    expect(p).toEqual({ pubinsert: true, pubdelete: false, pubtruncate: false })
    expect(await rows(`SELECT * FROM check_realtime_publication()`)).toEqual([])

    await db.exec(`ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update, delete')`)
    const found = await rows<{ status: string }>(`SELECT status FROM check_realtime_publication()`)
    expect(found.map((r) => r.status)).toEqual(['realtime-publishes-delete'])
    await db.exec(`ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update')`)
  })
})

describe('3. organization.email_domains', () => {
  it('the migration removed public and shared domains, and logged them', async () => {
    await as(null)
    const orgs = await rows<{ id: string; email_domains: string[] }>(`SELECT id, email_domains FROM organization ORDER BY id`)
    expect(orgs).toEqual([
      { id: ORG_A, email_domains: ['acme.com'] },
      { id: ORG_B, email_domains: ['beta.com'] },
      { id: ORG_C, email_domains: [] },
    ])
    const log = await one<{ rows_acted_on: number }>(
      `SELECT rows_acted_on FROM schema_remediation_log WHERE remediation = 'email_domains_public_or_shared'`,
    )
    expect(log.rows_acted_on).toBe(3)
    expect(await rows(`SELECT domain, org_id FROM org_email_domain ORDER BY domain`)).toEqual([
      { domain: 'acme.com', org_id: ORG_A },
      { domain: 'beta.com', org_id: ORG_B },
    ])
  })

  it('an admin adds only the domain of their own verified address', async () => {
    await as(ADMIN_A)
    expect(await error(`UPDATE organization SET email_domains = ARRAY['acme.com', 'acme.io'] WHERE id = '${ORG_A}'`)).toMatch(
      /own verified address/,
    )
    await as(GMAIL_ADMIN)
    expect(await error(`UPDATE organization SET email_domains = ARRAY['gmail.com'] WHERE id = '${ORG_C}'`)).toMatch(/Public mail domain/)
  })

  it('a domain belongs to one organization', async () => {
    await as(null)
    expect(await error(`UPDATE organization SET email_domains = ARRAY['acme.com'] WHERE id = '${ORG_B}'`)).toMatch(
      /belongs to another organization/,
    )
  })

  it('a server caller adds any non-public domain, normalized', async () => {
    await as(null)
    await db.exec(`UPDATE organization SET email_domains = ARRAY['acme.com', '  @ACME.io ', 'acme.io'] WHERE id = '${ORG_A}'`)
    expect((await one<{ d: string[] }>(`SELECT email_domains AS d FROM organization WHERE id = '${ORG_A}'`)).d).toEqual([
      'acme.com',
      'acme.io',
    ])
    expect(await error(`UPDATE organization SET email_domains = ARRAY['not a domain'] WHERE id = '${ORG_B}'`)).toMatch(/Not a domain/)
  })

  it('an admin at another address may still remove a domain', async () => {
    await as(ADMIN_A)
    await db.exec(`UPDATE organization SET email_domains = ARRAY['acme.com'] WHERE id = '${ORG_A}'`)
    await as(null)
    expect(await rows(`SELECT domain FROM org_email_domain WHERE org_id = '${ORG_A}'`)).toEqual([{ domain: 'acme.com' }])
  })
})

describe('4. every exposed function is registered', () => {
  it('flags an unregistered SECURITY DEFINER function, and none of 0502s own', async () => {
    await as(null)
    await db.exec(`CREATE FUNCTION public.leak() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$`)
    const flagged = (await rows<{ signature: string }>(`SELECT signature FROM check_function_inventory()`)).map((r) => r.signature)
    expect(flagged).toContain('leak()')
    for (const own of [
      'can_access_module(text,uuid)',
      'security_monitor_run()',
      'trg_realtime_tombstone_write()',
      'is_public_email_domain(text)',
      'security_event_record(uuid,text,text,text,jsonb)',
    ]) {
      expect(flagged).not.toContain(own)
    }
  })

  it('the stamp refuses while it exists, and stamps once it is gone', async () => {
    await as(null)
    const refused = await one<{ r: { stamped: boolean; problems: Array<{ object: string; status: string }> } }>(
      `SELECT verify_and_stamp_schema() AS r`,
    )
    expect(refused.r.stamped).toBe(false)
    expect(refused.r.problems).toContainEqual(expect.objectContaining({ object: 'leak()', status: 'unregistered' }))

    // The stubs stand for the baseline here; register them so only real findings remain.
    await db.exec(`
      INSERT INTO schema_function_inventory (signature, module, release)
      SELECT p.oid::regprocedure::text, 'test-stub', 0
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname <> 'leak'
      ON CONFLICT DO NOTHING;
      DROP FUNCTION public.leak();
    `)
    const stamped = await one<{ r: { stamped: boolean; problems: unknown[] } }>(`SELECT verify_and_stamp_schema() AS r`)
    expect(stamped.r.problems).toEqual([])
    expect(stamped.r.stamped).toBe(true)
    expect((await one<{ version: number }>(`SELECT version FROM schema_version WHERE id = 1`)).version).toBe(502)
  })
})

describe('6. sign-up needs somewhere to belong', () => {
  const decide = async (email: string | null) =>
    (
      await one<{ r: { error?: { http_code: number; message: string } } }>(
        `SELECT auth_hook_before_user_created($1::jsonb) AS r`,
        [JSON.stringify({ metadata: { name: 'before-user-created' }, user: { email, app_metadata: { provider: 'google' } } })],
      )
    ).r

  it('allows an invited address, a domain address and a supplier contact', async () => {
    await as(null)
    expect(await decide('Guest@gmail.com')).toEqual({}) // invited, even at a public domain
    expect(await decide('someone.new@ACME.com')).toEqual({}) // org A's domain
    expect(await decide('sales@vendor.example')).toEqual({})
  })

  it('refuses a stranger, a public-domain address, a blocked address and no address', async () => {
    await as(null)
    for (const email of ['stranger@elsewhere.com', 'random@gmail.com', 'banned@acme.com', null, 'no-at-sign']) {
      const r = await decide(email)
      expect(r.error?.http_code, String(email)).toBe(403)
      expect(r.error?.message).toMatch(/^Not invited/)
    }
  })

  it('a claimed invitation no longer admits', async () => {
    await as(null)
    await db.exec(`UPDATE pending_org_member SET claimed_at = now() WHERE email = 'Guest@Gmail.com'`)
    expect((await decide('guest@gmail.com')).error?.http_code).toBe(403)
  })

  it('only Supabase Auth may call it', async () => {
    await as(null)
    const can = await one<{ auth: boolean; authenticated: boolean; anon: boolean }>(
      `SELECT has_function_privilege('supabase_auth_admin', 'auth_hook_before_user_created(jsonb)', 'EXECUTE') AS auth,
              has_function_privilege('authenticated', 'auth_hook_before_user_created(jsonb)', 'EXECUTE') AS authenticated,
              has_function_privilege('anon', 'auth_hook_before_user_created(jsonb)', 'EXECUTE') AS anon`,
    )
    expect(can).toEqual({ auth: true, authenticated: false, anon: false })
  })
})

describe('release manifest', () => {
  it('registers every 0502 table and every function it defines, with code markers that are in the bodies', async () => {
    await as(null)
    const entries = await rows<{ kind: string; name: string; requires: string | null; since_version: number }>(
      `SELECT kind, name, requires, since_version FROM schema_manifest_entry WHERE since_version = 502`,
    )
    // The release number and description are 5.0's own entries; 0502 only changes their values.
    const defined = [...MIGRATION.matchAll(/CREATE OR REPLACE FUNCTION ([a-z_]+)\(/g)]
      .map((m) => m[1])
      .filter((name) => name !== 'schema_release_version' && name !== 'schema_release_description')
    const fnNames = new Set(entries.filter((e) => e.kind === 'function').map((e) => e.name.replace(/\(.*$/, '')))
    for (const name of defined) expect(fnNames, name).toContain(name)
    const tables = [...MIGRATION.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/g)].map((m) => m[1])
    expect(entries.filter((e) => e.kind === 'table').map((e) => e.name).sort()).toEqual(tables.sort())
    // The redefined 5.0 function takes 0502's marker.
    expect(entries.find((e) => e.name === 'verify_and_stamp_schema()')?.requires).toBe('schema_list_problems')
    for (const e of entries.filter((x) => x.kind === 'function' && x.requires)) {
      const src = (await one<{ src: string }>(`SELECT prosrc AS src FROM pg_proc WHERE oid = $1::regprocedure`, [e.name])).src
      for (const token of (e.requires ?? '').split(' && ')) expect(src, `${e.name}: ${token}`).toContain(token)
    }
  })
})

describe('5. security monitoring', () => {
  it('records admin grants through the role, the Administrators team and a team rename', async () => {
    await as(null)
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${ADMIN_A}', false)`)
    await db.exec(`UPDATE app_user SET role = 'admin' WHERE id = '${ALICE}'`)
    await db.exec(`INSERT INTO team_member (team_id, user_id) VALUES ('${ADMINS_TEAM_A}', '${CAROL}')`)
    await db.exec(`INSERT INTO team_member (team_id, user_id) VALUES ('${PLAIN_TEAM_A}', '${CAROL}')`)
    await db.exec(`UPDATE team SET name = 'Administrators' WHERE id = '${PLAIN_TEAM_A}'`)
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`)
    const ev = await rows<{ via: string; user_id: string; by: string }>(
      `SELECT subject->>'via' AS via, subject->>'user_id' AS user_id, subject->>'by' AS by
       FROM security_event WHERE kind = 'admin_granted' ORDER BY id`,
    )
    expect(ev).toEqual([
      { via: 'role', user_id: ALICE, by: ADMIN_A },
      { via: 'team', user_id: CAROL, by: ADMIN_A },
      { via: 'team_rename', user_id: CAROL, by: ADMIN_A },
    ])
    // Put the fixture back: Carol is a plain member again.
    await db.exec(`
      UPDATE team SET name = 'Engineering' WHERE id = '${PLAIN_TEAM_A}';
      DELETE FROM team_member WHERE user_id = '${CAROL}';
      UPDATE app_user SET role = 'engineer' WHERE id = '${ALICE}';
    `)
  })

  it('records a join through email_domains, not one through an invitation', async () => {
    await as(null)
    await db.exec(`UPDATE app_user SET org_id = '${ORG_A}' WHERE id = '${NEWBIE}'`)
    await db.exec(`
      UPDATE pending_org_member SET claimed_at = now() WHERE email = 'invited@acme.com';
      UPDATE app_user SET org_id = '${ORG_A}' WHERE id = '${INVITEE}';
    `)
    const joins = await rows<{ user_id: string }>(`SELECT subject->>'user_id' AS user_id FROM security_event WHERE kind = 'domain_join'`)
    expect(joins).toEqual([{ user_id: NEWBIE }])
  })

  it('notifies the organization admins, once per kind per hour', async () => {
    await as(null)
    await db.exec(`SELECT security_monitor_run()`)
    const n = await rows<{ user_id: string; title: string; org_id: string }>(
      `SELECT user_id, title, org_id FROM notification WHERE type = 'security_alert' ORDER BY title, user_id`,
    )
    const admins = [ADMIN_A, TEAM_ADMIN_A].sort()
    expect(n.filter((r) => r.title === 'Security: new administrator').map((r) => r.user_id).sort()).toEqual(admins)
    expect(n.filter((r) => r.title === 'Security: member joined by email domain').map((r) => r.user_id).sort()).toEqual(admins)
    expect(n.every((r) => r.org_id === ORG_A)).toBe(true)
    expect(n.some((r) => r.user_id === ADMIN_B)).toBe(false)

    // A new grant inside the hour waits for the next window instead of a second alert.
    await db.exec(`UPDATE app_user SET role = 'admin' WHERE id = '${CAROL}'`)
    await db.exec(`SELECT security_monitor_run()`)
    expect((await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM notification WHERE title = 'Security: new administrator'`)).n).toBe(2)
    expect((await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM security_event WHERE notified_at IS NULL`)).n).toBe(1)
    await db.exec(`UPDATE app_user SET role = 'engineer' WHERE id = '${CAROL}'; DELETE FROM security_event WHERE notified_at IS NULL;`)
  })

  it('detects file purges, storage deletes and auth pressure against per-org thresholds', async () => {
    await as(null)
    await db.exec(`
      INSERT INTO org_security_setting (org_id, file_delete_threshold, storage_delete_threshold, auth_event_threshold)
      VALUES ('${ORG_A}', 3, 4, 2);
      INSERT INTO file (org_id, vault_id, file_name) SELECT '${ORG_A}', '${VA1}', 'x' FROM generate_series(1, 3);
      DELETE FROM file;
      INSERT INTO storage.objects (bucket_id, name) SELECT 'vault', '${ORG_A}/ab/' || g FROM generate_series(1, 6) g;
      INSERT INTO storage.objects (bucket_id, name) SELECT 'vault', '${ORG_B}/ab/' || g FROM generate_series(1, 6) g;
      UPDATE security_monitor_state SET storage_counted_at = now() - interval '2 hours';
    `)
    await db.exec(`SELECT security_monitor_run()`) // counts 6 objects for each organization
    await db.exec(`
      DELETE FROM storage.objects WHERE name LIKE '${ORG_A}/%' AND name NOT LIKE '%/1';
      DELETE FROM storage.objects WHERE name LIKE '${ORG_B}/%';
      UPDATE security_monitor_state SET storage_counted_at = now() - interval '2 hours';
      INSERT INTO auth.audit_log_entries (payload) SELECT json_build_object('action', 'user_recovery_requested', 'actor_username', 'x@acme.com') FROM generate_series(1, 2);
      INSERT INTO auth.audit_log_entries (payload) SELECT json_build_object('action', 'login', 'actor_username', 'x@acme.com') FROM generate_series(1, 9);
    `)
    await db.exec(`SELECT security_monitor_run()`)
    const kinds = await rows<{ org_id: string; kind: string }>(
      `SELECT org_id, kind FROM security_event WHERE kind IN ('file_delete_spike', 'storage_delete_spike', 'auth_event_spike') ORDER BY kind, org_id`,
    )
    // Org B lost 6 objects against the default threshold of 500: no event.
    expect(kinds).toEqual([
      { org_id: ORG_A, kind: 'auth_event_spike' },
      { org_id: ORG_A, kind: 'file_delete_spike' },
      { org_id: ORG_A, kind: 'storage_delete_spike' },
    ])
  })

  it('alerts on failed backups, an overdue schedule and a silent server worker', async () => {
    await as(null)
    await db.exec(`
      INSERT INTO backup_config (org_id, is_schedule_enabled, run_location, server_worker_seen_at, created_at, updated_at)
      VALUES ('${ORG_A}', true, 'server', now() - interval '1 hour', now() - interval '3 days', now() - interval '3 days'),
             ('${ORG_B}', true, 'server', now(), now() - interval '3 days', now() - interval '3 days');
      INSERT INTO backup_history (org_id, status, kind, runner, error_message, started_at, completed_at) VALUES
        ('${ORG_A}', 'failed', 'backup', 'server', 'bucket unreachable', now() - interval '50 hours', now() - interval '1 hour'),
        ('${ORG_A}', 'completed', 'backup', 'server', NULL, now() - interval '40 hours', now() - interval '39 hours'),
        ('${ORG_B}', 'completed', 'backup', 'server', NULL, now() - interval '2 hours', now() - interval '1 hour'),
        ('${ORG_B}', 'failed', 'backup', 'server', 'old', now() - interval '9 days', now() - interval '9 days');
      INSERT INTO backup_history (org_id, status, kind, runner, error_message, error_details, started_at, completed_at) VALUES
        ('${ORG_B}', 'failed', 'backup', 'server', 'restart', '{"interrupted": true}', now() - interval '3 hours', now() - interval '3 hours');
    `)
    await db.exec(`SELECT security_monitor_run()`)
    await db.exec(`SELECT security_monitor_run()`)
    const ev = await rows<{ org_id: string; kind: string }>(
      `SELECT org_id, kind FROM security_event WHERE kind LIKE 'backup%' ORDER BY org_id, kind`,
    )
    // B succeeded recently and its worker is alive; one failure is older than the two-day window and
    // the other was a restart the worker resumes.
    expect(ev).toEqual([
      { org_id: ORG_A, kind: 'backup_failed' },
      { org_id: ORG_A, kind: 'backup_overdue' },
      { org_id: ORG_A, kind: 'backup_worker_silent' },
    ])
    const titles = (
      await rows<{ title: string }>(
        `SELECT DISTINCT title FROM notification WHERE user_id = '${ADMIN_A}' AND title LIKE 'Backups:%' ORDER BY title`,
      )
    ).map((r) => r.title)
    expect(titles).toEqual(['Backups: a run failed', 'Backups: overdue', 'Backups: server worker silent'])
  })

  it('with no operators listed, every admin in the database is one', async () => {
    await as(null)
    const ids = (await rows<{ id: string }>(`SELECT security_operator_user_ids() AS id`)).map((r) => r.id).sort()
    expect(ids).toEqual([ADMIN_A, ADMIN_B, TEAM_ADMIN_A, GMAIL_ADMIN].sort())
  })

  it('sends deployment-wide events to the operators and runs the drift check daily', async () => {
    await as(null)
    await db.exec(`
      INSERT INTO security_platform_operator (user_id) VALUES ('${ADMIN_B}');
      CREATE FUNCTION public.orphan() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
      UPDATE security_platform_state SET last_drift_check_at = NULL;
    `)
    await db.exec(`SELECT security_monitor_run()`)
    const drift = await one<{ n: number }>(`SELECT (subject->>'count')::int AS n FROM security_event WHERE kind = 'schema_drift'`)
    expect(drift.n).toBe(1)
    const to = await rows<{ user_id: string }>(`SELECT user_id FROM notification WHERE title = 'Security: database drift'`)
    expect(to).toEqual([{ user_id: ADMIN_B }])
    await db.exec(`DROP FUNCTION public.orphan()`)
  })

  it('sends the daily summary at the configured hour, once', async () => {
    await as(null)
    await db.exec(`UPDATE org_security_setting SET summary_hour_utc = extract(hour FROM now() AT TIME ZONE 'UTC')::int WHERE org_id = '${ORG_A}'`)
    await db.exec(`SELECT security_monitor_run()`)
    await db.exec(`SELECT security_monitor_run()`)
    const s = await rows<{ user_id: string }>(`SELECT user_id FROM notification WHERE type = 'security_summary' AND org_id = '${ORG_A}' AND title = 'Security: daily summary'`)
    expect(s.map((r) => r.user_id).sort()).toEqual([ADMIN_A, TEAM_ADMIN_A].sort())
  })

  it('prunes old tombstones and events', async () => {
    await as(null)
    await db.exec(`
      UPDATE realtime_tombstone SET created_at = now() - interval '2 days';
      INSERT INTO security_event (org_id, kind, summary, created_at) VALUES ('${ORG_A}', 'domain_join', 'old', now() - interval '100 days');
    `)
    await db.exec(`SELECT security_monitor_run()`)
    expect((await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM realtime_tombstone`)).n).toBe(0)
    expect((await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM security_event WHERE summary = 'old'`)).n).toBe(0)
  })

  it('admins read and change their own organization only; members neither', async () => {
    await as(ADMIN_A)
    expect((await rows(`SELECT org_id FROM org_security_setting`)).length).toBe(1)
    await db.exec(`UPDATE org_security_setting SET file_delete_threshold = 50, updated_by = '${ADMIN_A}' WHERE org_id = '${ORG_A}'`)
    expect((await rows(`SELECT id FROM security_event WHERE org_id = '${ORG_A}'`)).length).toBeGreaterThan(0)
    expect((await rows(`SELECT id FROM security_event WHERE org_id IS NULL`)).length).toBe(0)

    await as(ALICE)
    expect(await rows(`SELECT org_id FROM org_security_setting`)).toEqual([])
    expect(await rows(`SELECT id FROM security_event`)).toEqual([])
    const r = await db.query(`UPDATE org_security_setting SET file_delete_threshold = 1, updated_by = '${ALICE}'`)
    expect(r.affectedRows).toBe(0)

    await as(ADMIN_B)
    expect(await rows(`SELECT org_id FROM org_security_setting`)).toEqual([])
    expect(await error(`INSERT INTO org_security_setting (org_id, updated_by) VALUES ('${ORG_A}', '${ADMIN_B}')`)).not.toBeNull()
    // Operator: reads deployment-wide events.
    expect((await rows(`SELECT id FROM security_event WHERE org_id IS NULL`)).length).toBeGreaterThan(0)

    await as(ADMIN_A)
    expect(await error(`UPDATE org_security_setting SET summary_hour_utc = 30, updated_by = '${ADMIN_A}'`)).not.toBeNull()
    expect(await error(`SELECT security_monitor_run()`)).not.toBeNull()
  })
})
