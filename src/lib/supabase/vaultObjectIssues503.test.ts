/**
 * supabase/migrations/0503_vault_object_issues.sql on real Postgres (PGlite), applied after 0501
 * and 0502 to the 5.0 baseline as the migration runner applies them: it stamps 503; findings are
 * recorded once per content hash and logged; admins (only) read them with the file versions that
 * name the hash; an admin's decisions are checked and logged; the service-role-only functions
 * refuse clients; and downloads learn which content is unrecoverable.
 */
import type { PGlite } from '@electric-sql/pglite'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { actAs, actAsOwner, bootBaseline, MIGRATIONS, readSql, seed } from './testing/schemaDb'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const ADMIN = '00000000-0000-0000-0000-000000000001'
const MEMBER = '00000000-0000-0000-0000-000000000002'
const OTHER_ADMIN = '00000000-0000-0000-0000-000000000003'
const VAULT = '00000000-0000-0000-0000-0000000000a1'
const FILE = '00000000-0000-0000-0000-0000000000f1'
const BAD = 'e'.repeat(64)
const GOOD = 'd'.repeat(64)
const LATEST = 'a'.repeat(64)

let db: PGlite

async function asService(): Promise<void> {
  await actAsOwner(db)
  await db.exec('SET ROLE service_role')
}

async function error(sql: string): Promise<string | null> {
  try {
    await db.query(sql)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

beforeAll(async () => {
  db = await bootBaseline()
  await actAsOwner(db)
  for (const m of ['0501_server_backups.sql', '0502_security_hardening.sql', '0503_vault_object_issues.sql']) {
    await db.exec(readSql(resolve(MIGRATIONS, m)))
  }
  await seed(
    db,
    `
    INSERT INTO organization (id, name, slug) VALUES ('${ORG_A}', 'A', 'a'), ('${ORG_B}', 'B', 'b');
    INSERT INTO app_user (id, email, org_id, role) VALUES
      ('${ADMIN}', 'admin@a.test', '${ORG_A}', 'admin'),
      ('${MEMBER}', 'member@a.test', '${ORG_A}', 'engineer'),
      ('${OTHER_ADMIN}', 'admin@b.test', '${ORG_B}', 'admin');
    INSERT INTO vault (id, org_id, name, slug) VALUES ('${VAULT}', '${ORG_A}', 'V', 'v');
    INSERT INTO file (id, org_id, vault_id, file_path, file_name, extension, created_by, content_hash, version)
      VALUES ('${FILE}', '${ORG_A}', '${VAULT}', 'Parts/bracket.sldprt', 'bracket.sldprt', '.sldprt', '${MEMBER}', '${LATEST}', 3);
    INSERT INTO file_version (file_id, version, revision, content_hash, created_by) VALUES
      ('${FILE}', 1, 'A', '${GOOD}', '${MEMBER}'),
      ('${FILE}', 2, 'A', '${BAD}', '${MEMBER}'),
      ('${FILE}', 3, 'A', '${LATEST}', '${MEMBER}');
    `,
  )
}, 240_000)

afterAll(async () => {
  await db?.close()
})

describe('supabase/migrations/0503_vault_object_issues.sql', () => {
  it('follows the runner contract and stamps 503', async () => {
    const sql = readSql(resolve(MIGRATIONS, '0503_vault_object_issues.sql'))
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im)
    expect(sql).toContain('LANGUAGE sql IMMUTABLE AS $$ SELECT 503 $$;')
    await actAsOwner(db)
    const r = await db.query<{ v: { stamped: boolean; version: number; problems: unknown[] } }>(
      'SELECT verify_and_stamp_schema() AS v',
    )
    expect(r.rows[0].v.problems).toEqual([])
    expect(r.rows[0].v).toMatchObject({ stamped: true, version: 503 })
  }, 600_000)

  it('records a finding once per content hash, and logs it', async () => {
    await asService()
    const args = `'${ORG_A}', '${BAD}', 'damaged', '${ORG_A}/ee/${BAD}', '${GOOD}', 1804036, 'backup', NULL`
    const first = await db.query<{ id: string }>(`SELECT backup_issue_record(${args}) AS id`)
    const again = await db.query<{ id: string }>(`SELECT backup_issue_record(${args}) AS id`)
    expect(again.rows[0].id).toBe(first.rows[0].id)
    const issues = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM vault_object_issue`)
    expect(issues.rows[0].n).toBe(1)
    const events = await db.query<{ action: string }>(`SELECT action FROM vault_object_issue_event`)
    expect(events.rows.map((e) => e.action)).toEqual(['found'])
  })

  it('alerts admins once per object through the security monitor, with a title of its own', async () => {
    await actAsOwner(db)
    const events = await db.query<{ kind: string; summary: string; dedup_key: string }>(
      `SELECT kind, summary, dedup_key FROM security_event WHERE kind = 'backup_damaged_object'`,
    )
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0].summary).toMatch(/Damaged in storage: Parts\/bracket\.sldprt v2/)
    expect(events.rows[0].dedup_key).toBe(`backup_damaged_object:${ORG_A}:${BAD}:found`)

    await db.query('SELECT security_monitor_run()')
    const notes = await db.query<{ title: string; user_id: string }>(
      `SELECT title, user_id FROM notification WHERE title = 'Backups: damaged file found'`,
    )
    expect(notes.rows.map((n) => n.user_id)).toEqual([ADMIN])
    // security_monitor_run() includes the schema drift comparison: ~2 min on a slow runner (the
    // 502 test allows the same).
  }, 600_000)

  it('records no alert for an organization that turned backup alerts off', async () => {
    await actAsOwner(db)
    await db.exec(`INSERT INTO org_security_setting (org_id, is_backup_alert_enabled) VALUES ('${ORG_B}', false)
                   ON CONFLICT (org_id) DO UPDATE SET is_backup_alert_enabled = false`)
    await asService()
    await db.query(`SELECT backup_issue_record('${ORG_B}', '${'b'.repeat(64)}', 'missing', NULL, NULL, NULL, 'backup', NULL)`)
    await actAsOwner(db)
    const events = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM security_event WHERE org_id = '${ORG_B}'`)
    expect(events.rows[0].n).toBe(0)
  })

  it('lets admins of the organization read it, with the file versions that name the hash', async () => {
    await actAs(db, ADMIN)
    const r = await db.query<{ l: Array<Record<string, unknown>> }>('SELECT vault_object_issue_list() AS l')
    expect(r.rows[0].l).toHaveLength(1)
    expect(r.rows[0].l[0]).toMatchObject({ content_hash: BAD, kind: 'damaged', status: 'open' })
    expect(r.rows[0].l[0].refs).toEqual([
      expect.objectContaining({ file_path: 'Parts/bracket.sldprt', version: 2, is_latest: false, created_by_email: 'member@a.test' }),
    ])
    const direct = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM vault_object_issue')
    expect(direct.rows[0].n).toBe(1)
  })

  it('shows nothing to a member or to another organization', async () => {
    await actAs(db, MEMBER)
    expect(await error('SELECT vault_object_issue_list()')).toMatch(/Only administrators/)
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM vault_object_issue')).rows[0].n).toBe(0)
    await actAs(db, OTHER_ADMIN)
    const theirs = (await db.query<{ l: Array<{ content_hash: string }> }>('SELECT vault_object_issue_list() AS l')).rows[0].l
    expect(theirs.map((i) => i.content_hash)).not.toContain(BAD)
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM vault_object_issue_event e JOIN vault_object_issue i ON i.id = e.issue_id WHERE i.content_hash = '${BAD}'`)).rows[0].n).toBe(0)
  })

  it('keeps the worker functions to service_role and allows no client write', async () => {
    await actAs(db, ADMIN)
    expect(await error(`SELECT backup_issue_record('${ORG_A}', '${GOOD}', 'missing', NULL, NULL, NULL, 'backup', NULL)`)).toMatch(
      /permission denied/,
    )
    expect(await error(`SELECT backup_issue_record_repair('${ORG_A}', '${BAD}', 'healed', NULL, '{}')`)).toMatch(/permission denied/)
    expect(await error(`UPDATE vault_object_issue SET status = 'accepted'`)).toMatch(/permission denied/)
    expect(await error(`DELETE FROM vault_object_issue_event`)).toMatch(/permission denied/)
  })

  it('checks and logs an admin decision; accepting needs a note', async () => {
    await actAs(db, ADMIN)
    const id = (await db.query<{ id: string }>('SELECT id FROM vault_object_issue')).rows[0].id
    expect(await error(`SELECT vault_object_issue_resolve('${id}', 'accepted', '  ')`)).toMatch(/needs a note/)
    await db.query(`SELECT vault_object_issue_resolve('${id}', 'unrecoverable', 'never uploaded (January race)')`)
    const issue = (await db.query<{ status: string; resolution: string; resolved_by: string }>(
      'SELECT status, resolution, resolved_by FROM vault_object_issue',
    )).rows[0]
    expect(issue).toEqual({ status: 'unrecoverable', resolution: 'marked_unrecoverable', resolved_by: ADMIN })
    const log = await db.query<{ action: string; actor_id: string }>(
      'SELECT action, actor_id FROM vault_object_issue_event ORDER BY id',
    )
    expect(log.rows.at(-1)).toEqual({ action: 'marked_unrecoverable', actor_id: ADMIN })

    await actAs(db, OTHER_ADMIN)
    expect(await error(`SELECT vault_object_issue_resolve('${id}', 'open', NULL)`)).toMatch(/not found/)
  })

  it('records a roll back as a resolution of its own, with its note', async () => {
    await asService()
    await db.query(`SELECT backup_issue_record('${ORG_A}', '${LATEST}', 'damaged', 'x', 'f', 1, 'backup', NULL)`)
    await actAs(db, ADMIN)
    const id = (await db.query<{ id: string }>(`SELECT id FROM vault_object_issue WHERE content_hash = '${LATEST}'`)).rows[0].id
    expect(await error(`SELECT vault_object_issue_resolve('${id}', 'rolled_back', '')`)).toMatch(/needs a note/)
    await db.query(`SELECT vault_object_issue_resolve('${id}', 'rolled_back', 'Rolled back to version 1')`)
    const issue = (await db.query<{ status: string; resolution: string; note: string }>(
      `SELECT status, resolution, note FROM vault_object_issue WHERE id = '${id}'`,
    )).rows[0]
    expect(issue).toEqual({ status: 'accepted', resolution: 'rolled_back', note: 'Rolled back to version 1' })
  })

  it('tells any member which content is unrecoverable, in their own organization only', async () => {
    await actAs(db, MEMBER)
    const r = await db.query<{ b: string[] }>(`SELECT vault_object_blocked(ARRAY['${BAD}', '${GOOD}']) AS b`)
    expect(r.rows[0].b).toEqual([BAD])
    await actAs(db, OTHER_ADMIN)
    const other = await db.query<{ b: string[] }>(`SELECT vault_object_blocked(ARRAY['${BAD}']) AS b`)
    expect(other.rows[0].b).toEqual([])
  })

  it('closes a repaired finding, and reopens it when the object is found bad again', async () => {
    await asService()
    await db.query(`SELECT backup_issue_record('${ORG_A}', '${GOOD}', 'missing', NULL, NULL, NULL, 'verify', NULL)`)
    const repaired = await db.query<{ ok: boolean }>(
      `SELECT backup_issue_record_repair('${ORG_A}', '${GOOD}', 'restored_from_backup', '${ADMIN}', '{"snapshot":"s1"}') AS ok`,
    )
    expect(repaired.rows[0].ok).toBe(true)
    await db.query(`SELECT backup_issue_record('${ORG_A}', '${GOOD}', 'damaged', 'x', 'f', 1, 'backup', NULL)`)
    const issue = (await db.query<{ status: string; kind: string }>(
      `SELECT status, kind FROM vault_object_issue WHERE content_hash = '${GOOD}'`,
    )).rows[0]
    expect(issue).toEqual({ status: 'open', kind: 'damaged' })
    expect(await error(`SELECT backup_issue_record_repair('${ORG_A}', '${GOOD}', 'accepted', NULL, '{}')`)).toMatch(/not a repair/)
    await actAsOwner(db)
  })
})
