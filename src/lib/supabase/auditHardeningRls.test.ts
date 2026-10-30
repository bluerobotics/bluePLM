/**
 * Security audit follow-up (schema 112, kept in 5.0), run against real Postgres
 * (PGlite) holding the whole 5.0 baseline: backup secrets readable by admins only
 * (members get backup_get_status() without them), audit rows that name the caller
 * as their actor, and session rows kept in the caller's organization.
 *
 * The 4.x orphan-function sweep is gone from the baseline; 0500_from_4x.sql drops
 * the orphans a 4.x database carried (rehearsed on a copy of production).
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { actAs, bootBaseline, seed } from './testing/schemaDb'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ADMIN = '00000000-0000-0000-0000-000000000001'
const MEMBER = '00000000-0000-0000-0000-000000000002'
const OTHER = '00000000-0000-0000-0000-000000000003' // member of org B

let db: PGlite

const as = (userId: string) => actAs(db, userId)

async function refused(sql: string, params: unknown[] = []): Promise<boolean> {
  try {
    await db.query(sql, params)
    return false
  } catch {
    return true
  }
}

beforeAll(async () => {
  db = await bootBaseline()
  await seed(
    db,
    `
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
      ('${ADMIN}', 'admin@a.test', now()), ('${MEMBER}', 'member@a.test', now()), ('${OTHER}', 'other@b.test', now());
    INSERT INTO organization (id, name, slug) VALUES ('${ORG_A}', 'A', 'org-a'), ('${ORG_B}', 'B', 'org-b');
    INSERT INTO app_user (id, email, org_id, role) VALUES
      ('${ADMIN}', 'admin@a.test', '${ORG_A}', 'admin'), ('${MEMBER}', 'member@a.test', '${ORG_A}', 'engineer'),
      ('${OTHER}', 'other@b.test', '${ORG_B}', 'engineer');
    INSERT INTO backup_config (org_id, bucket, access_key_encrypted, secret_key_encrypted, restic_password_encrypted,
                               designated_machine_name)
      VALUES ('${ORG_A}', 'b', 'AKIA', 'SECRET', 'restic-pw', 'backup-pc');
    `,
  )
}, 120_000)

afterAll(async () => {
  await db?.close()
})

describe('backup secrets', () => {
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
    const r = await db.query<{ s: Record<string, unknown> }>('SELECT backup_get_status() AS s')
    const status = r.rows[0].s
    expect(status).toMatchObject({ bucket: 'b', designated_machine_name: 'backup-pc', credentials_set: true })
    expect(JSON.stringify(status)).not.toMatch(/AKIA|SECRET|restic-pw/)
  })

  it('another organization gets nothing', async () => {
    await as(OTHER)
    const r = await db.query<{ s: unknown }>('SELECT backup_get_status() AS s')
    expect(r.rows[0].s).toBeNull()
  })
})

describe('audit rows name the caller', () => {
  it('activity cannot be written in somebody else’s name', async () => {
    await as(MEMBER)
    const insert = 'INSERT INTO activity (org_id, user_id, user_email, action) VALUES ($1, $2, $3, $4)'
    expect(await refused(insert, [ORG_A, ADMIN, 'admin@a.test', 'delete'])).toBe(true)
    expect(await refused(insert, [ORG_A, MEMBER, 'member@a.test', 'checkin'])).toBe(false)
  })

  it('a notification always carries its sender', async () => {
    await as(MEMBER)
    const insert = `INSERT INTO notification (org_id, user_id, from_user_id, type, title) VALUES ($1, $2, $3, 'system', $4)`
    expect(await refused(insert, [ORG_A, ADMIN, null, 'System notice'])).toBe(true)
    expect(await refused(insert, [ORG_A, ADMIN, ADMIN, 'Spoofed'])).toBe(true)
  })

  it('a session row stays in the caller’s organization', async () => {
    await as(MEMBER)
    const insert = 'INSERT INTO user_session (user_id, org_id, machine_id) VALUES ($1, $2, $3)'
    expect(await refused(insert, [MEMBER, ORG_B, 'pc'])).toBe(true)
    expect(await refused(insert, [MEMBER, ORG_A, 'pc'])).toBe(false)
  })
})
