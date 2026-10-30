-- =====================================================================
-- BluePLM Core Schema (5.0 baseline)
-- =====================================================================
-- Organizations, users, teams and permissions, notifications, sessions, the
-- schema release manifest and the security invariants every module relies on.
--
-- 5.0 BASELINE. supabase/core.sql and the files in supabase/modules are one
-- ordered set: core first, then the modules in file-name order, applied to an empty
-- database by the desktop app's migration runner in one transaction (or by
-- hand in that order). Every object is defined once, and nothing here upgrades
-- an older database: a 4.x database (schema 112) is upgraded by
-- supabase/migrations/0500_from_4x.sql, and every change after 5.0 is a new
-- numbered file in supabase/migrations/. Do not edit this baseline in place.
--
-- The stamp is not written here. The runner calls verify_and_stamp_schema()
-- (supabase/tools/verify-schema.sql) afterwards, and it stamps 500 only when
-- the manifest, the security checks and the residue checks all pass.
--
-- Names follow .cursor/rules/database.mdc (singular tables, org_ prefixes,
-- <entity>_<verb> functions, trg_ triggers, "<table>: <who> <action>"
-- policies); the 4.x -> 5.0 renames are listed in supabase/rename-map-5.0.json.
--
-- NO EXTENSIONS ARE INSTALLED HERE, DELIBERATELY. Every default uses
-- gen_random_uuid() from pg_catalog, so nothing depends on uuid-ossp or
-- pgcrypto and nothing lands in public that the project cannot withdraw from
-- anon. If an installation needs an extension for something else, install it
-- in the extensions schema.
-- =====================================================================

-- ===========================================
-- TYPES
-- ===========================================

CREATE TYPE user_role AS ENUM ('admin', 'engineer', 'viewer');
CREATE TYPE permission_action AS ENUM ('view', 'create', 'edit', 'delete', 'admin');

-- ===========================================
-- TABLES
-- ===========================================

-- ===========================================
-- SCHEMA VERSION TRACKING
-- ===========================================
-- schema_version.version is what the app reads to decide whether to show a
-- "database out of date" warning. It is therefore a claim about the whole
-- database, and the only useful property it can have is that it is never
-- higher than the truth.
--
-- It used to be written in three places that could each lie:
--
--   1. core.sql stamped the head unconditionally with ON CONFLICT DO UPDATE.
--      Re-running core.sql alone on an old database moved the number to the
--      head while every module stayed where it was.
--   2. Each module stamped the head as well, so that re-running one module -
--      the usual way a single RPC fix is applied - advanced the version.
--      Applying only 30-supply-chain.sql to a v86 database therefore reported
--      88 with module 10's v87 work absent, and the app showed no warning.
--   3. Under the documented `psql \i` path a module that errors partway
--      through still reaches its stamp at the end of the file.
--
-- The common cause is that the number is global and monotonic while the files
-- are per-module: no single number can express "30 applied, 10 not", so any
-- scheme where one file sets it is guessing about the others.
--
-- So nothing sets the version as a side effect of being run any more. The
-- version is a *result*, written only by verify_and_stamp_schema(), which
-- checks that the objects this release requires actually exist first. Modules
-- stamp nothing; core.sql seeds the row and never touches an existing one.
-- Applying a subset of the files leaves the old number in place, which is a
-- warning rather than a false all-clear. See supabase/README.md.
CREATE TABLE schema_version (
  -- Only allow single row
  id INTEGER DEFAULT 1 CHECK ((id = 1)) PRIMARY KEY,
  version INTEGER DEFAULT 1 NOT NULL,
  description TEXT,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by TEXT
);

-- RLS: Everyone can read schema version

ALTER TABLE schema_version ENABLE ROW LEVEL SECURITY;

-- Seed only. Version 0 reads as "installed but not verified"; the stamp is
-- written by verify_and_stamp_schema() (supabase/tools/verify-schema.sql), which
-- the migration runner calls after the baseline.
INSERT INTO schema_version (id, version, description, applied_at, applied_by)
VALUES (1, 0, 'Installed but not verified - run supabase/tools/verify-schema.sql', NOW(), 'core.sql');

-- One row per object this release requires, scoped to the module that creates it.
--
--   module  - label used in reports
--   probe   - a table whose presence means the module is installed, for OPTIONAL
--             modules only. A module that is not installed is skipped rather
--             than failed, so an optional module stays optional.
--
--             NULL for core and for the two modules the README calls required,
--             10-source-files and 15-inspection. Giving a required module a
--             probe made it self-excusing: the probe table is created by the
--             very file whose absence is the problem, so not installing the
--             module made every requirement of that module 'skipped' rather
--             than 'missing'. A database holding core.sql alone - 18 of 76
--             tables - passed every check and was stamped 89. A required module
--             must be able to fail, which means its requirements must be probed
--             unconditionally.
--   kind    - 'table' or 'function'
--   identity- table name, or function signature as regprocedure accepts it
--   requires- substring that must appear in the function source, or several
--             separated by ' && ', all of which must appear; NULL to only check
--             existence. This is what lets the manifest catch a body change (an
--             authorization check that went missing) and not just a missing
--             object. Matched against the source with comments and string
--             literals removed, so a token that only ever appears inside a
--             quoted string - anything a function builds for EXECUTE - will
--             never be found; name something the function actually calls.
--
-- 5.0: the manifest lives in a table, so a numbered migration registers what
-- it adds with an INSERT (since_version = its own number) instead of copying
-- this list. The baseline seeds every 5.0 entry with since_version 500.
-- Service-only: RLS on, no policy, no grant to anon or authenticated.
CREATE TABLE schema_manifest_entry (
  kind TEXT NOT NULL CHECK ((kind = ANY (ARRAY['table'::text, 'function'::text]))),
  name TEXT NOT NULL,
  module TEXT NOT NULL,
  probe TEXT,
  requires TEXT,
  since_version INTEGER NOT NULL,
  CONSTRAINT schema_manifest_entry_pkey PRIMARY KEY (kind, name)
);

ALTER TABLE schema_manifest_entry ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_manifest_entry (module, probe, kind, name, requires, since_version)
SELECT module, probe, kind, identity, requires, 500 FROM (VALUES
    -- core.sql
    ('core', NULL, 'table', 'schema_manifest_entry', NULL),
    ('core', NULL, 'function', 'org_require_member(uuid)', NULL),
    ('core', NULL, 'function', 'is_org_member(uuid)', NULL),
    ('core', NULL, 'function', 'schema_release_version()', NULL),
    ('core', NULL, 'function', 'client_min_version()', NULL),
    ('core', NULL, 'function', 'check_definer_search_path()', 'proconfig'),
    ('core', NULL, 'function', 'schema_stamp_quiet()', NULL),
    -- The only caller permitted to write app_user.org_id for the account that owns
    -- it, and therefore the only place an account stranded with org_id NULL can
    -- be repaired. Pinned on `resolved_org_id` rather than on the table names it
    -- reads: a copy that still consults pending_org_member and organizations
    -- but stops short of the UPDATE - which is exactly what every release
    -- through 96 did - names both tables and resolves nothing. The variable
    -- exists only in the version that reaches a decision and writes it.
    ('core', NULL, 'function', 'user_ensure_org_id()', 'resolved_org_id && user_get_verified_email'),
    -- Schema 111: membership is decided by the address Supabase Auth verified,
    -- never public.app_user.email, and knowing a slug is not an invitation.
    ('core', NULL, 'function', 'user_get_verified_email(uuid)', 'email_confirmed_at'),
    ('core', NULL, 'function', 'my_verified_email()', 'user_get_verified_email'),
    ('core', NULL, 'function', 'org_join_by_slug(text)', 'user_get_verified_email && pending_org_member'),
    -- 5.0 (audit O1): invited teams and vaults must belong to the invitation's organization.
    ('core', NULL, 'function', 'team_member_apply_pending(uuid)', 'user_get_verified_email && t.org_id = v_pending.org_id && v.org_id = v_pending.org_id'),
    ('core', NULL, 'function', 'trg_auth_user_sync_app_user()', 'email_confirmed_at'),
    -- Schema 112: members read backup status without the backup secrets. The marker is code,
    -- not the 'credentials_set' key: sql_strip_noise() removes string literals before matching.
    ('10-source-files', NULL, 'function', 'backup_get_status()', 'bc.restic_password_encrypted IS NOT NULL'),
    -- The checks themselves are release content. A database carrying v90's
    -- copy of check_anon_reach() would look at no views at all and report a
    -- clean schema over the part_with_pricing leak, so the manifest pins the
    -- shape of each: `severity` only exists in the version that distinguishes
    -- blocking from advisory, and `relkind` only in the one that reaches views.
    -- `anon_list_revoke_grantors` only exists in the version that decides blocking
    -- against advisory by asking who granted the privilege rather than treating
    -- every row as fatal, and that version is also the one that looks at
    -- procedures and at materialized views.
    -- `has_any_column_privilege` only exists in the version that sees a grant
    -- made on a single column: has_table_privilege(...,'SELECT') is false for
    -- one, so a view with `GRANT SELECT (part_number)` to anon was read over
    -- HTTP while this reported the schema clean.
    ('core', NULL, 'function', 'check_anon_reach()',
      'anon_list_revoke_grantors && has_any_column_privilege && anon_list_admitting_policies && has_table_privilege'),
    -- The sweep has to cover exactly what the check reports, or the check can
    -- report something the sweep cannot clear. anon_list_revoke_grantors is the call
    -- that makes the two agree; the version without it is the version where a
    -- procedure in public withheld the stamp for ever. It is named rather than
    -- the `ON ROUTINE` statement itself because `requires` is matched against
    -- the source with string literals removed, and every REVOKE in that
    -- function is built inside a format() literal.
    -- The same widening on the remedy side. A check that reports a column grant
    -- while the sweep cannot see it is the v90 defect again: a blocking
    -- condition the operator has no way to clear.
    ('core', NULL, 'function', 'anon_enforce_execute_posture()',
      'anon_list_revoke_grantors && has_any_column_privilege'),
    ('core', NULL, 'function', 'anon_list_revoke_grantors(oid)', NULL),
    ('core', NULL, 'function', 'anon_list_read_grantors(oid)', NULL),
    -- Which policies let anon see a row. Enabling row-level security is not the
    -- same act as excluding anon, and until this existed the check confused the
    -- two: `relrowsecurity = true` was taken as safe, so a table carrying
    -- `CREATE POLICY ... TO anon USING (true)` was read over HTTP.
    ('core', NULL, 'function', 'anon_list_admitting_policies(oid)', NULL),
    ('core', NULL, 'function', 'anon_get_read_allowlist()', NULL),
    ('core', NULL, 'function', 'probe_get_literal(text)', NULL),
    -- The probe takes its text literals from the function's own source where
    -- the source constrains them, so an argument validation stops being a free
    -- way to refuse the probe without ever running the authorization check.
    ('core', NULL, 'function', 'probe_get_literal_for_arg(oid,text,text)', NULL),
    -- sql_strip_noise, not a phrase from the pattern it looks for: `requires`
    -- is tested against the source with literals removed, and every mention of
    -- the pattern inside this function is inside a literal.
    ('core', NULL, 'function', 'check_null_unsafe_org_gates()', 'sql_strip_noise'),
    -- `routine_list_row_selecting_id_args` is the widened rule: the previous version only
    -- looked at functions taking a p_org_id, so a function that gates on an
    -- entity instead was invisible to it - which is how
    -- workflow_transition_apply kept a foreign transition id.
    ('core', NULL, 'function', 'check_unbound_entity_args()', 'routine_list_row_selecting_id_args'),
    ('core', NULL, 'function', 'routine_list_row_selecting_id_args(oid)', NULL),
    -- `probe_get_literal` is the version that fills the non-org arguments with
    -- values a function can actually get past, instead of NULLs it refuses for
    -- reasons that have nothing to do with the organization.
    --
    -- `c_gate_binding` is the name the evidence pattern took when it stopped
    -- accepting auth.uid(). A function whose only recognised token was
    -- `v_actor UUID := auth.uid();` - a stamp of who asked, with no
    -- authorization anywhere - scored gated, was stamped, and served another
    -- tenant's parts over HTTP.
    -- `org_gate_get_exclusion_reason` is the version in which the exclusion list
    -- stopped being a list. A build carrying the previous copy skips three
    -- functions by name whatever their ACL says, which is how a
    -- SECURITY DEFINER function that authenticated could call was certified as
    -- gated; `unverifiable` is the version in which a reachable function the
    -- probe could not judge withholds the stamp instead of being reported and
    -- then ignored.
    -- `v_reachable` and not the word 'unverifiable': the latter appears in this
    -- function only inside a string literal, and `requires` is matched against
    -- the source with literals removed, so pinning on it would search for
    -- something that is never there and withhold the stamp for ever. That is
    -- the mistake this manifest has now had to be protected from four times.
    -- v_reachable is the variable the new verdict is decided by.
    ('core', NULL, 'function', 'check_org_gates()',
      'probe_get_literal_for_arg && c_gate_binding && org_gate_get_exclusion_reason && v_reachable'),
    -- Its own entry, not merely a token in the row above: `requires` is a
    -- substring search of the caller, so pinning check_org_gates() on the name
    -- proves only that it still calls something so called. This is the object
    -- that decides which functions are exempt from the org-gate probe, and a
    -- weakened copy - one that answered 'withdrawn' without consulting the ACL -
    -- would exempt everything while every row above it still read ok. Pinned on
    -- has_function_privilege, which is the term that makes the answer a fact
    -- about the database rather than a name on a list.
    ('core', NULL, 'function', 'org_gate_get_exclusion_reason(oid)',
      'has_function_privilege'),
    -- requires NULL on purpose. Everything this function contains is a string
    -- literal, and literals are stripped before `requires` is searched, so
    -- there is no token to pin that would not resolve to nothing. Its behaviour
    -- is covered where behaviour can be covered: NC18 in the harness grants
    -- job_title_create_defaults back to authenticated and requires the stamp to
    -- be withheld, which is false unless this answers true for the verdict that
    -- produces.
    ('core', NULL, 'function', 'is_org_gate_status_blocking(text)', NULL),
    -- The pair that asserts an ACL rather than a refusal, for functions taking
    -- no organization argument.
    --
    -- requires NULL on the list, for the same reason is_org_gate_status_blocking()
    -- carries NULL: every name in it is a string literal, and `requires` is
    -- matched against the source with literals removed. Pinning it on
    -- 'extension_http_log_cleanup' - which is the token a reader reaches for
    -- first, and which this row held until it was tested - searches for
    -- something that is never there and withholds the stamp for ever. That is
    -- the fifth time this file has had to be protected from that mistake.
    -- What the list contains is covered by NC19, which regrants EXECUTE on one
    -- of the two sweeps and requires the stamp to be withheld; a copy of the
    -- list that had dropped the entry cannot pass that.
    ('core', NULL, 'function', 'schema_get_withdrawn_execute_manifest()', NULL),
    ('core', NULL, 'function', 'check_withdrawn_execute()',
      'has_function_privilege && schema_get_withdrawn_execute_manifest'),
    ('core', NULL, 'function', 'like_pattern_escape(text)', NULL),
    -- Closing a hole and revoking what the hole produced.
    ('core', NULL, 'table', 'schema_remediation_log', NULL),
    ('core', NULL, 'function', 'schema_remediation_record(text,integer,jsonb,text)', NULL),
    -- review_write_policy since 107: the review migration (policy drops, the
    -- per-round response key, attempt ids, one-item packages) is checked on the
    -- database, so a partial apply cannot stamp.
    ('core', NULL, 'function', 'check_release_residue()', 'color_swatches_scope_columns && color_swatches_realtime && sw_licence_policy && review_write_policy'),
    ('core', NULL, 'function', 'trg_color_swatch_set_creator()', 'auth.uid'),
    -- The two org-scoped RPCs core.sql owns that used to hand-write the
    -- membership test out of auth.uid().
    ('core', NULL, 'function', 'org_get_module_defaults(uuid)', 'org_require_member'),
    ('core', NULL, 'function', 'org_get_column_defaults(uuid)', 'org_require_member'),
    ('core', NULL, 'function', 'org_set_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 'is_org_member'),
    ('core', NULL, 'function', 'org_force_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 'is_org_member'),
    ('core', NULL, 'function', 'org_set_column_defaults(uuid,jsonb)', 'is_org_member'),
    ('core', NULL, 'function', 'org_force_column_defaults(uuid,jsonb)', 'is_org_member'),
    ('core', NULL, 'function', 'org_update_branding(uuid,text,text,text,text,text)', 'is_org_member'),
    -- Carried two overloads in production: a no-argument one this manifest
    -- never listed, and a p_user_id one from before the schema.sql -> core.sql
    -- split that no DROP by exact signature ever reached, so it outlived every
    -- release since. Call sites decided which was stale rather than which was
    -- newer - loadUserModuleDefaults (modulesSlice.ts) calls the no-argument
    -- form and is never invoked from the UI; loadImpersonatedUserContext
    -- (teams.ts), which the admin impersonation feature calls, passes
    -- p_user_id. They are one function now, argument optional and defaulting
    -- to auth.uid(), pinned on the helper that gates asking about somebody
    -- else the same way user_vault_access_list and user_permission_list do.
    ('core', NULL, 'function', 'user_get_module_defaults(uuid)', 'user_require_same_org'),
    -- THE HELPERS THE ROWS ABOVE ARE PINNED ON
    --
    -- `requires` is a substring search of the *caller's* body, so it proves the
    -- caller still names the helper and says nothing whatever about what the
    -- helper does. Eleven rows across this manifest were pinned on six gate
    -- helpers that were not themselves entries, which means a weakened helper
    -- left all eleven reading 'ok' - the manifest reporting a schema verified
    -- against an authorization check that no longer authorized anything. The
    -- sharpest case is file_repair_config_maps, pinned on org_require_member &&
    -- is_org_admin with a comment reasoning that both matter, where only the
    -- first was an entry.
    --
    -- Each helper is pinned on the term that makes it a *membership* test
    -- rather than merely a lookup, so a body that resolved the entity and
    -- forgot to compare it to the caller's organization is stale, not ok.
    -- my_actor_id() is the other half: it is what refuses an
    -- unauthenticated caller before the comparison is reached.
    --
    -- is_auth_required is deliberately absent from this set. It appears in
    -- file_share_link_admit's `requires` below and reads like a seventh helper,
    -- but there is no such function - it is the file_share_link.is_auth_required
    -- column, and that row pins that the admission test still honours it. An
    -- entry for is_auth_required(...) would resolve to nothing and withhold the
    -- stamp for ever, which is the one failure mode this file has now had to be
    -- protected from three times.
    ('core', NULL, 'function', 'is_org_admin()',
      'u.org_id = v_user_org_id && t.org_id = v_user_org_id'),
    ('core', NULL, 'function', 'is_org_admin(uuid)',
      'u.org_id = v_user_org_id && t.org_id = v_user_org_id'),
    ('core', NULL, 'function', 'user_require_same_org(uuid)',
      'my_actor_id && actor.org_id = target.org_id'),
    -- One row per identity: check_schema_release() also reports unknown
    -- overloads while walking the manifest, and a second row for the same
    -- function would report each of those twice. The probe names the newest of
    -- the checks this function has to call, which cannot be present in a build
    -- that predates the others.
    ('core', NULL, 'function', 'verify_and_stamp_schema()',
      'check_unbound_entity_args && check_release_residue && is_org_gate_status_blocking && check_withdrawn_execute && check_definer_search_path'),

    -- 10-source-files.sql - REQUIRED, so probe is NULL
    ('10-source-files', NULL, 'table', 'file', NULL),
    -- Present since v49 and never listed here, which meant a database missing
    -- it verified clean while every empty folder in every vault was invisible.
    ('10-source-files', NULL, 'table', 'folder', NULL),
    -- The two entity gates the rows below are pinned on. See the note beside
    -- is_org_admin() above for why a helper named by a `requires` clause has to
    -- be an entry in its own right.
    -- can_access_vault since 111: membership alone admitted a file in a vault the
    -- caller is not allowed to see.
    ('10-source-files', NULL, 'function', 'file_require_access(uuid)',
      'my_actor_id && u.org_id = v_org_id && can_access_vault'),
    ('10-source-files', NULL, 'function', 'vault_require_access(uuid)',
      'my_actor_id && u.org_id = v_org_id && can_access_vault'),
    ('10-source-files', NULL, 'function', 'custom_properties_merge(jsonb,jsonb)', NULL),
    ('10-source-files', NULL, 'function', 'file_checkin(uuid,text,bigint,text,text,text,text,integer,jsonb,text,text,text)', 'custom_properties_merge && checked_out_file_path'),
    -- Repairs what the pre-87 file_checkin erased, and can only add keys. Both
    -- gates are pinned because they are independent: org_require_member decides
    -- whether the caller is in the organization named, is_org_admin whether an
    -- ordinary member may perform an admin write. A version carrying only the
    -- first would let any member of the organization rewrite its metadata.
    ('10-source-files', NULL, 'function', 'file_repair_config_maps(uuid,jsonb)', 'org_require_member && is_org_admin'),
    -- vault_require_access / my_accessible_vault_ids since 111: these bypass RLS,
    -- so they must apply the vault rule themselves.
    ('10-source-files', NULL, 'function', 'vault_file_list(uuid,uuid)',
      'org_require_member && checked_out_file_path && vault_require_access && my_accessible_vault_ids'),
    ('10-source-files', NULL, 'function', 'vault_file_list_delta(uuid,uuid,timestamptz)',
      'org_require_member && checked_out_file_path && vault_require_access'),
    -- Must stay SECURITY DEFINER and share vault_file_list's predicate exactly -
    -- it exists only so the renderer's cache reconciliation count matches what that
    -- function and vault_file_list_delta return.
    ('10-source-files', NULL, 'function', 'vault_file_count(uuid,uuid)',
      'org_require_member && vault_require_access && my_accessible_vault_ids'),
    -- syncFile's own primary lookup stays byte-exact for speed and only
    -- reaches this, from its 23505 catch, once a differently-cased row has
    -- already proven a collision exists; getFileByPath had no
    -- case-insensitive path at all and calls this on every lookup instead.
    -- It is pinned on vault_require_access rather than org_require_member
    -- because it takes only a vault id and derives the organization from the
    -- vault itself instead of trusting a second argument the caller supplied.
    ('10-source-files', NULL, 'function', 'file_get_active_by_path(uuid,text)', 'vault_require_access'),
    ('10-source-files', NULL, 'function', 'serial_number_get_next(uuid)', 'org_require_member'),
    ('10-source-files', NULL, 'function', 'serial_number_preview_next(uuid)', 'org_require_member'),
    ('10-source-files', NULL, 'function', 'org_update_serialization_settings(uuid,jsonb)', 'org_require_member && is_org_admin'),
    ('10-source-files', NULL, 'function', 'org_get_item_definition_settings(uuid)', 'org_require_member'),
    ('10-source-files', NULL, 'function', 'org_update_item_definition_settings(uuid,jsonb)', 'org_require_member && has_team_permission'),
    ('10-source-files', NULL, 'function', 'item_image_list(uuid)', 'org_require_member'),
    ('10-source-files', NULL, 'function', 'workflow_create_default(uuid)', 'org_require_member && is_org_admin && my_actor_id'),
    -- Resolves the organization from p_file_id. It used to gate on p_org_id and
    -- then insert p_file_id without ever comparing them, so a member of any
    -- organization could mint a working token for another tenant's file.
    ('10-source-files', NULL, 'function', 'file_share_link_create(uuid,uuid,uuid,integer,integer,boolean)', 'file_require_access'),
    -- Both must call file_share_link_admit() rather than restate the conditions.
    --
    -- Pinning 'is_auth_required && is_org_member' on each of them separately was an
    -- attempt to make two hand-written condition lists agree by requiring the
    -- same words in both, and it does not work: v92 satisfied it while consume
    -- spent a download on a file validate refused, because only one of the two
    -- tested that the file still exists and the other's file test sat inside
    -- its is_auth_required branch. Two lists that must agree should be one list.
    ('10-source-files', NULL, 'function', 'file_share_link_admit(text)',
      'is_auth_required && is_org_member && deleted_at'),
    ('10-source-files', NULL, 'function', 'file_share_link_validate(text)', 'file_share_link_admit'),
    ('10-source-files', NULL, 'function', 'file_share_link_consume(text)', 'file_share_link_admit'),
    -- What the holes above produced, on a database that ran an earlier release.
    ('10-source-files', NULL, 'function', 'file_share_link_remediate_cross_tenant()', 'schema_remediation_record'),
    ('10-source-files', NULL, 'function', 'workflow_history_remediate_cross_tenant()', 'schema_remediation_record'),
    -- The dedupe that has to run before folder_vault_id_folder_path_idx can be built
    -- on LOWER(folder_path). `kind` is only 'table' or 'function', so the index
    -- itself cannot be an entry; this is the closest anchor there is, because
    -- the module creates the function, calls it and creates the index in one
    -- block, so the function's presence is what says the block ran.
    ('10-source-files', NULL, 'function', 'folder_remediate_case_collisions()', 'schema_remediation_record'),
    -- Entity-scoped: these resolve the organization from the id they are given
    -- and gate on that. They took no p_org_id, so the old sweep never saw them.
    ('10-source-files', NULL, 'function', 'file_checkout(uuid,text,text,text)', 'file_require_access && checked_out_file_path && has_team_permission'),
    ('10-source-files', NULL, 'function', 'file_move(uuid,text,text)', 'file_require_access'),
    ('10-source-files', NULL, 'function', 'folder_rename(text,text,uuid)', 'vault_require_access && like_pattern_escape'),
    ('10-source-files', NULL, 'function', 'workflow_transition_list_available(uuid)', 'file_require_access'),
    -- Two ids, two checks. file_require_access covers the file; the org_id
    -- comparison is what stops a transition belonging to another tenant's
    -- workflow being applied to it. Pinning only the first is what let the
    -- second go missing in a function this manifest already listed.
    ('10-source-files', NULL, 'function', 'workflow_transition_apply(uuid,uuid,text,jsonb)', 'file_require_access && wtpl.org_id = v_org_id'),
    -- Schema 105: one row per reviewer under one attempt id.
    ('10-source-files', NULL, 'function', 'workflow_transition_execute(uuid,uuid,text)', 'is_org_member && wtpl.org_id = v_file.org_id && gate_reviewer_list_user_ids && v_attempt_id && is_org_file_workflows_enabled'),
    ('10-source-files', NULL, 'function', 'is_org_file_workflows_enabled(uuid)', 'jsonb_typeof'),
    ('10-source-files', NULL, 'function', 'review_stage_get_exit_transition(uuid)', 'review_approved_state_id'),
    ('10-source-files', NULL, 'function', 'workflow_transition_execute_to_legacy_state(uuid,text,text)', 'file_require_access'),
    ('10-source-files', NULL, 'function', 'user_vault_access_list(uuid)', 'user_require_same_org'),
    -- Who may decide a gate, in one place instead of two. gate_review_complete
    -- enforced reviewer identity only for an assigned review, so any member
    -- could approve an unassigned gate through the sanctioned RPC while
    -- gate_review_list_mine - which had the correct rule written out - decided
    -- what to offer them. Both are pinned on the shared helper, so a release
    -- that lets either drift back to its own copy is stale rather than ok.
    -- user_get_effective_role since 105: a 'role' rule compared with the role column
    -- alone hid admin-gated reviews from Administrators-team members.
    ('10-source-files', NULL, 'function', 'can_review_gate(uuid,uuid)',
      'workflow_gate_reviewer && has_user_permission && user_get_effective_role'),
    -- v_attempt_id since 105: approvals counted over every attempt ever made locked
    -- an 'all' gate for good after one rejection. It is the variable the
    -- attempt-wide row lock and the scoped count are taken through.
    ('10-source-files', NULL, 'function', 'gate_review_complete(uuid,review_status,text,jsonb)',
      'is_org_member && can_review_gate && v_attempt_id'),
    ('10-source-files', NULL, 'function', 'gate_review_list_mine()', 'can_review_gate && gate_review_list_awaiting_ids'),
    ('10-source-files', NULL, 'function', 'user_get_effective_role(uuid)', 'is_org_admin'),
    ('10-source-files', NULL, 'function', 'gate_reviewer_list_user_ids(uuid,uuid)', 'user_get_effective_role'),
    ('10-source-files', NULL, 'function', 'gate_review_list_awaiting_ids(uuid)', 'can_review_gate'),
    -- Vault visibility, by the renderer's opt-in rule (schema 111: no grant means
    -- no vault, and the vault must be in the user's organization; `u.org_id =
    -- v.org_id` exists only in that version).
    ('10-source-files', NULL, 'function', 'can_user_access_vault(uuid,uuid)',
      'is_org_admin && team_vault_access && u.org_id = v.org_id'),
    ('10-source-files', NULL, 'function', 'my_accessible_vault_ids()',
      'is_org_admin && team_vault_access && u.org_id = v.org_id'),
    -- The vault storage bucket's read test (schema 111), named by the bucket's
    -- SELECT policy, which lives in the storage schema and is checked by
    -- check_release_residue() rather than here.
    ('10-source-files', NULL, 'function', 'can_read_vault_object(text)',
      'my_accessible_vault_ids && file_version && drawing_pdf_render'),
    ('10-source-files', NULL, 'function', 'can_access_vault(uuid)', 'can_user_access_vault'),
    -- Version-accurate references and the drawing PDF cache (schema 107).
    ('10-source-files', NULL, 'table', 'file_version_reference', NULL),
    ('10-source-files', NULL, 'table', 'drawing_pdf_render', NULL),
    ('10-source-files', NULL, 'function', 'file_version_reference_record(uuid,jsonb)', 'file_require_access && references_recorded_at && nv.version'),
    ('10-source-files', NULL, 'function', 'file_version_reference_list_edges(uuid[],uuid)', 'references_recorded_at'),
    ('10-source-files', NULL, 'function', 'file_version_get_dependency_closure(uuid)', 'file_require_access && file_version_reference_list_edges'),
    ('10-source-files', NULL, 'function', 'drawing_pdf_render_get(uuid)', 'file_require_access'),
    ('10-source-files', NULL, 'function', 'drawing_pdf_render_record(uuid,text,bigint,boolean)', 'file_require_access && is_org_admin'),
    ('10-source-files', NULL, 'function', 'trg_file_comment_check_integrity()', 'parent_id'),

    -- 15-inspection.sql - REQUIRED, so probe is NULL
    ('15-inspection', NULL, 'table', 'inspection_characteristic', NULL),
    ('15-inspection', NULL, 'table', 'inspection_characteristic_version', NULL),

    -- 20-change-control.sql
    ('20-change-control', 'eco', 'table', 'eco_gate_approval', NULL),
    ('20-change-control', 'eco', 'function', 'eco_require_access(uuid)',
      'my_actor_id && u.org_id = v_org_id'),
    ('20-change-control', 'eco', 'function', 'process_template_instantiate(uuid,uuid)', 'eco_require_access && has_team_permission'),
    ('20-change-control', 'eco', 'function', 'eco_gate_approve(uuid,text,text)', 'eco_require_access && has_team_permission'),
    ('20-change-control', 'eco', 'function', 'check_gate_requirements(uuid,text)', 'eco_require_access'),
    -- Review packages (schema 107). The probe stays 'ecos': reviews are part of
    -- this module and installed with it.
    ('20-change-control', 'eco', 'table', 'review_item', NULL),
    ('20-change-control', 'eco', 'table', 'review_round', NULL),
    ('20-change-control', 'eco', 'table', 'review_round_item', NULL),
    ('20-change-control', 'eco', 'table', 'review_decision', NULL),
    ('20-change-control', 'eco', 'function', 'review_require_access(uuid)',
      'my_actor_id && u.org_id = v_org_id'),
    ('20-change-control', 'eco', 'function', 'review_settle(uuid,uuid,boolean)', 'review_notify && withdrawn_at && review_apply_workflow_after_settle'),
    ('20-change-control', 'eco', 'function', 'review_item_list_owed_ids(uuid,uuid)', 'review_decision && withdrawn_at'),
    ('20-change-control', 'eco', 'function', 'review_withdraw_lost_reviewers()', 'can_user_access_vault && review_settle'),
    ('20-change-control', 'eco', 'function', 'trg_review_withdraw_lost_reviewers()', 'review_withdraw_lost_reviewers'),
    ('20-change-control', 'eco', 'function', 'trg_review_item_resettle_on_delete()', 'review_settle && old_items && current_setting'),
    ('20-change-control', 'eco', 'function', 'team_reviewer_list_user_ids(uuid)', 'team_reviewer'),
    ('20-change-control', 'eco', 'function', 'review_notify(uuid,uuid[],uuid,text,text,text,uuid,text)', 'u.org_id = p_org_id'),
    ('20-change-control', 'eco', 'function', 'review_request(uuid[],uuid[],uuid[],text,text,text,text,date)',
      'org_require_member && can_user_access_vault && review_notify'),
    ('20-change-control', 'eco', 'function', 'review_item_respond(uuid,jsonb)',
      'review_require_access && review_item_list_owed_ids && review_settle'),
    ('20-change-control', 'eco', 'function', 'review_approve_all_remaining(uuid,text)',
      'review_require_access && review_item_respond'),
    ('20-change-control', 'eco', 'function', 'review_resubmit(uuid,jsonb,text)',
      'review_require_access && is_org_admin && can_user_access_vault'),
    ('20-change-control', 'eco', 'function', 'review_cancel(uuid,text)', 'review_require_access && is_org_admin'),
    ('20-change-control', 'eco', 'function', 'review_update_meta(uuid,text,date,boolean)', 'review_require_access && is_org_admin'),
    ('20-change-control', 'eco', 'function', 'review_list_queue(text,uuid,text,integer,text)',
      'org_require_member && gate_review_list_awaiting_ids'),
    ('20-change-control', 'eco', 'function', 'review_get_detail(uuid)', 'review_require_access'),
    ('20-change-control', 'eco', 'function', 'review_list_open_for_files(uuid[])', 'org_require_member && is_org_admin'),
    ('20-change-control', 'eco', 'function', 'review_item_add(uuid,uuid[])',
      'review_require_access && is_org_admin && can_user_access_vault && review_settle'),
    ('20-change-control', 'eco', 'function', 'review_item_remove(uuid,uuid[])',
      'review_require_access && is_org_admin && set_config && review_settle'),
    ('20-change-control', 'eco', 'function', 'review_advance_items(uuid,boolean)',
      'review_stage_get_exit_transition && workflow_transition_apply && current_version'),
    ('20-change-control', 'eco', 'function', 'review_apply_workflow_after_settle(uuid,text)',
      'is_org_file_workflows_enabled && review_advance_items'),
    ('20-change-control', 'eco', 'function', 'review_advance_files(uuid,boolean)',
      'review_require_access && is_org_admin && is_org_file_workflows_enabled && review_advance_items'),
    ('20-change-control', 'eco', 'function', 'review_get_workflow_status(uuid)',
      'review_require_access && review_stage_get_exit_transition'),
    ('20-change-control', 'eco', 'function', 'review_count_badge()', 'is_org_member && gate_review_list_awaiting_ids'),
    ('20-change-control', 'eco', 'function', 'trg_file_comment_link_review()', 'review_response'),
    ('20-change-control', 'eco', 'function', 'review_notify_overdue()', 'review_response'),

    -- 30-supply-chain.sql
    ('30-supply-chain', 'rfq', 'table', 'rfq_number_counter', NULL),
    ('30-supply-chain', 'rfq', 'function', 'rfq_generate_number(uuid)', 'org_require_member'),
    -- A view, so it has no RLS of its own. to_regclass resolves views as well
    -- as tables; whether it is security_invoker and whether anon can read it
    -- are check_anon_reach()'s business.
    ('30-supply-chain', 'rfq', 'table', 'part_with_pricing', NULL),

    -- 40-integrations.sql
    ('40-integrations', 'webhook', 'table', 'integration_credential', NULL),
    -- Trigger-only; its protection is its ACL, which verify-schema.sql checks.
    ('40-integrations', 'webhook', 'function', 'pending_license_assignment_apply(uuid)', 'user_get_verified_email'),
    -- The assignee arm of the solidworks_license SELECT policy (schema 106).
    -- SECURITY DEFINER so that policy can read the assignments without the
    -- assignment policies, which read solidworks_license, recursing.
    ('40-integrations', 'webhook', 'function', 'my_solidworks_license_ids()', 'auth.uid'),
    -- Both hand-wrote the membership test out of auth.uid(). Correct, and the
    -- reason check_org_gates() had to treat auth.uid() as evidence of a gate -
    -- which is what let a function with no authorization at all be certified.
    ('40-integrations', 'webhook', 'function', 'org_get_google_drive_settings(uuid)', 'org_require_member'),
    ('40-integrations', 'webhook', 'function', 'org_update_google_drive_settings(uuid,text,text,boolean,text)', 'org_require_member && is_org_admin'),

    -- 50-extensions.sql
    ('50-extensions', 'org_installed_extension', 'table', 'org_installed_extension', NULL)
  ) AS m(module, probe, kind, identity, requires);

-- ===========================================
-- WHAT A CLOSED HOLE LEFT BEHIND
-- ===========================================
-- CLOSING A HOLE AND REVOKING WHAT IT PRODUCED
--
-- Every release up to 92 was verified against a fresh install, so nothing had
-- ever asked a release whether it cleans up after itself. It does not, and a
-- fresh install cannot show that: there is no history for the fix to fail to
-- undo. Applied over a database that had run v90 and been attacked, v92 left a
-- share link minted by a member of one organization for another organization's
-- file still answering is_valid: true to an unauthenticated caller, and
-- file_share_link_consume still spending downloads against it. It survives BECAUSE
-- of the fix - file_share_link_validate now resolves the organization from the file,
-- and the file genuinely is in that organization - and verification returned
-- stamped: true with all of it in place.
--
-- The general shape, which is worth naming because this will happen again: a
-- security fix changes what the code will do next time. It does not change what
-- the data records from what the code already did. A credential a hole minted
-- outlives the hole, and so does a disclosure the hole performed.
--
-- The place where the two should always travel together is here, in the release
-- manifest, which until now only described objects. It has a second half now:
--
--   schema_get_release_manifest()  what the code must BE
--   check_release_residue()    what the data must no longer CONTAIN
--
-- Both are read by verify_and_stamp_schema() and both withhold the stamp. So a
-- release that closes a hole and forgets the remediation cannot be recorded:
-- verification names the residue and refuses, on the databases that have it and
-- on no others. A fresh install has none and is unaffected.
--
-- The remediations themselves run from the module that owns the data, at the
-- end of the file, next to anon_enforce_execute_posture() - so applying the
-- schema performs them and there is no separate script to remember. They are
-- idempotent, they deactivate and redact rather than delete, and they copy
-- every row they touch into the ledger below verbatim first, so nothing an
-- auditor might want is destroyed by the act of cleaning up.
CREATE TABLE schema_remediation_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  remediation TEXT NOT NULL,
  release INTEGER NOT NULL,
  ran_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ran_by TEXT DEFAULT CURRENT_USER NOT NULL,
  rows_acted_on INTEGER NOT NULL,
  -- The rows as they were, before anything was changed. This is the reason the
  -- remediations are allowed to redact: the original is still here, and it is
  -- here in the one place no tenant can read.
  subjects JSONB DEFAULT '[]'::jsonb NOT NULL,
  detail TEXT
);

-- RLS on with no policies at all, deliberately.
--
-- Every other table in this schema is scoped to an organization. This one is
-- not scopeable: a cross-tenant row names two organizations and belongs to
-- neither, so there is no tenant it could be shown to without disclosing the
-- other. RLS enabled and no policy means nothing reaches it over PostgREST
-- under any role, while the operator reads it from the SQL editor as postgres,
-- which holds BYPASSRLS. That is the correct audience for it.

CREATE INDEX schema_remediation_log_ran_at_idx ON schema_remediation_log (ran_at DESC);

ALTER TABLE schema_remediation_log ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- ORGANIZATIONS
-- ===========================================
CREATE TABLE organization (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  email_domains TEXT[] DEFAULT '{}'::text[] NOT NULL,
  settings JSONB DEFAULT '{"column_defaults": [], "max_file_size_mb": 500, "require_checkout": true, "allowed_extensions": [], "part_number_digits": 5, "part_number_prefix": "BR-", "require_description": false, "enforce_email_domain": false, "auto_increment_part_numbers": true, "require_approval_for_release": true, "allow_file_level_revision_for_models": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Company branding
  logo_url TEXT,
  logo_storage_path TEXT,
  -- Company address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'USA'::text,
  -- Company contact
  phone TEXT,
  website TEXT,
  contact_email TEXT,
  -- Module configuration defaults
  module_defaults JSONB,
  -- Timestamp when module_defaults was force-pushed to all users
  module_defaults_forced_at TIMESTAMPTZ,
  -- Timestamp when column_defaults was force-pushed to all users
  column_defaults_forced_at TIMESTAMPTZ,
  -- Auth provider settings
  auth_providers JSONB DEFAULT '{"users": {"email": true, "phone": true, "google": true}, "suppliers": {"email": true, "phone": true, "google": true}}'::jsonb,
  -- Default team for org code signups
  default_new_user_team_id UUID
);

-- ===========================================
-- RLS FOR CORE TABLES
-- ===========================================

-- 5.0 (audit S7): the organization's default team for new users is a real
-- foreign key; deleting the team clears the default.

CREATE INDEX organization_email_domains_idx ON organization USING gin (email_domains);

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- USERS
-- ===========================================
CREATE TABLE app_user (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  custom_avatar_url TEXT,
  job_title TEXT,
  org_id UUID REFERENCES organization(id) ON DELETE SET NULL,
  role user_role DEFAULT 'engineer'::user_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ,
  last_online_at TIMESTAMPTZ,
  column_defaults JSONB
);

CREATE INDEX app_user_org_id_idx ON app_user (org_id);
CREATE INDEX app_user_email_idx ON app_user (email);

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- BLOCKED USERS
-- ===========================================
CREATE TABLE blocked_user (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  blocked_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  CONSTRAINT blocked_user_org_id_email_key UNIQUE (org_id, email)
);

CREATE INDEX blocked_user_org_id_idx ON blocked_user (org_id);
CREATE INDEX blocked_user_email_idx ON blocked_user (email);

ALTER TABLE blocked_user ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- TEAMS
-- ===========================================
CREATE TABLE team (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6'::text NOT NULL,
  icon TEXT DEFAULT 'Users'::text NOT NULL,
  parent_team_id UUID REFERENCES team(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  is_default BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  module_defaults JSONB,
  CONSTRAINT team_org_id_name_key UNIQUE (org_id, name)
);

-- RLS for teams

-- ===========================================
-- ENABLE REALTIME
-- ===========================================

CREATE INDEX team_org_id_idx ON team (org_id);
CREATE INDEX team_parent_team_id_idx ON team (parent_team_id);

ALTER TABLE team ENABLE ROW LEVEL SECURITY;
ALTER TABLE team REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE team;

ALTER TABLE organization ADD CONSTRAINT organization_default_new_user_team_id_fkey
  FOREIGN KEY (default_new_user_team_id) REFERENCES team(id) ON DELETE SET NULL;

-- ===========================================
-- TEAM MEMBERS
-- ===========================================
CREATE TABLE team_member (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  is_team_admin BOOLEAN DEFAULT false,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES app_user(id),
  CONSTRAINT team_member_team_id_user_id_key UNIQUE (team_id, user_id)
);

CREATE INDEX team_member_team_id_idx ON team_member (team_id);
CREATE INDEX team_member_user_id_idx ON team_member (user_id);

ALTER TABLE team_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_member REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE team_member;

-- ===========================================
-- TEAM REVIEWERS
-- ===========================================
CREATE TABLE team_reviewer (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  reviewer_type TEXT NOT NULL CHECK ((reviewer_type = ANY (ARRAY['user'::text, 'workflow_role'::text]))),
  user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
  workflow_role_id UUID,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES app_user(id)
);

CREATE INDEX team_reviewer_team_id_idx ON team_reviewer (team_id);

ALTER TABLE team_reviewer ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- TEAM PERMISSIONS
-- ===========================================
CREATE TABLE team_permission (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  vault_id UUID,
  actions permission_action[] DEFAULT '{}'::permission_action[],
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id)
);

-- 5.0 (audit S7): core tables whose vault and workflow-role columns were plain
-- UUIDs while the modules were optional. A permission row for a deleted vault,
-- or a reviewer entry for a deleted workflow role, goes with it.

CREATE INDEX team_permission_team_id_idx ON team_permission (team_id);
CREATE INDEX team_permission_resource_idx ON team_permission (resource);

ALTER TABLE team_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_permission REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE team_permission;

-- ===========================================
-- PERMISSION PRESETS
-- ===========================================
CREATE TABLE permission_preset (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1'::text,
  icon TEXT DEFAULT 'Shield'::text,
  permissions JSONB DEFAULT '{}'::jsonb,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  CONSTRAINT permission_preset_org_id_name_key UNIQUE (org_id, name)
);

CREATE INDEX permission_preset_org_id_idx ON permission_preset (org_id);

ALTER TABLE permission_preset ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- USER PERMISSIONS (Individual overrides)
-- ===========================================
CREATE TABLE user_permission (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  vault_id UUID,
  actions permission_action[] DEFAULT '{}'::permission_action[],
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id)
);

CREATE INDEX user_permission_user_id_idx ON user_permission (user_id);
CREATE INDEX user_permission_resource_idx ON user_permission (resource);

ALTER TABLE user_permission ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- MODULE ACCESS (Sidebar module allowlist)
-- ===========================================
-- Controls which teams / individual users may see a sidebar module.
--
-- This is deliberately an ALLOWLIST WITH AN OPEN DEFAULT, not a permission
-- grant: a module with no rows here is visible to the whole org. Only once an
-- admin adds a subject does the module become restricted to exactly the listed
-- teams and users (plus org admins). Modelling it as a normal team_permission
-- resource would have meant every existing team needing an explicit 'view'
-- grant before it could see anything, so restricting one module would have
-- silently hidden all the others.
--
-- module_id is the module or extension workspace id (a ModuleId from
-- src/types/modules.ts, or an extension workspace id such as 'customers'), NOT
-- the 'module:customers' resource string used by team_permission.
CREATE TABLE module_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  team_id UUID REFERENCES team(id) ON DELETE CASCADE,
  user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES app_user(id),
  CONSTRAINT module_access_check CHECK (((team_id IS NULL) <> (user_id IS NULL)))
);

CREATE INDEX module_access_org_id_module_id_idx ON module_access (org_id, module_id);
CREATE UNIQUE INDEX module_access_org_id_module_id_team_id_idx ON module_access (org_id, module_id, team_id) WHERE (team_id IS NOT NULL);
CREATE UNIQUE INDEX module_access_org_id_module_id_user_id_idx ON module_access (org_id, module_id, user_id) WHERE (user_id IS NOT NULL);

ALTER TABLE module_access ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- JOB TITLES
-- ===========================================
CREATE TABLE job_title (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6b7280'::text,
  icon TEXT DEFAULT 'User'::text,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  CONSTRAINT job_title_org_id_name_key UNIQUE (org_id, name)
);

CREATE INDEX job_title_org_id_idx ON job_title (org_id);

ALTER TABLE job_title ENABLE ROW LEVEL SECURITY;

CREATE TABLE user_job_title (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
  title_id UUID NOT NULL REFERENCES job_title(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES app_user(id)
);

CREATE INDEX user_job_title_user_id_idx ON user_job_title (user_id);
CREATE INDEX user_job_title_title_id_idx ON user_job_title (title_id);

ALTER TABLE user_job_title ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- PENDING ORG MEMBERS (Invitations)
-- ===========================================
CREATE TABLE pending_org_member (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role DEFAULT 'engineer'::user_role,
  team_ids UUID[] DEFAULT '{}'::uuid[],
  vault_ids UUID[] DEFAULT '{}'::uuid[],
  workflow_role_ids UUID[] DEFAULT '{}'::uuid[],
  notes TEXT,
  invited_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (now() + '30 days'::interval),
  claimed_at TIMESTAMPTZ,
  claimed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  CONSTRAINT pending_org_member_org_id_email_key UNIQUE (org_id, email)
);

-- ===========================================
-- PENDING USER LICENSE ASSIGNMENTS
-- ===========================================

CREATE INDEX pending_org_member_org_id_idx ON pending_org_member (org_id);
CREATE INDEX pending_org_member_email_idx ON pending_org_member (email);

ALTER TABLE pending_org_member ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- ADMIN RECOVERY CODES
-- ===========================================
CREATE TABLE admin_recovery_code (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  used_from_ip TEXT,
  is_revoked BOOLEAN DEFAULT false,
  revoked_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);

CREATE INDEX admin_recovery_code_org_id_idx ON admin_recovery_code (org_id);

ALTER TABLE admin_recovery_code ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- USER SESSIONS
-- ===========================================
CREATE TABLE user_session (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  machine_id TEXT NOT NULL,
  machine_name TEXT,
  platform TEXT,
  os_version TEXT,
  app_version TEXT,
  is_active BOOLEAN DEFAULT true,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_session_user_id_machine_id_key UNIQUE (user_id, machine_id)
);

CREATE INDEX user_session_user_id_idx ON user_session (user_id);
CREATE INDEX user_session_org_id_idx ON user_session (org_id);
CREATE INDEX user_session_last_seen_at_idx ON user_session (last_seen_at);
CREATE INDEX user_session_is_active_idx ON user_session (is_active);

ALTER TABLE user_session ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- NOTIFICATIONS (Generic - Module Agnostic)
-- ===========================================
CREATE TABLE notification (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  -- Notification type and category
  type TEXT NOT NULL,
  category TEXT,
  -- Content
  title TEXT NOT NULL,
  message TEXT,
  priority TEXT DEFAULT 'normal'::text,
  -- Generic entity reference (replaces module-specific FKs)
  entity_type TEXT,
  entity_id UUID,
  -- Sender
  from_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  -- Action
  action_url TEXT,
  action_type TEXT,
  is_action_completed BOOLEAN DEFAULT false,
  action_completed_at TIMESTAMPTZ,
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX notification_user_id_idx ON notification (user_id);
CREATE INDEX notification_org_id_idx ON notification (org_id);
CREATE INDEX notification_user_id_is_read_idx ON notification (user_id, is_read) WHERE (is_read = false);
CREATE INDEX notification_entity_type_entity_id_idx ON notification (entity_type, entity_id);

ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE notification;

-- ===========================================
-- COLOR SWATCHES (Personal and organization preferences)
-- ===========================================
CREATE TABLE color_swatch (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  name TEXT,
  color TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT color_swatch_scope_check CHECK ((((user_id IS NOT NULL) AND (org_id IS NULL)) OR ((user_id IS NULL) AND (org_id IS NOT NULL))))
);

CREATE INDEX color_swatch_user_id_idx ON color_swatch (user_id);
CREATE INDEX color_swatch_org_id_idx ON color_swatch (org_id);

ALTER TABLE color_swatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE color_swatch REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE color_swatch;


-- ===========================================
-- FUNCTIONS, VIEWS, TRIGGERS AND POLICIES
-- ===========================================

-- ===========================================
-- RELEASE MANIFEST
-- ===========================================
-- The single place the release number lives, and the single place that says
-- what a database must contain to be allowed to claim it.
CREATE OR REPLACE FUNCTION schema_release_version() RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$ SELECT 500 $$;

-- Must equal VERSION_DESCRIPTIONS[500] in src/lib/schemaVersion.ts.
CREATE OR REPLACE FUNCTION schema_release_description() RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$ SELECT
  'BluePLM 5.0: one clean schema with consistent names (singular tables such as organization, app_user, file and file_version; org_ prefixes; <entity>_<verb> functions), upgraded from 112 in place by migrations/0500_from_4x.sql. From 5.0 on, the desktop app applies the database SQL itself: an organization admin gives the database connection once, the app runs the numbered migrations in supabase/migrations under an advisory lock, each in its own transaction, records them in schema_migration with a checksum, and verifies. client_min_version() names the oldest app allowed to connect; older 5.x apps update before they continue.'::text
$$;

-- The oldest app allowed to connect to this database. A 5.x app below it shows
-- a blocking "update required" screen and installs the update before it goes on
-- (src/features/dbUpgrade). Readable before sign-in, so it is on
-- anon_get_execute_allowlist(). Raise it in a numbered migration.
CREATE OR REPLACE FUNCTION client_min_version() RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$ SELECT '5.0.0'::text $$;

CREATE OR REPLACE FUNCTION schema_get_release_manifest()
RETURNS TABLE (module TEXT, probe TEXT, kind TEXT, identity TEXT, requires TEXT)
LANGUAGE sql STABLE AS $$
  SELECT e.module, e.probe, e.kind, e.name, e.requires
  FROM schema_manifest_entry e
  ORDER BY e.since_version, e.module, e.kind, e.name;
$$;

-- Record that a remediation acted, and say out loud what it acted on.
--
-- Silence is the failure mode that matters here. A remediation that quietly
-- deactivates a share link leaves somebody's link broken with no explanation
-- and no way to find out which, so every call prints the subjects by name as it
-- runs and stores them for afterwards. Nothing is written when a remediation
-- found nothing to do, which is what keeps re-running a module from filling the
-- ledger with rows saying no.
CREATE OR REPLACE FUNCTION schema_remediation_record(
  p_name TEXT,
  p_rows INTEGER,
  p_subjects JSONB,
  p_detail TEXT
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(p_rows, 0) = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO schema_remediation_log (remediation, release, rows_acted_on, subjects, detail)
  VALUES (p_name, schema_release_version(), p_rows, COALESCE(p_subjects, '[]'::jsonb), p_detail);

  RAISE WARNING E'REMEDIATION % acted on % row(s): %\n  The rows as they were are in schema_remediation_log. %',
    p_name, p_rows, COALESCE(p_subjects, '[]'::jsonb)::text, COALESCE(p_detail, '');

  RETURN p_rows;
END;
$$;

-- Quote a value so that LIKE treats it as text rather than as a pattern.
--
-- folder_rename() builds `LOWER(file_path) LIKE LOWER(prefix) || '/%'`.
-- A folder whose name contains % or _ therefore matched paths the caller never
-- named: a user with a folder called `100%` renamed it and rewrote the path of
-- an unrelated file of their own. It is confined to the caller's own
-- organization and vault by the gates around it, so it is a correctness bug
-- rather than a way out of the tenant - but a prefix that is user-supplied text
-- being fed to LIKE as a pattern is the general shape, and the general shape is
-- worth having one answer to.
--
-- Backslash first, or the escapes added afterwards get escaped in turn.
-- Callers must pair this with ESCAPE '\', which is also LIKE's default; naming
-- it is what keeps the pairing visible at the call site.
CREATE OR REPLACE FUNCTION like_pattern_escape(p_text TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Return a function's source with comments and string literals removed, so that
-- a `requires` substring test is answered by code and not by prose.
--
-- The manifest's whole purpose is to notice that an authorization check went
-- missing, and `position('org_require_member' IN pg_get_functiondef(oid))`
-- cannot tell the call from a note about the call. Both of these passed:
--
--   -- this used to call org_require_member(p_org_id) and no longer does
--   RAISE NOTICE 'org_require_member';
--
-- A regex cannot do this reliably - a comment may contain an apostrophe and a
-- literal may contain a double dash - so this walks the string once, tracking
-- which of the four states it is in. Dollar-quoted sections are kept: the
-- function body itself arrives dollar-quoted from pg_get_functiondef, and
-- dropping it would leave nothing to test.
--
-- It closes the cheap half of the hole. A check inside `IF false THEN` is still
-- code and still passes; check_org_gates() below is what catches that, by
-- calling the function and seeing whether it actually refuses.
CREATE OR REPLACE FUNCTION sql_strip_noise(p_src TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_out TEXT := '';
  v_len INTEGER := length(p_src);
  i INTEGER := 1;
  c TEXT;
  c2 TEXT;
  v_state TEXT := 'normal';   -- normal | line | block | quote
  v_depth INTEGER := 0;       -- block comment nesting
BEGIN
  WHILE i <= v_len LOOP
    c := substr(p_src, i, 1);
    c2 := substr(p_src, i, 2);

    IF v_state = 'normal' THEN
      IF c2 = '--' THEN
        v_state := 'line'; i := i + 2; CONTINUE;
      ELSIF c2 = '/*' THEN
        v_state := 'block'; v_depth := 1; i := i + 2; CONTINUE;
      ELSIF c = '''' THEN
        v_state := 'quote'; i := i + 1; CONTINUE;
      ELSE
        v_out := v_out || c; i := i + 1; CONTINUE;
      END IF;

    ELSIF v_state = 'line' THEN
      IF c = E'\n' THEN
        v_state := 'normal'; v_out := v_out || c;
      END IF;
      i := i + 1; CONTINUE;

    ELSIF v_state = 'block' THEN
      IF c2 = '/*' THEN
        v_depth := v_depth + 1; i := i + 2; CONTINUE;
      ELSIF c2 = '*/' THEN
        v_depth := v_depth - 1; i := i + 2;
        IF v_depth = 0 THEN v_state := 'normal'; END IF;
        CONTINUE;
      END IF;
      i := i + 1; CONTINUE;

    ELSE -- quote
      IF c2 = '''''' THEN
        i := i + 2; CONTINUE;          -- '' is an escaped quote, still inside
      ELSIF c = '''' THEN
        v_state := 'normal'; i := i + 1; CONTINUE;
      END IF;
      i := i + 1; CONTINUE;
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;

-- Evaluate the manifest. One row per requirement, status 'ok', 'missing',
-- 'stale', 'extra' or 'skipped'. Read-only, so it is safe to run at any time.
CREATE OR REPLACE FUNCTION check_schema_release()
RETURNS TABLE (module TEXT, identity TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  m RECORD;
  v_oid OID;
  v_src TEXT;
  v_missing TEXT;
  v_extra RECORD;
BEGIN
  FOR m IN SELECT * FROM schema_get_release_manifest() LOOP
    IF m.probe IS NOT NULL AND to_regclass('public.' || m.probe) IS NULL THEN
      module := m.module; identity := m.identity; status := 'skipped';
      detail := 'module not installed';
      RETURN NEXT;
      CONTINUE;
    END IF;

    module := m.module;
    identity := m.identity;

    IF m.kind = 'table' THEN
      IF to_regclass('public.' || m.identity) IS NULL THEN
        status := 'missing'; detail := 'table does not exist';
      ELSE
        status := 'ok'; detail := NULL;
      END IF;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- to_regprocedure returns NULL rather than raising for an unknown signature
    v_oid := to_regprocedure('public.' || m.identity);

    IF v_oid IS NULL THEN
      status := 'missing'; detail := 'function does not exist';
    ELSIF m.requires IS NOT NULL THEN
      v_src := sql_strip_noise(pg_get_functiondef(v_oid));

      -- ' && ' separates substrings that must ALL be present.
      --
      -- One requirement per function stopped being enough as soon as a function
      -- had two properties worth pinning. workflow_transition_apply gates its
      -- file with file_require_access and binds its transition with an org_id
      -- comparison; naming only the first is what let the second be absent from
      -- a function this manifest already listed and reported ok.
      SELECT string_agg(t, ' and ') INTO v_missing
      FROM unnest(string_to_array(m.requires, ' && ')) AS t
      WHERE position(t IN v_src) = 0;

      IF v_missing IS NOT NULL THEN
        status := 'stale';
        detail := 'function exists but does not reference ' || v_missing
               || ' - an older copy of this module is installed';
      ELSE
        status := 'ok'; detail := NULL;
      END IF;
    ELSE
      status := 'ok'; detail := NULL;
    END IF;

    RETURN NEXT;

    -- An overload the manifest does not know about is a finding in its own
    -- right. Modules drop a function by its exact signature before re-creating
    -- it, so a previous release's version with a different argument list is not
    -- dropped - it sits alongside the current one, ungated, and the manifest
    -- looking only at the signature it expects reports 'ok'. PostgREST picks an
    -- overload by the argument *names* in the request body, so a client can ask
    -- for the old one by name and get it.
    FOR v_extra IN
      SELECT p.oid::regprocedure::TEXT AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = split_part(m.identity, '(', 1)
        AND p.oid <> v_oid
        AND NOT EXISTS (
          SELECT 1 FROM schema_get_release_manifest() m2
          WHERE m2.kind = 'function'
            AND to_regprocedure('public.' || m2.identity) = p.oid
        )
      ORDER BY 1
    LOOP
      module := m.module;
      identity := v_extra.signature;
      status := 'extra';
      detail := 'an overload of ' || split_part(m.identity, '(', 1)
             || ' that this release does not define - almost certainly a previous '
             || 'release''s copy that DROP ... (exact signature) did not remove. '
             || 'Drop it: DROP FUNCTION public.' || v_extra.signature || ';';
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

-- A value of the given type that a function has some chance of accepting.
--
-- check_org_gates() passes one of these for every argument except the
-- organization id. It exists because the probe used to pass NULL for all of
-- them, which meant a function whose first act is `IF p_name IS NULL THEN RAISE`
-- was scored "gated" without its organization check ever executing. The point
-- of the probe is to reach the gate, and it cannot reach the gate through an
-- argument validation that fires first.
--
-- These are values, not fixtures: a random uuid selects no row, an empty jsonb
-- carries no keys. Every probe call is made inside a subtransaction that is
-- always rolled back, so a function that does accept them changes nothing.
-- Anything not listed falls back to NULL, which is the old behaviour and is
-- reported as inconclusive if the function then trips over it.
CREATE OR REPLACE FUNCTION probe_get_literal(p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_base TEXT := lower(btrim(p_type));
BEGIN
  -- Arrays: the empty array is always well typed and always selects nothing.
  IF v_base LIKE '%[]' THEN
    RETURN format('%L::%s', '{}', v_base);
  END IF;

  RETURN CASE
    WHEN v_base IN ('uuid') THEN quote_literal(gen_random_uuid()::text) || '::uuid'
    WHEN v_base IN ('text', 'character varying', 'varchar', 'name', 'citext', 'char', 'character')
      THEN quote_literal('blueplm_gate_probe') || '::' || v_base
    WHEN v_base IN ('smallint', 'integer', 'bigint', 'int2', 'int4', 'int8',
                    'numeric', 'real', 'double precision', 'float4', 'float8')
      THEN '1::' || v_base
    WHEN v_base = 'boolean' THEN 'false'
    WHEN v_base IN ('json', 'jsonb') THEN quote_literal('{}') || '::' || v_base
    WHEN v_base IN ('date', 'timestamp without time zone', 'timestamp with time zone',
                    'timestamp', 'timestamptz')
      THEN 'now()::' || v_base
    WHEN v_base = 'interval' THEN quote_literal('0') || '::interval'
    -- Enums: any label is as good as another, and there is no safe generic
    -- guess, so take the first one the type declares.
    WHEN EXISTS (SELECT 1 FROM pg_type t WHERE t.oid = to_regtype(v_base) AND t.typtype = 'e')
      THEN quote_literal((SELECT e.enumlabel FROM pg_enum e
                           WHERE e.enumtypid = to_regtype(v_base)
                           ORDER BY e.enumsortorder LIMIT 1)) || '::' || v_base
    ELSE 'NULL::' || v_base
  END;
END;
$$;

-- The same question, asked with the function in front of you.
--
-- probe_get_literal() answers from the type alone, so every text argument gets
-- 'blueplm_gate_probe'. No argument validation anywhere accepts that string,
-- which makes it easy for a function to refuse the probe for a reason that has
-- nothing to do with authorization - and the probe's whole purpose is to reach
-- the gate and watch it fire. A function whose first statement is
--
--   IF p_image_type NOT IN ('icon', 'image') THEN RAISE EXCEPTION ...
--
-- never executes another line while being probed, so the behavioural half of
-- check_org_gates()'s conjunction is satisfied by an argument check and the
-- source half carries the verdict alone. Reading the source alone is what the
-- release before last did, and it certified a gate written inside `IF false`.
--
-- Where the function itself says which values it will take, take one of them.
-- The literals are read from the raw source rather than from sql_strip_noise()'s
-- output for the obvious reason that this is the one caller that wants the
-- string literals kept. A literal quoted in a comment could mislead it; the
-- consequence is a probe argument that is merely as bad as the old default.
--
-- NOT IN is deliberately not used as a source of values: it says what the
-- function refuses, and 'blueplm_gate_probe' is already outside any such list.
CREATE OR REPLACE FUNCTION probe_get_literal_for_arg(p_oid OID, p_arg TEXT, p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_base TEXT := lower(btrim(p_type));
  v_src TEXT;
  v_lit TEXT;
BEGIN
  -- Only text-shaped arguments. A uuid or an integer has no vocabulary to read
  -- off, and enums are already handled by label in probe_get_literal().
  IF p_arg IS NULL
     OR v_base NOT IN ('text', 'character varying', 'varchar', 'name', 'citext',
                       'char', 'character') THEN
    RETURN probe_get_literal(p_type);
  END IF;

  SELECT lower(regexp_replace(p.prosrc, '\s+', ' ', 'g')) INTO v_src
  FROM pg_proc p WHERE p.oid = p_oid;

  IF v_src IS NULL THEN
    RETURN probe_get_literal(p_type);
  END IF;

  -- x IN ('a', ...), but not x NOT IN ('a', ...). Captured rather than excluded
  -- with a lookbehind so the intent is legible in the pattern.
  SELECT m[2] INTO v_lit
  FROM regexp_matches(v_src, '(not +)?\m' || p_arg || '\M *in *\( *''([^'']*)''', 'g') AS m
  WHERE m[1] IS NULL
  LIMIT 1;

  -- x = 'a', and 'a' = x.
  IF v_lit IS NULL THEN
    v_lit := (regexp_match(v_src, '\m' || p_arg || '\M *= *''([^'']*)'''))[1];
  END IF;
  IF v_lit IS NULL THEN
    v_lit := (regexp_match(v_src, '''([^'']*)'' *= *\m' || p_arg || '\M'))[1];
  END IF;

  IF v_lit IS NULL OR v_lit = '' THEN
    RETURN probe_get_literal(p_type);
  END IF;

  RETURN quote_literal(v_lit) || '::' || v_base;
END;
$$;

-- Call every org-scoped RPC with an organization id the caller has nothing to do
-- with, and report the ones that do not refuse.
--
-- Reading the source for the string 'org_require_member' proves that the words
-- are present, not that they run. A check inside `IF false THEN ... END IF;`
-- survives comment-stripping and satisfies the manifest, and so would a call
-- placed after the work it is supposed to guard. This asks the function instead.
--
-- Each call is made inside a subtransaction that is always rolled back, so a
-- function that fails to refuse does not get to keep whatever it did. The
-- rollback is forced by raising a sentinel immediately after the call returns;
-- catching the sentinel is precisely the signal that no gate fired.
--
-- Run this as a role with no JWT - the Supabase SQL editor connects as postgres,
-- where auth.uid() is NULL - so org_require_member() raises 'Not authenticated'
-- and the probe never depends on inventing a plausible organization id.
--
-- Refusal takes two forms here and both count. Most functions raise; the older
-- ones return `{"success": false, "error": ...}` or, if they return a set, the
-- empty set. What is being looked for is a function that goes ahead and answers.
--
-- A gate placed after the work it guards reads as gated, and that is right: the
-- raise aborts the statement, so neither the writes nor the rows reach the
-- caller. It is fragile rather than broken.
--
-- Scope is the p_org_id class, where the organization is an argument and the
-- call can be synthesized. Functions that reach an organization through an
-- entity id are covered by check_unbound_entity_args() and by the manifest's
-- `requires` column instead, because probing those would mean creating a
-- foreign file to aim at.
--
-- TWO THINGS THIS VERSION DOES DIFFERENTLY, AND WHY
--
-- It used to fill every argument but p_org_id with NULL, and accept any P0001
-- or any returned {"success": false} as a refusal. Both halves of that were
-- wrong in the same direction: a function that validates some *other* argument
-- first refuses the probe, is scored gated, and is never asked the question the
-- probe exists to ask. Two functions with no authorization of any kind in them
-- were scored gated and stamped, and then read another organization's data.
--
-- So: the other arguments are filled with values a function can get past -
-- probe_get_literal_for_arg() below, which reads the function's own vocabulary
-- where it has one - which is what lets execution reach the gate; and a refusal
-- is only credited when it can be *attributed* to an authorization check,
-- meaning the function's own source calls one. The two tests are a conjunction
-- and each covers the other's blind spot:
--
--   a check inside `IF false THEN`  -> source has it, behaviour answers -> ungated
--   a NOT NULL violation, no gate   -> behaviour refuses, source has none -> ungated
--
-- Neither test alone would catch both, and reading the source alone is what the
-- release before last did.
--
-- AND ATTRIBUTION IS EXACTLY AS GOOD AS ITS TOKEN LIST
--
-- The conjunction is only as strong as what the source half counts. It counted
-- `auth.uid()`, which is who is asking and not whether they may, so a function
-- with no authorization whatsoever - one line, `v_actor UUID := auth.uid();` -
-- was scored gated, stamped, and read another tenant's parts over HTTP. It
-- counted `is_org_admin()` too, which is a real check about the wrong
-- organization. See c_gate_binding below for what is left and why, and for the
-- ten RPCs that had to change so that removing them cost nothing true.

-- WHY A FUNCTION IS NOT PROBED, DECIDED FROM THE ACL AND NOT FROM A LIST
--
-- check_org_gates() used to carry two hardcoded arrays of names it skipped.
-- One of them, c_trigger_only, was described as "only ever called by a
-- trigger", and it held seed_customer_categories - a SECURITY DEFINER function
-- that anyone with a login could call over PostgREST against any organization,
-- for as long as the array said not to look. The claim was about how the
-- function is *called*; what mattered was who is *allowed* to call it, and
-- nothing checked that.
--
-- So the question is asked of the database instead:
--
--   'predicate' - one of the two gates the other functions are gated BY.
--                 Probing a gate for a refusal has no failing answer, so this
--                 exemption is about the shape of the question, not the ACL.
--                 posture-checks.sql exercises both directly.
--   'withdrawn' - no PostgREST role may execute it. It cannot be handed a
--                 foreign organization id because it cannot be called at all.
--   NULL        - probe it.
--
-- 'withdrawn' is the important one: it lasts exactly as long as the ACL does.
-- Grant the function back to anon or authenticated - which is what Supabase's
-- default privileges do to every function postgres creates - and this returns
-- NULL on the next run and the probe takes over.
CREATE OR REPLACE FUNCTION org_gate_get_exclusion_reason(p_oid OID)
RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p.oid::regprocedure::TEXT IN ('is_org_member(uuid)', 'org_require_member(uuid)')
      THEN 'predicate'
    WHEN NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      THEN 'withdrawn'
  END
  FROM pg_proc p
  WHERE p.oid = p_oid;
$$;

-- Which check_org_gates() verdicts withhold the stamp, in one place, because
-- the answer was previously a literal inside verify_and_stamp_schema() that
-- named 'ungated' alone. 'unverifiable' - reachable, and not shown to refuse -
-- has to block too, or a probe that failed to reach a verdict is worth exactly
-- as much as one that certified the function.
CREATE OR REPLACE FUNCTION is_org_gate_status_blocking(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_status IN ('ungated', 'unverifiable');
$$;

CREATE OR REPLACE FUNCTION check_org_gates()
RETURNS TABLE (signature TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  -- WHAT MAKES A REFUSAL ATTRIBUTABLE
  --
  -- A call that ties the caller to the organization the function was asked
  -- about. Nothing weaker, and the list used to contain three weaker things.
  --
  -- `auth.uid()` was the worst of them. It answers "who is asking", which is a
  -- stamp and not a gate, and a function whose only recognised token was
  --
  --   DECLARE v_actor UUID := auth.uid();
  --
  -- with no authorization of any kind anywhere in it scored gated, was stamped
  -- by verify_and_stamp_schema(), and served one tenant another tenant's parts
  -- over HTTP. `my_actor_id()` is the same answer that raises when the
  -- answer is nobody: it establishes that somebody is signed in, and signing up
  -- is free. `is_org_admin()`, `has_user_permission()` and
  -- `has_team_permission()` are genuine authorization checks and still not
  -- these: they ask what the caller may do in their OWN organization and take
  -- no p_org_id, so an admin of one tenant passes them while naming another.
  --
  -- Removing them is only honest if the code stops depending on them, and ten
  -- RPCs did - each hand-writing `SELECT org_id INTO v FROM users WHERE id =
  -- auth.uid()` and comparing it to p_org_id. Every one was correct, and their
  -- correctness is why this list had to be wrong: the checker was widened to
  -- accommodate the convention instead of the convention being kept. They call
  -- org_require_member() or is_org_member() now, which is what
  -- check_null_unsafe_org_gates() has told people to do for two releases.
  --
  -- Named c_gate_binding rather than c_gate_evidence because the change is what
  -- counts as evidence, and a build carrying the old copy should not satisfy the
  -- manifest by accident.
  c_gate_binding CONSTANT TEXT :=
    '(org_require_member|is_org_member|user_require_same_org|\w+_require_access)\s*\(';
  r RECORD;
  v_args TEXT;
  v_sqlstate TEXT;
  v_message TEXT;
  v_rows TEXT[];
  v_attributable BOOLEAN;
  v_excuse TEXT;
  v_reachable BOOLEAN;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           p.oid::regprocedure::TEXT AS sig,
           pg_get_function_identity_arguments(p.oid) AS ident_args,
           -- prosrc, so a function does not match c_gate_evidence on its own
           -- name in the CREATE line that pg_get_functiondef() prepends.
           lower(regexp_replace(sql_strip_noise(p.prosrc), '\s+', ' ', 'g')) AS src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      -- Functions only. A procedure is reached by CALL, not by SELECT, and no
      -- org-scoped procedure exists; check_unbound_entity_args() and the anon
      -- sweep both cover procedures, so one is not invisible everywhere.
      AND p.prokind = 'f'
      AND pg_get_function_identity_arguments(p.oid) ~ '\mp_org_id\M'
    ORDER BY 1
  LOOP
    -- AN EXCLUSION HAS TO EARN ITSELF, ON THE DATABASE IN FRONT OF IT
    --
    -- This loop used to skip three function names outright, and the skip was
    -- silent: nothing downstream could tell an excluded function from one that
    -- had never existed. seed_customer_categories was on that list with a
    -- comment saying its grant had been withdrawn, the withdrawal named PUBLIC
    -- and not authenticated, and the function stayed callable over PostgREST
    -- for as long as the list said not to look. A list of names cannot notice
    -- that; org_gate_get_exclusion_reason() reads the ACL, so the excuse expires
    -- the moment the ACL does.
    --
    -- Excused functions are still returned, with the reason and the ACL that
    -- justifies it, so "not checked" is a line in the report rather than an
    -- absence from it.
    v_excuse := org_gate_get_exclusion_reason(r.oid);
    IF v_excuse IS NOT NULL THEN
      signature := r.sig;
      status := v_excuse;
      detail := CASE v_excuse
        WHEN 'withdrawn' THEN
          'not probed: neither anon nor authenticated may execute it, so no '
          || 'PostgREST caller can reach it and the argument it trusts cannot be '
          || 'supplied by one. This is the whole of its defence - grant it back '
          || 'to either role and it is probed like everything else. ACL: '
          || COALESCE((SELECT p.proacl::TEXT FROM pg_proc p WHERE p.oid = r.oid),
                      '(default - which on Supabase means anon and authenticated CAN execute it)')
        ELSE
          'not probed: this is one of the gates the others are gated BY. '
          || 'is_org_member(p_org_id) answering false for a foreign organization '
          || 'is the gate working, and org_require_member(p_org_id) raising is '
          || 'the same answer spelled as an exception, so probing it for a '
          || 'refusal asks a question with no failing answer. Neither discloses '
          || 'anything beyond whether the caller themselves is a member. They '
          || 'are exercised directly, as four different callers, by '
          || 'harness/sql/posture-checks.sql.'
      END;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Whether a verdict of "could not tell" is survivable. For a function no
    -- PostgREST caller can reach, not knowing costs nothing. For one they can,
    -- it is the same silence the exclusion list used to provide.
    v_reachable := has_function_privilege('authenticated', r.oid, 'EXECUTE')
                OR has_function_privilege('anon', r.oid, 'EXECUTE');

    v_attributable := r.src ~ c_gate_binding;

    -- A random organization id for p_org_id, and for every other argument a
    -- value of its own type that the function has some chance of accepting.
    -- NULLs here were how a function got certified without its org gate ever
    -- being reached: it rejected the NULL first and the probe called that a
    -- refusal. probe_get_literal_for_arg() goes one further and reads the function's
    -- own vocabulary, so an argument the function only accepts from a fixed set
    -- is filled from that set rather than with a string nothing accepts.
    SELECT string_agg(
             CASE WHEN a.arg ~ '\mp_org_id\M'
                  THEN quote_literal(gen_random_uuid()::text) || '::uuid'
                  ELSE probe_get_literal_for_arg(r.oid, split_part(a.arg, ' ', 1),
                                             regexp_replace(a.arg, '^\S+\s+', '')) END,
             ', ' ORDER BY a.ord)
      INTO v_args
      FROM unnest(string_to_array(r.ident_args, ', ')) WITH ORDINALITY AS a(arg, ord);

    BEGIN
      -- The FROM form works for scalar and set-returning functions alike, and
      -- array_agg keeps every row rather than the first, so a set-returning
      -- function that leaked rows cannot be mistaken for one that returned none.
      EXECUTE format(
        'SELECT array_agg(probe.*::text) FROM (SELECT * FROM %s(%s)) probe',
        r.proname, v_args)
        INTO v_rows;
      -- It answered. Undo anything it did and carry the verdict out on the
      -- sentinel's message, since the rollback discards v_rows with everything
      -- else the call touched.
      RAISE EXCEPTION 'blueplm_gate_probe_sentinel'
        USING ERRCODE = 'raise_exception',
              DETAIL = COALESCE(array_to_string(v_rows, ' | '), '');
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;

        IF v_message = 'blueplm_gate_probe_sentinel' THEN
          GET STACKED DIAGNOSTICS v_message = PG_EXCEPTION_DETAIL;
          signature := r.sig;

          IF v_message = '' THEN
            -- The empty set: a set-returning function that bailed with a bare
            -- RETURN rather than raising.
            status := CASE WHEN v_attributable THEN 'gated' ELSE 'ungated' END;
            detail := CASE WHEN v_attributable THEN 'returned no rows'
                      ELSE 'returned no rows, but nothing in its source ties the '
                        || 'caller to the organization it was asked about, so the '
                        || 'empty result is not a refusal - it is a query that '
                        || 'happened to match nothing' END;
          -- record::text doubles the quotes inside a JSON column, so
          -- {"success" : false} arrives as ("{""success"" : false}").
          ELSIF replace(v_message, '""', '"') ~ '"success"\s*:\s*false' THEN
            -- The older convention: refusal reported in the JSON payload.
            status := CASE WHEN v_attributable THEN 'gated' ELSE 'ungated' END;
            detail := CASE WHEN v_attributable THEN left(v_message, 200)
                      ELSE 'returned ' || left(v_message, 120) || ' - but nothing in '
                        || 'its source ties the caller to the organization it was '
                        || 'asked about, so this is some other argument being '
                        || 'rejected, not an authorization check' END;
          ELSE
            status := 'ungated';
            detail := 'ran to completion against an organization the caller does '
                   || 'not belong to, returning: ' || left(v_message, 160);
          END IF;
          RETURN NEXT;
        ELSIF v_sqlstate IN ('42501', '28000', '22023', 'P0001') THEN
          -- insufficient_privilege / invalid_authorization_specification /
          -- invalid_parameter_value, and P0001, which nothing but a deliberate
          -- RAISE in the function's own body produces.
          --
          -- A deliberate RAISE is still only a refusal if the function has
          -- something to refuse *with*. 'p_name is required' is a P0001 and is
          -- not a gate, and scoring it as one is how a function with no
          -- authorization at all came to be certified.
          signature := r.sig;
          IF v_attributable THEN
            status := 'gated';
            detail := v_message;
          ELSE
            status := 'ungated';
            detail := 'refused with "' || left(v_message, 120) || '", but nothing in '
                   || 'its source ties the caller to the organization it was asked '
                   || 'about - no org_require_member, is_org_member, '
                   || '..._require_access or user_require_same_org. auth.uid(), '
                   || 'my_actor_id() and is_org_admin() do not count: the first '
                   || 'two say who is asking and the third says what they may do in '
                   || 'their own organization, and none of them looks at p_org_id. '
                   || 'The refusal is about some other argument, and a caller who '
                   || 'supplies that argument correctly is served whatever '
                   || 'organization they name.';
          END IF;
          RETURN NEXT;
        ELSE
          -- Something else went wrong - a missing table from a module that is
          -- not installed, a NULL argument the function dereferenced before
          -- reaching its gate, a foreign key the synthesized organization id
          -- does not satisfy. Not a pass and not a failure.
          --
          -- WHICH DOES NOT MEAN IT CAN BE WAVED THROUGH
          --
          -- 'inconclusive' was reported and then ignored: verify_and_stamp_schema()
          -- selected only 'ungated', so a reachable function this probe could
          -- not judge was indistinguishable from one it had judged safe. That is
          -- the exclusion list again, arrived at by accident instead of by a
          -- list - and it is how a function whose defence is nothing but its ACL
          -- gets stamped after somebody grants the ACL away.
          --
          -- So the verdict splits on reachability, which is the thing that
          -- decides whether not knowing matters. 42P01 is carved out because an
          -- undefined table means the module that owns it is not installed, and
          -- a partial install must stay verifiable - that failure is about the
          -- database's contents, not about this function's authorization.
          signature := r.sig;
          IF v_reachable AND v_sqlstate <> '42P01' THEN
            status := 'unverifiable';
            detail := 'anon or authenticated may execute it and the probe could '
                   || 'not establish that it refuses a foreign organization: it '
                   || 'failed with ' || v_sqlstate || ': ' || left(v_message, 140)
                   || '. That is not a refusal - nothing in it is attributable to '
                   || 'an authorization check - and it is not a pass. Either gate '
                   || 'the function with org_require_member(p_org_id), or withdraw '
                   || 'it with REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, '
                   || 'authenticated if it has no client caller.';
          ELSE
            status := 'inconclusive';
            detail := v_sqlstate || ': ' || v_message
                   || CASE WHEN NOT v_reachable
                           THEN ' (not reachable by anon or authenticated, so this costs nothing)'
                           ELSE ' (the module that owns the missing table is not installed)' END;
          END IF;
          RETURN NEXT;
        END IF;
    END;
  END LOOP;
END;
$$;

-- Everything an unauthenticated caller can still reach.
--
-- Supabase's bootstrap runs ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL
-- ON FUNCTIONS TO postgres, anon, authenticated, service_role, so every function
-- created in public is born with an explicit anon grant and stays that way
-- unless something takes it away. anon_enforce_execute_posture() is what takes
-- it away; this is the check that it did, and the one that notices the next
-- function somebody adds without running it.
--
-- WHY THERE IS A severity COLUMN
--
-- The previous version returned one undifferentiated list and
-- verify_and_stamp_schema() treated every row in it as fatal. Supabase creates a
-- default-privilege entry owned by supabase_admin as well as the one owned by
-- postgres, and `postgres` is not a member of supabase_admin, so
-- `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` raises
-- insufficient_privilege no matter who runs it from the SQL editor.
-- anon_enforce_execute_posture() warned and moved on, this function reported the
-- row, and the stamp was withheld - permanently, on a correctly installed
-- database, with all 35 manifest objects reporting ok. The advice printed
-- alongside was to run the very function that had just failed.
--
-- A check the operator cannot act on must not be able to block them. Rows are
-- 'blocking' or 'advisory', and only 'blocking' withholds the stamp. The line
-- between them is one question, asked the same way everywhere: *could the
-- caller revoke this if they wanted to?* If yes it is blocking, because it is
-- their job. If no it is advisory, because otherwise the script is demanding
-- something impossible - which is exactly what v90 did, while advising the
-- operator to run the function that had just failed to do it.
-- tools/emergency-lockdown.sql draws the same line, so the two agree about
-- what "clean" means.
--
-- WHERE THAT LINE IS DANGEROUS, AND WHAT KEEPS IT HONEST
--
-- 'advisory' is a way for a real exposure to not stop a release, so it has to
-- be narrow. Two rules hold it in place:
--
--   1. Advisory is decided by the catalogue, not by a judgement call:
--      anon_list_revoke_grantors() lists the roles that granted anon the privilege,
--      and the row is advisory only when the caller is a member of none of
--      them and is not a superuser. Anything the caller *can* revoke stays
--      blocking however inconvenient.
--   2. Advisory is never quiet. tools/verify-schema.sql prints advisory rows
--      above the summary and calls out the ones that are live objects rather
--      than policies, because "you cannot fix this from here" is not the same
--      sentence as "this is fine".
--
-- The original advisory case - a default-privilege row owned by supabase_admin
-- - was safe for a further reason worth keeping in mind: it describes a policy,
-- and every object the policy produces is still swept and still reported. An
-- object that is itself unrevokable has no such backstop, which is why it is
-- printed with the detail spelled out rather than folded into a count.

-- Who granted anon its EXECUTE on this routine - directly, or through PUBLIC.
--
-- REVOKE only removes grants made by the current role or by a role it is a
-- member of, so this is the list of roles the caller would have to be able to
-- act as. On Supabase a routine created by supautils' CREATE EXTENSION comes
-- out `anon=X/supabase_admin`, postgres is not a member of supabase_admin, and
-- `REVOKE EXECUTE ... FROM anon` answers "WARNING: no privileges could be
-- revoked" and changes nothing.
--
-- COALESCE onto acldefault() because a NULL proacl is not "no privileges" - it
-- means the built-in default is in force, which for a routine is EXECUTE to
-- PUBLIC, granted by the owner.
CREATE OR REPLACE FUNCTION anon_list_revoke_grantors(p_oid OID)
RETURNS TEXT[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(DISTINCT pg_get_userbyid(x.grantor)), '{}'::TEXT[])
  FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
  WHERE p.oid = p_oid
    AND x.privilege_type = 'EXECUTE'
    -- grantee 0 is PUBLIC, which anon holds through.
    AND (x.grantee = 0 OR pg_has_role('anon', x.grantee, 'MEMBER'));
$$;

-- The same question for a relation's SELECT. Separate from the routine version
-- rather than one polymorphic helper, because pg_proc.oid and pg_class.oid are
-- different spaces that can hold the same number, and a lookup that searched
-- both could answer about the wrong object.
CREATE OR REPLACE FUNCTION anon_list_read_grantors(p_oid OID)
RETURNS TEXT[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(DISTINCT pg_get_userbyid(x.grantor)), '{}'::TEXT[])
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
  WHERE c.oid = p_oid
    AND x.privilege_type = 'SELECT'
    AND (x.grantee = 0 OR pg_has_role('anon', x.grantee, 'MEMBER'));
$$;

-- Policies on this relation that let anon see every row.
--
-- ENABLING ROW-LEVEL SECURITY IS NOT EXCLUDING ANON
--
-- The table sweep below treats `relrowsecurity = true` as the end of the
-- question, and it is not even the beginning of it. RLS decides that policies
-- apply; the policies decide who sees what. A table with
--
--   ALTER TABLE t ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY p ON t FOR SELECT TO anon USING (true);
--
-- has row-level security switched on and is readable at GET /rest/v1/t with no
-- JWT. That was verified over HTTP against this release's predecessor while
-- check_anon_reach() returned nothing and the schema was stamped.
--
-- WHAT THIS CAN AND CANNOT SEE
--
-- "Does this policy exclude anon?" is not decidable from the expression in
-- general - `USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))`
-- excludes anon only because auth.uid() is NULL for it, which is a fact about
-- the platform and not about the text. So this asks the narrow, decidable
-- question instead: is there a permissive SELECT policy, applying to anon
-- directly or through PUBLIC, whose USING expression is the constant true? That
-- is the shape that admits anon to everything, and it is the shape somebody
-- writes by accident when they want a table readable by the sign-in screen.
--
-- A qual of `1 = 1`, or one that reduces to true through a function, is not
-- caught. Stating that is better than implying a completeness this cannot have;
-- the allowlist below is what makes the deliberate cases explicit, so anything
-- else arriving is at least visible in a diff.
--
-- Restrictive policies are ignored: they can only subtract from what a
-- permissive one grants, so one can never be the reason anon sees a row.
CREATE OR REPLACE FUNCTION anon_list_admitting_policies(p_oid OID)
RETURNS TEXT[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(pol.polname ORDER BY pol.polname), '{}'::TEXT[])
  FROM pg_policy pol
  WHERE pol.polrelid = p_oid
    AND pol.polpermissive
    -- 'r' is SELECT, '*' is ALL. The others cannot return a row to a reader.
    AND pol.polcmd IN ('r', '*')
    AND EXISTS (
      SELECT 1 FROM unnest(pol.polroles) AS rid
      -- 0 is PUBLIC, which anon holds through.
      WHERE rid = 0 OR pg_has_role('anon', rid, 'MEMBER')
    )
    AND COALESCE(pg_get_expr(pol.polqual, pol.polrelid), 'true') = 'true';
$$;

-- Relations an unauthenticated caller is deliberately allowed to read, the
-- counterpart of anon_get_execute_allowlist() for tables and views.
--
-- Same rule: keep it short and justify every entry, because a relation here is
-- readable over PostgREST by anyone on the internet holding the publishable
-- key. It exists so that the deliberate case and the accidental case can be
-- told apart at all - without it, the policy check above would report the one
-- table that is meant to be public and an operator would learn to ignore it.
CREATE OR REPLACE FUNCTION anon_get_read_allowlist()
RETURNS TABLE (relname TEXT, reason TEXT)
LANGUAGE sql IMMUTABLE AS $$
  SELECT * FROM (VALUES
    -- One row, holding an integer, a description of the release and when it was
    -- stamped. It names no organization and no person, and the app compares it
    -- against the version it was built for. Its SELECT policy is USING (true)
    -- on purpose.
    ('schema_version', 'the recorded schema version, which names no tenant')
  ) AS a(relname, reason);
$$;

-- ANON HOLDS NO TABLE PRIVILEGE IN public (5.0)
--
-- Supabase's bootstrap runs ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL
-- ON TABLES TO anon, so every table this schema created was born with SELECT,
-- INSERT, UPDATE and DELETE granted to the unauthenticated role, and only
-- row-level security stood between an anonymous caller holding the publishable
-- key and every row. Through 112 the grants stayed because the API's health
-- check read organizations with the anon key; API 4.0.0 no longer does
-- (security baseline item 6), so 5.0 revokes them:
--
--   * every table and view outside anon_get_read_allowlist() gives anon no
--     privilege at all, and an allowlisted table gives it SELECT only;
--   * anon_enforce_execute_posture() sweeps tables as well as routines and
--     views, and withdraws the table default privilege so the next table is
--     born closed (where the caller may; supabase_admin's row is advisory);
--   * check_anon_reach() reports any table anon still holds a privilege on, and
--     a blocking row withholds the stamp.
--
-- Measured in the harness before 5.0 (harness/sql/anon-table-grants-experiment.sql):
-- 18 of 18 attacks still refused and 12 of 12 positive controls still working
-- with the grants revoked, because every product path is either a SECURITY
-- DEFINER function or an authenticated request.
--
-- Whether a policy excludes anon is still not decidable from its expression.
-- check_anon_reach() covers the decidable cases: RLS off, a permissive SELECT
-- policy reaching anon whose USING is the constant true, and any table grant.
CREATE OR REPLACE FUNCTION check_anon_reach()
RETURNS TABLE (kind TEXT, identity TEXT, severity TEXT, detail TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_super BOOLEAN := COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false);
BEGIN
  -- Every routine, not just prokind = 'f'.
  --
  -- This sweep and anon_enforce_execute_posture() have to agree about what a
  -- routine is, or the check reports something the remedy cannot clear. They
  -- did not: this had no prokind filter and the sweep had `prokind = 'f'`, so a
  -- PROCEDURE created in public by a later migration was reported blocking, the
  -- sweep answered "0 objects", and the operator was told to run a function
  -- that would never touch it. That is the v90 defect - a condition with no way
  -- out - relocated rather than fixed.
  RETURN QUERY
  SELECT CASE p.prokind WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate'
                        WHEN 'w' THEN 'window' ELSE 'function' END::TEXT,
         p.oid::regprocedure::TEXT,
         CASE WHEN v_super OR NOT EXISTS (
                SELECT 1 FROM unnest(anon_list_revoke_grantors(p.oid)) g
                WHERE NOT pg_has_role(current_user, g, 'MEMBER'))
              THEN 'blocking' ELSE 'advisory' END::TEXT,
         CASE WHEN v_super OR NOT EXISTS (
                SELECT 1 FROM unnest(anon_list_revoke_grantors(p.oid)) g
                WHERE NOT pg_has_role(current_user, g, 'MEMBER'))
           THEN 'executable by anon and not in anon_get_execute_allowlist(). '
                || 'Run: SELECT anon_enforce_execute_posture();'
           ELSE 'EXECUTABLE BY ANON, and you cannot revoke it: the grant was made by '
                || array_to_string(anon_list_revoke_grantors(p.oid), ', ')
                || ' and ' || current_user || ' is a member of neither that role nor '
                || 'any superuser. This is what supautils produces when CREATE '
                || 'EXTENSION installs an extension into public - the routines come '
                || 'out owned by supabase_admin. Advisory, because a check the '
                || 'operator has no power to clear must not withhold the stamp for '
                || 'ever; REAL, because anon can call it right now. Move the '
                || 'extension out of public (CREATE EXTENSION ... SCHEMA extensions, '
                || 'or ALTER EXTENSION ... SET SCHEMA extensions), or ask Supabase '
                || 'support to revoke it. BluePLM itself installs no extensions.'
         END
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM anon_get_execute_allowlist() a
      WHERE a.signature = p.oid::regprocedure::TEXT
         OR a.signature = p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    )
  ORDER BY 2;

  -- A table without RLS is readable by anon directly, no function needed.
  -- ALTER TABLE ... ENABLE ROW LEVEL SECURITY needs ownership, so the same
  -- "could the caller actually do this?" question decides the severity. Every
  -- BluePLM table is owned by the installing role, so this is blocking for all
  -- of them; a table an extension left in public is not.
  --
  -- relkind IN ('r','p','f'), not 'r'.
  --
  -- 'r' is an ordinary table and it is the only shape this used to look at.
  --
  --   'p' is a partitioned table. Its leaf partitions are 'r' and were caught,
  --       which reads as adequate until row-level security is enabled on a
  --       leaf: the leaf then drops out of this sweep, the parent was never in
  --       it, and SELECT through the parent - which is how anyone queries a
  --       partitioned table - applies the parent's policies, of which there
  --       are none. Verified over HTTP: anon read every row of a partitioned
  --       table in public while this function returned nothing.
  --   'f' is a foreign table, which cannot carry row-level security at all and
  --       reaches data this database does not even hold.
  --
  -- Partitions themselves are excluded (relispartition): a leaf is reached
  -- through its parent, the parent is now swept, and reporting both would tell
  -- the operator to fix the same exposure once per partition.
  RETURN QUERY
  SELECT CASE c.relkind WHEN 'p' THEN 'partitioned table'
                        WHEN 'f' THEN 'foreign table' ELSE 'table' END::TEXT,
         c.relname::TEXT,
         CASE WHEN v_super OR pg_has_role(current_user, c.relowner, 'MEMBER')
              THEN 'blocking' ELSE 'advisory' END::TEXT,
         CASE WHEN v_super OR pg_has_role(current_user, c.relowner, 'MEMBER')
           THEN 'has no row-level security, so anon reads it directly over PostgREST. '
                || 'Fix: ALTER TABLE ' || quote_ident(c.relname)
                || ' ENABLE ROW LEVEL SECURITY, then add the policies it needs.'
           ELSE 'READABLE BY ANON with no row-level security, and you cannot enable '
                || 'it: the table is owned by ' || pg_get_userbyid(c.relowner)
                || ' and ' || current_user || ' is not a member of that role. Not '
                || 'created by BluePLM. Advisory only because there is nothing you '
                || 'can run from here that changes it.'
         END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'f')
    AND NOT c.relispartition
    AND NOT c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM anon_get_read_allowlist() a WHERE a.relname = c.relname)
  ORDER BY 2;

  -- Row-level security switched on, and a policy that hands anon every row.
  --
  -- The block above answers "is RLS off?" and stops. That is not the same
  -- question as "is anon excluded?", and the gap between them is a whole class
  -- of exposure: RLS on, `CREATE POLICY ... FOR SELECT TO anon USING (true)`,
  -- and the table is public at GET /rest/v1/<table> with no JWT while every
  -- inventory in this file calls it protected. Measured over HTTP against the
  -- previous release; check_anon_reach() returned nothing and the schema was
  -- stamped.
  --
  -- See anon_list_admitting_policies() for what this can and cannot recognise. It is
  -- the narrow case - a permissive SELECT policy reaching anon whose USING is
  -- the constant true - and it is the one that gets written by accident.
  RETURN QUERY
  SELECT CASE c.relkind WHEN 'p' THEN 'partitioned table'
                        WHEN 'm' THEN 'matview' WHEN 'v' THEN 'view'
                        ELSE 'table' END::TEXT,
         c.relname::TEXT,
         CASE WHEN v_super OR pg_has_role(current_user, c.relowner, 'MEMBER')
              THEN 'blocking' ELSE 'advisory' END::TEXT,
         'has row-level security enabled and a policy that admits anon to every '
           || 'row: ' || array_to_string(anon_list_admitting_policies(c.oid), ', ')
           || '. Enabling row-level security decides that policies apply; it does '
           || 'not decide who they let in, and USING (true) lets in whoever the '
           || 'policy names. Either scope the policy''s USING expression to the '
           || 'caller''s organization, or restrict the policy to authenticated: '
           || 'DROP POLICY ' || quote_ident((anon_list_admitting_policies(c.oid))[1])
           || ' ON ' || quote_ident(c.relname) || '; and write it again with the '
           || 'roles and the predicate it needs. If the relation is genuinely '
           || 'meant to be public, add it to anon_get_read_allowlist() with a reason.'
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT c.relispartition
    AND c.relrowsecurity
    AND has_any_column_privilege('anon', c.oid, 'SELECT')
    AND array_length(anon_list_admitting_policies(c.oid), 1) > 0
    AND NOT EXISTS (SELECT 1 FROM anon_get_read_allowlist() a WHERE a.relname = c.relname)
  ORDER BY 2;

  -- Views. This block is here because nothing in the release before last looked
  -- at them: the table sweep above filters relkind = 'r', and part_with_pricing
  -- is relkind = 'v'. It was readable at GET /rest/v1/parts_with_pricing with no
  -- JWT at all, returning every organization's file ids, part numbers,
  -- descriptions, paths, revisions, states, preferred supplier, supplier code
  -- and unit price. Both of that release's security checks reported the schema
  -- clean while it did so.
  --
  -- Materialized views used to be folded in here and are now handled on their
  -- own below, because revoking anon is not a sufficient answer for one.
  --
  -- has_any_column_privilege, not has_table_privilege.
  --
  -- A grant can be made on a single column - `GRANT SELECT (part_number) ON
  -- part_with_pricing TO anon` - and has_table_privilege is false for one,
  -- because it asks about the privilege on the whole relation. PostgREST serves
  -- ?select=part_number from it perfectly happily. Verified: a view with one
  -- column granted was read over HTTP by anon while this returned nothing.
  -- has_any_column_privilege answers true for the table-level grant as well, so
  -- it is a superset and nothing that used to be reported stops being reported.
  RETURN QUERY
  SELECT 'view'::TEXT,
         c.relname::TEXT,
         CASE WHEN v_super OR NOT EXISTS (
                SELECT 1 FROM unnest(anon_list_read_grantors(c.oid)) g
                WHERE NOT pg_has_role(current_user, g, 'MEMBER'))
              THEN 'blocking' ELSE 'advisory' END::TEXT,
         CASE WHEN v_super OR NOT EXISTS (
                SELECT 1 FROM unnest(anon_list_read_grantors(c.oid)) g
                WHERE NOT pg_has_role(current_user, g, 'MEMBER'))
           THEN 'readable by anon over PostgREST. A view has no row-level security '
                || 'of its own, so this is an unauthenticated read of whatever it '
                || 'selects. Run: SELECT anon_enforce_execute_posture();'
           ELSE 'READABLE BY ANON, and you cannot revoke it: the grant was made by '
                || array_to_string(anon_list_read_grantors(c.oid), ', ') || ' and '
                || current_user || ' is not a member of that role. Not created by '
                || 'BluePLM - an extension installed into public leaves views like '
                || 'this. Move the extension to the extensions schema. Advisory only '
                || 'because nothing you can run from here changes it.'
         END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND has_any_column_privilege('anon', c.oid, 'SELECT')
  ORDER BY 2;

  -- A view that is not security_invoker reads its base tables as the view's
  -- owner. The owner here is postgres, which Supabase's demotion leaves holding
  -- BYPASSRLS, so RLS on files and part_supplier does not apply and every
  -- tenant's rows come back - to any authenticated caller, not just to anon.
  -- Revoking anon alone would have left that half of the leak open.
  RETURN QUERY
  SELECT 'view'::TEXT,
         c.relname::TEXT,
         CASE WHEN v_super OR pg_has_role(current_user, c.relowner, 'MEMBER')
              THEN 'blocking' ELSE 'advisory' END::TEXT,
         CASE WHEN v_super OR pg_has_role(current_user, c.relowner, 'MEMBER')
           THEN 'is not security_invoker, so it reads its base tables as its owner ('
                || pg_get_userbyid(c.relowner) || ') and row-level security does not '
                || 'apply. Any grantee sees every organization''s rows. Fix: ALTER VIEW '
                || quote_ident(c.relname) || ' SET (security_invoker = true);'
           ELSE 'IS NOT security_invoker and you cannot change that: it is owned by '
                || pg_get_userbyid(c.relowner) || ', which ' || current_user
                || ' is not a member of. Every grantee reads it as its owner. Not '
                || 'created by BluePLM. Advisory only because ALTER VIEW would be '
                || 'refused.'
         END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                  WHERE option_name = 'security_invoker'), 'off') NOT IN ('true', 'on')
    AND (has_any_column_privilege('anon', c.oid, 'SELECT')
         OR has_any_column_privilege('authenticated', c.oid, 'SELECT'))
  ORDER BY 2;

  -- Materialized views, which the block above cannot help with.
  --
  -- The security_invoker sweep filters relkind = 'v', and it has to: a
  -- materialized view *cannot* be security_invoker - the option does not exist
  -- for it - and it holds its own stored rows rather than reading base tables,
  -- so it carries no row-level security either. It is therefore strictly worse
  -- than the plain view that caused the original leak, and it produced no row
  -- at all: not in the security_invoker sweep, not in the table sweep
  -- (relkind = 'r'), and only in the anon sweep above if anon in particular
  -- could read it.
  --
  -- None exist in BluePLM today. This is here so that the first one cannot be
  -- added quietly.
  RETURN QUERY
  SELECT 'matview'::TEXT,
         c.relname::TEXT,
         -- Ownership rather than grantor: the remedies are REVOKE, ALTER and
         -- DROP, and all three need to own it. An extension's matview in public
         -- is advisory for the same reason its functions are.
         CASE WHEN v_super OR pg_has_role(current_user, c.relowner, 'MEMBER')
              THEN 'blocking' ELSE 'advisory' END::TEXT,
         'is a materialized view in public readable by '
           || CASE WHEN has_any_column_privilege('anon', c.oid, 'SELECT')
                        AND has_any_column_privilege('authenticated', c.oid, 'SELECT')
                     THEN 'anon and authenticated'
                   WHEN has_any_column_privilege('anon', c.oid, 'SELECT') THEN 'anon'
                   ELSE 'authenticated' END
           || '. A materialized view cannot be security_invoker and has no row-level '
           || 'security of its own, so every grantee sees every organization''s rows '
           || 'and there is no setting that changes that. Either move it out of '
           || 'public and read it through a SECURITY DEFINER function that filters by '
           || 'organization, or replace it with a security_invoker view over the '
           || 'RLS-protected tables. If it must stay: REVOKE ALL ON '
           || quote_ident(c.relname) || ' FROM anon, authenticated;'
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'm'
    AND (has_any_column_privilege('anon', c.oid, 'SELECT')
         OR has_any_column_privilege('authenticated', c.oid, 'SELECT'))
  ORDER BY 2;

  -- The default privileges themselves, which is what makes the function case
  -- recur. Advisory when the caller could not cancel it even if they wanted to.
  RETURN QUERY
  SELECT 'default_privilege'::TEXT,
         COALESCE(pg_get_userbyid(d.defaclrole), '?') || ' on functions',
         CASE WHEN pg_has_role(current_user, d.defaclrole, 'MEMBER')
              THEN 'blocking' ELSE 'advisory' END::TEXT,
         CASE WHEN pg_has_role(current_user, d.defaclrole, 'MEMBER')
           THEN 'ALTER DEFAULT PRIVILEGES still grants EXECUTE to anon, and you '
                || 'are a member of ' || pg_get_userbyid(d.defaclrole) || ' so you '
                || 'can cancel it. Run: SELECT anon_enforce_execute_posture();'
           ELSE 'ALTER DEFAULT PRIVILEGES grants EXECUTE to anon on functions '
                || 'created by ' || pg_get_userbyid(d.defaclrole) || '. ' || current_user
                || ' is not a member of that role and cannot cancel it; on Supabase '
                || 'nothing you can run from the SQL editor can. Advisory only. It '
                || 'affects functions created BY that role, and BluePLM''s are created '
                || 'by ' || current_user || ', which is swept at the end of every file.'
         END
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'
    AND d.defaclobjtype = 'f'
    AND EXISTS (
      SELECT 1 FROM aclexplode(d.defaclacl) x
      WHERE x.grantee = 'anon'::regrole AND x.privilege_type = 'EXECUTE'
    );

  -- 5.0: a table privilege held by anon at all. Row-level security decides which
  -- rows a grantee sees; the grant decides whether anon is a grantee, and since
  -- 5.0 it is not, except SELECT on anon_get_read_allowlist().
  RETURN QUERY
  SELECT 'table_grant'::TEXT,
         c.relname::TEXT,
         CASE WHEN v_super OR pg_has_role(current_user, c.relowner, 'MEMBER')
              THEN 'blocking' ELSE 'advisory' END::TEXT,
         'anon holds a privilege on this table. Run: SELECT anon_enforce_execute_posture();'::TEXT
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'f')
    AND NOT c.relispartition
    AND (
      (NOT EXISTS (SELECT 1 FROM anon_get_read_allowlist() a WHERE a.relname = c.relname)
       AND (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')))
      OR has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    )
  ORDER BY 2;

  RETURN QUERY
  SELECT 'default_privilege'::TEXT,
         COALESCE(pg_get_userbyid(d.defaclrole), '?') || ' on tables',
         CASE WHEN pg_has_role(current_user, d.defaclrole, 'MEMBER')
              THEN 'blocking' ELSE 'advisory' END::TEXT,
         CASE WHEN pg_has_role(current_user, d.defaclrole, 'MEMBER')
           THEN 'ALTER DEFAULT PRIVILEGES still grants anon privileges on new tables. '
                || 'Run: SELECT anon_enforce_execute_posture();'
           ELSE 'ALTER DEFAULT PRIVILEGES grants anon privileges on tables created by '
                || pg_get_userbyid(d.defaclrole) || ', which ' || current_user
                || ' cannot cancel. Advisory: BluePLM''s tables are created by '
                || current_user || ' and swept at the end of every file.'
         END
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'
    AND d.defaclobjtype = 'r'
    AND EXISTS (
      SELECT 1 FROM aclexplode(d.defaclacl) x WHERE x.grantee = 'anon'::regrole
    );
END;
$$;

-- 5.0 (security baseline item 5): every SECURITY DEFINER function in public pins
-- its search_path. A definer function runs with its owner's rights, so an
-- unpinned one resolves unqualified names through whatever search_path the
-- caller arranged. PostgREST callers cannot set it and public is not creatable,
-- which kept this low, but the pin costs nothing and this check keeps the next
-- function honest: verify_and_stamp_schema() refuses to stamp while one is
-- returned here.
CREATE OR REPLACE FUNCTION check_definer_search_path()
RETURNS TABLE (signature TEXT, detail TEXT)
LANGUAGE sql STABLE AS $$
  SELECT p.oid::regprocedure::TEXT,
         'SECURITY DEFINER without SET search_path. Add SET search_path = public, pg_temp to its definition.'::TEXT
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}'::TEXT[])) c WHERE c LIKE 'search_path=%')
  ORDER BY 1;
$$;

-- Membership tests that are wrong when the caller has no organization yet.
--
--   IF p_org_id NOT IN (SELECT org_id FROM users WHERE id = auth.uid()) THEN
--     RAISE EXCEPTION 'Not authorized for this organization';
--   END IF;
--
-- reads as a gate and is not one. A newly created account has app_user.org_id
-- NULL, so the subquery yields a single NULL row, `x NOT IN (NULL)` is NULL
-- rather than true, the IF is not taken, and the body runs against whatever
-- organization the caller named. Nine of these shipped. Four happened to be
-- saved by a conjoined `AND NOT is_org_admin()`; five were not, and from an
-- account with no organization the reviewer read another tenant's Odoo
-- configuration and integration status, read its item-designation assignments,
-- and overwrote and then deleted a row in its item_image.
--
-- check_org_gates() cannot catch this. It probes as the caller of
-- verify-schema.sql, which is postgres in the SQL editor, where auth.uid() is
-- NULL; `NULL NOT IN (...)` is also NULL, but org_require_member() raises
-- 'Not authenticated' first, so the probe sees a refusal and scores the function
-- gated. The one input that triggers the bug is the one input the probe cannot
-- present. So this is a source check, deliberately - it is looking for a shape
-- that must not exist, not for a behaviour.
--
-- The shape is banned outright rather than only where it is currently
-- exploitable. A gate whose correctness depends on a second condition someone
-- may later remove is not a gate. Use is_org_member() or org_require_member().
--
-- ONE SHAPE, NOT ONE SPELLING
--
-- The first version of this check was a literal regex for
-- `not in (select org_id from users`, run over plpgsql functions only. All nine
-- shipped sites happened to be spelled that way, so it found all nine and the
-- release said the shape was "banned outright". It was not: an alias, a
-- schema-qualified `public.app_user`, the `<> ALL (...)` form, `NOT (x IN (...))`,
-- `NOT (x = ANY (...))`, and anything written in LANGUAGE sql all walked past
-- it. Each of those is the same NULL, and each would have shipped.
--
-- What is still not covered, stated rather than implied: a membership subquery
-- against a table other than `app_user`, a comparison against a variable loaded
-- from users in an earlier statement (`SELECT org_id INTO v FROM users ...;
-- IF p_org_id <> v THEN`), and anything built with EXECUTE. The first two are
-- worth knowing about; check_org_gates() is what stands behind them, and the
-- convention that closes them is to call is_org_member() and never hand-write
-- the test at all.
CREATE OR REPLACE FUNCTION check_null_unsafe_org_gates()
RETURNS TABLE (signature TEXT, detail TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  -- Shared tail: the subquery being compared against, in any spelling.
  --   optional alias or schema on the column, optional public. on the table
  c_subq CONSTANT TEXT :=
    'select +(distinct +)?(\w+ *\. *)?org_id +from +(public *\. *)?app_user\M';
  r RECORD;
  v_src TEXT;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::TEXT AS sig, p.prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      -- Procedures and LANGUAGE sql functions too. is_org_member() is LANGUAGE
      -- sql, so "the helpers are sql, only the RPCs are plpgsql" was never true
      -- and a gate written the wrong way in a sql function was invisible.
      -- Aggregates and window functions are excluded because
      -- pg_get_functiondef() refuses them, not because they are trusted.
      AND p.prokind IN ('f', 'p')
      AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('plpgsql', 'sql'))
      -- The checkers describe the pattern in order to look for it.
      AND p.proname NOT IN ('check_null_unsafe_org_gates', 'sql_strip_noise')
    ORDER BY 1
  LOOP
    -- prosrc, the body alone, not pg_get_functiondef. Comments and string
    -- literals removed, so a note about the pattern does not read as the
    -- pattern, and whitespace flattened so line breaks inside the expression do
    -- not hide it.
    v_src := lower(regexp_replace(sql_strip_noise(r.prosrc), '\s+', ' ', 'g'));

    IF v_src ~ ('not +in *\( *' || c_subq) THEN
      signature := r.sig;
      detail := 'uses NOT IN (SELECT org_id FROM app_user ...), which evaluates to '
             || 'NULL - not true - when the caller''s app_user.org_id is NULL, so the '
             || 'refusal never fires for an account that has not joined an '
             || 'organization yet. Use org_require_member(p_org_id), or '
             || 'NOT is_org_member(p_org_id) where the function returns rather '
             || 'than raises.';
      RETURN NEXT;
    ELSIF v_src ~ ('(<>|!=) *(all *)?\( *' || c_subq) THEN
      signature := r.sig;
      detail := 'compares an organization id with (SELECT org_id FROM app_user ...) '
             || 'using <>, != or <> ALL, all of which are NULL when the caller''s '
             || 'app_user.org_id is NULL, so the refusal never fires. Use '
             || 'is_org_member() instead.';
      RETURN NEXT;
    ELSIF v_src ~ ('not *\( *[\w.]+ +in *\( *' || c_subq) THEN
      signature := r.sig;
      detail := 'uses NOT (x IN (SELECT org_id FROM app_user ...)). Moving the NOT '
             || 'outside the parentheses changes nothing: NOT NULL is still NULL '
             || 'when the caller''s app_user.org_id is NULL, so the refusal never '
             || 'fires. Use is_org_member() instead.';
      RETURN NEXT;
    ELSIF v_src ~ ('not +[\w.]+ *= *any *\( *(array *\( *)?' || c_subq) THEN
      signature := r.sig;
      detail := 'uses NOT x = ANY (SELECT org_id FROM app_user ...), which is NULL '
             || 'rather than true when the caller''s app_user.org_id is NULL, so the '
             || 'refusal never fires. Use is_org_member() instead.';
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Functions that check one argument and then act on another.
--
-- file_share_link_create took p_org_id and p_file_id, called
-- org_require_member(p_org_id) - which passed, because the caller really was a
-- member of the organization they named - and then inserted p_file_id without
-- ever asking which organization that file belonged to. Passing your own org id
-- with somebody else's file id minted a working share token for their file. The
-- argument that was checked was not the argument that selected the row.
--
-- Neither existing check could see it. check_org_gates() calls the function with
-- NULLs and looks for a refusal, and it got one, because org_require_member()
-- refuses an unauthenticated caller. check_anon_reach() only asks who may
-- execute, and the answer - authenticated members - was correct. The function
-- was certified by both while being wrong for the one caller that mattered.
--
-- Rule 1 below is narrow on purpose: it reports only the specific contradiction
-- of gating on p_org_id while never once using p_org_id to constrain a row. A
-- function that says `WHERE org_id = p_org_id` somewhere, or that derives the
-- organization from the entity through a require_..._access() helper, is doing
-- the binding and is left alone - including vault_file_list_delta(), whose
-- vault filter sits on a different line from its org filter but is still inside
-- the same query.
--
-- WHY THIS NO LONGER STARTS FROM p_org_id
--
-- The first version only considered functions that take a p_org_id, because
-- file_share_link_create took one. That filter was the finding restated as a
-- rule rather than the rule the finding was an instance of: a function that
-- gates on an *entity* - file_require_access(p_file_id) - and then acts on a
-- second id it never checks has exactly the same defect and no p_org_id
-- anywhere, so this check could not see it.
--
-- workflow_transition_apply was that function. It called
-- file_require_access(p_file_id), which is correct and sufficient for the file,
-- and then loaded p_transition_id with an existence test and nothing else. A
-- member of one organization applied another organization's classified
-- transition to her own file, and its workflow name, state name and transition
-- name are now in her workflow_history. It was in this release's manifest, and
-- the check written to stop this recurring could not look at it.
--
-- Dropping the p_org_id filter leaves seven security-definer functions in
-- public that take two or more row-selecting uuid ids. Six bind the second one;
-- one did not.
--
-- THE RULE, AND WHY IT IS A COUNT
--
-- Proving "argument B is constrained to the organization argument A
-- established" from source text is not something a regex can do - the binding
-- may be two statements away, through a record variable. A rule that demanded
-- proof would report functions that are correct, and a check that cannot be
-- satisfied is worse than no check: that was finding 1, a verifier withholding
-- the stamp for a condition the operator could not clear.
--
-- So the rule counts, and it errs towards passing. Every id the function looks
-- a row up by needs an organization check that is not already spoken for by a
-- different id. It cannot tell you *which* check covers which argument in the
-- general case, and it does not try; what it can tell you is that there are
-- more ids being reached through than there are checks left to cover them.
--
-- One subtraction in that arithmetic is load-bearing and was not there at
-- first. A resolver call is a binding, but it is a binding of the argument it
-- was handed. `file_require_access(p_file_id)` followed by a bare
-- `WHERE id = p_transition_id` has one binding and one unchecked id, which
-- balances on a naive count - and is exactly workflow_transition_apply. So a
-- resolver call is subtracted from the checks available before the comparison
-- is made. NC11 in the harness is that case, and it is the reason the harness
-- reintroduces each hole rather than trusting the rule to be right.
CREATE OR REPLACE FUNCTION routine_list_row_selecting_id_args(p_oid OID)
RETURNS TEXT[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(a.name ORDER BY a.ord), '{}'::TEXT[])
  FROM pg_proc p
  CROSS JOIN LATERAL unnest(p.proargnames) WITH ORDINALITY AS a(name, ord)
  WHERE p.oid = p_oid
    AND a.name ~ '_id$'
    -- IN and INOUT only. An OUT column called link_id is a result, not a way to
    -- reach into another tenant.
    AND (p.proargmodes IS NULL OR p.proargmodes[a.ord] IN ('i', 'b'))
    -- uuid only. Every primary key in this schema is a uuid, so a text
    -- argument called p_machine_id is a value being stored, not a row being
    -- selected - and treating it as one made file_checkout() a candidate for a
    -- rule that has nothing to say about it.
    AND 'uuid'::regtype = CASE
          WHEN p.proallargtypes IS NULL THEN p.proargtypes[a.ord - 1]
          ELSE p.proallargtypes[a.ord]
        END
    -- Who is acting, not which row is acted on.
    AND a.name NOT IN ('p_user_id', 'p_created_by', 'p_actor_id', 'p_updated_by');
$$;

CREATE OR REPLACE FUNCTION check_unbound_entity_args()
RETURNS TABLE (signature TEXT, detail TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  -- One organization binding. require_\w+ covers org_require_member,
  -- file_require_access, vault_require_access, eco_require_access and
  -- user_require_same_org; the third alternative is a hand-written comparison
  -- on an org_id column, which is what the two workflow functions now use to
  -- tie their transition to the file's organization.
  -- The org_id alternatives allow a prefix and match either side of the
  -- comparison, because the binding is not always written as a column test.
  -- pending_license_assignment_add() resolves the licence's organization into
  -- v_license_org_id and compares that to the invitation's - which is a correct
  -- and complete binding, and which a pattern anchored on a bare `org_id =`
  -- could not see. It was reported, and it was right.
  c_binding CONSTANT TEXT :=
    '(\w*require_\w+ *\(|is_org_member *\('
    '|[\w.]*org_id *(=|<>|!=)|(=|<>|!=) *[\w.]*org_id\M)';
  -- Something has to be gating, or this is check_org_gates()'s finding and not
  -- this one's.
  c_any_gate CONSTANT TEXT :=
    '(\w*require_\w+ *\(|is_org_member *\(|is_org_admin *\()';
  r RECORD;
  v_src TEXT;
  v_org_others TEXT;
  v_args TEXT[];
  v_resolved TEXT[];
  v_looked_up TEXT[];
  v_sites INTEGER;
  v_consumed INTEGER;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.oid::regprocedure::TEXT AS sig,
           p.proargnames,
           p.proargmodes,
           p.prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND p.prosecdef
      AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('plpgsql', 'sql'))
      AND p.proname <> 'check_unbound_entity_args'
    ORDER BY 1
  LOOP
    -- The body alone. pg_get_functiondef() prepends the CREATE line, and the
    -- CREATE line of a function called require_something_or_other contains
    -- `require_something_or_other(`, which is one of the patterns below - so a
    -- gate helper would have counted itself as a gate and any future one with
    -- two id arguments would have been waved through by its own name.
    v_src := lower(regexp_replace(sql_strip_noise(r.prosrc), '\s+', ' ', 'g'));

    -- ---------------------------------------------------------------------
    -- Rule 1, unchanged: gates on p_org_id and never uses it to select a row.
    --
    -- This is file_share_link_create's exact defect and it is worth naming
    -- separately, because the remedy is specific: the argument that was checked
    -- was not the argument that chose the row.
    -- ---------------------------------------------------------------------
    -- THE OTHER IDS ARE THE ONES routine_list_row_selecting_id_args() RECOGNISES
    --
    -- This used to take every argument whose name ends in _id, of any type,
    -- which is the mistake rule 2 already knew not to make and says so in
    -- routine_list_row_selecting_id_args(): every primary key in this schema is a uuid, so a
    -- text argument called p_client_id is a Google OAuth client id being
    -- stored, not a row being reached into. org_update_google_drive_settings was
    -- reported for "acting on" p_client_id and p_inspection_template_folder_id,
    -- and extension_config_update for a p_extension_id that is text and is half
    -- of a composite key whose other half is the gated p_org_id. Neither is a
    -- way into another tenant, and a check that reports them is a check the
    -- operator learns to scroll past.
    --
    -- Both were invisible before only because they hand-wrote their membership
    -- test as `... AND org_id = p_org_id`, which this rule reads as p_org_id
    -- constraining a row. Converting them to org_require_member() removed that
    -- accidental exemption and exposed the real defect, which is here.
    IF 'p_org_id' = ANY(COALESCE(r.proargnames, '{}')) THEN
      SELECT string_agg(a, ', ') INTO v_org_others
      FROM unnest(routine_list_row_selecting_id_args(r.oid)) AS a
      WHERE a <> 'p_org_id';

      IF v_org_others IS NOT NULL
         AND v_src ~ '(org_require_member|is_org_member) *\( *p_org_id'
         AND v_src !~ 'org_id *= *p_org_id'
         AND v_src !~ '\w+_require_access *\(' THEN
        signature := r.sig;
        detail := 'gates on p_org_id but never uses it to constrain a row, while '
               || v_org_others || ' select(s) the row it acts on. A caller who is a '
               || 'genuine member of the organization they name can therefore pass '
               || 'another tenant''s id and be served. Either compare the entity''s '
               || 'own org_id to p_org_id, or derive the organization from the '
               || 'entity with a ..._require_access() helper and ignore p_org_id.';
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;

    -- ---------------------------------------------------------------------
    -- Rule 2: an id selects a row and no organization check is left to cover it.
    --
    -- Three quantities, and the arithmetic between them is the whole rule.
    --
    --   resolved   ids handed straight to a resolver - file_require_access(
    --              p_file_id), is_org_member(p_org_id). The call establishes
    --              the organization for that id, so it needs nothing else.
    --   direct     ids the function looks a row up by itself, `= p_x`, that
    --              are not resolved and are not p_org_id. Each of these needs
    --              an organization test somewhere.
    --   free       organization bindings not already spoken for. A resolver
    --              call is itself a binding, but it is a binding *of the id it
    --              was given*, so it cannot also cover a different one.
    --
    -- That last subtraction is the part a plain count got wrong, and NC11
    -- caught it: a function calling file_require_access(p_file_id) and then
    -- loading p_transition_id by id alone has one binding and one unbound id,
    -- which balances - and is precisely workflow_transition_apply's defect.
    -- The binding belongs to the file. Nothing is looking at the transition.
    -- ---------------------------------------------------------------------
    v_args := routine_list_row_selecting_id_args(r.oid);
    CONTINUE WHEN COALESCE(array_length(v_args, 1), 0) < 2;

    -- Ungated altogether is a different finding with a different owner.
    CONTINUE WHEN v_src !~ c_any_gate;

    v_resolved := ARRAY(
      SELECT a FROM unnest(v_args) AS a
      WHERE v_src ~ ('(require_\w+|is_org_member) *\( *' || a || '\M')
    );

    -- p_org_id is excluded because it is not a row being reached into - it is
    -- the organization itself, and rule 1 above is what has anything to say
    -- about a function that names one and never uses it.
    v_looked_up := ARRAY(
      SELECT a FROM unnest(v_args) AS a
      WHERE a <> 'p_org_id'
        AND NOT (a = ANY (v_resolved))
        AND v_src ~ ('= *' || a || '\M')
    );
    CONTINUE WHEN COALESCE(array_length(v_looked_up, 1), 0) = 0;

    SELECT count(*) INTO v_sites FROM regexp_matches(v_src, c_binding, 'g');
    SELECT count(*) INTO v_consumed
    FROM regexp_matches(v_src, '(require_\w+|is_org_member) *\( *p_\w*_id\M', 'g');

    CONTINUE WHEN (v_sites - v_consumed) >= array_length(v_looked_up, 1);

    signature := r.sig;
    detail := 'looks a row up by ' || array_to_string(v_looked_up, ', ')
           || ', and every organization check it performs is already accounted '
           || 'for by another argument (' || v_sites || ' check(s), ' || v_consumed
           || ' of them bound to an id that was passed in). So that id is taken '
           || 'from the caller and never tested against the organization the '
           || 'others established. That is how a member of one tenant applied '
           || 'another tenant''s workflow transition to her own file. Resolve it '
           || 'against the organization the gate returned - a ..._require_access() '
           || 'helper, or an org_id comparison in the query that loads it.';
    RETURN NEXT;
  END LOOP;
END;
$$;

-- The other half of the manifest: what the data must no longer contain.
--
-- See the note above schema_remediation_log. These are the same questions the
-- remediations answer, asked again afterwards by something that did not run
-- them, so "the remediation ran" and "the residue is gone" stay two separate
-- statements. Anything reported here withholds the stamp, which is what makes
-- forgetting a remediation impossible rather than merely discouraged.
--
-- Guarded by to_regclass throughout: a core-only install has none of these
-- tables and must not fail for the lack of them.
--
-- WHAT COUNTS AS RESIDUE, AND WHAT DELIBERATELY DOES NOT
--
-- An active cross-tenant share link does, because it is a live credential. A
-- deactivated one does not: that is a remediated row kept for the audit, and a
-- check that kept refusing after the remedy had run would be the v90 defect
-- again - a condition the operator cannot clear.
--
-- A workflow_history row whose workflow, transition or state id belongs to
-- another organization does, because the names copied alongside those ids are
-- readable by the wrong tenant for as long as the row says what it says. A row
-- whose ids are NULL does not, and cannot be judged: the foreign keys are ON
-- DELETE SET NULL, so a NULL there is ordinary. This is stated rather than
-- hidden - a history row that names a foreign workflow only in its text
-- columns, with no ids, is outside what this can see.
CREATE OR REPLACE FUNCTION check_release_residue()
RETURNS TABLE (residue TEXT, identity TEXT, detail TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r RECORD;
  color_swatches_scope_columns BOOLEAN;
  color_swatches_scope_controls BOOLEAN;
  color_swatches_realtime BOOLEAN;
  sw_licence_policy RECORD;
  review_write_policy RECORD;
  vault_policy RECORD;
BEGIN
  -- ---------------------------------------------------------------------
  -- Share links handing out a file in an organization somebody involved is not
  -- part of.
  --
  -- Three different rows match and all three are live cross-tenant credentials:
  -- one minted through the hole; one minted in good faith for a file that later
  -- moved organizations; and one whose link and file agree because both were
  -- rewritten together over the UPDATE policy, which carried no WITH CHECK
  -- until this release. The third is the one an org_id-only match cannot see,
  -- so the creator's membership is a term of the query here and not only of the
  -- prose - it must be, or this reports clean over a row
  -- file_share_link_remediate_cross_tenant() is about to deactivate, and the two
  -- halves of the release stop agreeing.
  --
  -- The detail says which shape it looks like, so an operator restoring a link
  -- they judge legitimate can tell them apart. None is left active, because
  -- under this release file_share_link_validate() resolves the organization from the
  -- file, so all three hand out a file to somebody with no claim on it.
  -- ---------------------------------------------------------------------
  IF to_regclass('public.file_share_link') IS NOT NULL
     AND to_regclass('public.file') IS NOT NULL THEN
    FOR r IN
      SELECT l.id, l.token, l.org_id AS link_org, f.org_id AS file_org,
             l.created_by, l.created_at, cu.org_id AS creator_org
      FROM file_share_link l
      JOIN file f ON f.id = l.file_id
      LEFT JOIN app_user cu ON cu.id = l.created_by
      WHERE (l.org_id IS DISTINCT FROM f.org_id
             OR cu.org_id IS DISTINCT FROM f.org_id)
        AND COALESCE(l.is_active, false)
      ORDER BY l.created_at
    LOOP
      residue := 'cross_tenant_share_link';
      -- The token's first eight characters as well as the row id, because the
      -- way an operator meets this is somebody telling them a link stopped
      -- working, and what they have is the URL. Eight characters of a
      -- 128-bit token identify the row without being the credential, and the
      -- credential is about to be deactivated in any case.
      identity := 'file_share_link.id = ' || r.id
               || ' (token ' || left(r.token, 8) || '...)';
      detail := 'is active and grants access to a file in organization '
             || r.file_org || ', while the link itself was minted for '
             || COALESCE(r.link_org::TEXT, 'no organization') || '. Created by '
             || r.created_by || ' on ' || r.created_at || ', who is '
             || CASE
                  WHEN r.link_org IS NOT DISTINCT FROM r.file_org
                    THEN 'NOT a member of the file''s organization even though '
                         || 'the link names it correctly - the shape an UPDATE '
                         || 'with no WITH CHECK produced by rewriting file_id '
                         || 'and org_id together, or a creator who has since '
                         || 'left the organization'
                  WHEN r.creator_org IS NOT DISTINCT FROM r.file_org
                    THEN 'a member of the file''s organization, so this is most '
                         || 'likely a file that moved after the link was minted '
                         || 'in good faith'
                  ELSE 'NOT a member of the file''s organization, which is the '
                       || 'shape file_share_link_create produced before this '
                       || 'release resolved the organization from the file' END
             || '. Deactivate it: SELECT file_share_link_remediate_cross_tenant();';
      RETURN NEXT;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------
  -- Workflow history naming another organization's workflow.
  --
  -- Asked through the foreign keys rather than through the names. A name join
  -- would report every history row of two tenants who both called a workflow
  -- 'Standard Release', which is not a finding and would make the stamp
  -- unobtainable for a reason nobody could act on.
  -- ---------------------------------------------------------------------
  IF to_regclass('public.workflow_history') IS NOT NULL
     AND to_regclass('public.workflow_template') IS NOT NULL THEN
    FOR r IN
      SELECT h.id, h.org_id, h.file_id, h.workflow_name, h.performed_at
      FROM workflow_history h
      WHERE EXISTS (SELECT 1 FROM workflow_template t
                     WHERE t.id = h.workflow_id AND t.org_id <> h.org_id)
         OR EXISTS (SELECT 1 FROM workflow_transition tr
                     JOIN workflow_template t2 ON t2.id = tr.workflow_id
                    WHERE tr.id = h.transition_id AND t2.org_id <> h.org_id)
         OR EXISTS (SELECT 1 FROM workflow_state s
                     JOIN workflow_template t3 ON t3.id = s.workflow_id
                    WHERE s.id IN (h.from_state_id, h.to_state_id)
                      AND t3.org_id <> h.org_id)
      ORDER BY h.performed_at
    LOOP
      residue := 'cross_tenant_workflow_history';
      identity := 'workflow_history.id = ' || r.id;
      detail := 'is filed under organization ' || r.org_id || ' and names a '
             || 'workflow, transition or state belonging to another one. The '
             || 'names copied into it are readable by every member of '
             || r.org_id || ' through their own history. Redact it: '
             || 'SELECT workflow_history_remediate_cross_tenant();';
      RETURN NEXT;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------
  -- A file left sitting in another organization's workflow state.
  --
  -- The same attack rewrote this row. It discloses no names by itself, and it
  -- decides which transitions the file offers, so leaving it is leaving the
  -- file driven by a workflow its organization does not own.
  -- ---------------------------------------------------------------------
  IF to_regclass('public.file_workflow_assignment') IS NOT NULL
     AND to_regclass('public.workflow_template') IS NOT NULL
     AND to_regclass('public.file') IS NOT NULL THEN
    FOR r IN
      SELECT a.file_id, f.org_id AS file_org, wt.org_id AS workflow_org, wt.id AS workflow_id
      FROM file_workflow_assignment a
      JOIN file f ON f.id = a.file_id
      JOIN workflow_template wt ON wt.id = a.workflow_id
      WHERE wt.org_id <> f.org_id
      ORDER BY a.file_id
    LOOP
      residue := 'cross_tenant_workflow_assignment';
      identity := 'file_workflow_assignment.file_id = ' || r.file_id;
      detail := 'assigns a file in organization ' || r.file_org
             || ' to workflow ' || r.workflow_id || ', which belongs to '
             || r.workflow_org || '. Clear it: '
             || 'SELECT workflow_history_remediate_cross_tenant();';
      RETURN NEXT;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------
  -- Two active rows in `folder` spelling one path two ways.
  --
  -- folder_vault_id_folder_path_idx is unique on (vault_id, LOWER(folder_path))
  -- WHERE deleted_at IS NULL and forbids this by construction, and
  -- folder_remediate_case_collisions() ran once, at v99, clearing every group
  -- that existed then - so on a database that still carries the index this
  -- clause finds nothing, every time. It travels here anyway, per this file's
  -- own doctrine a few hundred lines up: a remediation and a residue check
  -- travel together, or a database that skipped the remediation - or lost the
  -- index afterwards, since nothing stops an operator from dropping and
  -- rebuilding it without UNIQUE - verifies clean while carrying the exact
  -- defect v99 closed.
  -- ---------------------------------------------------------------------
  IF to_regclass('public.folder') IS NOT NULL THEN
    FOR r IN
      SELECT f.vault_id, LOWER(f.folder_path) AS folder_key,
             count(*) AS row_count,
             array_agg(DISTINCT f.folder_path ORDER BY f.folder_path) AS spellings,
             array_agg(f.id ORDER BY f.created_at, f.id) AS ids
        FROM folder f
       WHERE f.deleted_at IS NULL
       GROUP BY f.vault_id, LOWER(f.folder_path)
      HAVING count(*) > 1
       ORDER BY f.vault_id, LOWER(f.folder_path)
    LOOP
      residue := 'case_colliding_folders';
      identity := 'folder.vault_id = ' || r.vault_id
                || ', LOWER(folder_path) = ''' || r.folder_key || '''';
      detail := r.row_count || ' active row(s) - ids ' || array_to_string(r.ids, ', ')
             || ' - spell one folder ' || array_to_string(r.spellings, ' / ')
             || ' in vault ' || r.vault_id || '. folder_vault_id_folder_path_idx should make '
             || 'this impossible; if it is missing or was rebuilt without UNIQUE, restore '
             || 'it and run: SELECT folder_remediate_case_collisions();';
      RETURN NEXT;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------
  -- `folder` missing from the realtime publication, or missing REPLICA
  -- IDENTITY FULL - the two v101 statements that make a folder deletion
  -- reach another client at all.
  --
  -- Neither is a table nor a function, so schema_get_release_manifest() cannot
  -- see either one, and the thirteen tables that got the same two
  -- statements in the same DO block of 10-source-files.sql are equally
  -- unverified there. This clause exists anyway, for the reason v101 is the
  -- first of the fourteen to get one instead of joining that silence: it
  -- changes what the database must look like for the reported bug to stay
  -- fixed, and this file's own doctrine a few hundred lines up is that a
  -- release which does that should not be stampable while the database does
  -- not look like that yet. Guarded on to_regclass so a database without
  -- module 10 - which is where `folder` is created - is never asked about
  -- a table it does not have.
  -- ---------------------------------------------------------------------
  IF to_regclass('public.folder') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'folder'
    ) THEN
      residue := 'folders_not_published';
      identity := 'publication supabase_realtime';
      detail := 'folder is not a member of the supabase_realtime publication, so a '
             || 'folder deletion never reaches another client. Run: '
             || 'ALTER PUBLICATION supabase_realtime ADD TABLE folder;';
      RETURN NEXT;
    END IF;

    IF (SELECT relreplident FROM pg_class WHERE oid = 'public.folder'::regclass) <> 'f' THEN
      residue := 'folders_not_replica_identity_full';
      identity := 'pg_class.relreplident for public.folder';
      detail := 'folder does not have REPLICA IDENTITY FULL, so an UPDATE''s old '
             || 'record on the wire carries only the primary key and a deleted_at '
             || 'null-to-set transition is undetectable. Run: '
             || 'ALTER TABLE folder REPLICA IDENTITY FULL;';
      RETURN NEXT;
    END IF;
  END IF;

  -- Organization color swatches require both scope columns and a nullable
  -- personal owner. Without them the desktop can render the shared-palette UI
  -- but every organization query or insert fails at runtime.
  IF to_regclass('public.color_swatch') IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE column_name IN ('org_id', 'created_by')) = 2
      AND BOOL_OR(column_name = 'user_id' AND is_nullable = 'YES')
      INTO color_swatches_scope_columns
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'color_swatch';

    IF NOT COALESCE(color_swatches_scope_columns, false) THEN
      residue := 'color_swatches_scope_columns_missing';
      identity := 'public.color_swatch';
      detail := 'Organization color swatches require nullable user_id plus org_id and '
             || 'created_by columns. Re-run supabase/core.sql before verifying this release.';
      RETURN NEXT;
    END IF;

    SELECT
      EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.color_swatch'::regclass
           AND conname = 'color_swatch_scope_check'
      )
      AND EXISTS (
        SELECT 1
          FROM pg_trigger
         WHERE tgrelid = 'public.color_swatch'::regclass
           AND tgname = 'trg_color_swatch_set_creator'
           AND NOT tgisinternal
      )
      AND (
        SELECT COUNT(*) = 2
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'color_swatch'
           AND policyname IN (
             'color_swatch: users read',
             'color_swatch: users manage'
           )
      )
      INTO color_swatches_scope_controls;

    IF NOT COALESCE(color_swatches_scope_controls, false) THEN
      residue := 'color_swatches_scope_controls_missing';
      identity := 'public.color_swatch';
      detail := 'Organization color swatches require the scope constraint, creator trigger, '
             || 'and both access policies. Re-run supabase/core.sql before verifying this release.';
      RETURN NEXT;
    END IF;

    -- Shared palette changes reach other clients (schema 109). The renderer's
    -- DELETE subscription filters on org_id, which only matches when the old
    -- record carries every column, so publication membership alone is not enough.
    SELECT EXISTS (
             SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime'
                AND schemaname = 'public'
                AND tablename = 'color_swatch'
           )
       AND (SELECT relreplident FROM pg_class WHERE oid = 'public.color_swatch'::regclass) = 'f'
      INTO color_swatches_realtime;

    IF NOT COALESCE(color_swatches_realtime, false) THEN
      residue := 'color_swatches_not_realtime';
      identity := 'publication supabase_realtime';
      detail := 'color_swatch must be in the supabase_realtime publication with REPLICA '
             || 'IDENTITY FULL, or a shared palette change (a DELETE''s old record carries '
             || 'only the primary key, so the org_id filter never matches) never reaches '
             || 'another client. Run: ALTER TABLE color_swatch REPLICA IDENTITY FULL; '
             || 'ALTER PUBLICATION supabase_realtime ADD TABLE color_swatch;';
      RETURN NEXT;
    END IF;
  END IF;

  -- SOLIDWORKS serial numbers are readable by admins and by the licence's own
  -- assignee only (schema 106). A SELECT policy on solidworks_license with no
  -- is_org_admin() arm is a leftover such as the pre-106 "Org members can view"
  -- policy, which handed every member every serial; an assignment UPDATE policy without is_org_admin() lets a user repoint their
  -- assignment's license_id at somebody else's licence and read its serial.
  -- Policies are OR-ed, so one stale permissive policy undoes the release.
  IF to_regclass('public.solidworks_license') IS NOT NULL THEN
    FOR sw_licence_policy IN
      SELECT p.tablename, p.policyname
        FROM pg_policies p
       WHERE p.schemaname = 'public'
         AND (
           (p.tablename = 'solidworks_license'
             AND p.cmd IN ('SELECT', 'ALL')
             AND p.permissive = 'PERMISSIVE'
             AND COALESCE(p.qual, '') NOT LIKE '%is_org_admin()%')
           OR
           (p.tablename = 'solidworks_license_assignment'
             AND p.cmd IN ('SELECT', 'UPDATE', 'ALL')
             AND p.permissive = 'PERMISSIVE'
             AND COALESCE(p.qual, '') NOT LIKE '%is_org_admin()%')
         )
    LOOP
      residue := 'solidworks_license_policy_too_broad';
      identity := 'public.' || sw_licence_policy.tablename || ' / ' || sw_licence_policy.policyname;
      detail := 'This policy lets a non-admin read another user''s SOLIDWORKS serial number. '
             || 'Re-run supabase/modules/40-integrations.sql, which drops it.';
      RETURN NEXT;
    END LOOP;
  END IF;

  -- File data follows vault access (schema 111). Every permissive policy that
  -- lets a client read these tables (SELECT, or ALL, which includes it) must
  -- apply my_accessible_vault_ids(), directly or through the files subquery that
  -- names it. A leftover such as the pre-111 "Users can view org files" hands
  -- every member every file of the organization, and policies are OR-ed.
  FOR vault_policy IN
    SELECT p.tablename, p.policyname
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.tablename IN ('file', 'file_version', 'folder', 'file_reference',
                           'file_version_reference', 'drawing_pdf_render', 'release_file',
                           'file_comment', 'file_watcher', 'file_share_link',
                           'file_state_entry', 'file_workflow_assignment', 'workflow_history',
                           'workflow_review_history', 'activity', 'inspection_characteristic',
                           'inspection_characteristic_version', 'file_eco', 'file_deviation')
       AND p.cmd IN ('SELECT', 'ALL')
       AND p.permissive = 'PERMISSIVE'
       AND COALESCE(p.qual, '') NOT LIKE '%my_accessible_vault_ids()%'
  LOOP
    residue := 'file_policy_ignores_vault_access';
    identity := 'public.' || vault_policy.tablename || ' / ' || vault_policy.policyname;
    detail := 'This policy lets a member read file data in a vault they have no access to. '
           || 'Re-run supabase/modules/10-source-files.sql, 15-inspection.sql and '
           || '20-change-control.sql, which replace it, then drop it if it is still listed.';
    RETURN NEXT;
  END LOOP;

  -- Cross-tenant reads and the email forge (schema 111). organizations, users and
  -- vaults are readable inside the caller's organization only, and no client
  -- UPDATE on users may change email, which invitations, domain joins and blocks
  -- used to trust.
  FOR vault_policy IN
    SELECT p.tablename, p.policyname, p.cmd
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.permissive = 'PERMISSIVE'
       AND (
         (p.tablename IN ('organization', 'app_user', 'vault')
           AND p.cmd IN ('SELECT', 'ALL')
           AND btrim(COALESCE(p.qual, 'true')) IN ('true', '(true)'))
         OR
         (p.tablename = 'app_user'
           AND p.cmd IN ('UPDATE', 'ALL')
           AND COALESCE(p.with_check, p.qual, '') NOT LIKE '%email%')
       )
  LOOP
    residue := 'org_or_user_policy_too_broad';
    identity := 'public.' || vault_policy.tablename || ' / ' || vault_policy.policyname;
    detail := 'This ' || vault_policy.cmd || ' policy lets an account read another organization''s '
           || 'rows or rewrite its own email address. Re-run supabase/core.sql and '
           || 'modules/10-source-files.sql, which replace it.';
    RETURN NEXT;
  END LOOP;

  -- Secrets and logs that are admin-only (schema 112): the backup bucket keys and
  -- restic password, webhook signing secrets and their delivery log. A SELECT or
  -- ALL policy without is_org_admin() hands them to every member; any client write
  -- policy on webhook_delivery is a leftover of the TRUE "Service" policies.
  FOR vault_policy IN
    SELECT p.tablename, p.policyname, p.cmd
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.permissive = 'PERMISSIVE'
       AND (
         (p.tablename IN ('backup_config', 'webhook', 'webhook_delivery')
           AND p.cmd IN ('SELECT', 'ALL')
           AND COALESCE(p.qual, '') NOT LIKE '%is_org_admin()%')
         OR (p.tablename = 'webhook_delivery' AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE'))
       )
  LOOP
    residue := 'secret_table_policy_too_broad';
    identity := 'public.' || vault_policy.tablename || ' / ' || vault_policy.policyname;
    detail := 'This ' || vault_policy.cmd || ' policy exposes or lets clients write an admin-only '
           || 'table. Re-run supabase/modules/10-source-files.sql and 40-integrations.sql.';
    RETURN NEXT;
  END LOOP;

  -- Storage (schema 111). The application's buckets are vault (module 10's four
  -- policies) and org-extensions (module 50's four). Module 10 drops every other
  -- policy on storage.objects; one that remains - such as the dashboard-made
  -- "Allow authenticated access" policies granting `true` on every bucket - can
  -- hand any account any organization's files.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    FOR vault_policy IN
      SELECT p.tablename, p.policyname
        FROM pg_policies p
       WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
         AND p.policyname NOT IN ('Vault: read readable objects', 'Vault: upload to own organization',
                                  'Vault: update own or org assets', 'Vault: delete own or as admin',
                                  'Org members read their org extension packages',
                                  'Org admins upload extension packages',
                                  'Org admins update extension packages',
                                  'Org admins delete extension packages')
    LOOP
      residue := 'storage_policy_unmanaged';
      identity := 'storage.objects / ' || vault_policy.policyname;
      detail := 'A storage policy outside the managed set can admit reads or writes of any '
             || 'organization''s files. Re-run supabase/modules/10-source-files.sql, which drops it.';
      RETURN NEXT;
    END LOOP;
  END IF;

  -- Review and gate-review tables take no client writes (schema 107). Any
  -- INSERT, UPDATE, DELETE or ALL policy on them is a leftover such as the
  -- pre-107 "Reviewers can respond", which let a requester approve on behalf of
  -- every reviewer, or "Users can update pending reviews", which let a member
  -- approve a gate around gate_review_complete(). Policies are OR-ed, so one
  -- stale permissive policy undoes the release.
  FOR review_write_policy IN
    SELECT p.tablename, p.policyname, p.cmd
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.tablename IN ('review', 'review_response', 'review_item', 'review_round',
                           'review_round_item', 'review_decision', 'workflow_gate_review',
                           'workflow_review_history', 'file_version_reference',
                           'drawing_pdf_render')
       AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    residue := 'review_client_write_policy';
    identity := 'public.' || review_write_policy.tablename || ' / ' || review_write_policy.policyname;
    detail := 'A ' || review_write_policy.cmd || ' policy lets clients write this table, which only '
           || 'the review RPCs may write. Re-run supabase/modules/10-source-files.sql and '
           || '20-change-control.sql, which drop it.';
    RETURN NEXT;
  END LOOP;

  -- The rest of the review migration (schema 107), checked on its data.
  IF to_regclass('public.workflow_gate_review') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'workflow_gate_review'
         AND column_name = 'attempt_id' AND is_nullable = 'NO'
    ) THEN
      residue := 'pending_reviews_attempt_id_missing';
      identity := 'public.workflow_gate_review.attempt_id';
      detail := 'Gate approvals are counted per attempt and need a NOT NULL attempt_id. '
             || 'Re-run supabase/modules/10-source-files.sql.';
      RETURN NEXT;
    END IF;
  END IF;

  IF to_regclass('public.review_response') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conrelid = 'public.review_response'::regclass
         AND con.contype = 'u'
         AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
                FROM unnest(con.conkey) AS k(attnum)
                JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum)
             = ARRAY['review_id', 'reviewer_id']
    ) THEN
      residue := 'review_responses_legacy_key';
      identity := 'public.review_response';
      detail := 'A unique key on (review_id, reviewer_id) refuses every second review round. '
             || 'Re-run supabase/modules/20-change-control.sql.';
      RETURN NEXT;
    END IF;
  END IF;

  IF to_regclass('public.review_item') IS NOT NULL THEN
    FOR review_write_policy IN
      SELECT rv.id::text AS tablename, NULL::text AS policyname, NULL::text AS cmd
        FROM review rv
       WHERE rv.file_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM review_item i WHERE i.review_id = rv.id)
         AND EXISTS (SELECT 1 FROM file_version fv WHERE fv.file_id = rv.file_id)
       ORDER BY rv.created_at
       LIMIT 20
    LOOP
      residue := 'review_not_migrated';
      identity := 'review.id = ' || review_write_policy.tablename;
      detail := 'A pre-107 review whose file has a version was not migrated into a package. '
             || 'Re-run supabase/modules/20-change-control.sql.';
      RETURN NEXT;
    END LOOP;
  END IF;
  -- Review upkeep (schema 108). The triggers are what keep a departed reviewer
  -- or a deleted file from holding an open review forever; the manifest sees
  -- only their functions, so their presence is checked here.
  IF to_regclass('public.review_response') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'review_response'
         AND column_name = 'withdrawn_at'
    ) THEN
      residue := 'review_withdrawn_column_missing';
      identity := 'public.review_response.withdrawn_at';
      detail := 'Re-run supabase/modules/20-change-control.sql.';
      RETURN NEXT;
    END IF;

    FOR r IN
      SELECT x.tbl, x.tg
        FROM (VALUES
          ('app_user', 'trg_app_user_withdraw_lost_reviewers'),
          ('team_member', 'trg_team_member_withdraw_lost_reviewers'),
          ('vault_access', 'trg_vault_access_withdraw_lost_reviewers'),
          ('team_vault_access', 'trg_team_vault_access_withdraw_lost_reviewers'),
          ('review_item', 'trg_review_item_resettle_on_delete')
        ) AS x(tbl, tg)
       WHERE NOT EXISTS (
         SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid = to_regclass('public.' || x.tbl)
            AND t.tgname = x.tg
            AND NOT t.tgisinternal)
    LOOP
      residue := 'review_upkeep_trigger_missing';
      identity := 'public.' || r.tbl || ' / ' || r.tg;
      detail := 'Without this trigger an open review can wait forever on a reviewer who left or a '
             || 'file that was deleted. Re-run supabase/modules/20-change-control.sql.';
      RETURN NEXT;
    END LOOP;
  END IF;
END;
$$;

-- FUNCTIONS WHOSE ENTIRE DEFENCE IS THE ABSENCE OF AN EXECUTE GRANT
--
-- Some SECURITY DEFINER functions cannot be gated by an argument, because they
-- take no organization to check the caller against. The two extension-log
-- sweeps delete by age across every tenant at once; the two core seeders run
-- from the trg_organization_create_defaults trigger, before the new organization has any
-- members to be one of (seed_customer_categories, the third, left core with the
-- Customers extension in schema 104). For all four, not being callable is the
-- whole of the protection, and check_org_gates() cannot express that: with no p_org_id there
-- is no foreign id to substitute and no refusal to require.
--
-- So the ACL becomes the assertion. This list is small and hand-maintained on
-- purpose - it is a statement that somebody looked at each of these and
-- concluded the endpoint should not exist for a PostgREST caller, not a
-- heuristic. Adding a function here is cheap; the cost of leaving one out is
-- what release 95 nearly shipped.
--
-- Why this is separate from check_org_gates() rather than folded into it: that
-- function decides a verdict for every SECURITY DEFINER function in the schema,
-- and changing how it reaches one changes what the stamp means everywhere. This
-- asks a single closed question about four named functions and can only ever
-- add a problem for one of them.
CREATE OR REPLACE FUNCTION schema_get_withdrawn_execute_manifest()
RETURNS TABLE (module TEXT, signature TEXT)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    ('core',          'job_title_create_defaults(uuid,uuid)'),
    ('core',          'team_create_defaults(uuid,uuid)'),
    -- Notifies every organization at once; a scheduled caller only (schema 107).
    ('20-change-control', 'review_notify_overdue()'),
    -- Withdraws reviewers across every organization; its triggers only (schema 108).
    ('20-change-control', 'review_withdraw_lost_reviewers()')
$$;

-- 'reachable' is the only status that withholds the stamp. 'absent' is a module
-- that is not installed - optional modules are the normal case here, and a
-- function that does not exist cannot be called. 'withdrawn' is the healthy
-- state and carries the ACL that proves it, so a reader can see what is doing
-- the work rather than taking the word 'withdrawn' on trust.
CREATE OR REPLACE FUNCTION check_withdrawn_execute()
RETURNS TABLE (module TEXT, signature TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r        RECORD;
  v_oid    OID;
  v_roles  TEXT[];
  v_acl    TEXT;
BEGIN
  FOR r IN SELECT m.module, m.signature FROM schema_get_withdrawn_execute_manifest() m LOOP
    module    := r.module;
    signature := r.signature;
    v_oid     := to_regprocedure(r.signature);

    IF v_oid IS NULL THEN
      status := 'absent';
      detail := 'not installed on this database, so there is no endpoint to withdraw. '
             || 'If the module owning it is installed, this row is a missing object and '
             || 'check_schema_release() reports it as such.';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- The casts are load-bearing. `text[] || 'anon'` resolves to array_cat, so
    -- the untyped literal is parsed as an array and the whole check dies with
    -- 'malformed array literal: "authenticated"'. It only reaches that line
    -- when a function IS reachable, so a clean database never executed it and
    -- the bug read as a pass; NC19 is what found it.
    v_roles := ARRAY[]::TEXT[];
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      v_roles := v_roles || 'anon'::TEXT;
    END IF;
    IF has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      v_roles := v_roles || 'authenticated'::TEXT;
    END IF;

    SELECT COALESCE(p.proacl::TEXT, '(default: owner and PUBLIC)')
      INTO v_acl
    FROM pg_proc p WHERE p.oid = v_oid;

    IF cardinality(v_roles) > 0 THEN
      status := 'reachable';
      detail := array_to_string(v_roles, ' and ') || ' may EXECUTE this, so it is a live '
             || 'PostgREST endpoint. It takes no organization argument and checks no '
             || 'membership, so whoever calls it acts on every tenant at once. Withdraw it: '
             || 'REVOKE ALL ON FUNCTION ' || r.signature || ' FROM PUBLIC, anon, authenticated; '
             || 'ACL: ' || v_acl;
    ELSE
      status := 'withdrawn';
      detail := 'no PostgREST role may execute it. ACL: ' || v_acl;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- The only writer of schema_version. Stamps the release number if and only if
-- every requirement of every installed module is satisfied; on failure it
-- leaves the recorded version exactly as it was and reports what is wrong,
-- because a half-applied database is still whatever it was before, not zero.
--
-- "Every requirement" now includes the two security checks. They used to sit in
-- verify-schema.sql as RAISE NOTICE beside a stamp that consulted only the
-- manifest, so a database could be told it was reachable by anon and stamped
-- verified in the same run - which is what happened, and why the exposure
-- survived a passing verification. A check that cannot withhold the stamp is
-- commentary.
CREATE OR REPLACE FUNCTION verify_and_stamp_schema()
RETURNS JSON
LANGUAGE plpgsql AS $$
DECLARE
  v_problems JSON;
  v_count INTEGER;
  v_updated INTEGER;
BEGIN
  SELECT COALESCE(json_agg(p ORDER BY p->>'module', p->>'object'), '[]'::json),
         COUNT(*)
    INTO v_problems, v_count
  FROM (
    SELECT json_build_object(
             'module', module, 'object', identity, 'status', status, 'detail', detail
           ) AS p
    FROM check_schema_release()
    WHERE status IN ('missing', 'stale', 'extra')

    UNION ALL
    -- 'unverifiable' blocks alongside 'ungated'. This clause used to name
    -- 'ungated' alone, which meant a reachable function the probe could not
    -- judge either way was treated exactly like one it had certified. A check
    -- that cannot reach a verdict has to say so loudly or it is not a check;
    -- see the ELSE branch of check_org_gates() for what separates the two.
    SELECT json_build_object(
             'module', 'security', 'object', signature, 'status', status,
             'detail', detail
           )
    FROM check_org_gates()
    WHERE is_org_gate_status_blocking(status)

    UNION ALL
    SELECT json_build_object(
             'module', 'security', 'object', identity, 'status', 'anon-reachable',
             'detail', detail
           )
    FROM check_anon_reach()
    -- Advisory rows are reported by tools/verify-schema.sql and do not withhold
    -- the stamp. Advisory means one thing only: the caller is not permitted to
    -- change it - not a member of the role that granted it, not the owner of
    -- the object, not a superuser. On Supabase that is supabase_admin: the
    -- default-privilege row it holds, and anything an extension installed into
    -- public under its ownership. Real, printed in full, and impossible for the
    -- operator to act on. Treating it as fatal made a correctly installed
    -- database unstampable for ever, which is worse than saying so out loud.
    WHERE severity = 'blocking'

    UNION ALL
    SELECT json_build_object(
             'module', 'security', 'object', signature, 'status', 'null-unsafe-gate',
             'detail', detail
           )
    FROM check_null_unsafe_org_gates()

    UNION ALL
    SELECT json_build_object(
             'module', 'security', 'object', signature, 'status', 'unbound-entity-arg',
             'detail', detail
           )
    FROM check_unbound_entity_args()

    -- The class check_org_gates() structurally cannot judge: a SECURITY DEFINER
    -- function with no organization argument, whose only protection is that no
    -- PostgREST role may execute it. See schema_get_withdrawn_execute_manifest().
    UNION ALL
    SELECT json_build_object(
             'module', 'security', 'object', signature, 'status', 'execute-not-withdrawn',
             'detail', detail
           )
    FROM check_withdrawn_execute()
    WHERE status = 'reachable'

    UNION ALL
    SELECT json_build_object(
             'module', 'security', 'object', signature, 'status', 'definer-search-path',
             'detail', detail
           )
    FROM check_definer_search_path()

    -- What a closed hole already produced, which closing it does not undo.
    -- This is the half the manifest did not have: v92 shipped a correct fix
    -- for cross-tenant share links and stamped a database on which one was
    -- still live. See check_release_residue().
    UNION ALL
    SELECT json_build_object(
             'module', 'security', 'object', identity, 'status', residue,
             'detail', detail
           )
    FROM check_release_residue()
  ) s;

  IF v_count > 0 THEN
    RETURN json_build_object(
      'stamped', false,
      'version', (SELECT version FROM schema_version WHERE id = 1),
      'target_version', schema_release_version(),
      'problems', v_problems
    );
  END IF;

  UPDATE schema_version
  SET version = schema_release_version(),
      description = schema_release_description(),
      applied_at = NOW(),
      applied_by = 'verify-schema'
  WHERE id = 1;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- schema_version has RLS and only service_role may UPDATE it, so for anyone
  -- else the statement above matches no row and succeeds. Without this check the
  -- function returned {"stamped": true} with the recorded version untouched -
  -- reported as verified twice over, by a caller who could not write it and by a
  -- script that believed the caller. A write that did not happen is a failure,
  -- and saying so is the whole point of this function existing.
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Could not write schema_version: % is not permitted to update it. Run this from the Supabase SQL editor, which connects as postgres.', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN json_build_object(
    'stamped', true,
    'version', schema_release_version(),
    'target_version', schema_release_version(),
    'problems', '[]'::json
  );
END;
$$;

-- Stamping is an administrative act, not an endpoint: it is reached by pasting
-- tools/verify-schema.sql into the Supabase SQL editor, which connects as
-- postgres. Naming the roles matters - REVOKE ... FROM PUBLIC on its own leaves
-- the explicit anon and authenticated grants that Supabase's ALTER DEFAULT
-- PRIVILEGES puts on every new function, which is how anon came to be able to
-- call this at all.

-- What a schema file calls as its last act: ask to be verified, and report the
-- answer in one line. core.sql and every module end with this, so the version is
-- recorded by whichever file the operator happens to run last and there is no
-- separate step to forget.
--
-- WHY EVERY FILE MAY ASK, WHEN NO FILE MAY STAMP
--
-- Until 89 each file stamped the head version unconditionally at its end, and
-- that had to stop: the number is one global value while the files are
-- per-module, so `SELECT schema_version_update(88)` at the bottom of
-- 30-supply-chain.sql was a claim about seven files that module cannot see. It
-- recorded 88 over a database missing module 10's v87 work, and the app compared
-- 88 to its own 88 and showed no warning.
--
-- Delegating to verify_and_stamp_schema() removes the defect rather than the
-- convenience. The answer is computed from the whole release manifest and every
-- security check, so it does not depend on which file asked, and a file that
-- asks too early is simply told no. What was wrong was never that a schema file
-- did the asking; it was that being run counted as an answer.
--
-- This is deliberately quiet about failure - one line, no object list. During a
-- normal install every file but the last one gets a no, and seven paragraphs of
-- missing objects scrolling past on a correct install is how an operator learns
-- to ignore the output. tools/verify-schema.sql is the detailed report, and it
-- ends with an error rather than a notice.
--
-- It cannot raise, and that is load-bearing rather than defensive. The Supabase
-- SQL editor wraps a run in a single transaction, so an exception thrown here
-- would roll back the file that had just been applied successfully: an unstamped
-- install is a warning, a rolled-back one is an outage. verify_and_stamp_schema()
-- does raise, by design, when the caller may not write schema_version - which is
-- every role but two.
CREATE OR REPLACE FUNCTION schema_stamp_quiet()
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_result JSON;
  v_total INTEGER;
BEGIN
  BEGIN
    v_result := verify_and_stamp_schema();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Schema version not recorded: %', SQLERRM;
    RAISE WARNING 'The recorded version is unchanged. Run supabase/tools/verify-schema.sql from the Supabase SQL editor, which connects as postgres.';
    RETURN;
  END;

  IF (v_result->>'stamped')::BOOLEAN THEN
    RAISE NOTICE 'Schema verified and stamped at version %', v_result->>'version';
    RETURN;
  END IF;

  v_total := json_array_length(v_result->'problems');

  RAISE NOTICE 'Schema version not stamped: % outstanding item(s). Recorded version stays at %, this release is %.',
    v_total, v_result->>'version', v_result->>'target_version';
  RAISE NOTICE 'Expected until every file of this release has been applied - the last one records the version. supabase/tools/verify-schema.sql names each outstanding item.';
END;
$$;

-- Superseded by verify_and_stamp_schema(). Kept as a no-op so that an old copy
-- of a module file - which calls this at the end - neither fails halfway
-- through nor silently reinstates the false stamp it was written to make.
CREATE OR REPLACE FUNCTION schema_version_update(
  new_version INTEGER,
  new_description TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  RAISE WARNING 'schema_version_update() no longer records anything. Run supabase/tools/verify-schema.sql to verify and stamp the database.';
END;
$$ LANGUAGE plpgsql;

CREATE POLICY "schema_version: anyone read"
  ON schema_version FOR SELECT
  USING (true);

CREATE POLICY "schema_version: service role update"
  ON schema_version FOR UPDATE
  USING (auth.role() = 'service_role');

-- Full is_org_admin implementation
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_user_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT org_id INTO v_user_org_id FROM app_user WHERE id = v_user_id;
  
  IF v_user_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Admin means membership of the Administrators team OR app_user.role = 'admin'.
  -- These two notions drifted apart: the API routes check app_user.role while this
  -- function checked only the team, so an admin outside that team could use
  -- some features and be refused others.
  RETURN EXISTS(
    SELECT 1
    FROM app_user u
    WHERE u.id = v_user_id
      AND u.org_id = v_user_org_id
      AND u.role = 'admin'
  ) OR EXISTS(
    SELECT 1
    FROM team_member tm
    JOIN team t ON t.id = tm.team_id
    WHERE tm.user_id = v_user_id
      AND t.org_id = v_user_org_id
      AND t.name = 'Administrators'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION is_org_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_user_org_id UUID;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT org_id INTO v_user_org_id FROM app_user WHERE id = v_user_id;
  
  IF v_user_org_id IS NULL THEN
    RETURN false;
  END IF;

  -- Whether some other organization's user is an admin is not a question this
  -- answers. `false` rather than a raise, because RLS policies call this and a
  -- policy wants a predicate; the effect either way is that the caller learns
  -- nothing about a user outside their own organization.
  IF auth.uid() IS NOT NULL AND v_user_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_user_org_id) THEN
    RETURN false;
  END IF;
  
  -- Same dual definition as the no-argument overload above; keep them in step.
  RETURN EXISTS(
    SELECT 1
    FROM app_user u
    WHERE u.id = v_user_id
      AND u.org_id = v_user_org_id
      AND u.role = 'admin'
  ) OR EXISTS(
    SELECT 1
    FROM team_member tm
    JOIN team t ON t.id = tm.team_id
    WHERE tm.user_id = v_user_id
      AND t.org_id = v_user_org_id
      AND t.name = 'Administrators'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- User has team permission (convenience wrapper)
CREATE OR REPLACE FUNCTION has_team_permission(
  p_resource TEXT,
  p_action permission_action,
  p_vault_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN has_user_permission(auth.uid(), p_resource, p_action, p_vault_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE POLICY "blocked_user: admins read"
  ON blocked_user FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "blocked_user: admins manage"
  ON blocked_user FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "team: users read"
  ON team FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "team: admins insert"
  ON team FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "team: admins update"
  ON team FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "team: admins delete"
  ON team FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin() AND NOT is_system);

CREATE POLICY "team_member: users read"
  ON team_member FOR SELECT
  USING (team_id IN (SELECT id FROM team WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "team_member: admins manage"
  ON team_member FOR ALL
  USING (team_id IN (SELECT id FROM team WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

CREATE POLICY "team_reviewer: users read"
  ON team_reviewer FOR SELECT
  USING (team_id IN (SELECT id FROM team WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "team_reviewer: admins manage"
  ON team_reviewer FOR ALL
  USING (team_id IN (SELECT id FROM team WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

CREATE POLICY "team_permission: users read"
  ON team_permission FOR SELECT
  USING (team_id IN (SELECT id FROM team WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "team_permission: admins manage"
  ON team_permission FOR ALL
  USING (team_id IN (SELECT id FROM team WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

CREATE POLICY "permission_preset: users read"
  ON permission_preset FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "permission_preset: admins manage"
  ON permission_preset FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "user_permission: users read own"
  ON user_permission FOR SELECT
  USING (user_id = auth.uid() OR 
    user_id IN (SELECT id FROM app_user WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "user_permission: admins manage"
  ON user_permission FOR ALL
  USING (user_id IN (SELECT id FROM app_user WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

CREATE POLICY "module_access: users read"
  ON module_access FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "module_access: admins manage"
  ON module_access FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "job_title: users read"
  ON job_title FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "job_title: admins manage"
  ON job_title FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "user_job_title: users read"
  ON user_job_title FOR SELECT
  USING (title_id IN (SELECT id FROM job_title WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "user_job_title: admins manage"
  ON user_job_title FOR ALL
  USING (title_id IN (SELECT id FROM job_title WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

-- THE ONLY EMAIL THAT DECIDES MEMBERSHIP (schema 111)
--
-- An invitation, an email_domains match and a block all name an address, so the
-- address has to be one the account has proven it owns. public.app_user.email was
-- what every one of them read, and until 111 the self-update policy left it
-- writable: PATCH your own email to an invitee's address, call
-- user_ensure_org_id(), and the invitation's organization, role, teams and vaults
-- were yours. auth.users.email with email_confirmed_at set is the address Supabase
-- Auth has verified; NULL when the account has not confirmed one.
--
-- Internal: it takes a user id, and which address another account has is not a
-- question a client gets to ask.
CREATE OR REPLACE FUNCTION user_get_verified_email(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LOWER(au.email)
    FROM auth.users au
   WHERE au.id = p_user_id
     AND au.email_confirmed_at IS NOT NULL
     AND au.email IS NOT NULL;
$$;

-- The caller's own verified address, for policies.
CREATE OR REPLACE FUNCTION my_verified_email()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_get_verified_email(auth.uid());
$$;

CREATE POLICY "pending_org_member: admins read"
  ON pending_org_member FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin()
    -- Schema 111: an invitee sees their own invitation by verified address only.
    OR LOWER(email) = my_verified_email()
  );

CREATE POLICY "pending_org_member: admins manage"
  ON pending_org_member FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "admin_recovery_code: admins read"
  ON admin_recovery_code FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "admin_recovery_code: admins insert"
  ON admin_recovery_code FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "admin_recovery_code: admins update"
  ON admin_recovery_code FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "user_session: users read own"
  ON user_session FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "user_session: org members read"
  ON user_session FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "user_session: users manage own"
  ON user_session FOR ALL
  USING (user_id = auth.uid())
  -- Schema 112: a session row is filed under the caller's own organization; it
  -- decides who appears in another organization's presence list.
  WITH CHECK (user_id = auth.uid() AND org_id IN (SELECT u.org_id FROM app_user u WHERE u.id = auth.uid()));

CREATE POLICY "notification: users read own"
  ON notification FOR SELECT
  USING (user_id = auth.uid());

-- WITH CHECK since 105: without it a user could hand their notification to
-- somebody else by rewriting user_id.
CREATE POLICY "notification: users update own"
  ON notification FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Schema 105: the recipient must be in the caller's organization and the sender,
-- when named, must be the caller. The check was org_id alone, so a member could
-- drop a notification with a spoofed sender into any user's inbox in any
-- organization. Review notifications are written by the review RPCs, which are
-- SECURITY DEFINER and do not pass through this policy.
CREATE POLICY "notification: system insert"
  ON notification FOR INSERT
  WITH CHECK (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    AND user_id IN (SELECT u.id FROM app_user u WHERE u.org_id = notification.org_id)
    -- Schema 112: the sender is always the caller. A NULL sender read as a
    -- system notice, which any member could forge into a colleague's inbox.
    AND from_user_id = auth.uid()
  );

-- Creator attribution is assigned by the database. Authenticated clients
-- cannot impersonate another user by supplying or changing created_by. Schema
-- maintenance without auth.uid() may backfill a legacy NULL or let the FK
-- clear an attribution when its creator is deleted. PostgreSQL executes that
-- FK action through a nested trigger, unlike a direct client update.
CREATE OR REPLACE FUNCTION trg_color_swatch_set_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  ELSIF (auth.uid() IS NOT NULL AND pg_trigger_depth() = 1)
    OR (OLD.created_by IS NOT NULL AND NEW.created_by IS NOT NULL) THEN
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_color_swatch_set_creator
  BEFORE INSERT OR UPDATE OF created_by ON color_swatch
  FOR EACH ROW EXECUTE FUNCTION trg_color_swatch_set_creator();

CREATE POLICY "color_swatch: users read"
  ON color_swatch FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM app_user
      WHERE app_user.id = auth.uid()
        AND app_user.org_id = color_swatch.org_id
    )
  );

CREATE POLICY "color_swatch: users manage"
  ON color_swatch FOR ALL
  USING (
    user_id = auth.uid()
    OR (
      is_org_admin()
      AND EXISTS (
        SELECT 1 FROM app_user
        WHERE app_user.id = auth.uid()
          AND app_user.org_id = color_swatch.org_id
      )
    )
  )
  WITH CHECK (
    (user_id = auth.uid() AND org_id IS NULL)
    OR (
      user_id IS NULL
      AND org_id IS NOT NULL
      AND is_org_admin()
      AND EXISTS (
        SELECT 1 FROM app_user
        WHERE app_user.id = auth.uid()
          AND app_user.org_id = color_swatch.org_id
      )
    )
  );

-- ===========================================
-- CORE FUNCTIONS
-- ===========================================

-- The membership gate every SECURITY DEFINER RPC that takes a p_org_id must pass.
--
-- SECURITY DEFINER runs as the schema owner, so RLS does not apply and the
-- policies on organizations, files and the rest are simply not consulted.
-- p_org_id then becomes an unauthenticated instruction: whatever organization
-- the caller names is the organization the function operates on. PostgREST
-- exposes every function in the public schema that the calling role may
-- execute, and a function created without an explicit REVOKE is executable by
-- PUBLIC, which includes anon - so the argument is reachable without logging in
-- at all. This raises instead, and every such function calls it first.
--
-- A caller who names an organization that does not exist gets the same
-- authorization error as one who names an organization they are not in: the
-- alternative is a probe that reports which organization IDs are real, and the
-- caller has no business knowing either way. A NULL argument is a client bug
-- rather than an attack, so it says so.
CREATE OR REPLACE FUNCTION org_require_member(p_org_id UUID)
RETURNS VOID AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app_user WHERE id = auth.uid() AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- The same question as org_require_member(), for the callers that answer with a
-- value rather than by raising - a set-returning function that returns no rows,
-- or one that returns {"success": false, ...}.
--
-- It exists so that those callers stop writing the test out by hand. The
-- hand-written form was
--
--   p_org_id NOT IN (SELECT org_id FROM users WHERE id = auth.uid())
--
-- which is NULL, not true, for an account whose app_user.org_id is still NULL, so
-- the IF was not taken and the function proceeded. This returns a strict
-- boolean: false for a NULL argument, false for no JWT, false for a user with
-- no organization, false for a different organization. There is no input for
-- which it is neither true nor false, which is the whole point.
CREATE OR REPLACE FUNCTION is_org_member(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_org_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM app_user
       WHERE id = auth.uid() AND org_id = p_org_id
     );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Who is acting. The only honest answer to that question inside a SECURITY
-- DEFINER function.
--
-- Several RPCs took the acting user as a p_user_id argument and wrote it into
-- file.checked_out_by, activity.user_id and workflow_history.performed_by. The
-- caller therefore chose what the audit trail said, and could name anyone: the
-- record of who locked a file was whatever the request body claimed. Every one
-- of those functions now derives the actor here and ignores the argument, which
-- is kept only so that existing callers - api/routes/files.ts and the renderer -
-- keep compiling and keep working. They already pass the signed-in user's id, so
-- nothing changes for them except that it is no longer load-bearing.
CREATE OR REPLACE FUNCTION my_actor_id()
RETURNS UUID AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  RETURN v_uid;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Gate for a function that takes some other user's id and answers questions
-- about them: the two must share an organization. Same reasoning as
-- org_require_member - an id that belongs to nobody gets the same refusal as one
-- that belongs to another organization, so the function is not a directory of
-- which user ids exist.
CREATE OR REPLACE FUNCTION user_require_same_org(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_actor UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_actor := my_actor_id();

  IF p_user_id = v_actor THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app_user target
    JOIN app_user actor ON actor.org_id = target.org_id
    WHERE target.id = p_user_id AND actor.id = v_actor
  ) THEN
    RAISE EXCEPTION 'Not authorized for this user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- ===========================================
-- WHO MAY EXECUTE WHAT
-- ===========================================
-- The single list of functions an unauthenticated caller is allowed to reach.
-- Everything else in public is withdrawn from anon by
-- anon_enforce_execute_posture() below.
--
-- Keep this short and justify every entry. A function here is reachable over
-- PostgREST by anyone on the internet holding the publishable anon key.
CREATE OR REPLACE FUNCTION anon_get_execute_allowlist()
RETURNS TABLE (signature TEXT, reason TEXT)
LANGUAGE sql IMMUTABLE AS $$
  SELECT * FROM (VALUES
    -- The sign-in screen calls this before anyone has signed in, to decide which
    -- sign-in buttons to show. It takes an org slug, not an org id, and returns
    -- only which auth methods are enabled.
    ('org_get_auth_providers(text)', 'sign-in screen, pre-login'),
    ('client_min_version()', 'the oldest app allowed to connect, read before sign-in'),
    -- File share links are opened by recipients who are not BluePLM users. The
    -- unguessable token in the link is the credential - which is only true
    -- since file_share_link_generate_token() started producing 128 bits from a strong
    -- source instead of twelve characters of random().
    ('file_share_link_validate(text)', 'share link recipients, pre-login'),
    -- The download itself. Split out of file_share_link_validate() so that asking
    -- whether a link is good no longer spends one of its downloads.
    ('file_share_link_consume(text)', 'share link recipients, pre-login')
  ) AS a(signature, reason);
$$;

-- Withdraw EXECUTE from anon on everything in public except that allowlist.
--
-- The previous version of this did the wrong thing in two ways, and the
-- combination is why 149 functions were reachable by anon on a stock Supabase
-- project while the verification script printed an all-clear.
--
-- First, it revoked FROM PUBLIC. Supabase's bootstrap runs
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
--
-- which *adds* to the built-in default rather than replacing it, so a new
-- function's proacl is
-- `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.
-- REVOKE ... FROM PUBLIC strips only the leading `=X/postgres`. The explicit
-- `anon=X/postgres` survives untouched and PostgREST keeps exposing the
-- function to anon. The only thing that removes it is naming the role.
--
-- Second, it asked `has_function_privilege('public', ...)` to decide whether
-- there was anything to do. On a database where the bootstrap had run, that is
-- false for a function that anon can nonetheless execute, so the loop selected
-- nothing and the function returned 0 - a clean bill of health over a fully
-- open schema.
--
-- The scope is also wider than before. It used to cover only SECURITY DEFINER
-- functions taking a p_org_id, which missed every function that reaches an
-- organization through an entity id instead - file_checkout, file_move and the
-- rest. anon has no business executing anything here, so the rule is now
-- "nothing except the allowlist" rather than an attempt to enumerate the
-- dangerous ones.
--
-- Doing this by class rather than one REVOKE per function is still deliberate:
-- these modules DROP and re-CREATE functions, which discards the ACL, so the
-- privileges are rebuilt from default on every install and the revoke has to be
-- part of the install to mean anything. core.sql and each module call this at
-- the end of their own file.
--
-- Where a function is reachable through PUBLIC as well as through the explicit
-- anon grant, both have to go. Withdrawing PUBLIC would also take the privilege
-- from any other role that only held it that way, so every such role's access
-- is first pinned down as an explicit grant. No role but anon loses anything.
CREATE OR REPLACE FUNCTION anon_enforce_execute_posture()
RETURNS INTEGER AS $$
DECLARE
  v_preserve TEXT[];
  v_allowed TEXT[];
  v_keep TEXT[];
  v_role TEXT;
  r RECORD;
  d RECORD;
  v_count INTEGER := 0;
  v_stuck TEXT[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RETURN 0;
  END IF;

  -- Roles an ACL can actually constrain. Superusers ignore ACLs, pg_* are
  -- built-in, and anon is the role being withdrawn.
  v_preserve := ARRAY(
    SELECT rolname FROM pg_roles
    WHERE NOT rolsuper AND rolname <> 'anon' AND rolname NOT LIKE 'pg\_%'
  );
  v_allowed := ARRAY(SELECT signature FROM anon_get_execute_allowlist());

  -- EVERY ROUTINE, NOT JUST prokind = 'f'
  --
  -- This loop filtered `prokind = 'f'` while check_anon_reach() filtered
  -- nothing, so the two disagreed about what an anon-reachable routine is. A
  -- PROCEDURE created in public - which a later migration may well do - was
  -- graded blocking by the check, untouched by this sweep, and the remedy the
  -- verifier printed was a call to this function. It returned 0 and changed
  -- nothing, for ever. That is the same defect v90 had, in a new place: a
  -- blocking condition with no way out.
  --
  -- ON ROUTINE rather than ON FUNCTION is the whole fix: FUNCTION covers
  -- functions, aggregates and window functions but not procedures, and ROUTINE
  -- covers all four.
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::TEXT AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT (p.oid::regprocedure::TEXT = ANY (v_allowed))
  LOOP
    -- Nothing this role granted, nothing this role can take back. Attempting it
    -- produces "WARNING: no privileges could be revoked" and, worse, the
    -- re-grant below then fires a warning per preserved role while achieving
    -- nothing. Skip it and record it, so the count this function returns is a
    -- count of things that changed rather than of things it tried.
    IF EXISTS (
      SELECT 1 FROM unnest(anon_list_revoke_grantors(r.oid)) g
      WHERE NOT pg_has_role(current_user, g, 'MEMBER')
    ) AND NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false)
    THEN
      v_stuck := array_append(v_stuck, r.signature);
      CONTINUE;
    END IF;

    SELECT ARRAY(
      SELECT role_name FROM unnest(v_preserve) AS role_name
      WHERE has_function_privilege(role_name, r.oid, 'EXECUTE')
    ) INTO v_keep;

    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM anon', r.signature);

    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      FOREACH v_role IN ARRAY v_keep LOOP
        EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO %I', r.signature, v_role);
      END LOOP;
      EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC', r.signature);
    END IF;

    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      v_stuck := array_append(v_stuck, r.signature);
    ELSE
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF array_length(v_stuck, 1) > 0 THEN
    RAISE WARNING 'anon can still execute % routine(s) in public that % is not permitted to revoke: %. They were granted by a role you are not a member of - on Supabase that means an extension installed into public by supabase_admin. check_anon_reach() reports them as advisory, so they will not withhold the stamp, but anon can call them.',
      array_length(v_stuck, 1), current_user, array_to_string(v_stuck, ', ');
  END IF;

  -- Cancel the bootstrap's explicit anon grant on routines created from here on.
  --
  -- Default privileges are recorded per granting role, so each role that has one
  -- needs its own statement. Supabase sets them for postgres and also for
  -- supabase_admin, and postgres is not a member of supabase_admin, so the
  -- second one cannot be cancelled from the SQL editor by anybody. That is not
  -- a fault to be fixed here and it must not block a release:
  -- check_anon_reach() reports it as advisory for a caller who could not have
  -- cancelled it, and tools/emergency-lockdown.sql says the same.
  --
  -- ON ROUTINES, not ON FUNCTIONS: they write the same pg_default_acl row, but
  -- the ROUTINES spelling is the one that says what is meant, now that this
  -- file cares about procedures.
  FOR d IN
    SELECT DISTINCT pg_get_userbyid(a.defaclrole) AS grantor
    FROM pg_default_acl a
    JOIN pg_namespace n ON n.oid = a.defaclnamespace
    WHERE n.nspname = 'public'
      AND a.defaclobjtype = 'f'
      AND EXISTS (
        SELECT 1 FROM aclexplode(a.defaclacl) x
        WHERE x.grantee = 'anon'::regrole AND x.privilege_type = 'EXECUTE'
      )
  LOOP
    -- NOTE: everything inside this handler is swallowed, including a RAISE that
    -- was meant to abort. Nothing here is a gate, so that is safe today. If a
    -- check is ever added to this loop, put it before the BEGIN.
    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM anon',
        d.grantor
      );
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Could not cancel the anon default privilege held by % - % is not a member of that role. Advisory: it governs routines created BY %, and BluePLM''s are created by %, which this sweep closes.',
        d.grantor, current_user, d.grantor, current_user;
    END;
  END LOOP;

  -- MAKE THE NEXT ROUTINE BORN CLOSED
  --
  -- The previous release said this was impossible:
  --
  --   "There is no version of this loop that makes a later function born
  --    closed."
  --
  -- That was measured with `IN SCHEMA public` and is only true of that form.
  -- Postgres builds a new object's ACL in get_user_default_acl(): if there is
  -- no default-privilege row at all it uses the hard-wired default, which for a
  -- routine is EXECUTE to PUBLIC; if there IS a *global* row - one written
  -- without IN SCHEMA - that row REPLACES the hard-wired default, and the
  -- schema-scoped row is then merged on top of it. So a schema-scoped REVOKE
  -- cannot remove `=X/postgres`, and a global one can, which is exactly the
  -- asymmetry that made the claim look true.
  --
  -- Measured in the harness on Postgres 17, as postgres, after the loop above
  -- has removed anon from the schema-scoped row:
  --
  --   before  {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
  --   after   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
  --
  -- anon f, authenticated t, and the same for a procedure. A function or
  -- procedure created by this role afterwards - by a migration written next
  -- year, by anybody - is not reachable by anon and needs no sweep to make it
  -- so. This is structural in a way that sweeping after the fact is not: the
  -- sweep only ever closes what already exists.
  --
  -- Scoped to current_user because that is the only role whose default
  -- privileges we are entitled to change, and it is the role that creates every
  -- BluePLM object. It does not touch supabase_admin's, and it does not need
  -- to: supabase_admin's row governs objects supabase_admin creates.
  --
  -- check_anon_reach() stays blocking regardless. Being born closed removes the
  -- usual way in; it is not a reason to stop looking.
  BEGIN
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon',
      current_user
    );
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not set a global default privilege for % - routines created later will be born reachable by anon and will need this sweep run again.',
      current_user;
  END;

  -- Views and materialized views.
  --
  -- These were not swept at all, and nothing checked them. part_with_pricing
  -- is a view, so relkind = 'v', and every inventory in the release filtered
  -- relkind = 'r'. It was readable at GET /rest/v1/parts_with_pricing with no
  -- JWT, and it returned every organization's rows because a view without
  -- security_invoker reads its base tables as its owner and the owner holds
  -- BYPASSRLS. Revoking anon is half the fix; the other half is
  -- security_invoker on the view itself, which is set where the view is
  -- defined and checked by check_anon_reach().
  --
  -- The allowlist is anon_get_read_allowlist(), which holds schema_version and
  -- nothing else. Nothing else pre-login reads a relation directly.
  --
  -- has_any_column_privilege on the way in, because a column-level grant is
  -- invisible to has_table_privilege and this loop would step over it while
  -- check_anon_reach() reported it - a blocking condition the remedy could not
  -- clear, which is the defect this whole file has now been through twice.
  -- REVOKE ALL ON TABLE does remove column grants (measured in the harness:
  -- has_any_column_privilege goes t -> f), so the remedy itself needed nothing.
  FOR r IN
    SELECT c.oid, quote_ident(c.relname) AS signature
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'f', 'v', 'm')
      AND NOT c.relispartition
      AND (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
           OR has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))
      AND NOT EXISTS (SELECT 1 FROM anon_get_read_allowlist() a WHERE a.relname = c.relname)
  LOOP
    SELECT ARRAY(
      SELECT role_name FROM unnest(v_preserve) AS role_name
      WHERE has_any_column_privilege(role_name, r.oid, 'SELECT')
    ) INTO v_keep;

    EXECUTE format('REVOKE ALL ON TABLE public.%s FROM anon', r.signature);

    IF has_any_column_privilege('anon', r.oid, 'SELECT') THEN
      FOREACH v_role IN ARRAY v_keep LOOP
        EXECUTE format('GRANT SELECT ON TABLE public.%s TO %I', r.signature, v_role);
      END LOOP;
      EXECUTE format('REVOKE ALL ON TABLE public.%s FROM PUBLIC', r.signature);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- The allowlist has to be granted back explicitly, because cancelling the
  -- default privilege means a re-created allowlisted function no longer gets
  -- anon from the bootstrap.
  -- 5.0: an allowlisted relation is readable by anon, never writable.
  FOR r IN
    SELECT quote_ident(c.relname) AS signature
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN anon_get_read_allowlist() a ON a.relname = c.relname
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%s FROM anon', r.signature);
  END LOOP;

  -- 5.0: the next table is born closed to anon, as the next routine is.
  FOR d IN
    SELECT DISTINCT pg_get_userbyid(a.defaclrole) AS grantor
    FROM pg_default_acl a
    JOIN pg_namespace n ON n.oid = a.defaclnamespace
    WHERE n.nspname = 'public'
      AND a.defaclobjtype = 'r'
      AND EXISTS (SELECT 1 FROM aclexplode(a.defaclacl) x WHERE x.grantee = 'anon'::regrole)
  LOOP
    BEGIN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon', d.grantor);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Could not cancel the anon table default privilege held by % - % is not a member of that role. Advisory: BluePLM''s tables are created by %, which this sweep closes.',
        d.grantor, current_user, current_user;
    END;
  END LOOP;

  FOR r IN SELECT signature FROM anon_get_execute_allowlist() LOOP
    IF to_regprocedure('public.' || r.signature) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon', r.signature);
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Kept under its old name so that an older copy of a module file - which calls
-- this at the end - still applies the current posture rather than failing.
CREATE OR REPLACE FUNCTION org_rpc_revoke_public_execute()
RETURNS INTEGER AS $$
  SELECT anon_enforce_execute_posture();
$$ LANGUAGE sql;

-- Get user permissions
CREATE OR REPLACE FUNCTION user_permission_list(p_user_id UUID, p_vault_id UUID DEFAULT NULL)
RETURNS TABLE (
  resource TEXT,
  vault_id UUID,
  actions permission_action[]
) AS $$
BEGIN
  -- The full permission map of any user in the database, for whoever asked.
  PERFORM user_require_same_org(p_user_id);

  RETURN QUERY
  SELECT 
    tp.resource,
    tp.vault_id,
    array_agg(DISTINCT a) AS actions
  FROM team_member tm
  JOIN team_permission tp ON tm.team_id = tp.team_id
  CROSS JOIN unnest(tp.actions) AS a
  WHERE tm.user_id = p_user_id
    AND (
      (p_vault_id IS NULL AND tp.vault_id IS NULL) OR
      (p_vault_id IS NOT NULL AND (tp.vault_id IS NULL OR tp.vault_id = p_vault_id))
    )
  GROUP BY tp.resource, tp.vault_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- User has permission check
CREATE OR REPLACE FUNCTION has_user_permission(
  p_user_id UUID,
  p_resource TEXT,
  p_action permission_action,
  p_vault_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_has_permission BOOLEAN := false;
BEGIN
  -- RLS policies on files and elsewhere reach this through
  -- has_team_permission(auth.uid(), ...), so it has to stay a predicate:
  -- an unauthenticated caller has no permissions, and that is `false`, not an
  -- error. Raising here would turn a policy denial into a failed statement.
  IF p_user_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Asking about somebody else is only allowed within your own organization.
  IF p_user_id <> auth.uid() THEN
    PERFORM user_require_same_org(p_user_id);
  END IF;

  IF is_org_admin(p_user_id) THEN
    RETURN true;
  END IF;
  
  SELECT EXISTS(
    SELECT 1
    FROM team_member tm
    JOIN team_permission tp ON tm.team_id = tp.team_id
    WHERE tm.user_id = p_user_id
      AND tp.resource = p_resource
      AND (
        p_action = ANY(tp.actions)
        -- An 'admin' grant on a resource implies every action on it. The UI has
        -- always treated it that way; this function did not, so a team granted
        -- only 'admin' was shown controls the database then refused.
        OR 'admin'::permission_action = ANY(tp.actions)
      )
      AND (tp.vault_id IS NULL OR tp.vault_id = p_vault_id)
  ) INTO v_has_permission;
  
  RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION user_ensure_org_id()
RETURNS JSON AS $$
DECLARE
  current_user_id UUID;
  current_org_id UUID;
  user_email TEXT;
  auth_user RECORD;
  pending RECORD;
  user_exists BOOLEAN;
  resolved_org_id UUID;
  default_team_id UUID;
  resolution TEXT;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT org_id, email INTO current_org_id, user_email
  FROM app_user WHERE id = current_user_id;
  
  user_exists := user_email IS NOT NULL;
  
  IF NOT user_exists THEN
    SELECT id, email, raw_user_meta_data INTO auth_user
    FROM auth.users WHERE id = current_user_id;
    
    IF auth_user.id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Auth user not found');
    END IF;
    
    -- Schema 111: only a confirmed address claims an invitation.
    SELECT * INTO pending
    FROM pending_org_member
    WHERE LOWER(email) = user_get_verified_email(current_user_id)
      AND claimed_at IS NULL
    LIMIT 1;

    INSERT INTO public.app_user (id, email, full_name, avatar_url, org_id, role)
    VALUES (
      auth_user.id,
      auth_user.email,
      COALESCE(auth_user.raw_user_meta_data->>'full_name', auth_user.raw_user_meta_data->>'name'),
      COALESCE(auth_user.raw_user_meta_data->>'avatar_url', auth_user.raw_user_meta_data->>'picture'),
      pending.org_id,
      COALESCE(pending.role, 'engineer')::user_role
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.app_user.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.app_user.avatar_url),
      org_id = COALESCE(public.app_user.org_id, EXCLUDED.org_id),
      role = CASE WHEN public.app_user.org_id IS NULL THEN EXCLUDED.role ELSE public.app_user.role END;
    
    IF pending.id IS NOT NULL THEN
      PERFORM team_member_apply_pending(current_user_id);
    END IF;
    
    SELECT org_id, email INTO current_org_id, user_email
    FROM app_user WHERE id = current_user_id;
    
    RETURN json_build_object(
      'success', true,
      'created_user', true,
      'has_org', current_org_id IS NOT NULL,
      'org_id', current_org_id
    );
  END IF;
  
  IF current_org_id IS NOT NULL THEN
    RETURN json_build_object('success', true, 'has_org', true, 'org_id', current_org_id);
  END IF;
  
  -- THE ROW EXISTS AND HAS NO ORGANIZATION
  --
  -- Until this release the function stopped here and told the caller to use an org code, which
  -- was the wrong answer for an account that already had an invitation or an address in an
  -- organization's email_domains. The client compensated by writing app_user.org_id itself, and
  -- schema 95 - correctly - made that write impossible: the self-update policy pins org_id to
  -- its current value. The client kept issuing the PATCH, PostgREST kept refusing it, and the
  -- refusal was logged as a warning and otherwise ignored, so the account carried on with
  -- org_id NULL while its user_session row named the organization. It appeared in the presence
  -- indicator and in nothing that reads membership, and no admin could repair it either, since
  -- the admin policy is gated on `org_id IN (...)` and NULL IN (...) is NULL.
  --
  -- Resolving it here is what closes that: this function is SECURITY DEFINER, so it is the one
  -- caller that may write the column, and it runs on every boot, so an account already stranded
  -- is repaired the next time it signs in.
  --
  -- Order matters. An invitation is an explicit decision about one person and carries a role,
  -- teams and vaults; a domain match is a standing rule about an address. The invitation wins.
  --
  -- Schema 111: the address is the one Supabase Auth verified (user_get_verified_email()), never
  -- public.app_user.email, which a client could once rewrite. An unconfirmed account resolves
  -- nothing until it confirms.
  user_email := user_get_verified_email(current_user_id);
  IF user_email IS NULL THEN
    RETURN json_build_object(
      'success', true,
      'has_org', false,
      'message', 'Confirm your email address to join an organization'
    );
  END IF;

  SELECT * INTO pending
  FROM pending_org_member
  WHERE LOWER(email) = user_email
    AND claimed_at IS NULL
  LIMIT 1;
  
  IF pending.org_id IS NOT NULL THEN
    resolved_org_id := pending.org_id;
    resolution := 'pending_invite';
  ELSE
    SELECT id INTO resolved_org_id
    FROM organization
    WHERE split_part(user_email, '@', 2) = ANY(email_domains)
    ORDER BY id
    LIMIT 1;
    
    IF resolved_org_id IS NOT NULL THEN
      resolution := 'email_domain';
    END IF;
  END IF;
  
  IF resolved_org_id IS NULL THEN
    RETURN json_build_object(
      'success', true,
      'has_org', false,
      'message', 'User needs to join an organization via org code'
    );
  END IF;
  
  -- Honoured here as well as in org_join_by_slug. A block has to hold on every route into an
  -- organization or it holds on none of them.
  IF EXISTS (
    SELECT 1 FROM blocked_user
    WHERE org_id = resolved_org_id AND LOWER(email) = LOWER(user_email)
  ) THEN
    RETURN json_build_object(
      'success', false,
      'has_org', false,
      'error', 'You have been blocked from this organization'
    );
  END IF;
  
  -- Fires trg_app_user_claim_pending_membership, which applies the invitation's teams and vaults and
  -- stamps claimed_at. That trigger only ever fires on org_id changing, so it cannot run twice.
  UPDATE app_user
  SET org_id = resolved_org_id,
      role = CASE WHEN pending.role IS NOT NULL THEN pending.role ELSE role END
  WHERE id = current_user_id;
  
  -- An invitation names the teams; a domain match does not, so it takes the organization's
  -- default. org_join_by_slug does the same thing for the org-code route, and an account that
  -- arrives on this route used to land in no team at all.
  IF resolution = 'email_domain' THEN
    SELECT default_new_user_team_id INTO default_team_id
    FROM organization WHERE id = resolved_org_id;
    
    IF default_team_id IS NOT NULL THEN
      INSERT INTO team_member (team_id, user_id, added_by)
      VALUES (default_team_id, current_user_id, current_user_id)
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'has_org', true,
    'org_id', resolved_org_id,
    'resolved_by', resolution
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Update last online
CREATE OR REPLACE FUNCTION user_update_last_online()
RETURNS JSON AS $$
DECLARE
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  UPDATE app_user SET last_online_at = NOW() WHERE id = current_user_id;
  
  RETURN json_build_object('success', true, 'timestamp', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Join org by slug
CREATE OR REPLACE FUNCTION org_join_by_slug(p_org_slug TEXT)
RETURNS JSON AS $$
DECLARE
  current_user_id UUID;
  current_org_id UUID;
  target_org_id UUID;
  target_org_name TEXT;
  default_team_id UUID;
  user_email TEXT;
  email_domain TEXT;
  enforce_domain BOOLEAN;
  allowed_domains TEXT[];
  auth_user_email TEXT;
  auth_user_name TEXT;
  auth_user_avatar TEXT;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT org_id, email INTO current_org_id, user_email
  FROM app_user WHERE id = current_user_id;
  
  IF user_email IS NULL THEN
    SELECT email, 
           COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
           COALESCE(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture')
    INTO auth_user_email, auth_user_name, auth_user_avatar
    FROM auth.users WHERE id = current_user_id;
    
    IF auth_user_email IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Authentication error', 'retry', false);
    END IF;
    
    INSERT INTO app_user (id, email, full_name, avatar_url, org_id)
    VALUES (current_user_id, auth_user_email, auth_user_name, auth_user_avatar, NULL)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, app_user.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, app_user.avatar_url);
    
    user_email := auth_user_email;
  END IF;
  
  IF current_org_id IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are already a member of an organization');
  END IF;

  -- Schema 111: the verified address decides, as in user_ensure_org_id().
  user_email := user_get_verified_email(current_user_id);
  IF user_email IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Confirm your email address to join an organization');
  END IF;

  SELECT id, name, email_domains, default_new_user_team_id,
         COALESCE((settings->>'enforce_email_domain')::boolean, false)
  INTO target_org_id, target_org_name, allowed_domains, default_team_id, enforce_domain
  FROM organization WHERE slug = p_org_slug;
  
  IF target_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Organization not found');
  END IF;
  
  IF EXISTS (SELECT 1 FROM blocked_user WHERE org_id = target_org_id AND LOWER(email) = LOWER(user_email)) THEN
    RETURN json_build_object('success', false, 'error', 'You have been blocked from this organization');
  END IF;
  
  -- Schema 111: knowing an organization's slug is not an invitation. Slugs are not secret, and
  -- the only gate here was enforce_email_domain, off by default, so any account could join any
  -- organization. Joining now needs an open invitation for this address to this organization, or
  -- an address in one of its email_domains. enforce_email_domain is subsumed: a domain outside the
  -- list was already refused when it was on, and now is whenever no invitation names the address.
  email_domain := split_part(user_email, '@', 2);
  IF NOT EXISTS (
       SELECT 1 FROM pending_org_member pom
        WHERE pom.org_id = target_org_id AND LOWER(pom.email) = user_email AND pom.claimed_at IS NULL)
     AND NOT (email_domain = ANY(COALESCE(allowed_domains, '{}'::TEXT[]))) THEN
    RETURN json_build_object('success', false, 'error',
      CASE WHEN enforce_domain THEN 'Your email domain is not allowed'
           ELSE 'You need an invitation to join this organization' END);
  END IF;

  UPDATE app_user SET org_id = target_org_id WHERE id = current_user_id;
  
  IF default_team_id IS NOT NULL THEN
    INSERT INTO team_member (team_id, user_id, added_by)
    VALUES (default_team_id, current_user_id, current_user_id)
    ON CONFLICT (team_id, user_id) DO NOTHING;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'org_id', target_org_id,
    'org_name', target_org_name,
    'added_to_default_team', default_team_id IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Block user
CREATE OR REPLACE FUNCTION user_block(p_email TEXT, p_reason TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  current_user_id UUID;
  current_org_id UUID;
  target_user_id UUID;
  normalized_email TEXT;
BEGIN
  current_user_id := auth.uid();
  normalized_email := LOWER(TRIM(p_email));
  
  SELECT org_id INTO current_org_id FROM app_user WHERE id = current_user_id;
  
  IF current_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of any organization');
  END IF;
  
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can block users');
  END IF;
  
  SELECT id INTO target_user_id FROM app_user
  WHERE LOWER(email) = normalized_email AND org_id = current_org_id;
  
  IF target_user_id IS NOT NULL THEN
    DELETE FROM team_member
    WHERE user_id = target_user_id 
      AND team_id IN (SELECT id FROM team WHERE org_id = current_org_id);
    
    UPDATE app_user SET org_id = NULL WHERE id = target_user_id;
    
    DELETE FROM pending_org_member
    WHERE org_id = current_org_id AND LOWER(email) = normalized_email;
  END IF;
  
  INSERT INTO blocked_user (org_id, email, blocked_by, reason)
  VALUES (current_org_id, normalized_email, current_user_id, p_reason)
  ON CONFLICT (org_id, email) DO UPDATE SET
    blocked_by = current_user_id,
    blocked_at = NOW(),
    reason = p_reason;
  
  RETURN json_build_object('success', true, 'message', 'User has been blocked');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Unblock user
CREATE OR REPLACE FUNCTION user_unblock(p_email TEXT)
RETURNS JSON AS $$
DECLARE
  current_user_id UUID;
  current_org_id UUID;
  normalized_email TEXT;
BEGIN
  current_user_id := auth.uid();
  normalized_email := LOWER(TRIM(p_email));
  
  SELECT org_id INTO current_org_id FROM app_user WHERE id = current_user_id;
  
  IF current_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of any organization');
  END IF;
  
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can unblock users');
  END IF;
  
  DELETE FROM blocked_user
  WHERE org_id = current_org_id AND LOWER(email) = normalized_email;
  
  RETURN json_build_object('success', true, 'message', 'User has been unblocked');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Regenerate org slug
CREATE OR REPLACE FUNCTION org_regenerate_slug()
RETURNS JSON AS $$
DECLARE
  current_user_id UUID;
  current_org_id UUID;
  new_slug TEXT;
BEGIN
  current_user_id := auth.uid();
  
  SELECT u.org_id INTO current_org_id
  FROM app_user u WHERE u.id = current_user_id;
  
  IF current_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of any organization');
  END IF;
  
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can regenerate the organization code');
  END IF;
  
  -- Six random bytes from gen_random_uuid() (core Postgres, no pgcrypto): the
  -- first six bytes of a v4 UUID carry no version or variant bits.
  new_slug := encode(substring(uuid_send(gen_random_uuid()) from 1 for 6), 'base64');
  new_slug := replace(replace(new_slug, '/', ''), '+', '');
  new_slug := substring(new_slug from 1 for 8);
  
  UPDATE organization SET slug = new_slug WHERE id = current_org_id;
  
  RETURN json_build_object('success', true, 'new_slug', new_slug);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Update organization branding (logo and contact info)
CREATE OR REPLACE FUNCTION org_update_branding(
  p_org_id UUID,
  p_logo_url TEXT DEFAULT NULL,
  p_logo_storage_path TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  IF NOT is_org_member(p_org_id) THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of this organization');
  END IF;

  -- Verify user is an admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can update organization branding');
  END IF;
  
  -- Update the organization branding and contact fields
  -- Only update fields that are explicitly provided (not NULL)
  -- Empty strings are treated as NULL to clear the values
  UPDATE organization 
  SET 
    logo_url = CASE WHEN p_logo_url IS NOT NULL THEN NULLIF(p_logo_url, '') ELSE logo_url END,
    logo_storage_path = CASE WHEN p_logo_storage_path IS NOT NULL THEN NULLIF(p_logo_storage_path, '') ELSE logo_storage_path END,
    phone = CASE WHEN p_phone IS NOT NULL THEN NULLIF(p_phone, '') ELSE phone END,
    website = CASE WHEN p_website IS NOT NULL THEN NULLIF(p_website, '') ELSE website END,
    contact_email = CASE WHEN p_contact_email IS NOT NULL THEN NULLIF(p_contact_email, '') ELSE contact_email END
  WHERE id = p_org_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get org auth providers
--
-- Reachable by anon: the sign-in screen calls it before anyone has signed in.
-- That makes the difference between its two answers an oracle, and it used to
-- be a loud one. A real organization returned `auth_providers::json`, a jsonb
-- value rendered with jsonb's key ordering and no space after the colon; an
-- organization that does not exist returned a json_build_object() literal,
-- rendered with json's insertion ordering and ` : ` between key and value. The
-- two were distinguishable by whitespace alone, so anyone holding the
-- publishable key could enumerate org slugs and learn which SSO providers a
-- named target has enabled.
--
-- Both answers now go through the same jsonb value and the same cast, so an
-- organization with no configured providers and an organization that does not
-- exist are byte-identical. An organization that HAS configured providers is
-- still distinguishable, and has to be: the screen exists to show different
-- buttons. What is closed is the free enumeration of every slug.
CREATE OR REPLACE FUNCTION org_get_auth_providers(p_org_slug TEXT)
RETURNS JSON AS $$
DECLARE
  auth_settings JSONB;
BEGIN
  SELECT auth_providers INTO auth_settings
  FROM organization WHERE slug = p_org_slug;

  RETURN COALESCE(
    auth_settings,
    jsonb_build_object(
      'users', jsonb_build_object('google', true, 'email', true, 'phone', true),
      'suppliers', jsonb_build_object('google', true, 'email', true, 'phone', true)
    )
  )::json;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Create default job titles
CREATE OR REPLACE FUNCTION job_title_create_defaults(p_org_id UUID, p_created_by UUID DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  INSERT INTO job_title (org_id, name, description, color, icon, is_system, created_by) VALUES
    (p_org_id, 'Design Engineer', 'CAD and product design', '#3b82f6', 'PenTool', TRUE, p_created_by),
    (p_org_id, 'Quality Engineer', 'Quality assurance and control', '#f59e0b', 'ShieldCheck', TRUE, p_created_by),
    (p_org_id, 'Manufacturing Engineer', 'Production and process engineering', '#ec4899', 'Factory', TRUE, p_created_by),
    (p_org_id, 'Purchasing Agent', 'Procurement and supplier management', '#14b8a6', 'ShoppingCart', TRUE, p_created_by),
    (p_org_id, 'Project Manager', 'Project oversight and coordination', '#8b5cf6', 'Briefcase', TRUE, p_created_by),
    (p_org_id, 'Document Controller', 'Release and document management', '#06b6d4', 'FileCheck', TRUE, p_created_by)
  ON CONFLICT (org_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- No org_require_member() here, and none in team_create_defaults
-- below: both run from the trg_organization_create_defaults trigger, at an instant when
-- the new organization has no members at all, so a membership check would make
-- creating an organization impossible. Withdrawing the endpoint is the fix
-- instead - the trigger function is SECURITY DEFINER owned by the schema owner
-- and can still call them, while PostgREST can no longer reach them.
--
-- Withdrawing it needs the roles named. `REVOKE ALL ... FROM PUBLIC` was the
-- only protection these three had, and on Supabase it removed the implicit
-- PUBLIC grant while leaving the explicit `anon=X/postgres` that ALTER DEFAULT
-- PRIVILEGES had put there. As anon with no JWT, job_title_create_defaults,
-- team_create_defaults and seed_customer_categories wrote 56 rows
-- into an organization the caller had never heard of. anon_enforce_execute_posture()
-- at the end of the file would catch this now, but a function whose entire
-- defence is its ACL should carry that ACL next to its own definition.

-- Create default permission teams
CREATE OR REPLACE FUNCTION team_create_defaults(p_org_id UUID, p_created_by UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
  v_admins_id UUID;
  v_new_users_id UUID;
BEGIN
  INSERT INTO team (org_id, name, description, color, icon, is_system, created_by)
  VALUES (p_org_id, 'Administrators', 'Full administrative access', '#eab308', 'Star', TRUE, p_created_by)
  ON CONFLICT (org_id, name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO v_admins_id;
  
  INSERT INTO team (org_id, name, description, color, icon, is_default, is_system, created_by)
  VALUES (p_org_id, 'New Users', 'Default team for new org code signups', '#6b7280', 'UserPlus', TRUE, FALSE, p_created_by)
  ON CONFLICT (org_id, name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO v_new_users_id;
  
  UPDATE organization SET default_new_user_team_id = v_new_users_id
  WHERE id = p_org_id AND default_new_user_team_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Apply pending team memberships
CREATE OR REPLACE FUNCTION team_member_apply_pending(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_pending RECORD;
  v_team_id UUID;
  v_vault_id UUID;
  v_org_id UUID;
  v_default_team_id UUID;
BEGIN
  -- Schema 111: the invitation must name the account's verified address and the organization the
  -- account is joining. It read public.app_user.email (client-writable until 111) and any
  -- organization, so an account joining one organization could claim another's invitation.
  SELECT * INTO v_pending
  FROM pending_org_member
  WHERE LOWER(email) = user_get_verified_email(p_user_id)
    AND org_id = (SELECT org_id FROM app_user WHERE id = p_user_id)
    AND claimed_at IS NULL
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- 5.0 (audit O1): only teams and vaults of the invitation's own organization
  -- are granted. The arrays are written by an admin of that organization, but
  -- nothing tied an id to it: an admin of one organization who knew a team id of
  -- another (its Administrators team, say) could invite an address they control
  -- and be made a member there. An id from elsewhere is skipped, not an error, so
  -- one bad id does not block the rest of the invitation.
  IF v_pending.team_ids IS NOT NULL AND array_length(v_pending.team_ids, 1) > 0 THEN
    FOREACH v_team_id IN ARRAY v_pending.team_ids
    LOOP
      INSERT INTO team_member (team_id, user_id, added_by)
      SELECT t.id, p_user_id, v_pending.invited_by
      FROM team t WHERE t.id = v_team_id AND t.org_id = v_pending.org_id
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END LOOP;
  ELSE
    SELECT default_new_user_team_id INTO v_default_team_id
    FROM organization WHERE id = v_pending.org_id;
    
    IF v_default_team_id IS NOT NULL THEN
      INSERT INTO team_member (team_id, user_id, added_by)
      SELECT t.id, p_user_id, v_pending.invited_by
      FROM team t WHERE t.id = v_default_team_id AND t.org_id = v_pending.org_id
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  -- Opt-in vault access: grant the vaults selected on the invite (if any)
  IF v_pending.vault_ids IS NOT NULL AND array_length(v_pending.vault_ids, 1) > 0 THEN
    FOREACH v_vault_id IN ARRAY v_pending.vault_ids
    LOOP
      INSERT INTO vault_access (vault_id, user_id, granted_by)
      SELECT v.id, p_user_id, v_pending.invited_by
      FROM vault v WHERE v.id = v_vault_id AND v.org_id = v_pending.org_id
      ON CONFLICT (vault_id, user_id) DO NOTHING;
    END LOOP;
  END IF;
  
  UPDATE pending_org_member
  SET claimed_at = NOW(), claimed_by = p_user_id
  WHERE id = v_pending.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Trigger-only, and withdrawn rather than gated, for the same reason as
-- team_member_apply_pending() in core.sql: it runs from
-- trg_app_user_claim_pending_membership() and from the API's service-role invite path, where
-- auth.uid() is NULL, so there is no caller identity to check. Granted to
-- authenticated it was an endpoint that took a user id and handed that user
-- whatever licences an invitation named; granted to anon - which Supabase's
-- default privileges did - it was that without logging in.

-- Update the trg_app_user_claim_pending_membership trigger function to also apply license assignments
CREATE OR REPLACE FUNCTION trg_app_user_claim_pending_membership()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM team_member_apply_pending(NEW.id);
  PERFORM pending_license_assignment_apply(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_app_user_claim_pending_membership
  AFTER INSERT OR UPDATE OF org_id ON app_user
  FOR EACH ROW
  WHEN (NEW.org_id IS NOT NULL)
  EXECUTE FUNCTION trg_app_user_claim_pending_membership();

-- Handle new user (auth trigger)
CREATE OR REPLACE FUNCTION trg_auth_user_sync_app_user()
RETURNS TRIGGER AS $$
DECLARE
  pending RECORD;
  pending_org UUID;
  pending_role TEXT;
BEGIN
  -- Schema 111: an unconfirmed address claims nothing. Sign-up with somebody else's address
  -- used to land in their invited organization before any email was confirmed. The trigger
  -- also fires on UPDATE, so the confirmation itself (an accepted invite link, a confirmed
  -- sign-up) is what binds the invitation; OAuth accounts arrive confirmed.
  SELECT * INTO pending
  FROM pending_org_member
  WHERE NEW.email_confirmed_at IS NOT NULL
    AND LOWER(email) = LOWER(NEW.email)
    AND claimed_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    pending_org := pending.org_id;
    pending_role := pending.role::TEXT;
  ELSE
    pending_org := NULL;
    pending_role := 'engineer';
  END IF;
  
  INSERT INTO public.app_user (id, email, full_name, avatar_url, org_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    pending_org,
    pending_role::user_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.app_user.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.app_user.avatar_url),
    org_id = CASE 
      WHEN public.app_user.org_id IS NULL AND EXCLUDED.org_id IS NOT NULL 
      THEN EXCLUDED.org_id ELSE public.app_user.org_id END,
    role = CASE 
      WHEN public.app_user.org_id IS NULL AND EXCLUDED.org_id IS NOT NULL 
      THEN EXCLUDED.role ELSE public.app_user.role END;
  
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'User with email % already exists', NEW.email;
  RETURN NEW;
WHEN OTHERS THEN
  RAISE WARNING 'trg_auth_user_sync_app_user error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_auth_user_sync_app_user
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION trg_auth_user_sync_app_user();

-- Handle new organization
CREATE OR REPLACE FUNCTION trg_organization_create_defaults()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM team_create_defaults(NEW.id, NULL);
  PERFORM job_title_create_defaults(NEW.id, NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_organization_create_defaults
  AFTER INSERT ON organization
  FOR EACH ROW EXECUTE FUNCTION trg_organization_create_defaults();

-- Delete user account
CREATE OR REPLACE FUNCTION user_delete_account()
RETURNS JSON AS $$
DECLARE
  current_user_id UUID;
  current_user_email TEXT;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT email INTO current_user_email FROM app_user WHERE id = current_user_id;
  
  DELETE FROM team_member WHERE user_id = current_user_id;
  DELETE FROM user_job_title WHERE user_id = current_user_id;
  DELETE FROM user_permission WHERE user_id = current_user_id;
  DELETE FROM user_session WHERE user_id = current_user_id;
  DELETE FROM color_swatch WHERE user_id = current_user_id;
  DELETE FROM notification WHERE user_id = current_user_id;
  DELETE FROM app_user WHERE id = current_user_id;
  DELETE FROM auth.users WHERE id = current_user_id;
  
  RETURN json_build_object('success', true, 'message', 'Account deleted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Admin remove user
CREATE OR REPLACE FUNCTION org_remove_user(p_user_email TEXT)
RETURNS JSON AS $$
DECLARE
  current_user_id UUID;
  current_org_id UUID;
  target_user_id UUID;
  target_org_id UUID;
  normalized_email TEXT;
BEGIN
  current_user_id := auth.uid();
  normalized_email := LOWER(TRIM(p_user_email));
  
  SELECT org_id INTO current_org_id FROM app_user WHERE id = current_user_id;
  
  IF current_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of any organization');
  END IF;
  
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can remove users');
  END IF;
  
  SELECT id, org_id INTO target_user_id, target_org_id
  FROM app_user WHERE LOWER(email) = normalized_email;
  
  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  IF target_org_id != current_org_id THEN
    RETURN json_build_object('success', false, 'error', 'User is not in your organization');
  END IF;
  
  IF target_user_id = current_user_id THEN
    RETURN json_build_object('success', false, 'error', 'You cannot remove yourself');
  END IF;
  
  DELETE FROM team_member WHERE user_id = target_user_id;
  DELETE FROM user_job_title WHERE user_id = target_user_id;
  DELETE FROM user_permission WHERE user_id = target_user_id;
  DELETE FROM user_session WHERE user_id = target_user_id;
  DELETE FROM color_swatch WHERE user_id = target_user_id;
  DELETE FROM notification WHERE user_id = target_user_id;
  DELETE FROM app_user WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
  
  RETURN json_build_object('success', true, 'message', 'User removed from organization and account deleted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Use admin recovery code
CREATE OR REPLACE FUNCTION admin_recovery_code_use(
  p_code TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_user_org_id UUID;
  v_code_hash TEXT;
  v_recovery RECORD;
  v_admin_team_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT org_id INTO v_user_org_id FROM app_user WHERE id = v_user_id;
  
  IF v_user_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User has no organization');
  END IF;
  
  v_code_hash := encode(digest(p_code, 'sha256'), 'hex');
  
  SELECT * INTO v_recovery
  FROM admin_recovery_code
  WHERE org_id = v_user_org_id
    AND code_hash = v_code_hash
    AND is_used = false
    AND is_revoked = false
    AND expires_at > NOW()
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid, expired, or already used recovery code');
  END IF;
  
  UPDATE admin_recovery_code
  SET is_used = true, used_by = v_user_id, used_at = NOW(), used_from_ip = p_ip_address
  WHERE id = v_recovery.id;
  
  SELECT id INTO v_admin_team_id
  FROM team WHERE org_id = v_user_org_id AND name = 'Administrators';
  
  IF v_admin_team_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Administrators team not found');
  END IF;
  
  INSERT INTO team_member (team_id, user_id, added_by)
  VALUES (v_admin_team_id, v_user_id, v_user_id)
  ON CONFLICT (team_id, user_id) DO NOTHING;
  
  RETURN json_build_object('success', true, 'message', 'You have been granted admin access');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Update user avatar
CREATE OR REPLACE FUNCTION user_update_avatar(
  p_custom_avatar_url TEXT DEFAULT NULL,
  p_avatar_storage_path TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  UPDATE app_user
  SET custom_avatar_url = CASE 
      WHEN p_custom_avatar_url = '' THEN NULL 
      WHEN p_custom_avatar_url IS NOT NULL THEN p_custom_avatar_url 
      ELSE custom_avatar_url 
    END
  WHERE id = current_user_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Updated at column function
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Schema 111: the caller's own organization only. USING (true) let any account
-- read every organization's row - slugs, email_domains, settings and the Google
-- Drive client secret. Before joining, nothing here is needed: sign-in reads
-- auth providers through org_get_auth_providers() and joining goes through
-- user_ensure_org_id() / org_join_by_slug(), all SECURITY DEFINER.
CREATE POLICY "organization: authenticated users read"
  ON organization FOR SELECT
  TO authenticated
  USING (is_org_member(id));

CREATE POLICY "organization: admins update"
  ON organization FOR UPDATE
  TO authenticated
  USING (id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin())
  WITH CHECK (id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Schema 111: your own row, and the members of your organization. USING (true)
-- listed every account of every organization (email, role, org). is_org_member()
-- is SECURITY DEFINER, so the policy does not recurse into itself.
CREATE POLICY "app_user: authenticated users read"
  ON app_user FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR is_org_member(org_id));

-- THE ANCHOR EVERY OTHER GATE IN THIS SCHEMA RESTS ON
--
-- app_user.org_id and app_user.role are what is_org_admin(), org_require_member(),
-- file_require_access() and every membership subquery below resolve against.
-- Until this release the self-update policy was USING (id = auth.uid()) with no
-- WITH CHECK, and a policy with no WITH CHECK reuses its USING expression as the
-- check - which tests the *new* row's id, not its org_id or role. One
-- PATCH /rest/v1/users?id=eq.<self> {"org_id": "<other org>", "role": "admin"}
-- returned 200 and moved a viewer into another tenant as its administrator, so
-- every gate schemas 89-94 added was answered honestly against a row the caller
-- had just rewritten. The BEFORE UPDATE trigger 4.x carried (auto_set_user_org_id)
-- was a no-op stub and caught nothing; 5.0 dropped it.
--
-- WHY A WITH CHECK AND NOT A COLUMN GRANT
--
-- A column-level GRANT UPDATE is issued to a *role*, and both policies here
-- apply to the same role, authenticated. A grant therefore cannot tell a user
-- editing their own row from an admin editing a member's - and the admin path
-- legitimately writes role (src/lib/supabase/teams.ts:37), so granting role to
-- keep team management working hands the escalation straight back. A WITH CHECK
-- is per-policy, which is exactly the distinction that is needed: role and
-- org_id are pinned on the self policy and left alone on the admin policy.
--
-- The subqueries read the caller's row under the statement snapshot. Rows
-- written by the current command are not visible to subqueries within that same
-- command, so these observe the pre-update values and cannot be satisfied by
-- the write they are checking.
--
-- IS NOT DISTINCT FROM rather than =, because org_id is nullable: an account
-- that has signed up and not yet joined an organization has org_id NULL, and
-- `NULL = NULL` is NULL, which fails the check and would lock that account out
-- of its own last_online_at write. This is the same NULL-unsafety the nine
-- membership tests schema 91 corrected, on the other side of the comparison.
--
-- TO authenticated: these were the only two policies in this block without a
-- role qualifier - the three organizations and users SELECT/UPDATE policies
-- above all carry it - so they applied to PUBLIC, which includes anon. Not
-- exploitable while auth.uid() is NULL for anon, but the bootstrap grants anon
-- explicitly and schema 90 exists because a default grant nobody had named
-- turned out to be load-bearing.
CREATE POLICY "app_user: users update own"
  ON app_user FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role   IS NOT DISTINCT FROM (SELECT u.role   FROM app_user u WHERE u.id = auth.uid())
    AND org_id IS NOT DISTINCT FROM (SELECT u.org_id FROM app_user u WHERE u.id = auth.uid())
    -- Schema 111: and email. Membership, blocks and org_remove_user() target an
    -- address; only trg_auth_user_sync_app_user() (from auth.users) writes it.
    AND email  IS NOT DISTINCT FROM (SELECT u.email  FROM app_user u WHERE u.id = auth.uid())
  );

-- EXAMINED AND SOUND - DO NOT WRITE A STRICTER CHECK HERE
--
-- This policy had no WITH CHECK either, and that is not a second hole. Nothing
-- in supabase/ is AS RESTRICTIVE, so both UPDATE policies on users are
-- permissive and PostgreSQL ORs them on the WITH CHECK side as well as the
-- USING side. The effective check on the new row is:
--
--   (NEW.id = auth.uid() AND role and org_id unchanged)
--   OR (NEW.org_id IN (caller's org) AND is_org_admin())
--
-- An admin moving *another* user to a foreign org fails branch 1 (the id is the
-- victim's) and branch 2 (the foreign org is not in the caller's org set), and
-- is refused. An admin moving *themselves* passes through branch 1 - which is
-- the defect the policy above now closes, not a defect in this one.
--
-- The check below is written out rather than left implicit, matching "Admins
-- can update their organization" above, which spells its check out. It restates
-- the default and is therefore semantically a no-op; it is here so that the
-- next reader does not have to reconstruct the permissive-OR argument to be
-- sure of it. Anything *stricter* breaks this policy's entire purpose: pinning
-- role here breaks updateUserRole (src/lib/supabase/teams.ts:14-44), which is
-- the one thing it exists to allow.
--
-- Two known gaps that are product decisions and not cross-tenant holes, left
-- for the owner rather than fixed here: there is no last-admin protection, so
-- an admin can demote the only other admin and strand the organization; and
-- there is no column restriction, so an admin can rewrite a member's email or
-- id and desync the row from auth.users.
--
-- Separately: addUserToOrg (teams.ts:90, insert at :121) writes a user whose org_id is
-- NULL, and `NULL IN (SELECT ...)` is NULL rather than true, so this policy
-- already refuses it. Adding a member by email over the table path is broken
-- today, independently of this release. Fixing it means a SECURITY DEFINER RPC
-- as the invite path already uses, not a looser USING clause here.
CREATE POLICY "app_user: admins update"
  ON app_user FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin())
  WITH CHECK (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin()
    -- Schema 111: an admin cannot rewrite an address either (their own included,
    -- which this policy also admits).
    AND email IS NOT DISTINCT FROM (SELECT u.email FROM app_user u WHERE u.id = app_user.id)
  );

-- ===========================================
-- MODULE DEFAULTS FUNCTIONS
-- ===========================================

-- Both overloads, by exact signature. The first is the only one this file has
-- ever declared; the second is the pre-module-split leftover release 100
-- retires - see user_get_module_defaults(UUID) below for the whole story.

-- Get organization module defaults
--
-- THE MEMBERSHIP TEST IS NOT HAND-WRITTEN ANY MORE
--
-- This and nine other RPCs did their own:
--
--   SELECT org_id INTO v_user_org_id FROM users WHERE id = auth.uid();
--   IF v_user_org_id IS NULL OR v_user_org_id != p_org_id THEN ...
--
-- which is correct - NULL-safe, and check_null_unsafe_org_gates() has nothing
-- to say about it. It is gone anyway, because its existence was the reason
-- check_org_gates() counted a bare `auth.uid()` as evidence that a function was
-- gated, and that accommodation let a function with no authorization at all be
-- certified and stamped. A convention accommodated is a convention abandoned.
--
-- org_require_member() admits the same callers and refuses a NULL p_org_id
-- rather than proceeding against no organization, which the version above did.
CREATE OR REPLACE FUNCTION org_get_module_defaults(p_org_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_defaults JSONB;
BEGIN
  PERFORM org_require_member(p_org_id);

  SELECT module_defaults INTO v_defaults
  FROM organization WHERE id = p_org_id;
  
  RETURN v_defaults;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Set organization module defaults (admins only)
CREATE OR REPLACE FUNCTION org_set_module_defaults(
  p_org_id UUID,
  p_enabled_modules JSONB,
  p_enabled_groups JSONB,
  p_module_order JSONB,
  p_dividers JSONB,
  p_module_parents JSONB DEFAULT NULL,
  p_module_icon_colors JSONB DEFAULT NULL,
  p_custom_groups JSONB DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  -- is_org_member rather than org_require_member: this one answers with a
  -- payload instead of raising, and the two have to keep saying the same thing.
  IF NOT is_org_member(p_org_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Verify user is admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can set org defaults');
  END IF;
  
  -- Update module defaults
  UPDATE organization
  SET module_defaults = jsonb_build_object(
    'enabled_modules', p_enabled_modules,
    'enabled_groups', p_enabled_groups,
    'module_order', p_module_order,
    'dividers', p_dividers,
    'module_parents', COALESCE(p_module_parents, '{}'::jsonb),
    'module_icon_colors', COALESCE(p_module_icon_colors, '{}'::jsonb),
    'custom_groups', COALESCE(p_custom_groups, '[]'::jsonb)
  )
  WHERE id = p_org_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Force organization module defaults to all users (admins only)
-- This sets both the defaults AND the forced_at timestamp
CREATE OR REPLACE FUNCTION org_force_module_defaults(
  p_org_id UUID,
  p_enabled_modules JSONB,
  p_enabled_groups JSONB,
  p_module_order JSONB,
  p_dividers JSONB,
  p_module_parents JSONB DEFAULT NULL,
  p_module_icon_colors JSONB DEFAULT NULL,
  p_custom_groups JSONB DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  IF NOT is_org_member(p_org_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Verify user is admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can force module defaults');
  END IF;
  
  -- Update module defaults AND set forced_at timestamp
  UPDATE organization
  SET module_defaults = jsonb_build_object(
    'enabled_modules', p_enabled_modules,
    'enabled_groups', p_enabled_groups,
    'module_order', p_module_order,
    'dividers', p_dividers,
    'module_parents', COALESCE(p_module_parents, '{}'::jsonb),
    'module_icon_colors', COALESCE(p_module_icon_colors, '{}'::jsonb),
    'custom_groups', COALESCE(p_custom_groups, '[]'::jsonb)
  ),
  module_defaults_forced_at = NOW()
  WHERE id = p_org_id;
  
  RETURN json_build_object('success', true, 'forced_at', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get team module defaults
CREATE OR REPLACE FUNCTION team_get_module_defaults(p_team_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_org_id UUID;
  v_team_org_id UUID;
  v_defaults JSONB;
BEGIN
  -- Get user's org
  SELECT org_id INTO v_user_org_id FROM app_user WHERE id = auth.uid();
  
  -- Get team's org
  SELECT org_id INTO v_team_org_id FROM team WHERE id = p_team_id;
  
  -- Verify user belongs to the same org as the team
  IF v_user_org_id IS NULL OR v_team_org_id IS NULL OR v_user_org_id != v_team_org_id THEN
    RAISE EXCEPTION 'Not authorized to access this team';
  END IF;
  
  SELECT module_defaults INTO v_defaults
  FROM team WHERE id = p_team_id;
  
  RETURN v_defaults;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Set team module defaults (admins only)
CREATE OR REPLACE FUNCTION team_set_module_defaults(
  p_team_id UUID,
  p_enabled_modules JSONB,
  p_enabled_groups JSONB,
  p_module_order JSONB,
  p_dividers JSONB,
  p_module_parents JSONB DEFAULT NULL,
  p_module_icon_colors JSONB DEFAULT NULL,
  p_custom_groups JSONB DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_user_org_id UUID;
  v_team_org_id UUID;
BEGIN
  -- Get user's org
  SELECT org_id INTO v_user_org_id FROM app_user WHERE id = auth.uid();
  
  -- Get team's org
  SELECT org_id INTO v_team_org_id FROM team WHERE id = p_team_id;
  
  -- Verify user belongs to the same org as the team
  IF v_user_org_id IS NULL OR v_team_org_id IS NULL OR v_user_org_id != v_team_org_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Verify user is admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can set team defaults');
  END IF;
  
  -- Update team module defaults
  UPDATE team
  SET module_defaults = jsonb_build_object(
    'enabled_modules', p_enabled_modules,
    'enabled_groups', p_enabled_groups,
    'module_order', p_module_order,
    'dividers', p_dividers,
    'module_parents', COALESCE(p_module_parents, '{}'::jsonb),
    'module_icon_colors', COALESCE(p_module_icon_colors, '{}'::jsonb),
    'custom_groups', COALESCE(p_custom_groups, '[]'::jsonb)
  )
  WHERE id = p_team_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Clear team module defaults (admins only)
CREATE OR REPLACE FUNCTION team_clear_module_defaults(p_team_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user_org_id UUID;
  v_team_org_id UUID;
BEGIN
  -- Get user's org
  SELECT org_id INTO v_user_org_id FROM app_user WHERE id = auth.uid();
  
  -- Get team's org
  SELECT org_id INTO v_team_org_id FROM team WHERE id = p_team_id;
  
  -- Verify user belongs to the same org as the team
  IF v_user_org_id IS NULL OR v_team_org_id IS NULL OR v_user_org_id != v_team_org_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Verify user is admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can clear team defaults');
  END IF;
  
  -- Clear team module defaults
  UPDATE team
  SET module_defaults = NULL
  WHERE id = p_team_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get user module defaults (from team or org, in priority order)
--
-- ONE FUNCTION WHERE THERE WERE TWO
--
-- Production carried two overloads of this name: this file's own
-- no-argument version, and a p_user_id UUID DEFAULT NULL version that
-- predates the schema.sql -> core.sql split and that no `DROP FUNCTION
-- IF EXISTS user_get_module_defaults() CASCADE` - exact on the empty
-- signature - ever reached. It survived, untouched, since.
--
-- Checking call sites decided which was stale, not which looked newer.
-- modulesSlice.ts's loadUserModuleDefaults calls the no-argument form and is
-- never invoked from the UI. teams.ts's loadImpersonatedUserContext, which
-- the admin "view as user" feature calls to read a target user's effective
-- module config, passes p_user_id - and that is the shape this schema's own
-- history shows the function was written with from the start: the original
-- took p_user_id UUID DEFAULT NULL and resolved COALESCE(p_user_id,
-- auth.uid()) precisely so one function could answer both "my own defaults"
-- and "this other user's defaults" for whoever was allowed to ask.
--
-- What it did not do, in either overload, was check that "allowed to ask" -
-- p_user_id was substituted with no membership test at all. Restored with
-- one added, using user_require_same_org the same way user_vault_access_list
-- and user_permission_list already gate exactly this shape of question:
-- looking up somebody else's own private-scoped data.
--
-- Gated on `p_user_id IS NOT NULL`, not on `p_user_id <> auth.uid()`: an
-- unauthenticated caller has auth.uid() = NULL, and `p_user_id <> NULL`
-- evaluates to NULL rather than true, so a caller with no session at all
-- would have sailed past a check written that way. user_require_same_org
-- still returns immediately when p_user_id names the caller themselves - a
-- caller who passes their own id explicitly pays one extra membership check,
-- not a refusal.
CREATE OR REPLACE FUNCTION user_get_module_defaults(p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_user_org_id UUID;
  v_defaults JSONB;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM user_require_same_org(p_user_id);
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get user's org
  SELECT org_id INTO v_user_org_id FROM app_user WHERE id = v_user_id;
  
  IF v_user_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- First, check if user is in a team with module defaults
  SELECT t.module_defaults INTO v_defaults
  FROM team_member tm
  JOIN team t ON t.id = tm.team_id
  WHERE tm.user_id = v_user_id
    AND t.org_id = v_user_org_id
    AND t.module_defaults IS NOT NULL
  ORDER BY t.name
  LIMIT 1;
  
  -- If no team defaults, fall back to org defaults
  IF v_defaults IS NULL THEN
    SELECT module_defaults INTO v_defaults
    FROM organization WHERE id = v_user_org_id;
  END IF;
  
  RETURN v_defaults;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ===========================================
-- MODULE ACCESS FUNCTIONS
-- ===========================================
-- See the module_access table above for the allowlist semantics: no rows for a
-- module means everyone can see it.

-- Deliberately no DROP for can_access_module: the Customers extension's
-- RLS policies (sql/customers.sql in its package) depend on it, and a
-- DROP ... CASCADE here would silently delete those policies when core.sql is
-- re-run on an existing install, leaving the customer tables unreadable.
-- CREATE OR REPLACE is enough while the signature is stable; a signature change
-- needs the dependent policies dropped first.

-- Can this user see the given module? Safe to call from RLS policies.
CREATE OR REPLACE FUNCTION can_access_module(
  p_module_id TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT org_id INTO v_org_id FROM app_user WHERE id = v_user_id;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF is_org_admin(v_user_id) THEN
    RETURN true;
  END IF;

  -- Unrestricted until an admin adds a subject
  IF NOT EXISTS (
    SELECT 1 FROM module_access ma
    WHERE ma.org_id = v_org_id AND ma.module_id = p_module_id
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM module_access ma
    WHERE ma.org_id = v_org_id
      AND ma.module_id = p_module_id
      AND ma.user_id = v_user_id
  ) OR EXISTS (
    SELECT 1 FROM module_access ma
    JOIN team_member tm ON tm.team_id = ma.team_id
    WHERE ma.org_id = v_org_id
      AND ma.module_id = p_module_id
      AND tm.user_id = v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp STABLE;

-- Modules the caller is restricted out of. Returns the denied set rather than
-- the allowed set because the open default makes it empty for almost everyone.
CREATE OR REPLACE FUNCTION module_list_denied()
RETURNS TEXT[] AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_denied TEXT[];
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  SELECT org_id INTO v_org_id FROM app_user WHERE id = v_user_id;

  IF v_org_id IS NULL OR is_org_admin(v_user_id) THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  SELECT COALESCE(array_agg(restricted.module_id), ARRAY[]::TEXT[])
  INTO v_denied
  FROM (
    SELECT DISTINCT ma.module_id
    FROM module_access ma
    WHERE ma.org_id = v_org_id
  ) restricted
  WHERE NOT EXISTS (
    SELECT 1
    FROM module_access allowed
    LEFT JOIN team_member tm
      ON tm.team_id = allowed.team_id AND tm.user_id = v_user_id
    WHERE allowed.org_id = v_org_id
      AND allowed.module_id = restricted.module_id
      AND (allowed.user_id = v_user_id OR tm.user_id IS NOT NULL)
  );

  RETURN v_denied;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp STABLE;

-- Full allowlist for the admin UI
CREATE OR REPLACE FUNCTION module_access_get_config()
RETURNS TABLE (
  module_id TEXT,
  team_id UUID,
  user_id UUID
) AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id FROM app_user WHERE id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only admins can view module access';
  END IF;

  RETURN QUERY
  SELECT ma.module_id, ma.team_id, ma.user_id
  FROM module_access ma
  WHERE ma.org_id = v_org_id
  ORDER BY ma.module_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Replace the allowlist for one module (admins only).
-- Passing two empty arrays clears it, restoring the module to everyone.
CREATE OR REPLACE FUNCTION module_access_set(
  p_module_id TEXT,
  p_team_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_user_ids UUID[] DEFAULT ARRAY[]::UUID[]
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  SELECT org_id INTO v_org_id FROM app_user WHERE id = v_user_id;

  IF v_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can set module access');
  END IF;

  IF p_module_id IS NULL OR p_module_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'Module is required');
  END IF;

  DELETE FROM module_access
  WHERE org_id = v_org_id AND module_id = p_module_id;

  -- Subqueries scope the insert to the caller's org, so ids from another org
  -- are dropped instead of silently granting cross-org access.
  INSERT INTO module_access (org_id, module_id, team_id, granted_by)
  SELECT v_org_id, p_module_id, t.id, v_user_id
  FROM team t
  WHERE t.org_id = v_org_id
    AND t.id = ANY(COALESCE(p_team_ids, ARRAY[]::UUID[]));

  INSERT INTO module_access (org_id, module_id, user_id, granted_by)
  SELECT v_org_id, p_module_id, u.id, v_user_id
  FROM app_user u
  WHERE u.org_id = v_org_id
    AND u.id = ANY(COALESCE(p_user_ids, ARRAY[]::UUID[]));

  RETURN json_build_object(
    'success', true,
    'restricted', EXISTS (
      SELECT 1 FROM module_access
      WHERE org_id = v_org_id AND module_id = p_module_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ===========================================
-- COLUMN DEFAULTS FUNCTIONS
-- ===========================================

-- Get organization column defaults
CREATE OR REPLACE FUNCTION org_get_column_defaults(p_org_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_defaults JSONB;
BEGIN
  PERFORM org_require_member(p_org_id);

  SELECT COALESCE(settings->'column_defaults', '[]'::jsonb)
  INTO v_defaults
  FROM organization WHERE id = p_org_id;
  
  RETURN v_defaults;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Set organization column defaults (admins only)
CREATE OR REPLACE FUNCTION org_set_column_defaults(p_org_id UUID, p_column_defaults JSONB)
RETURNS JSON AS $$
BEGIN
  IF NOT is_org_member(p_org_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can set column defaults');
  END IF;
  
  UPDATE organization
  SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{column_defaults}', p_column_defaults)
  WHERE id = p_org_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Force organization column defaults to all users (admins only)
-- Sets both the defaults AND the forced_at timestamp
CREATE OR REPLACE FUNCTION org_force_column_defaults(p_org_id UUID, p_column_defaults JSONB)
RETURNS JSON AS $$
BEGIN
  IF NOT is_org_member(p_org_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can force column defaults');
  END IF;
  
  UPDATE organization
  SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{column_defaults}', p_column_defaults),
      column_defaults_forced_at = NOW()
  WHERE id = p_org_id;
  
  RETURN json_build_object('success', true, 'forced_at', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Save user's personal column defaults (any authenticated user)
CREATE OR REPLACE FUNCTION user_set_column_defaults(p_column_defaults JSONB)
RETURNS JSON AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  UPDATE app_user
  SET column_defaults = p_column_defaults
  WHERE id = auth.uid();
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get user's personal column defaults
CREATE OR REPLACE FUNCTION user_get_column_defaults()
RETURNS JSONB AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN (SELECT column_defaults FROM app_user WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ===========================================
-- PRIVILEGES
-- ===========================================

-- Written out in full rather than left to the platform's default privileges, so a
-- fresh database and an upgraded one hold the same grants. anon holds nothing
-- here except what anon_get_read_allowlist() and anon_get_execute_allowlist() name.
REVOKE ALL ON FUNCTION
  client_min_version(),
  org_get_auth_providers(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  client_min_version(),
  org_get_auth_providers(text)
TO PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  admin_recovery_code_use(text,text),
  anon_enforce_execute_posture(),
  anon_get_execute_allowlist(),
  anon_get_read_allowlist(),
  can_access_module(text,uuid),
  check_schema_release(),
  has_team_permission(text,permission_action,uuid),
  has_user_permission(uuid,text,permission_action,uuid),
  is_org_admin(),
  is_org_admin(uuid),
  is_org_member(uuid),
  like_pattern_escape(text),
  module_access_get_config(),
  module_access_set(text,uuid[],uuid[]),
  module_list_denied(),
  my_actor_id(),
  my_verified_email(),
  org_force_column_defaults(uuid,jsonb),
  org_force_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),
  org_get_column_defaults(uuid),
  org_get_module_defaults(uuid),
  org_join_by_slug(text),
  org_regenerate_slug(),
  org_remove_user(text),
  org_require_member(uuid),
  org_rpc_revoke_public_execute(),
  org_set_column_defaults(uuid,jsonb),
  org_set_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),
  org_update_branding(uuid,text,text,text,text,text),
  schema_get_release_manifest(),
  schema_release_description(),
  schema_release_version(),
  schema_version_update(integer,text),
  sql_strip_noise(text),
  team_clear_module_defaults(uuid),
  team_get_module_defaults(uuid),
  team_set_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),
  trg_app_user_claim_pending_membership(),
  trg_auth_user_sync_app_user(),
  trg_color_swatch_set_creator(),
  trg_organization_create_defaults(),
  trg_set_updated_at(),
  user_block(text,text),
  user_delete_account(),
  user_ensure_org_id(),
  user_get_column_defaults(),
  user_get_module_defaults(uuid),
  user_permission_list(uuid,uuid),
  user_require_same_org(uuid),
  user_set_column_defaults(jsonb),
  user_unblock(text),
  user_update_avatar(text,text),
  user_update_last_online()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  admin_recovery_code_use(text,text),
  anon_enforce_execute_posture(),
  anon_get_execute_allowlist(),
  anon_get_read_allowlist(),
  can_access_module(text,uuid),
  check_schema_release(),
  has_team_permission(text,permission_action,uuid),
  has_user_permission(uuid,text,permission_action,uuid),
  is_org_admin(),
  is_org_admin(uuid),
  is_org_member(uuid),
  like_pattern_escape(text),
  module_access_get_config(),
  module_access_set(text,uuid[],uuid[]),
  module_list_denied(),
  my_actor_id(),
  my_verified_email(),
  org_force_column_defaults(uuid,jsonb),
  org_force_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),
  org_get_column_defaults(uuid),
  org_get_module_defaults(uuid),
  org_join_by_slug(text),
  org_regenerate_slug(),
  org_remove_user(text),
  org_require_member(uuid),
  org_rpc_revoke_public_execute(),
  org_set_column_defaults(uuid,jsonb),
  org_set_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),
  org_update_branding(uuid,text,text,text,text,text),
  schema_get_release_manifest(),
  schema_release_description(),
  schema_release_version(),
  schema_version_update(integer,text),
  sql_strip_noise(text),
  team_clear_module_defaults(uuid),
  team_get_module_defaults(uuid),
  team_set_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb),
  trg_app_user_claim_pending_membership(),
  trg_auth_user_sync_app_user(),
  trg_color_swatch_set_creator(),
  trg_organization_create_defaults(),
  trg_set_updated_at(),
  user_block(text,text),
  user_delete_account(),
  user_ensure_org_id(),
  user_get_column_defaults(),
  user_get_module_defaults(uuid),
  user_permission_list(uuid,uuid),
  user_require_same_org(uuid),
  user_set_column_defaults(jsonb),
  user_unblock(text),
  user_update_avatar(text,text),
  user_update_last_online()
TO authenticated, service_role;
REVOKE ALL ON FUNCTION
  anon_list_admitting_policies(oid),
  anon_list_read_grantors(oid),
  anon_list_revoke_grantors(oid),
  check_anon_reach(),
  check_definer_search_path(),
  check_null_unsafe_org_gates(),
  check_org_gates(),
  check_release_residue(),
  check_unbound_entity_args(),
  check_withdrawn_execute(),
  is_org_gate_status_blocking(text),
  job_title_create_defaults(uuid,uuid),
  org_gate_get_exclusion_reason(oid),
  probe_get_literal(text),
  probe_get_literal_for_arg(oid,text,text),
  routine_list_row_selecting_id_args(oid),
  schema_get_withdrawn_execute_manifest(),
  schema_remediation_record(text,integer,jsonb,text),
  schema_stamp_quiet(),
  team_create_defaults(uuid,uuid),
  team_member_apply_pending(uuid),
  user_get_verified_email(uuid),
  verify_and_stamp_schema()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  anon_list_admitting_policies(oid),
  anon_list_read_grantors(oid),
  anon_list_revoke_grantors(oid),
  check_anon_reach(),
  check_definer_search_path(),
  check_null_unsafe_org_gates(),
  check_org_gates(),
  check_release_residue(),
  check_unbound_entity_args(),
  check_withdrawn_execute(),
  is_org_gate_status_blocking(text),
  job_title_create_defaults(uuid,uuid),
  org_gate_get_exclusion_reason(oid),
  probe_get_literal(text),
  probe_get_literal_for_arg(oid,text,text),
  routine_list_row_selecting_id_args(oid),
  schema_get_withdrawn_execute_manifest(),
  schema_remediation_record(text,integer,jsonb,text),
  schema_stamp_quiet(),
  team_create_defaults(uuid,uuid),
  team_member_apply_pending(uuid),
  user_get_verified_email(uuid),
  verify_and_stamp_schema()
TO service_role;

REVOKE ALL ON TABLE schema_version FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE schema_version TO anon;
GRANT ALL ON TABLE schema_version TO authenticated, service_role;
REVOKE ALL ON TABLE admin_recovery_code, app_user, blocked_user, color_swatch, job_title, module_access, notification, organization, pending_org_member, permission_preset, schema_remediation_log, team, team_member, team_permission, team_reviewer, user_job_title, user_permission, user_session FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE admin_recovery_code, app_user, blocked_user, color_swatch, job_title, module_access, notification, organization, pending_org_member, permission_preset, schema_remediation_log, team, team_member, team_permission, team_reviewer, user_job_title, user_permission, user_session TO authenticated, service_role;
REVOKE ALL ON TABLE schema_manifest_entry FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE schema_manifest_entry TO service_role;

SELECT anon_enforce_execute_posture();
