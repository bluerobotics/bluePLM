# BluePLM Database Schema (5.0)

The database is defined in two parts:

- **The 5.0 baseline**: `core.sql`, then `modules/10-source-files.sql` through
  `modules/50-extensions.sql`, applied in file-name order to an empty database. Every object
  is defined once; nothing in the baseline upgrades an older database. The baseline is frozen
  at schema 500 and is not edited again.
- **Numbered migrations**: `migrations/NNNN_<name>.sql`. Every change after 5.0 is a new file
  whose number is the schema version it stamps, and a released file is never edited.
  `migrations/0500_from_4x.sql` upgrades a 4.x database (verified at 112) to 500.

`legacy-4.10/` is the SQL of tag v4.10.0. The migration runner applies it to a database below
112 before `0500`, and the upgrade test uses it as its starting point.

## Applying the SQL

The desktop app applies it (Settings, database upgrade): an organization admin gives the
database connection string once, and the runner, under an advisory lock, either applies the
baseline to an empty database (and records the migrations up to 500 as applied) or applies
the pending migrations, each in its own transaction, recording each with its checksum in
`schema_migration`. A migration whose first line is `-- blueplm:no-transaction` runs outside
a transaction; that is for statements Postgres refuses inside one (`ALTER TYPE ... ADD VALUE`
before its use, `CREATE INDEX CONCURRENTLY`), and such a file holds nothing else.

By hand, in the Supabase SQL editor, is for an operator recovering a database only; the app's
runner is the normal path, and it is what records migrations in `schema_migration`. A new
database gets `core.sql` and every module in order; a database below 112 gets `legacy-4.10/`
first; a 112 database gets `migrations/0500_from_4x.sql`; then, in every case, any later
migration in order, and finally `tools/verify-schema.sql`.

Native extensions with their own SQL (the private extension `blueplm.customers`) apply theirs
after the core migrations. `0500` drops every policy on a public table, extensions' included,
because they call core functions by name; the extension's 5.0 SQL recreates them.

## Schema version

`schema_version.version` is what the app reads. It is written by one thing only,
`verify_and_stamp_schema()` (run by `tools/verify-schema.sql`), and only when:

- every object in the release manifest exists and its source still contains what the
  manifest requires (`schema_manifest_entry`, read through `schema_get_release_manifest()`;
  a migration registers what it adds with an `INSERT`, `since_version` = its number);
- every org-scoped RPC refuses a foreign organization (`check_org_gates()`), membership tests
  are NULL-safe, entity arguments are bound;
- nothing in `public` is reachable by `anon` outside the allowlists (`check_anon_reach()`:
  routines, views, row-level security, and since 5.0 any table privilege);
- every `SECURITY DEFINER` function pins `search_path` (`check_definer_search_path()`);
- nothing a closed hole produced is still live (`check_release_residue()`).

`schema_version` itself keeps its 4.x shape (`id`, `version`, `description`, `applied_at`,
`applied_by`, one row, readable by anon) so a 4.x app reads 500, sees a newer database and
asks to be updated. `client_min_version()` names the oldest 5.x app allowed to connect.

To change the schema: add `migrations/NNNN_<name>.sql`, raise `schema_release_version()` and
`EXPECTED_SCHEMA_VERSION` (`src/lib/schemaVersion.ts`) to `NNNN`, register new objects in
`schema_manifest_entry`, and regenerate `src/types/supabase.ts`. Names follow
`.cursor/rules/database.mdc`.

## Tools

- `tools/verify-schema.sql`: the verification above, with a report of each check.
- `tools/emergency-lockdown.sql`: withdraws anon access in an incident.
- `tools/test-merge-custom-properties.sql`: a self-checking script for
  `custom_properties_merge()`.

## Org-scoped RPCs

A `SECURITY DEFINER` function runs as the schema owner, so row-level security is not
consulted inside it. When such a function also takes a `p_org_id`, that argument decides
which organization it acts on, and PostgREST exposes it to whoever holds `EXECUTE`. A new
function grants `EXECUTE` to `PUBLIC`, and Supabase's bootstrap adds an explicit `anon` grant
on top (`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, ...`), so a
`GRANT EXECUTE ... TO authenticated` beside a new function is not a restriction. The baseline
and every migration therefore write each function's privileges out in full
(`REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role`, then the grants it needs).

- Every such function calls `org_require_member(p_org_id)` first, which raises unless
  `auth.uid()` belongs to that organization (an unknown id gets the same error as a foreign
  one).
- `anon_enforce_execute_posture()` runs at the end of every file. It withdraws anon's
  `EXECUTE` on everything in `public` outside `anon_get_execute_allowlist()`, anon's table and
  view privileges outside `anon_get_read_allowlist()`, and the default privileges that would
  grant them again.
- `check_anon_reach()` refuses to certify a database where anything outside the allowlists
  is still reachable.

### Gating the argument that selects the row

`org_require_member(p_org_id)` only proves the caller belongs to the organization they named.
If a second argument chooses the row, it needs checking too: compare the entity's own
`org_id` to `p_org_id`, or derive the organization from the entity with
`file_require_access()` / `vault_require_access()`. `check_unbound_entity_args()` reports a
function that gates on `p_org_id` and never uses it to constrain anything.

### Membership tests must be NULL-safe

An account that has not joined an organization has `app_user.org_id` NULL, so
`IF p_org_id NOT IN (SELECT org_id FROM app_user WHERE id = auth.uid())` is NULL, not true,
and the body runs. Use `org_require_member(p_org_id)`, or `NOT is_org_member(p_org_id)` where
the function returns a value. `check_null_unsafe_org_gates()` refuses the shape.

### Views

A view has no row-level security of its own and, unless created
`WITH (security_invoker = true)`, reads its tables as its owner. New views in `public` are
`security_invoker` and granted to `authenticated`/`service_role` only.

## Regenerating TypeScript types

`npm run gen:types` regenerates `src/types/supabase.ts` from a database that holds the
schema; never edit that file by hand.
