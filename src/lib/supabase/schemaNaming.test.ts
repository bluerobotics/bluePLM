/**
 * The schema naming rules (.cursor/rules/database.mdc, "Naming"), checked over every object that
 * supabase/core.sql and supabase/modules/*.sql define: tables and views singular snake_case and never a
 * reserved word, org-owned tables `org_`, foreign keys `_id` (or `_by` for an actor), booleans
 * `is_`/`has_`/`can_`, timestamps `_at`, functions `<entity>_<verb>[_<qualifier>]` or a kept prefix,
 * trigger functions and triggers `trg_<table>_<what>`, policies "<table>: <who> <action>", indexes and
 * constraints in the Postgres default shapes. Exceptions live in EXCEPTIONS
 * (scripts/rename-5.0/namingRules.mjs), each with its reason.
 *
 * The SQL is read statically (scripts/rename-5.0/schemaInventory.mjs), in apply order, so an object a
 * later file drops is not held against the schema.
 */
import { describe, expect, it } from 'vitest'

import { checkNaming, looksPlural } from '../../../scripts/rename-5.0/namingRules.mjs'
import { inventory, readSchema } from '../../../scripts/rename-5.0/schemaInventory.mjs'

const check = (text: string) => checkNaming(inventory([{ file: 'test.sql', text }]))

describe('schema naming', () => {
  it('every object in supabase/ follows the naming rules', () => {
    const inv = inventory(readSchema(process.cwd()))
    expect(inv.tables.size).toBeGreaterThan(50)
    const violations = checkNaming(inv).map((v) => `${v.kind} ${v.name} (${v.file ?? '-'}:${v.line ?? '-'}): ${v.rule}`)
    expect(violations).toEqual([])
  })

  it('flags the shapes the rules refuse', () => {
    const rules = check(`
      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY,
        owner UUID REFERENCES users(id),
        read BOOLEAN,
        last_seen TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS organization_addresses (id UUID);
      CREATE TABLE IF NOT EXISTS "user" (id UUID);
      CREATE OR REPLACE FUNCTION checkout_file(p_id UUID) RETURNS JSONB LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE OR REPLACE FUNCTION touch() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TRIGGER touch_files BEFORE UPDATE ON files FOR EACH ROW EXECUTE FUNCTION touch();
      CREATE POLICY "Users can view files" ON files FOR SELECT USING (true);
      CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner);
    `).map((v) => `${v.kind}:${v.rule}`)
    expect(rules).toEqual(
      expect.arrayContaining([
        'table:singular',
        'table:org-owned tables use org_, never organization_',
        'table:reserved word',
        'column:foreign key ends in _id (or _by for an actor)',
        'column:boolean starts with is_/has_/can_',
        'column:timestamp ends in _at',
        'function:<entity>_<verb>[_<qualifier>] or a kept prefix (is_/has_/can_/my_/check_/trg_)',
        'function:trigger functions are trg_<table>_<what>',
        'trigger:trg_<table>_<what>',
        'policy:"<table>: <who> <action>"',
        'index:<table>_<cols>_idx',
      ]),
    )
  })

  it('accepts the shapes the rules ask for', () => {
    expect(
      check(`
        CREATE TABLE IF NOT EXISTS file (
          id UUID PRIMARY KEY,
          owner_id UUID REFERENCES app_user(id),
          created_by UUID REFERENCES app_user(id),
          is_read BOOLEAN,
          last_seen_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS vault_access (id UUID);
        CREATE OR REPLACE FUNCTION file_checkout(p_id UUID) RETURNS JSONB LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
        CREATE OR REPLACE FUNCTION is_org_admin() RETURNS BOOLEAN LANGUAGE sql AS $$ SELECT true $$;
        CREATE OR REPLACE FUNCTION trg_file_touch() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
        CREATE TRIGGER trg_file_touch BEFORE UPDATE ON file FOR EACH ROW EXECUTE FUNCTION trg_file_touch();
        CREATE POLICY "file: users read" ON file FOR SELECT USING (true);
        CREATE INDEX IF NOT EXISTS file_owner_id_idx ON file(owner_id);
      `),
    ).toEqual([])
  })

  it('reads a singular name ending in s as singular', () => {
    expect(['vault_access', 'review_status', 'org_address', 'analysis'].map(looksPlural)).toEqual([false, false, false, false])
    expect(['widgets', 'team_widgets', 'gizmos'].map(looksPlural)).toEqual([true, true, true])
  })
})
