/**
 * Vault access enforced by the database (schema 111), run against real Postgres
 * (PGlite) with the statements loaded verbatim from supabase/modules: the
 * my_accessible_vault_ids() helper, user_may_access_vault(), the entity gates,
 * the vault load RPCs, the file-data policies and the vault storage bucket block.
 *
 * The rule is the renderer's (getAccessibleVaults): an org admin reads every vault
 * of their organization, anyone else exactly the vaults granted directly or
 * through a team, and no grant means no vault.
 *
 * The Supabase pieces the statements depend on (auth.uid(), users, teams,
 * is_org_admin(), require_org_member(), the storage schema, the authenticated
 * role) are stubbed with the same shapes. is_org_admin() is stubbed as the role
 * column alone; the real one also admits the Administrators team, which does not
 * change what these policies do with its answer.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ADMIN = '00000000-0000-0000-0000-000000000001'
const ALICE = '00000000-0000-0000-0000-000000000002' // direct grant on VA1
const BOB = '00000000-0000-0000-0000-000000000003' // team grant on VA2
const CAROL = '00000000-0000-0000-0000-000000000004' // no grant
const OTHER_ADMIN = '00000000-0000-0000-0000-000000000005' // admin of org B
const TEAM = '30000000-0000-0000-0000-000000000001'
const VA1 = '40000000-0000-0000-0000-000000000001'
const VA2 = '40000000-0000-0000-0000-000000000002'
const VB1 = '40000000-0000-0000-0000-000000000003'
const F1 = '50000000-0000-0000-0000-000000000001'
const F2 = '50000000-0000-0000-0000-000000000002'
const FB = '50000000-0000-0000-0000-000000000003'
const H1 = '1'.repeat(64)
const H2 = '2'.repeat(64)
const HB = 'b'.repeat(64)
const H_NEW = 'c'.repeat(64)
const H1_OLD = 'e'.repeat(64) // an older version of F1
const H_PDF = 'd'.repeat(64) // the drawing PDF of F2

const MODULES = resolve(process.cwd(), 'supabase/modules')
const M10 = readFileSync(resolve(MODULES, '10-source-files.sql'), 'utf8').replace(/\r\n/g, '\n')

/** Tables whose rows expose a file's name, path, hash or metadata (check_release_residue). */
const FILE_DATA_TABLES = [
  'files',
  'file_versions',
  'folders',
  'file_references',
  'file_version_references',
  'drawing_pdf_renders',
  'release_files',
  'file_comments',
  'file_watchers',
  'file_share_links',
  'file_state_entries',
  'file_workflow_assignments',
  'workflow_history',
  'workflow_review_history',
  'activity',
  'inspection_characteristics',
  'inspection_characteristic_versions',
  'file_ecos',
  'file_deviations',
]

const STUBS = `
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE TABLE organizations (id uuid PRIMARY KEY);
CREATE TABLE users (id uuid PRIMARY KEY, org_id uuid REFERENCES organizations(id), role text);
CREATE TABLE teams (id uuid PRIMARY KEY, org_id uuid);
CREATE TABLE team_members (team_id uuid, user_id uuid);
CREATE TABLE vaults (id uuid PRIMARY KEY, org_id uuid, name text);
CREATE TABLE vault_access (vault_id uuid, user_id uuid);
CREATE TABLE team_vault_access (team_id uuid, vault_id uuid);
CREATE TYPE file_type AS ENUM ('part', 'assembly', 'drawing', 'other');
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, vault_id uuid,
  file_path text NOT NULL, file_name text NOT NULL, extension text NOT NULL DEFAULT '.sldprt',
  file_type file_type DEFAULT 'part', part_number text, description text, revision text,
  version int DEFAULT 1, content_hash text, file_size bigint DEFAULT 1, state text,
  checked_out_by uuid, checked_out_at timestamptz, updated_at timestamptz DEFAULT now(),
  custom_properties jsonb, checked_out_file_path text, checked_out_file_name text,
  deleted_at timestamptz
);
CREATE TABLE file_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_id uuid, content_hash text);
CREATE TABLE folders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, vault_id uuid, folder_path text);
CREATE TABLE file_version_references (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, parent_file_id uuid, child_path text);
CREATE TABLE drawing_pdf_renders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, file_id uuid, storage_hash text);
CREATE TABLE activity (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, file_id uuid, action text);
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') $$;
CREATE FUNCTION is_org_admin(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND role = 'admin') $$;
CREATE FUNCTION is_org_member(p_org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND org_id = p_org_id) $$;
CREATE FUNCTION current_actor_id() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN auth.uid();
END $$;
CREATE FUNCTION require_org_member(p_org_id uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;
CREATE FUNCTION user_has_team_permission(text, text, uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

CREATE SCHEMA storage;
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- The policy cbe3997 committed, which a deployment may still carry.
CREATE POLICY "Authenticated users can read from vault"
  ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'vault');
-- The dashboard-made kind production carried: every bucket, no condition.
CREATE POLICY "Allow authenticated access 1uo56a_0"
  ON storage.objects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated access 1uo56a_2"
  ON storage.objects FOR UPDATE TO authenticated USING (true);
`

/** One CREATE FUNCTION statement, from its header to the `$$ ...;` line that closes it. */
function fn(sql: string, header: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${header}`)
  expect(start, header).toBeGreaterThan(-1)
  const end = /^\$\$[^\n]*;$/m.exec(sql.slice(start))
  expect(end, header).not.toBeNull()
  return sql.slice(start, start + (end?.index ?? 0) + (end?.[0].length ?? 0))
}

/** One CREATE POLICY statement on the given table. */
function policy(sql: string, name: string, table: string): string {
  const start = sql.indexOf(`CREATE POLICY "${name}"\n  ON ${table} `)
  expect(start, name).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf(';\n', start) + 1)
}

/** The vault storage bucket DO block. */
function storageBlock(): string {
  const start = M10.indexOf('DO $$\nDECLARE\n  v_owner TEXT;')
  expect(start).toBeGreaterThan(-1)
  return M10.slice(start, M10.indexOf('END $$;', start) + 'END $$;'.length)
}

let db: PGlite

async function as(userId: string): Promise<void> {
  await db.exec(
    `RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${userId}', false); SET ROLE authenticated;`,
  )
}

async function ids(sql: string, params: unknown[] = []): Promise<string[]> {
  const r = await db.query<{ id: string }>(sql, params)
  return r.rows.map((row) => row.id).sort()
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
      fn(M10, 'my_accessible_vault_ids()'),
      fn(M10, 'user_may_access_vault(p_user_id UUID, p_vault_id UUID)'),
      fn(M10, 'may_access_vault(p_vault_id UUID)'),
      fn(M10, 'require_file_access(p_file_id UUID)'),
      fn(M10, 'require_vault_access(p_vault_id UUID)'),
      fn(M10, 'get_vault_files_fast('),
      fn(M10, 'get_vault_files_count('),
      fn(M10, 'may_read_vault_object(p_name TEXT)'),
      'ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE files ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE folders ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE file_version_references ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE drawing_pdf_renders ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE activity ENABLE ROW LEVEL SECURITY;',
      policy(M10, 'Authenticated users can view vaults', 'vaults'),
      policy(M10, 'Users can view org files', 'files'),
      policy(M10, 'Engineers can insert files', 'files'),
      policy(M10, 'Engineers can update files', 'files'),
      policy(M10, 'Admins can delete files', 'files'),
      policy(M10, 'Users can view file versions', 'file_versions'),
      policy(M10, 'Engineers can manage file versions', 'file_versions'),
      policy(M10, 'Users can view org folders', 'folders'),
      policy(M10, 'Users can view file version references', 'file_version_references'),
      policy(M10, 'Users can view drawing pdf renders', 'drawing_pdf_renders'),
      policy(M10, 'Users can view org activity', 'activity'),
    ].join('\n\n'),
  )
  await db.exec(storageBlock())
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth, storage TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO authenticated;
    INSERT INTO organizations VALUES ('${ORG_A}'), ('${ORG_B}');
    INSERT INTO users VALUES
      ('${ADMIN}', '${ORG_A}', 'admin'),
      ('${ALICE}', '${ORG_A}', 'engineer'),
      ('${BOB}', '${ORG_A}', 'engineer'),
      ('${CAROL}', '${ORG_A}', 'engineer'),
      ('${OTHER_ADMIN}', '${ORG_B}', 'admin');
    INSERT INTO teams VALUES ('${TEAM}', '${ORG_A}');
    INSERT INTO team_members VALUES ('${TEAM}', '${BOB}');
    INSERT INTO vaults VALUES ('${VA1}', '${ORG_A}', 'A1'), ('${VA2}', '${ORG_A}', 'A2'), ('${VB1}', '${ORG_B}', 'B1');
    INSERT INTO vault_access VALUES ('${VA1}', '${ALICE}');
    INSERT INTO team_vault_access VALUES ('${TEAM}', '${VA2}');
    INSERT INTO files (id, org_id, vault_id, file_path, file_name, content_hash) VALUES
      ('${F1}', '${ORG_A}', '${VA1}', 'a1/one.sldprt', 'one.sldprt', '${H1}'),
      ('${F2}', '${ORG_A}', '${VA2}', 'a2/two.sldprt', 'two.sldprt', '${H2}'),
      ('${FB}', '${ORG_B}', '${VB1}', 'b1/b.sldprt', 'b.sldprt', '${HB}');
    INSERT INTO file_versions (file_id, content_hash) VALUES ('${F1}', '${H1}'), ('${F1}', '${H1_OLD}'), ('${F2}', '${H2}'), ('${FB}', '${HB}');
    INSERT INTO folders (org_id, vault_id, folder_path) VALUES ('${ORG_A}', '${VA1}', 'a1'), ('${ORG_A}', '${VA2}', 'a2');
    INSERT INTO file_version_references (org_id, parent_file_id, child_path) VALUES ('${ORG_A}', '${F2}', 'a2/child.sldprt');
    INSERT INTO drawing_pdf_renders (org_id, file_id, storage_hash) VALUES ('${ORG_A}', '${F2}', '${H_PDF}');
    INSERT INTO activity (org_id, file_id, action) VALUES ('${ORG_A}', '${F1}', 'checkin'), ('${ORG_A}', '${F2}', 'checkin'), ('${ORG_A}', NULL, 'login');
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES
      ('vault', '${ORG_A}/11/${H1}', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_A}/${H2}', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_A}/cc/${H_NEW}', '${CAROL}', '${CAROL}'),
      ('vault', '${ORG_A}/ee/${H1_OLD}', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_A}/dd/${H_PDF}', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_A}/_assets/logo.png', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_A}/inspection-previews/${F2}-1700000000.png', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_B}/bb/${HB}', '${OTHER_ADMIN}', '${OTHER_ADMIN}');
  `)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

const fileIds = () => ids('SELECT id FROM files')
const objects = async () =>
  (await db.query<{ name: string }>('SELECT name FROM storage.objects ORDER BY name')).rows.map((r) =>
    r.name.replace(`${ORG_A}/`, 'A/').replace(`${ORG_B}/`, 'B/'),
  )

describe('my_accessible_vault_ids() and user_may_access_vault() (schema 111)', () => {
  it('an admin gets every vault of their own organization and no other', async () => {
    await as(ADMIN)
    expect(await ids('SELECT my_accessible_vault_ids() AS id')).toEqual([VA1, VA2])
  })

  it('a member gets their direct and team grants, and no grant means no vault', async () => {
    await as(ALICE)
    expect(await ids('SELECT my_accessible_vault_ids() AS id')).toEqual([VA1])
    await as(BOB)
    expect(await ids('SELECT my_accessible_vault_ids() AS id')).toEqual([VA2])
    await as(CAROL)
    expect(await ids('SELECT my_accessible_vault_ids() AS id')).toEqual([])
  })

  it('user_may_access_vault applies the same opt-in rule, inside the organization', async () => {
    await db.exec('RESET ROLE')
    const may = async (u: string, v: string | null) =>
      (await db.query<{ ok: boolean }>('SELECT user_may_access_vault($1, $2) AS ok', [u, v])).rows[0].ok
    expect(await may(CAROL, VA1)).toBe(false)
    expect(await may(ALICE, VA1)).toBe(true)
    expect(await may(ALICE, VA2)).toBe(false)
    expect(await may(BOB, VA2)).toBe(true)
    expect(await may(ADMIN, VA2)).toBe(true)
    expect(await may(ADMIN, VB1)).toBe(false)
    expect(await may(OTHER_ADMIN, VA1)).toBe(false)
    expect(await may(CAROL, null)).toBe(true)
  })
})

describe('file data RLS (schema 111)', () => {
  it('files follow vault access', async () => {
    await as(ADMIN)
    expect(await fileIds()).toEqual([F1, F2])
    await as(ALICE)
    expect(await fileIds()).toEqual([F1])
    await as(BOB)
    expect(await fileIds()).toEqual([F2])
    await as(CAROL)
    expect(await fileIds()).toEqual([])
    await as(OTHER_ADMIN)
    expect(await fileIds()).toEqual([FB])
  })

  it('versions, folders, references, drawing PDFs and file activity follow their file', async () => {
    await as(ALICE)
    expect(await ids('SELECT file_id AS id FROM file_versions')).toEqual([F1, F1])
    expect((await db.query('SELECT 1 FROM folders')).rows).toHaveLength(1)
    expect((await db.query('SELECT 1 FROM file_version_references')).rows).toHaveLength(0)
    expect((await db.query('SELECT 1 FROM drawing_pdf_renders')).rows).toHaveLength(0)
    expect((await db.query<{ action: string }>('SELECT action FROM activity ORDER BY action')).rows).toHaveLength(2)
    await as(BOB)
    expect(await ids('SELECT file_id AS id FROM file_versions')).toEqual([F2])
    expect((await db.query('SELECT 1 FROM file_version_references')).rows).toHaveLength(1)
    expect((await db.query('SELECT 1 FROM drawing_pdf_renders')).rows).toHaveLength(1)
    await as(CAROL)
    expect((await db.query('SELECT 1 FROM folders')).rows).toHaveLength(0)
    const activity = await db.query<{ action: string }>('SELECT action FROM activity')
    expect(activity.rows.map((r) => r.action)).toEqual(['login'])
  })

  it('a member cannot write a file in a vault they cannot see', async () => {
    await as(ALICE)
    expect(
      await refused(
        `INSERT INTO files (org_id, vault_id, file_path, file_name) VALUES ($1, $2, 'a2/x.sldprt', 'x.sldprt')`,
        [ORG_A, VA2],
      ),
    ).toBe(true)
    const upd = await db.query(`UPDATE files SET description = 'x' WHERE id = $1`, [F2])
    expect(upd.affectedRows ?? 0).toBe(0)
    expect(await refused(`UPDATE files SET vault_id = $1 WHERE id = $2`, [VA2, F1])).toBe(true)
    const ok = await db.query(`UPDATE files SET description = 'mine' WHERE id = $1`, [F1])
    expect(ok.affectedRows).toBe(1)
  })

  it('vaults are listed to their own organization only', async () => {
    await as(CAROL)
    expect(await ids('SELECT id FROM vaults')).toEqual([VA1, VA2])
    await as(OTHER_ADMIN)
    expect(await ids('SELECT id FROM vaults')).toEqual([VB1])
  })
})

describe('entity gates and vault load RPCs (schema 111)', () => {
  it('require_file_access and require_vault_access refuse a vault the caller cannot see', async () => {
    await as(ALICE)
    expect(await refused('SELECT require_file_access($1)', [F1])).toBe(false)
    expect(await refused('SELECT require_file_access($1)', [F2])).toBe(true)
    expect(await refused('SELECT require_vault_access($1)', [VA1])).toBe(false)
    expect(await refused('SELECT require_vault_access($1)', [VA2])).toBe(true)
    await as(ADMIN)
    expect(await refused('SELECT require_file_access($1)', [F2])).toBe(false)
  })

  it('get_vault_files_fast and get_vault_files_count agree and apply the rule', async () => {
    await as(ALICE)
    expect(await ids('SELECT id FROM get_vault_files_fast($1, $2)', [ORG_A, VA1])).toEqual([F1])
    expect(await refused('SELECT * FROM get_vault_files_fast($1, $2)', [ORG_A, VA2])).toBe(true)
    expect(await refused('SELECT get_vault_files_count($1, $2)', [ORG_A, VA2])).toBe(true)
    expect(await ids('SELECT id FROM get_vault_files_fast($1, NULL)', [ORG_A])).toEqual([F1])
    const count = await db.query<{ n: number }>('SELECT get_vault_files_count($1, NULL)::int AS n', [ORG_A])
    expect(count.rows[0].n).toBe(1)
    await as(ADMIN)
    expect(await ids('SELECT id FROM get_vault_files_fast($1, NULL)', [ORG_A])).toEqual([F1, F2])
  })
})

describe('vault storage bucket (schema 111)', () => {
  it('drops every unmanaged storage policy, and leaves only the four managed ones', async () => {
    await db.exec('RESET ROLE')
    const r = await db.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname`,
    )
    expect(r.rows.map((row) => row.policyname)).toEqual([
      'Vault: delete own or as admin',
      'Vault: read readable objects',
      'Vault: update own or org assets',
      'Vault: upload to own organization',
    ])
  })

  it('content is readable through a readable file, by its uploader, or by an admin', async () => {
    await as(ALICE)
    expect(await objects()).toEqual([`A/11/${H1}`, 'A/_assets/logo.png', `A/ee/${H1_OLD}`])
    await as(BOB)
    expect(await objects()).toEqual([
      `A/${H2}`,
      'A/_assets/logo.png',
      `A/dd/${H_PDF}`,
      `A/inspection-previews/${F2}-1700000000.png`,
    ])
    await as(CAROL)
    expect(await objects()).toEqual(['A/_assets/logo.png', `A/cc/${H_NEW}`])
    await as(ADMIN)
    expect(await objects()).toHaveLength(7)
    await as(OTHER_ADMIN)
    expect(await objects()).toEqual([`B/bb/${HB}`])
  })

  it('uploads stay in the caller organization; only the uploader or an admin deletes', async () => {
    await as(ALICE)
    expect(
      await refused(`INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('vault', $1, $2)`, [
        `${ORG_B}/zz/${'e'.repeat(64)}`,
        ALICE,
      ]),
    ).toBe(true)
    await as(CAROL)
    const del = await db.query(`DELETE FROM storage.objects WHERE name = $1`, [`${ORG_A}/11/${H1}`])
    expect(del.affectedRows ?? 0).toBe(0)
  })

  it('content is never overwritten or deleted by its uploader; assets are', async () => {
    await as(CAROL)
    const content = `${ORG_A}/cc/${H_NEW}`
    const upd = await db.query(`UPDATE storage.objects SET owner = owner WHERE name = $1`, [content])
    expect(upd.affectedRows ?? 0).toBe(0)
    const del = await db.query(`DELETE FROM storage.objects WHERE name = $1`, [content])
    expect(del.affectedRows ?? 0).toBe(0)
    const avatar = `${ORG_A}/_assets/avatars/${CAROL}.png`
    await db.query(`INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('vault', $1, $2)`, [avatar, CAROL])
    const own = await db.query(`UPDATE storage.objects SET owner = owner WHERE name = $1`, [avatar])
    expect(own.affectedRows).toBe(1)
    const gone = await db.query(`DELETE FROM storage.objects WHERE name = $1`, [avatar])
    expect(gone.affectedRows).toBe(1)
    await as(ALICE)
    const logo = await db.query(`UPDATE storage.objects SET owner = owner WHERE name = $1`, [`${ORG_A}/_assets/logo.png`])
    expect(logo.affectedRows ?? 0).toBe(0)
  })
})

describe('every file-data policy applies the vault rule', () => {
  it('in the loaded database, as check_release_residue() reads pg_policies', async () => {
    await db.exec('RESET ROLE')
    const r = await db.query<{ tablename: string; policyname: string }>(
      `SELECT tablename, policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ANY($1) AND cmd IN ('SELECT', 'ALL')
          AND COALESCE(qual, '') NOT LIKE '%my_accessible_vault_ids()%'`,
      [FILE_DATA_TABLES],
    )
    expect(r.rows).toEqual([])
  })

  it('in every module file', () => {
    const offenders: string[] = []
    for (const name of ['10-source-files.sql', '15-inspection.sql', '20-change-control.sql']) {
      const sql = readFileSync(resolve(MODULES, name), 'utf8').replace(/\r\n/g, '\n')
      const re = /CREATE POLICY "([^"]+)"\s+ON (\w+) FOR (SELECT|ALL)([\s\S]*?);\n/g
      for (const m of sql.matchAll(re)) {
        if (FILE_DATA_TABLES.includes(m[2]) && !m[4].includes('my_accessible_vault_ids()')) {
          offenders.push(`${name}: ${m[2]} / ${m[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('core.sql release functions (schema 111)', () => {
  it('compile, and the manifest pins the vault rule on its helpers', async () => {
    const core = readFileSync(resolve(process.cwd(), 'supabase/core.sql'), 'utf8').replace(/\r\n/g, '\n')
    const fresh = new PGlite()
    try {
      for (const header of [
        'schema_release_version()',
        'schema_release_manifest()',
        'check_release_residue()',
      ]) {
        await fresh.exec(fn(core, header))
      }
      const r = await fresh.query<{ identity: string; requires: string | null }>(
        `SELECT identity, requires FROM schema_release_manifest()
          WHERE identity IN ('my_accessible_vault_ids()', 'may_read_vault_object(text)',
                             'require_file_access(uuid)', 'get_vault_files_fast(uuid,uuid)')
          ORDER BY identity`,
      )
      expect(r.rows.map((row) => row.identity)).toEqual([
        'get_vault_files_fast(uuid,uuid)',
        'may_read_vault_object(text)',
        'my_accessible_vault_ids()',
        'require_file_access(uuid)',
      ])
      for (const row of r.rows) {
        const pin =
          row.identity === 'my_accessible_vault_ids()'
            ? /u\.org_id = v\.org_id/
            : /may_access_vault|my_accessible_vault_ids/
        expect(row.requires).toMatch(pin)
      }
      const v = await fresh.query<{ v: number }>('SELECT schema_release_version() AS v')
      expect(v.rows[0].v).toBeGreaterThanOrEqual(111)
    } finally {
      await fresh.close()
    }
  })
})
