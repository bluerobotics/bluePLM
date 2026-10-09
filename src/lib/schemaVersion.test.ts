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
  it('upgrades both scopes without weakening access or FK cleanup', () => {
    const core = readFileSync(CORE_SQL, 'utf8')
    const swatchesStart = core.indexOf('-- COLOR SWATCHES')
    const swatchesEnd = core.indexOf('-- CORE FUNCTIONS', swatchesStart)
    const swatches = core.slice(swatchesStart, swatchesEnd)
    const managementPolicy = swatches.slice(
      swatches.indexOf('CREATE POLICY "Users can manage accessible color swatches"'),
    )

    expect(core).toContain(`LANGUAGE sql IMMUTABLE AS $$ SELECT ${EXPECTED_SCHEMA_VERSION} $$`)
    expect(swatches).toContain('org_id UUID REFERENCES organizations(id) ON DELETE CASCADE')
    expect(swatches).toContain('created_by UUID REFERENCES users(id) ON DELETE SET NULL')
    expect(swatches).toContain('ALTER TABLE color_swatches ALTER COLUMN user_id DROP NOT NULL')
    expect(swatches).toContain('DROP CONSTRAINT IF EXISTS color_swatch_scope')
    expect(swatches).toContain('UPDATE color_swatches SET created_by = user_id WHERE created_by IS NULL')
    expect(swatches).toContain('OLD.created_by IS NOT NULL')
    expect(swatches).toContain('auth.uid() IS NOT NULL AND pg_trigger_depth() = 1')
    expect(swatches).toContain('FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL')
    expect(swatches).toContain("conname = 'color_swatches_created_by_fkey'")
    expect(swatches).toContain('color_swatches_scope_check')
    expect(core).toContain('CREATE OR REPLACE FUNCTION set_color_swatch_creator()')
    expect(core).toContain("('core', NULL, 'function', 'set_color_swatch_creator()', 'auth.uid')")

    for (const policy of [
      'Users can view own swatches',
      'Users can view org swatches',
      'Users can create own swatches',
      'Admins can create org swatches',
      'Users can delete own swatches',
      'Admins can delete org swatches',
    ]) {
      expect(swatches).toContain(`DROP POLICY IF EXISTS "${policy}" ON color_swatches;`)
    }

    expect(managementPolicy.match(/is_org_admin\(\)/g)).toHaveLength(2)
    expect(managementPolicy.match(/users\.org_id = color_swatches\.org_id/g)).toHaveLength(2)
    expect(managementPolicy).not.toContain("users.role = 'admin'")
  })
})
