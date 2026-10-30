/**
 * Organization membership and cross-tenant reads (schema 111, kept in 5.0), run
 * against real Postgres (PGlite) holding the whole 5.0 baseline: the app_user /
 * organization policies, user_get_verified_email(), user_ensure_org_id(),
 * org_join_by_slug(), team_member_apply_pending() and the auth.users trigger
 * (trg_auth_user_sync_app_user).
 *
 * The attacks these pin (security audit C1 C3 H1): rewriting your own
 * app_user.email to an invitee's address and calling user_ensure_org_id() to take
 * the invitation's organization and role; signing up with somebody else's address
 * and being bound to their invitation before confirming it; joining any
 * organization by its slug; reading every organization's row and every user.
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { actAs, actAsOwner, bootBaseline, seed } from './testing/schemaDb'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ADMIN_A = '00000000-0000-0000-0000-000000000001'
const MEMBER_B = '00000000-0000-0000-0000-000000000002'
const ATTACKER = '00000000-0000-0000-0000-000000000003' // confirmed, no organization
const INVITEE = '00000000-0000-0000-0000-000000000004' // signs up later
const DOMAIN_USER = '00000000-0000-0000-0000-000000000005' // @corp-a.com, confirmed
const TEAM_A = '30000000-0000-0000-0000-000000000001'
const INVITEE_EMAIL = 'invitee@corp-a.com'

let db: PGlite

const as = (userId: string) => actAs(db, userId)

async function rpc<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ r: T }>(sql, params)
  return r.rows[0].r
}

async function orgOf(userId: string): Promise<{ org_id: string | null; role: string }> {
  await actAsOwner(db)
  const r = await db.query<{ org_id: string | null; role: string }>('SELECT org_id, role FROM app_user WHERE id = $1', [
    userId,
  ])
  return r.rows[0]
}

beforeAll(async () => {
  db = await bootBaseline()
  await seed(
    db,
    `
    INSERT INTO organization (id, name, slug, email_domains, google_drive_client_secret) VALUES
      ('${ORG_A}', 'A', 'org-a', '{corp-a.com}', 'secret-a'),
      ('${ORG_B}', 'B', 'org-b', '{}', 'secret-b');
    INSERT INTO team (id, org_id, name) VALUES ('${TEAM_A}', '${ORG_A}', 'Engineering');
    `,
  )
  // With triggers on: trg_auth_user_sync_app_user creates the app_user rows.
  await actAsOwner(db)
  await db.exec(`
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
      ('${ADMIN_A}', 'admin@corp-a.com', now()),
      ('${MEMBER_B}', 'member@corp-b.com', now()),
      ('${ATTACKER}', 'attacker@evil.test', now()),
      ('${DOMAIN_USER}', 'dana@corp-a.com', now());
    UPDATE app_user SET org_id = '${ORG_A}', role = 'admin' WHERE id = '${ADMIN_A}';
    UPDATE app_user SET org_id = '${ORG_B}' WHERE id = '${MEMBER_B}';
    INSERT INTO pending_org_member (org_id, email, role, team_ids, invited_by) VALUES
      ('${ORG_A}', '${INVITEE_EMAIL}', 'admin', '{${TEAM_A}}', '${ADMIN_A}');
  `)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

describe('C1: the email that decides membership is the verified one', () => {
  it('a user cannot rewrite their own email', async () => {
    await as(ATTACKER)
    let refused = false
    try {
      await db.query('UPDATE app_user SET email = $1 WHERE id = $2', [INVITEE_EMAIL, ATTACKER])
    } catch {
      refused = true
    }
    expect(refused).toBe(true)
    const own = await db.query('UPDATE app_user SET full_name = $1 WHERE id = $2', ['Mallory', ATTACKER])
    expect(own.affectedRows).toBe(1)
  })

  it('an admin cannot rewrite an address either', async () => {
    await as(ADMIN_A)
    let refused = false
    try {
      await db.query('UPDATE app_user SET email = $1 WHERE id = $2', [INVITEE_EMAIL, ADMIN_A])
    } catch {
      refused = true
    }
    expect(refused).toBe(true)
  })

  it('a forged app_user.email claims nothing through user_ensure_org_id', async () => {
    await actAsOwner(db)
    await db.exec(`UPDATE app_user SET email = '${INVITEE_EMAIL}' WHERE id = '${ATTACKER}'`)
    await as(ATTACKER)
    const r = await rpc<{ has_org: boolean }>('SELECT user_ensure_org_id() AS r')
    expect(r.has_org).toBe(false)
    expect((await orgOf(ATTACKER)).org_id).toBeNull()
    await actAsOwner(db)
    await db.exec(`UPDATE app_user SET email = 'attacker@evil.test' WHERE id = '${ATTACKER}'`)
  })

  it('signing up with an invitee address binds nothing until the address is confirmed', async () => {
    await actAsOwner(db)
    await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${INVITEE}', '${INVITEE_EMAIL}')`)
    expect(await orgOf(INVITEE)).toEqual({ org_id: null, role: 'engineer' })
    await as(INVITEE)
    expect((await rpc<{ has_org: boolean }>('SELECT user_ensure_org_id() AS r')).has_org).toBe(false)
    expect((await db.query('SELECT 1 FROM pending_org_member')).rows).toHaveLength(0)

    await actAsOwner(db)
    await db.exec(`UPDATE auth.users SET email_confirmed_at = now() WHERE id = '${INVITEE}'`)
    expect(await orgOf(INVITEE)).toEqual({ org_id: ORG_A, role: 'admin' })
    const teams = await db.query('SELECT 1 FROM team_member WHERE user_id = $1 AND team_id = $2', [INVITEE, TEAM_A])
    expect(teams.rows).toHaveLength(1)
    const claimed = await db.query<{ claimed_by: string }>('SELECT claimed_by FROM pending_org_member')
    expect(claimed.rows[0].claimed_by).toBe(INVITEE)
  })

  it('a confirmed address in email_domains still joins through user_ensure_org_id', async () => {
    await as(DOMAIN_USER)
    const r = await rpc<{ has_org: boolean; resolved_by: string }>('SELECT user_ensure_org_id() AS r')
    expect(r).toMatchObject({ has_org: true, resolved_by: 'email_domain' })
    expect((await orgOf(DOMAIN_USER)).org_id).toBe(ORG_A)
  })
})

describe('C3: a slug is not an invitation', () => {
  it('join_org_by_slug refuses an address with no invitation and no domain match', async () => {
    await as(ATTACKER)
    const r = await rpc<{ success: boolean }>('SELECT org_join_by_slug($1) AS r', ['org-b'])
    expect(r.success).toBe(false)
    expect((await orgOf(ATTACKER)).org_id).toBeNull()
  })

  it('join_org_by_slug admits an invited address', async () => {
    await actAsOwner(db)
    await db.exec(`INSERT INTO pending_org_member (org_id, email, invited_by)
                   VALUES ('${ORG_B}', 'attacker@evil.test', '${MEMBER_B}')`)
    await as(ATTACKER)
    const r = await rpc<{ success: boolean }>('SELECT org_join_by_slug($1) AS r', ['org-b'])
    expect(r.success).toBe(true)
    expect((await orgOf(ATTACKER)).org_id).toBe(ORG_B)
    await actAsOwner(db)
    await db.exec(`UPDATE app_user SET org_id = NULL WHERE id = '${ATTACKER}'`)
  })
})

describe('H1: organizations and users are readable inside the caller organization only', () => {
  it('an account with no organization reads no organization and only its own user row', async () => {
    await as(ATTACKER)
    expect((await db.query('SELECT 1 FROM organization')).rows).toHaveLength(0)
    const users = await db.query<{ id: string }>('SELECT id FROM app_user')
    expect(users.rows.map((u) => u.id)).toEqual([ATTACKER])
  })

  it('a member reads their own organization (secret included) and its members, nothing else', async () => {
    await as(MEMBER_B)
    const orgs = await db.query<{ id: string; google_drive_client_secret: string }>(
      'SELECT id, google_drive_client_secret FROM organization',
    )
    expect(orgs.rows).toEqual([{ id: ORG_B, google_drive_client_secret: 'secret-b' }])
    const users = await db.query<{ id: string }>('SELECT id FROM app_user ORDER BY id')
    expect(users.rows.map((u) => u.id)).toEqual([MEMBER_B])
    await as(ADMIN_A)
    const a = await db.query<{ id: string }>('SELECT id FROM app_user ORDER BY id')
    expect(a.rows.map((u) => u.id)).toEqual([ADMIN_A, INVITEE, DOMAIN_USER])
  })
})
