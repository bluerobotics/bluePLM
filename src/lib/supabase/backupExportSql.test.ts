/**
 * The backup worker's SQL (schema 113, module 10) on real Postgres (PGlite), with
 * the statements loaded verbatim from supabase/: each table exports only the
 * organization's rows, the table list here and the SQL's agree, and only
 * service_role can call either function.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BACKUP_TABLES } from '../../../api/src/backup/source'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'

const M10 = readFileSync(resolve(process.cwd(), 'supabase/modules/10-source-files.sql'), 'utf8').replace(/\r\n/g, '\n')

function statement(start: string, end: string): string {
  const from = M10.indexOf(start)
  expect(from, start).toBeGreaterThan(-1)
  const to = M10.indexOf(end, from)
  expect(to, end).toBeGreaterThan(-1)
  return M10.slice(from, to + end.length)
}

const EXPORT_FN = statement('CREATE OR REPLACE FUNCTION backup_export_rows(', 'TO service_role;')
const LIST_FN = statement('CREATE OR REPLACE FUNCTION backup_list_vault_objects(', 'TO service_role;')

const STUBS = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA storage;
CREATE TABLE storage.objects (bucket_id text, name text, metadata jsonb);
GRANT USAGE ON SCHEMA storage TO service_role; GRANT SELECT ON storage.objects TO service_role;
CREATE TABLE organizations (id uuid PRIMARY KEY, name text);
CREATE TABLE users (id uuid PRIMARY KEY, org_id uuid);
CREATE TABLE files (id uuid PRIMARY KEY, org_id uuid, file_path text);
CREATE TABLE file_versions (id uuid PRIMARY KEY, file_id uuid, version int);
CREATE TABLE workflow_templates (id uuid PRIMARY KEY, org_id uuid);
CREATE TABLE workflow_transitions (id uuid PRIMARY KEY, workflow_id uuid);
CREATE TABLE workflow_gates (id uuid PRIMARY KEY, transition_id uuid);
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
`

let db: PGlite

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUBS)
  await db.exec(EXPORT_FN)
  await db.exec(LIST_FN)
  await db.exec(`
    INSERT INTO organizations VALUES ('${ORG_A}', 'A'), ('${ORG_B}', 'B');
    INSERT INTO users VALUES ('${id(1)}', '${ORG_A}'), ('${id(2)}', '${ORG_B}');
    INSERT INTO files SELECT ('00000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid,
      CASE WHEN g % 2 = 0 THEN '${ORG_A}'::uuid ELSE '${ORG_B}'::uuid END, 'f' || g
      FROM generate_series(100, 129) g;
    INSERT INTO file_versions SELECT gen_random_uuid(), id, 1 FROM files;
    INSERT INTO workflow_templates VALUES ('${id(200)}', '${ORG_A}'), ('${id(201)}', '${ORG_B}');
    INSERT INTO workflow_transitions VALUES ('${id(300)}', '${id(200)}'), ('${id(301)}', '${id(201)}');
    INSERT INTO workflow_gates VALUES ('${id(400)}', '${id(300)}'), ('${id(401)}', '${id(301)}');
    INSERT INTO storage.objects VALUES
      ('vault', '${ORG_A}/ab/${'a'.repeat(64)}', '{"size": 10}'),
      ('vault', '${ORG_A}/${'b'.repeat(64)}', '{"size": 20}'),
      ('vault', '${ORG_B}/cd/${'c'.repeat(64)}', '{"size": 30}'),
      ('org-extensions', '${ORG_A}/pkg.bpx', '{"size": 40}');
  `)
})

afterAll(async () => {
  await db.close()
})

type ExportPage = { missing: boolean; rows: Array<Record<string, unknown>> }

async function exportAll(table: string, org = ORG_A, limit = 4): Promise<Array<Record<string, unknown>>> {
  await db.exec('SET ROLE service_role')
  const rows: Array<Record<string, unknown>> = []
  let after: string | null = null
  for (;;) {
    const res: { rows: Array<{ page: ExportPage }> } = await db.query<{ page: ExportPage }>(
      'SELECT backup_export_rows($1, $2, $3, $4) AS page',
      [org, table, after, limit],
    )
    const page: ExportPage = res.rows[0].page
    if (page.missing) return [{ missing: true }]
    rows.push(...page.rows)
    if (page.rows.length < limit) break
    after = String(page.rows[page.rows.length - 1].id)
  }
  await db.exec('RESET ROLE')
  return rows
}

describe('backup export SQL', () => {
  it('exports only the organization, through every page', async () => {
    const files = await exportAll('files')
    expect(files).toHaveLength(15)
    expect(new Set(files.map((f) => f.org_id))).toEqual(new Set([ORG_A]))
    expect(new Set(files.map((f) => f.id)).size).toBe(15)
  })

  it('scopes child tables through their parents', async () => {
    const versions = await exportAll('file_versions')
    expect(versions).toHaveLength(15)
    expect(await exportAll('workflow_gates')).toEqual([expect.objectContaining({ id: id(400) })])
    expect(await exportAll('organizations')).toEqual([{ id: ORG_A, name: 'A' }])
  })

  it('answers missing for an uninstalled table and refuses an unknown one', async () => {
    expect(await exportAll('ecos')).toEqual([{ missing: true }])
    await db.exec('SET ROLE service_role')
    await expect(db.query(`SELECT backup_export_rows('${ORG_A}', 'backup_config', NULL, 10)`)).rejects.toThrow(/unknown table/)
    await db.exec('RESET ROLE')
  })

  it('knows exactly the tables the worker exports', () => {
    const inSql = [...EXPORT_FN.matchAll(/WHEN '([a-z_]+)' THEN/g)].map((m) => m[1]).sort()
    expect(inSql).toEqual([...BACKUP_TABLES].sort())
  })

  it('lists only the organization\'s vault objects', async () => {
    await db.exec('SET ROLE service_role')
    const res = await db.query<{ name: string; size: number }>(`SELECT * FROM backup_list_vault_objects('${ORG_A}', NULL, 100)`)
    await db.exec('RESET ROLE')
    expect(res.rows.map((r: { name: string }) => r.name)).toEqual([`${ORG_A}/ab/${'a'.repeat(64)}`, `${ORG_A}/${'b'.repeat(64)}`])
  })

  it('is callable by service_role only', async () => {
    for (const role of ['authenticated', 'anon']) {
      await db.exec(`SET ROLE ${role}`)
      await expect(db.query(`SELECT backup_export_rows('${ORG_A}', 'files', NULL, 10)`)).rejects.toThrow(/permission denied/)
      await expect(db.query(`SELECT * FROM backup_list_vault_objects('${ORG_A}', NULL, 10)`)).rejects.toThrow(/permission denied/)
      await db.exec('RESET ROLE')
    }
  })
})
