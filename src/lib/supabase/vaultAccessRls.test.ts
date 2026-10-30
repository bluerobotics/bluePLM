/**
 * Vault access enforced by the database (schema 111, kept in 5.0), run against real
 * Postgres (PGlite) holding the whole 5.0 baseline: my_accessible_vault_ids(),
 * can_user_access_vault(), the entity gates, the vault load RPCs, the file-data
 * policies and the vault storage bucket policies.
 *
 * The rule is the renderer's (getAccessibleVaults): an org admin reads every vault
 * of their organization, anyone else exactly the vaults granted directly or
 * through a team, and no grant means no vault. Since 5.0 every file has a vault
 * (file.vault_id NOT NULL), so there is no "file with no vault" exception.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { actAs, actAsOwner, bootBaseline, seed, SUPABASE } from './testing/schemaDb'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ADMIN = '00000000-0000-0000-0000-000000000001'
const ALICE = '00000000-0000-0000-0000-000000000002' // direct grant on VA1
const BOB = '00000000-0000-0000-0000-000000000003' // team grant on VA2
const CAROL = '00000000-0000-0000-0000-000000000004' // no grant
const OTHER_ADMIN = '00000000-0000-0000-0000-000000000005' // admin of org B
const TEAM = '30000000-0000-0000-0000-000000000001' // Bob's vault team
const EDITORS = '30000000-0000-0000-0000-000000000002' // explorer permissions, no vault
const VA1 = '40000000-0000-0000-0000-000000000001'
const VA2 = '40000000-0000-0000-0000-000000000002'
const VB1 = '40000000-0000-0000-0000-000000000003'
const F1 = '50000000-0000-0000-0000-000000000001'
const F2 = '50000000-0000-0000-0000-000000000002'
const FB = '50000000-0000-0000-0000-000000000003'
const V1 = '51000000-0000-0000-0000-000000000001'
const V1_OLD = '51000000-0000-0000-0000-000000000002'
const V2 = '51000000-0000-0000-0000-000000000003'
const VBV = '51000000-0000-0000-0000-000000000004'
const H1 = '1'.repeat(64)
const H2 = '2'.repeat(64)
const HB = 'b'.repeat(64)
const H_NEW = 'c'.repeat(64)
const H1_OLD = 'e'.repeat(64) // an older version of F1
const H_PDF = 'd'.repeat(64) // the drawing PDF of F2

/** Tables whose rows expose a file's name, path, hash or metadata (check_release_residue). */
const FILE_DATA_TABLES = [
  'file',
  'file_version',
  'folder',
  'file_reference',
  'file_version_reference',
  'drawing_pdf_render',
  'release_file',
  'file_comment',
  'file_watcher',
  'file_share_link',
  'file_state_entry',
  'file_workflow_assignment',
  'workflow_history',
  'workflow_review_history',
  'activity',
  'inspection_characteristic',
  'inspection_characteristic_version',
  'file_eco',
  'file_deviation',
]

let db: PGlite

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

const as = (userId: string) => actAs(db, userId)

beforeAll(async () => {
  db = await bootBaseline()
  const user = (id: string, email: string, org: string, role: string) => `('${id}', '${email}', '${org}', '${role}')`
  await seed(
    db,
    `
    INSERT INTO auth.users (id, email, email_confirmed_at)
      SELECT u, 'u' || right(u::text, 2) || '@test', now()
      FROM unnest(ARRAY['${ADMIN}', '${ALICE}', '${BOB}', '${CAROL}', '${OTHER_ADMIN}']::uuid[]) u;
    INSERT INTO organization (id, name, slug) VALUES ('${ORG_A}', 'A', 'org-a'), ('${ORG_B}', 'B', 'org-b');
    INSERT INTO app_user (id, email, org_id, role) VALUES
      ${user(ADMIN, 'admin@a.test', ORG_A, 'admin')},
      ${user(ALICE, 'alice@a.test', ORG_A, 'engineer')},
      ${user(BOB, 'bob@a.test', ORG_A, 'engineer')},
      ${user(CAROL, 'carol@a.test', ORG_A, 'engineer')},
      ${user(OTHER_ADMIN, 'other@b.test', ORG_B, 'admin')};
    INSERT INTO team (id, org_id, name) VALUES ('${TEAM}', '${ORG_A}', 'Vault two'), ('${EDITORS}', '${ORG_A}', 'Editors');
    INSERT INTO team_member (team_id, user_id) VALUES
      ('${TEAM}', '${BOB}'), ('${EDITORS}', '${ALICE}'), ('${EDITORS}', '${BOB}'), ('${EDITORS}', '${CAROL}');
    INSERT INTO team_permission (team_id, resource, actions) VALUES
      ('${EDITORS}', 'module:explorer', '{view,create,edit,delete}');
    INSERT INTO vault (id, org_id, name, slug) VALUES
      ('${VA1}', '${ORG_A}', 'A1', 'a1'), ('${VA2}', '${ORG_A}', 'A2', 'a2'), ('${VB1}', '${ORG_B}', 'B1', 'b1');
    INSERT INTO vault_access (vault_id, user_id) VALUES ('${VA1}', '${ALICE}');
    INSERT INTO team_vault_access (team_id, vault_id) VALUES ('${TEAM}', '${VA2}');
    INSERT INTO file (id, org_id, vault_id, file_path, file_name, extension, content_hash, created_by) VALUES
      ('${F1}', '${ORG_A}', '${VA1}', 'a1/one.sldprt', 'one.sldprt', '.sldprt', '${H1}', '${ADMIN}'),
      ('${F2}', '${ORG_A}', '${VA2}', 'a2/two.sldprt', 'two.sldprt', '.sldprt', '${H2}', '${ADMIN}'),
      ('${FB}', '${ORG_B}', '${VB1}', 'b1/b.sldprt', 'b.sldprt', '.sldprt', '${HB}', '${OTHER_ADMIN}');
    INSERT INTO file_version (id, file_id, version, revision, content_hash, created_by) VALUES
      ('${V1}', '${F1}', 2, 'A', '${H1}', '${ADMIN}'), ('${V1_OLD}', '${F1}', 1, 'A', '${H1_OLD}', '${ADMIN}'),
      ('${V2}', '${F2}', 1, 'A', '${H2}', '${ADMIN}'), ('${VBV}', '${FB}', 1, 'A', '${HB}', '${OTHER_ADMIN}');
    INSERT INTO folder (org_id, vault_id, folder_path) VALUES ('${ORG_A}', '${VA1}', 'a1'), ('${ORG_A}', '${VA2}', 'a2');
    INSERT INTO file_version_reference (org_id, parent_version_id, parent_file_id, child_path)
      VALUES ('${ORG_A}', '${V2}', '${F2}', 'a2/child.sldprt');
    INSERT INTO drawing_pdf_render (org_id, file_id, file_version_id, storage_hash, file_size)
      VALUES ('${ORG_A}', '${F2}', '${V2}', '${H_PDF}', 1);
    INSERT INTO activity (org_id, user_id, user_email, action, file_id) VALUES
      ('${ORG_A}', '${ADMIN}', 'admin@a.test', 'checkin', '${F1}'),
      ('${ORG_A}', '${ADMIN}', 'admin@a.test', 'checkin', '${F2}'),
      ('${ORG_A}', '${ADMIN}', 'admin@a.test', 'update', NULL);
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id) VALUES
      ('vault', '${ORG_A}/11/${H1}', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_A}/${H2}', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_A}/cc/${H_NEW}', '${CAROL}', '${CAROL}'),
      ('vault', '${ORG_A}/ee/${H1_OLD}', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_A}/dd/${H_PDF}', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_A}/_assets/logo.png', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_A}/inspection-previews/${F2}-1700000000.png', '${ADMIN}', '${ADMIN}'),
      ('vault', '${ORG_B}/bb/${HB}', '${OTHER_ADMIN}', '${OTHER_ADMIN}');
    `,
  )
}, 120_000)

afterAll(async () => {
  await db?.close()
})

const fileIds = () => ids('SELECT id FROM file')
const objects = async () =>
  (await db.query<{ name: string }>('SELECT name FROM storage.objects ORDER BY name')).rows.map((r) =>
    r.name.replace(`${ORG_A}/`, 'A/').replace(`${ORG_B}/`, 'B/'),
  )

describe('my_accessible_vault_ids() and can_user_access_vault()', () => {
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

  it('can_user_access_vault applies the same opt-in rule, inside the organization', async () => {
    await actAsOwner(db)
    const may = async (u: string, v: string | null) =>
      (await db.query<{ ok: boolean }>('SELECT can_user_access_vault($1, $2) AS ok', [u, v])).rows[0].ok
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

describe('file data RLS', () => {
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
    expect(await ids('SELECT file_id AS id FROM file_version')).toEqual([F1, F1])
    expect((await db.query('SELECT 1 FROM folder')).rows).toHaveLength(1)
    expect((await db.query('SELECT 1 FROM file_version_reference')).rows).toHaveLength(0)
    expect((await db.query('SELECT 1 FROM drawing_pdf_render')).rows).toHaveLength(0)
    expect((await db.query('SELECT 1 FROM activity')).rows).toHaveLength(2)
    await as(BOB)
    expect(await ids('SELECT file_id AS id FROM file_version')).toEqual([F2])
    expect((await db.query('SELECT 1 FROM file_version_reference')).rows).toHaveLength(1)
    expect((await db.query('SELECT 1 FROM drawing_pdf_render')).rows).toHaveLength(1)
    await as(CAROL)
    expect((await db.query('SELECT 1 FROM folder')).rows).toHaveLength(0)
    const activity = await db.query<{ file_id: string | null }>('SELECT file_id FROM activity')
    expect(activity.rows).toEqual([{ file_id: null }])
  })

  it('a member cannot write a file in a vault they cannot see', async () => {
    await as(ALICE)
    expect(
      await refused(
        `INSERT INTO file (org_id, vault_id, file_path, file_name, extension, created_by)
         VALUES ($1, $2, 'a2/x.sldprt', 'x.sldprt', '.sldprt', $3)`,
        [ORG_A, VA2, ALICE],
      ),
    ).toBe(true)
    expect(
      await refused(
        `INSERT INTO file (org_id, vault_id, file_path, file_name, extension, created_by)
         VALUES ($1, $2, 'a1/x.sldprt', 'x.sldprt', '.sldprt', $3)`,
        [ORG_A, VA1, ALICE],
      ),
    ).toBe(false)
    const upd = await db.query(`UPDATE file SET description = 'x' WHERE id = $1`, [F2])
    expect(upd.affectedRows ?? 0).toBe(0)
    expect(await refused(`UPDATE file SET vault_id = $1 WHERE id = $2`, [VA2, F1])).toBe(true)
    const ok = await db.query(`UPDATE file SET description = 'mine' WHERE id = $1`, [F1])
    expect(ok.affectedRows).toBe(1)
  })

  it('vaults are listed to their own organization only', async () => {
    await as(CAROL)
    expect(await ids('SELECT id FROM vault')).toEqual([VA1, VA2])
    await as(OTHER_ADMIN)
    expect(await ids('SELECT id FROM vault')).toEqual([VB1])
  })
})

describe('entity gates and vault load RPCs', () => {
  it('file_require_access and vault_require_access refuse a vault the caller cannot see', async () => {
    await as(ALICE)
    expect(await refused('SELECT file_require_access($1)', [F1])).toBe(false)
    expect(await refused('SELECT file_require_access($1)', [F2])).toBe(true)
    expect(await refused('SELECT vault_require_access($1)', [VA1])).toBe(false)
    expect(await refused('SELECT vault_require_access($1)', [VA2])).toBe(true)
    await as(ADMIN)
    expect(await refused('SELECT file_require_access($1)', [F2])).toBe(false)
  })

  it('vault_file_list and vault_file_count agree and apply the rule', async () => {
    await as(ALICE)
    expect(await ids('SELECT id FROM vault_file_list($1, $2)', [ORG_A, VA1])).toEqual(
      await ids(`SELECT id FROM file WHERE vault_id = $1 AND deleted_at IS NULL`, [VA1]),
    )
    expect(await refused('SELECT * FROM vault_file_list($1, $2)', [ORG_A, VA2])).toBe(true)
    expect(await refused('SELECT vault_file_count($1, $2)', [ORG_A, VA2])).toBe(true)
    const listed = await ids('SELECT id FROM vault_file_list($1, NULL)', [ORG_A])
    expect(listed).toContain(F1)
    expect(listed).not.toContain(F2)
    const count = await db.query<{ n: number }>('SELECT vault_file_count($1, NULL)::int AS n', [ORG_A])
    expect(count.rows[0].n).toBe(listed.length)
    await as(ADMIN)
    const all = await ids('SELECT id FROM vault_file_list($1, NULL)', [ORG_A])
    expect(all).toEqual(expect.arrayContaining([F1, F2]))
  })
})

describe('vault storage bucket', () => {
  it('holds exactly the managed storage policies', async () => {
    await actAsOwner(db)
    const r = await db.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname`,
    )
    expect(r.rows.map((row) => row.policyname)).toEqual([
      'Org admins delete extension packages',
      'Org admins update extension packages',
      'Org admins upload extension packages',
      'Org members read their org extension packages',
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
    await actAsOwner(db)
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
      const sql = readFileSync(resolve(SUPABASE, 'modules', name), 'utf8').replace(/\r\n/g, '\n')
      const re = /CREATE POLICY "([^"]+)"\s+ON (\w+) FOR (SELECT|ALL)([\s\S]*?);\n/g
      for (const m of sql.matchAll(re)) {
        if (FILE_DATA_TABLES.includes(m[2]) && !m[4].includes('my_accessible_vault_ids()')) {
          offenders.push(`${name}: ${m[2]} / ${m[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the release manifest pins the vault rule on its helpers', async () => {
    await actAsOwner(db)
    const r = await db.query<{ identity: string; requires: string | null }>(
      `SELECT identity, requires FROM schema_get_release_manifest()
        WHERE identity IN ('my_accessible_vault_ids()', 'can_read_vault_object(text)',
                           'file_require_access(uuid)', 'vault_file_list(uuid,uuid)')
        ORDER BY identity`,
    )
    expect(r.rows.map((row) => row.identity)).toEqual([
      'can_read_vault_object(text)',
      'file_require_access(uuid)',
      'my_accessible_vault_ids()',
      'vault_file_list(uuid,uuid)',
    ])
    for (const row of r.rows) {
      const pin =
        row.identity === 'my_accessible_vault_ids()' ? /u\.org_id = v\.org_id/ : /can_access_vault|my_accessible_vault_ids/
      expect(row.requires).toMatch(pin)
    }
  })
})
