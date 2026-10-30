import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { EXPECTED_SCHEMA_VERSION, VERSION_DESCRIPTIONS } from './schemaVersion'

// schema_release_description() is what lands in schema_version.description when a
// database is stamped, and VERSION_DESCRIPTIONS is what the app shows for the
// same release. They are two hand-written copies of one paragraph, so they drift,
// and the drift is invisible: nothing fails, the two just quietly disagree about
// what the release did.
//
// They did. At release 95 the database-side copy still ended on v93 content -
// share-link admission and the anon sweep seeing partitioned tables - while
// carrying the opening of 95, so a stamped database described a release that had
// never existed. Neither the manifest nor any harness control looks at this text.
//
// This is the cheap half of the fix. scripts/emit-release-description-sql.mjs
// generates the SQL from the entry below, so the two start identical; this keeps
// them that way.
const CORE_SQL = resolve(__dirname, '../../supabase/core.sql')

function readReleaseDescriptionFromSql(): string {
  const sql = readFileSync(CORE_SQL, 'utf8')

  const fn = sql.match(
    /CREATE OR REPLACE FUNCTION schema_release_description\(\) RETURNS TEXT[\s\S]*?AS \$\$ SELECT([\s\S]*?)\r?\n\$\$;/,
  )
  if (!fn) throw new Error('schema_release_description() not found in supabase/core.sql')

  // The body is a run of adjacent single-quoted literals that PostgreSQL
  // concatenates. '' is an escaped apostrophe, not a literal boundary.
  const literals = fn[1].match(/'(?:[^']|'')*'/g)
  if (!literals) throw new Error('no string literals in schema_release_description()')

  return literals.map((l) => l.slice(1, -1).replace(/''/g, "'")).join('')
}

// The SQL is written with straight apostrophes; the app string uses typographic
// ones. That difference is presentational and not drift.
const normalize = (s: string) => s.replace(/\u2019/g, "'").trim()

describe('schema_release_description() parity', () => {
  it('matches VERSION_DESCRIPTIONS for the expected schema version', () => {
    const app = VERSION_DESCRIPTIONS[EXPECTED_SCHEMA_VERSION]
    expect(app, `VERSION_DESCRIPTIONS has no entry for ${EXPECTED_SCHEMA_VERSION}`).toBeTruthy()

    expect(normalize(readReleaseDescriptionFromSql())).toBe(normalize(app))
  })

  it('describes the release the app expects, not an earlier one', () => {
    // A guard against the specific way this broke: the SQL kept accumulating and
    // ended up holding the tail of an older release.
    const sqlText = normalize(readReleaseDescriptionFromSql())

    for (const [version, text] of Object.entries(VERSION_DESCRIPTIONS)) {
      if (Number(version) === EXPECTED_SCHEMA_VERSION) continue
      const tail = normalize(text).slice(-120)
      expect(sqlText.includes(tail), `ends with the text of release ${version}`).toBe(false)
    }
  })
})

describe('organization color swatch schema', () => {
  it('keeps both scopes, the access rules and the foreign-key cleanup', () => {
    const core = readFileSync(CORE_SQL, 'utf8').replace(/\r\n/g, '\n')
    const table = core.slice(core.indexOf('CREATE TABLE color_swatch ('), core.indexOf(');', core.indexOf('CREATE TABLE color_swatch (')))
    const managementPolicy = core.slice(
      core.indexOf('CREATE POLICY "color_swatch: users manage"'),
      core.indexOf(');\n', core.indexOf('CREATE POLICY "color_swatch: users manage"')),
    )

    expect(core).toContain(`LANGUAGE sql IMMUTABLE AS $$ SELECT ${EXPECTED_SCHEMA_VERSION} $$`)
    expect(table).toContain('user_id UUID REFERENCES app_user(id) ON DELETE CASCADE')
    expect(table).toContain('org_id UUID REFERENCES organization(id) ON DELETE CASCADE')
    expect(table).toContain('created_by UUID REFERENCES app_user(id) ON DELETE SET NULL')
    expect(table).toContain('CONSTRAINT color_swatch_scope_check CHECK')
    expect(core).toContain('CREATE OR REPLACE FUNCTION trg_color_swatch_set_creator()')
    expect(core).toContain("('core', NULL, 'function', 'trg_color_swatch_set_creator()', 'auth.uid')")

    expect(managementPolicy.match(/is_org_admin\(\)/g)).toHaveLength(2)
    expect(managementPolicy.match(/app_user\.org_id = color_swatch\.org_id/g)).toHaveLength(2)
    expect(managementPolicy).not.toContain("app_user.role = 'admin'")
  })

  it('publishes swatch changes with the full old record, and refuses to stamp without it', () => {
    const core = readFileSync(CORE_SQL, 'utf8').replace(/\r\n/g, '\n')

    // The renderer's DELETE subscription filters on org_id, which needs the full old record.
    expect(core).toContain('ALTER TABLE color_swatch REPLICA IDENTITY FULL;')
    expect(core).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE color_swatch;')
    expect(core).toContain("AND tablename = 'color_swatch'")
    expect(core).toContain("oid = 'public.color_swatch'::regclass) = 'f'")
    expect(core).toContain("residue := 'color_swatches_not_realtime';")
    expect(core).toMatch(/'check_release_residue\(\)', '[^']*color_swatches_realtime[^']*'/)
  })
})
