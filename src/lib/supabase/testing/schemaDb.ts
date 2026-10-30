/**
 * Real Postgres (PGlite) with the BluePLM schema applied the way a Supabase project
 * gets it: a stub of the Supabase pieces the SQL depends on (roles, auth, storage,
 * the realtime publication and the platform's default privileges), then the SQL
 * files themselves, verbatim.
 *
 *   bootBaseline()   the 5.0 baseline: supabase/core.sql, then supabase/modules/*
 *                    in file-name order, as the migration runner applies it
 *   bootLegacy()     the 4.10 schema (supabase/legacy-4.10), stamped 112, the start
 *                    state of supabase/migrations/0500_from_4x.sql
 *
 * Tests that need a schema object load the whole schema rather than slicing
 * statements out of a file, so they exercise what a database actually holds.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

export const REPO = resolve(__dirname, '../../../..')
export const SUPABASE = resolve(REPO, 'supabase')
export const LEGACY = resolve(SUPABASE, 'legacy-4.10')
export const MIGRATIONS = resolve(SUPABASE, 'migrations')

/** The Supabase platform objects the schema refers to, in the shapes it uses. */
export const SUPABASE_STUB = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supabase_admin;
CREATE ROLE authenticator;
CREATE ROLE supabase_storage_admin;
CREATE ROLE supabase_auth_admin;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}',
  raw_app_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(), last_sign_in_at timestamptz, phone text
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT ''::text $$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text, owner uuid, public boolean DEFAULT false, file_size_limit bigint,
  allowed_mime_types text[], created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text,
  metadata jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
  $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS
  $$ SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
CREATE PUBLICATION supabase_realtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public, extensions, auth, storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;
SET search_path = public, extensions;
`

/** core.sql, then every module in file-name order. */
export function schemaFiles(root: string): string[] {
  const modules = readdirSync(resolve(root, 'modules'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => resolve(root, 'modules', f))
  return [resolve(root, 'core.sql'), ...modules]
}

export const readSql = (file: string): string => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

/**
 * The 4.x files end by asking for a stamp (try_stamp_schema()), which runs the
 * whole verification. That is slow on PGlite and irrelevant to a test that only
 * needs the objects, so those closing blocks are left out.
 */
function withoutStampRequest(sql: string): string {
  return sql.replace(/PERFORM try_stamp_schema\(\);/g, 'NULL;')
}

export async function bootSupabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_STUB)
  return db
}

export async function applyFiles(db: PGlite, files: string[], transform = (s: string) => s): Promise<void> {
  for (const file of files) {
    try {
      await db.exec(transform(readSql(file)))
    } catch (e) {
      throw new Error(`${file}: ${(e as Error).message}`)
    }
  }
}

/** A fresh database holding the 5.0 baseline. */
export async function bootBaseline(): Promise<PGlite> {
  const db = await bootSupabase()
  await db.exec('BEGIN')
  await applyFiles(db, schemaFiles(SUPABASE))
  await db.exec('COMMIT')
  return db
}

/** A database holding the 4.10 schema and stamped 112, as production stood before 5.0. */
export async function bootLegacy(): Promise<PGlite> {
  const db = await bootSupabase()
  await applyFiles(db, schemaFiles(LEGACY), withoutStampRequest)
  await db.exec(`UPDATE schema_version SET version = 112 WHERE id = 1`)
  return db
}

/** Act as a signed-in user (the authenticated role, auth.uid() = id). */
export async function actAs(db: PGlite, userId: string): Promise<void> {
  await db.exec(
    `RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${userId}', false); SET ROLE authenticated;`,
  )
}

/** Back to the installing superuser, with no JWT. */
export async function actAsOwner(db: PGlite): Promise<void> {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`)
}

/** Run seed statements with triggers and foreign-key checks off, as the owner. */
export async function seed(db: PGlite, sql: string): Promise<void> {
  await actAsOwner(db)
  await db.exec(`SET session_replication_role = replica;\n${sql}\nSET session_replication_role = DEFAULT;`)
}

// ---------------------------------------------------------------------------
// Normalised catalog snapshot, for comparing a fresh baseline with an upgraded
// database: every table, column, constraint, index, function (body and ACL),
// view, trigger, policy, enum and storage bucket the schema owns.

export const SNAPSHOT_QUERIES: Record<string, string> = {
  tables: `select c.relname k, json_build_object('rls', c.relrowsecurity, 'force', c.relforcerowsecurity, 'replident', c.relreplident,
      'published', exists (select 1 from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = c.relname),
      'acl', (select coalesce(json_agg(x order by x), '[]') from (select regexp_replace(a, '/.*$', '') x from unnest(coalesce(c.relacl, acldefault('r', c.relowner))::text[]) a) s),
      'comment', obj_description(c.oid, 'pg_class'))::text v
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')`,
  columns: `select c.relname || '.' || a.attname k, json_build_object('type', format_type(a.atttypid, a.atttypmod), 'notnull', a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid), 'identity', a.attidentity, 'generated', a.attgenerated, 'comment', col_description(a.attrelid, a.attnum))::text v
    from pg_attribute a join pg_class c on c.oid = a.attrelid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v') and a.attnum > 0 and not a.attisdropped`,
  constraints: `select c.conrelid::regclass::text || '|' || c.conname k, pg_get_constraintdef(c.oid) v from pg_constraint c
    where c.connamespace = 'public'::regnamespace and c.conrelid <> 0`,
  indexes: `select ic.relname k, pg_get_indexdef(i.indexrelid) v from pg_index i join pg_class ic on ic.oid = i.indexrelid where ic.relnamespace = 'public'::regnamespace`,
  functions: `select p.oid::regprocedure::text k, json_build_object('def', md5(pg_get_functiondef(p.oid)),
      'acl', (select coalesce(json_agg(x order by x), '[]') from (select regexp_replace(a, '/.*$', '') x from unnest(coalesce(p.proacl, acldefault('f', p.proowner))::text[]) a) s),
      'comment', obj_description(p.oid, 'pg_proc'))::text v
    from pg_proc p where p.pronamespace = 'public'::regnamespace`,
  views: `select viewname k, definition v from pg_views where schemaname = 'public'`,
  triggers: `select c.relnamespace::regnamespace::text || '.' || c.relname || '|' || t.tgname k, pg_get_triggerdef(t.oid) v
    from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace in ('public'::regnamespace, 'auth'::regnamespace)`,
  policies: `select schemaname || '.' || tablename || '|' || policyname k, concat_ws(' | ', permissive, roles::text, cmd, qual, with_check) v
    from pg_policies where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')`,
  enums: `select t.typname k, string_agg(e.enumlabel, ',' order by e.enumsortorder) v from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typnamespace = 'public'::regnamespace group by t.typname`,
  buckets: `select id k, row(name, public, file_size_limit, allowed_mime_types)::text v from storage.buckets`,
  manifest: `select kind || ':' || name k, concat_ws(' | ', module, probe, requires, since_version) v from public.schema_manifest_entry`,
}

export type Snapshot = Record<string, Record<string, string>>

export async function snapshot(db: PGlite): Promise<Snapshot> {
  await actAsOwner(db)
  const out: Snapshot = {}
  for (const [name, q] of Object.entries(SNAPSHOT_QUERIES)) {
    const rows = (await db.query<{ k: string; v: string }>(q)).rows
    out[name] = Object.fromEntries(rows.map((r) => [r.k, r.v]))
  }
  return out
}

/** Every difference between two snapshots, one line each. */
export function compareSnapshots(a: Snapshot, b: Snapshot): string[] {
  const diffs: string[] = []
  for (const kind of Object.keys(a)) {
    const ka = a[kind]
    const kb = b[kind] ?? {}
    for (const k of Object.keys(ka)) {
      if (!(k in kb)) diffs.push(`${kind}: only in the first: ${k}`)
      else if (ka[k] !== kb[k]) diffs.push(`${kind}: differs: ${k}: ${ka[k]} <> ${kb[k]}`)
    }
    for (const k of Object.keys(kb)) if (!(k in ka)) diffs.push(`${kind}: only in the second: ${k}`)
  }
  return diffs
}

/** Row count of every public table, keyed by the table's oid (which survives a rename). */
export async function rowCounts(db: PGlite): Promise<Map<number, { name: string; n: number }>> {
  await actAsOwner(db)
  const tables = (
    await db.query<{ oid: number; relname: string }>(
      `select oid::int, relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    )
  ).rows
  const out = new Map<number, { name: string; n: number }>()
  for (const t of tables) {
    const r = await db.query<{ n: number }>(`select count(*)::int n from public."${t.relname}"`)
    out.set(t.oid, { name: t.relname, n: r.rows[0].n })
  }
  return out
}
