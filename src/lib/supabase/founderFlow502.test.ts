/**
 * A new organization from nothing, on the real 5.0 baseline plus migration 0502 (PGlite): the
 * admin-setup flow end to end.
 *
 *   1. A fresh database: the sign-up hook refuses everyone and says the database is not set up.
 *   2. Step 5: org_create_with_founder() creates the organization, its domains and the founding
 *      admin's invitation. The founder's address is a gmail.com one, so only the invitation admits.
 *   3. The founder signs in with Google: the hook admits them, and the baseline's auth trigger and
 *      invitation appliers make them an admin of the organization in the Administrators team.
 *   4. A stranger is refused; a gmail.com address is refused even with gmail.com forced into the
 *      domain list; a colleague at the company domain is admitted and lands in the default team.
 *
 * Supabase Auth is played by the test: it asks the hook, and only on '{}' inserts auth.users, as
 * Auth does. The stamp's findings after 0502 must be the baseline's own, nothing added.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { actAs, actAsOwner, bootBaseline, MIGRATIONS, seed } from './testing/schemaDb'

const MIGRATION = readFileSync(resolve(MIGRATIONS, '0502_security_hardening.sql'), 'utf8').replace(/\r\n/g, '\n')

const FOUNDER = '00000000-0000-0000-0000-0000000000f1'
const COLLEAGUE = '00000000-0000-0000-0000-0000000000c1'
const FOUNDER_EMAIL = 'founder.person@gmail.com'

let db: PGlite
let problemsBefore: string[] = []

interface HookResult {
  error?: { http_code: number; message: string }
}

async function hook(email: string): Promise<HookResult> {
  await actAsOwner(db)
  const r = await db.query<{ r: HookResult }>(`SELECT auth_hook_before_user_created($1::jsonb) AS r`, [
    JSON.stringify({ metadata: { name: 'before-user-created' }, user: { email, app_metadata: { provider: 'google' } } }),
  ])
  return r.rows[0].r
}

/** Supabase Auth creating a Google account: ask the hook, create the user only if it allows. */
async function googleSignUp(id: string, email: string, name: string): Promise<HookResult> {
  const decision = await hook(email)
  if (decision.error) return decision
  await db.query(
    `INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES ($1, $2, now(), $3::jsonb)`,
    [id, email, JSON.stringify({ full_name: name })],
  )
  return decision
}

async function problems(): Promise<string[]> {
  await actAsOwner(db)
  const r = await db.query<{ object: string; status: string }>(`SELECT object, status FROM schema_list_problems()`)
  return r.rows.map((p) => `${p.status} ${p.object}`).sort()
}

beforeAll(async () => {
  db = await bootBaseline()
  const before = await db.query<{ r: { problems: Array<{ object: string; status: string }> } }>(
    `SELECT verify_and_stamp_schema() AS r`,
  )
  problemsBefore = before.rows[0].r.problems.map((p) => `${p.status} ${p.object}`).sort()
  await db.exec('BEGIN')
  await db.exec(MIGRATION)
  await db.exec('COMMIT')
}, 120_000)

describe('a new organization, end to end', () => {
  it('0502 adds no stamp finding to the baseline', async () => {
    expect(await problems()).toEqual(problemsBefore)
  }, 120_000)

  it('a database with no organization refuses sign-up and says why', async () => {
    const r = await hook('anyone@company.example')
    expect(r.error?.http_code).toBe(403)
    expect(r.error?.message).toMatch(/^Not set up: .*no organization/)
  })

  it('Step 5 creates the organization, its domains and the founder invitation in one call', async () => {
    await actAsOwner(db)
    const r = await db.query<{ r: { org_id: string; email_domains: string[]; founder_email: string } }>(
      `SELECT org_create_with_founder('Acme Robotics', 'acme-robotics', ' Founder.Person@Gmail.com ', ARRAY['Acme.example']) AS r`,
    )
    expect(r.rows[0].r.email_domains).toEqual(['acme.example'])
    expect(r.rows[0].r.founder_email).toBe(FOUNDER_EMAIL)
    const invite = await db.query<{ role: string; teams: string[] }>(
      `SELECT p.role::text AS role, ARRAY(SELECT t.name FROM team t WHERE t.id = ANY (p.team_ids)) AS teams
       FROM pending_org_member p WHERE p.email = $1`,
      [FOUNDER_EMAIL],
    )
    expect(invite.rows).toEqual([{ role: 'admin', teams: ['Administrators'] }])
  })

  it('Step 5 refuses a public mail domain and a client caller', async () => {
    await actAsOwner(db)
    await expect(
      db.query(`SELECT org_create_with_founder('Other', 'other', 'a@other.example', ARRAY['gmail.com'])`),
    ).rejects.toThrow(/Public mail domain/)
    await actAs(db, FOUNDER)
    await expect(db.query(`SELECT org_create_with_founder('X', 'x', 'a@x.example')`)).rejects.toThrow()
    await actAsOwner(db)
  })

  it('the founder signs in with Google and is the organization admin, in Administrators', async () => {
    expect(await googleSignUp(FOUNDER, 'Founder.Person@gmail.com', 'Founder Person')).toEqual({})
    await actAsOwner(db)
    const u = await db.query<{ org: string; role: string; admin_team: boolean; claimed: boolean }>(
      `SELECT o.slug AS org, u.role::text AS role,
              EXISTS (SELECT 1 FROM team_member tm JOIN team t ON t.id = tm.team_id
                      WHERE tm.user_id = u.id AND t.name = 'Administrators') AS admin_team,
              (SELECT claimed_at IS NOT NULL FROM pending_org_member WHERE email = $2) AS claimed
       FROM app_user u JOIN organization o ON o.id = u.org_id WHERE u.id = $1`,
      [FOUNDER, FOUNDER_EMAIL],
    )
    expect(u.rows).toEqual([{ org: 'acme-robotics', role: 'admin', admin_team: true, claimed: true }])

    // The founder's own session agrees, and the admin grant is on the security record.
    await actAs(db, FOUNDER)
    expect((await db.query<{ a: boolean }>(`SELECT is_org_admin() AS a`)).rows[0].a).toBe(true)
    await actAsOwner(db)
    const ev = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM security_event WHERE kind = 'admin_granted'`)
    expect(ev.rows[0].n).toBeGreaterThan(0)
  })

  it('a claimed invitation does not admit a second account', async () => {
    expect((await hook(FOUNDER_EMAIL)).error?.http_code).toBe(403)
  })

  it('a stranger is refused', async () => {
    const r = await hook('stranger@elsewhere.example')
    expect(r.error?.message).toMatch(/^Not invited/)
  })

  it('a gmail.com address is refused even with gmail.com forced into the domain list', async () => {
    await seed(
      db,
      `UPDATE organization SET email_domains = array_append(email_domains, 'gmail.com') WHERE slug = 'acme-robotics';
       INSERT INTO org_email_domain (domain, org_id) SELECT 'gmail.com', id FROM organization WHERE slug = 'acme-robotics';`,
    )
    expect((await hook('someone.else@gmail.com')).error?.http_code).toBe(403)
    await seed(
      db,
      `UPDATE organization SET email_domains = array_remove(email_domains, 'gmail.com') WHERE slug = 'acme-robotics';
       DELETE FROM org_email_domain WHERE domain = 'gmail.com';`,
    )
  })

  it('a colleague at the company domain is admitted and joins the default team', async () => {
    expect(await googleSignUp(COLLEAGUE, 'colleague@ACME.example', 'Colleague')).toEqual({})
    await actAs(db, COLLEAGUE)
    const ensured = await db.query<{ r: { success: boolean; org_id?: string } }>(`SELECT user_ensure_org_id() AS r`)
    expect(ensured.rows[0].r.success).toBe(true)
    await actAsOwner(db)
    const u = await db.query<{ org: string; role: string; teams: string[] }>(
      `SELECT o.slug AS org, u.role::text AS role,
              ARRAY(SELECT t.name FROM team_member tm JOIN team t ON t.id = tm.team_id WHERE tm.user_id = u.id ORDER BY t.name) AS teams
       FROM app_user u JOIN organization o ON o.id = u.org_id WHERE u.id = $1`,
      [COLLEAGUE],
    )
    expect(u.rows).toEqual([{ org: 'acme-robotics', role: 'engineer', teams: ['New Users'] }])
    const join = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM security_event WHERE kind = 'domain_join'`)
    expect(join.rows[0].n).toBe(1)
  })
})
