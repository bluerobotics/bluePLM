/**
 * Row-level security on solidworks_license (schema 106, kept in 5.0), run against
 * real Postgres (PGlite) holding the whole 5.0 baseline. A non-admin must read only
 * the licences assigned to them and no other serial; an admin reads every licence
 * in their own organization.
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { actAs, bootBaseline, seed } from '@/lib/supabase/testing/schemaDb'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ADMIN = '00000000-0000-0000-0000-000000000001'
const ALICE = '00000000-0000-0000-0000-000000000002'
const BOB = '00000000-0000-0000-0000-000000000003'
const CAROL = '00000000-0000-0000-0000-000000000004'
const OTHER_ADMIN = '00000000-0000-0000-0000-000000000005'
const L_ALICE = '10000000-0000-0000-0000-000000000001'
const L_CAROL = '10000000-0000-0000-0000-000000000002'
const L_FREE = '10000000-0000-0000-0000-000000000003'
const A_ALICE = '20000000-0000-0000-0000-000000000001'
const A_CAROL = '20000000-0000-0000-0000-000000000002'

let db: PGlite

const as = (userId: string) => actAs(db, userId)

async function serials(): Promise<string[]> {
  const r = await db.query<{ serial_number: string }>(
    'SELECT serial_number FROM solidworks_license ORDER BY serial_number',
  )
  return r.rows.map((row) => row.serial_number)
}

beforeAll(async () => {
  db = await bootBaseline()
  await seed(
    db,
    `
    INSERT INTO auth.users (id, email, email_confirmed_at)
      SELECT u, 'u' || right(u::text, 1) || '@test', now()
      FROM unnest(ARRAY['${ADMIN}', '${ALICE}', '${BOB}', '${CAROL}', '${OTHER_ADMIN}']::uuid[]) u;
    INSERT INTO organization (id, name, slug) VALUES ('${ORG_A}', 'A', 'org-a'), ('${ORG_B}', 'B', 'org-b');
    INSERT INTO app_user (id, org_id, email, role) VALUES
      ('${ADMIN}', '${ORG_A}', 'admin@a', 'admin'),
      ('${ALICE}', '${ORG_A}', 'alice@a', 'engineer'),
      ('${BOB}', '${ORG_A}', 'bob@a', 'engineer'),
      ('${CAROL}', '${ORG_A}', 'carol@a', 'engineer'),
      ('${OTHER_ADMIN}', '${ORG_B}', 'admin@b', 'admin');
    INSERT INTO solidworks_license (id, org_id, serial_number) VALUES
      ('${L_ALICE}', '${ORG_A}', '9000 0000 0000 1111 AAAA BBBB'),
      ('${L_CAROL}', '${ORG_A}', '9000000000002222CCCCDDDD'),
      ('${L_FREE}', '${ORG_A}', '9000 0000 0000 3333 EEEE FFFF');
    INSERT INTO solidworks_license_assignment (id, license_id, user_id, assigned_by) VALUES
      ('${A_ALICE}', '${L_ALICE}', '${ALICE}', '${ADMIN}'),
      ('${A_CAROL}', '${L_CAROL}', '${CAROL}', '${ADMIN}');
    `,
  )
}, 120_000)

afterAll(async () => {
  await db?.close()
})

describe('solidworks_license RLS', () => {
  it('an admin reads every licence and serial in their organization', async () => {
    await as(ADMIN)
    expect(await serials()).toHaveLength(3)
  })

  it('a non-admin reads only the licence assigned to them', async () => {
    await as(ALICE)
    expect(await serials()).toEqual(['9000 0000 0000 1111 AAAA BBBB'])
    const other = await db.query('SELECT serial_number FROM solidworks_license WHERE id = $1', [L_CAROL])
    expect(other.rows).toHaveLength(0)
  })

  it('a non-admin with no assignment reads no serial', async () => {
    await as(BOB)
    expect(await serials()).toEqual([])
  })

  it('a non-admin reads only their own assignment rows', async () => {
    await as(ALICE)
    const r = await db.query<{ id: string }>('SELECT id FROM solidworks_license_assignment')
    expect(r.rows.map((row) => row.id)).toEqual([A_ALICE])
  })

  it('a non-admin cannot repoint their assignment at another licence to read its serial', async () => {
    await as(ALICE)
    const upd = await db.query('UPDATE solidworks_license_assignment SET license_id = $1 WHERE id = $2', [
      L_CAROL,
      A_ALICE,
    ])
    expect(upd.affectedRows ?? 0).toBe(0)
    expect(await serials()).toEqual(['9000 0000 0000 1111 AAAA BBBB'])
  })

  it('a non-admin can still activate their own assignment through the RPC', async () => {
    await as(ALICE)
    const r = await db.query<{ result: { success: boolean } }>(
      "SELECT solidworks_license_activate($1, 'machine-1', 'PC') AS result",
      [A_ALICE],
    )
    expect(r.rows[0].result.success).toBe(true)
  })

  it('an admin reads every assignment in their organization', async () => {
    await as(ADMIN)
    const r = await db.query('SELECT id FROM solidworks_license_assignment')
    expect(r.rows).toHaveLength(2)
  })

  it('an admin of another organization reads none of these serials', async () => {
    await as(OTHER_ADMIN)
    expect(await serials()).toEqual([])
  })
})
