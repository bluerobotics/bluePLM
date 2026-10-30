-- =====================================================================
-- 0500_from_4x.sql: BluePLM 4.x (schema 112) -> 5.0 (schema 500)
-- =====================================================================
-- Upgrades a database stamped 112 to the 5.0 baseline in place, in one
-- transaction (the migration runner wraps this file; it holds no BEGIN or
-- COMMIT). Tables, columns, constraints and indexes are renamed, never
-- recreated, so every row survives, including the service-only tables
-- (schema_remediation_log, integration_credential) that no client test would
-- notice coming back empty. Every function, view, trigger and policy is dropped
-- and created again from the 5.0 baseline, so the code after this file is the
-- baseline's code, byte for byte.
--
-- Also applied here (.cursor/plans/release-5.0.plan.md, 5.0-audit-report.md):
--   S1  file RPCs lose the caller-identity arguments they ignored
--   S2  file.vault_id NOT NULL (refused if any file has no vault)
--   S3  the always-NULL credential columns are dropped (refused if one is set)
--   S4  the no-op trigger auto_set_user_org_id is gone (not recreated)
--   S7  six foreign keys from core tables to module tables (refused on orphans)
--   O1  team_member_apply_pending() grants only teams and vaults of the
--       invitation's organization
--   O6  the sandboxed extension tables are dropped (refused if one has a row)
--   security 5: every SECURITY DEFINER function pins search_path, and
--       check_definer_search_path() withholds the stamp otherwise
--   security 6: anon holds no table privilege outside anon_get_read_allowlist()
--   client_min_version() = 5.0.0
--
-- Native extensions with their own SQL (the private extension blueplm.customers):
-- their policies call core functions by name, so this file drops every policy
-- on every public table first, theirs included. Apply the extension's 5.0 SQL
-- right after this file to recreate them under the 5.0 names.
--
-- schema_version is untouched (4.x clients read it to learn the database is
-- newer). The stamp is not written here: the runner calls
-- verify_and_stamp_schema() (supabase/tools/verify-schema.sql) afterwards.
--
-- Generated once from the 4.10 catalog, the rename map and the 5.0 baseline;
-- released files are never edited.
-- =====================================================================

SET LOCAL lock_timeout = '30s';

-- ---------------------------------------------------------------------
-- 0. Start state: a verified 112 database, and data the 5.0 constraints accept
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_version INTEGER;
  v_n BIGINT;
  v_t TEXT;
BEGIN
  IF to_regclass('public.schema_version') IS NULL THEN
    RAISE EXCEPTION '0500: schema_version is missing; this is not a BluePLM 4.x database';
  END IF;
  SELECT version INTO v_version FROM public.schema_version WHERE id = 1;
  IF v_version IS DISTINCT FROM 112 THEN
    RAISE EXCEPTION '0500: the database is stamped %, not 112. Apply the 4.10 SQL and verify it first.', v_version;
  END IF;
  IF to_regclass('public.files') IS NULL OR to_regclass('public.file') IS NOT NULL THEN
    RAISE EXCEPTION '0500: expected the 4.x table files and no table file; the database is not at 112';
  END IF;

  -- S2
  SELECT count(*) INTO v_n FROM public.files WHERE vault_id IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '0500: % file row(s) have no vault; file.vault_id becomes NOT NULL in 5.0', v_n;
  END IF;

  -- S3: the deprecated columns were cleared into integration_credentials by 4.x.
  SELECT count(*) INTO v_n FROM public.odoo_saved_configs WHERE api_key_encrypted IS NOT NULL AND api_key_encrypted <> '';
  IF v_n > 0 THEN RAISE EXCEPTION '0500: % odoo_saved_configs row(s) still hold api_key_encrypted', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.organization_integrations WHERE credentials_encrypted IS NOT NULL AND credentials_encrypted <> '';
  IF v_n > 0 THEN RAISE EXCEPTION '0500: % organization_integrations row(s) still hold credentials_encrypted', v_n; END IF;

  -- O6: the sandboxed extension tables never held a row in production.
  FOREACH v_t IN ARRAY ARRAY[
    'org_extension_config',
    'extension_storage',
    'extension_secrets',
    'extension_secret_versions',
    'extension_secret_access',
    'extension_http_log'
  ]::TEXT[]
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
    IF v_n > 0 THEN RAISE EXCEPTION '0500: % has % row(s); 5.0 drops it', v_t, v_n; END IF;
  END LOOP;

  -- S7: the new foreign keys must hold.
  SELECT count(*) INTO v_n FROM public.team_permissions x WHERE x.vault_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vaults v WHERE v.id = x.vault_id);
  IF v_n > 0 THEN RAISE EXCEPTION '0500: % team_permissions row(s) name a missing vault', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.user_permissions x WHERE x.vault_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vaults v WHERE v.id = x.vault_id);
  IF v_n > 0 THEN RAISE EXCEPTION '0500: % user_permissions row(s) name a missing vault', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.team_reviewers x WHERE x.workflow_role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.workflow_roles r WHERE r.id = x.workflow_role_id);
  IF v_n > 0 THEN RAISE EXCEPTION '0500: % team_reviewers row(s) name a missing workflow role', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.organizations x WHERE x.default_new_user_team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = x.default_new_user_team_id);
  IF v_n > 0 THEN RAISE EXCEPTION '0500: % organizations row(s) name a missing default team', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.release_files x WHERE x.rfq_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rfqs r WHERE r.id = x.rfq_id);
  IF v_n > 0 THEN RAISE EXCEPTION '0500: % release_files row(s) name a missing RFQ', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.release_files x WHERE x.rfq_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rfq_items r WHERE r.id = x.rfq_item_id);
  IF v_n > 0 THEN RAISE EXCEPTION '0500: % release_files row(s) name a missing RFQ item', v_n; END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Drop the 4.x code: every policy on a public table (extensions' too),
--    our storage.objects policies, every trigger that calls a 4.x function,
--    the 4.x views and the 4.x functions. Nothing is dropped with CASCADE: a
--    dependency this list does not know about stops the upgrade instead.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_sig TEXT;
  v_fns OID[];
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;

  FOREACH v_sig IN ARRAY ARRAY[
    'Vault: read readable objects',
    'Vault: upload to own organization',
    'Vault: update own or org assets',
    'Vault: delete own or as admin',
    'Org members read their org extension packages',
    'Org admins upload extension packages',
    'Org admins update extension packages',
    'Org admins delete extension packages'
  ]::TEXT[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', v_sig);
  END LOOP;

  -- The 4.10 functions, plus functions older releases created that no 4.x file
  -- defines any more (left behind by renames before 4.0); 5.0 has no use for any.
  v_fns := ARRAY(SELECT to_regprocedure('public.' || s) FROM unnest(ARRAY[
    'activate_solidworks_license(uuid,text,text)',
    'add_pending_license_assignment(uuid,uuid)',
    'add_review_items(uuid,uuid[])',
    'admin_remove_user(text)',
    'advance_reviewed_files(uuid,boolean)',
    'anon_admitting_policies(oid)',
    'anon_execute_allowlist()',
    'anon_read_allowlist()',
    'anon_read_grantors(oid)',
    'anon_revoke_grantors(oid)',
    'apply_pending_license_assignments(uuid)',
    'apply_pending_team_memberships(uuid)',
    'apply_workflow_transition(uuid,uuid,uuid,text,jsonb)',
    'approve_all_remaining(uuid,text)',
    'approve_eco_gate(uuid,text,text)',
    'assign_solidworks_license(uuid,uuid)',
    'auto_set_user_org_id_func()',
    'block_user(text,text)',
    'calculate_bom_cost(uuid,integer)',
    'cancel_review(uuid,text)',
    'check_anon_reach()',
    'check_gate_requirements(uuid,text)',
    'check_null_unsafe_org_gates()',
    'check_org_gates()',
    'check_release_residue()',
    'check_schema_release()',
    'check_unbound_entity_args()',
    'check_withdrawn_execute()',
    'checkin_file(uuid,uuid,text,bigint,text,text,text,text,integer,jsonb,text,text,text)',
    'checkout_file(uuid,uuid,text,text,text)',
    'claim_pending_membership()',
    'cleanup_extension_http_logs(integer)',
    'cleanup_extension_secret_access_logs(integer)',
    'clear_team_module_defaults(uuid)',
    'complete_gate_review(uuid,review_status,text,jsonb)',
    'consume_share_link(text)',
    'create_default_job_titles(uuid,uuid)',
    'create_default_permission_teams(uuid,uuid)',
    'create_default_workflow(uuid,uuid)',
    'create_file_share_link(uuid,uuid,uuid,integer,integer,boolean)',
    'current_actor_id()',
    'deactivate_solidworks_license(uuid)',
    'delete_item_designation(uuid,uuid)',
    'delete_user_account()',
    'drop_function_overloads(text)',
    'effective_user_role(uuid)',
    'enforce_anon_execute_posture()',
    'ensure_single_default_address()',
    'ensure_user_org_id()',
    'execute_transition_to_legacy_state(uuid,text,text)',
    'execute_workflow_transition(uuid,uuid,text)',
    'file_comments_integrity()',
    'file_comments_review_link()',
    'force_org_column_defaults(uuid,jsonb)',
    'force_org_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'gate_review_ids_awaiting(uuid)',
    'gate_reviewer_user_ids(uuid,uuid)',
    'generate_rfq_number(uuid)',
    'generate_share_token()',
    'get_active_file_by_path(uuid,text)',
    'get_available_transitions(uuid,uuid)',
    'get_backup_status()',
    'get_best_price(uuid,integer)',
    'get_denied_modules()',
    'get_drawing_pdf(uuid)',
    'get_extension_config(uuid,text)',
    'get_extension_stats(uuid,text)',
    'get_google_drive_settings(uuid)',
    'get_item_definition_settings(uuid)',
    'get_item_designation_assignments(uuid,uuid)',
    'get_item_designations(uuid)',
    'get_item_images(uuid)',
    'get_module_access_config()',
    'get_my_pending_reviews()',
    'get_next_serial_number(uuid)',
    'get_org_auth_providers(text)',
    'get_org_column_defaults(uuid)',
    'get_org_integration_status(uuid,text)',
    'get_org_module_defaults(uuid)',
    'get_org_odoo_configs(uuid)',
    'get_review_badge_count()',
    'get_review_detail(uuid)',
    'get_review_workflow_status(uuid)',
    'get_team_module_defaults(uuid)',
    'get_user_column_defaults()',
    'get_user_module_defaults(uuid)',
    'get_user_permissions(uuid,uuid)',
    'get_user_vault_access(uuid)',
    'get_vault_files_count(uuid,uuid)',
    'get_vault_files_delta(uuid,uuid,timestamp with time zone)',
    'get_vault_files_fast(uuid,uuid)',
    'get_version_dependency_closure(uuid)',
    'get_webhooks_for_event(uuid,webhook_event)',
    'handle_new_organization()',
    'handle_new_user()',
    'import_workflow_graph(uuid,jsonb)',
    'instantiate_process_template(uuid,uuid)',
    'is_org_admin()',
    'is_org_admin(uuid)',
    'is_org_member(uuid)',
    'join_org_by_slug(text)',
    'legacy_file_state(text)',
    'like_escape(text)',
    'list_open_reviews_for_files(uuid[])',
    'list_review_queue(text,uuid,text,integer,text)',
    'log_file_activity()',
    'may_access_vault(uuid)',
    'may_read_vault_object(text)',
    'may_review_gate(uuid,uuid)',
    'merge_custom_properties(jsonb,jsonb)',
    'migrate_uuid_defaults()',
    'move_file(uuid,uuid,text,text)',
    'my_accessible_vault_ids()',
    'my_solidworks_license_ids()',
    'my_verified_email()',
    'next_revision_value(text,revision_scheme)',
    'notify_file_watchers()',
    'notify_overdue_reviews()',
    'org_file_workflows_enabled(uuid)',
    'org_gate_exclusion_reason(oid)',
    'org_gate_status_blocks(text)',
    'preview_next_serial_number(uuid)',
    'probe_literal_for(text)',
    'probe_literal_for_arg(oid,text,text)',
    'record_drawing_pdf(uuid,text,bigint,boolean)',
    'record_remediation(text,integer,jsonb,text)',
    'record_version_references(uuid,jsonb)',
    'regenerate_org_slug()',
    'remediate_case_colliding_folders()',
    'remediate_cross_tenant_share_links()',
    'remediate_cross_tenant_workflow_history()',
    'remove_pending_license_assignment(uuid,uuid)',
    'remove_review_items(uuid,uuid[])',
    'rename_folder_files(text,text,uuid,uuid)',
    'repair_config_maps(uuid,jsonb)',
    'request_review(uuid[],uuid[],uuid[],text,text,text,text,date)',
    'require_eco_access(uuid)',
    'require_file_access(uuid)',
    'require_org_member(uuid)',
    'require_review_access(uuid)',
    'require_same_org_user(uuid)',
    'require_vault_access(uuid)',
    'reset_item_image(uuid,text)',
    'respond_to_review_items(uuid,jsonb)',
    'resubmit_review(uuid,jsonb,text)',
    'review_advance_items(uuid,boolean)',
    'review_display_title(uuid)',
    'review_items_deleted_resettle()',
    'review_notify(uuid,uuid[],uuid,text,text,text,uuid,text)',
    'review_owed_item_ids(uuid,uuid)',
    'review_priority_rank(text)',
    'review_settle(uuid,uuid,boolean)',
    'review_stage_exit_transition(uuid)',
    'review_status_label(review_status)',
    'review_user_json(uuid)',
    'review_withdraw_lost_reviewers()',
    'review_withdraw_lost_reviewers_trigger()',
    'review_workflow_after_settle(uuid,text)',
    'revoke_public_execute_on_org_rpcs()',
    'row_selecting_id_args(oid)',
    'schema_release_description()',
    'schema_release_manifest()',
    'schema_release_version()',
    'set_color_swatch_creator()',
    'set_item_designation_assignment(uuid,uuid,text,uuid)',
    'set_module_access(text,uuid[],uuid[])',
    'set_org_column_defaults(uuid,jsonb)',
    'set_org_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'set_team_module_defaults(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'set_user_column_defaults(jsonb)',
    'share_link_admission(text)',
    'strip_sql_noise(text)',
    'sync_eco_tags_on_eco_update()',
    'sync_file_eco_tags()',
    'team_reviewer_user_ids(uuid)',
    'try_stamp_schema()',
    'unassign_solidworks_license(uuid)',
    'unblock_user(text)',
    'update_extension_config(uuid,text,jsonb)',
    'update_google_drive_settings(uuid,text,text,boolean,text)',
    'update_integration_credentials_timestamp()',
    'update_item_definition_settings(uuid,jsonb)',
    'update_last_online()',
    'update_org_address_timestamp()',
    'update_org_branding(uuid,text,text,text,text,text)',
    'update_review_meta(uuid,text,date,boolean)',
    'update_schema_version(integer,text)',
    'update_serialization_settings_safe(uuid,jsonb)',
    'update_updated_at_column()',
    'update_user_avatar(text,text)',
    'upsert_item_designation(uuid,text,uuid,integer)',
    'upsert_item_image(uuid,text,text,text,text,text)',
    'use_admin_recovery_code(text,text)',
    'user_can_access_module(text,uuid)',
    'user_can_run_transition(uuid,uuid)',
    'user_has_permission(uuid,text,permission_action,uuid)',
    'user_has_team_permission(text,permission_action,uuid)',
    'user_may_access_vault(uuid,uuid)',
    'validate_share_link(text)',
    'verified_auth_email(uuid)',
    'verify_and_stamp_schema()',
    'version_reference_edges(uuid[],uuid)',
    'withdrawn_execute_manifest()',
    'create_review_request(uuid,uuid,uuid,uuid,uuid[],text,text,integer)',
    'extend_backup_lock(uuid,text,integer)',
    'get_odoo_integration(uuid)',
    'get_odoo_saved_configs(uuid)',
    'get_woocommerce_saved_configs(uuid)',
    'handle_supplier_signup()',
    'mark_notifications_read(uuid[])',
    'update_odoo_saved_config_timestamp()',
    'update_woocommerce_saved_config_timestamp()'
  ]::TEXT[]) s WHERE to_regprocedure('public.' || s) IS NOT NULL);

  FOR r IN
    SELECT t.tgname, c.relnamespace::regnamespace::text AS nsp, c.relname
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND t.tgfoid = ANY (v_fns)
  LOOP
    EXECUTE format('DROP TRIGGER %I ON %I.%I', r.tgname, r.nsp, r.relname);
  END LOOP;

  FOREACH v_sig IN ARRAY ARRAY[
    'parts_with_pricing'
  ]::TEXT[]
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I', v_sig);
  END LOOP;

  FOR r IN SELECT unnest(v_fns)::regprocedure AS f LOOP
    EXECUTE format('DROP FUNCTION %s', r.f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. Drop what 5.0 removes: the sandboxed extension tables and columns (O6),
--    and the deprecated credential columns (S3). All checked empty in step 0.
-- ---------------------------------------------------------------------
DROP TABLE public.extension_http_log;
DROP TABLE public.extension_secret_access;
DROP TABLE public.extension_secret_versions;
DROP TABLE public.extension_secrets;
DROP TABLE public.extension_storage;
DROP TABLE public.org_extension_config;
ALTER TABLE public.org_installed_extensions DROP COLUMN handlers, DROP COLUMN allowed_domains, DROP COLUMN pinned_version;
ALTER TABLE public.odoo_saved_configs DROP COLUMN api_key_encrypted;
ALTER TABLE public.organization_integrations DROP COLUMN credentials_encrypted;

-- Tables older releases created that no 4.x file defines. Dropped when empty;
-- one that holds rows is left in place and reported.
DO $$
DECLARE
  v_t TEXT;
  v_n BIGINT;
BEGIN
  FOREACH v_t IN ARRAY ARRAY[
    'woocommerce_product_mappings',
    'woocommerce_saved_configs',
    'review_history'
  ]::TEXT[]
  LOOP
    CONTINUE WHEN to_regclass('public.' || quote_ident(v_t)) IS NULL;
    EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
    IF v_n = 0 THEN
      EXECUTE format('DROP TABLE public.%I', v_t);
    ELSE
      RAISE NOTICE '0500: % holds % row(s); left in place', v_t, v_n;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3. Rename tables and columns (supabase/rename-map-5.0.json). A rename keeps
--    the rows, the grants, the publication membership and the dependent
--    constraints and indexes.
-- ---------------------------------------------------------------------
ALTER TABLE public.organizations RENAME TO organization;
ALTER TABLE public.users RENAME TO app_user;
ALTER TABLE public.blocked_users RENAME TO blocked_user;
ALTER TABLE public.teams RENAME TO team;
ALTER TABLE public.team_members RENAME TO team_member;
ALTER TABLE public.team_reviewers RENAME TO team_reviewer;
ALTER TABLE public.team_permissions RENAME TO team_permission;
ALTER TABLE public.permission_presets RENAME TO permission_preset;
ALTER TABLE public.user_permissions RENAME TO user_permission;
ALTER TABLE public.job_titles RENAME TO job_title;
ALTER TABLE public.user_job_titles RENAME TO user_job_title;
ALTER TABLE public.pending_org_members RENAME TO pending_org_member;
ALTER TABLE public.admin_recovery_codes RENAME TO admin_recovery_code;
ALTER TABLE public.user_sessions RENAME TO user_session;
ALTER TABLE public.notifications RENAME TO notification;
ALTER TABLE public.color_swatches RENAME TO color_swatch;
ALTER TABLE public.vaults RENAME TO vault;
ALTER TABLE public.workflow_templates RENAME TO workflow_template;
ALTER TABLE public.workflow_states RENAME TO workflow_state;
ALTER TABLE public.files RENAME TO file;
ALTER TABLE public.file_versions RENAME TO file_version;
ALTER TABLE public.release_files RENAME TO release_file;
ALTER TABLE public.file_references RENAME TO file_reference;
ALTER TABLE public.file_version_references RENAME TO file_version_reference;
ALTER TABLE public.drawing_pdf_renders RENAME TO drawing_pdf_render;
ALTER TABLE public.folders RENAME TO folder;
ALTER TABLE public.workflow_transitions RENAME TO workflow_transition;
ALTER TABLE public.workflow_gates RENAME TO workflow_gate;
ALTER TABLE public.workflow_gate_reviewers RENAME TO workflow_gate_reviewer;
ALTER TABLE public.workflow_roles RENAME TO workflow_role;
ALTER TABLE public.user_workflow_roles RENAME TO user_workflow_role;
ALTER TABLE public.file_workflow_assignments RENAME TO file_workflow_assignment;
ALTER TABLE public.pending_reviews RENAME TO workflow_gate_review;
ALTER TABLE public.file_state_entries RENAME TO file_state_entry;
ALTER TABLE public.file_watchers RENAME TO file_watcher;
ALTER TABLE public.file_share_links RENAME TO file_share_link;
ALTER TABLE public.file_comments RENAME TO file_comment;
ALTER TABLE public.file_metadata_columns RENAME TO file_metadata_column;
ALTER TABLE public.backup_machines RENAME TO backup_machine;
ALTER TABLE public.backup_locks RENAME TO backup_lock;
ALTER TABLE public.item_images RENAME TO item_image;
ALTER TABLE public.item_designations RENAME TO item_designation;
ALTER TABLE public.item_designation_assignments RENAME TO item_designation_assignment;
ALTER TABLE public.inspection_characteristics RENAME TO inspection_characteristic;
ALTER TABLE public.inspection_characteristic_versions RENAME TO inspection_characteristic_version;
ALTER TABLE public.inspection_methods RENAME TO inspection_method;
ALTER TABLE public.ecos RENAME TO eco;
ALTER TABLE public.file_ecos RENAME TO file_eco;
ALTER TABLE public.reviews RENAME TO review;
ALTER TABLE public.review_items RENAME TO review_item;
ALTER TABLE public.review_rounds RENAME TO review_round;
ALTER TABLE public.review_round_items RENAME TO review_round_item;
ALTER TABLE public.review_responses RENAME TO review_response;
ALTER TABLE public.review_decisions RENAME TO review_decision;
ALTER TABLE public.deviations RENAME TO deviation;
ALTER TABLE public.file_deviations RENAME TO file_deviation;
ALTER TABLE public.process_templates RENAME TO process_template;
ALTER TABLE public.process_template_phases RENAME TO process_template_phase;
ALTER TABLE public.process_template_items RENAME TO process_template_item;
ALTER TABLE public.eco_checklist_items RENAME TO eco_checklist_item;
ALTER TABLE public.eco_gate_approvals RENAME TO eco_gate_approval;
ALTER TABLE public.organization_addresses RENAME TO org_address;
ALTER TABLE public.suppliers RENAME TO supplier;
ALTER TABLE public.supplier_contacts RENAME TO supplier_contact;
ALTER TABLE public.supplier_invitations RENAME TO supplier_invitation;
ALTER TABLE public.part_suppliers RENAME TO part_supplier;
ALTER TABLE public.rfqs RENAME TO rfq;
ALTER TABLE public.rfq_number_counters RENAME TO rfq_number_counter;
ALTER TABLE public.rfq_items RENAME TO rfq_item;
ALTER TABLE public.rfq_suppliers RENAME TO rfq_supplier;
ALTER TABLE public.rfq_quotes RENAME TO rfq_quote;
ALTER TABLE public.organization_integrations RENAME TO org_integration;
ALTER TABLE public.odoo_saved_configs RENAME TO odoo_saved_config;
ALTER TABLE public.webhooks RENAME TO webhook;
ALTER TABLE public.webhook_deliveries RENAME TO webhook_delivery;
ALTER TABLE public.solidworks_licenses RENAME TO solidworks_license;
ALTER TABLE public.solidworks_license_assignments RENAME TO solidworks_license_assignment;
ALTER TABLE public.integration_credentials RENAME TO integration_credential;
ALTER TABLE public.org_installed_extensions RENAME TO org_installed_extension;

ALTER TABLE public.organization RENAME COLUMN "google_drive_enabled" TO is_google_drive_enabled;
ALTER TABLE public.app_user RENAME COLUMN "last_sign_in" TO last_sign_in_at;
ALTER TABLE public.app_user RENAME COLUMN "last_online" TO last_online_at;
ALTER TABLE public.user_session RENAME COLUMN "last_active" TO last_active_at;
ALTER TABLE public.user_session RENAME COLUMN "last_seen" TO last_seen_at;
ALTER TABLE public.notification RENAME COLUMN "action_completed" TO is_action_completed;
ALTER TABLE public.notification RENAME COLUMN "read" TO is_read;
ALTER TABLE public.workflow_state RENAME COLUMN "requires_checkout" TO is_checkout_required;
ALTER TABLE public.workflow_state RENAME COLUMN "auto_increment_revision" TO is_revision_auto_incremented;
ALTER TABLE public.workflow_state RENAME COLUMN "triggers_review" TO is_review_stage;
ALTER TABLE public.file_version_reference RENAME COLUMN "exact" TO is_exact;
ALTER TABLE public.drawing_pdf_render RENAME COLUMN "closure_exact" TO is_closure_exact;
ALTER TABLE public.workflow_gate_review RENAME COLUMN "assigned_to" TO assignee_id;
ALTER TABLE public.file_watcher RENAME COLUMN "notify_on_checkin" TO is_notified_on_checkin;
ALTER TABLE public.file_watcher RENAME COLUMN "notify_on_checkout" TO is_notified_on_checkout;
ALTER TABLE public.file_watcher RENAME COLUMN "notify_on_state_change" TO is_notified_on_state_change;
ALTER TABLE public.file_watcher RENAME COLUMN "notify_on_review" TO is_notified_on_review;
ALTER TABLE public.file_share_link RENAME COLUMN "allow_download" TO can_download;
ALTER TABLE public.file_share_link RENAME COLUMN "require_auth" TO is_auth_required;
ALTER TABLE public.file_comment RENAME COLUMN "resolved" TO is_resolved;
ALTER TABLE public.file_metadata_column RENAME COLUMN "visible" TO is_visible;
ALTER TABLE public.file_metadata_column RENAME COLUMN "sortable" TO is_sortable;
ALTER TABLE public.file_metadata_column RENAME COLUMN "required" TO is_required;
ALTER TABLE public.backup_config RENAME COLUMN "schedule_enabled" TO is_schedule_enabled;
ALTER TABLE public.backup_config RENAME COLUMN "designated_machine_last_seen" TO designated_machine_last_seen_at;
ALTER TABLE public.backup_config RENAME COLUMN "backup_running_since" TO backup_started_at;
ALTER TABLE public.backup_machine RENAME COLUMN "last_seen" TO last_seen_at;
ALTER TABLE public.review_round_item RENAME COLUMN "carried_forward" TO is_carried_forward;
ALTER TABLE public.review_decision RENAME COLUMN "legacy" TO is_legacy;
ALTER TABLE public.deviation RENAME COLUMN "effective_date" TO effective_at;
ALTER TABLE public.deviation RENAME COLUMN "expiration_date" TO expires_at;
ALTER TABLE public.process_template_item RENAME COLUMN "required_for_gate" TO is_required_for_gate;
ALTER TABLE public.eco_checklist_item RENAME COLUMN "required_for_gate" TO is_required_for_gate;
ALTER TABLE public.supplier_contact RENAME COLUMN "email_verified" TO is_email_verified;
ALTER TABLE public.supplier_contact RENAME COLUMN "phone_verified" TO is_phone_verified;
ALTER TABLE public.supplier_contact RENAME COLUMN "last_sign_in" TO last_sign_in_at;
ALTER TABLE public.part_supplier RENAME COLUMN "last_price_update" TO price_updated_at;
ALTER TABLE public.rfq RENAME COLUMN "requires_samples" TO is_samples_required;
ALTER TABLE public.rfq RENAME COLUMN "requires_first_article" TO is_first_article_required;
ALTER TABLE public.rfq RENAME COLUMN "requires_quality_report" TO is_quality_report_required;
ALTER TABLE public.rfq RENAME COLUMN "allow_partial_quotes" TO is_partial_quote_allowed;
ALTER TABLE public.rfq RENAME COLUMN "release_files_generated" TO is_release_files_generated;
ALTER TABLE public.org_integration RENAME COLUMN "auto_sync" TO is_auto_sync;
ALTER TABLE public.integration_sync_log RENAME COLUMN "cancel_requested" TO is_cancel_requested;
ALTER TABLE public.integration_sync_log RENAME COLUMN "sync_watermark" TO sync_watermark_at;
ALTER TABLE public.odoo_saved_config RENAME COLUMN "last_test_success" TO is_last_test_successful;
ALTER TABLE public.org_installed_extension RENAME COLUMN "enabled" TO is_enabled;

-- S2
ALTER TABLE public.file ALTER COLUMN vault_id SET NOT NULL;

-- ---------------------------------------------------------------------
-- 3b. Tables new in 5.0, created and seeded exactly as the baseline does.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. Constraints and indexes take the 5.0 names. They are matched by table and
--    definition, not by their 4.x names, so a name a database picked up on the
--    way (a numbered duplicate, a truncated default) still lands on the
--    baseline's name. A baseline constraint or index the database lacks is
--    created (S7's foreign keys); one the baseline does not have is reported
--    and left alone.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _bp_con (tbl TEXT, def TEXT, name TEXT, claimed BOOLEAN DEFAULT false) ON COMMIT DROP;
INSERT INTO _bp_con (tbl, def, name) VALUES
  ('schema_version', 'CHECK ((id = 1))', 'schema_version_id_check'),
  ('schema_version', 'NOT NULL id', 'schema_version_id_not_null'),
  ('schema_version', 'NOT NULL version', 'schema_version_version_not_null'),
  ('schema_version', 'PRIMARY KEY (id)', 'schema_version_pkey'),
  ('schema_manifest_entry', 'CHECK ((kind = ANY (ARRAY[''table''::text, ''function''::text])))', 'schema_manifest_entry_kind_check'),
  ('schema_manifest_entry', 'NOT NULL kind', 'schema_manifest_entry_kind_not_null'),
  ('schema_manifest_entry', 'NOT NULL name', 'schema_manifest_entry_name_not_null'),
  ('schema_manifest_entry', 'NOT NULL module', 'schema_manifest_entry_module_not_null'),
  ('schema_manifest_entry', 'NOT NULL since_version', 'schema_manifest_entry_since_version_not_null'),
  ('schema_manifest_entry', 'PRIMARY KEY (kind, name)', 'schema_manifest_entry_pkey'),
  ('schema_remediation_log', 'NOT NULL id', 'schema_remediation_log_id_not_null'),
  ('schema_remediation_log', 'NOT NULL remediation', 'schema_remediation_log_remediation_not_null'),
  ('schema_remediation_log', 'NOT NULL release', 'schema_remediation_log_release_not_null'),
  ('schema_remediation_log', 'NOT NULL ran_at', 'schema_remediation_log_ran_at_not_null'),
  ('schema_remediation_log', 'NOT NULL ran_by', 'schema_remediation_log_ran_by_not_null'),
  ('schema_remediation_log', 'NOT NULL rows_acted_on', 'schema_remediation_log_rows_acted_on_not_null'),
  ('schema_remediation_log', 'NOT NULL subjects', 'schema_remediation_log_subjects_not_null'),
  ('schema_remediation_log', 'PRIMARY KEY (id)', 'schema_remediation_log_pkey'),
  ('organization', 'NOT NULL id', 'organization_id_not_null'),
  ('organization', 'NOT NULL name', 'organization_name_not_null'),
  ('organization', 'NOT NULL slug', 'organization_slug_not_null'),
  ('organization', 'NOT NULL email_domains', 'organization_email_domains_not_null'),
  ('organization', 'PRIMARY KEY (id)', 'organization_pkey'),
  ('organization', 'UNIQUE (slug)', 'organization_slug_key'),
  ('app_user', 'NOT NULL id', 'app_user_id_not_null'),
  ('app_user', 'NOT NULL email', 'app_user_email_not_null'),
  ('app_user', 'NOT NULL role', 'app_user_role_not_null'),
  ('app_user', 'PRIMARY KEY (id)', 'app_user_pkey'),
  ('app_user', 'UNIQUE (email)', 'app_user_email_key'),
  ('app_user', 'FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE', 'app_user_id_fkey'),
  ('app_user', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE SET NULL', 'app_user_org_id_fkey'),
  ('blocked_user', 'NOT NULL id', 'blocked_user_id_not_null'),
  ('blocked_user', 'NOT NULL org_id', 'blocked_user_org_id_not_null'),
  ('blocked_user', 'NOT NULL email', 'blocked_user_email_not_null'),
  ('blocked_user', 'PRIMARY KEY (id)', 'blocked_user_pkey'),
  ('blocked_user', 'UNIQUE (org_id, email)', 'blocked_user_org_id_email_key'),
  ('blocked_user', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'blocked_user_org_id_fkey'),
  ('blocked_user', 'FOREIGN KEY (blocked_by) REFERENCES app_user(id) ON DELETE SET NULL', 'blocked_user_blocked_by_fkey'),
  ('team', 'NOT NULL id', 'team_id_not_null'),
  ('team', 'NOT NULL org_id', 'team_org_id_not_null'),
  ('team', 'NOT NULL name', 'team_name_not_null'),
  ('team', 'NOT NULL color', 'team_color_not_null'),
  ('team', 'NOT NULL icon', 'team_icon_not_null'),
  ('team', 'PRIMARY KEY (id)', 'team_pkey'),
  ('team', 'UNIQUE (org_id, name)', 'team_org_id_name_key'),
  ('team', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'team_org_id_fkey'),
  ('team', 'FOREIGN KEY (parent_team_id) REFERENCES team(id) ON DELETE SET NULL', 'team_parent_team_id_fkey'),
  ('team', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'team_created_by_fkey'),
  ('team', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'team_updated_by_fkey'),
  ('team_member', 'NOT NULL id', 'team_member_id_not_null'),
  ('team_member', 'NOT NULL team_id', 'team_member_team_id_not_null'),
  ('team_member', 'NOT NULL user_id', 'team_member_user_id_not_null'),
  ('team_member', 'PRIMARY KEY (id)', 'team_member_pkey'),
  ('team_member', 'UNIQUE (team_id, user_id)', 'team_member_team_id_user_id_key'),
  ('team_member', 'FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE CASCADE', 'team_member_team_id_fkey'),
  ('team_member', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'team_member_user_id_fkey'),
  ('team_member', 'FOREIGN KEY (added_by) REFERENCES app_user(id)', 'team_member_added_by_fkey'),
  ('team_reviewer', 'CHECK ((reviewer_type = ANY (ARRAY[''user''::text, ''workflow_role''::text])))', 'team_reviewer_reviewer_type_check'),
  ('team_reviewer', 'NOT NULL id', 'team_reviewer_id_not_null'),
  ('team_reviewer', 'NOT NULL team_id', 'team_reviewer_team_id_not_null'),
  ('team_reviewer', 'NOT NULL reviewer_type', 'team_reviewer_reviewer_type_not_null'),
  ('team_reviewer', 'PRIMARY KEY (id)', 'team_reviewer_pkey'),
  ('team_reviewer', 'FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE CASCADE', 'team_reviewer_team_id_fkey'),
  ('team_reviewer', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'team_reviewer_user_id_fkey'),
  ('team_reviewer', 'FOREIGN KEY (added_by) REFERENCES app_user(id)', 'team_reviewer_added_by_fkey'),
  ('team_permission', 'NOT NULL id', 'team_permission_id_not_null'),
  ('team_permission', 'NOT NULL team_id', 'team_permission_team_id_not_null'),
  ('team_permission', 'NOT NULL resource', 'team_permission_resource_not_null'),
  ('team_permission', 'PRIMARY KEY (id)', 'team_permission_pkey'),
  ('team_permission', 'FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE CASCADE', 'team_permission_team_id_fkey'),
  ('team_permission', 'FOREIGN KEY (granted_by) REFERENCES app_user(id)', 'team_permission_granted_by_fkey'),
  ('team_permission', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'team_permission_updated_by_fkey'),
  ('permission_preset', 'NOT NULL id', 'permission_preset_id_not_null'),
  ('permission_preset', 'NOT NULL org_id', 'permission_preset_org_id_not_null'),
  ('permission_preset', 'NOT NULL name', 'permission_preset_name_not_null'),
  ('permission_preset', 'PRIMARY KEY (id)', 'permission_preset_pkey'),
  ('permission_preset', 'UNIQUE (org_id, name)', 'permission_preset_org_id_name_key'),
  ('permission_preset', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'permission_preset_org_id_fkey'),
  ('permission_preset', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'permission_preset_created_by_fkey'),
  ('permission_preset', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'permission_preset_updated_by_fkey'),
  ('user_permission', 'NOT NULL id', 'user_permission_id_not_null'),
  ('user_permission', 'NOT NULL user_id', 'user_permission_user_id_not_null'),
  ('user_permission', 'NOT NULL resource', 'user_permission_resource_not_null'),
  ('user_permission', 'PRIMARY KEY (id)', 'user_permission_pkey'),
  ('user_permission', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'user_permission_user_id_fkey'),
  ('user_permission', 'FOREIGN KEY (granted_by) REFERENCES app_user(id)', 'user_permission_granted_by_fkey'),
  ('user_permission', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'user_permission_updated_by_fkey'),
  ('module_access', 'CHECK (((team_id IS NULL) <> (user_id IS NULL)))', 'module_access_check'),
  ('module_access', 'NOT NULL id', 'module_access_id_not_null'),
  ('module_access', 'NOT NULL org_id', 'module_access_org_id_not_null'),
  ('module_access', 'NOT NULL module_id', 'module_access_module_id_not_null'),
  ('module_access', 'PRIMARY KEY (id)', 'module_access_pkey'),
  ('module_access', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'module_access_org_id_fkey'),
  ('module_access', 'FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE CASCADE', 'module_access_team_id_fkey'),
  ('module_access', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'module_access_user_id_fkey'),
  ('module_access', 'FOREIGN KEY (granted_by) REFERENCES app_user(id)', 'module_access_granted_by_fkey'),
  ('job_title', 'NOT NULL id', 'job_title_id_not_null'),
  ('job_title', 'NOT NULL org_id', 'job_title_org_id_not_null'),
  ('job_title', 'NOT NULL name', 'job_title_name_not_null'),
  ('job_title', 'PRIMARY KEY (id)', 'job_title_pkey'),
  ('job_title', 'UNIQUE (org_id, name)', 'job_title_org_id_name_key'),
  ('job_title', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'job_title_org_id_fkey'),
  ('job_title', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'job_title_created_by_fkey'),
  ('job_title', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'job_title_updated_by_fkey'),
  ('user_job_title', 'NOT NULL id', 'user_job_title_id_not_null'),
  ('user_job_title', 'NOT NULL user_id', 'user_job_title_user_id_not_null'),
  ('user_job_title', 'NOT NULL title_id', 'user_job_title_title_id_not_null'),
  ('user_job_title', 'PRIMARY KEY (id)', 'user_job_title_pkey'),
  ('user_job_title', 'UNIQUE (user_id)', 'user_job_title_user_id_key'),
  ('user_job_title', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'user_job_title_user_id_fkey'),
  ('user_job_title', 'FOREIGN KEY (title_id) REFERENCES job_title(id) ON DELETE CASCADE', 'user_job_title_title_id_fkey'),
  ('user_job_title', 'FOREIGN KEY (assigned_by) REFERENCES app_user(id)', 'user_job_title_assigned_by_fkey'),
  ('pending_org_member', 'NOT NULL id', 'pending_org_member_id_not_null'),
  ('pending_org_member', 'NOT NULL org_id', 'pending_org_member_org_id_not_null'),
  ('pending_org_member', 'NOT NULL email', 'pending_org_member_email_not_null'),
  ('pending_org_member', 'PRIMARY KEY (id)', 'pending_org_member_pkey'),
  ('pending_org_member', 'UNIQUE (org_id, email)', 'pending_org_member_org_id_email_key'),
  ('pending_org_member', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'pending_org_member_org_id_fkey'),
  ('pending_org_member', 'FOREIGN KEY (invited_by) REFERENCES app_user(id) ON DELETE SET NULL', 'pending_org_member_invited_by_fkey'),
  ('pending_org_member', 'FOREIGN KEY (claimed_by) REFERENCES app_user(id) ON DELETE SET NULL', 'pending_org_member_claimed_by_fkey'),
  ('admin_recovery_code', 'NOT NULL id', 'admin_recovery_code_id_not_null'),
  ('admin_recovery_code', 'NOT NULL org_id', 'admin_recovery_code_org_id_not_null'),
  ('admin_recovery_code', 'NOT NULL code_hash', 'admin_recovery_code_code_hash_not_null'),
  ('admin_recovery_code', 'NOT NULL created_by', 'admin_recovery_code_created_by_not_null'),
  ('admin_recovery_code', 'NOT NULL expires_at', 'admin_recovery_code_expires_at_not_null'),
  ('admin_recovery_code', 'PRIMARY KEY (id)', 'admin_recovery_code_pkey'),
  ('admin_recovery_code', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'admin_recovery_code_org_id_fkey'),
  ('admin_recovery_code', 'FOREIGN KEY (created_by) REFERENCES app_user(id) ON DELETE SET NULL', 'admin_recovery_code_created_by_fkey'),
  ('admin_recovery_code', 'FOREIGN KEY (used_by) REFERENCES app_user(id) ON DELETE SET NULL', 'admin_recovery_code_used_by_fkey'),
  ('admin_recovery_code', 'FOREIGN KEY (revoked_by) REFERENCES app_user(id) ON DELETE SET NULL', 'admin_recovery_code_revoked_by_fkey'),
  ('user_session', 'NOT NULL id', 'user_session_id_not_null'),
  ('user_session', 'NOT NULL user_id', 'user_session_user_id_not_null'),
  ('user_session', 'NOT NULL org_id', 'user_session_org_id_not_null'),
  ('user_session', 'NOT NULL machine_id', 'user_session_machine_id_not_null'),
  ('user_session', 'PRIMARY KEY (id)', 'user_session_pkey'),
  ('user_session', 'UNIQUE (user_id, machine_id)', 'user_session_user_id_machine_id_key'),
  ('user_session', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'user_session_user_id_fkey'),
  ('user_session', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'user_session_org_id_fkey'),
  ('notification', 'NOT NULL id', 'notification_id_not_null'),
  ('notification', 'NOT NULL org_id', 'notification_org_id_not_null'),
  ('notification', 'NOT NULL user_id', 'notification_user_id_not_null'),
  ('notification', 'NOT NULL type', 'notification_type_not_null'),
  ('notification', 'NOT NULL title', 'notification_title_not_null'),
  ('notification', 'PRIMARY KEY (id)', 'notification_pkey'),
  ('notification', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'notification_org_id_fkey'),
  ('notification', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'notification_user_id_fkey'),
  ('notification', 'FOREIGN KEY (from_user_id) REFERENCES app_user(id) ON DELETE SET NULL', 'notification_from_user_id_fkey'),
  ('color_swatch', 'CHECK ((((user_id IS NOT NULL) AND (org_id IS NULL)) OR ((user_id IS NULL) AND (org_id IS NOT NULL))))', 'color_swatch_scope_check'),
  ('color_swatch', 'NOT NULL id', 'color_swatch_id_not_null'),
  ('color_swatch', 'NOT NULL color', 'color_swatch_color_not_null'),
  ('color_swatch', 'PRIMARY KEY (id)', 'color_swatch_pkey'),
  ('color_swatch', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'color_swatch_user_id_fkey'),
  ('color_swatch', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'color_swatch_org_id_fkey'),
  ('color_swatch', 'FOREIGN KEY (created_by) REFERENCES app_user(id) ON DELETE SET NULL', 'color_swatch_created_by_fkey'),
  ('organization', 'FOREIGN KEY (default_new_user_team_id) REFERENCES team(id) ON DELETE SET NULL', 'organization_default_new_user_team_id_fkey'),
  ('vault', 'NOT NULL id', 'vault_id_not_null'),
  ('vault', 'NOT NULL org_id', 'vault_org_id_not_null'),
  ('vault', 'NOT NULL name', 'vault_name_not_null'),
  ('vault', 'NOT NULL slug', 'vault_slug_not_null'),
  ('vault', 'PRIMARY KEY (id)', 'vault_pkey'),
  ('vault', 'UNIQUE (org_id, slug)', 'vault_org_id_slug_key'),
  ('vault', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'vault_org_id_fkey'),
  ('vault', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'vault_created_by_fkey'),
  ('vault_access', 'NOT NULL id', 'vault_access_id_not_null'),
  ('vault_access', 'NOT NULL vault_id', 'vault_access_vault_id_not_null'),
  ('vault_access', 'NOT NULL user_id', 'vault_access_user_id_not_null'),
  ('vault_access', 'PRIMARY KEY (id)', 'vault_access_pkey'),
  ('vault_access', 'UNIQUE (vault_id, user_id)', 'vault_access_vault_id_user_id_key'),
  ('vault_access', 'FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE CASCADE', 'vault_access_vault_id_fkey'),
  ('vault_access', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'vault_access_user_id_fkey'),
  ('vault_access', 'FOREIGN KEY (granted_by) REFERENCES app_user(id)', 'vault_access_granted_by_fkey'),
  ('team_vault_access', 'NOT NULL id', 'team_vault_access_id_not_null'),
  ('team_vault_access', 'NOT NULL team_id', 'team_vault_access_team_id_not_null'),
  ('team_vault_access', 'NOT NULL vault_id', 'team_vault_access_vault_id_not_null'),
  ('team_vault_access', 'PRIMARY KEY (id)', 'team_vault_access_pkey'),
  ('team_vault_access', 'UNIQUE (team_id, vault_id)', 'team_vault_access_team_id_vault_id_key'),
  ('team_vault_access', 'FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE CASCADE', 'team_vault_access_team_id_fkey'),
  ('team_vault_access', 'FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE CASCADE', 'team_vault_access_vault_id_fkey'),
  ('team_vault_access', 'FOREIGN KEY (granted_by) REFERENCES app_user(id)', 'team_vault_access_granted_by_fkey'),
  ('workflow_template', 'NOT NULL id', 'workflow_template_id_not_null'),
  ('workflow_template', 'NOT NULL org_id', 'workflow_template_org_id_not_null'),
  ('workflow_template', 'NOT NULL name', 'workflow_template_name_not_null'),
  ('workflow_template', 'PRIMARY KEY (id)', 'workflow_template_pkey'),
  ('workflow_template', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'workflow_template_org_id_fkey'),
  ('workflow_template', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'workflow_template_created_by_fkey'),
  ('workflow_template', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'workflow_template_updated_by_fkey'),
  ('workflow_state', 'NOT NULL id', 'workflow_state_id_not_null'),
  ('workflow_state', 'NOT NULL workflow_id', 'workflow_state_workflow_id_not_null'),
  ('workflow_state', 'NOT NULL name', 'workflow_state_name_not_null'),
  ('workflow_state', 'NOT NULL width', 'workflow_state_width_not_null'),
  ('workflow_state', 'NOT NULL height', 'workflow_state_height_not_null'),
  ('workflow_state', 'PRIMARY KEY (id)', 'workflow_state_pkey'),
  ('workflow_state', 'FOREIGN KEY (workflow_id) REFERENCES workflow_template(id) ON DELETE CASCADE', 'workflow_state_workflow_id_fkey'),
  ('workflow_state', 'FOREIGN KEY (review_approved_state_id) REFERENCES workflow_state(id) ON DELETE SET NULL', 'workflow_state_review_approved_state_id_fkey'),
  ('file', 'NOT NULL id', 'file_id_not_null'),
  ('file', 'NOT NULL org_id', 'file_org_id_not_null'),
  ('file', 'NOT NULL vault_id', 'file_vault_id_not_null'),
  ('file', 'NOT NULL file_path', 'file_file_path_not_null'),
  ('file', 'NOT NULL file_name', 'file_file_name_not_null'),
  ('file', 'NOT NULL extension', 'file_extension_not_null'),
  ('file', 'NOT NULL file_type', 'file_file_type_not_null'),
  ('file', 'NOT NULL revision', 'file_revision_not_null'),
  ('file', 'NOT NULL version', 'file_version_not_null'),
  ('file', 'NOT NULL created_by', 'file_created_by_not_null'),
  ('file', 'PRIMARY KEY (id)', 'file_pkey'),
  ('file', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'file_org_id_fkey'),
  ('file', 'FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE CASCADE', 'file_vault_id_fkey'),
  ('file', 'FOREIGN KEY (workflow_state_id) REFERENCES workflow_state(id)', 'file_workflow_state_id_fkey'),
  ('file', 'FOREIGN KEY (state_changed_by) REFERENCES app_user(id)', 'file_state_changed_by_fkey'),
  ('file', 'FOREIGN KEY (checked_out_by) REFERENCES app_user(id)', 'file_checked_out_by_fkey'),
  ('file', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'file_created_by_fkey'),
  ('file', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'file_updated_by_fkey'),
  ('file', 'FOREIGN KEY (deleted_by) REFERENCES app_user(id)', 'file_deleted_by_fkey'),
  ('file_version', 'NOT NULL id', 'file_version_id_not_null'),
  ('file_version', 'NOT NULL file_id', 'file_version_file_id_not_null'),
  ('file_version', 'NOT NULL version', 'file_version_version_not_null'),
  ('file_version', 'NOT NULL revision', 'file_version_revision_not_null'),
  ('file_version', 'NOT NULL content_hash', 'file_version_content_hash_not_null'),
  ('file_version', 'NOT NULL state', 'file_version_state_not_null'),
  ('file_version', 'NOT NULL created_by', 'file_version_created_by_not_null'),
  ('file_version', 'PRIMARY KEY (id)', 'file_version_pkey'),
  ('file_version', 'UNIQUE (file_id, version)', 'file_version_file_id_version_key'),
  ('file_version', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_version_file_id_fkey'),
  ('file_version', 'FOREIGN KEY (workflow_state_id) REFERENCES workflow_state(id)', 'file_version_workflow_state_id_fkey'),
  ('file_version', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'file_version_created_by_fkey'),
  ('release_file', 'NOT NULL id', 'release_file_id_not_null'),
  ('release_file', 'NOT NULL file_id', 'release_file_file_id_not_null'),
  ('release_file', 'NOT NULL version', 'release_file_version_not_null'),
  ('release_file', 'NOT NULL file_type', 'release_file_file_type_not_null'),
  ('release_file', 'NOT NULL file_name', 'release_file_file_name_not_null'),
  ('release_file', 'NOT NULL org_id', 'release_file_org_id_not_null'),
  ('release_file', 'PRIMARY KEY (id)', 'release_file_pkey'),
  ('release_file', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'release_file_file_id_fkey'),
  ('release_file', 'FOREIGN KEY (file_version_id) REFERENCES file_version(id) ON DELETE SET NULL', 'release_file_file_version_id_fkey'),
  ('release_file', 'FOREIGN KEY (generated_by) REFERENCES app_user(id)', 'release_file_generated_by_fkey'),
  ('release_file', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'release_file_org_id_fkey'),
  ('file_reference', 'NOT NULL id', 'file_reference_id_not_null'),
  ('file_reference', 'NOT NULL org_id', 'file_reference_org_id_not_null'),
  ('file_reference', 'NOT NULL parent_file_id', 'file_reference_parent_file_id_not_null'),
  ('file_reference', 'NOT NULL child_file_id', 'file_reference_child_file_id_not_null'),
  ('file_reference', 'PRIMARY KEY (id)', 'file_reference_pkey'),
  ('file_reference', 'UNIQUE (parent_file_id, child_file_id, configuration)', 'file_reference_parent_file_id_child_file_id_configuration_key'),
  ('file_reference', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'file_reference_org_id_fkey'),
  ('file_reference', 'FOREIGN KEY (parent_file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_reference_parent_file_id_fkey'),
  ('file_reference', 'FOREIGN KEY (child_file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_reference_child_file_id_fkey'),
  ('file_version_reference', 'CHECK ((length(btrim(child_path)) > 0))', 'file_version_reference_child_path_check'),
  ('file_version_reference', 'CHECK ((quantity >= 1))', 'file_version_reference_quantity_check'),
  ('file_version_reference', 'NOT NULL id', 'file_version_reference_id_not_null'),
  ('file_version_reference', 'NOT NULL org_id', 'file_version_reference_org_id_not_null'),
  ('file_version_reference', 'NOT NULL parent_version_id', 'file_version_reference_parent_version_id_not_null'),
  ('file_version_reference', 'NOT NULL parent_file_id', 'file_version_reference_parent_file_id_not_null'),
  ('file_version_reference', 'NOT NULL child_path', 'file_version_reference_child_path_not_null'),
  ('file_version_reference', 'NOT NULL reference_type', 'file_version_reference_reference_type_not_null'),
  ('file_version_reference', 'NOT NULL quantity', 'file_version_reference_quantity_not_null'),
  ('file_version_reference', 'NOT NULL is_exact', 'file_version_reference_is_exact_not_null'),
  ('file_version_reference', 'NOT NULL created_at', 'file_version_reference_created_at_not_null'),
  ('file_version_reference', 'PRIMARY KEY (id)', 'file_version_reference_pkey'),
  ('file_version_reference', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'file_version_reference_org_id_fkey'),
  ('file_version_reference', 'FOREIGN KEY (parent_version_id) REFERENCES file_version(id) ON DELETE CASCADE', 'file_version_reference_parent_version_id_fkey'),
  ('file_version_reference', 'FOREIGN KEY (parent_file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_version_reference_parent_file_id_fkey'),
  ('file_version_reference', 'FOREIGN KEY (child_file_id) REFERENCES file(id) ON DELETE SET NULL', 'file_version_reference_child_file_id_fkey'),
  ('file_version_reference', 'FOREIGN KEY (child_version_id) REFERENCES file_version(id) ON DELETE SET NULL', 'file_version_reference_child_version_id_fkey'),
  ('drawing_pdf_render', 'CHECK ((storage_hash ~ ''^[0-9a-f]{64}$''::text))', 'drawing_pdf_render_storage_hash_check'),
  ('drawing_pdf_render', 'CHECK ((file_size > 0))', 'drawing_pdf_render_file_size_check'),
  ('drawing_pdf_render', 'NOT NULL id', 'drawing_pdf_render_id_not_null'),
  ('drawing_pdf_render', 'NOT NULL org_id', 'drawing_pdf_render_org_id_not_null'),
  ('drawing_pdf_render', 'NOT NULL file_id', 'drawing_pdf_render_file_id_not_null'),
  ('drawing_pdf_render', 'NOT NULL file_version_id', 'drawing_pdf_render_file_version_id_not_null'),
  ('drawing_pdf_render', 'NOT NULL storage_hash', 'drawing_pdf_render_storage_hash_not_null'),
  ('drawing_pdf_render', 'NOT NULL file_size', 'drawing_pdf_render_file_size_not_null'),
  ('drawing_pdf_render', 'NOT NULL generated_at', 'drawing_pdf_render_generated_at_not_null'),
  ('drawing_pdf_render', 'PRIMARY KEY (id)', 'drawing_pdf_render_pkey'),
  ('drawing_pdf_render', 'UNIQUE (file_version_id)', 'drawing_pdf_render_file_version_id_key'),
  ('drawing_pdf_render', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'drawing_pdf_render_org_id_fkey'),
  ('drawing_pdf_render', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'drawing_pdf_render_file_id_fkey'),
  ('drawing_pdf_render', 'FOREIGN KEY (file_version_id) REFERENCES file_version(id) ON DELETE CASCADE', 'drawing_pdf_render_file_version_id_fkey'),
  ('drawing_pdf_render', 'FOREIGN KEY (generated_by) REFERENCES app_user(id) ON DELETE SET NULL', 'drawing_pdf_render_generated_by_fkey'),
  ('folder', 'NOT NULL id', 'folder_id_not_null'),
  ('folder', 'NOT NULL org_id', 'folder_org_id_not_null'),
  ('folder', 'NOT NULL vault_id', 'folder_vault_id_not_null'),
  ('folder', 'NOT NULL folder_path', 'folder_folder_path_not_null'),
  ('folder', 'PRIMARY KEY (id)', 'folder_pkey'),
  ('folder', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'folder_org_id_fkey'),
  ('folder', 'FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE CASCADE', 'folder_vault_id_fkey'),
  ('folder', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'folder_created_by_fkey'),
  ('folder', 'FOREIGN KEY (deleted_by) REFERENCES app_user(id)', 'folder_deleted_by_fkey'),
  ('activity', 'NOT NULL id', 'activity_id_not_null'),
  ('activity', 'NOT NULL org_id', 'activity_org_id_not_null'),
  ('activity', 'NOT NULL user_id', 'activity_user_id_not_null'),
  ('activity', 'NOT NULL user_email', 'activity_user_email_not_null'),
  ('activity', 'NOT NULL action', 'activity_action_not_null'),
  ('activity', 'PRIMARY KEY (id)', 'activity_pkey'),
  ('activity', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'activity_org_id_fkey'),
  ('activity', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE SET NULL', 'activity_file_id_fkey'),
  ('activity', 'FOREIGN KEY (user_id) REFERENCES app_user(id)', 'activity_user_id_fkey'),
  ('workflow_transition', 'NOT NULL id', 'workflow_transition_id_not_null'),
  ('workflow_transition', 'NOT NULL workflow_id', 'workflow_transition_workflow_id_not_null'),
  ('workflow_transition', 'NOT NULL from_state_id', 'workflow_transition_from_state_id_not_null'),
  ('workflow_transition', 'NOT NULL to_state_id', 'workflow_transition_to_state_id_not_null'),
  ('workflow_transition', 'NOT NULL waypoints', 'workflow_transition_waypoints_not_null'),
  ('workflow_transition', 'PRIMARY KEY (id)', 'workflow_transition_pkey'),
  ('workflow_transition', 'UNIQUE (from_state_id, to_state_id)', 'workflow_transition_from_state_id_to_state_id_key'),
  ('workflow_transition', 'FOREIGN KEY (workflow_id) REFERENCES workflow_template(id) ON DELETE CASCADE', 'workflow_transition_workflow_id_fkey'),
  ('workflow_transition', 'FOREIGN KEY (from_state_id) REFERENCES workflow_state(id) ON DELETE CASCADE', 'workflow_transition_from_state_id_fkey'),
  ('workflow_transition', 'FOREIGN KEY (to_state_id) REFERENCES workflow_state(id) ON DELETE CASCADE', 'workflow_transition_to_state_id_fkey'),
  ('workflow_gate', 'NOT NULL id', 'workflow_gate_id_not_null'),
  ('workflow_gate', 'NOT NULL transition_id', 'workflow_gate_transition_id_not_null'),
  ('workflow_gate', 'NOT NULL name', 'workflow_gate_name_not_null'),
  ('workflow_gate', 'PRIMARY KEY (id)', 'workflow_gate_pkey'),
  ('workflow_gate', 'FOREIGN KEY (transition_id) REFERENCES workflow_transition(id) ON DELETE CASCADE', 'workflow_gate_transition_id_fkey'),
  ('workflow_gate_reviewer', 'NOT NULL id', 'workflow_gate_reviewer_id_not_null'),
  ('workflow_gate_reviewer', 'NOT NULL gate_id', 'workflow_gate_reviewer_gate_id_not_null'),
  ('workflow_gate_reviewer', 'NOT NULL reviewer_type', 'workflow_gate_reviewer_reviewer_type_not_null'),
  ('workflow_gate_reviewer', 'PRIMARY KEY (id)', 'workflow_gate_reviewer_pkey'),
  ('workflow_gate_reviewer', 'FOREIGN KEY (gate_id) REFERENCES workflow_gate(id) ON DELETE CASCADE', 'workflow_gate_reviewer_gate_id_fkey'),
  ('workflow_gate_reviewer', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'workflow_gate_reviewer_user_id_fkey'),
  ('workflow_role', 'NOT NULL id', 'workflow_role_id_not_null'),
  ('workflow_role', 'NOT NULL org_id', 'workflow_role_org_id_not_null'),
  ('workflow_role', 'NOT NULL name', 'workflow_role_name_not_null'),
  ('workflow_role', 'PRIMARY KEY (id)', 'workflow_role_pkey'),
  ('workflow_role', 'UNIQUE (org_id, name)', 'workflow_role_org_id_name_key'),
  ('workflow_role', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'workflow_role_org_id_fkey'),
  ('workflow_role', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'workflow_role_created_by_fkey'),
  ('workflow_role', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'workflow_role_updated_by_fkey'),
  ('user_workflow_role', 'NOT NULL id', 'user_workflow_role_id_not_null'),
  ('user_workflow_role', 'NOT NULL user_id', 'user_workflow_role_user_id_not_null'),
  ('user_workflow_role', 'NOT NULL workflow_role_id', 'user_workflow_role_workflow_role_id_not_null'),
  ('user_workflow_role', 'PRIMARY KEY (id)', 'user_workflow_role_pkey'),
  ('user_workflow_role', 'UNIQUE (user_id, workflow_role_id)', 'user_workflow_role_user_id_workflow_role_id_key'),
  ('user_workflow_role', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'user_workflow_role_user_id_fkey'),
  ('user_workflow_role', 'FOREIGN KEY (workflow_role_id) REFERENCES workflow_role(id) ON DELETE CASCADE', 'user_workflow_role_workflow_role_id_fkey'),
  ('user_workflow_role', 'FOREIGN KEY (assigned_by) REFERENCES app_user(id)', 'user_workflow_role_assigned_by_fkey'),
  ('workflow_gate_reviewer', 'FOREIGN KEY (workflow_role_id) REFERENCES workflow_role(id) ON DELETE CASCADE', 'workflow_gate_reviewer_workflow_role_id_fkey'),
  ('file_workflow_assignment', 'NOT NULL id', 'file_workflow_assignment_id_not_null'),
  ('file_workflow_assignment', 'NOT NULL file_id', 'file_workflow_assignment_file_id_not_null'),
  ('file_workflow_assignment', 'NOT NULL workflow_id', 'file_workflow_assignment_workflow_id_not_null'),
  ('file_workflow_assignment', 'PRIMARY KEY (id)', 'file_workflow_assignment_pkey'),
  ('file_workflow_assignment', 'UNIQUE (file_id)', 'file_workflow_assignment_file_id_key'),
  ('file_workflow_assignment', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_workflow_assignment_file_id_fkey'),
  ('file_workflow_assignment', 'FOREIGN KEY (workflow_id) REFERENCES workflow_template(id) ON DELETE CASCADE', 'file_workflow_assignment_workflow_id_fkey'),
  ('file_workflow_assignment', 'FOREIGN KEY (current_state_id) REFERENCES workflow_state(id) ON DELETE SET NULL', 'file_workflow_assignment_current_state_id_fkey'),
  ('file_workflow_assignment', 'FOREIGN KEY (assigned_by) REFERENCES app_user(id)', 'file_workflow_assignment_assigned_by_fkey'),
  ('workflow_gate_review', 'NOT NULL id', 'workflow_gate_review_id_not_null'),
  ('workflow_gate_review', 'NOT NULL org_id', 'workflow_gate_review_org_id_not_null'),
  ('workflow_gate_review', 'NOT NULL file_id', 'workflow_gate_review_file_id_not_null'),
  ('workflow_gate_review', 'NOT NULL transition_id', 'workflow_gate_review_transition_id_not_null'),
  ('workflow_gate_review', 'NOT NULL gate_id', 'workflow_gate_review_gate_id_not_null'),
  ('workflow_gate_review', 'NOT NULL requested_by', 'workflow_gate_review_requested_by_not_null'),
  ('workflow_gate_review', 'NOT NULL status', 'workflow_gate_review_status_not_null'),
  ('workflow_gate_review', 'PRIMARY KEY (id)', 'workflow_gate_review_pkey'),
  ('workflow_gate_review', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'workflow_gate_review_org_id_fkey'),
  ('workflow_gate_review', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'workflow_gate_review_file_id_fkey'),
  ('workflow_gate_review', 'FOREIGN KEY (transition_id) REFERENCES workflow_transition(id) ON DELETE CASCADE', 'workflow_gate_review_transition_id_fkey'),
  ('workflow_gate_review', 'FOREIGN KEY (gate_id) REFERENCES workflow_gate(id) ON DELETE CASCADE', 'workflow_gate_review_gate_id_fkey'),
  ('workflow_gate_review', 'FOREIGN KEY (requested_by) REFERENCES app_user(id)', 'workflow_gate_review_requested_by_fkey'),
  ('workflow_gate_review', 'FOREIGN KEY (assignee_id) REFERENCES app_user(id)', 'workflow_gate_review_assignee_id_fkey'),
  ('workflow_gate_review', 'FOREIGN KEY (reviewed_by) REFERENCES app_user(id)', 'workflow_gate_review_reviewed_by_fkey'),
  ('workflow_gate_review', 'NOT NULL attempt_id', 'workflow_gate_review_attempt_id_not_null'),
  ('workflow_review_history', 'NOT NULL id', 'workflow_review_history_id_not_null'),
  ('workflow_review_history', 'NOT NULL org_id', 'workflow_review_history_org_id_not_null'),
  ('workflow_review_history', 'NOT NULL file_path', 'workflow_review_history_file_path_not_null'),
  ('workflow_review_history', 'NOT NULL file_name', 'workflow_review_history_file_name_not_null'),
  ('workflow_review_history', 'NOT NULL workflow_name', 'workflow_review_history_workflow_name_not_null'),
  ('workflow_review_history', 'NOT NULL from_state_name', 'workflow_review_history_from_state_name_not_null'),
  ('workflow_review_history', 'NOT NULL to_state_name', 'workflow_review_history_to_state_name_not_null'),
  ('workflow_review_history', 'NOT NULL gate_name', 'workflow_review_history_gate_name_not_null'),
  ('workflow_review_history', 'NOT NULL requested_by_email', 'workflow_review_history_requested_by_email_not_null'),
  ('workflow_review_history', 'NOT NULL requested_at', 'workflow_review_history_requested_at_not_null'),
  ('workflow_review_history', 'NOT NULL reviewed_by_email', 'workflow_review_history_reviewed_by_email_not_null'),
  ('workflow_review_history', 'NOT NULL reviewed_at', 'workflow_review_history_reviewed_at_not_null'),
  ('workflow_review_history', 'NOT NULL decision', 'workflow_review_history_decision_not_null'),
  ('workflow_review_history', 'PRIMARY KEY (id)', 'workflow_review_history_pkey'),
  ('workflow_review_history', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'workflow_review_history_org_id_fkey'),
  ('workflow_review_history', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE SET NULL', 'workflow_review_history_file_id_fkey'),
  ('workflow_review_history', 'FOREIGN KEY (workflow_id) REFERENCES workflow_template(id) ON DELETE SET NULL', 'workflow_review_history_workflow_id_fkey'),
  ('workflow_review_history', 'FOREIGN KEY (transition_id) REFERENCES workflow_transition(id) ON DELETE SET NULL', 'workflow_review_history_transition_id_fkey'),
  ('workflow_review_history', 'FOREIGN KEY (gate_id) REFERENCES workflow_gate(id) ON DELETE SET NULL', 'workflow_review_history_gate_id_fkey'),
  ('workflow_review_history', 'FOREIGN KEY (requested_by) REFERENCES app_user(id) ON DELETE SET NULL', 'workflow_review_history_requested_by_fkey'),
  ('workflow_review_history', 'FOREIGN KEY (reviewed_by) REFERENCES app_user(id) ON DELETE SET NULL', 'workflow_review_history_reviewed_by_fkey'),
  ('workflow_history', 'NOT NULL id', 'workflow_history_id_not_null'),
  ('workflow_history', 'NOT NULL org_id', 'workflow_history_org_id_not_null'),
  ('workflow_history', 'NOT NULL file_path', 'workflow_history_file_path_not_null'),
  ('workflow_history', 'NOT NULL file_name', 'workflow_history_file_name_not_null'),
  ('workflow_history', 'NOT NULL workflow_name', 'workflow_history_workflow_name_not_null'),
  ('workflow_history', 'NOT NULL from_state_name', 'workflow_history_from_state_name_not_null'),
  ('workflow_history', 'NOT NULL to_state_name', 'workflow_history_to_state_name_not_null'),
  ('workflow_history', 'NOT NULL performed_by_email', 'workflow_history_performed_by_email_not_null'),
  ('workflow_history', 'NOT NULL performed_at', 'workflow_history_performed_at_not_null'),
  ('workflow_history', 'PRIMARY KEY (id)', 'workflow_history_pkey'),
  ('workflow_history', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'workflow_history_org_id_fkey'),
  ('workflow_history', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE SET NULL', 'workflow_history_file_id_fkey'),
  ('workflow_history', 'FOREIGN KEY (workflow_id) REFERENCES workflow_template(id) ON DELETE SET NULL', 'workflow_history_workflow_id_fkey'),
  ('workflow_history', 'FOREIGN KEY (from_state_id) REFERENCES workflow_state(id) ON DELETE SET NULL', 'workflow_history_from_state_id_fkey'),
  ('workflow_history', 'FOREIGN KEY (to_state_id) REFERENCES workflow_state(id) ON DELETE SET NULL', 'workflow_history_to_state_id_fkey'),
  ('workflow_history', 'FOREIGN KEY (transition_id) REFERENCES workflow_transition(id) ON DELETE SET NULL', 'workflow_history_transition_id_fkey'),
  ('workflow_history', 'FOREIGN KEY (performed_by) REFERENCES app_user(id) ON DELETE SET NULL', 'workflow_history_performed_by_fkey'),
  ('file_state_entry', 'NOT NULL id', 'file_state_entry_id_not_null'),
  ('file_state_entry', 'NOT NULL file_id', 'file_state_entry_file_id_not_null'),
  ('file_state_entry', 'NOT NULL state_id', 'file_state_entry_state_id_not_null'),
  ('file_state_entry', 'PRIMARY KEY (id)', 'file_state_entry_pkey'),
  ('file_state_entry', 'UNIQUE (file_id, state_id, entered_at)', 'file_state_entry_file_id_state_id_entered_at_key'),
  ('file_state_entry', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_state_entry_file_id_fkey'),
  ('file_state_entry', 'FOREIGN KEY (state_id) REFERENCES workflow_state(id) ON DELETE CASCADE', 'file_state_entry_state_id_fkey'),
  ('file_state_entry', 'FOREIGN KEY (entered_by) REFERENCES app_user(id)', 'file_state_entry_entered_by_fkey'),
  ('file_state_entry', 'FOREIGN KEY (exited_by) REFERENCES app_user(id)', 'file_state_entry_exited_by_fkey'),
  ('file_watcher', 'NOT NULL id', 'file_watcher_id_not_null'),
  ('file_watcher', 'NOT NULL org_id', 'file_watcher_org_id_not_null'),
  ('file_watcher', 'NOT NULL file_id', 'file_watcher_file_id_not_null'),
  ('file_watcher', 'NOT NULL user_id', 'file_watcher_user_id_not_null'),
  ('file_watcher', 'PRIMARY KEY (id)', 'file_watcher_pkey'),
  ('file_watcher', 'UNIQUE (file_id, user_id)', 'file_watcher_file_id_user_id_key'),
  ('file_watcher', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'file_watcher_org_id_fkey'),
  ('file_watcher', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_watcher_file_id_fkey'),
  ('file_watcher', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'file_watcher_user_id_fkey'),
  ('file_share_link', 'NOT NULL id', 'file_share_link_id_not_null'),
  ('file_share_link', 'NOT NULL org_id', 'file_share_link_org_id_not_null'),
  ('file_share_link', 'NOT NULL file_id', 'file_share_link_file_id_not_null'),
  ('file_share_link', 'NOT NULL token', 'file_share_link_token_not_null'),
  ('file_share_link', 'NOT NULL created_by', 'file_share_link_created_by_not_null'),
  ('file_share_link', 'PRIMARY KEY (id)', 'file_share_link_pkey'),
  ('file_share_link', 'UNIQUE (token)', 'file_share_link_token_key'),
  ('file_share_link', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'file_share_link_org_id_fkey'),
  ('file_share_link', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_share_link_file_id_fkey'),
  ('file_share_link', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'file_share_link_created_by_fkey'),
  ('file_comment', 'NOT NULL id', 'file_comment_id_not_null'),
  ('file_comment', 'NOT NULL file_id', 'file_comment_file_id_not_null'),
  ('file_comment', 'NOT NULL user_id', 'file_comment_user_id_not_null'),
  ('file_comment', 'NOT NULL comment', 'file_comment_comment_not_null'),
  ('file_comment', 'PRIMARY KEY (id)', 'file_comment_pkey'),
  ('file_comment', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_comment_file_id_fkey'),
  ('file_comment', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'file_comment_user_id_fkey'),
  ('file_comment', 'FOREIGN KEY (parent_id) REFERENCES file_comment(id) ON DELETE CASCADE', 'file_comment_parent_id_fkey'),
  ('file_comment', 'FOREIGN KEY (resolved_by) REFERENCES app_user(id) ON DELETE SET NULL', 'file_comment_resolved_by_fkey'),
  ('file_metadata_column', 'NOT NULL id', 'file_metadata_column_id_not_null'),
  ('file_metadata_column', 'NOT NULL org_id', 'file_metadata_column_org_id_not_null'),
  ('file_metadata_column', 'NOT NULL name', 'file_metadata_column_name_not_null'),
  ('file_metadata_column', 'NOT NULL label', 'file_metadata_column_label_not_null'),
  ('file_metadata_column', 'NOT NULL data_type', 'file_metadata_column_data_type_not_null'),
  ('file_metadata_column', 'NOT NULL select_options', 'file_metadata_column_select_options_not_null'),
  ('file_metadata_column', 'NOT NULL width', 'file_metadata_column_width_not_null'),
  ('file_metadata_column', 'NOT NULL is_visible', 'file_metadata_column_is_visible_not_null'),
  ('file_metadata_column', 'NOT NULL is_sortable', 'file_metadata_column_is_sortable_not_null'),
  ('file_metadata_column', 'NOT NULL sort_order', 'file_metadata_column_sort_order_not_null'),
  ('file_metadata_column', 'NOT NULL is_required', 'file_metadata_column_is_required_not_null'),
  ('file_metadata_column', 'PRIMARY KEY (id)', 'file_metadata_column_pkey'),
  ('file_metadata_column', 'UNIQUE (org_id, name)', 'file_metadata_column_org_id_name_key'),
  ('file_metadata_column', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'file_metadata_column_org_id_fkey'),
  ('file_metadata_column', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'file_metadata_column_created_by_fkey'),
  ('file_metadata_column', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'file_metadata_column_updated_by_fkey'),
  ('backup_config', 'NOT NULL id', 'backup_config_id_not_null'),
  ('backup_config', 'NOT NULL org_id', 'backup_config_org_id_not_null'),
  ('backup_config', 'NOT NULL provider', 'backup_config_provider_not_null'),
  ('backup_config', 'PRIMARY KEY (id)', 'backup_config_pkey'),
  ('backup_config', 'UNIQUE (org_id)', 'backup_config_org_id_key'),
  ('backup_config', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'backup_config_org_id_fkey'),
  ('backup_config', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'backup_config_updated_by_fkey'),
  ('backup_history', 'NOT NULL id', 'backup_history_id_not_null'),
  ('backup_history', 'NOT NULL org_id', 'backup_history_org_id_not_null'),
  ('backup_history', 'NOT NULL started_at', 'backup_history_started_at_not_null'),
  ('backup_history', 'NOT NULL status', 'backup_history_status_not_null'),
  ('backup_history', 'NOT NULL machine_id', 'backup_history_machine_id_not_null'),
  ('backup_history', 'NOT NULL machine_name', 'backup_history_machine_name_not_null'),
  ('backup_history', 'PRIMARY KEY (id)', 'backup_history_pkey'),
  ('backup_history', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'backup_history_org_id_fkey'),
  ('backup_machine', 'NOT NULL id', 'backup_machine_id_not_null'),
  ('backup_machine', 'NOT NULL org_id', 'backup_machine_org_id_not_null'),
  ('backup_machine', 'NOT NULL machine_id', 'backup_machine_machine_id_not_null'),
  ('backup_machine', 'NOT NULL machine_name', 'backup_machine_machine_name_not_null'),
  ('backup_machine', 'NOT NULL last_seen_at', 'backup_machine_last_seen_at_not_null'),
  ('backup_machine', 'PRIMARY KEY (id)', 'backup_machine_pkey'),
  ('backup_machine', 'UNIQUE (org_id, machine_id)', 'backup_machine_org_id_machine_id_key'),
  ('backup_machine', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'backup_machine_org_id_fkey'),
  ('backup_machine', 'FOREIGN KEY (user_id) REFERENCES app_user(id)', 'backup_machine_user_id_fkey'),
  ('backup_lock', 'NOT NULL id', 'backup_lock_id_not_null'),
  ('backup_lock', 'NOT NULL org_id', 'backup_lock_org_id_not_null'),
  ('backup_lock', 'NOT NULL locked_by_machine_id', 'backup_lock_locked_by_machine_id_not_null'),
  ('backup_lock', 'NOT NULL locked_by_machine_name', 'backup_lock_locked_by_machine_name_not_null'),
  ('backup_lock', 'NOT NULL locked_at', 'backup_lock_locked_at_not_null'),
  ('backup_lock', 'NOT NULL expires_at', 'backup_lock_expires_at_not_null'),
  ('backup_lock', 'PRIMARY KEY (id)', 'backup_lock_pkey'),
  ('backup_lock', 'UNIQUE (org_id)', 'backup_lock_org_id_key'),
  ('backup_lock', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'backup_lock_org_id_fkey'),
  ('backup_lock', 'FOREIGN KEY (backup_history_id) REFERENCES backup_history(id) ON DELETE CASCADE', 'backup_lock_backup_history_id_fkey'),
  ('item_image', 'CHECK ((image_type = ANY (ARRAY[''preview''::text, ''icon''::text, ''image''::text])))', 'item_image_image_type_check'),
  ('item_image', 'NOT NULL id', 'item_image_id_not_null'),
  ('item_image', 'NOT NULL org_id', 'item_image_org_id_not_null'),
  ('item_image', 'NOT NULL part_number', 'item_image_part_number_not_null'),
  ('item_image', 'NOT NULL image_type', 'item_image_image_type_not_null'),
  ('item_image', 'PRIMARY KEY (id)', 'item_image_pkey'),
  ('item_image', 'UNIQUE (org_id, part_number)', 'item_image_org_id_part_number_key'),
  ('item_image', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'item_image_org_id_fkey'),
  ('item_image', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'item_image_updated_by_fkey'),
  ('item_designation', 'NOT NULL id', 'item_designation_id_not_null'),
  ('item_designation', 'NOT NULL org_id', 'item_designation_org_id_not_null'),
  ('item_designation', 'NOT NULL name', 'item_designation_name_not_null'),
  ('item_designation', 'NOT NULL sort_order', 'item_designation_sort_order_not_null'),
  ('item_designation', 'PRIMARY KEY (id)', 'item_designation_pkey'),
  ('item_designation', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'item_designation_org_id_fkey'),
  ('item_designation', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'item_designation_created_by_fkey'),
  ('item_designation_assignment', 'NOT NULL id', 'item_designation_assignment_id_not_null'),
  ('item_designation_assignment', 'NOT NULL org_id', 'item_designation_assignment_org_id_not_null'),
  ('item_designation_assignment', 'NOT NULL vault_id', 'item_designation_assignment_vault_id_not_null'),
  ('item_designation_assignment', 'NOT NULL part_number', 'item_designation_assignment_part_number_not_null'),
  ('item_designation_assignment', 'NOT NULL designation_id', 'item_designation_assignment_designation_id_not_null'),
  ('item_designation_assignment', 'PRIMARY KEY (id)', 'item_designation_assignment_pkey'),
  ('item_designation_assignment', 'UNIQUE (org_id, vault_id, part_number)', 'item_designation_assignment_org_id_vault_id_part_number_key'),
  ('item_designation_assignment', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'item_designation_assignment_org_id_fkey'),
  ('item_designation_assignment', 'FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE CASCADE', 'item_designation_assignment_vault_id_fkey'),
  ('item_designation_assignment', 'FOREIGN KEY (designation_id) REFERENCES item_designation(id) ON DELETE CASCADE', 'item_designation_assignment_designation_id_fkey'),
  ('item_designation_assignment', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'item_designation_assignment_updated_by_fkey'),
  ('team_permission', 'FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE CASCADE', 'team_permission_vault_id_fkey'),
  ('user_permission', 'FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE CASCADE', 'user_permission_vault_id_fkey'),
  ('team_reviewer', 'FOREIGN KEY (workflow_role_id) REFERENCES workflow_role(id) ON DELETE CASCADE', 'team_reviewer_workflow_role_id_fkey'),
  ('inspection_characteristic', 'NOT NULL id', 'inspection_characteristic_id_not_null'),
  ('inspection_characteristic', 'NOT NULL org_id', 'inspection_characteristic_org_id_not_null'),
  ('inspection_characteristic', 'NOT NULL file_id', 'inspection_characteristic_file_id_not_null'),
  ('inspection_characteristic', 'NOT NULL sort_order', 'inspection_characteristic_sort_order_not_null'),
  ('inspection_characteristic', 'PRIMARY KEY (id)', 'inspection_characteristic_pkey'),
  ('inspection_characteristic', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'inspection_characteristic_org_id_fkey'),
  ('inspection_characteristic', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'inspection_characteristic_file_id_fkey'),
  ('inspection_characteristic', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'inspection_characteristic_created_by_fkey'),
  ('inspection_characteristic', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'inspection_characteristic_updated_by_fkey'),
  ('inspection_characteristic_version', 'NOT NULL id', 'inspection_characteristic_version_id_not_null'),
  ('inspection_characteristic_version', 'NOT NULL file_version_id', 'inspection_characteristic_version_file_version_id_not_null'),
  ('inspection_characteristic_version', 'NOT NULL org_id', 'inspection_characteristic_version_org_id_not_null'),
  ('inspection_characteristic_version', 'NOT NULL sort_order', 'inspection_characteristic_version_sort_order_not_null'),
  ('inspection_characteristic_version', 'PRIMARY KEY (id)', 'inspection_characteristic_version_pkey'),
  ('inspection_characteristic_version', 'FOREIGN KEY (file_version_id) REFERENCES file_version(id) ON DELETE CASCADE', 'inspection_characteristic_version_file_version_id_fkey'),
  ('inspection_characteristic_version', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'inspection_characteristic_version_org_id_fkey'),
  ('inspection_method', 'NOT NULL id', 'inspection_method_id_not_null'),
  ('inspection_method', 'NOT NULL org_id', 'inspection_method_org_id_not_null'),
  ('inspection_method', 'NOT NULL name', 'inspection_method_name_not_null'),
  ('inspection_method', 'PRIMARY KEY (id)', 'inspection_method_pkey'),
  ('inspection_method', 'UNIQUE (org_id, name)', 'inspection_method_org_id_name_key'),
  ('inspection_method', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'inspection_method_org_id_fkey'),
  ('inspection_method', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'inspection_method_created_by_fkey'),
  ('eco', 'NOT NULL id', 'eco_id_not_null'),
  ('eco', 'NOT NULL org_id', 'eco_org_id_not_null'),
  ('eco', 'NOT NULL eco_number', 'eco_eco_number_not_null'),
  ('eco', 'NOT NULL created_by', 'eco_created_by_not_null'),
  ('eco', 'PRIMARY KEY (id)', 'eco_pkey'),
  ('eco', 'UNIQUE (org_id, eco_number)', 'eco_org_id_eco_number_key'),
  ('eco', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'eco_org_id_fkey'),
  ('eco', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'eco_created_by_fkey'),
  ('eco', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'eco_updated_by_fkey'),
  ('file_eco', 'NOT NULL id', 'file_eco_id_not_null'),
  ('file_eco', 'NOT NULL file_id', 'file_eco_file_id_not_null'),
  ('file_eco', 'NOT NULL eco_id', 'file_eco_eco_id_not_null'),
  ('file_eco', 'NOT NULL created_by', 'file_eco_created_by_not_null'),
  ('file_eco', 'PRIMARY KEY (id)', 'file_eco_pkey'),
  ('file_eco', 'UNIQUE (file_id, eco_id)', 'file_eco_file_id_eco_id_key'),
  ('file_eco', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_eco_file_id_fkey'),
  ('file_eco', 'FOREIGN KEY (eco_id) REFERENCES eco(id) ON DELETE CASCADE', 'file_eco_eco_id_fkey'),
  ('file_eco', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'file_eco_created_by_fkey'),
  ('review', 'NOT NULL id', 'review_id_not_null'),
  ('review', 'NOT NULL org_id', 'review_org_id_not_null'),
  ('review', 'NOT NULL requested_by', 'review_requested_by_not_null'),
  ('review', 'NOT NULL status', 'review_status_not_null'),
  ('review', 'NOT NULL priority', 'review_priority_not_null'),
  ('review', 'NOT NULL mode', 'review_mode_not_null'),
  ('review', 'NOT NULL current_round', 'review_current_round_not_null'),
  ('review', 'PRIMARY KEY (id)', 'review_pkey'),
  ('review', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'review_org_id_fkey'),
  ('review', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'review_file_id_fkey'),
  ('review', 'FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE SET NULL', 'review_vault_id_fkey'),
  ('review', 'FOREIGN KEY (requested_by) REFERENCES app_user(id)', 'review_requested_by_fkey'),
  ('review', 'FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE SET NULL', 'review_team_id_fkey'),
  ('review', 'FOREIGN KEY (cancelled_by) REFERENCES app_user(id) ON DELETE SET NULL', 'review_cancelled_by_fkey'),
  ('review', 'CHECK ((priority = ANY (ARRAY[''low''::text, ''normal''::text, ''high''::text, ''urgent''::text])))', 'review_priority_check'),
  ('review', 'CHECK ((mode = ANY (ARRAY[''all''::text, ''any''::text])))', 'review_mode_check'),
  ('review', 'CHECK ((current_round >= 1))', 'review_current_round_check'),
  ('review_item', 'CHECK ((outcome = ANY (ARRAY[''pending''::text, ''approved''::text, ''changes_requested''::text, ''rejected''::text])))', 'review_item_outcome_check'),
  ('review_item', 'NOT NULL id', 'review_item_id_not_null'),
  ('review_item', 'NOT NULL org_id', 'review_item_org_id_not_null'),
  ('review_item', 'NOT NULL review_id', 'review_item_review_id_not_null'),
  ('review_item', 'NOT NULL file_id', 'review_item_file_id_not_null'),
  ('review_item', 'NOT NULL file_version_id', 'review_item_file_version_id_not_null'),
  ('review_item', 'NOT NULL outcome', 'review_item_outcome_not_null'),
  ('review_item', 'NOT NULL sort_order', 'review_item_sort_order_not_null'),
  ('review_item', 'NOT NULL added_in_round', 'review_item_added_in_round_not_null'),
  ('review_item', 'NOT NULL created_at', 'review_item_created_at_not_null'),
  ('review_item', 'PRIMARY KEY (id)', 'review_item_pkey'),
  ('review_item', 'UNIQUE (review_id, file_id)', 'review_item_review_id_file_id_key'),
  ('review_item', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'review_item_org_id_fkey'),
  ('review_item', 'FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE CASCADE', 'review_item_review_id_fkey'),
  ('review_item', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'review_item_file_id_fkey'),
  ('review_item', 'FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE SET NULL', 'review_item_vault_id_fkey'),
  ('review_item', 'FOREIGN KEY (file_version_id) REFERENCES file_version(id) ON DELETE CASCADE', 'review_item_file_version_id_fkey'),
  ('review_item', 'FOREIGN KEY (advanced_to_state_id) REFERENCES workflow_state(id) ON DELETE SET NULL', 'review_item_advanced_to_state_id_fkey'),
  ('review_round', 'CHECK ((round_number >= 1))', 'review_round_round_number_check'),
  ('review_round', 'CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY[''approved''::text, ''changes_requested''::text, ''rejected''::text, ''cancelled''::text]))))', 'review_round_outcome_check'),
  ('review_round', 'NOT NULL id', 'review_round_id_not_null'),
  ('review_round', 'NOT NULL org_id', 'review_round_org_id_not_null'),
  ('review_round', 'NOT NULL review_id', 'review_round_review_id_not_null'),
  ('review_round', 'NOT NULL round_number', 'review_round_round_number_not_null'),
  ('review_round', 'NOT NULL opened_at', 'review_round_opened_at_not_null'),
  ('review_round', 'PRIMARY KEY (id)', 'review_round_pkey'),
  ('review_round', 'UNIQUE (review_id, round_number)', 'review_round_review_id_round_number_key'),
  ('review_round', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'review_round_org_id_fkey'),
  ('review_round', 'FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE CASCADE', 'review_round_review_id_fkey'),
  ('review_round', 'FOREIGN KEY (opened_by) REFERENCES app_user(id) ON DELETE SET NULL', 'review_round_opened_by_fkey'),
  ('review_round_item', 'CHECK ((round_number >= 1))', 'review_round_item_round_number_check'),
  ('review_round_item', 'CHECK ((outcome = ANY (ARRAY[''pending''::text, ''approved''::text, ''changes_requested''::text, ''rejected''::text])))', 'review_round_item_outcome_check'),
  ('review_round_item', 'NOT NULL id', 'review_round_item_id_not_null'),
  ('review_round_item', 'NOT NULL org_id', 'review_round_item_org_id_not_null'),
  ('review_round_item', 'NOT NULL review_id', 'review_round_item_review_id_not_null'),
  ('review_round_item', 'NOT NULL item_id', 'review_round_item_item_id_not_null'),
  ('review_round_item', 'NOT NULL round_number', 'review_round_item_round_number_not_null'),
  ('review_round_item', 'NOT NULL file_version_id', 'review_round_item_file_version_id_not_null'),
  ('review_round_item', 'NOT NULL is_carried_forward', 'review_round_item_is_carried_forward_not_null'),
  ('review_round_item', 'NOT NULL outcome', 'review_round_item_outcome_not_null'),
  ('review_round_item', 'PRIMARY KEY (id)', 'review_round_item_pkey'),
  ('review_round_item', 'UNIQUE (item_id, round_number)', 'review_round_item_item_id_round_number_key'),
  ('review_round_item', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'review_round_item_org_id_fkey'),
  ('review_round_item', 'FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE CASCADE', 'review_round_item_review_id_fkey'),
  ('review_round_item', 'FOREIGN KEY (item_id) REFERENCES review_item(id) ON DELETE CASCADE', 'review_round_item_item_id_fkey'),
  ('review_round_item', 'FOREIGN KEY (file_version_id) REFERENCES file_version(id) ON DELETE CASCADE', 'review_round_item_file_version_id_fkey'),
  ('review_response', 'NOT NULL id', 'review_response_id_not_null'),
  ('review_response', 'NOT NULL review_id', 'review_response_review_id_not_null'),
  ('review_response', 'NOT NULL round_number', 'review_response_round_number_not_null'),
  ('review_response', 'NOT NULL reviewer_id', 'review_response_reviewer_id_not_null'),
  ('review_response', 'NOT NULL status', 'review_response_status_not_null'),
  ('review_response', 'PRIMARY KEY (id)', 'review_response_pkey'),
  ('review_response', 'UNIQUE (review_id, round_number, reviewer_id)', 'review_response_review_id_round_number_reviewer_id_key'),
  ('review_response', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'review_response_org_id_fkey'),
  ('review_response', 'FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE CASCADE', 'review_response_review_id_fkey'),
  ('review_response', 'FOREIGN KEY (reviewer_id) REFERENCES app_user(id)', 'review_response_reviewer_id_fkey'),
  ('review_response', 'FOREIGN KEY (via_team_id) REFERENCES team(id) ON DELETE SET NULL', 'review_response_via_team_id_fkey'),
  ('review_response', 'NOT NULL org_id', 'review_response_org_id_not_null'),
  ('review_response', 'CHECK (((withdrawn_reason IS NULL) OR (withdrawn_reason = ANY (ARRAY[''left_org''::text, ''lost_vault_access''::text]))))', 'review_response_withdrawn_reason_check'),
  ('review_decision', 'CHECK ((round_number >= 1))', 'review_decision_round_number_check'),
  ('review_decision', 'CHECK ((decision = ANY (ARRAY[''approved''::text, ''approved_with_comments''::text, ''changes_requested''::text, ''rejected''::text])))', 'review_decision_decision_check'),
  ('review_decision', 'CHECK ((is_legacy OR (decision = ''approved''::text) OR (length(btrim(COALESCE(comment, ''''::text))) > 0)))', 'review_decision_comment_check'),
  ('review_decision', 'NOT NULL id', 'review_decision_id_not_null'),
  ('review_decision', 'NOT NULL org_id', 'review_decision_org_id_not_null'),
  ('review_decision', 'NOT NULL review_id', 'review_decision_review_id_not_null'),
  ('review_decision', 'NOT NULL item_id', 'review_decision_item_id_not_null'),
  ('review_decision', 'NOT NULL round_number', 'review_decision_round_number_not_null'),
  ('review_decision', 'NOT NULL reviewer_id', 'review_decision_reviewer_id_not_null'),
  ('review_decision', 'NOT NULL decision', 'review_decision_decision_not_null'),
  ('review_decision', 'NOT NULL decided_at', 'review_decision_decided_at_not_null'),
  ('review_decision', 'NOT NULL is_legacy', 'review_decision_is_legacy_not_null'),
  ('review_decision', 'PRIMARY KEY (id)', 'review_decision_pkey'),
  ('review_decision', 'UNIQUE (item_id, round_number, reviewer_id)', 'review_decision_item_id_round_number_reviewer_id_key'),
  ('review_decision', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'review_decision_org_id_fkey'),
  ('review_decision', 'FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE CASCADE', 'review_decision_review_id_fkey'),
  ('review_decision', 'FOREIGN KEY (item_id) REFERENCES review_item(id) ON DELETE CASCADE', 'review_decision_item_id_fkey'),
  ('review_decision', 'FOREIGN KEY (reviewer_id) REFERENCES app_user(id)', 'review_decision_reviewer_id_fkey'),
  ('file_comment', 'FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE SET NULL', 'file_comment_review_id_fkey'),
  ('file_comment', 'FOREIGN KEY (review_item_id) REFERENCES review_item(id) ON DELETE SET NULL', 'file_comment_review_item_id_fkey'),
  ('deviation', 'NOT NULL id', 'deviation_id_not_null'),
  ('deviation', 'NOT NULL org_id', 'deviation_org_id_not_null'),
  ('deviation', 'NOT NULL deviation_number', 'deviation_deviation_number_not_null'),
  ('deviation', 'NOT NULL title', 'deviation_title_not_null'),
  ('deviation', 'NOT NULL created_by', 'deviation_created_by_not_null'),
  ('deviation', 'PRIMARY KEY (id)', 'deviation_pkey'),
  ('deviation', 'UNIQUE (org_id, deviation_number)', 'deviation_org_id_deviation_number_key'),
  ('deviation', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'deviation_org_id_fkey'),
  ('deviation', 'FOREIGN KEY (approved_by) REFERENCES app_user(id)', 'deviation_approved_by_fkey'),
  ('deviation', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'deviation_created_by_fkey'),
  ('deviation', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'deviation_updated_by_fkey'),
  ('file_deviation', 'NOT NULL id', 'file_deviation_id_not_null'),
  ('file_deviation', 'NOT NULL file_id', 'file_deviation_file_id_not_null'),
  ('file_deviation', 'NOT NULL deviation_id', 'file_deviation_deviation_id_not_null'),
  ('file_deviation', 'NOT NULL created_by', 'file_deviation_created_by_not_null'),
  ('file_deviation', 'PRIMARY KEY (id)', 'file_deviation_pkey'),
  ('file_deviation', 'UNIQUE (file_id, deviation_id)', 'file_deviation_file_id_deviation_id_key'),
  ('file_deviation', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'file_deviation_file_id_fkey'),
  ('file_deviation', 'FOREIGN KEY (deviation_id) REFERENCES deviation(id) ON DELETE CASCADE', 'file_deviation_deviation_id_fkey'),
  ('file_deviation', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'file_deviation_created_by_fkey'),
  ('process_template', 'NOT NULL id', 'process_template_id_not_null'),
  ('process_template', 'NOT NULL org_id', 'process_template_org_id_not_null'),
  ('process_template', 'NOT NULL name', 'process_template_name_not_null'),
  ('process_template', 'PRIMARY KEY (id)', 'process_template_pkey'),
  ('process_template', 'UNIQUE (org_id, name)', 'process_template_org_id_name_key'),
  ('process_template', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'process_template_org_id_fkey'),
  ('process_template', 'FOREIGN KEY (created_by) REFERENCES app_user(id) ON DELETE SET NULL', 'process_template_created_by_fkey'),
  ('process_template', 'FOREIGN KEY (updated_by) REFERENCES app_user(id) ON DELETE SET NULL', 'process_template_updated_by_fkey'),
  ('process_template_phase', 'NOT NULL id', 'process_template_phase_id_not_null'),
  ('process_template_phase', 'NOT NULL template_id', 'process_template_phase_template_id_not_null'),
  ('process_template_phase', 'NOT NULL name', 'process_template_phase_name_not_null'),
  ('process_template_phase', 'NOT NULL sort_order', 'process_template_phase_sort_order_not_null'),
  ('process_template_phase', 'PRIMARY KEY (id)', 'process_template_phase_pkey'),
  ('process_template_phase', 'FOREIGN KEY (template_id) REFERENCES process_template(id) ON DELETE CASCADE', 'process_template_phase_template_id_fkey'),
  ('process_template_item', 'NOT NULL id', 'process_template_item_id_not_null'),
  ('process_template_item', 'NOT NULL phase_id', 'process_template_item_phase_id_not_null'),
  ('process_template_item', 'NOT NULL name', 'process_template_item_name_not_null'),
  ('process_template_item', 'NOT NULL sort_order', 'process_template_item_sort_order_not_null'),
  ('process_template_item', 'PRIMARY KEY (id)', 'process_template_item_pkey'),
  ('process_template_item', 'FOREIGN KEY (phase_id) REFERENCES process_template_phase(id) ON DELETE CASCADE', 'process_template_item_phase_id_fkey'),
  ('eco', 'FOREIGN KEY (process_template_id) REFERENCES process_template(id) ON DELETE SET NULL', 'eco_process_template_id_fkey'),
  ('eco_checklist_item', 'NOT NULL id', 'eco_checklist_item_id_not_null'),
  ('eco_checklist_item', 'NOT NULL eco_id', 'eco_checklist_item_eco_id_not_null'),
  ('eco_checklist_item', 'NOT NULL phase_name', 'eco_checklist_item_phase_name_not_null'),
  ('eco_checklist_item', 'NOT NULL name', 'eco_checklist_item_name_not_null'),
  ('eco_checklist_item', 'NOT NULL sort_order', 'eco_checklist_item_sort_order_not_null'),
  ('eco_checklist_item', 'PRIMARY KEY (id)', 'eco_checklist_item_pkey'),
  ('eco_checklist_item', 'FOREIGN KEY (eco_id) REFERENCES eco(id) ON DELETE CASCADE', 'eco_checklist_item_eco_id_fkey'),
  ('eco_checklist_item', 'FOREIGN KEY (template_item_id) REFERENCES process_template_item(id) ON DELETE SET NULL', 'eco_checklist_item_template_item_id_fkey'),
  ('eco_checklist_item', 'FOREIGN KEY (accountable_user_id) REFERENCES app_user(id) ON DELETE SET NULL', 'eco_checklist_item_accountable_user_id_fkey'),
  ('eco_checklist_item', 'FOREIGN KEY (responsible_user_id) REFERENCES app_user(id) ON DELETE SET NULL', 'eco_checklist_item_responsible_user_id_fkey'),
  ('eco_checklist_item', 'FOREIGN KEY (completed_by) REFERENCES app_user(id) ON DELETE SET NULL', 'eco_checklist_item_completed_by_fkey'),
  ('eco_checklist_item', 'FOREIGN KEY (link_file_id) REFERENCES file(id) ON DELETE SET NULL', 'eco_checklist_item_link_file_id_fkey'),
  ('eco_checklist_item', 'FOREIGN KEY (updated_by) REFERENCES app_user(id) ON DELETE SET NULL', 'eco_checklist_item_updated_by_fkey'),
  ('eco_gate_approval', 'NOT NULL id', 'eco_gate_approval_id_not_null'),
  ('eco_gate_approval', 'NOT NULL eco_id', 'eco_gate_approval_eco_id_not_null'),
  ('eco_gate_approval', 'NOT NULL gate_name', 'eco_gate_approval_gate_name_not_null'),
  ('eco_gate_approval', 'PRIMARY KEY (id)', 'eco_gate_approval_pkey'),
  ('eco_gate_approval', 'UNIQUE (eco_id, gate_name)', 'eco_gate_approval_eco_id_gate_name_key'),
  ('eco_gate_approval', 'FOREIGN KEY (eco_id) REFERENCES eco(id) ON DELETE CASCADE', 'eco_gate_approval_eco_id_fkey'),
  ('eco_gate_approval', 'FOREIGN KEY (approved_by) REFERENCES app_user(id) ON DELETE SET NULL', 'eco_gate_approval_approved_by_fkey'),
  ('eco_checklist_activity', 'NOT NULL id', 'eco_checklist_activity_id_not_null'),
  ('eco_checklist_activity', 'NOT NULL eco_id', 'eco_checklist_activity_eco_id_not_null'),
  ('eco_checklist_activity', 'NOT NULL action', 'eco_checklist_activity_action_not_null'),
  ('eco_checklist_activity', 'PRIMARY KEY (id)', 'eco_checklist_activity_pkey'),
  ('eco_checklist_activity', 'FOREIGN KEY (eco_id) REFERENCES eco(id) ON DELETE CASCADE', 'eco_checklist_activity_eco_id_fkey'),
  ('eco_checklist_activity', 'FOREIGN KEY (checklist_item_id) REFERENCES eco_checklist_item(id) ON DELETE SET NULL', 'eco_checklist_activity_checklist_item_id_fkey'),
  ('eco_checklist_activity', 'FOREIGN KEY (gate_approval_id) REFERENCES eco_gate_approval(id) ON DELETE SET NULL', 'eco_checklist_activity_gate_approval_id_fkey'),
  ('eco_checklist_activity', 'FOREIGN KEY (performed_by) REFERENCES app_user(id) ON DELETE SET NULL', 'eco_checklist_activity_performed_by_fkey'),
  ('org_address', 'CHECK (((address_type <> ''billing''::address_type) OR (attention_to IS NULL)))', 'org_address_attention_to_check'),
  ('org_address', 'NOT NULL id', 'org_address_id_not_null'),
  ('org_address', 'NOT NULL org_id', 'org_address_org_id_not_null'),
  ('org_address', 'NOT NULL address_type', 'org_address_address_type_not_null'),
  ('org_address', 'NOT NULL label', 'org_address_label_not_null'),
  ('org_address', 'NOT NULL address_line1', 'org_address_address_line1_not_null'),
  ('org_address', 'NOT NULL city', 'org_address_city_not_null'),
  ('org_address', 'PRIMARY KEY (id)', 'org_address_pkey'),
  ('org_address', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'org_address_org_id_fkey'),
  ('supplier', 'NOT NULL id', 'supplier_id_not_null'),
  ('supplier', 'NOT NULL org_id', 'supplier_org_id_not_null'),
  ('supplier', 'NOT NULL name', 'supplier_name_not_null'),
  ('supplier', 'PRIMARY KEY (id)', 'supplier_pkey'),
  ('supplier', 'UNIQUE (org_id, code)', 'supplier_org_id_code_key'),
  ('supplier', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'supplier_org_id_fkey'),
  ('supplier', 'FOREIGN KEY (approved_by) REFERENCES app_user(id)', 'supplier_approved_by_fkey'),
  ('supplier', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'supplier_created_by_fkey'),
  ('supplier', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'supplier_updated_by_fkey'),
  ('supplier_contact', 'NOT NULL id', 'supplier_contact_id_not_null'),
  ('supplier_contact', 'NOT NULL supplier_id', 'supplier_contact_supplier_id_not_null'),
  ('supplier_contact', 'NOT NULL full_name', 'supplier_contact_full_name_not_null'),
  ('supplier_contact', 'PRIMARY KEY (id)', 'supplier_contact_pkey'),
  ('supplier_contact', 'UNIQUE (email)', 'supplier_contact_email_key'),
  ('supplier_contact', 'UNIQUE (phone)', 'supplier_contact_phone_key'),
  ('supplier_contact', 'UNIQUE (wechat_openid)', 'supplier_contact_wechat_openid_key'),
  ('supplier_contact', 'FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL', 'supplier_contact_auth_user_id_fkey'),
  ('supplier_contact', 'FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE CASCADE', 'supplier_contact_supplier_id_fkey'),
  ('supplier_invitation', 'NOT NULL id', 'supplier_invitation_id_not_null'),
  ('supplier_invitation', 'NOT NULL org_id', 'supplier_invitation_org_id_not_null'),
  ('supplier_invitation', 'NOT NULL supplier_id', 'supplier_invitation_supplier_id_not_null'),
  ('supplier_invitation', 'NOT NULL full_name', 'supplier_invitation_full_name_not_null'),
  ('supplier_invitation', 'NOT NULL token', 'supplier_invitation_token_not_null'),
  ('supplier_invitation', 'NOT NULL expires_at', 'supplier_invitation_expires_at_not_null'),
  ('supplier_invitation', 'PRIMARY KEY (id)', 'supplier_invitation_pkey'),
  ('supplier_invitation', 'UNIQUE (token)', 'supplier_invitation_token_key'),
  ('supplier_invitation', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'supplier_invitation_org_id_fkey'),
  ('supplier_invitation', 'FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE CASCADE', 'supplier_invitation_supplier_id_fkey'),
  ('supplier_invitation', 'FOREIGN KEY (invited_by) REFERENCES app_user(id)', 'supplier_invitation_invited_by_fkey'),
  ('part_supplier', 'NOT NULL id', 'part_supplier_id_not_null'),
  ('part_supplier', 'NOT NULL org_id', 'part_supplier_org_id_not_null'),
  ('part_supplier', 'NOT NULL file_id', 'part_supplier_file_id_not_null'),
  ('part_supplier', 'NOT NULL supplier_id', 'part_supplier_supplier_id_not_null'),
  ('part_supplier', 'PRIMARY KEY (id)', 'part_supplier_pkey'),
  ('part_supplier', 'UNIQUE (file_id, supplier_id)', 'part_supplier_file_id_supplier_id_key'),
  ('part_supplier', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'part_supplier_org_id_fkey'),
  ('part_supplier', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE', 'part_supplier_file_id_fkey'),
  ('part_supplier', 'FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE CASCADE', 'part_supplier_supplier_id_fkey'),
  ('part_supplier', 'FOREIGN KEY (qualified_by) REFERENCES app_user(id)', 'part_supplier_qualified_by_fkey'),
  ('part_supplier', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'part_supplier_created_by_fkey'),
  ('part_supplier', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'part_supplier_updated_by_fkey'),
  ('rfq', 'NOT NULL id', 'rfq_id_not_null'),
  ('rfq', 'NOT NULL org_id', 'rfq_org_id_not_null'),
  ('rfq', 'NOT NULL rfq_number', 'rfq_rfq_number_not_null'),
  ('rfq', 'NOT NULL title', 'rfq_title_not_null'),
  ('rfq', 'NOT NULL status', 'rfq_status_not_null'),
  ('rfq', 'PRIMARY KEY (id)', 'rfq_pkey'),
  ('rfq', 'UNIQUE (org_id, rfq_number)', 'rfq_org_id_rfq_number_key'),
  ('rfq', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'rfq_org_id_fkey'),
  ('rfq', 'FOREIGN KEY (billing_address_id) REFERENCES org_address(id) ON DELETE SET NULL', 'rfq_billing_address_id_fkey'),
  ('rfq', 'FOREIGN KEY (shipping_address_id) REFERENCES org_address(id) ON DELETE SET NULL', 'rfq_shipping_address_id_fkey'),
  ('rfq', 'FOREIGN KEY (awarded_supplier_id) REFERENCES supplier(id) ON DELETE SET NULL', 'rfq_awarded_supplier_id_fkey'),
  ('rfq', 'FOREIGN KEY (awarded_by) REFERENCES app_user(id)', 'rfq_awarded_by_fkey'),
  ('rfq', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'rfq_created_by_fkey'),
  ('rfq', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'rfq_updated_by_fkey'),
  ('rfq_number_counter', 'NOT NULL org_id', 'rfq_number_counter_org_id_not_null'),
  ('rfq_number_counter', 'NOT NULL year', 'rfq_number_counter_year_not_null'),
  ('rfq_number_counter', 'NOT NULL last_number', 'rfq_number_counter_last_number_not_null'),
  ('rfq_number_counter', 'PRIMARY KEY (org_id, year)', 'rfq_number_counter_pkey'),
  ('rfq_number_counter', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'rfq_number_counter_org_id_fkey'),
  ('rfq_item', 'NOT NULL id', 'rfq_item_id_not_null'),
  ('rfq_item', 'NOT NULL rfq_id', 'rfq_item_rfq_id_not_null'),
  ('rfq_item', 'NOT NULL line_number', 'rfq_item_line_number_not_null'),
  ('rfq_item', 'NOT NULL quantity', 'rfq_item_quantity_not_null'),
  ('rfq_item', 'PRIMARY KEY (id)', 'rfq_item_pkey'),
  ('rfq_item', 'FOREIGN KEY (rfq_id) REFERENCES rfq(id) ON DELETE CASCADE', 'rfq_item_rfq_id_fkey'),
  ('rfq_item', 'FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE SET NULL', 'rfq_item_file_id_fkey'),
  ('rfq_supplier', 'NOT NULL id', 'rfq_supplier_id_not_null'),
  ('rfq_supplier', 'NOT NULL rfq_id', 'rfq_supplier_rfq_id_not_null'),
  ('rfq_supplier', 'NOT NULL supplier_id', 'rfq_supplier_supplier_id_not_null'),
  ('rfq_supplier', 'PRIMARY KEY (id)', 'rfq_supplier_pkey'),
  ('rfq_supplier', 'UNIQUE (rfq_id, supplier_id)', 'rfq_supplier_rfq_id_supplier_id_key'),
  ('rfq_supplier', 'FOREIGN KEY (rfq_id) REFERENCES rfq(id) ON DELETE CASCADE', 'rfq_supplier_rfq_id_fkey'),
  ('rfq_supplier', 'FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE CASCADE', 'rfq_supplier_supplier_id_fkey'),
  ('rfq_supplier', 'FOREIGN KEY (sent_by) REFERENCES app_user(id)', 'rfq_supplier_sent_by_fkey'),
  ('rfq_supplier', 'FOREIGN KEY (contact_id) REFERENCES supplier_contact(id) ON DELETE SET NULL', 'rfq_supplier_contact_id_fkey'),
  ('rfq_quote', 'NOT NULL id', 'rfq_quote_id_not_null'),
  ('rfq_quote', 'NOT NULL rfq_id', 'rfq_quote_rfq_id_not_null'),
  ('rfq_quote', 'NOT NULL rfq_item_id', 'rfq_quote_rfq_item_id_not_null'),
  ('rfq_quote', 'NOT NULL supplier_id', 'rfq_quote_supplier_id_not_null'),
  ('rfq_quote', 'PRIMARY KEY (id)', 'rfq_quote_pkey'),
  ('rfq_quote', 'UNIQUE (rfq_item_id, supplier_id)', 'rfq_quote_rfq_item_id_supplier_id_key'),
  ('rfq_quote', 'FOREIGN KEY (rfq_id) REFERENCES rfq(id) ON DELETE CASCADE', 'rfq_quote_rfq_id_fkey'),
  ('rfq_quote', 'FOREIGN KEY (rfq_item_id) REFERENCES rfq_item(id) ON DELETE CASCADE', 'rfq_quote_rfq_item_id_fkey'),
  ('rfq_quote', 'FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE CASCADE', 'rfq_quote_supplier_id_fkey'),
  ('rfq_activity', 'NOT NULL id', 'rfq_activity_id_not_null'),
  ('rfq_activity', 'NOT NULL rfq_id', 'rfq_activity_rfq_id_not_null'),
  ('rfq_activity', 'NOT NULL action', 'rfq_activity_action_not_null'),
  ('rfq_activity', 'PRIMARY KEY (id)', 'rfq_activity_pkey'),
  ('rfq_activity', 'FOREIGN KEY (rfq_id) REFERENCES rfq(id) ON DELETE CASCADE', 'rfq_activity_rfq_id_fkey'),
  ('rfq_activity', 'FOREIGN KEY (performed_by) REFERENCES app_user(id)', 'rfq_activity_performed_by_fkey'),
  ('rfq_activity', 'FOREIGN KEY (supplier_contact_id) REFERENCES supplier_contact(id)', 'rfq_activity_supplier_contact_id_fkey'),
  ('release_file', 'FOREIGN KEY (rfq_id) REFERENCES rfq(id) ON DELETE SET NULL', 'release_file_rfq_id_fkey'),
  ('release_file', 'FOREIGN KEY (rfq_item_id) REFERENCES rfq_item(id) ON DELETE SET NULL', 'release_file_rfq_item_id_fkey'),
  ('org_integration', 'NOT NULL id', 'org_integration_id_not_null'),
  ('org_integration', 'NOT NULL org_id', 'org_integration_org_id_not_null'),
  ('org_integration', 'NOT NULL integration_type', 'org_integration_integration_type_not_null'),
  ('org_integration', 'NOT NULL settings', 'org_integration_settings_not_null'),
  ('org_integration', 'PRIMARY KEY (id)', 'org_integration_pkey'),
  ('org_integration', 'UNIQUE (org_id, integration_type)', 'org_integration_org_id_integration_type_key'),
  ('org_integration', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'org_integration_org_id_fkey'),
  ('org_integration', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'org_integration_created_by_fkey'),
  ('org_integration', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'org_integration_updated_by_fkey'),
  ('integration_sync_log', 'NOT NULL id', 'integration_sync_log_id_not_null'),
  ('integration_sync_log', 'NOT NULL org_id', 'integration_sync_log_org_id_not_null'),
  ('integration_sync_log', 'NOT NULL integration_id', 'integration_sync_log_integration_id_not_null'),
  ('integration_sync_log', 'NOT NULL sync_type', 'integration_sync_log_sync_type_not_null'),
  ('integration_sync_log', 'NOT NULL sync_direction', 'integration_sync_log_sync_direction_not_null'),
  ('integration_sync_log', 'NOT NULL status', 'integration_sync_log_status_not_null'),
  ('integration_sync_log', 'PRIMARY KEY (id)', 'integration_sync_log_pkey'),
  ('integration_sync_log', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'integration_sync_log_org_id_fkey'),
  ('integration_sync_log', 'FOREIGN KEY (integration_id) REFERENCES org_integration(id) ON DELETE CASCADE', 'integration_sync_log_integration_id_fkey'),
  ('integration_sync_log', 'FOREIGN KEY (triggered_by) REFERENCES app_user(id)', 'integration_sync_log_triggered_by_fkey'),
  ('integration_sync_log', 'NOT NULL is_cancel_requested', 'integration_sync_log_is_cancel_requested_not_null'),
  ('integration_sync_log', 'FOREIGN KEY (cancel_requested_by) REFERENCES app_user(id)', 'integration_sync_log_cancel_requested_by_fkey'),
  ('odoo_saved_config', 'NOT NULL id', 'odoo_saved_config_id_not_null'),
  ('odoo_saved_config', 'NOT NULL org_id', 'odoo_saved_config_org_id_not_null'),
  ('odoo_saved_config', 'NOT NULL name', 'odoo_saved_config_name_not_null'),
  ('odoo_saved_config', 'NOT NULL url', 'odoo_saved_config_url_not_null'),
  ('odoo_saved_config', 'NOT NULL database', 'odoo_saved_config_database_not_null'),
  ('odoo_saved_config', 'NOT NULL username', 'odoo_saved_config_username_not_null'),
  ('odoo_saved_config', 'PRIMARY KEY (id)', 'odoo_saved_config_pkey'),
  ('odoo_saved_config', 'UNIQUE (org_id, name)', 'odoo_saved_config_org_id_name_key'),
  ('odoo_saved_config', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'odoo_saved_config_org_id_fkey'),
  ('odoo_saved_config', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'odoo_saved_config_created_by_fkey'),
  ('odoo_saved_config', 'FOREIGN KEY (updated_by) REFERENCES app_user(id)', 'odoo_saved_config_updated_by_fkey'),
  ('webhook', 'CHECK ((trigger_filter = ANY (ARRAY[''everyone''::text, ''roles''::text, ''users''::text])))', 'webhook_trigger_filter_check'),
  ('webhook', 'NOT NULL id', 'webhook_id_not_null'),
  ('webhook', 'NOT NULL org_id', 'webhook_org_id_not_null'),
  ('webhook', 'NOT NULL name', 'webhook_name_not_null'),
  ('webhook', 'NOT NULL url', 'webhook_url_not_null'),
  ('webhook', 'NOT NULL secret', 'webhook_secret_not_null'),
  ('webhook', 'NOT NULL events', 'webhook_events_not_null'),
  ('webhook', 'NOT NULL is_active', 'webhook_is_active_not_null'),
  ('webhook', 'NOT NULL trigger_filter', 'webhook_trigger_filter_not_null'),
  ('webhook', 'NOT NULL trigger_roles', 'webhook_trigger_roles_not_null'),
  ('webhook', 'NOT NULL trigger_user_ids', 'webhook_trigger_user_ids_not_null'),
  ('webhook', 'NOT NULL custom_headers', 'webhook_custom_headers_not_null'),
  ('webhook', 'NOT NULL max_retries', 'webhook_max_retries_not_null'),
  ('webhook', 'NOT NULL retry_delay_seconds', 'webhook_retry_delay_seconds_not_null'),
  ('webhook', 'NOT NULL timeout_seconds', 'webhook_timeout_seconds_not_null'),
  ('webhook', 'PRIMARY KEY (id)', 'webhook_pkey'),
  ('webhook', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'webhook_org_id_fkey'),
  ('webhook', 'FOREIGN KEY (created_by) REFERENCES app_user(id) ON DELETE SET NULL', 'webhook_created_by_fkey'),
  ('webhook', 'FOREIGN KEY (updated_by) REFERENCES app_user(id) ON DELETE SET NULL', 'webhook_updated_by_fkey'),
  ('webhook_delivery', 'NOT NULL id', 'webhook_delivery_id_not_null'),
  ('webhook_delivery', 'NOT NULL webhook_id', 'webhook_delivery_webhook_id_not_null'),
  ('webhook_delivery', 'NOT NULL org_id', 'webhook_delivery_org_id_not_null'),
  ('webhook_delivery', 'NOT NULL event_type', 'webhook_delivery_event_type_not_null'),
  ('webhook_delivery', 'NOT NULL payload', 'webhook_delivery_payload_not_null'),
  ('webhook_delivery', 'PRIMARY KEY (id)', 'webhook_delivery_pkey'),
  ('webhook_delivery', 'FOREIGN KEY (webhook_id) REFERENCES webhook(id) ON DELETE CASCADE', 'webhook_delivery_webhook_id_fkey'),
  ('webhook_delivery', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'webhook_delivery_org_id_fkey'),
  ('solidworks_license', 'NOT NULL id', 'solidworks_license_id_not_null'),
  ('solidworks_license', 'NOT NULL org_id', 'solidworks_license_org_id_not_null'),
  ('solidworks_license', 'NOT NULL serial_number', 'solidworks_license_serial_number_not_null'),
  ('solidworks_license', 'PRIMARY KEY (id)', 'solidworks_license_pkey'),
  ('solidworks_license', 'UNIQUE (org_id, serial_number)', 'solidworks_license_org_id_serial_number_key'),
  ('solidworks_license', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'solidworks_license_org_id_fkey'),
  ('solidworks_license', 'FOREIGN KEY (created_by) REFERENCES app_user(id)', 'solidworks_license_created_by_fkey'),
  ('solidworks_license_assignment', 'NOT NULL id', 'solidworks_license_assignment_id_not_null'),
  ('solidworks_license_assignment', 'NOT NULL license_id', 'solidworks_license_assignment_license_id_not_null'),
  ('solidworks_license_assignment', 'NOT NULL user_id', 'solidworks_license_assignment_user_id_not_null'),
  ('solidworks_license_assignment', 'PRIMARY KEY (id)', 'solidworks_license_assignment_pkey'),
  ('solidworks_license_assignment', 'UNIQUE (license_id, user_id)', 'solidworks_license_assignment_license_id_user_id_key'),
  ('solidworks_license_assignment', 'FOREIGN KEY (license_id) REFERENCES solidworks_license(id) ON DELETE CASCADE', 'solidworks_license_assignment_license_id_fkey'),
  ('solidworks_license_assignment', 'FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE', 'solidworks_license_assignment_user_id_fkey'),
  ('solidworks_license_assignment', 'FOREIGN KEY (assigned_by) REFERENCES app_user(id)', 'solidworks_license_assignment_assigned_by_fkey'),
  ('integration_credential', 'CHECK ((owner_type = ANY (ARRAY[''odoo_saved_config''::text, ''organization_integration''::text])))', 'integration_credential_owner_type_check'),
  ('integration_credential', 'NOT NULL id', 'integration_credential_id_not_null'),
  ('integration_credential', 'NOT NULL org_id', 'integration_credential_org_id_not_null'),
  ('integration_credential', 'NOT NULL owner_type', 'integration_credential_owner_type_not_null'),
  ('integration_credential', 'NOT NULL owner_id', 'integration_credential_owner_id_not_null'),
  ('integration_credential', 'PRIMARY KEY (id)', 'integration_credential_pkey'),
  ('integration_credential', 'UNIQUE (owner_type, owner_id)', 'integration_credential_owner_type_owner_id_key'),
  ('integration_credential', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'integration_credential_org_id_fkey'),
  ('integration_credential', 'FOREIGN KEY (updated_by) REFERENCES app_user(id) ON DELETE SET NULL', 'integration_credential_updated_by_fkey'),
  ('org_installed_extension', 'NOT NULL org_id', 'org_installed_extension_org_id_not_null'),
  ('org_installed_extension', 'NOT NULL extension_id', 'org_installed_extension_extension_id_not_null'),
  ('org_installed_extension', 'NOT NULL version', 'org_installed_extension_version_not_null'),
  ('org_installed_extension', 'NOT NULL manifest', 'org_installed_extension_manifest_not_null'),
  ('org_installed_extension', 'PRIMARY KEY (org_id, extension_id)', 'org_installed_extension_pkey'),
  ('org_installed_extension', 'FOREIGN KEY (org_id) REFERENCES organization(id) ON DELETE CASCADE', 'org_installed_extension_org_id_fkey'),
  ('org_installed_extension', 'FOREIGN KEY (installed_by) REFERENCES app_user(id) ON DELETE SET NULL', 'org_installed_extension_installed_by_fkey'),
  ('org_installed_extension', 'CHECK (((category IS NULL) OR (category = ''sandboxed''::text) OR ((category = ''native''::text) AND (package_sha256 ~ ''^[0-9a-f]{64}$''::text) AND (package_path IS NOT NULL) AND (split_part(package_path, ''/''::text, 1) = (org_id)::text) AND (split_part(package_path, ''/''::text, 2) = extension_id))))', 'org_installed_extension_native_package_check');

CREATE TEMP TABLE _bp_idx (tbl TEXT, def TEXT, name TEXT, claimed BOOLEAN DEFAULT false) ON COMMIT DROP;
CREATE TEMP TABLE _bp_tbl (old TEXT, new TEXT) ON COMMIT DROP;
INSERT INTO _bp_tbl (old, new) VALUES
  ('organizations', 'organization'),
  ('users', 'app_user'),
  ('blocked_users', 'blocked_user'),
  ('teams', 'team'),
  ('team_members', 'team_member'),
  ('team_reviewers', 'team_reviewer'),
  ('team_permissions', 'team_permission'),
  ('permission_presets', 'permission_preset'),
  ('user_permissions', 'user_permission'),
  ('job_titles', 'job_title'),
  ('user_job_titles', 'user_job_title'),
  ('pending_org_members', 'pending_org_member'),
  ('admin_recovery_codes', 'admin_recovery_code'),
  ('user_sessions', 'user_session'),
  ('notifications', 'notification'),
  ('color_swatches', 'color_swatch'),
  ('vaults', 'vault'),
  ('workflow_templates', 'workflow_template'),
  ('workflow_states', 'workflow_state'),
  ('files', 'file'),
  ('file_versions', 'file_version'),
  ('release_files', 'release_file'),
  ('file_references', 'file_reference'),
  ('file_version_references', 'file_version_reference'),
  ('drawing_pdf_renders', 'drawing_pdf_render'),
  ('folders', 'folder'),
  ('workflow_transitions', 'workflow_transition'),
  ('workflow_gates', 'workflow_gate'),
  ('workflow_gate_reviewers', 'workflow_gate_reviewer'),
  ('workflow_roles', 'workflow_role'),
  ('user_workflow_roles', 'user_workflow_role'),
  ('file_workflow_assignments', 'file_workflow_assignment'),
  ('pending_reviews', 'workflow_gate_review'),
  ('file_state_entries', 'file_state_entry'),
  ('file_watchers', 'file_watcher'),
  ('file_share_links', 'file_share_link'),
  ('file_comments', 'file_comment'),
  ('file_metadata_columns', 'file_metadata_column'),
  ('backup_machines', 'backup_machine'),
  ('backup_locks', 'backup_lock'),
  ('item_images', 'item_image'),
  ('item_designations', 'item_designation'),
  ('item_designation_assignments', 'item_designation_assignment'),
  ('inspection_characteristics', 'inspection_characteristic'),
  ('inspection_characteristic_versions', 'inspection_characteristic_version'),
  ('inspection_methods', 'inspection_method'),
  ('ecos', 'eco'),
  ('file_ecos', 'file_eco'),
  ('reviews', 'review'),
  ('review_items', 'review_item'),
  ('review_rounds', 'review_round'),
  ('review_round_items', 'review_round_item'),
  ('review_responses', 'review_response'),
  ('review_decisions', 'review_decision'),
  ('deviations', 'deviation'),
  ('file_deviations', 'file_deviation'),
  ('process_templates', 'process_template'),
  ('process_template_phases', 'process_template_phase'),
  ('process_template_items', 'process_template_item'),
  ('eco_checklist_items', 'eco_checklist_item'),
  ('eco_gate_approvals', 'eco_gate_approval'),
  ('organization_addresses', 'org_address'),
  ('suppliers', 'supplier'),
  ('supplier_contacts', 'supplier_contact'),
  ('supplier_invitations', 'supplier_invitation'),
  ('part_suppliers', 'part_supplier'),
  ('rfqs', 'rfq'),
  ('rfq_number_counters', 'rfq_number_counter'),
  ('rfq_items', 'rfq_item'),
  ('rfq_suppliers', 'rfq_supplier'),
  ('rfq_quotes', 'rfq_quote'),
  ('organization_integrations', 'org_integration'),
  ('odoo_saved_configs', 'odoo_saved_config'),
  ('webhooks', 'webhook'),
  ('webhook_deliveries', 'webhook_delivery'),
  ('solidworks_licenses', 'solidworks_license'),
  ('solidworks_license_assignments', 'solidworks_license_assignment'),
  ('integration_credentials', 'integration_credential'),
  ('org_installed_extensions', 'org_installed_extension');
INSERT INTO _bp_idx (tbl, def, name) VALUES
  ('schema_remediation_log', 'CREATE INDEX _ ON public.schema_remediation_log USING btree (ran_at DESC)', 'schema_remediation_log_ran_at_idx'),
  ('organization', 'CREATE INDEX _ ON public.organization USING gin (email_domains)', 'organization_email_domains_idx'),
  ('app_user', 'CREATE INDEX _ ON public.app_user USING btree (org_id)', 'app_user_org_id_idx'),
  ('app_user', 'CREATE INDEX _ ON public.app_user USING btree (email)', 'app_user_email_idx'),
  ('blocked_user', 'CREATE INDEX _ ON public.blocked_user USING btree (org_id)', 'blocked_user_org_id_idx'),
  ('blocked_user', 'CREATE INDEX _ ON public.blocked_user USING btree (email)', 'blocked_user_email_idx'),
  ('team', 'CREATE INDEX _ ON public.team USING btree (org_id)', 'team_org_id_idx'),
  ('team', 'CREATE INDEX _ ON public.team USING btree (parent_team_id)', 'team_parent_team_id_idx'),
  ('team_member', 'CREATE INDEX _ ON public.team_member USING btree (team_id)', 'team_member_team_id_idx'),
  ('team_member', 'CREATE INDEX _ ON public.team_member USING btree (user_id)', 'team_member_user_id_idx'),
  ('team_reviewer', 'CREATE INDEX _ ON public.team_reviewer USING btree (team_id)', 'team_reviewer_team_id_idx'),
  ('team_permission', 'CREATE INDEX _ ON public.team_permission USING btree (team_id)', 'team_permission_team_id_idx'),
  ('team_permission', 'CREATE INDEX _ ON public.team_permission USING btree (resource)', 'team_permission_resource_idx'),
  ('permission_preset', 'CREATE INDEX _ ON public.permission_preset USING btree (org_id)', 'permission_preset_org_id_idx'),
  ('user_permission', 'CREATE INDEX _ ON public.user_permission USING btree (user_id)', 'user_permission_user_id_idx'),
  ('user_permission', 'CREATE INDEX _ ON public.user_permission USING btree (resource)', 'user_permission_resource_idx'),
  ('module_access', 'CREATE INDEX _ ON public.module_access USING btree (org_id, module_id)', 'module_access_org_id_module_id_idx'),
  ('module_access', 'CREATE UNIQUE INDEX _ ON public.module_access USING btree (org_id, module_id, team_id) WHERE (team_id IS NOT NULL)', 'module_access_org_id_module_id_team_id_idx'),
  ('module_access', 'CREATE UNIQUE INDEX _ ON public.module_access USING btree (org_id, module_id, user_id) WHERE (user_id IS NOT NULL)', 'module_access_org_id_module_id_user_id_idx'),
  ('job_title', 'CREATE INDEX _ ON public.job_title USING btree (org_id)', 'job_title_org_id_idx'),
  ('user_job_title', 'CREATE INDEX _ ON public.user_job_title USING btree (user_id)', 'user_job_title_user_id_idx'),
  ('user_job_title', 'CREATE INDEX _ ON public.user_job_title USING btree (title_id)', 'user_job_title_title_id_idx'),
  ('pending_org_member', 'CREATE INDEX _ ON public.pending_org_member USING btree (org_id)', 'pending_org_member_org_id_idx'),
  ('pending_org_member', 'CREATE INDEX _ ON public.pending_org_member USING btree (email)', 'pending_org_member_email_idx'),
  ('admin_recovery_code', 'CREATE INDEX _ ON public.admin_recovery_code USING btree (org_id)', 'admin_recovery_code_org_id_idx'),
  ('user_session', 'CREATE INDEX _ ON public.user_session USING btree (user_id)', 'user_session_user_id_idx'),
  ('user_session', 'CREATE INDEX _ ON public.user_session USING btree (org_id)', 'user_session_org_id_idx'),
  ('user_session', 'CREATE INDEX _ ON public.user_session USING btree (last_seen_at)', 'user_session_last_seen_at_idx'),
  ('user_session', 'CREATE INDEX _ ON public.user_session USING btree (is_active)', 'user_session_is_active_idx'),
  ('notification', 'CREATE INDEX _ ON public.notification USING btree (user_id)', 'notification_user_id_idx'),
  ('notification', 'CREATE INDEX _ ON public.notification USING btree (org_id)', 'notification_org_id_idx'),
  ('notification', 'CREATE INDEX _ ON public.notification USING btree (user_id, is_read) WHERE (is_read = false)', 'notification_user_id_is_read_idx'),
  ('notification', 'CREATE INDEX _ ON public.notification USING btree (entity_type, entity_id)', 'notification_entity_type_entity_id_idx'),
  ('color_swatch', 'CREATE INDEX _ ON public.color_swatch USING btree (user_id)', 'color_swatch_user_id_idx'),
  ('color_swatch', 'CREATE INDEX _ ON public.color_swatch USING btree (org_id)', 'color_swatch_org_id_idx'),
  ('vault', 'CREATE INDEX _ ON public.vault USING btree (org_id)', 'vault_org_id_idx'),
  ('vault_access', 'CREATE INDEX _ ON public.vault_access USING btree (vault_id)', 'vault_access_vault_id_idx'),
  ('vault_access', 'CREATE INDEX _ ON public.vault_access USING btree (user_id)', 'vault_access_user_id_idx'),
  ('team_vault_access', 'CREATE INDEX _ ON public.team_vault_access USING btree (team_id)', 'team_vault_access_team_id_idx'),
  ('team_vault_access', 'CREATE INDEX _ ON public.team_vault_access USING btree (vault_id)', 'team_vault_access_vault_id_idx'),
  ('workflow_template', 'CREATE INDEX _ ON public.workflow_template USING btree (org_id)', 'workflow_template_org_id_idx'),
  ('workflow_template', 'CREATE INDEX _ ON public.workflow_template USING btree (is_default)', 'workflow_template_is_default_idx'),
  ('workflow_template', 'CREATE INDEX _ ON public.workflow_template USING btree (is_active)', 'workflow_template_is_active_idx'),
  ('workflow_state', 'CREATE INDEX _ ON public.workflow_state USING btree (workflow_id)', 'workflow_state_workflow_id_idx'),
  ('file', 'CREATE UNIQUE INDEX _ ON public.file USING btree (vault_id, lower(file_path)) WHERE (deleted_at IS NULL)', 'file_vault_id_file_path_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING btree (org_id)', 'file_org_id_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING btree (vault_id)', 'file_vault_id_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING btree (file_path)', 'file_file_path_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING btree (part_number) WHERE (part_number IS NOT NULL)', 'file_part_number_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING btree (state)', 'file_state_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING btree (checked_out_by) WHERE (checked_out_by IS NOT NULL)', 'file_checked_out_by_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING btree (extension)', 'file_extension_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING btree (content_hash) WHERE (content_hash IS NOT NULL)', 'file_content_hash_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING btree (deleted_at) WHERE (deleted_at IS NOT NULL)', 'file_deleted_at_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING btree (vault_id, file_path) WHERE (deleted_at IS NULL)', 'file_vault_id_file_path_deleted_at_idx'),
  ('file', 'CREATE INDEX _ ON public.file USING gin (eco_tags)', 'file_eco_tags_idx'),
  ('file_version', 'CREATE INDEX _ ON public.file_version USING btree (file_id)', 'file_version_file_id_idx'),
  ('file_version', 'CREATE INDEX _ ON public.file_version USING btree (content_hash)', 'file_version_content_hash_idx'),
  ('release_file', 'CREATE INDEX _ ON public.release_file USING btree (file_id)', 'release_file_file_id_idx'),
  ('release_file', 'CREATE INDEX _ ON public.release_file USING btree (file_version_id)', 'release_file_file_version_id_idx'),
  ('release_file', 'CREATE INDEX _ ON public.release_file USING btree (org_id)', 'release_file_org_id_idx'),
  ('release_file', 'CREATE INDEX _ ON public.release_file USING btree (file_id, version, file_type)', 'release_file_file_id_version_file_type_idx'),
  ('file_reference', 'CREATE INDEX _ ON public.file_reference USING btree (parent_file_id)', 'file_reference_parent_file_id_idx'),
  ('file_reference', 'CREATE INDEX _ ON public.file_reference USING btree (child_file_id)', 'file_reference_child_file_id_idx'),
  ('file_version_reference', 'CREATE UNIQUE INDEX _ ON public.file_version_reference USING btree (parent_version_id, lower(child_path), COALESCE(configuration, ''''::text))', 'file_version_reference_edge_idx'),
  ('file_version_reference', 'CREATE INDEX _ ON public.file_version_reference USING btree (child_file_id)', 'file_version_reference_child_file_id_idx'),
  ('file_version_reference', 'CREATE INDEX _ ON public.file_version_reference USING btree (child_version_id)', 'file_version_reference_child_version_id_idx'),
  ('file_version_reference', 'CREATE INDEX _ ON public.file_version_reference USING btree (org_id)', 'file_version_reference_org_id_idx'),
  ('drawing_pdf_render', 'CREATE INDEX _ ON public.drawing_pdf_render USING btree (org_id)', 'drawing_pdf_render_org_id_idx'),
  ('drawing_pdf_render', 'CREATE INDEX _ ON public.drawing_pdf_render USING btree (file_id)', 'drawing_pdf_render_file_id_idx'),
  ('folder', 'CREATE UNIQUE INDEX _ ON public.folder USING btree (vault_id, lower(folder_path)) WHERE (deleted_at IS NULL)', 'folder_vault_id_folder_path_idx'),
  ('folder', 'CREATE INDEX _ ON public.folder USING btree (org_id)', 'folder_org_id_idx'),
  ('folder', 'CREATE INDEX _ ON public.folder USING btree (vault_id)', 'folder_vault_id_idx'),
  ('folder', 'CREATE INDEX _ ON public.folder USING btree (deleted_at) WHERE (deleted_at IS NOT NULL)', 'folder_deleted_at_idx'),
  ('activity', 'CREATE INDEX _ ON public.activity USING btree (org_id)', 'activity_org_id_idx'),
  ('activity', 'CREATE INDEX _ ON public.activity USING btree (file_id)', 'activity_file_id_idx'),
  ('activity', 'CREATE INDEX _ ON public.activity USING btree (user_id)', 'activity_user_id_idx'),
  ('activity', 'CREATE INDEX _ ON public.activity USING btree (created_at DESC)', 'activity_created_at_idx'),
  ('activity', 'CREATE INDEX _ ON public.activity USING btree (action)', 'activity_action_idx'),
  ('workflow_transition', 'CREATE INDEX _ ON public.workflow_transition USING btree (workflow_id)', 'workflow_transition_workflow_id_idx'),
  ('workflow_transition', 'CREATE INDEX _ ON public.workflow_transition USING btree (from_state_id)', 'workflow_transition_from_state_id_idx'),
  ('workflow_transition', 'CREATE INDEX _ ON public.workflow_transition USING btree (to_state_id)', 'workflow_transition_to_state_id_idx'),
  ('workflow_gate', 'CREATE INDEX _ ON public.workflow_gate USING btree (transition_id)', 'workflow_gate_transition_id_idx'),
  ('workflow_gate_reviewer', 'CREATE INDEX _ ON public.workflow_gate_reviewer USING btree (gate_id)', 'workflow_gate_reviewer_gate_id_idx'),
  ('workflow_gate_reviewer', 'CREATE INDEX _ ON public.workflow_gate_reviewer USING btree (user_id)', 'workflow_gate_reviewer_user_id_idx'),
  ('workflow_role', 'CREATE INDEX _ ON public.workflow_role USING btree (org_id)', 'workflow_role_org_id_idx'),
  ('workflow_role', 'CREATE INDEX _ ON public.workflow_role USING btree (org_id, name)', 'workflow_role_org_id_name_idx'),
  ('user_workflow_role', 'CREATE INDEX _ ON public.user_workflow_role USING btree (user_id)', 'user_workflow_role_user_id_idx'),
  ('user_workflow_role', 'CREATE INDEX _ ON public.user_workflow_role USING btree (workflow_role_id)', 'user_workflow_role_workflow_role_id_idx'),
  ('file_workflow_assignment', 'CREATE INDEX _ ON public.file_workflow_assignment USING btree (file_id)', 'file_workflow_assignment_file_id_idx'),
  ('file_workflow_assignment', 'CREATE INDEX _ ON public.file_workflow_assignment USING btree (workflow_id)', 'file_workflow_assignment_workflow_id_idx'),
  ('file_workflow_assignment', 'CREATE INDEX _ ON public.file_workflow_assignment USING btree (current_state_id)', 'file_workflow_assignment_current_state_id_idx'),
  ('workflow_gate_review', 'CREATE INDEX _ ON public.workflow_gate_review USING btree (org_id)', 'workflow_gate_review_org_id_idx'),
  ('workflow_gate_review', 'CREATE INDEX _ ON public.workflow_gate_review USING btree (file_id)', 'workflow_gate_review_file_id_idx'),
  ('workflow_gate_review', 'CREATE INDEX _ ON public.workflow_gate_review USING btree (status)', 'workflow_gate_review_status_idx'),
  ('workflow_gate_review', 'CREATE INDEX _ ON public.workflow_gate_review USING btree (assignee_id)', 'workflow_gate_review_assignee_id_idx'),
  ('workflow_gate_review', 'CREATE INDEX _ ON public.workflow_gate_review USING btree (attempt_id, gate_id)', 'workflow_gate_review_attempt_id_gate_id_idx'),
  ('workflow_review_history', 'CREATE INDEX _ ON public.workflow_review_history USING btree (org_id)', 'workflow_review_history_org_id_idx'),
  ('workflow_review_history', 'CREATE INDEX _ ON public.workflow_review_history USING btree (file_id)', 'workflow_review_history_file_id_idx'),
  ('workflow_review_history', 'CREATE INDEX _ ON public.workflow_review_history USING btree (created_at DESC)', 'workflow_review_history_created_at_idx'),
  ('workflow_history', 'CREATE INDEX _ ON public.workflow_history USING btree (org_id)', 'workflow_history_org_id_idx'),
  ('workflow_history', 'CREATE INDEX _ ON public.workflow_history USING btree (file_id)', 'workflow_history_file_id_idx'),
  ('workflow_history', 'CREATE INDEX _ ON public.workflow_history USING btree (performed_at DESC)', 'workflow_history_performed_at_idx'),
  ('file_state_entry', 'CREATE INDEX _ ON public.file_state_entry USING btree (file_id)', 'file_state_entry_file_id_idx'),
  ('file_state_entry', 'CREATE INDEX _ ON public.file_state_entry USING btree (state_id)', 'file_state_entry_state_id_idx'),
  ('file_state_entry', 'CREATE INDEX _ ON public.file_state_entry USING btree (state_id) WHERE (exited_at IS NULL)', 'file_state_entry_state_id_exited_at_idx'),
  ('file_watcher', 'CREATE INDEX _ ON public.file_watcher USING btree (file_id)', 'file_watcher_file_id_idx'),
  ('file_watcher', 'CREATE INDEX _ ON public.file_watcher USING btree (user_id)', 'file_watcher_user_id_idx'),
  ('file_watcher', 'CREATE INDEX _ ON public.file_watcher USING btree (org_id)', 'file_watcher_org_id_idx'),
  ('file_share_link', 'CREATE INDEX _ ON public.file_share_link USING btree (token)', 'file_share_link_token_idx'),
  ('file_share_link', 'CREATE INDEX _ ON public.file_share_link USING btree (file_id)', 'file_share_link_file_id_idx'),
  ('file_share_link', 'CREATE INDEX _ ON public.file_share_link USING btree (org_id)', 'file_share_link_org_id_idx'),
  ('file_share_link', 'CREATE INDEX _ ON public.file_share_link USING btree (created_by)', 'file_share_link_created_by_idx'),
  ('file_share_link', 'CREATE INDEX _ ON public.file_share_link USING btree (expires_at) WHERE (expires_at IS NOT NULL)', 'file_share_link_expires_at_idx'),
  ('file_comment', 'CREATE INDEX _ ON public.file_comment USING btree (file_id)', 'file_comment_file_id_idx'),
  ('file_comment', 'CREATE INDEX _ ON public.file_comment USING btree (user_id)', 'file_comment_user_id_idx'),
  ('file_comment', 'CREATE INDEX _ ON public.file_comment USING btree (parent_id)', 'file_comment_parent_id_idx'),
  ('file_comment', 'CREATE INDEX _ ON public.file_comment USING btree (is_resolved)', 'file_comment_is_resolved_idx'),
  ('file_metadata_column', 'CREATE INDEX _ ON public.file_metadata_column USING btree (org_id)', 'file_metadata_column_org_id_idx'),
  ('file_metadata_column', 'CREATE INDEX _ ON public.file_metadata_column USING btree (org_id, sort_order)', 'file_metadata_column_org_id_sort_order_idx'),
  ('backup_config', 'CREATE INDEX _ ON public.backup_config USING btree (org_id)', 'backup_config_org_id_idx'),
  ('backup_history', 'CREATE INDEX _ ON public.backup_history USING btree (org_id)', 'backup_history_org_id_idx'),
  ('backup_history', 'CREATE INDEX _ ON public.backup_history USING btree (started_at DESC)', 'backup_history_started_at_idx'),
  ('backup_history', 'CREATE INDEX _ ON public.backup_history USING btree (status)', 'backup_history_status_idx'),
  ('backup_machine', 'CREATE INDEX _ ON public.backup_machine USING btree (org_id)', 'backup_machine_org_id_idx'),
  ('backup_machine', 'CREATE INDEX _ ON public.backup_machine USING btree (last_seen_at)', 'backup_machine_last_seen_at_idx'),
  ('backup_lock', 'CREATE INDEX _ ON public.backup_lock USING btree (org_id)', 'backup_lock_org_id_idx'),
  ('backup_lock', 'CREATE INDEX _ ON public.backup_lock USING btree (expires_at)', 'backup_lock_expires_at_idx'),
  ('item_image', 'CREATE INDEX _ ON public.item_image USING btree (org_id)', 'item_image_org_id_idx'),
  ('item_designation', 'CREATE INDEX _ ON public.item_designation USING btree (org_id)', 'item_designation_org_id_idx'),
  ('item_designation', 'CREATE UNIQUE INDEX _ ON public.item_designation USING btree (org_id, lower(name))', 'item_designation_org_id_name_idx'),
  ('item_designation_assignment', 'CREATE INDEX _ ON public.item_designation_assignment USING btree (org_id, vault_id)', 'item_designation_assignment_org_id_vault_id_idx'),
  ('drawing_pdf_render', 'CREATE INDEX _ ON public.drawing_pdf_render USING btree (storage_hash)', 'drawing_pdf_render_storage_hash_idx'),
  ('inspection_characteristic', 'CREATE INDEX _ ON public.inspection_characteristic USING btree (file_id)', 'inspection_characteristic_file_id_idx'),
  ('inspection_characteristic', 'CREATE INDEX _ ON public.inspection_characteristic USING btree (org_id)', 'inspection_characteristic_org_id_idx'),
  ('inspection_characteristic_version', 'CREATE INDEX _ ON public.inspection_characteristic_version USING btree (file_version_id)', 'inspection_characteristic_version_file_version_id_idx'),
  ('inspection_characteristic_version', 'CREATE INDEX _ ON public.inspection_characteristic_version USING btree (org_id)', 'inspection_characteristic_version_org_id_idx'),
  ('inspection_method', 'CREATE INDEX _ ON public.inspection_method USING btree (org_id)', 'inspection_method_org_id_idx'),
  ('eco', 'CREATE INDEX _ ON public.eco USING btree (org_id)', 'eco_org_id_idx'),
  ('eco', 'CREATE INDEX _ ON public.eco USING btree (eco_number)', 'eco_eco_number_idx'),
  ('eco', 'CREATE INDEX _ ON public.eco USING btree (status)', 'eco_status_idx'),
  ('eco', 'CREATE INDEX _ ON public.eco USING btree (created_at DESC)', 'eco_created_at_idx'),
  ('eco', 'CREATE INDEX _ ON public.eco USING btree (process_template_id)', 'eco_process_template_id_idx'),
  ('file_eco', 'CREATE INDEX _ ON public.file_eco USING btree (file_id)', 'file_eco_file_id_idx'),
  ('file_eco', 'CREATE INDEX _ ON public.file_eco USING btree (eco_id)', 'file_eco_eco_id_idx'),
  ('review', 'CREATE INDEX _ ON public.review USING btree (org_id)', 'review_org_id_idx'),
  ('review', 'CREATE INDEX _ ON public.review USING btree (file_id)', 'review_file_id_idx'),
  ('review', 'CREATE INDEX _ ON public.review USING btree (requested_by)', 'review_requested_by_idx'),
  ('review', 'CREATE INDEX _ ON public.review USING btree (status)', 'review_status_idx'),
  ('review', 'CREATE INDEX _ ON public.review USING btree (created_at DESC)', 'review_created_at_idx'),
  ('review', 'CREATE INDEX _ ON public.review USING btree (due_date) WHERE (due_date IS NOT NULL)', 'review_due_date_idx'),
  ('review', 'CREATE INDEX _ ON public.review USING btree (priority)', 'review_priority_idx'),
  ('review', 'CREATE INDEX _ ON public.review USING btree (team_id) WHERE (team_id IS NOT NULL)', 'review_team_id_idx'),
  ('review', 'CREATE INDEX _ ON public.review USING btree (org_id, status)', 'review_org_id_status_idx'),
  ('review_item', 'CREATE INDEX _ ON public.review_item USING btree (review_id, sort_order)', 'review_item_review_id_sort_order_idx'),
  ('review_item', 'CREATE INDEX _ ON public.review_item USING btree (file_id)', 'review_item_file_id_idx'),
  ('review_item', 'CREATE INDEX _ ON public.review_item USING btree (file_version_id)', 'review_item_file_version_id_idx'),
  ('review_round_item', 'CREATE INDEX _ ON public.review_round_item USING btree (review_id, round_number)', 'review_round_item_review_id_round_number_idx'),
  ('review_response', 'CREATE INDEX _ ON public.review_response USING btree (review_id)', 'review_response_review_id_idx'),
  ('review_response', 'CREATE INDEX _ ON public.review_response USING btree (reviewer_id)', 'review_response_reviewer_id_idx'),
  ('review_response', 'CREATE INDEX _ ON public.review_response USING btree (status)', 'review_response_status_idx'),
  ('review_response', 'CREATE INDEX _ ON public.review_response USING btree (review_id, round_number)', 'review_response_review_id_round_number_idx'),
  ('review_decision', 'CREATE INDEX _ ON public.review_decision USING btree (review_id, round_number)', 'review_decision_review_id_round_number_idx'),
  ('review_decision', 'CREATE INDEX _ ON public.review_decision USING btree (reviewer_id)', 'review_decision_reviewer_id_idx'),
  ('file_comment', 'CREATE INDEX _ ON public.file_comment USING btree (review_id, review_round) WHERE (review_id IS NOT NULL)', 'file_comment_review_id_review_round_idx'),
  ('file_comment', 'CREATE INDEX _ ON public.file_comment USING btree (review_item_id) WHERE (review_item_id IS NOT NULL)', 'file_comment_review_item_id_idx'),
  ('deviation', 'CREATE INDEX _ ON public.deviation USING btree (org_id)', 'deviation_org_id_idx'),
  ('deviation', 'CREATE INDEX _ ON public.deviation USING btree (deviation_number)', 'deviation_deviation_number_idx'),
  ('deviation', 'CREATE INDEX _ ON public.deviation USING btree (status)', 'deviation_status_idx'),
  ('deviation', 'CREATE INDEX _ ON public.deviation USING btree (created_at DESC)', 'deviation_created_at_idx'),
  ('deviation', 'CREATE INDEX _ ON public.deviation USING gin (affected_part_numbers)', 'deviation_affected_part_numbers_idx'),
  ('file_deviation', 'CREATE INDEX _ ON public.file_deviation USING btree (file_id)', 'file_deviation_file_id_idx'),
  ('file_deviation', 'CREATE INDEX _ ON public.file_deviation USING btree (deviation_id)', 'file_deviation_deviation_id_idx'),
  ('process_template', 'CREATE INDEX _ ON public.process_template USING btree (org_id)', 'process_template_org_id_idx'),
  ('process_template_phase', 'CREATE INDEX _ ON public.process_template_phase USING btree (template_id)', 'process_template_phase_template_id_idx'),
  ('process_template_item', 'CREATE INDEX _ ON public.process_template_item USING btree (phase_id)', 'process_template_item_phase_id_idx'),
  ('eco_checklist_item', 'CREATE INDEX _ ON public.eco_checklist_item USING btree (eco_id)', 'eco_checklist_item_eco_id_idx'),
  ('eco_checklist_item', 'CREATE INDEX _ ON public.eco_checklist_item USING btree (status)', 'eco_checklist_item_status_idx'),
  ('eco_checklist_item', 'CREATE INDEX _ ON public.eco_checklist_item USING btree (eco_id, phase_name)', 'eco_checklist_item_eco_id_phase_name_idx'),
  ('eco_gate_approval', 'CREATE INDEX _ ON public.eco_gate_approval USING btree (eco_id)', 'eco_gate_approval_eco_id_idx'),
  ('eco_checklist_activity', 'CREATE INDEX _ ON public.eco_checklist_activity USING btree (eco_id)', 'eco_checklist_activity_eco_id_idx'),
  ('eco_checklist_activity', 'CREATE INDEX _ ON public.eco_checklist_activity USING btree (checklist_item_id)', 'eco_checklist_activity_checklist_item_id_idx'),
  ('org_address', 'CREATE INDEX _ ON public.org_address USING btree (org_id)', 'org_address_org_id_idx'),
  ('org_address', 'CREATE INDEX _ ON public.org_address USING btree (org_id, address_type)', 'org_address_org_id_address_type_idx'),
  ('supplier', 'CREATE INDEX _ ON public.supplier USING btree (org_id)', 'supplier_org_id_idx'),
  ('supplier', 'CREATE INDEX _ ON public.supplier USING btree (name)', 'supplier_name_idx'),
  ('supplier', 'CREATE INDEX _ ON public.supplier USING btree (code)', 'supplier_code_idx'),
  ('supplier', 'CREATE INDEX _ ON public.supplier USING btree (is_active)', 'supplier_is_active_idx'),
  ('supplier', 'CREATE INDEX _ ON public.supplier USING btree (erp_id) WHERE (erp_id IS NOT NULL)', 'supplier_erp_id_idx'),
  ('supplier', 'CREATE INDEX _ ON public.supplier USING gin (to_tsvector(''simple''::regconfig, ((((COALESCE(name, ''''::text) || '' ''::text) || COALESCE(code, ''''::text)) || '' ''::text) || COALESCE(notes, ''''::text))))', 'supplier_search_idx'),
  ('supplier_contact', 'CREATE INDEX _ ON public.supplier_contact USING btree (supplier_id)', 'supplier_contact_supplier_id_idx'),
  ('supplier_contact', 'CREATE INDEX _ ON public.supplier_contact USING btree (email) WHERE (email IS NOT NULL)', 'supplier_contact_email_idx'),
  ('supplier_contact', 'CREATE INDEX _ ON public.supplier_contact USING btree (phone) WHERE (phone IS NOT NULL)', 'supplier_contact_phone_idx'),
  ('supplier_contact', 'CREATE INDEX _ ON public.supplier_contact USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL)', 'supplier_contact_auth_user_id_idx'),
  ('supplier_invitation', 'CREATE INDEX _ ON public.supplier_invitation USING btree (org_id)', 'supplier_invitation_org_id_idx'),
  ('supplier_invitation', 'CREATE INDEX _ ON public.supplier_invitation USING btree (supplier_id)', 'supplier_invitation_supplier_id_idx'),
  ('supplier_invitation', 'CREATE INDEX _ ON public.supplier_invitation USING btree (token)', 'supplier_invitation_token_idx'),
  ('part_supplier', 'CREATE INDEX _ ON public.part_supplier USING btree (org_id)', 'part_supplier_org_id_idx'),
  ('part_supplier', 'CREATE INDEX _ ON public.part_supplier USING btree (file_id)', 'part_supplier_file_id_idx'),
  ('part_supplier', 'CREATE INDEX _ ON public.part_supplier USING btree (supplier_id)', 'part_supplier_supplier_id_idx'),
  ('part_supplier', 'CREATE INDEX _ ON public.part_supplier USING btree (is_preferred) WHERE (is_preferred = true)', 'part_supplier_is_preferred_idx'),
  ('part_supplier', 'CREATE INDEX _ ON public.part_supplier USING btree (supplier_part_number) WHERE (supplier_part_number IS NOT NULL)', 'part_supplier_supplier_part_number_idx'),
  ('rfq', 'CREATE INDEX _ ON public.rfq USING btree (org_id)', 'rfq_org_id_idx'),
  ('rfq', 'CREATE INDEX _ ON public.rfq USING btree (status)', 'rfq_status_idx'),
  ('rfq', 'CREATE INDEX _ ON public.rfq USING btree (created_at DESC)', 'rfq_created_at_idx'),
  ('rfq_item', 'CREATE INDEX _ ON public.rfq_item USING btree (rfq_id)', 'rfq_item_rfq_id_idx'),
  ('rfq_item', 'CREATE INDEX _ ON public.rfq_item USING btree (file_id)', 'rfq_item_file_id_idx'),
  ('rfq_supplier', 'CREATE INDEX _ ON public.rfq_supplier USING btree (rfq_id)', 'rfq_supplier_rfq_id_idx'),
  ('rfq_supplier', 'CREATE INDEX _ ON public.rfq_supplier USING btree (supplier_id)', 'rfq_supplier_supplier_id_idx'),
  ('rfq_quote', 'CREATE INDEX _ ON public.rfq_quote USING btree (rfq_id)', 'rfq_quote_rfq_id_idx'),
  ('rfq_quote', 'CREATE INDEX _ ON public.rfq_quote USING btree (rfq_item_id)', 'rfq_quote_rfq_item_id_idx'),
  ('rfq_quote', 'CREATE INDEX _ ON public.rfq_quote USING btree (supplier_id)', 'rfq_quote_supplier_id_idx'),
  ('rfq_activity', 'CREATE INDEX _ ON public.rfq_activity USING btree (rfq_id)', 'rfq_activity_rfq_id_idx'),
  ('rfq_activity', 'CREATE INDEX _ ON public.rfq_activity USING btree (performed_at DESC)', 'rfq_activity_performed_at_idx'),
  ('org_integration', 'CREATE INDEX _ ON public.org_integration USING btree (org_id)', 'org_integration_org_id_idx'),
  ('org_integration', 'CREATE INDEX _ ON public.org_integration USING btree (integration_type)', 'org_integration_integration_type_idx'),
  ('org_integration', 'CREATE INDEX _ ON public.org_integration USING btree (is_active) WHERE (is_active = true)', 'org_integration_is_active_idx'),
  ('integration_sync_log', 'CREATE INDEX _ ON public.integration_sync_log USING btree (org_id)', 'integration_sync_log_org_id_idx'),
  ('integration_sync_log', 'CREATE INDEX _ ON public.integration_sync_log USING btree (integration_id)', 'integration_sync_log_integration_id_idx'),
  ('integration_sync_log', 'CREATE INDEX _ ON public.integration_sync_log USING btree (started_at DESC)', 'integration_sync_log_started_at_idx'),
  ('integration_sync_log', 'CREATE INDEX _ ON public.integration_sync_log USING btree (org_id, integration_id) WHERE (status = ''running''::text)', 'integration_sync_log_org_id_integration_id_idx'),
  ('integration_sync_log', 'CREATE INDEX _ ON public.integration_sync_log USING btree (org_id, sync_type, started_at DESC) WHERE ((status = ''success''::text) AND (sync_watermark_at IS NOT NULL))', 'integration_sync_log_org_id_sync_type_started_at_idx'),
  ('odoo_saved_config', 'CREATE INDEX _ ON public.odoo_saved_config USING btree (org_id)', 'odoo_saved_config_org_id_idx'),
  ('odoo_saved_config', 'CREATE INDEX _ ON public.odoo_saved_config USING btree (is_active) WHERE (is_active = true)', 'odoo_saved_config_is_active_idx'),
  ('webhook', 'CREATE INDEX _ ON public.webhook USING btree (org_id)', 'webhook_org_id_idx'),
  ('webhook', 'CREATE INDEX _ ON public.webhook USING btree (org_id, is_active) WHERE (is_active = true)', 'webhook_org_id_is_active_idx'),
  ('webhook_delivery', 'CREATE INDEX _ ON public.webhook_delivery USING btree (webhook_id)', 'webhook_delivery_webhook_id_idx'),
  ('webhook_delivery', 'CREATE INDEX _ ON public.webhook_delivery USING btree (org_id)', 'webhook_delivery_org_id_idx'),
  ('webhook_delivery', 'CREATE INDEX _ ON public.webhook_delivery USING btree (status) WHERE (status = ANY (ARRAY[''pending''::webhook_delivery_status, ''retrying''::webhook_delivery_status]))', 'webhook_delivery_status_idx'),
  ('webhook_delivery', 'CREATE INDEX _ ON public.webhook_delivery USING btree (created_at DESC)', 'webhook_delivery_created_at_idx'),
  ('solidworks_license', 'CREATE INDEX _ ON public.solidworks_license USING btree (org_id)', 'solidworks_license_org_id_idx'),
  ('solidworks_license_assignment', 'CREATE INDEX _ ON public.solidworks_license_assignment USING btree (license_id)', 'solidworks_license_assignment_license_id_idx'),
  ('solidworks_license_assignment', 'CREATE INDEX _ ON public.solidworks_license_assignment USING btree (user_id)', 'solidworks_license_assignment_user_id_idx'),
  ('integration_credential', 'CREATE INDEX _ ON public.integration_credential USING btree (org_id)', 'integration_credential_org_id_idx'),
  ('integration_credential', 'CREATE INDEX _ ON public.integration_credential USING btree (owner_type, owner_id)', 'integration_credential_owner_type_owner_id_idx'),
  ('org_installed_extension', 'CREATE INDEX _ ON public.org_installed_extension USING btree (org_id)', 'org_installed_extension_org_id_idx'),
  ('org_installed_extension', 'CREATE INDEX _ ON public.org_installed_extension USING btree (org_id, is_enabled) WHERE (is_enabled = true)', 'org_installed_extension_org_id_is_enabled_idx');

DO $$
DECLARE
  r RECORD;
  e RECORD;
  v_n INTEGER := 0;
  v_extra TEXT[] := '{}';
BEGIN
  -- Constraints: claim a baseline row per constraint, park the name, then rename.
  CREATE TEMP TABLE _bp_con_map (conrelid OID, tmp TEXT, name TEXT) ON COMMIT DROP;
  CREATE TEMP TABLE _bp_con_extra (tbl TEXT, conname TEXT, def TEXT) ON COMMIT DROP;
  FOR r IN
    SELECT c.oid, c.conrelid, c.conrelid::regclass::text AS tbl, c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.connamespace = 'public'::regnamespace AND c.conrelid <> 0 AND c.contype IN ('p', 'u', 'c', 'f', 'x', 'n')
    ORDER BY c.oid
  LOOP
    SELECT ctid, * INTO e FROM _bp_con WHERE tbl = r.tbl AND def = r.def AND NOT claimed ORDER BY (name = r.conname) DESC LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO _bp_con_extra VALUES (r.tbl, r.conname, r.def);
      CONTINUE;
    END IF;
    UPDATE _bp_con SET claimed = true WHERE ctid = e.ctid;
    IF r.conname <> e.name THEN
      v_n := v_n + 1;
      EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', r.tbl, r.conname, '_bp_c' || v_n);
      INSERT INTO _bp_con_map VALUES (r.conrelid, '_bp_c' || v_n, e.name);
    END IF;
  END LOOP;
  FOR r IN SELECT m.*, m.conrelid::regclass::text AS tbl FROM _bp_con_map m LOOP
    EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', r.tbl, r.tmp, r.name);
  END LOOP;

  -- Indexes that back no constraint.
  CREATE TEMP TABLE _bp_idx_map (tmp TEXT, name TEXT) ON COMMIT DROP;
  v_n := 0;
  FOR r IN
    SELECT ic.relname, i.indrelid::regclass::text AS tbl,
           regexp_replace(pg_get_indexdef(i.indexrelid), '^(CREATE (UNIQUE )?INDEX )\S+ ', '\1_ ') AS def
    FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
    WHERE ic.relnamespace = 'public'::regnamespace
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid AND c.contype IN ('p', 'u', 'x'))
    ORDER BY i.indexrelid
  LOOP
    SELECT ctid, * INTO e FROM _bp_idx WHERE tbl = r.tbl AND def = r.def AND NOT claimed ORDER BY (name = r.relname) DESC LIMIT 1;
    IF NOT FOUND THEN
      v_extra := array_append(v_extra, 'index ' || r.relname || ' ' || r.def);
      CONTINUE;
    END IF;
    UPDATE _bp_idx SET claimed = true WHERE ctid = e.ctid;
    IF r.relname <> e.name THEN
      v_n := v_n + 1;
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.relname, '_bp_i' || v_n);
      INSERT INTO _bp_idx_map VALUES ('_bp_i' || v_n, e.name);
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM _bp_idx_map LOOP
    EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.tmp, r.name);
  END LOOP;

  -- What the baseline has and the database lacks.
  -- NOT NULL constraints (Postgres 18 catalogs them) come with SET NOT NULL, never added here.
  -- A 4.x constraint whose definition drifted from the 4.x source (an older
  -- CHECK, say) carries the baseline's name once its table prefix is renamed:
  -- it is replaced by the baseline's definition, not kept beside it. If the
  -- data breaks the baseline's rule, ADD CONSTRAINT fails and the upgrade stops.
  FOR e IN SELECT * FROM _bp_con WHERE NOT claimed AND def NOT LIKE 'NOT NULL %' LOOP
    FOR r IN
      SELECT x.ctid AS xid, x.conname FROM _bp_con_extra x JOIN _bp_tbl t ON t.new = x.tbl
      WHERE x.tbl = e.tbl AND split_part(x.def, ' ', 1) = split_part(e.def, ' ', 1)
        AND (x.conname = e.name OR t.old || substr(x.conname, length(t.old) + 1) = x.conname
             AND t.new || substr(x.conname, length(t.old) + 1) = e.name)
    LOOP
      RAISE NOTICE '0500: replacing constraint %.% with the 5.0 definition', e.tbl, r.conname;
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', e.tbl, r.conname);
      DELETE FROM _bp_con_extra WHERE ctid = r.xid;
    END LOOP;
    RAISE NOTICE '0500: adding constraint %.%', e.tbl, e.name;
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', e.tbl, e.name, e.def);
  END LOOP;
  v_extra := v_extra || ARRAY(SELECT tbl || '.' || conname || ' ' || def FROM _bp_con_extra ORDER BY 1);
  FOR e IN SELECT * FROM _bp_idx WHERE NOT claimed LOOP
    RAISE NOTICE '0500: adding index %', e.name;
    EXECUTE replace(e.def, 'INDEX _ ON', format('INDEX %I ON', e.name));
  END LOOP;

  IF array_length(v_extra, 1) > 0 THEN
    RAISE NOTICE '0500: % constraint(s)/index(es) are not in the 5.0 baseline and were left as they are: %',
      array_length(v_extra, 1), array_to_string(v_extra, '; ');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. The 5.0 code, exactly as the baseline defines it, file by file: functions,
--    views, triggers, policies (storage.objects ones included), table and
--    column comments, and the privileges written out in full.
-- ---------------------------------------------------------------------

-- ===================== from supabase/core.sql =====================

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

-- ===================== from supabase/modules/10-source-files.sql =====================

-- ===========================================
-- ENTITY GATES
-- ===========================================
-- org_require_member() closed the functions that take an organization id. It did
-- nothing for the ones that take a file id, a vault id or an ECO id, because
-- those never mention an organization at all - and those are most of the ones
-- that matter. file_checkout, file_checkin, file_move, folder_rename and
-- the workflow entry points each accepted an entity id, looked the row up
-- without reference to who was asking, and acted on it. As anon with no JWT,
-- file_checkout on another organization's file returned {"success": true} with
-- the whole row in it, and file_move then renamed that file.
--
-- The organization is not absent from these calls, only implicit: it is a column
-- on the row being addressed. Resolve it and the same membership rule applies.
--
-- A file that does not exist and a file in another organization produce the
-- identical refusal, for the reason org_require_member() gives: the alternative
-- is an endpoint that reports which ids are real. The JSON-returning RPCs
-- convert that refusal into their existing {"success": false, "error": "... not
-- found"} shape so that api/routes/files.ts keeps answering 404 rather than 500,
-- and so that the two cases stay indistinguishable from outside.
CREATE OR REPLACE FUNCTION file_require_access(p_file_id UUID)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
  v_vault_id UUID;
BEGIN
  IF p_file_id IS NULL THEN
    RAISE EXCEPTION 'File is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM my_actor_id();

  SELECT f.org_id, f.vault_id INTO v_org_id, v_vault_id FROM file f WHERE f.id = p_file_id;

  -- Schema 111: membership is not enough, the caller must also be allowed to see
  -- the file's vault (can_access_vault(), the rule RLS applies to files). A file
  -- in a vault the caller cannot see is refused exactly like a missing one.
  IF v_org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_org_id
  ) OR NOT can_access_vault(v_vault_id) THEN
    RAISE EXCEPTION 'Not authorized for this file'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION vault_require_access(p_vault_id UUID)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF p_vault_id IS NULL THEN
    RAISE EXCEPTION 'Vault is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM my_actor_id();

  SELECT v.org_id INTO v_org_id FROM vault v WHERE v.id = p_vault_id;

  -- Schema 111: and the caller must be allowed to see this vault.
  IF v_org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_org_id
  ) OR NOT can_access_vault(p_vault_id) THEN
    RAISE EXCEPTION 'Not authorized for this vault'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- ===========================================
-- VAULT VISIBILITY (schema 111)
-- ===========================================
-- The vaults whose file data the signed-in user may read, by the rule the
-- renderer has applied since v3.20.0 (getAccessibleVaults in
-- src/lib/supabase/vaults.ts): an organization admin (is_org_admin(), the role
-- column or the Administrators team) reads every vault of their organization;
-- anyone else reads exactly the vaults granted to them directly (vault_access)
-- or through a team (team_vault_access). No grant means no vault. Only vaults of
-- the caller's own organization are ever returned.
--
-- Before 111 this rule lived in the UI only: files, versions, folders and the
-- rest were readable org-wide, and BluePLM Web exposes RLS to a browser with the
-- user's own session. Every file-data SELECT policy now names this helper.
--
-- Argument-less on purpose: a SECURITY DEFINER helper taking a user or vault id
-- is a question about somebody else (check_unbound_entity_args()). Used as
-- `vault_id IN (SELECT my_accessible_vault_ids())`, an uncorrelated subquery the
-- planner evaluates once per statement, so a vault load of tens of thousands of
-- rows pays for it once, not per row.
CREATE OR REPLACE FUNCTION my_accessible_vault_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id
    FROM vault v
    JOIN app_user u ON u.id = auth.uid() AND u.org_id = v.org_id
   WHERE is_org_admin()
      OR EXISTS (SELECT 1 FROM vault_access va WHERE va.vault_id = v.id AND va.user_id = u.id)
      OR EXISTS (
        SELECT 1 FROM team_vault_access tva
        JOIN team_member tm ON tm.team_id = tva.team_id
        WHERE tva.vault_id = v.id AND tm.user_id = u.id
      );
$$;

-- Soft-delete the losing row of every case-colliding pair of active folders.
--
-- WHICH ROW SURVIVES, AND WHY IN THAT ORDER
--
-- Nothing in this schema references folder.id - there is no `REFERENCES
-- folders` anywhere in supabase/ - so no row here is referentially
-- load-bearing, and the choice is entirely about which spelling the rest of the
-- data already agrees with. In order:
--
--   1. the row with the most active files directly beneath it, matched
--      byte-exactly on '<folder_path>/'. Those file rows are what the browser
--      renders, so their spelling is the one the user is already looking at;
--   2. failing that, the oldest created_at - the original row rather than the
--      duplicate a later syncFolder inserted on a case-sensitive miss;
--   3. failing that, the lowest id, so a re-run picks the same survivor.
--
-- The prefix test is written as left(file_path, n) = folder_path || '/' rather
-- than as a LIKE, for two reasons. A folder called `100%` or `Part_Files` fed
-- to LIKE as a pattern counts files it does not contain; and this runs while
-- the schema is being applied, where like_pattern_escape() - the answer
-- folder_rename() uses to that problem - lives in a core.sql this module
-- may be applied over an older copy of.
--
-- Losers are soft-deleted, never hard-deleted, matching every other remediation
-- in this schema. deleted_by is NULL because no user did this, the schema did.
-- Soft-deleting is also what makes the function idempotent: a second run finds
-- no active collisions, writes nothing to the ledger and prints nothing.
--
-- schema_remediation_record() is likewise a core.sql object, so the ledger entry is
-- guarded. The dedupe itself still happens against an older core - only the
-- receipt is skipped, and the count is still returned.
CREATE OR REPLACE FUNCTION folder_remediate_case_collisions()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_subjects JSONB;
  v_rows INTEGER;
BEGIN
  WITH colliding AS (
    SELECT f.id, f.org_id, f.vault_id, f.folder_path, f.created_by, f.created_at,
           LOWER(f.folder_path) AS folder_key,
           (SELECT count(*)
              FROM file fi
             WHERE fi.vault_id = f.vault_id
               AND fi.deleted_at IS NULL
               AND left(fi.file_path, length(f.folder_path) + 1) = f.folder_path || '/'
           ) AS agreeing_files
      FROM folder f
     WHERE f.deleted_at IS NULL
       AND EXISTS (SELECT 1
                     FROM folder g
                    WHERE g.vault_id = f.vault_id
                      AND g.deleted_at IS NULL
                      AND LOWER(g.folder_path) = LOWER(f.folder_path)
                      AND g.id <> f.id)
  ),
  judged AS (
    SELECT c.*,
           first_value(c.id) OVER w         AS surviving_id,
           first_value(c.folder_path) OVER w AS surviving_spelling
      FROM colliding c
    WINDOW w AS (PARTITION BY c.vault_id, c.folder_key
                 ORDER BY c.agreeing_files DESC, c.created_at NULLS LAST, c.id)
  ),
  victims AS (
    SELECT j.id, j.org_id, j.vault_id, j.folder_path, j.created_by, j.created_at,
           j.agreeing_files, j.surviving_id, j.surviving_spelling
      FROM judged j
     WHERE j.id <> j.surviving_id
  ),
  deactivated AS (
    UPDATE folder f
       SET deleted_at = NOW(),
           deleted_by = NULL
      FROM victims v
     WHERE f.id = v.id
    RETURNING f.id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.vault_id, v.folder_path), '[]'::jsonb),
         (SELECT count(*) FROM deactivated)
    INTO v_subjects, v_rows
    FROM victims v;

  IF to_regprocedure('public.schema_remediation_record(text,integer,jsonb,text)') IS NULL THEN
    RETURN COALESCE(v_rows, 0);
  END IF;

  RETURN schema_remediation_record(
    'case_colliding_folders', v_rows, v_subjects,
    'Each row was a second active folders row differing from another only in '
    || 'letter case, which on Windows is the same folder. The surviving row is '
    || 'named in surviving_id and surviving_spelling: it is the spelling the '
    || 'most active files already use, then the oldest, then the lowest id. '
    || 'Nothing was deleted - to bring one back, set deleted_at = NULL on it '
    || 'after renaming it to a path no active row holds, because '
    || 'folder_vault_id_folder_path_idx is now unique on LOWER(folder_path).');
END;
$$;

-- Vaults

-- Schema 111: members of the vault's organization only. USING (true) let any
-- signed-in user of any organization list every organization's vault names.
-- Every member still sees every vault of their own organization (names, not file
-- data): the admin screens and getAccessibleVaults() filter that list.
CREATE POLICY "vault: authenticated users read"
  ON vault FOR SELECT TO authenticated USING (is_org_member(org_id));

CREATE POLICY "vault: admins insert"
  ON vault FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "vault: admins update"
  ON vault FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "vault: admins delete"
  ON vault FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Vault Access
CREATE POLICY "vault_access: users read"
  ON vault_access FOR SELECT
  USING (vault_id IN (SELECT id FROM vault WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "vault_access: admins manage"
  ON vault_access FOR ALL
  USING (vault_id IN (SELECT id FROM vault WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

-- Team Vault Access
CREATE POLICY "team_vault_access: users read"
  ON team_vault_access FOR SELECT
  USING (team_id IN (SELECT id FROM team WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "team_vault_access: admins manage"
  ON team_vault_access FOR ALL
  USING (team_id IN (SELECT id FROM team WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

-- Files
-- Schema 111: file data is readable only in a vault the caller may see
-- (my_accessible_vault_ids(): admins every vault, everyone else their grants;
-- every file has a vault, file.vault_id is NOT NULL since 5.0). Every
-- policy below that exposes a file's name, path, hash or metadata names the
-- helper, directly or through `file_id IN (SELECT f.id FROM file f ...)`, and
-- check_release_residue() refuses to stamp while one that does not remains.
-- Write policies carry the same term, so a file cannot be created in, moved
-- into or changed in a vault the caller cannot see.
CREATE POLICY "file: users read"
  ON file FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND vault_id IN (SELECT my_accessible_vault_ids()));

CREATE POLICY "file: engineers insert"
  ON file FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND vault_id IN (SELECT my_accessible_vault_ids()) AND has_team_permission('module:explorer', 'create'));

-- module:explorer:delete used to be decorative.
--
-- Trashing a file is not a DELETE - it is UPDATE files SET deleted_at - so it
-- was authorized by the 'edit' term here, while the FOR DELETE policy below
-- correctly required 'delete'. An organization that deliberately granted edit
-- and withheld delete had still granted the ability to empty the vault into the
-- trash, which is the only deletion the product's own UI offers.
--
-- The distinction cannot be drawn in USING, which sees the old row. It is drawn
-- in WITH CHECK, which sees the new one: a row that comes out of the statement
-- carrying a deleted_at is a trashed row, and trashing requires 'delete'.
-- Restoring (deleted_at back to NULL, trash.ts:148-153) needs only 'edit',
-- because putting a file back is not a destructive act.
--
-- The rule is stated over the resulting row rather than over the transition, so
-- editing any other column of a file that is *already* in the trash also needs
-- 'delete'. That is deliberate: it is the conservative reading, and the product
-- offers no way to edit a trashed file in the first place.
CREATE POLICY "file: engineers update"
  ON file FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND vault_id IN (SELECT my_accessible_vault_ids()) AND has_team_permission('module:explorer', 'edit'))
  WITH CHECK (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    AND vault_id IN (SELECT my_accessible_vault_ids())
    AND has_team_permission('module:explorer', 'edit')
    AND (deleted_at IS NULL OR has_team_permission('module:explorer', 'delete'))
  );

CREATE POLICY "file: admins delete"
  ON file FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND vault_id IN (SELECT my_accessible_vault_ids()) AND has_team_permission('module:explorer', 'delete'));

-- File Versions
CREATE POLICY "file_version: users read"
  ON file_version FOR SELECT
  USING (file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

CREATE POLICY "file_version: engineers manage"
  ON file_version FOR ALL
  USING (file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())) AND has_team_permission('module:explorer', 'edit'));

-- Release Files
CREATE POLICY "release_file: users read"
  ON release_file FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

CREATE POLICY "release_file: engineers manage"
  ON release_file FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())) AND has_team_permission('module:explorer', 'edit'));

-- File References
CREATE POLICY "file_reference: users read"
  ON file_reference FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND parent_file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

CREATE POLICY "file_reference: engineers manage"
  ON file_reference FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND parent_file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())) AND has_team_permission('module:explorer', 'edit'));

-- Per-version references and drawing PDF renders (schema 107): read-only to
-- clients. file_version_reference_record() and drawing_pdf_render_record() are the writers,
-- because both resolve something the client must not be trusted to supply (which
-- child version a hash belongs to; whether a render may be replaced).
CREATE POLICY "file_version_reference: users read"
  ON file_version_reference FOR SELECT
  TO authenticated
  USING (is_org_member(org_id) AND parent_file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

CREATE POLICY "drawing_pdf_render: users read"
  ON drawing_pdf_render FOR SELECT
  TO authenticated
  USING (is_org_member(org_id) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

-- Folders
CREATE POLICY "folder: users read"
  ON folder FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND vault_id IN (SELECT my_accessible_vault_ids()));

CREATE POLICY "folder: engineers insert"
  ON folder FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND vault_id IN (SELECT my_accessible_vault_ids()) AND has_team_permission('module:explorer', 'create'));

CREATE POLICY "folder: engineers update"
  ON folder FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND vault_id IN (SELECT my_accessible_vault_ids()) AND has_team_permission('module:explorer', 'edit'));

CREATE POLICY "folder: engineers delete"
  ON folder FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND vault_id IN (SELECT my_accessible_vault_ids()) AND has_team_permission('module:explorer', 'delete'));

-- Activity
CREATE POLICY "activity: users read"
  ON activity FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND (file_id IS NULL OR file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids()))));

CREATE POLICY "activity: users insert"
  ON activity FOR INSERT
  -- Schema 112: the row names its author, and the author is the caller.
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND user_id = auth.uid());

-- Workflow Templates
CREATE POLICY "workflow_template: users read"
  ON workflow_template FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "workflow_template: admins insert"
  ON workflow_template FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "workflow_template: admins update"
  ON workflow_template FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "workflow_template: admins delete"
  ON workflow_template FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Workflow States
CREATE POLICY "workflow_state: users read"
  ON workflow_state FOR SELECT
  USING (workflow_id IN (SELECT id FROM workflow_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "workflow_state: admins manage"
  ON workflow_state FOR ALL
  USING (workflow_id IN (SELECT id FROM workflow_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

-- Workflow Transitions
CREATE POLICY "workflow_transition: users read"
  ON workflow_transition FOR SELECT
  USING (workflow_id IN (SELECT id FROM workflow_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "workflow_transition: admins manage"
  ON workflow_transition FOR ALL
  USING (workflow_id IN (SELECT id FROM workflow_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

-- Workflow Gates
CREATE POLICY "workflow_gate: users read"
  ON workflow_gate FOR SELECT
  USING (transition_id IN (SELECT id FROM workflow_transition WHERE workflow_id IN (SELECT id FROM workflow_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()))));

CREATE POLICY "workflow_gate: admins manage"
  ON workflow_gate FOR ALL
  USING (transition_id IN (SELECT id FROM workflow_transition WHERE workflow_id IN (SELECT id FROM workflow_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()))) AND is_org_admin());

-- Gate Reviewers
CREATE POLICY "workflow_gate_reviewer: users read"
  ON workflow_gate_reviewer FOR SELECT
  USING (gate_id IN (SELECT id FROM workflow_gate WHERE transition_id IN (SELECT id FROM workflow_transition WHERE workflow_id IN (SELECT id FROM workflow_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())))));

CREATE POLICY "workflow_gate_reviewer: admins manage"
  ON workflow_gate_reviewer FOR ALL
  USING (gate_id IN (SELECT id FROM workflow_gate WHERE transition_id IN (SELECT id FROM workflow_transition WHERE workflow_id IN (SELECT id FROM workflow_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())))) AND is_org_admin());

-- Workflow Roles
CREATE POLICY "workflow_role: users read"
  ON workflow_role FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "workflow_role: admins manage"
  ON workflow_role FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- User Workflow Roles
CREATE POLICY "user_workflow_role: users read"
  ON user_workflow_role FOR SELECT
  USING (user_id IN (SELECT id FROM app_user WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "user_workflow_role: admins manage"
  ON user_workflow_role FOR ALL
  USING (user_id IN (SELECT id FROM app_user WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

-- File Workflow Assignments
CREATE POLICY "file_workflow_assignment: users read"
  ON file_workflow_assignment FOR SELECT
  USING (file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

CREATE POLICY "file_workflow_assignment: engineers manage"
  ON file_workflow_assignment FOR ALL
  USING (file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())) AND has_team_permission('module:workflows', 'edit'));

-- Pending Reviews
CREATE POLICY "workflow_gate_review: users read"
  ON workflow_gate_review FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

-- Schema 105: no client writes at all. Gate review rows are created by
-- workflow_transition_execute() and decided by gate_review_complete(), both
-- SECURITY DEFINER, which do not pass through these policies.
--
-- The INSERT policy let a module:reviews:create member insert a row already
-- 'approved', and the UPDATE policy let a module:reviews:edit member set any
-- pending row of the organization to 'approved' with reviewed_by = self. Neither
-- advanced the file directly, but gate_review_complete() counted such rows as
-- approvals, so both were a way around can_review_gate(), the assignment and the
-- history row. Dropping the policies leaves RLS denying both.

-- Workflow Review History
CREATE POLICY "workflow_review_history: users read"
  ON workflow_review_history FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND (file_id IS NULL OR file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids()))));

-- Schema 105: the approval audit trail is written only by gate_review_complete().
-- The INSERT policy this replaces checked organization membership alone, so any
-- member could write a row claiming anyone approved anything.

-- Workflow History
-- Append-only audit trail: anyone in the org can read it, the engine writes it,
-- and nobody can rewrite or erase it (no UPDATE or DELETE policy).
CREATE POLICY "workflow_history: users read"
  ON workflow_history FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND (file_id IS NULL OR file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids()))));

CREATE POLICY "workflow_history: users insert"
  ON workflow_history FOR INSERT
  -- Schema 112: performed_by is the caller (the engine writes as definer).
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND performed_by = auth.uid());

-- File State Entries
-- Scoped through the file, which carries the org id.
CREATE POLICY "file_state_entry: users read"
  ON file_state_entry FOR SELECT
  USING (file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

CREATE POLICY "file_state_entry: users insert"
  ON file_state_entry FOR INSERT
  -- Schema 112: entered_by is the caller.
  WITH CHECK (
    file_id IN (SELECT id FROM file WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()))
    AND entered_by = auth.uid()
  );

CREATE POLICY "file_state_entry: users update"
  ON file_state_entry FOR UPDATE
  USING (file_id IN (SELECT id FROM file WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())))
  -- Schema 112: closing an entry records the caller, and only closes it: who
  -- entered and when stay as written.
  WITH CHECK (
    file_id IN (SELECT id FROM file WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()))
    AND exited_by = auth.uid()
    AND entered_by IS NOT DISTINCT FROM (SELECT e.entered_by FROM file_state_entry e WHERE e.id = file_state_entry.id)
  );

-- File Watchers
CREATE POLICY "file_watcher: users read"
  ON file_watcher FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

CREATE POLICY "file_watcher: users insert"
  ON file_watcher FOR INSERT
  WITH CHECK (user_id = auth.uid() AND org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "file_watcher: users update own"
  ON file_watcher FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "file_watcher: users delete"
  ON file_watcher FOR DELETE USING (user_id = auth.uid());

-- File Share Links
CREATE POLICY "file_share_link: users read"
  ON file_share_link FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

-- THE ARGUMENT THAT IS CHECKED MUST BE THE ARGUMENT THAT SELECTS THE ROW
--
-- file_share_link_create() had this exact defect and it was fixed there in v91
-- by deriving the organization from the file. The table path kept it: org_id
-- was constrained and file_id was not, so a member of org A inserted
-- {org_id: A, file_id: <org B's file>} and minted a working token for another
-- tenant's file. anon file_share_link_validate() then answered is_valid: true with
-- the victim's file_id and org_id, and file_share_link_consume() spent a download.
--
-- Three terms, and each one is load-bearing:
--   org_id      - the link is filed under an organization the caller belongs to
--   file_id     - and it points at a file in *that same* organization, which is
--                 what makes link_org = file_org = caller_org true by
--                 construction rather than by the SELECT policy happening to
--                 hide the result
--   created_by  - the audit row names whoever actually inserted it.
--                 file_share_link_remediate_cross_tenant() reads created_by to tell
--                 a link minted through the hole from one minted in good faith
--                 for a file that later moved, and until now the column it read
--                 was whatever the request body said.
CREATE POLICY "file_share_link: engineers insert"
  ON file_share_link FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    AND has_team_permission('module:explorer', 'create')
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM file f
       WHERE f.id = file_share_link.file_id
         AND f.org_id = file_share_link.org_id
    )
  );

-- REVOCATION IS THE ONLY UPDATE THERE IS
--
-- The policy was FOR UPDATE USING (created_by = auth.uid()) and nothing else,
-- which reuses that expression as the check and so constrains only who owns the
-- row - not what the row becomes. Two things followed. A viewer could repoint
-- file_id on their own link at another tenant's file, reaching over UPDATE what
-- the INSERT policy above refuses over INSERT; and anyone could re-activate a
-- link a remediation or an administrator had just deactivated, because
-- is_active appeared in neither clause. org_id was not reachable in practice,
-- but only because PostgREST could not read the row back afterwards - the
-- SELECT policy, not this one.
--
-- Nothing in the application updates this table: share links are created by
-- shareLinks.ts and spent by file_share_link_consume(), which is SECURITY DEFINER
-- and does not pass through RLS. The only update the product has ever needed is
-- "revoke this link", so that is the only one admitted, and it is expressed as
-- a property of the resulting row rather than as a list of columns nobody may
-- touch. The three identity terms are repeated in the check so that they pin
-- the new row as well as select the old one.
--
-- ONE CONSEQUENCE, WEIGHED AND ACCEPTED
--
-- A link that is *already* cross-tenant fails the file/org term, so its creator
-- cannot deactivate it through this policy. Three things make that the right
-- trade. They can still remove it - the DELETE policy below asks only who
-- created it. Applying this release deactivates every such link on the way in,
-- via file_share_link_remediate_cross_tenant(), so the stuck state is cleared by
-- the same upgrade that creates it. And the alternative - dropping the term
-- because "the row ends up inactive anyway, so repointing file_id is harmless"
-- - is the same reasoning that left org_id reachable here in the first place: a
-- clause held safe by a property some other clause happens to enforce.
CREATE POLICY "file_share_link: users update own"
  ON file_share_link FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    AND org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM file f
       WHERE f.id = file_share_link.file_id
         AND f.org_id = file_share_link.org_id
    )
    AND NOT COALESCE(is_active, false)
  );

CREATE POLICY "file_share_link: users delete"
  ON file_share_link FOR DELETE
  -- Schema 112: inside the caller's organization. is_org_admin() alone let an
  -- admin of one organization delete another organization's links.
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND (created_by = auth.uid() OR is_org_admin()));

-- File Comments
CREATE POLICY "file_comment: users read"
  ON file_comment FOR SELECT
  USING (file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

-- Schema 105: the file must be in the author's organization. The INSERT check
-- tested only user_id = auth.uid(), so a member could comment on another
-- organization's file, and UPDATE (no WITH CHECK) let the author re-point
-- file_id anywhere. trg_file_comment_check_integrity() below also pins file_id and keeps a
-- reply on its parent's file.
CREATE POLICY "file_comment: users insert"
  ON file_comment FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND file_id IN (SELECT id FROM file WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()))
  );

CREATE POLICY "file_comment: users update own"
  ON file_comment FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND file_id IN (SELECT id FROM file WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()))
  );

CREATE POLICY "file_comment: users delete own"
  ON file_comment FOR DELETE USING (user_id = auth.uid());

-- What a policy cannot say about file_comment, because it sees only one row:
-- a reply must sit on its parent's file, and a comment cannot be moved to another
-- file once written. Review links (review_id / review_round / review_item_id) are
-- validated by a second trigger in 20-change-control.sql, where reviews live.
CREATE OR REPLACE FUNCTION trg_file_comment_check_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.file_id IS DISTINCT FROM OLD.file_id THEN
    RAISE EXCEPTION 'A comment cannot be moved to another file'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM file_comment p WHERE p.id = NEW.parent_id AND p.file_id = NEW.file_id
  ) THEN
    RAISE EXCEPTION 'A reply must be on the same file as the comment it answers'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_file_comment_check_integrity
  BEFORE INSERT OR UPDATE ON file_comment
  FOR EACH ROW EXECUTE FUNCTION trg_file_comment_check_integrity();

-- File Metadata Columns
CREATE POLICY "file_metadata_column: users read"
  ON file_metadata_column FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "file_metadata_column: admins insert"
  ON file_metadata_column FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "file_metadata_column: admins update"
  ON file_metadata_column FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "file_metadata_column: admins delete"
  ON file_metadata_column FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Backup Config
-- Schema 112: admins only. The row holds the backup bucket's access key, secret
-- key and the restic repository password in plaintext (the *_encrypted names are
-- historical), and every member could read them - which is read and delete
-- access to every backup of the organization. Running, designating and restoring
-- were already admin-only (UPDATE is admin-only). Members see the status, without
-- the secrets, through backup_get_status().
CREATE POLICY "backup_config: users read"
  ON backup_config FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "backup_config: admins insert"
  ON backup_config FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "backup_config: admins update"
  ON backup_config FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "backup_config: admins delete"
  ON backup_config FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Backup History
CREATE POLICY "backup_history: users read"
  ON backup_history FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

-- Schema 112: admins only (backups are run from an admin's designated machine).
-- Any member could rewrite or erase the record of what was backed up.
CREATE POLICY "backup_history: system manage"
  ON backup_history FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin())
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Backup Machines
CREATE POLICY "backup_machine: users read"
  ON backup_machine FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "backup_machine: users manage own"
  ON backup_machine FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND (user_id = auth.uid() OR is_org_admin()));

-- Backup Locks
CREATE POLICY "backup_lock: users read"
  ON backup_lock FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

-- Schema 112: admins only, as backup_history; a member could hold or break the lock.
CREATE POLICY "backup_lock: users manage"
  ON backup_lock FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin())
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- The caller's organization's backup configuration without its three secrets,
-- plus whether they are set (schema 112). Argument-less: the organization is the
-- caller's own. NULL when there is no configuration or no organization.
CREATE OR REPLACE FUNCTION backup_get_status()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(bc)
           - 'access_key_encrypted' - 'secret_key_encrypted' - 'restic_password_encrypted'
           || jsonb_build_object(
                'credentials_set',
                bc.access_key_encrypted IS NOT NULL AND bc.access_key_encrypted <> ''
                AND bc.restic_password_encrypted IS NOT NULL AND bc.restic_password_encrypted <> '')
    FROM backup_config bc
    JOIN app_user u ON u.id = auth.uid() AND u.org_id = bc.org_id;
$$;

-- Log file activity
CREATE OR REPLACE FUNCTION trg_file_log_activity()
RETURNS TRIGGER AS $$
DECLARE
  action_type activity_action;
  activity_details JSONB := '{}'::jsonb;
  user_email_val TEXT;
BEGIN
  SELECT email INTO user_email_val FROM app_user WHERE id = auth.uid();
  IF user_email_val IS NULL THEN user_email_val := 'system'; END IF;
  
  IF TG_OP = 'INSERT' THEN
    action_type := 'create';
    activity_details := jsonb_build_object('file_name', NEW.file_name, 'file_path', NEW.file_path);
    INSERT INTO activity (org_id, file_id, user_id, user_email, action, details)
    VALUES (NEW.org_id, NEW.id, COALESCE(auth.uid(), NEW.created_by), user_email_val, action_type, activity_details);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.checked_out_by IS NULL AND NEW.checked_out_by IS NOT NULL THEN
      action_type := 'checkout';
      activity_details := jsonb_build_object('message', NEW.lock_message);
    ELSIF OLD.checked_out_by IS NOT NULL AND NEW.checked_out_by IS NULL THEN
      action_type := 'checkin';
      activity_details := jsonb_build_object('old_version', OLD.version, 'new_version', NEW.version);
    ELSIF OLD.state IS DISTINCT FROM NEW.state THEN
      action_type := 'state_change';
      activity_details := jsonb_build_object('old_state', OLD.state, 'new_state', NEW.state);
    ELSIF OLD.revision IS DISTINCT FROM NEW.revision THEN
      action_type := 'revision_change';
      activity_details := jsonb_build_object('old_revision', OLD.revision, 'new_revision', NEW.revision);
    ELSIF OLD.file_path IS DISTINCT FROM NEW.file_path THEN
      action_type := 'move';
      activity_details := jsonb_build_object('old_path', OLD.file_path, 'new_path', NEW.file_path);
    ELSIF OLD.file_name IS DISTINCT FROM NEW.file_name THEN
      action_type := 'rename';
      activity_details := jsonb_build_object('old_name', OLD.file_name, 'new_name', NEW.file_name);
    ELSE
      RETURN NEW;
    END IF;
    INSERT INTO activity (org_id, file_id, user_id, user_email, action, details)
    VALUES (NEW.org_id, NEW.id, COALESCE(auth.uid(), NEW.updated_by), user_email_val, action_type, activity_details);
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'delete';
    activity_details := jsonb_build_object('file_name', OLD.file_name, 'file_path', OLD.file_path);
    INSERT INTO activity (org_id, file_id, user_id, user_email, action, details)
    VALUES (OLD.org_id, NULL, auth.uid(), user_email_val, action_type, activity_details);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Activity logging failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_file_log_activity
  AFTER INSERT OR UPDATE OR DELETE ON file
  FOR EACH ROW EXECUTE FUNCTION trg_file_log_activity();

-- Create default workflow
CREATE OR REPLACE FUNCTION workflow_create_default(p_org_id UUID)
RETURNS UUID AS $$
DECLARE
  v_workflow_id UUID;
  v_created_by UUID;
  v_wip_state_id UUID;
  v_review_state_id UUID;
  v_released_state_id UUID;
  v_obsolete_state_id UUID;
BEGIN
  PERFORM org_require_member(p_org_id);

  -- Schema 112: creating a workflow is an admin act (the workflow_template INSERT
  -- policy says so; this function writes as definer and bypassed it), and the
  -- author is the caller.
  IF NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only admins can create workflows'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_created_by := my_actor_id();

  INSERT INTO workflow_template (org_id, name, description, is_default, created_by)
  VALUES (p_org_id, 'Standard Release Process', 'Default workflow for releasing engineering files', true, v_created_by)
  RETURNING id INTO v_workflow_id;
  
  INSERT INTO workflow_state (workflow_id, name, label, color, icon, position_x, position_y, is_editable, is_checkout_required, sort_order)
  VALUES (v_workflow_id, 'WIP', 'Work In Progress', '#EAB308', 'pencil', 100, 200, true, true, 1)
  RETURNING id INTO v_wip_state_id;
  
  INSERT INTO workflow_state (workflow_id, name, label, color, icon, position_x, position_y, is_editable, is_checkout_required, sort_order)
  VALUES (v_workflow_id, 'In Review', 'In Review', '#3B82F6', 'eye', 350, 200, false, false, 2)
  RETURNING id INTO v_review_state_id;
  
  INSERT INTO workflow_state (workflow_id, name, label, color, icon, position_x, position_y, is_editable, is_checkout_required, is_revision_auto_incremented, sort_order)
  VALUES (v_workflow_id, 'Released', 'Released', '#22C55E', 'check-circle', 600, 200, false, false, true, 3)
  RETURNING id INTO v_released_state_id;
  
  INSERT INTO workflow_state (workflow_id, name, label, color, icon, position_x, position_y, is_editable, is_checkout_required, sort_order)
  VALUES (v_workflow_id, 'Obsolete', 'Obsolete', '#6B7280', 'archive', 600, 350, false, false, 4)
  RETURNING id INTO v_obsolete_state_id;
  
  INSERT INTO workflow_transition (workflow_id, from_state_id, to_state_id, name, line_style) VALUES
    (v_workflow_id, v_wip_state_id, v_review_state_id, 'Submit for Review', 'solid'),
    (v_workflow_id, v_review_state_id, v_released_state_id, 'Approve', 'solid'),
    (v_workflow_id, v_review_state_id, v_wip_state_id, 'Reject', 'dashed'),
    (v_workflow_id, v_released_state_id, v_wip_state_id, 'Revise', 'dashed'),
    (v_workflow_id, v_released_state_id, v_obsolete_state_id, 'Obsolete', 'dotted');
  
  RETURN v_workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get available transitions
CREATE OR REPLACE FUNCTION workflow_transition_list_available(p_file_id UUID)
RETURNS TABLE (
  transition_id UUID,
  transition_name TEXT,
  to_state_id UUID,
  to_state_name TEXT,
  to_state_color TEXT,
  has_gates BOOLEAN,
  user_can_transition BOOLEAN
) AS $$
DECLARE
  v_current_state_id UUID;
  v_actor UUID;
BEGIN
  -- The answer is "what may *you* do to this file"; the caller never names the
  -- subject, which would turn it into "what may anyone do".
  v_actor := my_actor_id();
  PERFORM file_require_access(p_file_id);

  SELECT fwa.current_state_id INTO v_current_state_id
  FROM file_workflow_assignment fwa WHERE fwa.file_id = p_file_id;
  
  IF v_current_state_id IS NULL THEN RETURN; END IF;
  
  RETURN QUERY
  SELECT 
    wt.id, wt.name, ws.id, ws.name, ws.color,
    EXISTS(SELECT 1 FROM workflow_gate wg WHERE wg.transition_id = wt.id),
    can_run_transition(v_actor, wt.id)
  FROM workflow_transition wt
  JOIN workflow_state ws ON wt.to_state_id = ws.id
  WHERE wt.from_state_id = v_current_state_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Replace a workflow's whole graph from an exported payload.
--
-- Importing used to be three unrelated round trips from the client: delete the
-- transitions, delete the states, then re-create them one by one. Any failure
-- part-way left the workflow empty. Doing it inside one function makes it a
-- single transaction, so either the new graph lands complete or the old one is
-- still there untouched.
CREATE OR REPLACE FUNCTION workflow_import_graph(p_workflow_id UUID, p_payload JSONB)
RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_state JSONB;
  v_transition JSONB;
  v_gate JSONB;
  v_key_map JSONB := '{}'::jsonb;
  v_state_id UUID;
  v_transition_id UUID;
  v_from_id UUID;
  v_to_id UUID;
  v_state_count INTEGER := 0;
  v_transition_count INTEGER := 0;
  v_gate_count INTEGER := 0;
BEGIN
  SELECT org_id INTO v_org_id FROM workflow_template WHERE id = p_workflow_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Workflow not found';
  END IF;

  -- `v_org_id <> (SELECT org_id FROM users WHERE id = auth.uid())` is NULL when
  -- the caller has no organization, so the OR fell through to is_org_admin(),
  -- which is false for such a user - safe, but only by accident of the
  -- neighbouring condition. Made sound on its own.
  IF NOT is_org_member(v_org_id) OR NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only organization admins can import a workflow';
  END IF;

  IF jsonb_typeof(p_payload->'states') <> 'array' THEN
    RAISE EXCEPTION 'Payload is missing a states array';
  END IF;

  DELETE FROM workflow_transition WHERE workflow_id = p_workflow_id;
  DELETE FROM workflow_state WHERE workflow_id = p_workflow_id;

  FOR v_state IN SELECT * FROM jsonb_array_elements(p_payload->'states') LOOP
    INSERT INTO workflow_state (
      workflow_id, state_type, shape, name, label, description,
      color, fill_opacity, border_color, border_opacity, border_thickness, corner_radius,
      icon, position_x, position_y, width, height,
      is_editable, is_checkout_required, is_revision_auto_incremented,
      required_workflow_roles, is_review_stage, sort_order
    ) VALUES (
      p_workflow_id,
      COALESCE((v_state->>'state_type')::state_type, 'state'),
      COALESCE((v_state->>'shape')::state_shape, 'rectangle'),
      v_state->>'name',
      v_state->>'label',
      v_state->>'description',
      COALESCE(v_state->>'color', '#6B7280'),
      COALESCE((v_state->>'fill_opacity')::decimal, 1.0),
      v_state->>'border_color',
      COALESCE((v_state->>'border_opacity')::decimal, 1.0),
      COALESCE((v_state->>'border_thickness')::integer, 2),
      COALESCE((v_state->>'corner_radius')::integer, 8),
      COALESCE(v_state->>'icon', 'circle'),
      COALESCE((v_state->>'position_x')::integer, 0),
      COALESCE((v_state->>'position_y')::integer, 0),
      COALESCE((v_state->>'width')::integer, 120),
      COALESCE((v_state->>'height')::integer, 60),
      COALESCE((v_state->>'is_editable')::boolean, true),
      COALESCE((v_state->>'is_checkout_required')::boolean, (v_state->>'requires_checkout')::boolean, true),
      COALESCE((v_state->>'is_revision_auto_incremented')::boolean, (v_state->>'auto_increment_revision')::boolean, false),
      '{}',
      COALESCE((v_state->>'is_review_stage')::boolean, (v_state->>'triggers_review')::boolean, false),
      COALESCE((v_state->>'sort_order')::integer, v_state_count)
    ) RETURNING id INTO v_state_id;

    v_key_map := v_key_map || jsonb_build_object(v_state->>'key', v_state_id::text);
    v_state_count := v_state_count + 1;
  END LOOP;

  -- A review stage names, by key, where an approval moves files (schema 110). Resolved once
  -- every state has its new id; a key that is not in the payload leaves it unset.
  UPDATE workflow_state ws
  SET review_approved_state_id = (v_key_map->>(x.st->>'review_approved'))::uuid
  FROM jsonb_array_elements(p_payload->'states') AS x(st)
  WHERE ws.id = (v_key_map->>(x.st->>'key'))::uuid
    AND x.st->>'review_approved' IS NOT NULL
    AND v_key_map ? (x.st->>'review_approved');

  IF jsonb_typeof(p_payload->'transitions') = 'array' THEN
    FOR v_transition IN SELECT * FROM jsonb_array_elements(p_payload->'transitions') LOOP
      v_from_id := (v_key_map->>(v_transition->>'from'))::uuid;
      v_to_id := (v_key_map->>(v_transition->>'to'))::uuid;

      IF v_from_id IS NULL OR v_to_id IS NULL THEN
        RAISE EXCEPTION 'Transition references a state that is not in the payload';
      END IF;

      INSERT INTO workflow_transition (
        workflow_id, from_state_id, to_state_id, name, description,
        line_style, line_color, line_path_type, line_arrow_head, line_thickness,
        auto_conditions,
        start_edge, start_fraction, end_edge, end_fraction, waypoints, label_offset, label_pinned
      ) VALUES (
        p_workflow_id, v_from_id, v_to_id,
        v_transition->>'name',
        v_transition->>'description',
        COALESCE((v_transition->>'line_style')::transition_line_style, 'solid'),
        v_transition->>'line_color',
        COALESCE((v_transition->>'line_path_type')::transition_path_type, 'spline'),
        COALESCE((v_transition->>'line_arrow_head')::transition_arrow_head, 'end'),
        COALESCE((v_transition->>'line_thickness')::integer, 2),
        v_transition->'auto_conditions',
        (v_transition->>'start_edge')::transition_edge,
        (v_transition->>'start_fraction')::decimal,
        (v_transition->>'end_edge')::transition_edge,
        (v_transition->>'end_fraction')::decimal,
        COALESCE(v_transition->'waypoints', '[]'::jsonb),
        v_transition->'label_offset',
        v_transition->'label_pinned'
      ) RETURNING id INTO v_transition_id;

      v_transition_count := v_transition_count + 1;

      IF jsonb_typeof(v_transition->'gates') = 'array' THEN
        FOR v_gate IN SELECT * FROM jsonb_array_elements(v_transition->'gates') LOOP
          INSERT INTO workflow_gate (
            transition_id, name, description, gate_type, required_approvals,
            approval_mode, checklist_items, conditions, is_blocking, can_be_skipped_by, sort_order
          ) VALUES (
            v_transition_id,
            v_gate->>'name',
            v_gate->>'description',
            COALESCE((v_gate->>'gate_type')::gate_type, 'approval'),
            COALESCE((v_gate->>'required_approvals')::integer, 1),
            COALESCE((v_gate->>'approval_mode')::approval_mode, 'any'),
            COALESCE(v_gate->'checklist_items', '[]'::jsonb),
            v_gate->'conditions',
            COALESCE((v_gate->>'is_blocking')::boolean, true),
            COALESCE(
              ARRAY(SELECT jsonb_array_elements_text(v_gate->'can_be_skipped_by'))::user_role[],
              '{}'::user_role[]
            ),
            COALESCE((v_gate->>'sort_order')::integer, v_gate_count)
          );

          v_gate_count := v_gate_count + 1;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'state_count', v_state_count,
    'transition_count', v_transition_count,
    'gate_count', v_gate_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Generate share token
--
-- The token is the entire credential for an anonymous download, so it has to be
-- unguessable. It was twelve characters drawn from random(), which is a
-- deterministic PRNG seeded per session: not a secret generator, and 12 chars
-- of it is a small space to walk anyway.
--
-- gen_random_uuid() is backed by the server's strong random source in Postgres
-- 13+, which is what pgcrypto's gen_random_bytes() uses too. It is preferred
-- here only because it needs no schema qualification: pgcrypto lives in the
-- extensions schema on Supabase and in public elsewhere, and a SECURITY DEFINER
-- function should not be relying on search_path to find it.
CREATE OR REPLACE FUNCTION file_share_link_generate_token()
RETURNS TEXT AS $$
  -- 32 hex characters, 128 bits.
  SELECT replace(gen_random_uuid()::text, '-', '');
$$ LANGUAGE sql VOLATILE;

CREATE OR REPLACE FUNCTION file_share_link_create(
  p_org_id UUID, p_file_id UUID, p_created_by UUID,
  p_expires_in_days INTEGER DEFAULT NULL,
  p_max_downloads INTEGER DEFAULT NULL,
  p_require_auth BOOLEAN DEFAULT false
)
RETURNS TABLE (link_id UUID, token TEXT, expires_at TIMESTAMPTZ) AS $$
DECLARE
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_link_id UUID;
  v_file_org_id UUID;
BEGIN
  -- The gate is on the file, not on p_org_id.
  --
  -- This function took two ids and checked one of them. org_require_member(
  -- p_org_id) confirmed the caller belongs to the organization they named, and
  -- then p_file_id was inserted without ever being compared to it. An
  -- authenticated member of any organization could pass their own org id - so
  -- the gate was satisfied honestly - together with a file id belonging to
  -- somebody else, and receive a working token for that file. Redeeming it as
  -- anon returned is_valid = true. Both of the release's checks certified this
  -- function as correct: the manifest saw 'org_require_member' in the source,
  -- and check_org_gates() called it with a foreign p_org_id and was refused,
  -- which is true and beside the point.
  --
  -- The general shape is: a gate on one argument while a second argument selects
  -- the row. Whenever a function is reached through an entity id, the
  -- organization has to be *derived from that entity*, and the argument that
  -- names an organization is at best redundant. file_require_access() does the
  -- derivation and raises if the caller is not a member of the file's org.
  v_file_org_id := file_require_access(p_file_id);

  -- p_org_id is now only accepted if it agrees. It is kept in the signature so
  -- existing callers keep working, but it decides nothing; disagreeing with it
  -- is refused rather than ignored, so a caller that believed it was scoping the
  -- request is told it was not.
  IF p_org_id IS NOT NULL AND p_org_id <> v_file_org_id THEN
    RAISE EXCEPTION 'File does not belong to that organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  LOOP
    v_token := file_share_link_generate_token();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM file_share_link WHERE file_share_link.token = v_token);
  END LOOP;
  
  IF p_expires_in_days IS NOT NULL THEN
    v_expires_at := NOW() + (p_expires_in_days || ' days')::interval;
  END IF;
  
  -- org_id is the file's, and created_by is whoever actually called, not
  -- whoever the request body named.
  INSERT INTO file_share_link (org_id, file_id, token, created_by, expires_at, max_downloads, is_auth_required)
  VALUES (v_file_org_id, p_file_id, v_token, my_actor_id(), v_expires_at, p_max_downloads, p_require_auth)
  RETURNING id INTO v_link_id;
  
  RETURN QUERY SELECT v_link_id, v_token, v_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- WHO MAY REDEEM THIS LINK, ASKED ONCE
--
-- file_share_link_validate() and file_share_link_consume() are two HTTP round trips with
-- one admission decision between them, and nothing forces a caller to make the
-- first. If consume admits somebody validate refuses, the download the refusal
-- was protecting happens anyway - so the two must agree about every condition,
-- not merely about the one somebody remembered to check twice.
--
-- They did not. Each restated the conditions in its own dialect: validate as a
-- sequence of early returns, consume as a WHERE clause. The file test -
-- `f.deleted_at IS NULL` - existed in both, and in consume it sat *inside* the
-- is_auth_required branch, so with is_auth_required = false and the file soft-deleted
-- between minting and use, validate answered `is_valid = f, 'Link not found'`
-- and consume answered `t` and incremented download_count. Executed, both of
-- them, over HTTP.
--
-- The manifest tried to hold the two together by requiring the same words in
-- each - 'is_auth_required && is_org_member' on both - and that passed the whole
-- time. Two lists that must agree should not be two lists. This is the list.
--
-- Everything except the download counter is decided here. The counter is
-- deliberately left out: it is the only condition with a race in it, and
-- consume re-checks it inside its UPDATE, under the row lock, so two concurrent
-- redemptions of the last download cannot both win.
CREATE OR REPLACE FUNCTION file_share_link_admit(p_token TEXT)
RETURNS TABLE (is_valid BOOLEAN, file_id UUID, org_id UUID, file_version INTEGER, error_message TEXT) AS $$
DECLARE
  v_link RECORD;
  v_file_org_id UUID;
BEGIN
  SELECT * INTO v_link FROM file_share_link WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::boolean, NULL::uuid, NULL::uuid, NULL::integer, 'Link not found'::text;
    RETURN;
  END IF;

  IF NOT v_link.is_active THEN
    RETURN QUERY SELECT false::boolean, NULL::uuid, NULL::uuid, NULL::integer, 'Link has been deactivated'::text;
    RETURN;
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < NOW() THEN
    RETURN QUERY SELECT false::boolean, NULL::uuid, NULL::uuid, NULL::integer, 'Link has expired'::text;
    RETURN;
  END IF;

  IF v_link.max_downloads IS NOT NULL AND v_link.download_count >= v_link.max_downloads THEN
    RETURN QUERY SELECT false::boolean, NULL::uuid, NULL::uuid, NULL::integer, 'Download limit reached'::text;
    RETURN;
  END IF;

  -- The file has to still be there, whatever is_auth_required says. A link is a
  -- pointer at a file; a deleted file is a link to nothing, and serving one is
  -- serving something whose owner has already said to stop serving it.
  --
  -- This test is also what resolves the organization, and it is placed before
  -- is_auth_required is read because is_auth_required is a question *about* that
  -- organization.
  SELECT f.org_id INTO v_file_org_id FROM file f
   WHERE f.id = v_link.file_id AND f.deleted_at IS NULL;

  IF v_file_org_id IS NULL THEN
    RETURN QUERY SELECT false::boolean, NULL::uuid, NULL::uuid, NULL::integer, 'Link not found'::text;
    RETURN;
  END IF;

  -- WHAT is_auth_required MEANS
  --
  -- A member of the organization that owns the file. Not "any Supabase
  -- account", which is what `auth.uid() IS NOT NULL` meant and which is not a
  -- restriction at all: signing up is free and open, so an attacker holding the
  -- token defeated the flag by creating an account. Executed against the
  -- version before last, a member of an unrelated tenant and an account
  -- belonging to no organization at all both got is_valid: true with the file
  -- id and the owning org id.
  --
  -- The flag exists so that a link can be circulated inside a company without
  -- becoming a bearer credential for the world; org membership is the only
  -- reading of it that delivers that. A link intended for an outside recipient
  -- is a link created with is_auth_required = false, which is the default.
  --
  -- COALESCE because is_auth_required is nullable and a NULL there must not read as
  -- "no authentication required" by accident.
  IF COALESCE(v_link.is_auth_required, false) THEN
    IF auth.uid() IS NULL THEN
      RETURN QUERY SELECT false::boolean, NULL::uuid, NULL::uuid, NULL::integer,
                          'This link requires you to sign in'::text;
      RETURN;
    END IF;

    IF NOT is_org_member(v_file_org_id) THEN
      -- Deliberately distinct from 'Link not found'. The caller already holds
      -- the token, so nothing is disclosed by telling them why they were
      -- refused, and a member who is signed in to the wrong account otherwise
      -- has no way to tell that from a broken link.
      RETURN QUERY SELECT false::boolean, NULL::uuid, NULL::uuid, NULL::integer,
                          'This link is restricted to members of the organization that owns the file'::text;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true::boolean, v_link.file_id, v_file_org_id, v_link.file_version, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Internal. Recipients call file_share_link_validate() and file_share_link_consume(),
-- which are on anon_get_execute_allowlist(); this is neither, and the sweep at the
-- end of this file withdraws it from anon.

-- Validate share link
--
-- Three things were wrong with this, all reachable by anon holding a token.
--
--   1. It ignored is_auth_required entirely. A link created with is_auth_required = true
--      validated for an unauthenticated caller exactly as one created without.
--      The flag was stored, returned by nothing, and consulted nowhere.
--   2. It spent the download allowance on *validation*. Nothing here downloads
--      anything - the caller does that afterwards with the file id - so any anon
--      caller could burn a ten-download link with twelve calls to this function
--      and never fetch a byte. Consumption now lives in file_share_link_consume(),
--      which the download path calls once it has actually served the file.
--   3. It returned the link's org_id. Until file_share_link_create resolved the
--      organization from the file, the link's org_id was whatever the creator
--      passed and could differ from the file's, so a consumer that trusted this
--      went looking for the file in the wrong tenant. It reports the org the
--      file is really in.
--
-- Kept on the anon allowlist: recipients of a share link are not BluePLM users,
-- and the token is the credential. That is only defensible because the token is
-- now 128 bits from a strong source - see file_share_link_generate_token().
CREATE OR REPLACE FUNCTION file_share_link_validate(p_token TEXT)
RETURNS TABLE (is_valid BOOLEAN, file_id UUID, org_id UUID, file_version INTEGER, error_message TEXT) AS $$
DECLARE
  v_admission RECORD;
BEGIN
  SELECT * INTO v_admission FROM file_share_link_admit(p_token);

  IF v_admission.is_valid THEN
    UPDATE file_share_link SET last_accessed_at = NOW() WHERE token = p_token;
  END IF;

  RETURN QUERY SELECT v_admission.is_valid, v_admission.file_id, v_admission.org_id,
                      v_admission.file_version, v_admission.error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Spend one download against a link. Separate from file_share_link_validate() so
-- that the allowance is spent by downloading and not by asking.
--
-- Admission is file_share_link_admit()'s answer, so this cannot admit anybody
-- file_share_link_validate() would refuse - not because both were written carefully,
-- but because there is only one place where admission is decided. That is the
-- fix for a bug where the two disagreed about whether the file still exists.
--
-- The UPDATE's WHERE re-tests one thing and one thing only: the download
-- counter. That is the condition with a race in it, and re-reading it under the
-- row lock the UPDATE takes is what stops two concurrent redemptions of the
-- last remaining download from both succeeding. Everything else is settled
-- above.
CREATE OR REPLACE FUNCTION file_share_link_consume(p_token TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_admitted BOOLEAN;
  v_updated INTEGER;
BEGIN
  SELECT a.is_valid INTO v_admitted FROM file_share_link_admit(p_token) a;

  IF NOT COALESCE(v_admitted, false) THEN
    RETURN false;
  END IF;

  UPDATE file_share_link l
     SET download_count = COALESCE(l.download_count, 0) + 1,
         last_accessed_at = NOW()
   WHERE l.token = p_token
     AND (l.max_downloads IS NULL OR COALESCE(l.download_count, 0) < l.max_downloads);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Both are on anon_get_execute_allowlist() in core.sql, which is what
-- anon_enforce_execute_posture() re-grants from at the end of this file. The
-- explicit grants here are for the window before that sweep runs.

-- Notify file watchers
CREATE OR REPLACE FUNCTION trg_file_notify_watchers()
RETURNS TRIGGER AS $$
DECLARE
  watcher RECORD;
  change_type TEXT;
  notification_title TEXT;
  notification_message TEXT;
  actor_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(full_name, email) INTO actor_name FROM app_user WHERE id = COALESCE(NEW.updated_by, auth.uid());
    
    IF OLD.checked_out_by IS NULL AND NEW.checked_out_by IS NOT NULL THEN
      change_type := 'checkout';
      notification_title := 'File Checked Out: ' || NEW.file_name;
      notification_message := actor_name || ' checked out ' || NEW.file_name;
    ELSIF OLD.checked_out_by IS NOT NULL AND NEW.checked_out_by IS NULL THEN
      change_type := 'checkin';
      notification_title := 'File Checked In: ' || NEW.file_name;
      notification_message := actor_name || ' checked in ' || NEW.file_name;
    ELSIF OLD.state IS DISTINCT FROM NEW.state THEN
      change_type := 'state_change';
      notification_title := 'File State Changed: ' || NEW.file_name;
      notification_message := NEW.file_name || ' changed from ' || OLD.state || ' to ' || NEW.state;
    ELSE
      RETURN NEW;
    END IF;
    
    FOR watcher IN 
      SELECT fw.user_id FROM file_watcher fw 
      WHERE fw.file_id = NEW.id
        AND fw.user_id != COALESCE(NEW.updated_by, auth.uid())
        AND ((change_type = 'checkin' AND fw.is_notified_on_checkin) OR
             (change_type = 'checkout' AND fw.is_notified_on_checkout) OR
             (change_type = 'state_change' AND fw.is_notified_on_state_change))
    LOOP
      INSERT INTO notification (org_id, user_id, type, title, message, entity_type, entity_id, from_user_id)
      VALUES (NEW.org_id, watcher.user_id, 'file_updated', notification_title, notification_message, 'file', NEW.id, COALESCE(NEW.updated_by, auth.uid()));
    END LOOP;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'File watcher notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_file_notify_watchers
  AFTER UPDATE ON file
  FOR EACH ROW EXECUTE FUNCTION trg_file_notify_watchers();

-- Get user vault access
CREATE OR REPLACE FUNCTION user_vault_access_list(p_user_id UUID)
RETURNS TABLE (vault_id UUID) AS $$
BEGIN
  -- Asking which vaults someone can reach is a question about that person, so
  -- the caller has to share an organization with them. Unauthenticated callers
  -- were previously enumerating this for any user id they cared to name.
  PERFORM user_require_same_org(p_user_id);

  RETURN QUERY
  SELECT DISTINCT va.vault_id
  FROM (
    SELECT vault_access.vault_id FROM vault_access WHERE vault_access.user_id = p_user_id
    UNION
    SELECT tva.vault_id FROM team_vault_access tva
    JOIN team_member tm ON tva.team_id = tm.team_id
    WHERE tm.user_id = p_user_id
  ) va;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Whether a user may see a vault: the rule my_accessible_vault_ids() states for
-- the caller, asked about any user. An administrator of the vault's organization
-- sees it; anyone else sees it only through a vault_access or team_vault_access
-- grant; no grant means no access (opt-in, as the renderer has applied it since
-- v3.20.0). A NULL vault is no restriction.
--
-- Schema 107 to 110 read "no grant at all" as unrestricted, which disagreed with
-- the renderer: a member the UI showed no vault to could still be added as a
-- reviewer and read review items. Schema 111 makes the database the authority,
-- so the two must say the same thing. The vault must also belong to the user's
-- organization, which the old body never checked.
--
-- Internal: the review RPCs ask it about other users (a reviewer being added),
-- which is not a question a client gets to ask. can_access_vault() below is the
-- caller-only form.
CREATE OR REPLACE FUNCTION can_user_access_vault(p_user_id UUID, p_vault_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_vault_id IS NULL
    OR EXISTS (
      SELECT 1
        FROM vault v
        JOIN app_user u ON u.id = p_user_id AND u.org_id = v.org_id
       WHERE v.id = p_vault_id
         AND (
           is_org_admin(p_user_id)
           OR EXISTS (SELECT 1 FROM vault_access va WHERE va.user_id = p_user_id AND va.vault_id = p_vault_id)
           OR EXISTS (
             SELECT 1 FROM team_vault_access tva
             JOIN team_member tm ON tm.team_id = tva.team_id
             WHERE tm.user_id = p_user_id AND tva.vault_id = p_vault_id
           )
         )
    );
$$;

CREATE OR REPLACE FUNCTION can_access_vault(p_vault_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND can_user_access_vault(auth.uid(), p_vault_id);
$$;

-- The active file at a path, matched the way file_vault_id_file_path_idx
-- matches it: (vault_id, LOWER(file_path)) WHERE deleted_at IS NULL. syncFile's
-- own primary lookup stays byte-exact for speed and only reaches this, from
-- the 23505 it catches, once a differently-cased row has already proven a
-- collision exists - which works, but only after paying for the failed
-- insert first. getFileByPath had no case-insensitive path at all: two rows
-- differing only in case were simply invisible to it, with no error to
-- notice. getFileByPath calls this on every lookup now.
--
-- deleted_at IS NULL is a literal here, not a p_include_deleted toggle a
-- caller could flip - a parameterized boolean inside an OR is not something
-- the planner can prove matches a partial index, and every current caller
-- only ever wants the active row anyway. vault_id and LOWER(file_path) are
-- both plain equality predicates for the same reason: provably index-backed,
-- not just usually fast.
--
-- Takes a vault id and derives the organization from the vault itself via
-- vault_require_access, rather than accepting a second p_org_id argument from
-- the caller and trusting it to match - the same reasoning file_share_link_create
-- was rewritten for above.
CREATE OR REPLACE FUNCTION file_get_active_by_path(
  p_vault_id UUID,
  p_file_path TEXT
)
RETURNS SETOF file AS $$
BEGIN
  PERFORM vault_require_access(p_vault_id);

  -- At most one row can match while file_vault_id_file_path_idx holds,
  -- but this function is only ever reached after a 23505 has already proven
  -- the index isn't - dropped and rebuilt without UNIQUE, say. ORDER BY makes
  -- two concurrent callers racing that same window agree on which row they
  -- mean instead of each taking whichever the planner happened to scan first.
  RETURN QUERY
    SELECT *
      FROM file
     WHERE vault_id = p_vault_id
       AND LOWER(file_path) = LOWER(p_file_path)
       AND deleted_at IS NULL
     ORDER BY created_at, id
     LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION file_checkout(
  p_file_id UUID,
  p_machine_id TEXT DEFAULT NULL,
  p_machine_name TEXT DEFAULT NULL,
  p_lock_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_file RECORD;
  v_checked_out_user RECORD;
  v_result JSONB;
  v_user_email TEXT;
  v_actor UUID;
BEGIN
  -- The acting user comes from the JWT, never from an argument: an argument made
  -- the audit trail a field in the request body.
  v_actor := my_actor_id();

  -- The gate is the only statement in this block, and it must stay that way.
  -- The handler below turns a refusal into a JSON result, which is what these
  -- RPCs need - but it will do that for anything raised in here, so a second
  -- check added after this line would have its RAISE swallowed and the function
  -- would carry on and answer. New checks go before the BEGIN.
  BEGIN
    PERFORM file_require_access(p_file_id);
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('success', false, 'error', 'File not found');
  END;

  -- Schema 112: the same permission the files UPDATE policy asks for. This
  -- function writes files as definer, so the policy never sees the write.
  IF NOT has_team_permission('module:explorer', 'edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to edit files');
  END IF;

  -- Lock the row and check status atomically
  SELECT id, file_path, file_name, checked_out_by, org_id
  INTO v_file
  FROM file
  WHERE id = p_file_id
  FOR UPDATE;  -- Row-level lock prevents race conditions
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'File not found');
  END IF;
  
  -- Check if already checked out by someone else
  IF v_file.checked_out_by IS NOT NULL AND v_file.checked_out_by != v_actor THEN
    -- Get the other user's info
    SELECT email, full_name INTO v_checked_out_user
    FROM app_user WHERE id = v_file.checked_out_by;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', format('File is already checked out by %s', 
        COALESCE(v_checked_out_user.full_name, v_checked_out_user.email, 'another user'))
    );
  END IF;
  
  -- Perform the checkout. The path snapshot is taken from the row's own file_path /
  -- file_name, not from anything the caller supplies, so it always reflects where the
  -- file actually is at this instant - discard restores to this snapshot later.
  UPDATE file
  SET 
    checked_out_by = v_actor,
    checked_out_at = NOW(),
    lock_message = p_lock_message,
    checked_out_by_machine_id = p_machine_id,
    checked_out_by_machine_name = p_machine_name,
    checked_out_file_path = v_file.file_path,
    checked_out_file_name = v_file.file_name,
    updated_by = v_actor,
    updated_at = NOW()
  WHERE id = p_file_id;
  
  -- Return success with file data
  SELECT jsonb_build_object(
    'success', true,
    'file', row_to_json(f.*)
  ) INTO v_result
  FROM file f
  WHERE f.id = p_file_id;
  
  -- Log activity
  SELECT email INTO v_user_email FROM app_user WHERE id = v_actor;
  
  INSERT INTO activity (org_id, file_id, user_id, user_email, action, details)
  VALUES (
    v_file.org_id, 
    p_file_id, 
    v_actor, 
    COALESCE(v_user_email, 'unknown'),
    'checkout',
    jsonb_build_object(
      'message', p_lock_message,
      'machine_id', p_machine_id,
      'machine_name', p_machine_name
    )
  );
  
  RETURN v_result;
END;
$$;

-- Merge an incoming custom_properties patch into the stored one.
--
-- `jsonb ||` is a TOP-LEVEL merge, so applying it to a patch that carries a reserved
-- per-configuration map replaces that whole map. A caller that sends `_config_tabs` for the one
-- configuration the user edited therefore erases the entry for every configuration they did not:
-- on a part with 68 configurations, editing one dropped the other 67 from the row. That was
-- silent data loss on the check-in success path.
--
-- Scalar keys keep the old wholesale behaviour - `Material` is one value and the newest one wins.
-- The reserved maps are merged entry by entry instead, so a partial patch is an overlay rather
-- than a replacement. A JSON `null` on an entry removes that configuration, which is the only way
-- left to delete one now that omission means "leave alone".
CREATE OR REPLACE FUNCTION custom_properties_merge(p_existing JSONB, p_incoming JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  -- Every top-level key under custom_properties that holds a configuration-name-keyed map.
  c_reserved_maps CONSTANT TEXT[] := ARRAY['_config_tabs', '_config_descriptions'];
  v_existing JSONB;
  v_result JSONB;
  v_key TEXT;
  v_incoming_map JSONB;
  v_existing_map JSONB;
  v_merged_map JSONB;
  v_removed TEXT;
BEGIN
  IF p_incoming IS NULL THEN
    RETURN p_existing;
  END IF;

  v_existing := COALESCE(p_existing, '{}'::jsonb);
  v_result := v_existing || p_incoming;

  FOREACH v_key IN ARRAY c_reserved_maps LOOP
    v_incoming_map := p_incoming -> v_key;
    -- Absent means "no opinion". A non-object means the caller is not sending a configuration
    -- map at all, and it keeps whatever `||` already did with it rather than being reinterpreted.
    CONTINUE WHEN v_incoming_map IS NULL OR jsonb_typeof(v_incoming_map) <> 'object';

    v_existing_map := v_existing -> v_key;
    IF v_existing_map IS NULL OR jsonb_typeof(v_existing_map) <> 'object' THEN
      v_existing_map := '{}'::jsonb;
    END IF;

    v_merged_map := v_existing_map || v_incoming_map;

    FOR v_removed IN
      SELECT key FROM jsonb_each(v_incoming_map) WHERE jsonb_typeof(value) = 'null'
    LOOP
      v_merged_map := v_merged_map - v_removed;
    END LOOP;

    v_result := jsonb_set(v_result, ARRAY[v_key], v_merged_map);
  END LOOP;

  RETURN v_result;
END;
$$;

-- An internal helper for file_checkin, not an API. It was reachable as an RPC only
-- because a new function is executable by PUBLIC, which is also why it never
-- appeared in src/types/supabase.ts: it should not be an endpoint at all. Nothing
-- is lost by withdrawing it - file_checkin is SECURITY DEFINER owned by the schema
-- owner, and supabase/tools/test-merge-custom-properties.sql runs in the SQL editor
-- as that same owner.
CREATE OR REPLACE FUNCTION file_checkin(
  p_file_id UUID,
  p_new_content_hash TEXT DEFAULT NULL,
  p_new_file_size BIGINT DEFAULT NULL,
  p_comment TEXT DEFAULT NULL,
  -- Metadata fields (if any provided, triggers version increment)
  p_part_number TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_revision TEXT DEFAULT NULL,
  -- For version rollback detection
  p_local_active_version INT DEFAULT NULL,
  -- For config_tabs, config_descriptions, etc.
  p_custom_properties JSONB DEFAULT NULL,
  -- Path/name updates (previously required separate UPDATE query)
  p_new_file_path TEXT DEFAULT NULL,
  p_new_file_name TEXT DEFAULT NULL,
  -- Inspection table fingerprint (drawings); change triggers a version increment
  p_inspection_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_file RECORD;
  v_new_version INT;
  v_new_file_version_id UUID;
  v_content_changed BOOLEAN;
  v_metadata_changed BOOLEAN;
  v_inspection_changed BOOLEAN;
  v_current_inspection_hash TEXT;
  v_version_switched BOOLEAN;
  v_path_changed BOOLEAN;
  v_should_increment BOOLEAN;
  v_restoring_exact_version BOOLEAN;
  v_target_version_hash TEXT;
  v_max_version INT;
  v_result JSONB;
  v_user_email TEXT;
  v_merged_custom_props JSONB;
  v_versions_created_during_checkout INT;
  v_actor UUID;
BEGIN
  -- The acting user comes from the JWT; it decides both whose checkout is
  -- honoured and whose name goes on the new version.
  v_actor := my_actor_id();

  -- The gate is the only statement in this block, and it must stay that way.
  -- The handler below turns a refusal into a JSON result, which is what these
  -- RPCs need - but it will do that for anything raised in here, so a second
  -- check added after this line would have its RAISE swallowed and the function
  -- would carry on and answer. New checks go before the BEGIN.
  BEGIN
    PERFORM file_require_access(p_file_id);
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('success', false, 'error', 'File not found');
  END;

  -- Schema 112: the same permission the files UPDATE policy asks for. This
  -- function writes files as definer, so the policy never sees the write.
  IF NOT has_team_permission('module:explorer', 'edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to edit files');
  END IF;

  -- Lock and verify ownership
  SELECT * INTO v_file
  FROM file
  WHERE id = p_file_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'File not found');
  END IF;
  
  IF v_file.checked_out_by IS NULL OR v_file.checked_out_by != v_actor THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have this file checked out');
  END IF;
  
  -- Check for path conflict when file is being renamed/moved
  IF p_new_file_path IS NOT NULL AND LOWER(p_new_file_path) != LOWER(v_file.file_path) THEN
    IF EXISTS (
      SELECT 1 FROM file 
      WHERE vault_id = v_file.vault_id 
        AND LOWER(file_path) = LOWER(p_new_file_path)
        AND id != p_file_id 
        AND deleted_at IS NULL
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 
        'Cannot rename: another file already exists at "' || p_new_file_path || '". Delete or rename the existing file first.');
    END IF;
  END IF;
  
  -- Determine what changed
  v_content_changed := (p_new_content_hash IS NOT NULL AND p_new_content_hash != COALESCE(v_file.content_hash, ''));
  
  v_metadata_changed := (
    (p_part_number IS NOT NULL AND p_part_number IS DISTINCT FROM v_file.part_number) OR
    (p_description IS NOT NULL AND p_description IS DISTINCT FROM v_file.description) OR
    (p_revision IS NOT NULL AND p_revision IS DISTINCT FROM v_file.revision) OR
    (p_custom_properties IS NOT NULL)  -- custom_properties change triggers version
  );
  
  -- Inspection table edits trigger a version increment (no binary re-upload required).
  -- The authoritative fingerprint is computed server-side from the live inspection rows so
  -- any edit made during the checkout session is detected automatically at check-in. A
  -- caller may still override it via p_inspection_hash. NULL means "no inspection table".
  -- source_key / source_sheet / source_view (schema 103) are deliberately NOT in the hash:
  -- adding them would change every existing table's fingerprint and bump every drawing's
  -- version on its next check-in. They only bind rows to drawing annotations; the live row
  -- keeps them and the snapshot below still copies them, so a key-only change loses nothing.
  SELECT md5(string_agg(
    coalesce(sort_order::text, '') || '|' ||
    coalesce(balloon_number, '') || '|' ||
    coalesce(char_id, '') || '|' ||
    coalesce(zone, '') || '|' ||
    coalesce(char_type, '') || '|' ||
    coalesce(sub_type, '') || '|' ||
    coalesce(nominal_value, '') || '|' ||
    coalesce(unit, '') || '|' ||
    coalesce(plus_tolerance, '') || '|' ||
    coalesce(minus_tolerance, '') || '|' ||
    coalesce(upper_limit, '') || '|' ||
    coalesce(lower_limit, '') || '|' ||
    coalesce(classification, '') || '|' ||
    coalesce(inspection_method, '') || '|' ||
    coalesce(operation, '') || '|' ||
    coalesce(aql, '') || '|' ||
    coalesce(sample_size::text, '') || '|' ||
    coalesce(supplier_inspection_rate::text, '') || '|' ||
    coalesce(internal_inspection_rate::text, '') || '|' ||
    coalesce(reference, '') || '|' ||
    coalesce(comments, ''),
    chr(10) ORDER BY sort_order, id))
  INTO v_current_inspection_hash
  FROM inspection_characteristic
  WHERE file_id = p_file_id;
  
  v_current_inspection_hash := COALESCE(p_inspection_hash, v_current_inspection_hash);
  v_inspection_changed := (v_current_inspection_hash IS DISTINCT FROM v_file.inspection_hash);
  
  -- Path/name changes now handled in RPC (eliminates separate UPDATE query)
  v_path_changed := (
    (p_new_file_path IS NOT NULL AND p_new_file_path IS DISTINCT FROM v_file.file_path) OR
    (p_new_file_name IS NOT NULL AND p_new_file_name IS DISTINCT FROM v_file.file_name)
  );
  
  -- Version switch detection (user rolled back to different version locally)
  v_version_switched := (p_local_active_version IS NOT NULL AND p_local_active_version != v_file.version);
  
  -- Handle rollback/roll-forward: check if content matches the target version
  -- If user rolled to a different version and content matches that version exactly,
  -- just move the pointer instead of creating a new version
  v_restoring_exact_version := FALSE;
  IF v_version_switched THEN
    SELECT content_hash INTO v_target_version_hash
    FROM file_version 
    WHERE file_id = p_file_id AND version = p_local_active_version;
    
    -- If content matches the rolled-back version exactly, just move the pointer
    IF p_new_content_hash IS NOT NULL AND p_new_content_hash = v_target_version_hash THEN
      v_restoring_exact_version := TRUE;
      v_new_version := p_local_active_version;  -- Move pointer, don't increment
    END IF;
  END IF;
  
  -- Check if a version was already created during this checkout session
  -- If so, skip version creation to avoid double increment
  SELECT COUNT(*) INTO v_versions_created_during_checkout
  FROM file_version
  WHERE file_id = p_file_id 
    AND created_at > v_file.checked_out_at;
  
  -- Only increment version if:
  -- 1. There are actual changes (content, metadata, or version switch)
  -- 2. We're not restoring an exact previous version
  -- 3. No version was already created during this checkout session
  v_should_increment := (v_content_changed OR v_metadata_changed OR v_inspection_changed OR v_version_switched) 
                        AND NOT v_restoring_exact_version
                        AND v_versions_created_during_checkout = 0;
  
  -- Merge custom properties if provided. Scalar keys are replaced; the reserved
  -- per-configuration maps are merged entry by entry so a partial patch cannot erase the
  -- configurations it does not mention. See custom_properties_merge.
  IF p_custom_properties IS NOT NULL THEN
    v_merged_custom_props := custom_properties_merge(v_file.custom_properties, p_custom_properties);
  ELSE
    v_merged_custom_props := v_file.custom_properties;
  END IF;
  
  -- Calculate new version only if needed
  -- Note: v_new_version may already be set if v_restoring_exact_version is TRUE
  IF v_should_increment THEN
    SELECT COALESCE(MAX(version), v_file.version) + 1 INTO v_new_version
    FROM file_version WHERE file_id = p_file_id;
  ELSIF NOT v_restoring_exact_version THEN
    -- Only set to current version if we're not restoring an exact version
    -- (v_new_version was already set to p_local_active_version above)
    v_new_version := v_file.version;
  END IF;
  
  -- Update file (now includes path/name in single atomic update)
  UPDATE file SET
    checked_out_by = NULL,
    checked_out_at = NULL,
    lock_message = NULL,
    checked_out_by_machine_id = NULL,
    checked_out_by_machine_name = NULL,
    checked_out_file_path = NULL,
    checked_out_file_name = NULL,
    content_hash = COALESCE(p_new_content_hash, content_hash),
    file_size = COALESCE(p_new_file_size, file_size),
    part_number = COALESCE(p_part_number, part_number),
    description = COALESCE(p_description, description),
    revision = COALESCE(p_revision, revision),
    inspection_hash = v_current_inspection_hash,
    custom_properties = v_merged_custom_props,
    version = v_new_version,
    file_path = COALESCE(p_new_file_path, file_path),
    file_name = COALESCE(p_new_file_name, file_name),
    updated_by = v_actor,
    updated_at = NOW()
  WHERE id = p_file_id;
  
  -- Create version record ONLY if version incremented
  IF v_should_increment THEN
    INSERT INTO file_version (file_id, version, revision, content_hash, file_size, workflow_state_id, state, created_by, comment, part_number, description, inspection_hash)
    SELECT p_file_id, v_new_version, 
           COALESCE(p_revision, v_file.revision),
           COALESCE(p_new_content_hash, v_file.content_hash),
           COALESCE(p_new_file_size, v_file.file_size),
           v_file.workflow_state_id,
           COALESCE(v_file.state, 'not_tracked'), 
           v_actor, 
           p_comment,
           COALESCE(p_part_number, v_file.part_number),  -- Snapshot current or new part_number
           COALESCE(p_description, v_file.description),  -- Snapshot current or new description
           v_current_inspection_hash  -- Snapshot inspection fingerprint
    RETURNING id INTO v_new_file_version_id;

    -- Snapshot the live inspection table into the immutable per-version table so the
    -- inspection characteristics can be reconstructed exactly as they were at this version.
    INSERT INTO inspection_characteristic_version (
      file_version_id, org_id, sort_order, balloon_number, char_id, zone,
      char_type, sub_type, nominal_value, unit, plus_tolerance, minus_tolerance,
      upper_limit, lower_limit, classification, inspection_method, operation,
      aql, sample_size, supplier_inspection_rate, internal_inspection_rate, reference, comments,
      source_key, source_sheet, source_view
    )
    SELECT
      v_new_file_version_id, org_id, sort_order, balloon_number, char_id, zone,
      char_type, sub_type, nominal_value, unit, plus_tolerance, minus_tolerance,
      upper_limit, lower_limit, classification, inspection_method, operation,
      aql, sample_size, supplier_inspection_rate, internal_inspection_rate, reference, comments,
      source_key, source_sheet, source_view
    FROM inspection_characteristic
    WHERE file_id = p_file_id;
  END IF;
  
  -- Log activity
  SELECT email INTO v_user_email FROM app_user WHERE id = v_actor;
  
  INSERT INTO activity (org_id, file_id, user_id, user_email, action, details)
  VALUES (
    v_file.org_id, 
    p_file_id, 
    v_actor, 
    COALESCE(v_user_email, 'unknown'),
    'checkin',
    jsonb_build_object(
      'content_changed', v_content_changed,
      'metadata_changed', v_metadata_changed,
      'inspection_changed', v_inspection_changed,
      'version_incremented', v_should_increment,
      'version_restored', v_restoring_exact_version,
      'old_version', v_file.version,
      'new_version', v_new_version,
      'comment', p_comment,
      'version_already_created_during_checkout', v_versions_created_during_checkout > 0
    )
  );
  
  -- Log revision change separately if revision changed
  IF p_revision IS NOT NULL AND p_revision IS DISTINCT FROM v_file.revision THEN
    INSERT INTO activity (org_id, file_id, user_id, user_email, action, details)
    VALUES (
      v_file.org_id, 
      p_file_id, 
      v_actor, 
      COALESCE(v_user_email, 'unknown'),
      'revision_change',
      jsonb_build_object('from', v_file.revision, 'to', p_revision)
    );
  END IF;
  
  -- Return result
  SELECT jsonb_build_object(
    'success', true, 
    'file', row_to_json(f.*), 
    'new_version', v_new_version,
    'content_changed', v_content_changed,
    'metadata_changed', v_metadata_changed,
    'inspection_changed', v_inspection_changed,
    'version_incremented', v_should_increment
  )
  INTO v_result
  FROM file f WHERE f.id = p_file_id;
  
  RETURN v_result;
END;
$$;

-- Grant for signature with custom_properties, file_path, file_name, inspection_hash parameters
CREATE OR REPLACE FUNCTION file_repair_config_maps(p_org_id UUID, p_repairs JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- The only keys this function will ever write. Matches custom_properties_merge, which is the
  -- authority for what counts as a reserved per-configuration map.
  c_reserved_maps CONSTANT TEXT[] := ARRAY['_config_tabs', '_config_descriptions'];

  v_actor          UUID;
  v_actor_email    TEXT;
  v_request        JSONB;
  v_file_id        UUID;
  v_file           RECORD;
  v_key            TEXT;
  v_computed       JSONB;
  v_before         INTEGER;
  v_after          INTEGER;
  v_requested      INTEGER;
  v_updated        BOOLEAN;
  v_file_report    JSONB;
  v_map_reports    JSONB;
  v_reports        JSONB := '[]'::jsonb;
  v_files_updated  INTEGER := 0;
  v_entries_added  INTEGER := 0;
  v_entries_asked  INTEGER := 0;
BEGIN
  -- Membership first, in its own right rather than leaning on the admin test beside it: see
  -- item_designation_upsert for why those two are kept independent.
  PERFORM org_require_member(p_org_id);

  IF NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only organization admins can repair configuration maps'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_repairs IS NULL OR jsonb_typeof(p_repairs) <> 'array' THEN
    RAISE EXCEPTION 'p_repairs must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_actor := my_actor_id();
  SELECT email INTO v_actor_email FROM app_user WHERE id = v_actor;

  -- Validate the whole request before writing any of it. A request carrying one bad value is
  -- rejected entirely, so there is no state in which half a repair has been applied and the caller
  -- has been told it failed.
  FOR v_request IN SELECT * FROM jsonb_array_elements(p_repairs) LOOP
    IF jsonb_typeof(v_request -> 'maps') <> 'object' THEN
      RAISE EXCEPTION 'Each repair needs a maps object'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    FOREACH v_key IN ARRAY c_reserved_maps LOOP
      v_computed := v_request -> 'maps' -> v_key;
      CONTINUE WHEN v_computed IS NULL;

      IF jsonb_typeof(v_computed) <> 'object' THEN
        RAISE EXCEPTION 'maps.% must be a JSON object', v_key
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

      IF EXISTS (
        SELECT 1 FROM jsonb_each(v_computed) AS entry(name, value)
        WHERE jsonb_typeof(entry.value) <> 'string'
      ) THEN
        RAISE EXCEPTION 'maps.% may only hold string values', v_key
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
    END LOOP;
  END LOOP;

  FOR v_request IN SELECT * FROM jsonb_array_elements(p_repairs) LOOP
    v_file_id := NULLIF(v_request ->> 'file_id', '')::uuid;
    v_map_reports := '{}'::jsonb;
    v_updated := FALSE;

    -- The organization comes from the gated argument and the row must match it, so a file id
    -- belonging to another tenant resolves to no row at all rather than to a refusal that
    -- confirms the id exists.
    SELECT id, file_path, org_id
      INTO v_file
      FROM file
     WHERE id = v_file_id
       AND org_id = p_org_id
       AND deleted_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
      -- Count what this request asked for even though none of it can be applied.
      --
      -- entries_requested used to be accumulated further down, after the row had resolved, while
      -- files_requested in the return counts every element of p_repairs unconditionally. So a batch
      -- that dropped a file whole reported entries_requested equal to entries_added, and
      -- `entries_requested - entries_added` - the one subtraction a caller performs to ask whether
      -- anything was missed - read zero for precisely the case it exists to report. The receipt was
      -- most reassuring exactly where it had least to say.
      --
      -- Counted the way the applied path counts it, so the two are comparable: reserved keys only,
      -- and a map that is absent or holds no keys contributes nothing.
      SELECT COALESCE(sum(asked.entries), 0)::int
        INTO v_requested
        FROM (
          SELECT (SELECT count(*) FROM jsonb_object_keys(v_request -> 'maps' -> k)) AS entries
            FROM unnest(c_reserved_maps) AS k
           WHERE jsonb_typeof(v_request -> 'maps' -> k) = 'object'
        ) AS asked;

      v_entries_asked := v_entries_asked + v_requested;

      v_reports := v_reports || jsonb_build_object(
        'file_id', v_file_id,
        'file_path', NULL,
        'updated', FALSE,
        'refused', 'row-not-found',
        -- Per-file as well as in the total, because the total says how much was lost and this says
        -- which file lost it. The applied path reports the same number per map under maps.<key>.
        'entries_requested', v_requested,
        'maps', v_map_reports
      );
      CONTINUE;
    END IF;

    FOREACH v_key IN ARRAY c_reserved_maps LOOP
      v_computed := v_request -> 'maps' -> v_key;
      CONTINUE WHEN v_computed IS NULL OR v_computed = '{}'::jsonb;

      SELECT count(*)::int INTO v_requested FROM jsonb_object_keys(v_computed);
      v_entries_asked := v_entries_asked + v_requested;

      SELECT CASE
               WHEN jsonb_typeof(f.custom_properties -> v_key) = 'object'
               THEN (SELECT count(*)::int FROM jsonb_object_keys(f.custom_properties -> v_key))
             END
        INTO v_before
        FROM file f
       WHERE f.id = v_file.id;

      IF v_before IS NULL THEN
        -- The row carries no such map, or carries something that is not a map. Either way it never
        -- described this file's configurations and there is nothing here to restore.
        v_map_reports := v_map_reports || jsonb_build_object(v_key, jsonb_build_object(
          'refused', 'map-absent',
          'requested', v_requested
        ));
        CONTINUE;
      END IF;

      -- THE MERGE. `<computed> || existing` - the row is on the right, so it wins every shared key
      -- and the key set can only grow. custom_properties inside the expression is the row's
      -- pre-update value, which is what makes the live row and not the caller's snapshot the side
      -- that survives. The WHERE re-states the guards as refusals rather than as reach.
      UPDATE file f
         SET custom_properties = jsonb_set(
               COALESCE(f.custom_properties, '{}'::jsonb),
               ARRAY[v_key],
               v_computed || COALESCE(f.custom_properties -> v_key, '{}'::jsonb)
             )
       WHERE f.id = v_file.id
         AND f.org_id = p_org_id
         AND f.deleted_at IS NULL
         AND f.custom_properties ? v_key
         AND jsonb_typeof(f.custom_properties -> v_key) = 'object';

      SELECT (SELECT count(*)::int FROM jsonb_object_keys(f.custom_properties -> v_key))
        INTO v_after
        FROM file f
       WHERE f.id = v_file.id;

      v_map_reports := v_map_reports || jsonb_build_object(v_key, jsonb_build_object(
        'before', v_before,
        'requested', v_requested,
        'added', v_after - v_before,
        'after', v_after
      ));

      IF v_after > v_before THEN
        v_updated := TRUE;
        v_entries_added := v_entries_added + (v_after - v_before);
      END IF;
    END LOOP;

    IF v_updated THEN
      v_files_updated := v_files_updated + 1;

      -- An admin write to production data leaves a record. `update` rather than a new enum value:
      -- adding one is schema surface this does not need, and details.operation is what makes the
      -- row findable. The files UPDATE trigger changes nothing here - none of its branches match a
      -- custom_properties-only change, so this is the only row written.
      INSERT INTO activity (org_id, file_id, user_id, user_email, action, details)
      VALUES (
        p_org_id,
        v_file.id,
        v_actor,
        COALESCE(v_actor_email, 'unknown'),
        'update',
        jsonb_build_object('operation', 'config_map_repair', 'maps', v_map_reports)
      );
    END IF;

    v_file_report := jsonb_build_object(
      'file_id', v_file.id,
      'file_path', v_file.file_path,
      'updated', v_updated,
      'refused', NULL,
      'maps', v_map_reports
    );
    v_reports := v_reports || v_file_report;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'files_requested', jsonb_array_length(p_repairs),
    'files_updated', v_files_updated,
    'entries_requested', v_entries_asked,
    'entries_added', v_entries_added,
    'files', v_reports
  );
END;
$$;

-- Born unreachable by anon, as every RPC in this schema is, then handed to signed-in users - who
-- still have to pass org_require_member and is_org_admin inside.

-- ===========================================
-- SERIAL NUMBER FUNCTIONS
-- ===========================================
--
-- These, like every SECURITY DEFINER function below that takes a p_org_id, open
-- with org_require_member(p_org_id). Without it the argument is an
-- unauthenticated instruction: SECURITY DEFINER means RLS is not consulted, and
-- the function is reachable over PostgREST, so naming another organization's id
-- read or advanced that organization's counter. See core.sql.

-- Preview next serial number (returns what the next auto-generated serial will look like)
-- Used by the SerializationSettings component to show a server-side preview
CREATE OR REPLACE FUNCTION serial_number_preview_next(p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  settings JSONB;
  next_counter INTEGER;
  keepout_zones JSONB;
  zone JSONB;
  zone_start INTEGER;
  zone_end INTEGER;
  result TEXT;
  prefix TEXT;
  suffix TEXT;
  letter_prefix TEXT;
  padding_digits INTEGER;
BEGIN
  PERFORM org_require_member(p_org_id);

  -- Get serialization settings for the organization
  SELECT serialization_settings INTO settings
  FROM organization WHERE id = p_org_id;
  
  -- Return null if no settings or serialization is disabled
  IF settings IS NULL OR NOT COALESCE((settings->>'enabled')::boolean, false) THEN
    RETURN NULL;
  END IF;
  
  -- Extract settings
  prefix := COALESCE(settings->>'prefix', '');
  suffix := COALESCE(settings->>'suffix', '');
  letter_prefix := COALESCE(settings->>'letter_prefix', '');
  padding_digits := COALESCE((settings->>'padding_digits')::integer, 5);
  
  -- Calculate next counter (current + 1)
  next_counter := COALESCE((settings->>'current_counter')::integer, 0) + 1;
  
  -- Skip keepout zones
  keepout_zones := COALESCE(settings->'keepout_zones', '[]'::jsonb);
  FOR zone IN SELECT * FROM jsonb_array_elements(keepout_zones)
  LOOP
    zone_start := (zone->>'start')::integer;
    zone_end := COALESCE((zone->>'end_num')::integer, (zone->>'end')::integer);
    
    IF next_counter >= zone_start AND next_counter <= zone_end THEN
      next_counter := zone_end + 1;
    END IF;
  END LOOP;
  
  -- Build the serial number (base only - no tab number since we only generate base)
  result := prefix || letter_prefix || LPAD(next_counter::text, padding_digits, '0') || suffix;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get next serial number (atomically increments counter and returns the new serial)
-- Used when actually assigning a serial number to a file
CREATE OR REPLACE FUNCTION serial_number_get_next(p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  settings JSONB;
  current_counter INTEGER;
  next_counter INTEGER;
  keepout_zones JSONB;
  zone JSONB;
  zone_start INTEGER;
  zone_end INTEGER;
  result TEXT;
  prefix TEXT;
  suffix TEXT;
  letter_prefix TEXT;
  padding_digits INTEGER;
BEGIN
  PERFORM org_require_member(p_org_id);

  -- Get serialization settings for the organization (with lock for update)
  SELECT serialization_settings INTO settings
  FROM organization WHERE id = p_org_id
  FOR UPDATE;
  
  -- Return null if no settings or serialization is disabled
  IF settings IS NULL OR NOT COALESCE((settings->>'enabled')::boolean, false) THEN
    RETURN NULL;
  END IF;
  
  -- Extract settings
  prefix := COALESCE(settings->>'prefix', '');
  suffix := COALESCE(settings->>'suffix', '');
  letter_prefix := COALESCE(settings->>'letter_prefix', '');
  padding_digits := COALESCE((settings->>'padding_digits')::integer, 5);
  
  -- Get current counter and calculate next
  current_counter := COALESCE((settings->>'current_counter')::integer, 0);
  next_counter := current_counter + 1;
  
  -- Skip keepout zones
  keepout_zones := COALESCE(settings->'keepout_zones', '[]'::jsonb);
  FOR zone IN SELECT * FROM jsonb_array_elements(keepout_zones)
  LOOP
    zone_start := (zone->>'start')::integer;
    zone_end := COALESCE((zone->>'end_num')::integer, (zone->>'end')::integer);
    
    IF next_counter >= zone_start AND next_counter <= zone_end THEN
      next_counter := zone_end + 1;
    END IF;
  END LOOP;
  
  -- Update the counter in the database
  UPDATE organization
  SET serialization_settings = jsonb_set(
    serialization_settings,
    '{current_counter}',
    to_jsonb(next_counter)
  )
  WHERE id = p_org_id;
  
  -- Build the serial number (without tab - that's added separately)
  result := prefix || letter_prefix || LPAD(next_counter::text, padding_digits, '0') || suffix;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Update serialization settings safely (preserves counter from race conditions)
-- Used when admin saves settings - the counter is preserved from the database
-- to prevent accidentally overwriting a counter that was incremented by another user
CREATE OR REPLACE FUNCTION org_update_serialization_settings(
  p_org_id UUID,
  p_settings JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
  current_settings JSONB;
  preserved_counter INTEGER;
  merged_settings JSONB;
BEGIN
  PERFORM org_require_member(p_org_id);

  -- Schema 112: an organization setting, saved from the admin settings page.
  IF NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only admins can change serialization settings'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Get current settings with lock to prevent race conditions
  SELECT serialization_settings INTO current_settings
  FROM organization WHERE id = p_org_id
  FOR UPDATE;
  
  -- Preserve the current counter from the database
  -- This ensures we don't overwrite a counter that was incremented by another user
  preserved_counter := COALESCE((current_settings->>'current_counter')::integer, 0);
  
  -- Merge the input settings with the preserved counter
  -- Remove current_counter from input (if present) and add the preserved one
  merged_settings := (p_settings - 'current_counter') || jsonb_build_object('current_counter', preserved_counter);
  
  -- Update the organization with merged settings
  UPDATE organization
  SET serialization_settings = merged_settings
  WHERE id = p_org_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ===========================================
-- ITEM DEFINITION FUNCTIONS (Item Browser)
-- ===========================================

-- Get the org's item definition settings (returns defaults if unset)
CREATE OR REPLACE FUNCTION org_get_item_definition_settings(p_org_id UUID)
RETURNS JSONB AS $$
DECLARE
  settings JSONB;
BEGIN
  PERFORM org_require_member(p_org_id);

  SELECT item_definition_settings INTO settings
  FROM organization WHERE id = p_org_id;

  RETURN COALESCE(settings, '{
    "anyStage": true,
    "workflowStageIds": [],
    "anyType": true,
    "fileTypes": [],
    "requirePartNumber": true,
    "matchOrgFormat": true
  }'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Update the org's item definition settings
CREATE OR REPLACE FUNCTION org_update_item_definition_settings(
  p_org_id UUID,
  p_settings JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
  PERFORM org_require_member(p_org_id);

  -- Schema 112: an organization-wide definition. Admins, or members granted the
  -- item designation permission the Item Browser already uses for the same view.
  IF NOT (is_org_admin() OR has_team_permission('system:item-designations', 'edit')) THEN
    RAISE EXCEPTION 'You do not have permission to change the item definition'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE organization
  SET item_definition_settings = p_settings
  WHERE id = p_org_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE POLICY "item_image: users read"
  ON item_image FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "item_image: members insert"
  ON item_image FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:items', 'edit'));

CREATE POLICY "item_image: members update"
  ON item_image FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:items', 'edit'));

CREATE POLICY "item_image: members delete"
  ON item_image FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:items', 'edit'));

-- Get all per-item image overrides for an org (preview items have no row)
CREATE OR REPLACE FUNCTION item_image_list(p_org_id UUID)
RETURNS SETOF item_image AS $$
BEGIN
  PERFORM org_require_member(p_org_id);

  RETURN QUERY
  SELECT * FROM item_image WHERE org_id = p_org_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Upsert a per-item image override (icon or uploaded image)
CREATE OR REPLACE FUNCTION item_image_upsert(
  p_org_id UUID,
  p_part_number TEXT,
  p_image_type TEXT,
  p_icon_name TEXT DEFAULT NULL,
  p_icon_color TEXT DEFAULT NULL,
  p_image_storage_path TEXT DEFAULT NULL
)
RETURNS item_image AS $$
DECLARE
  v_row item_image;
BEGIN
  -- Was: p_org_id NOT IN (SELECT org_id FROM users WHERE id = auth.uid()).
  -- NULL, not true, for an account that has not joined an organization, so the
  -- RAISE never happened and this wrote into whatever organization it was
  -- given. Reproduced: an account with app_user.org_id NULL overwrote another
  -- tenant's item_image row over PostgREST.
  PERFORM org_require_member(p_org_id);

  INSERT INTO item_image (
    org_id, part_number, image_type, icon_name, icon_color, image_storage_path, updated_by, updated_at
  )
  VALUES (
    p_org_id, p_part_number, p_image_type, p_icon_name, p_icon_color, p_image_storage_path, auth.uid(), NOW()
  )
  ON CONFLICT (org_id, part_number) DO UPDATE
    SET image_type = EXCLUDED.image_type,
        icon_name = EXCLUDED.icon_name,
        icon_color = EXCLUDED.icon_color,
        image_storage_path = EXCLUDED.image_storage_path,
        updated_by = auth.uid(),
        updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION item_image_reset(
  p_org_id UUID,
  p_part_number TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Same NULL-unsafe test as item_image_upsert, and the same consequence: an
  -- account with no organization deleted another tenant's row.
  PERFORM org_require_member(p_org_id);

  DELETE FROM item_image WHERE org_id = p_org_id AND part_number = p_part_number;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE POLICY "item_designation: users read"
  ON item_designation FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "item_designation: admins manage"
  ON item_designation FOR ALL
  USING (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    AND (is_org_admin() OR has_team_permission('system:item-designations', 'edit'))
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    AND (is_org_admin() OR has_team_permission('system:item-designations', 'edit'))
  );

CREATE POLICY "item_designation_assignment: users read"
  ON item_designation_assignment FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "item_designation_assignment: permitted users manage"
  ON item_designation_assignment FOR ALL
  USING (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    AND (is_org_admin() OR has_team_permission('system:item-designations', 'edit'))
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    AND (is_org_admin() OR has_team_permission('system:item-designations', 'edit'))
  );

-- List the org's item designations, seeding defaults on first access.
CREATE OR REPLACE FUNCTION item_designation_list(p_org_id UUID)
RETURNS SETOF item_designation AS $$
BEGIN
  -- NULL-unsafe before this: an account with no organization read - and, via
  -- the seeding branch below, wrote into - any organization it named.
  PERFORM org_require_member(p_org_id);

  IF NOT EXISTS (SELECT 1 FROM item_designation WHERE org_id = p_org_id) THEN
    INSERT INTO item_designation (org_id, name, sort_order, created_by)
    VALUES
      (p_org_id, 'Part', 0, auth.uid()),
      (p_org_id, 'Assembly', 1, auth.uid()),
      (p_org_id, 'Packed Assembly', 2, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT * FROM item_designation
  WHERE org_id = p_org_id
  ORDER BY sort_order, name;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Create or update an item designation (admin or system:item-designations edit).
CREATE OR REPLACE FUNCTION item_designation_upsert(
  p_org_id UUID,
  p_name TEXT,
  p_id UUID DEFAULT NULL,
  p_sort_order INTEGER DEFAULT NULL
)
RETURNS item_designation AS $$
DECLARE
  v_row item_designation;
  v_sort INTEGER;
BEGIN
  -- The membership half of this test was NULL-unsafe. It happened not to be
  -- exploitable, because the admin half is conjoined with AND and is_org_admin()
  -- returns false outright for a user with no organization. That is luck, not
  -- design - the two conditions are independent and either could be edited
  -- without the other - so the membership test is made sound in its own right
  -- rather than left leaning on its neighbour.
  PERFORM org_require_member(p_org_id);

  IF NOT (is_org_admin() OR has_team_permission('system:item-designations', 'edit')) THEN
    RAISE EXCEPTION 'Not authorized to manage item designations';
  END IF;

  IF p_id IS NULL THEN
    v_sort := COALESCE(
      p_sort_order,
      (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM item_designation WHERE org_id = p_org_id)
    );
    INSERT INTO item_designation (org_id, name, sort_order, created_by)
    VALUES (p_org_id, p_name, v_sort, auth.uid())
    RETURNING * INTO v_row;
  ELSE
    UPDATE item_designation
    SET name = p_name,
        sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_id AND org_id = p_org_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Delete an item designation (admin or system:item-designations edit).
CREATE OR REPLACE FUNCTION item_designation_delete(
  p_org_id UUID,
  p_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Membership test made sound in its own right; see item_designation_upsert.
  PERFORM org_require_member(p_org_id);

  IF NOT (is_org_admin() OR has_team_permission('system:item-designations', 'edit')) THEN
    RAISE EXCEPTION 'Not authorized to manage item designations';
  END IF;

  DELETE FROM item_designation WHERE id = p_id AND org_id = p_org_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Load all per-item designation assignments for a vault.
CREATE OR REPLACE FUNCTION item_designation_assignment_list(
  p_org_id UUID,
  p_vault_id UUID
)
RETURNS SETOF item_designation_assignment AS $$
BEGIN
  -- NULL-unsafe before this. Reproduced: an account with app_user.org_id NULL read
  -- another tenant's designation assignments over PostgREST.
  PERFORM org_require_member(p_org_id);

  RETURN QUERY
  SELECT * FROM item_designation_assignment
  WHERE org_id = p_org_id AND vault_id = p_vault_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Set (or clear, when p_designation_id is NULL) an item's designation override.
CREATE OR REPLACE FUNCTION item_designation_assignment_set(
  p_org_id UUID,
  p_vault_id UUID,
  p_part_number TEXT,
  p_designation_id UUID DEFAULT NULL
)
RETURNS item_designation_assignment AS $$
DECLARE
  v_row item_designation_assignment;
BEGIN
  -- Membership test made sound in its own right; see item_designation_upsert.
  PERFORM org_require_member(p_org_id);

  IF NOT (is_org_admin() OR has_team_permission('system:item-designations', 'edit')) THEN
    RAISE EXCEPTION 'Not authorized to edit item designations';
  END IF;

  IF p_designation_id IS NULL THEN
    DELETE FROM item_designation_assignment
    WHERE org_id = p_org_id AND vault_id = p_vault_id AND part_number = p_part_number;
    RETURN NULL;
  END IF;

  -- Finding 3's shape in a milder form: p_org_id is gated, but p_vault_id and
  -- p_designation_id used to be written through unexamined. The row lands in
  -- the caller's own organisation, so this was never a cross-tenant read - but
  -- a foreign id would either be accepted, quietly pointing a local row at
  -- another tenant's vault, or rejected by the foreign key, which turns the
  -- error into an oracle for whether a given uuid exists in some other
  -- organisation. An argument that selects a row has to be checked against the
  -- organisation the caller was admitted to, even when the write is local.
  IF NOT EXISTS (SELECT 1 FROM vault
                  WHERE id = p_vault_id AND org_id = p_org_id) THEN
    RAISE EXCEPTION 'Not authorized for this vault'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM item_designation
                  WHERE id = p_designation_id AND org_id = p_org_id) THEN
    RAISE EXCEPTION 'Not authorized for this item designation'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO item_designation_assignment (
    org_id, vault_id, part_number, designation_id, updated_by, updated_at
  )
  VALUES (
    p_org_id, p_vault_id, p_part_number, p_designation_id, auth.uid(), NOW()
  )
  ON CONFLICT (org_id, vault_id, part_number) DO UPDATE
    SET designation_id = EXCLUDED.designation_id,
        updated_by = auth.uid(),
        updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ===========================================
-- PERFORMANCE: Fast Vault File Queries
-- ===========================================

-- Get all vault files in a single query (no pagination overhead)
-- Returns lightweight file data for initial vault sync
-- Much faster than paginated REST queries (1 round trip vs 25+ for large vaults)
CREATE OR REPLACE FUNCTION vault_file_list(
  p_org_id UUID,
  p_vault_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  file_path TEXT,
  file_name TEXT,
  extension TEXT,
  file_type file_type,
  part_number TEXT,
  description TEXT,
  revision TEXT,
  version INT,
  content_hash TEXT,
  file_size BIGINT,
  state TEXT,
  checked_out_by UUID,
  checked_out_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- Needed by the explorer to tell committed per-configuration metadata apart from
  -- uncommitted edits. Without it every pending config value looks like a change and
  -- the file is marked modified forever.
  custom_properties JSONB,
  -- file_path/file_name at checkout time, so discard can restore a rename or move
  -- made during the checkout. NULL when the file is not checked out.
  checked_out_file_path TEXT,
  checked_out_file_name TEXT
) AS $$
BEGIN
  PERFORM org_require_member(p_org_id);
  -- Schema 111: a named vault the caller may not see is refused, not answered
  -- empty (an empty answer reads as "the server has no files" to a client that
  -- holds a local copy); without a vault, only visible vaults are listed.
  IF p_vault_id IS NOT NULL THEN
    PERFORM vault_require_access(p_vault_id);
  END IF;

  RETURN QUERY
  SELECT
    f.id, f.file_path, f.file_name, f.extension, f.file_type,
    f.part_number, f.description, f.revision, f.version,
    f.content_hash, f.file_size, f.state,
    f.checked_out_by, f.checked_out_at, f.updated_at,
    f.custom_properties,
    f.checked_out_file_path, f.checked_out_file_name
  FROM file f
  WHERE f.org_id = p_org_id
    AND f.deleted_at IS NULL
    AND (p_vault_id IS NULL OR f.vault_id = p_vault_id)
    AND (p_vault_id IS NOT NULL OR f.vault_id IN (SELECT my_accessible_vault_ids()))
  ORDER BY f.file_path;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Cheap reconciliation count for the vault cache: the renderer compares this against
-- its merged (cache + delta) row count and forces a full refetch on mismatch, so a
-- delta that was missed (e.g. a mutation that forgot to bump updated_at) self-heals
-- instead of persisting until the cache's 7-day TTL. Must mirror vault_file_list
-- exactly in both authorization and predicate - it is SECURITY DEFINER and gates only
-- on org_require_member(), bypassing RLS, same as vault_file_list. A PostgREST
-- count: 'exact' query would instead go through RLS and disagree systematically.
CREATE OR REPLACE FUNCTION vault_file_count(
  p_org_id UUID,
  p_vault_id UUID DEFAULT NULL
) RETURNS BIGINT AS $$
BEGIN
  PERFORM org_require_member(p_org_id);
  IF p_vault_id IS NOT NULL THEN
    PERFORM vault_require_access(p_vault_id);
  END IF;
  RETURN (SELECT COUNT(*) FROM file f
          WHERE f.org_id = p_org_id
            AND f.deleted_at IS NULL
            AND (p_vault_id IS NULL OR f.vault_id = p_vault_id)
            AND (p_vault_id IS NOT NULL OR f.vault_id IN (SELECT my_accessible_vault_ids())));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION file_move(
  p_file_id UUID,
  p_new_file_path TEXT,
  p_new_file_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_file RECORD;
  v_checked_out_user RECORD;
  v_result JSONB;
  v_user_email TEXT;
  v_old_path TEXT;
  v_old_name TEXT;
  v_actor UUID;
BEGIN
  -- The acting user comes from the JWT.
  v_actor := my_actor_id();

  -- The gate is the only statement in this block, and it must stay that way.
  -- The handler below turns a refusal into a JSON result, which is what these
  -- RPCs need - but it will do that for anything raised in here, so a second
  -- check added after this line would have its RAISE swallowed and the function
  -- would carry on and answer. New checks go before the BEGIN.
  BEGIN
    PERFORM file_require_access(p_file_id);
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('success', false, 'error', 'File not found');
  END;

  -- Schema 112: the same permission the files UPDATE policy asks for. This
  -- function writes files as definer, so the policy never sees the write.
  IF NOT has_team_permission('module:explorer', 'edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to edit files');
  END IF;

  -- Lock the row and check status atomically
  SELECT id, file_path, file_name, checked_out_by, org_id
  INTO v_file
  FROM file
  WHERE id = p_file_id
  FOR UPDATE;  -- Row-level lock prevents race conditions
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'File not found');
  END IF;
  
  -- Store old values for activity log
  v_old_path := v_file.file_path;
  v_old_name := v_file.file_name;
  
  -- Check if file is checked out by another user (block the move)
  IF v_file.checked_out_by IS NOT NULL AND v_file.checked_out_by != v_actor THEN
    -- Get the other user's info
    SELECT email, full_name INTO v_checked_out_user
    FROM app_user WHERE id = v_file.checked_out_by;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cannot move: file is checked out by %s', 
        COALESCE(v_checked_out_user.full_name, v_checked_out_user.email, 'another user'))
    );
  END IF;
  
  -- Perform the move (update path and optionally name)
  UPDATE file
  SET 
    file_path = p_new_file_path,
    file_name = COALESCE(p_new_file_name, file_name),
    updated_by = v_actor,
    updated_at = NOW()
  WHERE id = p_file_id;
  
  -- Return success with updated file data
  SELECT jsonb_build_object(
    'success', true,
    'file', row_to_json(f.*)
  ) INTO v_result
  FROM file f
  WHERE f.id = p_file_id;
  
  -- Log activity
  SELECT email INTO v_user_email FROM app_user WHERE id = v_actor;
  
  INSERT INTO activity (org_id, file_id, user_id, user_email, action, details)
  VALUES (
    v_file.org_id, 
    p_file_id, 
    v_actor, 
    COALESCE(v_user_email, 'unknown'),
    'move',
    jsonb_build_object(
      'old_path', v_old_path,
      'new_path', p_new_file_path,
      'old_name', v_old_name,
      'new_name', COALESCE(p_new_file_name, v_old_name)
    )
  );
  
  RETURN v_result;
END;
$$;

-- Get files changed since a specific timestamp (for delta sync)
-- Used by client-side caching to fetch only changed files after initial load
CREATE OR REPLACE FUNCTION vault_file_list_delta(
  p_org_id UUID,
  p_vault_id UUID,
  p_since TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  file_path TEXT,
  file_name TEXT,
  extension TEXT,
  file_type file_type,
  part_number TEXT,
  description TEXT,
  revision TEXT,
  version INT,
  content_hash TEXT,
  file_size BIGINT,
  state TEXT,
  checked_out_by UUID,
  checked_out_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- Kept in step with vault_file_list: a delta-refreshed row that dropped
  -- custom_properties would re-introduce the phantom "modified" state it fixes.
  custom_properties JSONB,
  deleted_at TIMESTAMPTZ,
  is_deleted BOOLEAN,
  -- Kept in step with vault_file_list: see the comment there.
  checked_out_file_path TEXT,
  checked_out_file_name TEXT
) AS $$
BEGIN
  PERFORM org_require_member(p_org_id);
  -- Schema 111: a named vault the caller may not see is refused, not answered
  -- empty (an empty answer reads as "the server has no files" to a client that
  -- holds a local copy); without a vault, only visible vaults are listed.
  IF p_vault_id IS NOT NULL THEN
    PERFORM vault_require_access(p_vault_id);
  END IF;

  RETURN QUERY
  SELECT
    f.id, f.file_path, f.file_name, f.extension, f.file_type,
    f.part_number, f.description, f.revision, f.version,
    f.content_hash, f.file_size, f.state,
    f.checked_out_by, f.checked_out_at, f.updated_at,
    f.custom_properties,
    f.deleted_at,
    (f.deleted_at IS NOT NULL) AS is_deleted,
    f.checked_out_file_path, f.checked_out_file_name
  FROM file f
  WHERE f.org_id = p_org_id
    AND f.vault_id = p_vault_id
    AND (f.updated_at > p_since OR f.deleted_at > p_since)
  ORDER BY f.updated_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION folder_rename(
  p_old_folder_path TEXT,
  p_new_folder_path TEXT,
  p_vault_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INT;
  v_old_prefix TEXT;
  v_new_prefix TEXT;
  v_actor UUID;
  v_org_id UUID;
  v_candidate_vaults UUID[];
BEGIN
  -- The acting user comes from the JWT.
  v_actor := my_actor_id();

  -- p_vault_id defaulted to NULL and NULL meant "every vault", so a single call
  -- rewrote matching paths across every organization in the database. That had
  -- to stop.
  --
  -- The previous release stopped it by refusing outright when p_vault_id was
  -- NULL, which closed the hole and broke a working flow with it: all three
  -- callers pass `activeVaultId || undefined`, and activeVaultId is null until
  -- something sets it - it starts null in vaultsSlice, and a profile that has
  -- connected vaults but has never switched between them still has it null. For
  -- those users renaming a folder began returning "A vault is required".
  --
  -- So NULL is accepted again, but it no longer means "every vault everywhere".
  -- It means "work out which vault, inside the caller's own organization". The
  -- authority is identical either way, because vault access in this schema is
  -- organization membership and nothing more - see vault_require_access(). If
  -- the prefix matches files in more than one of the caller's vaults the call is
  -- refused rather than guessed at, because a folder rename that silently spans
  -- vaults is not something any caller asked for.
  IF p_vault_id IS NOT NULL THEN
    v_org_id := vault_require_access(p_vault_id);
  ELSE
    SELECT u.org_id INTO v_org_id FROM app_user u WHERE u.id = v_actor;

    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Not authorized for this organization'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT array_agg(DISTINCT f.vault_id)
      INTO v_candidate_vaults
    FROM file f
    WHERE f.org_id = v_org_id
      AND f.deleted_at IS NULL
      AND f.vault_id IS NOT NULL
      -- like_pattern_escape, or a folder called `100%` matches half the vault. See
      -- like_pattern_escape() in core.sql.
      AND LOWER(f.file_path) LIKE like_pattern_escape(LOWER(RTRIM(p_old_folder_path, '/'))) || '/%' ESCAPE '\';

    IF v_candidate_vaults IS NULL THEN
      RETURN jsonb_build_object('success', true, 'updated', 0, 'total', 0);
    END IF;

    IF array_length(v_candidate_vaults, 1) > 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'That folder path exists in more than one vault. Open the vault you want to rename in and try again.',
        'updated', 0
      );
    END IF;

    p_vault_id := v_candidate_vaults[1];
    -- Schema 112: the vault found from the path must be one the caller may see.
    PERFORM vault_require_access(p_vault_id);
  END IF;

  -- Schema 112: as file_checkout().
  IF NOT has_team_permission('module:explorer', 'edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to edit files', 'updated', 0);
  END IF;

  v_old_prefix := RTRIM(p_old_folder_path, '/');
  v_new_prefix := RTRIM(p_new_folder_path, '/');

  UPDATE file
  SET
    file_path = v_new_prefix || SUBSTRING(file_path FROM LENGTH(v_old_prefix) + 1),
    updated_by = v_actor,
    updated_at = NOW()
  WHERE
    LOWER(file_path) LIKE like_pattern_escape(LOWER(v_old_prefix)) || '/%' ESCAPE '\'
    AND deleted_at IS NULL
    AND vault_id = p_vault_id
    AND org_id = v_org_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'updated', 0
  );
END;
$$;

-- ===========================================
-- WORKFLOW ENGINE
-- ===========================================
-- Running a transition touches five tables and has to be all-or-nothing, so it
-- lives here rather than in the client. Every guard the UI shows (current state,
-- role membership, checkout) is re-checked here, because the UI is only a hint.

-- Next revision in the org's scheme. Mirrors getNextRevision() in src/types/pdm.ts.
CREATE OR REPLACE FUNCTION revision_get_next(p_current TEXT, p_scheme revision_scheme)
RETURNS TEXT AS $$
DECLARE
  v_chars TEXT[];
  v_index INTEGER;
BEGIN
  IF p_scheme = 'numeric' THEN
    RETURN lpad((COALESCE(NULLIF(regexp_replace(COALESCE(p_current, ''), '\D', '', 'g'), ''), '0')::integer + 1)::text, 2, '0');
  END IF;

  IF p_current IS NULL OR p_current = '' OR p_current = '-' THEN
    RETURN 'A';
  END IF;

  v_chars := string_to_array(upper(p_current), NULL);
  v_index := array_length(v_chars, 1);

  WHILE v_index >= 1 LOOP
    IF v_chars[v_index] = 'Z' THEN
      v_chars[v_index] := 'A';
      v_index := v_index - 1;
    ELSE
      v_chars[v_index] := chr(ascii(v_chars[v_index]) + 1);
      RETURN array_to_string(v_chars, '');
    END IF;
  END LOOP;

  RETURN 'A' || array_to_string(v_chars, '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Legacy file.state value for a workflow state name, or NULL when the name
-- doesn't correspond to one of the five legacy values. NULL means "leave the
-- legacy column alone" rather than "clear it".
CREATE OR REPLACE FUNCTION file_get_legacy_state(p_state_name TEXT)
RETURNS TEXT AS $$
DECLARE
  v_name TEXT;
BEGIN
  v_name := lower(regexp_replace(trim(COALESCE(p_state_name, '')), '\s+', '_', 'g'));

  RETURN CASE v_name
    WHEN 'not_tracked' THEN 'not_tracked'
    WHEN 'wip' THEN 'wip'
    WHEN 'work_in_progress' THEN 'wip'
    WHEN 'draft' THEN 'wip'
    WHEN 'in_review' THEN 'in_review'
    WHEN 'review' THEN 'in_review'
    WHEN 'released' THEN 'released'
    WHEN 'obsolete' THEN 'obsolete'
    WHEN 'archived' THEN 'obsolete'
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- True when the user may run this transition: no roles configured means anyone,
-- otherwise they need one of them. Org admins always may.
CREATE OR REPLACE FUNCTION can_run_transition(p_user_id UUID, p_transition_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_roles UUID[];
BEGIN
  -- A predicate about another person's authority is still information about
  -- them. Callers inside this schema pass the acting user; nobody has a reason
  -- to ask about a user in another organization.
  PERFORM user_require_same_org(p_user_id);

  SELECT allowed_workflow_roles INTO v_roles
  FROM workflow_transition WHERE id = p_transition_id;

  IF v_roles IS NULL OR array_length(v_roles, 1) IS NULL THEN
    RETURN TRUE;
  END IF;

  IF is_org_admin(p_user_id) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM user_workflow_role uwr
    WHERE uwr.user_id = p_user_id AND uwr.workflow_role_id = ANY(v_roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Moves a file into the transition's target state and records the move.
--
-- TWO IDS, TWO CHECKS
--
-- This function takes a file and a transition, and it used to check one of
-- them. file_require_access(p_file_id) is correct and sufficient for the file;
-- p_transition_id was then loaded with `WHERE id = p_transition_id` and tested
-- only for existence. That is file_share_link_create's defect exactly - a gate
-- on one argument while a second argument selects a row - in a function that
-- was in the release manifest of the very release that closed it.
--
-- Executed: a member of one organization applied another organization's
-- classified transition to her own file over HTTP with a real JWT. Her file's
-- workflow_state_id then pointed at a foreign state, and her own
-- workflow_history row carried the other tenant's workflow name, state name and
-- transition name, which she can read. She needed the transition's uuid and RLS
-- gives her no way to find one, so it was hard to exploit and completely open
-- once exploited.
--
-- The transition is now loaded through its workflow's organization, so a
-- transition outside the file's organization is not found rather than applied.
-- check_unbound_entity_args() no longer starts from p_org_id, so a function
-- with this shape and no organization argument at all cannot come back unseen.
CREATE OR REPLACE FUNCTION workflow_transition_apply(
  p_file_id UUID,
  p_transition_id UUID,
  p_comment TEXT,
  p_approvals JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_file file%ROWTYPE;
  v_transition workflow_transition%ROWTYPE;
  v_from_state workflow_state%ROWTYPE;
  v_to_state workflow_state%ROWTYPE;
  v_workflow_name TEXT;
  v_user_email TEXT;
  v_scheme revision_scheme;
  v_new_revision TEXT;
  v_legacy_state TEXT;
  v_actor UUID;
  v_org_id UUID;
BEGIN
  -- The comment above says this is not granted to clients, and it was not
  -- granted to authenticated - but Supabase's default privileges granted it to
  -- anon and to authenticated regardless, so "internal" described the intent
  -- and not the ACL. The REVOKE after this function now names authenticated,
  -- and the function gates for itself as well: the actor comes from the JWT and
  -- the file decides the organization.
  v_actor := my_actor_id();
  v_org_id := file_require_access(p_file_id);

  SELECT * INTO v_file FROM file WHERE id = p_file_id;

  -- The transition has to belong to a workflow of the file's own organization.
  -- Loading it by id alone and testing only that it exists is what let another
  -- tenant's transition be applied to this file; the join is the check, so
  -- there is no second statement anybody can accidentally reorder past.
  SELECT wt.* INTO v_transition
  FROM workflow_transition wt
  JOIN workflow_template wtpl ON wtpl.id = wt.workflow_id
  WHERE wt.id = p_transition_id AND wtpl.org_id = v_org_id;

  SELECT * INTO v_to_state FROM workflow_state WHERE id = v_transition.to_state_id;
  SELECT * INTO v_from_state FROM workflow_state WHERE id = v_transition.from_state_id;
  SELECT name INTO v_workflow_name FROM workflow_template WHERE id = v_transition.workflow_id;
  SELECT email INTO v_user_email FROM app_user WHERE id = v_actor;

  -- A transition belonging to another organization's workflow is not found at
  -- all, and gets the identical refusal to one that does not exist, so this is
  -- not a way to ask which transition ids are real.
  IF v_transition.id IS NULL OR v_to_state.id IS NULL THEN
    RAISE EXCEPTION 'Transition not found'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_new_revision := v_file.revision;
  IF COALESCE(v_to_state.is_revision_auto_incremented, false) THEN
    SELECT COALESCE(revision_scheme, 'letter') INTO v_scheme
    FROM organization WHERE id = v_file.org_id;
    v_new_revision := revision_get_next(v_file.revision, COALESCE(v_scheme, 'letter'));
  END IF;

  v_legacy_state := file_get_legacy_state(v_to_state.name);

  UPDATE file_workflow_assignment
  SET current_state_id = v_to_state.id
  WHERE file_id = p_file_id;

  UPDATE file
  SET workflow_state_id = v_to_state.id,
      state = COALESCE(v_legacy_state, state),
      revision = v_new_revision,
      state_changed_at = NOW(),
      state_changed_by = v_actor,
      updated_at = NOW(),
      updated_by = v_actor
  WHERE id = p_file_id;

  UPDATE file_state_entry
  SET exited_at = NOW(), exited_by = v_actor,
      duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entered_at))::integer)
  WHERE file_id = p_file_id AND exited_at IS NULL;

  INSERT INTO file_state_entry (file_id, state_id, entered_by)
  VALUES (p_file_id, v_to_state.id, v_actor);

  INSERT INTO workflow_history (
    org_id, file_id, file_path, file_name,
    workflow_id, workflow_name,
    from_state_id, from_state_name, to_state_id, to_state_name,
    transition_id, transition_name,
    performed_by, performed_by_email, comment,
    revision_before, revision_after, approvals_data
  ) VALUES (
    v_file.org_id, p_file_id, v_file.file_path, v_file.file_name,
    v_transition.workflow_id, COALESCE(v_workflow_name, ''),
    v_from_state.id, COALESCE(v_from_state.name, ''), v_to_state.id, COALESCE(v_to_state.name, ''),
    p_transition_id, v_transition.name,
    v_actor, COALESCE(v_user_email, ''), p_comment,
    v_file.revision, v_new_revision, p_approvals
  );

  RETURN jsonb_build_object(
    'success', true,
    'requires_review', false,
    'new_state_id', v_to_state.id,
    'new_state_name', v_to_state.name,
    'new_revision', v_new_revision
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Naming authenticated, not only PUBLIC. This is the shared tail of the two
-- entry points below and no client has any business calling it: both of them
-- are SECURITY DEFINER and owned by the same role, so they reach it regardless
-- of who may execute it. REVOKE ... FROM PUBLIC on its own left the explicit
-- `authenticated=X/postgres` that Supabase's default privileges put on every
-- new function, which is how a function documented as internal was callable
-- over PostgREST by any signed-in user - and how the cross-tenant transition
-- above was reached.

-- Run a transition on a file. Returns requires_review instead of advancing when
-- the transition has blocking gates, having raised the reviews they need.

-- File workflows can be switched off for an organization (schema 110):
-- organization.settings.file_workflows_enabled = false. Unset means on, so an
-- organization that never touched the setting keeps its workflows. While off, no
-- transition runs (workflow_transition_execute refuses WORKFLOWS_DISABLED) and an
-- approved review moves nothing.
CREATE OR REPLACE FUNCTION is_org_file_workflows_enabled(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN jsonb_typeof(o.settings -> 'file_workflows_enabled') = 'boolean'
                THEN (o.settings ->> 'file_workflows_enabled')::boolean
           END
    FROM organization o WHERE o.id = p_org_id
  ), true);
$$;

-- Only the definer functions above and below call it; a client reads the setting from its own
-- organization row.

-- The transition an approved review takes a file out of a review stage
-- (workflow_state.is_review_stage) by: the one to the state's
-- review_approved_state_id when that is set, else the state's only outgoing
-- transition. NULL when neither names exactly one.
CREATE OR REPLACE FUNCTION review_stage_get_exit_transition(p_state_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.review_approved_state_id IS NOT NULL THEN (
      SELECT t.id FROM workflow_transition t
      WHERE t.from_state_id = s.id AND t.to_state_id = s.review_approved_state_id
    )
    ELSE (
      SELECT CASE WHEN count(*) = 1 THEN min(t.id::text)::uuid END
      FROM workflow_transition t WHERE t.from_state_id = s.id
    )
  END
  FROM workflow_state s WHERE s.id = p_state_id;
$$;

CREATE OR REPLACE FUNCTION workflow_transition_execute(
  p_file_id UUID,
  p_transition_id UUID,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_file file%ROWTYPE;
  v_transition workflow_transition%ROWTYPE;
  v_current_state_id UUID;
  v_to_state workflow_state%ROWTYPE;
  v_gate workflow_gate%ROWTYPE;
  v_blocking_count INTEGER := 0;
  v_attempt_id UUID;
  v_gate_users UUID[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'You must be signed in to run a transition');
  END IF;

  SELECT * INTO v_file FROM file WHERE id = p_file_id AND deleted_at IS NULL;
  IF v_file.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FILE_NOT_FOUND',
      'error_message', 'File not found');
  END IF;

  -- Was `v_file.org_id <> (SELECT org_id FROM users WHERE id = v_user_id)`,
  -- which is NULL for a caller whose app_user.org_id is NULL, so the refusal did
  -- not fire and the transition ran against another tenant's file. Nothing else
  -- in this function stood between that and the write.
  IF NOT is_org_member(v_file.org_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN',
      'error_message', 'File belongs to another organization');
  END IF;

  -- Schema 111: and to a vault the caller may see.
  IF NOT can_access_vault(v_file.vault_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN',
      'error_message', 'No access to this file''s vault');
  END IF;

  IF NOT is_org_file_workflows_enabled(v_file.org_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WORKFLOWS_DISABLED',
      'error_message', 'File workflows are turned off for this organization');
  END IF;

  -- Scoped to the file's organization, like workflow_transition_apply below it.
  --
  -- This one was not exploitable: a foreign transition's from_state_id can
  -- never equal this file's current state, so the WRONG_STATE test three
  -- statements down refused it. That is a refusal by coincidence - it depends
  -- on a check that exists for a different purpose, and on nobody ever
  -- reordering it. Binding the id where it is loaded makes the refusal a
  -- property of this statement instead of a consequence of a later one.
  SELECT wt.* INTO v_transition
  FROM workflow_transition wt
  JOIN workflow_template wtpl ON wtpl.id = wt.workflow_id
  WHERE wt.id = p_transition_id AND wtpl.org_id = v_file.org_id;

  IF v_transition.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TRANSITION_NOT_FOUND',
      'error_message', 'Transition not found');
  END IF;

  SELECT current_state_id INTO v_current_state_id
  FROM file_workflow_assignment WHERE file_id = p_file_id;

  IF v_current_state_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NO_WORKFLOW',
      'error_message', 'This file is not assigned to a workflow');
  END IF;

  -- The client only offers transitions out of the current state, but it may be
  -- looking at a stale list, and another user may have moved the file already.
  IF v_transition.from_state_id <> v_current_state_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WRONG_STATE',
      'error_message', 'The file is no longer in this transition''s starting state');
  END IF;

  IF NOT can_run_transition(v_user_id, p_transition_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ROLE_REQUIRED',
      'error_message', 'You do not hold a workflow role that allows this transition');
  END IF;

  SELECT * INTO v_to_state FROM workflow_state WHERE id = v_transition.to_state_id;

  IF COALESCE(v_to_state.is_checkout_required, false) AND v_file.checked_out_by IS DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CHECKOUT_REQUIRED',
      'error_message', 'Check the file out before moving it to this state');
  END IF;

  IF NOT COALESCE(v_to_state.is_checkout_required, false) AND v_file.checked_out_by IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CHECKED_OUT',
      'error_message', 'Check the file in before moving it to this state');
  END IF;

  -- Serialize transitions of one file, so two concurrent runs cannot both pass the
  -- duplicate-review test below and open two attempts.
  PERFORM 1 FROM file_workflow_assignment WHERE file_id = p_file_id FOR UPDATE;

  -- Re-running a gated transition must not pile up duplicate reviews.
  IF EXISTS (
    SELECT 1 FROM workflow_gate_review pr
    WHERE pr.file_id = p_file_id AND pr.transition_id = p_transition_id AND pr.status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'requires_review', true,
      'error_code', 'REVIEW_PENDING',
      'error_message', 'This transition is already waiting on a review');
  END IF;

  -- One attempt id for every row this run creates, so gate_review_complete()
  -- counts approvals of this attempt only (schema 107).
  --
  -- Per-reviewer rows. A gate that names reviewers gets one row assigned to each
  -- user its rules resolve to, so 'all' and 'majority' have a real denominator and
  -- "two of three engineers" is expressible. A gate that names nobody (anyone with
  -- module:reviews:edit), or whose rules resolve to nobody (administrators only,
  -- through the override), gets GREATEST(1, required_approvals) unassigned slots;
  -- gate_review_complete() lets one person fill only one slot of a gate per attempt.
  v_attempt_id := gen_random_uuid();

  FOR v_gate IN
    SELECT * FROM workflow_gate
    WHERE transition_id = p_transition_id AND COALESCE(is_blocking, true)
    ORDER BY sort_order
  LOOP
    v_gate_users := ARRAY(SELECT gate_reviewer_list_user_ids(v_gate.id, v_file.org_id));

    IF cardinality(v_gate_users) > 0 THEN
      INSERT INTO workflow_gate_review (org_id, file_id, transition_id, gate_id, requested_by, status, assignee_id, attempt_id)
      SELECT v_file.org_id, p_file_id, p_transition_id, v_gate.id, v_user_id, 'pending', u, v_attempt_id
      FROM unnest(v_gate_users) AS u;
    ELSE
      INSERT INTO workflow_gate_review (org_id, file_id, transition_id, gate_id, requested_by, status, attempt_id)
      SELECT v_file.org_id, p_file_id, p_transition_id, v_gate.id, v_user_id, 'pending', v_attempt_id
      FROM generate_series(1, GREATEST(1, COALESCE(v_gate.required_approvals, 1)));
    END IF;
    v_blocking_count := v_blocking_count + 1;
  END LOOP;

  IF v_blocking_count > 0 THEN
    RETURN jsonb_build_object('success', true, 'requires_review', true,
      'new_state_id', NULL, 'new_state_name', NULL);
  END IF;

  RETURN workflow_transition_apply(p_file_id, p_transition_id, p_comment, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Run the single transition out of the file's current state that lands on a
-- legacy state name ('released', 'obsolete', ...). This is what the REST
-- endpoints use so they go through the same guards as the desktop app.
CREATE OR REPLACE FUNCTION workflow_transition_execute_to_legacy_state(
  p_file_id UUID,
  p_target_state TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_current_state_id UUID;
  v_matches UUID[];
BEGIN
  -- workflow_transition_execute() at the end of this function does check the
  -- caller, but everything above it - which transitions exist out of this file's
  -- current state, and whether the file has a workflow at all - answered for any
  -- file id given to it. Gate before reading rather than before writing.
  -- The gate is the only statement in this block, and it must stay that way.
  -- The handler below turns a refusal into a JSON result, which is what these
  -- RPCs need - but it will do that for anything raised in here, so a second
  -- check added after this line would have its RAISE swallowed and the function
  -- would carry on and answer. New checks go before the BEGIN.
  BEGIN
    PERFORM file_require_access(p_file_id);
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FILE_NOT_FOUND',
      'error_message', 'File not found');
  END;

  SELECT current_state_id INTO v_current_state_id
  FROM file_workflow_assignment WHERE file_id = p_file_id;

  IF v_current_state_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NO_WORKFLOW',
      'error_message', 'This file is not assigned to a workflow');
  END IF;

  SELECT array_agg(wt.id) INTO v_matches
  FROM workflow_transition wt
  JOIN workflow_state ws ON ws.id = wt.to_state_id
  WHERE wt.from_state_id = v_current_state_id
    AND file_get_legacy_state(ws.name) = p_target_state;

  IF v_matches IS NULL OR array_length(v_matches, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NO_TRANSITION',
      'error_message', format('The workflow has no transition from the current state to %s', p_target_state));
  END IF;

  IF array_length(v_matches, 1) > 1 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'AMBIGUOUS_TRANSITION',
      'error_message', format('The workflow has more than one transition to %s; pick one explicitly', p_target_state));
  END IF;

  RETURN workflow_transition_execute(p_file_id, v_matches[1], p_comment);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- WHO MAY DECIDE AN UNASSIGNED GATE, ASKED ONCE
--
-- gate_review_complete() enforced reviewer identity only when the review named
-- an assignee: `IF assignee_id IS NOT NULL AND assignee_id <> caller AND NOT
-- is_org_admin(...)`. An unassigned gate fell straight through to the
-- organization membership test above it, so any member of the organization
-- could approve any unassigned gate through the sanctioned RPC and have their
-- own id written into workflow_review_history as the approver.
--
-- The rule for an unassigned gate was not missing from the schema. It was
-- already written out in gate_review_list_mine(), which decides whether the
-- review is offered to a user at all - so the list of reviews a user was shown
-- and the set of reviews the database would accept from them were two different
-- answers to one question. They are one answer now. file_share_link_admit() in
-- this module is the same lesson learned the same way: validate and consume
-- each kept their own copy of the conditions, and they drifted.
--
-- One deliberate change to the rule as gate_review_list_mine() stated it: a
-- gate that names no reviewers at all used to mean "anybody in the
-- organization", and now means "anybody holding module:reviews:edit". That
-- fallback is where the hole actually lived. A gate that does name its
-- reviewers is unaffected, and so is every user it names.
--
-- p_user_id must be the calling user or another member of their organization -
-- has_user_permission() raises otherwise, which is its documented contract and
-- not a case either caller here can reach.
-- The role a gate's reviewer_type = 'role' rule is matched against (schema 107).
-- There is one definition of admin - app_user.role = 'admin' OR membership of the
-- Administrators team, which is is_org_admin() - so a team member whose role
-- column says engineer is an admin here too, the same answer the renderer's
-- getEffectiveRole() gives. Comparing the role column alone, as can_review_gate
-- did, hid admin-gated reviews from Administrators-team members.
CREATE OR REPLACE FUNCTION user_get_effective_role(p_user_id UUID)
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN is_org_admin(u.id) THEN 'admin'::user_role ELSE u.role END
  FROM app_user u WHERE u.id = p_user_id;
$$;

-- The users of an organization a gate's reviewer rules name, for the per-reviewer
-- rows workflow_transition_execute() creates. Same three rules as can_review_gate()
-- ('group' still matches nothing - there is no group table).
CREATE OR REPLACE FUNCTION gate_reviewer_list_user_ids(p_gate_id UUID, p_org_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM app_user u
  WHERE u.org_id = p_org_id
    AND EXISTS (
      SELECT 1 FROM workflow_gate_reviewer gr
      WHERE gr.gate_id = p_gate_id
        AND (
          (gr.reviewer_type = 'user' AND gr.user_id = u.id)
          OR (gr.reviewer_type = 'role' AND gr.role = user_get_effective_role(u.id))
          OR (gr.reviewer_type = 'workflow_role' AND EXISTS (
                SELECT 1 FROM user_workflow_role uwr
                WHERE uwr.user_id = u.id AND uwr.workflow_role_id = gr.workflow_role_id))
        )
    )
  ORDER BY u.id;
$$;

CREATE OR REPLACE FUNCTION can_review_gate(p_gate_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_role user_role;
BEGIN
  IF p_gate_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Effective role, not the role column (schema 107): see user_get_effective_role().
  v_role := user_get_effective_role(p_user_id);

  IF NOT EXISTS (SELECT 1 FROM workflow_gate_reviewer gr WHERE gr.gate_id = p_gate_id) THEN
    RETURN has_user_permission(p_user_id, 'module:reviews', 'edit');
  END IF;

  -- Transplanted from gate_review_list_mine() unchanged, deliberately: this is
  -- the rule users already see, and rewriting it while moving it would make any
  -- resulting difference impossible to attribute.
  --
  -- reviewer_type has a fourth label, 'group', and neither this nor the list it
  -- came from has ever matched it - workflow_gate_reviewer.group_name is not
  -- joined to anything, because there is no group table. The consequence has
  -- changed direction, though, and that is worth being explicit about: a gate
  -- whose reviewers are all 'group' rows was previously approvable by any member
  -- of the organization, because gate_review_complete() fell through to the
  -- membership test, and is now approvable only by an administrator, via the
  -- override in gate_review_complete(). Restrictive rather than open, and not a
  -- lockout. addGateReviewer (src/lib/supabase/teams.ts:431) only ever writes
  -- 'user' or 'workflow_role', so no gate the application built can be in this
  -- state; one built by hand can. Resolving 'group' properly needs a group
  -- table and is a product decision, not a security fix.
  RETURN EXISTS (
    SELECT 1 FROM workflow_gate_reviewer gr
     WHERE gr.gate_id = p_gate_id
       AND (
         (gr.reviewer_type = 'user' AND gr.user_id = p_user_id)
         OR (gr.reviewer_type = 'role' AND gr.role = v_role)
         OR (gr.reviewer_type = 'workflow_role' AND EXISTS (
               SELECT 1 FROM user_workflow_role uwr
                WHERE uwr.user_id = p_user_id
                  AND uwr.workflow_role_id = gr.workflow_role_id))
       )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Reached only from the two SECURITY DEFINER functions below, which run as the
-- owner and do not need a grant. Nothing calls it over PostgREST.

-- The gate review rows waiting on a user (schema 107), in one place for
-- gate_review_list_mine(), review_list_queue() and review_count_badge():
--   * rows assigned to them, and
--   * one unassigned slot per (attempt, gate) whose rules admit them, unless they
--     have already decided a row of that gate in that attempt - one person, one
--     vote per gate per attempt.
CREATE OR REPLACE FUNCTION gate_review_list_awaiting_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id
  FROM workflow_gate_review pr
  JOIN app_user me ON me.id = p_user_id AND me.org_id = pr.org_id
  WHERE pr.status = 'pending'
    AND pr.assignee_id = p_user_id
  UNION ALL
  SELECT s.id FROM (
    SELECT DISTINCT ON (pr.attempt_id, pr.gate_id) pr.id
    FROM workflow_gate_review pr
    JOIN app_user me ON me.id = p_user_id AND me.org_id = pr.org_id
    WHERE pr.status = 'pending'
      AND pr.assignee_id IS NULL
      AND can_review_gate(pr.gate_id, p_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM workflow_gate_review d
        WHERE d.attempt_id = pr.attempt_id
          AND d.gate_id = pr.gate_id
          AND (d.reviewed_by = p_user_id OR d.assignee_id = p_user_id)
      )
    ORDER BY pr.attempt_id, pr.gate_id, pr.id
  ) s;
$$;

-- Record one reviewer's decision on a gate and, when that clears the last
-- blocking gate, perform the advance the reviews were holding up.
CREATE OR REPLACE FUNCTION gate_review_complete(
  p_pending_review_id UUID,
  p_decision review_status,
  p_comment TEXT DEFAULT NULL,
  p_checklist_responses JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_review workflow_gate_review%ROWTYPE;
  v_gate workflow_gate%ROWTYPE;
  v_file file%ROWTYPE;
  v_transition workflow_transition%ROWTYPE;
  v_workflow_name TEXT;
  v_from_state_name TEXT;
  v_to_state_name TEXT;
  v_requested_by_email TEXT;
  v_reviewer_email TEXT;
  v_approvals INTEGER;
  v_rejections INTEGER;
  v_reviewers INTEGER;
  v_needed INTEGER;
  v_requested_by UUID;
  v_still_open INTEGER;
  v_attempt_id UUID;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'You must be signed in to review');
  END IF;

  IF p_decision NOT IN ('approved', 'rejected', 'kicked_back') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'BAD_DECISION',
      'error_message', 'A review decision must be approved, rejected or kicked_back');
  END IF;

  -- Read the attempt first, unlocked, then lock every row of the attempt in id
  -- order (schema 107). Locking only this row let two reviewers approving the last
  -- two gates of a transition at the same moment each see the other's row still
  -- pending, so neither applied the transition. Locking this row first and the
  -- rest afterwards would deadlock two such callers instead.
  SELECT pr.attempt_id, pr.org_id INTO v_attempt_id, v_org_id
  FROM workflow_gate_review pr WHERE pr.id = p_pending_review_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'REVIEW_NOT_FOUND',
      'error_message', 'Review not found');
  END IF;

  -- NULL-unsafe in the same way as workflow_transition_execute above.
  IF NOT is_org_member(v_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN',
      'error_message', 'Review belongs to another organization');
  END IF;

  -- Schema 111: a reviewer must be able to see the file's vault. Without this
  -- the decision would be recorded and the transition it completes would then
  -- be refused by file_require_access(), rolling the whole call back.
  IF NOT can_access_vault((SELECT f.vault_id FROM workflow_gate_review pr JOIN file f ON f.id = pr.file_id
                            WHERE pr.id = p_pending_review_id)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NO_VAULT_ACCESS',
      'error_message', 'You do not have access to this file''s vault');
  END IF;

  PERFORM 1 FROM workflow_gate_review pr
  WHERE pr.attempt_id = v_attempt_id
  ORDER BY pr.id
  FOR UPDATE;

  SELECT * INTO v_review FROM workflow_gate_review WHERE id = p_pending_review_id;

  IF v_review.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_DECIDED',
      'error_message', 'This review has already been decided');
  END IF;

  -- One person, one vote per gate per attempt: a second unassigned slot, or an
  -- administrator standing in twice, must not count the same reviewer again.
  IF EXISTS (
    SELECT 1 FROM workflow_gate_review d
    WHERE d.attempt_id = v_review.attempt_id
      AND d.gate_id = v_review.gate_id
      AND d.reviewed_by = v_user_id
      AND d.status IN ('approved', 'rejected', 'kicked_back')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ALREADY_REVIEWED',
      'error_message', 'You have already decided this gate');
  END IF;

  -- Assigned: the assignee, or an administrator standing in for them.
  -- Unassigned: whoever the gate's own reviewer rules admit. Before this
  -- release the unassigned branch did not exist and any member could approve.
  IF v_review.assignee_id IS NOT NULL THEN
    IF v_review.assignee_id <> v_user_id AND NOT is_org_admin(v_user_id) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'NOT_ASSIGNED',
        'error_message', 'This review is assigned to someone else');
    END IF;
  ELSIF NOT can_review_gate(v_review.gate_id, v_user_id)
        AND NOT is_org_admin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_A_REVIEWER',
      'error_message', 'You are not a reviewer for this gate');
  END IF;

  SELECT * INTO v_gate FROM workflow_gate WHERE id = v_review.gate_id;
  SELECT * INTO v_file FROM file WHERE id = v_review.file_id;
  SELECT * INTO v_transition FROM workflow_transition WHERE id = v_review.transition_id;
  SELECT name INTO v_workflow_name FROM workflow_template WHERE id = v_transition.workflow_id;
  SELECT name INTO v_from_state_name FROM workflow_state WHERE id = v_transition.from_state_id;
  SELECT name INTO v_to_state_name FROM workflow_state WHERE id = v_transition.to_state_id;
  SELECT email INTO v_requested_by_email FROM app_user WHERE id = v_review.requested_by;
  SELECT email INTO v_reviewer_email FROM app_user WHERE id = v_user_id;

  UPDATE workflow_gate_review
  SET status = p_decision,
      reviewed_by = v_user_id,
      reviewed_at = NOW(),
      review_comment = p_comment,
      checklist_responses = COALESCE(p_checklist_responses, '{}'::jsonb)
  WHERE id = p_pending_review_id;

  INSERT INTO workflow_review_history (
    org_id, file_id, file_path, file_name,
    workflow_id, workflow_name, transition_id,
    from_state_name, to_state_name, gate_id, gate_name,
    requested_by, requested_by_email, requested_at,
    reviewed_by, reviewed_by_email, reviewed_at,
    decision, comment, checklist_responses
  ) VALUES (
    v_review.org_id, v_review.file_id, COALESCE(v_file.file_path, ''), COALESCE(v_file.file_name, ''),
    v_transition.workflow_id, COALESCE(v_workflow_name, ''), v_review.transition_id,
    COALESCE(v_from_state_name, ''), COALESCE(v_to_state_name, ''), v_review.gate_id, COALESCE(v_gate.name, ''),
    v_review.requested_by, COALESCE(v_requested_by_email, ''), v_review.requested_at,
    v_user_id, COALESCE(v_reviewer_email, ''), NOW(),
    p_decision::text, p_comment, COALESCE(p_checklist_responses, '{}'::jsonb)
  );

  -- A rejection is a veto and ends the attempt: cancel the rest of this attempt's
  -- rows so the requester can resubmit rather than being stuck behind reviews
  -- nobody can action. Scoped to the attempt (schema 107) - earlier attempts are
  -- history and are left as they are.
  IF p_decision IN ('rejected', 'kicked_back') THEN
    UPDATE workflow_gate_review
    SET status = 'cancelled'
    WHERE attempt_id = v_review.attempt_id
      AND status = 'pending';

    RETURN jsonb_build_object('success', true, 'requires_review', false,
      'rejected', true);
  END IF;

  -- Has this gate collected the approvals its mode calls for? Counted over this
  -- attempt's rows of this gate only, one row per reviewer (or per unassigned slot).
  SELECT count(*) FILTER (WHERE status = 'approved'),
         count(*) FILTER (WHERE status IN ('rejected', 'kicked_back')),
         count(*)
    INTO v_approvals, v_rejections, v_reviewers
  FROM workflow_gate_review
  WHERE attempt_id = v_review.attempt_id
    AND gate_id = v_review.gate_id;

  -- 'any' asks for required_approvals, capped at the number of reviewers the gate
  -- actually has, so a gate asking for three approvals from two named people is
  -- satisfiable rather than a permanent lock.
  v_needed := CASE COALESCE(v_gate.approval_mode, 'any')
    WHEN 'all' THEN v_reviewers
    WHEN 'majority' THEN (v_reviewers / 2) + 1
    ELSE LEAST(v_reviewers, GREATEST(1, COALESCE(v_gate.required_approvals, 1)))
  END;

  IF v_approvals < v_needed THEN
    RETURN jsonb_build_object('success', true, 'requires_review', true,
      'approvals', v_approvals, 'approvals_needed', v_needed);
  END IF;

  -- This gate is satisfied: the slots nobody needs to fill any more are closed,
  -- so they stop appearing in queues and stop holding the transition open.
  UPDATE workflow_gate_review
  SET status = 'cancelled'
  WHERE attempt_id = v_review.attempt_id
    AND gate_id = v_review.gate_id
    AND status = 'pending';

  -- The transition still waits on any other gate of this attempt.
  SELECT count(*) INTO v_still_open
  FROM workflow_gate_review
  WHERE attempt_id = v_review.attempt_id
    AND status = 'pending';

  IF v_still_open > 0 THEN
    RETURN jsonb_build_object('success', true, 'requires_review', true,
      'approvals', v_approvals, 'approvals_needed', v_needed);
  END IF;

  SELECT requested_by INTO v_requested_by
  FROM workflow_gate_review
  WHERE attempt_id = v_review.attempt_id
  ORDER BY requested_at LIMIT 1;

  RETURN workflow_transition_apply(
    v_review.file_id,
    v_review.transition_id,
    p_comment,
    jsonb_build_object('approved_by', v_user_id, 'approvals', v_approvals)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Reviews waiting on the calling user: either assigned to them, or unassigned
-- and matching a reviewer rule on the gate.
--
-- The reviewer rule is can_review_gate() and is not restated here, because this
-- function used to be the only place it was written down while
-- gate_review_complete() enforced something weaker - so the reviews a user was
-- offered and the reviews the database would accept from them were two
-- different sets.
--
-- The one thing the two do not share is gate_review_complete()'s administrator
-- override, and that is deliberate rather than drift: this function answers
-- "which reviews are waiting on you", and an administrator being *able* to
-- stand in for an absent reviewer is not the same as every pending review in
-- the organization waiting on them.
CREATE OR REPLACE FUNCTION gate_review_list_mine()
RETURNS TABLE (
  review_id UUID,
  file_id UUID,
  file_name TEXT,
  file_path TEXT,
  gate_id UUID,
  gate_name TEXT,
  gate_type gate_type,
  transition_id UUID,
  transition_name TEXT,
  from_state_name TEXT,
  to_state_name TEXT,
  requested_by UUID,
  requested_by_email TEXT,
  requested_at TIMESTAMPTZ,
  checklist_items JSONB
) AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT u.org_id INTO v_org_id FROM app_user u WHERE u.id = v_user_id;

  RETURN QUERY
  SELECT
    pr.id,
    f.id,
    f.file_name,
    f.file_path,
    wg.id,
    wg.name,
    wg.gate_type,
    wt.id,
    wt.name,
    fs.name,
    ts.name,
    pr.requested_by,
    ru.email,
    pr.requested_at,
    wg.checklist_items
  FROM workflow_gate_review pr
  JOIN file f ON f.id = pr.file_id
  JOIN workflow_gate wg ON wg.id = pr.gate_id
  JOIN workflow_transition wt ON wt.id = pr.transition_id
  LEFT JOIN workflow_state fs ON fs.id = wt.from_state_id
  LEFT JOIN workflow_state ts ON ts.id = wt.to_state_id
  LEFT JOIN app_user ru ON ru.id = pr.requested_by
  WHERE pr.status = 'pending'
    AND pr.org_id = v_org_id
    -- Schema 111: only files the caller may see (gate_review_complete refuses the rest).
    AND can_access_vault(f.vault_id)
    AND (
      pr.assignee_id = v_user_id
      OR (pr.assignee_id IS NULL AND can_review_gate(wg.id, v_user_id))
    )
    -- Schema 105: one unassigned slot per (attempt, gate), and none once the user
    -- has decided that gate in that attempt. gate_review_list_awaiting_ids() is the
    -- single statement of that rule; the test above stays as the reviewer rule.
    AND pr.id IN (SELECT gate_review_list_awaiting_ids(v_user_id))
  ORDER BY pr.requested_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ===========================================
-- VERSION-ACCURATE REFERENCES (schema 107)
-- ===========================================

-- Record the references of one checked-in version. Called by the client right
-- after check-in, from the same reference extraction that fills file_reference.
--
-- p_refs is a JSON array of
--   { child_file_id?, child_content_hash?, child_path?, configuration?,
--     reference_type?, quantity? }
-- The child version is resolved here, not taken from the client: the child's
-- version whose content hash equals child_content_hash (exact), else the child's
-- latest version (not exact), else none. A child_file_id outside the caller's
-- organization is treated as unresolved rather than trusted. Write-once (schema
-- 108): only the author may replace a recorded set, and only while the version
-- is the file's newest, so a retried check-in is harmless but history is not
-- rewritten.
CREATE OR REPLACE FUNCTION file_version_reference_record(p_file_version_id UUID, p_refs JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_file_id UUID;
  v_created_by UUID;
  v_recorded_at TIMESTAMPTZ;
  v_org_id UUID;
  v_written INTEGER := 0;
  v_exact INTEGER := 0;
  v_unresolved INTEGER := 0;
BEGIN
  v_actor := my_actor_id();

  IF p_refs IS NULL OR jsonb_typeof(p_refs) <> 'array' THEN
    RAISE EXCEPTION 'References must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_array_length(p_refs) > 10000 THEN
    RAISE EXCEPTION 'Too many references for one version (%)', jsonb_array_length(p_refs)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT fv.file_id, fv.created_by INTO v_file_id, v_created_by
  FROM file_version fv WHERE fv.id = p_file_version_id;
  IF v_file_id IS NULL THEN
    RAISE EXCEPTION 'File version not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_org_id := file_require_access(v_file_id);

  IF v_created_by IS DISTINCT FROM v_actor
     AND NOT has_team_permission('module:explorer', 'edit') THEN
    RAISE EXCEPTION 'Not allowed to record references for this version'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- One writer per version at a time.
  SELECT fv.references_recorded_at INTO v_recorded_at
  FROM file_version fv WHERE fv.id = p_file_version_id FOR UPDATE;

  -- Schema 108: a recorded set is history (a review's dependency closure was
  -- built from it), so it is written once. The one exception is the author
  -- retrying the check-in of the file's newest version.
  IF v_recorded_at IS NOT NULL AND (
       v_created_by IS DISTINCT FROM v_actor
       OR EXISTS (SELECT 1 FROM file_version nv
                  WHERE nv.file_id = v_file_id
                    AND nv.version > (SELECT fv.version FROM file_version fv WHERE fv.id = p_file_version_id))
     ) THEN
    RAISE EXCEPTION 'References for this version are already recorded'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REFERENCES_RECORDED';
  END IF;

  DELETE FROM file_version_reference r WHERE r.parent_version_id = p_file_version_id;

  WITH refs_in AS (
    SELECT
      NULLIF(e->>'child_file_id', '')::uuid AS child_file_id,
      lower(NULLIF(btrim(e->>'child_content_hash'), '')) AS child_hash,
      NULLIF(btrim(e->>'child_path'), '') AS child_path,
      NULLIF(e->>'configuration', '') AS configuration,
      COALESCE(NULLIF(e->>'reference_type', ''), 'component')::reference_type AS reference_type,
      GREATEST(1, COALESCE(NULLIF(e->>'quantity', '')::integer, 1)) AS quantity
    FROM jsonb_array_elements(p_refs) AS e
  ),
  resolved AS (
    SELECT
      cf.id AS child_file_id,
      COALESCE(i.child_path, cf.file_path) AS child_path,
      i.configuration,
      i.reference_type,
      i.quantity,
      (SELECT cv.id FROM file_version cv
        WHERE cv.file_id = cf.id AND i.child_hash IS NOT NULL AND cv.content_hash = i.child_hash
        ORDER BY cv.version DESC LIMIT 1) AS exact_version_id,
      (SELECT cv.id FROM file_version cv
        WHERE cv.file_id = cf.id
        ORDER BY cv.version DESC LIMIT 1) AS latest_version_id
    FROM refs_in i
    LEFT JOIN file cf ON cf.id = i.child_file_id AND cf.org_id = v_org_id
  )
  INSERT INTO file_version_reference (
    org_id, parent_version_id, parent_file_id, child_file_id, child_version_id,
    child_path, configuration, reference_type, quantity, is_exact
  )
  -- One row per (path, configuration), the unique key. Repeated references (several
  -- instances of one part) add up their quantities; doing it here rather than with
  -- ON CONFLICT DO UPDATE, which refuses to touch the same row twice in a statement.
  SELECT v_org_id, p_file_version_id, v_file_id,
         (array_agg(rs.child_file_id ORDER BY rs.child_file_id NULLS LAST))[1],
         (array_agg(COALESCE(rs.exact_version_id, rs.latest_version_id)
                    ORDER BY (rs.exact_version_id IS NULL), rs.child_file_id NULLS LAST))[1],
         min(rs.child_path),
         NULLIF(COALESCE(rs.configuration, ''), ''),
         (array_agg(rs.reference_type))[1],
         sum(rs.quantity)::integer,
         bool_or(rs.exact_version_id IS NOT NULL)
  FROM resolved rs
  WHERE rs.child_path IS NOT NULL
    AND rs.child_file_id IS DISTINCT FROM v_file_id
  GROUP BY lower(rs.child_path), COALESCE(rs.configuration, '');

  UPDATE file_version SET references_recorded_at = NOW() WHERE id = p_file_version_id;

  SELECT count(*), count(*) FILTER (WHERE r.is_exact), count(*) FILTER (WHERE r.child_version_id IS NULL)
    INTO v_written, v_exact, v_unresolved
  FROM file_version_reference r WHERE r.parent_version_id = p_file_version_id;

  RETURN jsonb_build_object(
    'written', v_written,
    'exact', v_exact,
    'approximate', v_written - v_exact - v_unresolved,
    'unresolved', v_unresolved
  );
END;
$$;

-- One level of the reference graph below a set of parent versions, for
-- file_version_get_dependency_closure(). A version with a recorded reference set uses
-- it. A version from before schema 107 (references_recorded_at IS NULL) falls back
-- to file_reference - what the parent file references now - with each child at
-- the version that was current when the parent version was created, or the
-- child's first version if it had none yet. Fallback edges are never exact.
CREATE OR REPLACE FUNCTION file_version_reference_list_edges(p_parent_version_ids UUID[], p_org_id UUID)
RETURNS TABLE (
  parent_version_id UUID,
  child_file_id UUID,
  child_version_id UUID,
  child_path TEXT,
  configuration TEXT,
  reference_type TEXT,
  quantity INTEGER,
  is_exact BOOLEAN,
  edge_source TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.parent_version_id, r.child_file_id, r.child_version_id, r.child_path,
         r.configuration, r.reference_type::text, r.quantity, r.is_exact, 'recorded'::text
  FROM file_version_reference r
  WHERE r.parent_version_id = ANY (p_parent_version_ids)
    AND r.org_id = p_org_id
  UNION ALL
  SELECT pv.id, fr.child_file_id,
         COALESCE(
           (SELECT cv.id FROM file_version cv
             WHERE cv.file_id = fr.child_file_id AND cv.created_at <= pv.created_at
             ORDER BY cv.version DESC LIMIT 1),
           (SELECT cv.id FROM file_version cv
             WHERE cv.file_id = fr.child_file_id
             ORDER BY cv.version ASC LIMIT 1)),
         cf.file_path, fr.configuration, fr.reference_type::text,
         GREATEST(1, COALESCE(fr.quantity, 1)), false, 'fallback'::text
  FROM file_version pv
  JOIN file pf ON pf.id = pv.file_id AND pf.org_id = p_org_id
  JOIN file_reference fr ON fr.parent_file_id = pv.file_id AND fr.org_id = p_org_id
  JOIN file cf ON cf.id = fr.child_file_id AND cf.org_id = p_org_id
  WHERE pv.id = ANY (p_parent_version_ids)
    AND pv.references_recorded_at IS NULL;
$$;

-- Everything a file version needs, at the versions it needs them: the root row
-- (depth 0) and one row per reference edge reached below it, breadth first. Each
-- child version is expanded once, so a subassembly used in ten places is walked
-- once while all ten edges are still returned.
--
-- exact is false when the edge was approximate (fallback, or no hash match at
-- check-in) or when the parent it hangs from was reached only through approximate
-- edges. missing is true when no child version could be resolved: a reference
-- outside the vault, or a child with no version. The caller shows exact against
-- approximate; it never pretends.
CREATE OR REPLACE FUNCTION file_version_get_dependency_closure(p_file_version_id UUID)
RETURNS TABLE (
  depth INTEGER,
  parent_version_id UUID,
  file_id UUID,
  file_version_id UUID,
  reference_path TEXT,
  configuration TEXT,
  reference_type TEXT,
  quantity INTEGER,
  is_exact BOOLEAN,
  edge_source TEXT,
  missing BOOLEAN,
  version INTEGER,
  revision TEXT,
  content_hash TEXT,
  file_size BIGINT,
  file_name TEXT,
  file_path TEXT,
  extension TEXT,
  vault_id UUID,
  deleted BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_file_id UUID;
  v_org_id UUID;
  v_frontier UUID[];
  v_seen UUID[];
  v_inexact UUID[] := '{}'::UUID[];
  v_next UUID[];
  v_next_inexact UUID[];
  v_depth INTEGER := 0;
BEGIN
  SELECT fv.file_id INTO v_file_id FROM file_version fv WHERE fv.id = p_file_version_id;
  IF v_file_id IS NULL THEN
    RAISE EXCEPTION 'File version not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_org_id := file_require_access(v_file_id);

  RETURN QUERY
  SELECT 0, NULL::uuid, f.id, fv.id, f.file_path, NULL::text, NULL::text, 1, true,
         'root'::text, false, fv.version, fv.revision, fv.content_hash, fv.file_size,
         f.file_name, f.file_path, f.extension, f.vault_id, f.deleted_at IS NOT NULL
  FROM file_version fv
  JOIN file f ON f.id = fv.file_id
  WHERE fv.id = p_file_version_id;

  v_frontier := ARRAY[p_file_version_id];
  v_seen := v_frontier;

  WHILE cardinality(v_frontier) > 0 AND v_depth < 64 LOOP
    v_depth := v_depth + 1;

    RETURN QUERY
    SELECT v_depth, e.parent_version_id, COALESCE(cv.file_id, e.child_file_id), e.child_version_id,
           e.child_path, e.configuration, e.reference_type, e.quantity,
           (e.is_exact AND NOT (e.parent_version_id = ANY (v_inexact))),
           e.edge_source, e.child_version_id IS NULL,
           cv.version, cv.revision, cv.content_hash, cv.file_size,
           cf.file_name, cf.file_path, cf.extension, cf.vault_id,
           COALESCE(cf.deleted_at IS NOT NULL, false)
    FROM file_version_reference_list_edges(v_frontier, v_org_id) e
    LEFT JOIN file_version cv ON cv.id = e.child_version_id
    LEFT JOIN file cf ON cf.id = COALESCE(cv.file_id, e.child_file_id);

    SELECT COALESCE(array_agg(x.child_version_id), '{}'::UUID[]),
           COALESCE(array_agg(x.child_version_id) FILTER (WHERE NOT x.any_exact), '{}'::UUID[])
      INTO v_next, v_next_inexact
    FROM (
      SELECT e.child_version_id,
             bool_or(e.is_exact AND NOT (e.parent_version_id = ANY (v_inexact))) AS any_exact
      FROM file_version_reference_list_edges(v_frontier, v_org_id) e
      WHERE e.child_version_id IS NOT NULL
        AND NOT (e.child_version_id = ANY (v_seen))
      GROUP BY e.child_version_id
    ) x;

    v_inexact := v_inexact || v_next_inexact;
    v_seen := v_seen || v_next;
    v_frontier := v_next;
  END LOOP;
END;
$$;

-- ===========================================
-- DRAWING PDF RENDERS (schema 107)
-- ===========================================

-- The stored PDF of a file version, or no row when none has been generated.
CREATE OR REPLACE FUNCTION drawing_pdf_render_get(p_file_version_id UUID)
RETURNS TABLE (
  file_version_id UUID,
  file_id UUID,
  storage_hash TEXT,
  file_size BIGINT,
  is_closure_exact BOOLEAN,
  generated_by UUID,
  generated_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_file_id UUID;
  v_org_id UUID;
BEGIN
  SELECT fv.file_id INTO v_file_id FROM file_version fv WHERE fv.id = p_file_version_id;
  IF v_file_id IS NULL THEN
    RAISE EXCEPTION 'File version not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_org_id := file_require_access(v_file_id);

  RETURN QUERY
  SELECT d.file_version_id, d.file_id, d.storage_hash, d.file_size, d.is_closure_exact,
         d.generated_by, d.generated_at
  FROM drawing_pdf_render d
  WHERE d.file_version_id = p_file_version_id
    AND d.org_id = v_org_id;
END;
$$;

-- Record the PDF generated for a file version. The PDF itself is uploaded first,
-- content-addressed, to the vault bucket; this records which hash it is.
--
-- First write wins. Recording the same hash again is a no-op (a retry). A
-- different hash for a version that already has a render is refused unless the
-- caller is an administrator, because reviewers must not see the drawing they
-- are approving change under them.
CREATE OR REPLACE FUNCTION drawing_pdf_render_record(
  p_file_version_id UUID,
  p_storage_hash TEXT,
  p_file_size BIGINT,
  p_closure_exact BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_file_id UUID;
  v_org_id UUID;
  v_hash TEXT;
  v_existing drawing_pdf_render%ROWTYPE;
BEGIN
  v_actor := my_actor_id();
  v_hash := lower(btrim(COALESCE(p_storage_hash, '')));

  IF v_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Storage hash must be a SHA-256 hex digest'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_file_size IS NULL OR p_file_size <= 0 THEN
    RAISE EXCEPTION 'File size must be positive'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT fv.file_id INTO v_file_id FROM file_version fv WHERE fv.id = p_file_version_id;
  IF v_file_id IS NULL THEN
    RAISE EXCEPTION 'File version not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_org_id := file_require_access(v_file_id);

  SELECT * INTO v_existing FROM drawing_pdf_render d
  WHERE d.file_version_id = p_file_version_id AND d.org_id = v_org_id
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.storage_hash = v_hash THEN
      RETURN jsonb_build_object('recorded', false, 'replaced', false, 'storage_hash', v_hash);
    END IF;
    IF NOT is_org_admin() THEN
      RAISE EXCEPTION 'A PDF is already recorded for this version'
        USING ERRCODE = 'unique_violation', HINT = 'PDF_EXISTS';
    END IF;
    UPDATE drawing_pdf_render
    SET storage_hash = v_hash, file_size = p_file_size, is_closure_exact = p_closure_exact,
        generated_by = v_actor, generated_at = NOW()
    WHERE id = v_existing.id;
    RETURN jsonb_build_object('recorded', true, 'replaced', true, 'storage_hash', v_hash);
  END IF;

  INSERT INTO drawing_pdf_render (org_id, file_id, file_version_id, storage_hash, file_size, is_closure_exact, generated_by)
  VALUES (v_org_id, v_file_id, p_file_version_id, v_hash, p_file_size, p_closure_exact, v_actor)
  ON CONFLICT (file_version_id) DO NOTHING;

  -- Lost a race with another first write for this version: report what is
  -- stored, never "recorded" for a hash that is not the one kept.
  IF NOT FOUND THEN
    SELECT * INTO v_existing FROM drawing_pdf_render d WHERE d.file_version_id = p_file_version_id;
    IF v_existing.storage_hash = v_hash THEN
      RETURN jsonb_build_object('recorded', false, 'replaced', false, 'storage_hash', v_hash);
    END IF;
    RAISE EXCEPTION 'A PDF is already recorded for this version'
      USING ERRCODE = 'unique_violation', HINT = 'PDF_EXISTS';
  END IF;

  RETURN jsonb_build_object('recorded', true, 'replaced', false, 'storage_hash', v_hash);
END;
$$;

-- ===========================================
-- REVOKING WHAT THE CLOSED HOLES PRODUCED
-- ===========================================
-- A fix changes what the code will do next time. It does not change what the
-- data records from what the code already did, and every release before this
-- one was verified only against a fresh install, where there is no history for
-- a fix to fail to undo. Applied over a database that had run v90 and been
-- attacked, v92 left a share link minted by one organization's member against
-- another organization's file still answering is_valid: true to an
-- unauthenticated caller - surviving *because* of the fix, since validation now
-- resolves the organization from the file and the file really is in it.
--
-- So the two travel together from here on: the manifest in core.sql says what
-- the code must be, check_release_residue() says what the data must no longer
-- contain, and both withhold the stamp. These are the functions that clear it.
-- They run below, as part of applying this module, because a remediation that
-- lives in a script somebody has to remember is a remediation that will be
-- forgotten exactly once.
--
-- Rules all of them keep:
--   * idempotent - the second run finds nothing and writes nothing;
--   * loud - every row acted on is printed by name and stored verbatim in
--     schema_remediation_log before it is touched;
--   * non-destructive - deactivate and redact in preference to deleting,
--     because the evidence of a breach is the first thing an audit asks for.
--
-- The third rule has exactly one exception and it is stated here rather than
-- discovered in the code: the cross-tenant file_workflow_assignment row is
-- deleted. The reasons are at the point of deletion below. What holds in every
-- case, including that one, is the second rule - the row is in the ledger
-- verbatim, with every column, before anything happens to it - and that is the
-- property an audit depends on. "Nothing is deleted" is the wrong summary of
-- this module and the changelog should not carry it; "no row is destroyed
-- without being recorded first" is the one that is true everywhere.

-- Deactivate share links that hand out a file in another organization.
--
-- WHY DEACTIVATE AND NOT DELETE, AND WHY BOTH KINDS
--
-- Two different rows match. One was minted through the hole: a member of org A
-- passed org B's file id to file_share_link_create, which believed the org_id
-- it was handed. The other was minted in good faith and then the file moved
-- organizations, which BluePLM permits. The detector cannot tell them apart -
-- both are a link whose org_id differs from its file's - and neither may keep
-- working, because under this release validation resolves the organization from
-- the file, so both hand a recipient a file the link's own organization does
-- not own.
--
-- What distinguishes them is the creator's own membership, so that is recorded
-- for every row, and deactivating rather than deleting is what makes the
-- distinction actionable: an operator who reads the ledger, recognises a
-- legitimate link and wants it back sets is_active = true and moves it to the
-- file's organization. Nothing is lost. A delete would have taken the token,
-- the creator and the timestamps with it - the three things an audit needs to
-- answer "who had this and for how long".
-- THE SHAPE THE FIRST VERSION OF THIS COULD NOT SEE
--
-- It matched on l.org_id IS DISTINCT FROM f.org_id alone, computed creator_org
-- beside it, and then used creator_org only to write prose into the assessment
-- string. So a link whose org_id agrees with its file's was left active and
-- unlogged however foreign its creator was - and that row is reachable: the
-- UPDATE policy on this table was FOR UPDATE USING (created_by = auth.uid())
-- with no WITH CHECK until this release, which let the holder of a link rewrite
-- both file_id and org_id on it and land on a consistent pair naming an
-- organization they have never belonged to.
--
-- Membership is what the detector is actually looking for, so it is what the
-- detector now asks. Either disagreement is enough: the link filed under the
-- wrong organization, or the link minted by somebody who is not in the file's.
--
-- A known and accepted false positive. A link minted in good faith by a member
-- of the file's organization who has since moved to another one, or been
-- removed from every organization, matches the second arm. It is deactivated
-- like the rest, for the same reason the module deactivates rather than deletes
-- everything else: the row survives in full, the operator can read the ledger
-- and judge it, and restoring one is a single UPDATE. Leaving it live because
-- it *might* be innocent is the trade the other way round, and this is a
-- credential that outlives the person it was issued to.
CREATE OR REPLACE FUNCTION file_share_link_remediate_cross_tenant()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_subjects JSONB;
  v_rows INTEGER;
BEGIN
  WITH victims AS (
    SELECT l.id, l.token, l.org_id AS link_org, f.org_id AS file_org,
           l.created_by, l.created_at, l.expires_at, l.download_count,
           l.is_auth_required, l.last_accessed_at,
           cu.org_id AS creator_org
    FROM file_share_link l
    JOIN file f ON f.id = l.file_id
    -- LEFT JOIN rather than the scalar subquery this used to carry, so the
    -- creator's organization is available to the WHERE clause and not only to
    -- the prose. A creator whose row is gone leaves creator_org NULL, and
    -- IS DISTINCT FROM reads that as "not a member", which is correct.
    LEFT JOIN app_user cu ON cu.id = l.created_by
    WHERE (l.org_id IS DISTINCT FROM f.org_id
           OR cu.org_id IS DISTINCT FROM f.org_id)
      -- Already-deactivated rows are skipped, which is what makes a second run
      -- a no-op instead of a second ledger entry saying the same thing.
      AND COALESCE(l.is_active, false)
  ),
  deactivated AS (
    UPDATE file_share_link l
       SET is_active = false
      FROM victims v
     WHERE l.id = v.id
    RETURNING l.id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(v) || jsonb_build_object(
           'assessment',
           CASE
             WHEN v.link_org IS NOT DISTINCT FROM v.file_org
               THEN 'link and file agree on the organization, but the creator is not a member of it: either a link whose file_id and org_id were rewritten together over the unchecked UPDATE policy, or a creator who has since left. Read created_at against the creator''s membership history to tell them apart'
             WHEN v.creator_org IS NOT DISTINCT FROM v.file_org
               THEN 'creator is a member of the file''s organization: most likely a file that moved after the link was minted in good faith'
             ELSE 'creator is NOT a member of the file''s organization: the shape the cross-tenant minting hole produced'
           END) ORDER BY v.created_at), '[]'::jsonb),
         (SELECT count(*) FROM deactivated)
    INTO v_subjects, v_rows
  FROM victims v;

  RETURN schema_remediation_record(
    'cross_tenant_share_links', v_rows, v_subjects,
    'Each link handed out a file belonging to an organization that either the '
    || 'link or its creator is not part of, and is now inactive. Nothing was '
    || 'deleted: the token, creator and timestamps are in the subjects above, '
    || 'and each carries an assessment of which shape it looks like. To restore '
    || 'one you judge legitimate, set is_active = true and org_id to the '
    || 'file''s organization.');
END;
$$;

-- Redact workflow history that names another organization's workflow, and undo
-- the assignment the same attack left behind.
--
-- WHAT THIS CAN AND CANNOT UNDO, STATED PLAINLY
--
-- The disclosure already happened. A member of org A applied org B's transition
-- to her own file; the history row copied B's workflow name, state names and
-- transition name into A's tenant, and everybody in A has been able to read
-- them ever since. Redacting the names now does not unsay them to anyone who
-- has already looked. It does two things that are still worth doing: it stops
-- the disclosure continuing to every future reader, including people who join A
-- tomorrow, and it removes the ids, which are the part that keeps working - a
-- foreign workflow_id in a history row is a live handle to another tenant's
-- object that any query joining through it will follow.
--
-- The row is kept. It is the record that a foreign transition was applied to
-- that file at that time by that user, which is the single most audit-relevant
-- fact in the whole incident, and deleting it would destroy the evidence while
-- undoing none of the disclosure. The original names go to
-- schema_remediation_log, where no tenant can read them and the operator can.
--
-- The assignment is cleared rather than redacted: it is not a record of
-- anything, it is a live pointer that decides which transitions the file offers
-- next, and leaving it means a file in org A continues to be driven by org B's
-- workflow. Its full contents go to the ledger first.
--
-- WHY THIS ONE IS A DELETE WHEN NOTHING ELSE HERE IS
--
-- The module's rule is deactivate over delete, and the two alternatives were
-- both examined and neither works on this table. There is no is_active column
-- to set (file_workflow_assignment is id, file_id, workflow_id,
-- current_state_id, assigned_at, assigned_by - nothing else), and adding one
-- would not help: file_id is UNIQUE, so a tombstone row keeps the file's slot
-- and the remedy this remediation exists to enable - somebody in the file's own
-- organization assigning a workflow it may actually use - would fail on the
-- unique constraint. Redaction is not available either, because workflow_id is
-- NOT NULL and the foreign id is the whole content of the row.
--
-- So the row goes, and what makes that acceptable is the ledger: every column,
-- including current_state_id, is in schema_remediation_log.subjects before the
-- DELETE runs, in the one place no tenant can read. Reinstating one an operator
-- judges legitimate is an INSERT from the subjects, not a recovery.
CREATE OR REPLACE FUNCTION workflow_history_remediate_cross_tenant()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_subjects JSONB;
  v_rows INTEGER;
  v_total INTEGER := 0;
BEGIN
  -- Same three EXISTS tests as check_release_residue(), asked through the
  -- foreign keys and never through the names: two tenants may both have a
  -- workflow called 'Standard Release' and neither has done anything wrong.
  WITH victims AS (
    SELECT h.id, h.org_id, h.file_id, h.file_name, h.workflow_id, h.workflow_name,
           h.from_state_id, h.from_state_name, h.to_state_id, h.to_state_name,
           h.transition_id, h.transition_name, h.performed_by,
           h.performed_by_email, h.performed_at
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
  ),
  redacted AS (
    UPDATE workflow_history h
       -- NOT NULL columns, so a marker rather than NULL. It says what happened
       -- and where to look, which an empty string would not.
       SET workflow_name    = '[redacted: another organization''s workflow]',
           from_state_name  = '[redacted]',
           to_state_name    = '[redacted]',
           transition_name  = '[redacted]',
           -- The handles. These are what a join would still follow.
           workflow_id      = NULL,
           from_state_id    = NULL,
           to_state_id      = NULL,
           transition_id    = NULL
      FROM victims v
     WHERE h.id = v.id
    RETURNING h.id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.performed_at), '[]'::jsonb),
         (SELECT count(*) FROM redacted)
    INTO v_subjects, v_rows
  FROM victims v;

  v_total := v_total + schema_remediation_record(
    'cross_tenant_workflow_history', v_rows, v_subjects,
    'Each row is filed under one organization and named another one''s '
    || 'workflow, states or transition. The names are redacted and the foreign '
    || 'ids removed; the rows themselves are kept, because they record that a '
    || 'foreign transition was applied and that is what an audit needs. The '
    || 'disclosure to anyone who already read them is not undone by this and '
    || 'cannot be.');

  -- The live half of the same damage.
  WITH victims AS (
    SELECT a.id, a.file_id, f.org_id AS file_org, a.workflow_id,
           wt.org_id AS workflow_org, a.current_state_id, a.assigned_at, a.assigned_by
    FROM file_workflow_assignment a
    JOIN file f ON f.id = a.file_id
    JOIN workflow_template wt ON wt.id = a.workflow_id
    WHERE wt.org_id <> f.org_id
  ),
  cleared AS (
    DELETE FROM file_workflow_assignment a
     USING victims v
     WHERE a.id = v.id
    RETURNING a.id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.assigned_at), '[]'::jsonb),
         (SELECT count(*) FROM cleared)
    INTO v_subjects, v_rows
  FROM victims v;

  v_total := v_total + schema_remediation_record(
    'cross_tenant_workflow_assignment', v_rows, v_subjects,
    'Each assignment put a file in one organization under a workflow owned by '
    || 'another, which decides the transitions the file offers next. The '
    || 'assignment is removed - the file is in no workflow until somebody in '
    || 'its own organization assigns one - and its full contents, including the '
    || 'state it was left in, are in the subjects above.');

  RETURN v_total;
END;
$$;

-- Whether the caller may read one object of the vault bucket by what it holds:
-- content whose hash a file, version or drawing PDF of a vault the caller may see
-- names, or the inspection preview of such a file. SECURITY DEFINER so each test
-- is an index probe (file.content_hash, file_version.content_hash,
-- drawing_pdf_render.storage_hash, file.id) followed by the vault rule, rather
-- than a pass through the file_version policy, which hashes every readable file
-- id once per signed-URL request. It answers only for the caller (auth.uid()), and
-- only for an object under the caller's own organization prefix.
CREATE OR REPLACE FUNCTION can_read_vault_object(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH obj AS (
    SELECT u.org_id,
           substring(p_name FROM '/([0-9a-f]{64})$') AS hash,
           CASE
             WHEN split_part(p_name, '/', 2) = 'inspection-previews'
              AND left(split_part(p_name, '/', 3), 36) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN left(split_part(p_name, '/', 3), 36)::uuid
           END AS preview_file_id
      FROM app_user u
     WHERE u.id = auth.uid()
       AND u.org_id IS NOT NULL
       AND split_part(p_name, '/', 1) = u.org_id::text
  ),
  visible AS (SELECT my_accessible_vault_ids() AS id)
  SELECT EXISTS (
    SELECT 1 FROM obj
     WHERE EXISTS (SELECT 1 FROM file f
                    WHERE f.content_hash = obj.hash AND f.org_id = obj.org_id
                      AND f.vault_id IN (SELECT id FROM visible))
        OR EXISTS (SELECT 1 FROM file_version fv JOIN file f ON f.id = fv.file_id
                    WHERE fv.content_hash = obj.hash AND f.org_id = obj.org_id
                      AND f.vault_id IN (SELECT id FROM visible))
        OR EXISTS (SELECT 1 FROM drawing_pdf_render d JOIN file f ON f.id = d.file_id
                    WHERE d.storage_hash = obj.hash AND f.org_id = obj.org_id
                      AND f.vault_id IN (SELECT id FROM visible))
        OR EXISTS (SELECT 1 FROM file f
                    WHERE f.id = obj.preview_file_id AND f.org_id = obj.org_id
                      AND f.vault_id IN (SELECT id FROM visible))
  );
$$;

CREATE POLICY "Vault: read readable objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (((bucket_id = 'vault'::text) AND (split_part(name, '/'::text, 1) IN ( SELECT (u.org_id)::text AS org_id
   FROM app_user u
  WHERE ((u.id = auth.uid()) AND (u.org_id IS NOT NULL)))) AND (is_org_admin() OR (owner_id = (auth.uid())::text) OR (split_part(name, '/'::text, 2) = '_assets'::text) OR can_read_vault_object(name))));

CREATE POLICY "Vault: upload to own organization"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'vault'::text) AND (split_part(name, '/'::text, 1) IN ( SELECT (u.org_id)::text AS org_id
   FROM app_user u
  WHERE ((u.id = auth.uid()) AND (u.org_id IS NOT NULL))))));

CREATE POLICY "Vault: update own or org assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (((bucket_id = 'vault'::text) AND (split_part(name, '/'::text, 1) IN ( SELECT (u.org_id)::text AS org_id
   FROM app_user u
  WHERE ((u.id = auth.uid()) AND (u.org_id IS NOT NULL)))) AND (split_part(name, '/'::text, 2) = ANY (ARRAY['_assets'::text, 'inspection-previews'::text])) AND (is_org_admin() OR (owner_id = (auth.uid())::text))))
  WITH CHECK (((bucket_id = 'vault'::text) AND (split_part(name, '/'::text, 1) IN ( SELECT (u.org_id)::text AS org_id
   FROM app_user u
  WHERE ((u.id = auth.uid()) AND (u.org_id IS NOT NULL)))) AND (split_part(name, '/'::text, 2) = ANY (ARRAY['_assets'::text, 'inspection-previews'::text]))));

CREATE POLICY "Vault: delete own or as admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'vault'::text) AND (split_part(name, '/'::text, 1) IN ( SELECT (u.org_id)::text AS org_id
   FROM app_user u
  WHERE ((u.id = auth.uid()) AND (u.org_id IS NOT NULL)))) AND (is_org_admin() OR ((owner_id = (auth.uid())::text) AND (split_part(name, '/'::text, 2) = ANY (ARRAY['_assets'::text, 'inspection-previews'::text]))))));

REVOKE ALL ON FUNCTION
  file_share_link_consume(text),
  file_share_link_validate(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  file_share_link_consume(text),
  file_share_link_validate(text)
TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  backup_get_status(),
  can_access_vault(uuid),
  can_read_vault_object(text),
  can_run_transition(uuid,uuid),
  custom_properties_merge(jsonb,jsonb),
  drawing_pdf_render_get(uuid),
  drawing_pdf_render_record(uuid,text,bigint,boolean),
  file_checkin(uuid,text,bigint,text,text,text,text,integer,jsonb,text,text,text),
  file_checkout(uuid,text,text,text),
  file_get_active_by_path(uuid,text),
  file_get_legacy_state(text),
  file_move(uuid,text,text),
  file_repair_config_maps(uuid,jsonb),
  file_require_access(uuid),
  file_share_link_create(uuid,uuid,uuid,integer,integer,boolean),
  file_share_link_generate_token(),
  file_version_get_dependency_closure(uuid),
  file_version_reference_record(uuid,jsonb),
  folder_rename(text,text,uuid),
  gate_review_complete(uuid,review_status,text,jsonb),
  gate_review_list_mine(),
  item_designation_assignment_list(uuid,uuid),
  item_designation_assignment_set(uuid,uuid,text,uuid),
  item_designation_delete(uuid,uuid),
  item_designation_list(uuid),
  item_designation_upsert(uuid,text,uuid,integer),
  item_image_list(uuid),
  item_image_reset(uuid,text),
  item_image_upsert(uuid,text,text,text,text,text),
  my_accessible_vault_ids(),
  org_get_item_definition_settings(uuid),
  org_update_item_definition_settings(uuid,jsonb),
  org_update_serialization_settings(uuid,jsonb),
  revision_get_next(text,revision_scheme),
  serial_number_get_next(uuid),
  serial_number_preview_next(uuid),
  trg_file_log_activity(),
  trg_file_notify_watchers(),
  user_vault_access_list(uuid),
  vault_file_count(uuid,uuid),
  vault_file_list(uuid,uuid),
  vault_file_list_delta(uuid,uuid,timestamp with time zone),
  vault_require_access(uuid),
  workflow_create_default(uuid),
  workflow_import_graph(uuid,jsonb),
  workflow_transition_execute(uuid,uuid,text),
  workflow_transition_execute_to_legacy_state(uuid,text,text),
  workflow_transition_list_available(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  backup_get_status(),
  can_access_vault(uuid),
  can_read_vault_object(text),
  can_run_transition(uuid,uuid),
  custom_properties_merge(jsonb,jsonb),
  drawing_pdf_render_get(uuid),
  drawing_pdf_render_record(uuid,text,bigint,boolean),
  file_checkin(uuid,text,bigint,text,text,text,text,integer,jsonb,text,text,text),
  file_checkout(uuid,text,text,text),
  file_get_active_by_path(uuid,text),
  file_get_legacy_state(text),
  file_move(uuid,text,text),
  file_repair_config_maps(uuid,jsonb),
  file_require_access(uuid),
  file_share_link_create(uuid,uuid,uuid,integer,integer,boolean),
  file_share_link_generate_token(),
  file_version_get_dependency_closure(uuid),
  file_version_reference_record(uuid,jsonb),
  folder_rename(text,text,uuid),
  gate_review_complete(uuid,review_status,text,jsonb),
  gate_review_list_mine(),
  item_designation_assignment_list(uuid,uuid),
  item_designation_assignment_set(uuid,uuid,text,uuid),
  item_designation_delete(uuid,uuid),
  item_designation_list(uuid),
  item_designation_upsert(uuid,text,uuid,integer),
  item_image_list(uuid),
  item_image_reset(uuid,text),
  item_image_upsert(uuid,text,text,text,text,text),
  my_accessible_vault_ids(),
  org_get_item_definition_settings(uuid),
  org_update_item_definition_settings(uuid,jsonb),
  org_update_serialization_settings(uuid,jsonb),
  revision_get_next(text,revision_scheme),
  serial_number_get_next(uuid),
  serial_number_preview_next(uuid),
  trg_file_log_activity(),
  trg_file_notify_watchers(),
  user_vault_access_list(uuid),
  vault_file_count(uuid,uuid),
  vault_file_list(uuid,uuid),
  vault_file_list_delta(uuid,uuid,timestamp with time zone),
  vault_require_access(uuid),
  workflow_create_default(uuid),
  workflow_import_graph(uuid,jsonb),
  workflow_transition_execute(uuid,uuid,text),
  workflow_transition_execute_to_legacy_state(uuid,text,text),
  workflow_transition_list_available(uuid)
TO authenticated, service_role;
REVOKE ALL ON FUNCTION
  can_review_gate(uuid,uuid),
  can_user_access_vault(uuid,uuid),
  file_share_link_admit(text),
  file_share_link_remediate_cross_tenant(),
  file_version_reference_list_edges(uuid[],uuid),
  folder_remediate_case_collisions(),
  gate_review_list_awaiting_ids(uuid),
  gate_reviewer_list_user_ids(uuid,uuid),
  is_org_file_workflows_enabled(uuid),
  review_stage_get_exit_transition(uuid),
  trg_file_comment_check_integrity(),
  user_get_effective_role(uuid),
  workflow_history_remediate_cross_tenant(),
  workflow_transition_apply(uuid,uuid,text,jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  can_review_gate(uuid,uuid),
  can_user_access_vault(uuid,uuid),
  file_share_link_admit(text),
  file_share_link_remediate_cross_tenant(),
  file_version_reference_list_edges(uuid[],uuid),
  folder_remediate_case_collisions(),
  gate_review_list_awaiting_ids(uuid),
  gate_reviewer_list_user_ids(uuid,uuid),
  is_org_file_workflows_enabled(uuid),
  review_stage_get_exit_transition(uuid),
  trg_file_comment_check_integrity(),
  user_get_effective_role(uuid),
  workflow_history_remediate_cross_tenant(),
  workflow_transition_apply(uuid,uuid,text,jsonb)
TO service_role;

REVOKE ALL ON TABLE activity, backup_config, backup_history, backup_lock, backup_machine, drawing_pdf_render, file, file_comment, file_metadata_column, file_reference, file_share_link, file_state_entry, file_version, file_version_reference, file_watcher, file_workflow_assignment, folder, item_designation, item_designation_assignment, item_image, release_file, team_vault_access, user_workflow_role, vault, vault_access, workflow_gate, workflow_gate_review, workflow_gate_reviewer, workflow_history, workflow_review_history, workflow_role, workflow_state, workflow_template, workflow_transition FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE activity, backup_config, backup_history, backup_lock, backup_machine, drawing_pdf_render, file, file_comment, file_metadata_column, file_reference, file_share_link, file_state_entry, file_version, file_version_reference, file_watcher, file_workflow_assignment, folder, item_designation, item_designation_assignment, item_image, release_file, team_vault_access, user_workflow_role, vault, vault_access, workflow_gate, workflow_gate_review, workflow_gate_reviewer, workflow_history, workflow_review_history, workflow_role, workflow_state, workflow_template, workflow_transition TO authenticated, service_role;

SELECT anon_enforce_execute_posture();

-- ===================== from supabase/modules/15-inspection.sql =====================

-- Live inspection rows. Schema 111: they follow their file's vault
-- (my_accessible_vault_ids(), see the files policies in 10-source-files.sql).
CREATE POLICY "inspection_characteristic: users read"
  ON inspection_characteristic FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

CREATE POLICY "inspection_characteristic: engineers manage"
  ON inspection_characteristic FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())) AND has_team_permission('module:explorer', 'edit'))
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())) AND has_team_permission('module:explorer', 'edit'));

-- Snapshot inspection rows (read-only history; written by file_checkin SECURITY DEFINER)
CREATE POLICY "inspection_characteristic_version: users read"
  ON inspection_characteristic_version FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND file_version_id IN (
    SELECT fv.id FROM file_version fv WHERE fv.file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids()))
  ));

-- Inspection methods (org-level custom list)
CREATE POLICY "inspection_method: users read"
  ON inspection_method FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "inspection_method: engineers manage"
  ON inspection_method FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:explorer', 'edit'))
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:explorer', 'edit'));

REVOKE ALL ON TABLE inspection_characteristic, inspection_characteristic_version, inspection_method FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE inspection_characteristic, inspection_characteristic_version, inspection_method TO authenticated, service_role;

SELECT anon_enforce_execute_posture();

-- ===================== from supabase/modules/20-change-control.sql =====================

-- ECOs
CREATE POLICY "eco: users read"
  ON eco FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "eco: engineers insert"
  ON eco FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:eco', 'create'));

CREATE POLICY "eco: engineers update"
  ON eco FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:eco', 'edit'));

CREATE POLICY "eco: admins delete"
  ON eco FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:eco', 'delete'));

-- File-ECO associations. Schema 111: an ECO is org-wide, but its link to a
-- file in a vault the caller may not see is not (my_accessible_vault_ids()).
CREATE POLICY "file_eco: users read"
  ON file_eco FOR SELECT
  USING (eco_id IN (SELECT id FROM eco WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

CREATE POLICY "file_eco: engineers manage"
  ON file_eco FOR ALL
  USING (eco_id IN (SELECT id FROM eco WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())) AND has_team_permission('module:eco', 'edit'));

-- Reviews (schema 107): SELECT-only for clients. Every write is a SECURITY
-- DEFINER RPC below. The policies this replaces let a requester update every
-- reviewer's response to approved, let any user insert a response for any review
-- in any organization (enrolling themselves as an approver), and let any member
-- with module:reviews:edit set review.status directly.
CREATE POLICY "review: users read"
  ON review FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "review_response: users read"
  ON review_response FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

-- Items carry their file's vault, and a member who may not see that vault does
-- not see the item.
CREATE POLICY "review_item: users read"
  ON review_item FOR SELECT
  TO authenticated
  USING (is_org_member(org_id) AND can_access_vault(vault_id));

CREATE POLICY "review_round: users read"
  ON review_round FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

-- Round items and decisions follow their item: the subquery is itself filtered
-- by the review_item policy above, so a member who may not see an item's vault
-- does not see its versions, decisions or decision comments either.
CREATE POLICY "review_round_item: users read"
  ON review_round_item FOR SELECT
  TO authenticated
  USING (is_org_member(org_id) AND item_id IN (SELECT i.id FROM review_item i));

CREATE POLICY "review_decision: users read"
  ON review_decision FOR SELECT
  TO authenticated
  USING (is_org_member(org_id) AND item_id IN (SELECT i.id FROM review_item i));

-- Deviations
CREATE POLICY "deviation: users read"
  ON deviation FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "deviation: engineers insert"
  ON deviation FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:deviations', 'create'));

CREATE POLICY "deviation: engineers update"
  ON deviation FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:deviations', 'edit'));

CREATE POLICY "deviation: admins delete"
  ON deviation FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:deviations', 'delete'));

-- File-Deviation associations. Schema 111: as file_eco.
CREATE POLICY "file_deviation: users read"
  ON file_deviation FOR SELECT
  USING (deviation_id IN (SELECT id FROM deviation WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())));

CREATE POLICY "file_deviation: engineers manage"
  ON file_deviation FOR ALL
  USING (deviation_id IN (SELECT id FROM deviation WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND file_id IN (SELECT f.id FROM file f WHERE f.vault_id IN (SELECT my_accessible_vault_ids())) AND has_team_permission('module:deviations', 'edit'));

-- Process Templates
CREATE POLICY "process_template: users read"
  ON process_template FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "process_template: admins manage"
  ON process_template FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Process Template Phases
CREATE POLICY "process_template_phase: users read"
  ON process_template_phase FOR SELECT
  USING (template_id IN (SELECT id FROM process_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "process_template_phase: admins manage"
  ON process_template_phase FOR ALL
  USING (template_id IN (SELECT id FROM process_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND is_org_admin());

-- Process Template Items
CREATE POLICY "process_template_item: users read"
  ON process_template_item FOR SELECT
  USING (phase_id IN (SELECT id FROM process_template_phase WHERE template_id IN (SELECT id FROM process_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()))));

CREATE POLICY "process_template_item: admins manage"
  ON process_template_item FOR ALL
  USING (phase_id IN (SELECT id FROM process_template_phase WHERE template_id IN (SELECT id FROM process_template WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()))) AND is_org_admin());

-- ECO Checklist Items
CREATE POLICY "eco_checklist_item: users read"
  ON eco_checklist_item FOR SELECT
  USING (eco_id IN (SELECT id FROM eco WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "eco_checklist_item: engineers manage"
  ON eco_checklist_item FOR ALL
  USING (eco_id IN (SELECT id FROM eco WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND has_team_permission('module:eco', 'edit'));

-- ECO Gate Approvals
CREATE POLICY "eco_gate_approval: users read"
  ON eco_gate_approval FOR SELECT
  USING (eco_id IN (SELECT id FROM eco WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "eco_gate_approval: engineers manage"
  ON eco_gate_approval FOR ALL
  USING (eco_id IN (SELECT id FROM eco WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND has_team_permission('module:eco', 'edit'));

-- ECO Checklist Activity
CREATE POLICY "eco_checklist_activity: users read"
  ON eco_checklist_activity FOR SELECT
  USING (eco_id IN (SELECT id FROM eco WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "eco_checklist_activity: engineers insert"
  ON eco_checklist_activity FOR INSERT
  -- Schema 112: performed_by is the caller.
  WITH CHECK (eco_id IN (SELECT id FROM eco WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()))
              AND performed_by = auth.uid());

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Sync ECO tags to files table
CREATE OR REPLACE FUNCTION trg_file_eco_sync_tags()
RETURNS TRIGGER AS $$
DECLARE
  v_file_id UUID;
  v_eco_numbers TEXT[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_file_id := OLD.file_id;
  ELSE
    v_file_id := NEW.file_id;
  END IF;
  
  SELECT COALESCE(array_agg(e.eco_number ORDER BY e.eco_number), '{}')
  INTO v_eco_numbers
  FROM file_eco fe
  INNER JOIN eco e ON fe.eco_id = e.id
  WHERE fe.file_id = v_file_id;
  
  UPDATE file SET eco_tags = v_eco_numbers WHERE id = v_file_id;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_file_eco_sync_tags_insert
  AFTER INSERT ON file_eco
  FOR EACH ROW EXECUTE FUNCTION trg_file_eco_sync_tags();

CREATE TRIGGER trg_file_eco_sync_tags_delete
  AFTER DELETE ON file_eco
  FOR EACH ROW EXECUTE FUNCTION trg_file_eco_sync_tags();

-- Sync ECO tags when ECO number changes
CREATE OR REPLACE FUNCTION trg_eco_sync_file_tags()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.eco_number IS DISTINCT FROM NEW.eco_number THEN
    UPDATE file f
    SET eco_tags = (
      SELECT COALESCE(array_agg(e.eco_number ORDER BY e.eco_number), '{}')
      FROM file_eco fe
      INNER JOIN eco e ON fe.eco_id = e.id
      WHERE fe.file_id = f.id
    )
    WHERE f.id IN (SELECT file_id FROM file_eco WHERE eco_id = NEW.id);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_eco_sync_file_tags
  AFTER UPDATE ON eco
  FOR EACH ROW EXECUTE FUNCTION trg_eco_sync_file_tags();

-- ===========================================
-- ENTITY GATE
-- ===========================================
-- The ECO equivalent of file_require_access() in 10-source-files.sql: resolve
-- the organization from the ECO being addressed and apply the membership rule to
-- it. process_template_instantiate() and check_gate_requirements() took an ECO id
-- and acted on whatever row it named - the first of them deletes that ECO's
-- checklist and gate approvals, which as an unauthenticated endpoint is a way to
-- erase another organization's change-control record.
--
-- An ECO that does not exist and one belonging to another organization produce
-- the same refusal, so this is not a way to find out which ECO ids are real.
CREATE OR REPLACE FUNCTION eco_require_access(p_eco_id UUID)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF p_eco_id IS NULL THEN
    RAISE EXCEPTION 'ECO is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM my_actor_id();

  SELECT e.org_id INTO v_org_id FROM eco e WHERE e.id = p_eco_id;

  IF v_org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Not authorized for this ECO'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Instantiate process template for an ECO
CREATE OR REPLACE FUNCTION process_template_instantiate(
  p_eco_id UUID,
  p_template_id UUID
) RETURNS VOID AS $$
DECLARE
  v_phase RECORD;
  v_item RECORD;
  v_org_id UUID;
BEGIN
  v_org_id := eco_require_access(p_eco_id);

  -- Schema 112: replacing an ECO's checklist is an edit of the ECO.
  IF NOT has_team_permission('module:eco', 'edit') THEN
    RAISE EXCEPTION 'You do not have permission to edit ECOs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The template has to belong to the same organization as the ECO, or this
  -- becomes a way to read another organization's process templates by copying
  -- one into an ECO of your own.
  IF NOT EXISTS (
    SELECT 1 FROM process_template pt
    WHERE pt.id = p_template_id AND pt.org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Not authorized for this process template'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Update ECO to reference the template
  UPDATE eco SET process_template_id = p_template_id WHERE id = p_eco_id;
  
  -- Clear any existing checklist items
  DELETE FROM eco_checklist_item WHERE eco_id = p_eco_id;
  DELETE FROM eco_gate_approval WHERE eco_id = p_eco_id;
  
  -- Copy phases and items
  FOR v_phase IN 
    SELECT * FROM process_template_phase 
    WHERE template_id = p_template_id 
    ORDER BY sort_order
  LOOP
    -- Create gate approval record if phase has a gate
    IF v_phase.gate_name IS NOT NULL THEN
      INSERT INTO eco_gate_approval (eco_id, gate_name, phase_name)
      VALUES (p_eco_id, v_phase.gate_name, v_phase.name);
    END IF;
    
    -- Copy items
    FOR v_item IN
      SELECT * FROM process_template_item
      WHERE phase_id = v_phase.id
      ORDER BY sort_order
    LOOP
      INSERT INTO eco_checklist_item (
        eco_id, template_item_id, phase_name, phase_sort_order,
        uid, doc_number, name, description, is_required_for_gate,
        gate_name, accountable_text, responsible_text, consulted_text, informed_text,
        sort_order
      ) VALUES (
        p_eco_id, v_item.id, v_phase.name, v_phase.sort_order,
        v_item.uid, v_item.doc_number, v_item.name, v_item.description, v_item.is_required_for_gate,
        v_phase.gate_name, v_item.default_accountable, v_item.default_responsible, 
        v_item.default_consulted, v_item.default_informed, v_item.sort_order
      );
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Check if gate requirements are met
CREATE OR REPLACE FUNCTION check_gate_requirements(
  p_eco_id UUID,
  p_gate_name TEXT
) RETURNS TABLE (
  all_required_complete BOOLEAN,
  required_items INTEGER,
  completed_items INTEGER,
  incomplete_items TEXT[]
) AS $$
DECLARE
  v_required INTEGER;
  v_completed INTEGER;
  v_incomplete TEXT[];
BEGIN
  PERFORM eco_require_access(p_eco_id);

  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'complete' OR status = 'na'),
    array_agg(name) FILTER (WHERE status != 'complete' AND status != 'na')
  INTO v_required, v_completed, v_incomplete
  FROM eco_checklist_item
  WHERE eco_id = p_eco_id
    AND gate_name = p_gate_name
    AND is_required_for_gate = true;
  
  RETURN QUERY SELECT 
    (v_required = v_completed),
    v_required,
    v_completed,
    COALESCE(v_incomplete, '{}');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Approve a gate
CREATE OR REPLACE FUNCTION eco_gate_approve(
  p_eco_id UUID,
  p_gate_name TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_check RECORD;
  v_user_id UUID;
BEGIN
  -- Schema 112: this had no organization check at all, and as SECURITY DEFINER
  -- it let any account approve a gate on any organization's ECO.
  PERFORM eco_require_access(p_eco_id);
  v_user_id := my_actor_id();
  IF NOT has_team_permission('module:eco', 'edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to approve ECO gates');
  END IF;
  
  -- Check requirements
  SELECT * INTO v_check FROM check_gate_requirements(p_eco_id, p_gate_name);
  
  IF NOT v_check.all_required_complete THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not all required items are complete',
      'incomplete_items', v_check.incomplete_items
    );
  END IF;
  
  -- Approve the gate
  UPDATE eco_gate_approval
  SET is_approved = true, approved_at = NOW(), approved_by = v_user_id, notes = p_notes
  WHERE eco_id = p_eco_id AND gate_name = p_gate_name;
  
  -- Log activity
  INSERT INTO eco_checklist_activity (eco_id, gate_approval_id, action, new_value, performed_by)
  SELECT p_eco_id, id, 'gate_approved', p_gate_name, v_user_id
  FROM eco_gate_approval WHERE eco_id = p_eco_id AND gate_name = p_gate_name;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ===========================================
-- REVIEW PACKAGES: HELPERS (schema 107)
-- ===========================================

-- review.status as the RPCs report it.
CREATE OR REPLACE FUNCTION review_status_get_label(p_status review_status)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_status
    WHEN 'pending' THEN 'open'
    WHEN 'kicked_back' THEN 'changes_requested'
    ELSE p_status::text
  END;
$$;

-- Queue order: urgent first.
CREATE OR REPLACE FUNCTION review_priority_get_rank(p_priority TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_priority
    WHEN 'urgent' THEN 0
    WHEN 'high' THEN 1
    WHEN 'normal' THEN 2
    WHEN 'low' THEN 3
    ELSE 2
  END;
$$;

-- The entity gate for every review RPC, shaped like file_require_access(): the
-- review's organization must be the caller's. A review that does not exist and a
-- review in another organization produce the same refusal.
CREATE OR REPLACE FUNCTION review_require_access(p_review_id UUID)
RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF p_review_id IS NULL THEN
    RAISE EXCEPTION 'Review is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM my_actor_id();

  SELECT r.org_id INTO v_org_id FROM review r WHERE r.id = p_review_id;

  IF v_org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Not authorized for this review'
      USING ERRCODE = 'insufficient_privilege', HINT = 'REVIEW_NOT_FOUND';
  END IF;

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- A user as the review RPCs return one.
CREATE OR REPLACE FUNCTION review_get_user_json(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', u.id, 'email', u.email, 'full_name', u.full_name, 'avatar_url', u.avatar_url)
  FROM app_user u WHERE u.id = p_user_id;
$$;

-- The title shown for a review: its own, else its first item's file name.
CREATE OR REPLACE FUNCTION review_get_display_title(p_review_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(btrim(r.title), ''),
    (SELECT f.file_name FROM review_item i JOIN file f ON f.id = i.file_id
      WHERE i.review_id = r.id ORDER BY i.sort_order, f.file_name LIMIT 1),
    (SELECT f.file_name FROM file f WHERE f.id = r.file_id),
    'Review')
  FROM review r WHERE r.id = p_review_id;
$$;

-- The members a team contributes as reviewers, by the rule the renderer's
-- resolveTeamReviewers() applies: the team's team_reviewer rules when it has
-- any, otherwise every member. A rule never reaches outside the team.
CREATE OR REPLACE FUNCTION team_reviewer_list_user_ids(p_team_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.user_id
  FROM team_member tm
  WHERE tm.team_id = p_team_id
    AND (
      NOT EXISTS (SELECT 1 FROM team_reviewer tr WHERE tr.team_id = p_team_id)
      OR EXISTS (
        SELECT 1 FROM team_reviewer tr
        WHERE tr.team_id = p_team_id
          AND (
            (tr.reviewer_type = 'user' AND tr.user_id = tm.user_id)
            OR (tr.reviewer_type = 'workflow_role' AND EXISTS (
                  SELECT 1 FROM user_workflow_role uwr
                  WHERE uwr.user_id = tm.user_id AND uwr.workflow_role_id = tr.workflow_role_id))
          )
      )
    );
$$;

-- The items of an open review a user still owes a decision on in its current
-- round. In mode 'any' an item stops being owed by anyone once one reviewer
-- decides it, because review_settle() decides it on that first decision.
CREATE OR REPLACE FUNCTION review_item_list_owed_ids(p_review_id UUID, p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rri.item_id
  FROM review r
  JOIN review_response rr
    ON rr.review_id = r.id AND rr.round_number = r.current_round AND rr.reviewer_id = p_user_id
   AND rr.withdrawn_at IS NULL
  JOIN review_round_item rri
    ON rri.review_id = r.id AND rri.round_number = r.current_round
   AND NOT rri.is_carried_forward AND rri.outcome = 'pending'
  WHERE r.id = p_review_id
    AND r.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM review_decision d
      WHERE d.item_id = rri.item_id AND d.round_number = r.current_round AND d.reviewer_id = p_user_id
    );
$$;

-- Notifications for a set of users of one organization, never to the actor
-- themselves. Called only from the review RPCs, inside their transaction.
CREATE OR REPLACE FUNCTION review_notify(
  p_org_id UUID,
  p_recipients UUID[],
  p_actor UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_review_id UUID,
  p_priority TEXT DEFAULT 'normal'
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  INSERT INTO notification (
    org_id, user_id, type, category, title, message, priority,
    entity_type, entity_id, from_user_id, action_type
  )
  SELECT p_org_id, u.id, p_type, 'review', p_title, p_message, COALESCE(p_priority, 'normal'),
         'review', p_review_id, p_actor, 'open_review'
  FROM app_user u
  WHERE u.id = ANY (COALESCE(p_recipients, '{}'::UUID[]))
    AND u.org_id = p_org_id
    AND u.id IS DISTINCT FROM p_actor;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Apply the completion rule to a review's current round, after decisions were
-- recorded. The caller holds the review row lock.
--
-- Item outcome (decision 3): mode 'any' - the first decision stands
-- (approved_with_comments counts as approved). Mode 'all' - once every reviewer
-- of the round has decided the item: rejected if anyone rejected, else
-- changes_requested if anyone asked for changes, else approved.
--
-- Round complete when every item reviewed in it has an outcome. Review outcome
-- over all items, carried-forward ones included: rejected if any item is
-- rejected, else changes requested ('kicked_back') if any needs changes, else
-- approved. Each reviewer's response row is summarised from their decisions.
-- Returns review.status as text.
CREATE OR REPLACE FUNCTION review_settle(p_review_id UUID, p_actor UUID, p_notify BOOLEAN DEFAULT true)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r review%ROWTYPE;
  v_round INTEGER;
  v_reviewers UUID[];
  ri RECORD;
  rr RECORD;
  v_outcome TEXT;
  v_open INTEGER;
  v_status review_status;
  v_title TEXT;
BEGIN
  SELECT * INTO r FROM review WHERE id = p_review_id;
  IF r.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF r.status <> 'pending' THEN
    RETURN r.status::text;
  END IF;
  v_round := r.current_round;

  v_reviewers := ARRAY(
    SELECT x.reviewer_id FROM review_response x
    WHERE x.review_id = p_review_id AND x.round_number = v_round AND x.withdrawn_at IS NULL
  );

  FOR ri IN
    SELECT rri.id, rri.item_id
    FROM review_round_item rri
    WHERE rri.review_id = p_review_id AND rri.round_number = v_round
      AND NOT rri.is_carried_forward AND rri.outcome = 'pending'
  LOOP
    v_outcome := NULL;

    IF r.mode = 'any' THEN
      SELECT CASE d.decision WHEN 'approved_with_comments' THEN 'approved' ELSE d.decision END
        INTO v_outcome
      FROM review_decision d
      WHERE d.item_id = ri.item_id AND d.round_number = v_round
      ORDER BY d.decided_at, d.id
      LIMIT 1;
    ELSIF cardinality(v_reviewers) > 0 AND NOT EXISTS (
      SELECT 1 FROM unnest(v_reviewers) AS rv(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM review_decision d
        WHERE d.item_id = ri.item_id AND d.round_number = v_round AND d.reviewer_id = rv.id
      )
    ) THEN
      SELECT CASE
               WHEN bool_or(d.decision = 'rejected') THEN 'rejected'
               WHEN bool_or(d.decision = 'changes_requested') THEN 'changes_requested'
               ELSE 'approved'
             END
        INTO v_outcome
      FROM review_decision d
      WHERE d.item_id = ri.item_id AND d.round_number = v_round;
    END IF;

    IF v_outcome IS NOT NULL THEN
      UPDATE review_round_item SET outcome = v_outcome, decided_at = NOW() WHERE id = ri.id;
      UPDATE review_item SET outcome = v_outcome WHERE id = ri.item_id;
    END IF;
  END LOOP;

  -- Each reviewer's summary for the round.
  FOR rr IN
    SELECT x.id, x.reviewer_id FROM review_response x
    WHERE x.review_id = p_review_id AND x.round_number = v_round AND x.withdrawn_at IS NULL
  LOOP
    UPDATE review_response x
    SET status = s.status,
        responded_at = s.last_at,
        updated_at = NOW()
    FROM (
      SELECT
        CASE
          WHEN EXISTS (
            SELECT 1 FROM review_round_item rri
            WHERE rri.review_id = p_review_id AND rri.round_number = v_round
              AND NOT rri.is_carried_forward AND rri.outcome = 'pending'
              AND NOT EXISTS (
                SELECT 1 FROM review_decision d
                WHERE d.item_id = rri.item_id AND d.round_number = v_round AND d.reviewer_id = rr.reviewer_id)
          ) THEN 'pending'
          WHEN NOT EXISTS (
            SELECT 1 FROM review_decision d
            WHERE d.review_id = p_review_id AND d.round_number = v_round AND d.reviewer_id = rr.reviewer_id
          ) THEN 'cancelled'
          WHEN EXISTS (
            SELECT 1 FROM review_decision d
            WHERE d.review_id = p_review_id AND d.round_number = v_round AND d.reviewer_id = rr.reviewer_id
              AND d.decision = 'rejected'
          ) THEN 'rejected'
          WHEN EXISTS (
            SELECT 1 FROM review_decision d
            WHERE d.review_id = p_review_id AND d.round_number = v_round AND d.reviewer_id = rr.reviewer_id
              AND d.decision = 'changes_requested'
          ) THEN 'kicked_back'
          ELSE 'approved'
        END::review_status AS status,
        (SELECT max(d.decided_at) FROM review_decision d
          WHERE d.review_id = p_review_id AND d.round_number = v_round AND d.reviewer_id = rr.reviewer_id) AS last_at
    ) s
    WHERE x.id = rr.id
      AND (x.status IS DISTINCT FROM s.status OR x.responded_at IS DISTINCT FROM s.last_at);
  END LOOP;

  SELECT count(*) INTO v_open
  FROM review_round_item rri
  WHERE rri.review_id = p_review_id AND rri.round_number = v_round
    AND NOT rri.is_carried_forward AND rri.outcome = 'pending';

  IF v_open > 0 THEN
    PERFORM review_apply_workflow_after_settle(p_review_id, 'pending');
    RETURN 'pending';
  END IF;

  SELECT CASE
           WHEN bool_or(i.outcome = 'rejected') THEN 'rejected'
           WHEN bool_or(i.outcome IN ('changes_requested', 'pending')) THEN 'kicked_back'
           ELSE 'approved'
         END::review_status
    INTO v_status
  FROM review_item i
  WHERE i.review_id = p_review_id;

  -- A review with no items (a pre-107 row whose file had no version) has
  -- nothing to settle and stays as it is.
  IF v_status IS NULL THEN
    RETURN r.status::text;
  END IF;

  UPDATE review
  SET status = v_status,
      completed_at = CASE WHEN v_status IN ('approved', 'rejected') THEN NOW() ELSE NULL END,
      updated_at = NOW()
  WHERE id = p_review_id;

  UPDATE review_round
  SET closed_at = NOW(),
      outcome = CASE v_status WHEN 'kicked_back' THEN 'changes_requested' ELSE v_status::text END
  WHERE review_id = p_review_id AND round_number = v_round;

  IF p_notify THEN
    v_title := review_get_display_title(p_review_id);

    PERFORM review_notify(
      r.org_id, ARRAY[r.requested_by], p_actor,
      CASE v_status
        WHEN 'approved' THEN 'review_approved'
        WHEN 'rejected' THEN 'review_rejected'
        ELSE 'review_kicked_back'
      END,
      CASE v_status
        WHEN 'approved' THEN 'Review approved: '
        WHEN 'rejected' THEN 'Review rejected: '
        ELSE 'Changes requested: '
      END || v_title,
      CASE v_status
        WHEN 'approved' THEN 'Every item was approved.'
        WHEN 'rejected' THEN 'At least one item was rejected.'
        ELSE 'Some items need changes. Resubmit them at a newer version.'
      END,
      p_review_id, r.priority);

    IF v_status = 'approved' THEN
      PERFORM review_notify(
        r.org_id, v_reviewers, p_actor, 'review_completed',
        'Review completed: ' || v_title, 'Every item was approved.',
        p_review_id, r.priority);
    END IF;
  END IF;

  PERFORM review_apply_workflow_after_settle(p_review_id, v_status::text);

  RETURN v_status::text;
END;
$$;

-- ===========================================
-- REVIEW UPKEEP (schema 108)
-- ===========================================

-- Withdraw every reviewer of an open round who still owes a decision but can no
-- longer give one: they left the review's organization, or can no longer see the
-- vault of an item they owe. Their assignment closes ('cancelled', with
-- withdrawn_at and the reason), the round is re-settled without them, and the
-- requester is told. When nobody is left to decide, the review stays open and
-- the requester is asked to cancel it and ask again.
--
-- Run by statement triggers on every table that decides organization membership
-- or vault visibility (users, team_member, vault_access, team_vault_access). It
-- scans only open reviews and does nothing when no reviewer lost access.
-- Returns the number of assignments withdrawn.
CREATE OR REPLACE FUNCTION review_withdraw_lost_reviewers()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x RECORD;
  r review%ROWTYPE;
  v_n INTEGER := 0;
  v_status TEXT;
  v_left INTEGER;
  v_title TEXT;
BEGIN
  FOR x IN
    SELECT rr.id AS response_id, rr.review_id, rr.reviewer_id,
           CASE WHEN u.org_id IS DISTINCT FROM rv.org_id THEN 'left_org' ELSE 'lost_vault_access' END AS reason
    FROM review rv
    JOIN review_response rr
      ON rr.review_id = rv.id AND rr.round_number = rv.current_round AND rr.withdrawn_at IS NULL
    LEFT JOIN app_user u ON u.id = rr.reviewer_id
    WHERE rv.status = 'pending'
      AND EXISTS (SELECT 1 FROM organization og WHERE og.id = rv.org_id)
      AND EXISTS (SELECT 1 FROM review_item_list_owed_ids(rv.id, rr.reviewer_id))
      AND (
        u.org_id IS DISTINCT FROM rv.org_id
        OR EXISTS (
          SELECT 1 FROM review_item_list_owed_ids(rv.id, rr.reviewer_id) AS o(item_id)
          JOIN review_item i ON i.id = o.item_id
          WHERE NOT can_user_access_vault(rr.reviewer_id, i.vault_id))
      )
    ORDER BY rv.id, rr.reviewer_id
  LOOP
    SELECT * INTO r FROM review WHERE id = x.review_id FOR UPDATE;
    IF r.status <> 'pending' THEN
      CONTINUE;
    END IF;

    UPDATE review_response
    SET withdrawn_at = NOW(), withdrawn_reason = x.reason, status = 'cancelled', updated_at = NOW()
    WHERE id = x.response_id AND withdrawn_at IS NULL;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    v_n := v_n + 1;

    v_status := review_settle(x.review_id, NULL, true);

    IF v_status = 'pending' THEN
      SELECT count(*) INTO v_left
      FROM review_response rr
      WHERE rr.review_id = x.review_id AND rr.round_number = r.current_round AND rr.withdrawn_at IS NULL;

      v_title := review_get_display_title(x.review_id);
      PERFORM review_notify(
        r.org_id, ARRAY[r.requested_by], NULL, 'review_reviewer_removed',
        'Reviewer removed: ' || v_title,
        COALESCE((SELECT u.full_name FROM app_user u WHERE u.id = x.reviewer_id), 'A reviewer')
          || CASE x.reason WHEN 'left_org' THEN ' left the organization'
                           ELSE ' can no longer see this review''s vault' END
          || CASE WHEN v_left = 0
                  THEN '. Nobody is left to decide: cancel the review and ask again.'
                  ELSE '. The review continues without them.' END,
        x.review_id, r.priority);
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION trg_review_withdraw_lost_reviewers()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM review_withdraw_lost_reviewers();
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_app_user_withdraw_lost_reviewers
  AFTER UPDATE OF org_id, role ON app_user
  FOR EACH STATEMENT EXECUTE FUNCTION trg_review_withdraw_lost_reviewers();

CREATE TRIGGER trg_team_member_withdraw_lost_reviewers
  AFTER INSERT OR UPDATE OR DELETE ON team_member
  FOR EACH STATEMENT EXECUTE FUNCTION trg_review_withdraw_lost_reviewers();

CREATE TRIGGER trg_vault_access_withdraw_lost_reviewers
  AFTER INSERT OR UPDATE OR DELETE ON vault_access
  FOR EACH STATEMENT EXECUTE FUNCTION trg_review_withdraw_lost_reviewers();

CREATE TRIGGER trg_team_vault_access_withdraw_lost_reviewers
  AFTER INSERT OR UPDATE OR DELETE ON team_vault_access
  FOR EACH STATEMENT EXECUTE FUNCTION trg_review_withdraw_lost_reviewers();

-- Re-settle the open reviews that lost items when a file or file version was
-- hard-deleted (review_item cascade from both). Settling may complete the
-- review over the items that are left; a review left with no items is cancelled.
-- The requester is told either way.
CREATE OR REPLACE FUNCTION trg_review_item_resettle_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x RECORD;
  r review%ROWTYPE;
  v_status TEXT;
  v_title TEXT;
BEGIN
  -- review_item_remove() settles and notifies itself; this trigger is for files
  -- deleted from the vault.
  IF current_setting('blueplm.review_items_removed_by_rpc', true) = 'on' THEN
    RETURN NULL;
  END IF;

  FOR x IN
    SELECT o.review_id, count(*)::integer AS n
    FROM old_items o
    GROUP BY o.review_id
    ORDER BY o.review_id
  LOOP
    SELECT * INTO r FROM review WHERE id = x.review_id FOR UPDATE;
    -- Skipped while the organization itself is being deleted (its rows cascade).
    IF r.id IS NULL OR r.status NOT IN ('pending', 'kicked_back')
       OR NOT EXISTS (SELECT 1 FROM organization og WHERE og.id = r.org_id) THEN
      CONTINUE;
    END IF;

    v_title := review_get_display_title(x.review_id);

    IF NOT EXISTS (SELECT 1 FROM review_item i WHERE i.review_id = x.review_id) THEN
      UPDATE review_response
      SET status = 'cancelled', updated_at = NOW()
      WHERE review_id = x.review_id AND status = 'pending';

      UPDATE review_round
      SET closed_at = COALESCE(closed_at, NOW()), outcome = COALESCE(outcome, 'cancelled')
      WHERE review_id = x.review_id AND round_number = r.current_round;

      UPDATE review
      SET status = 'cancelled', cancelled_at = NOW(),
          cancel_reason = 'Every file in this review was deleted.',
          completed_at = NOW(), updated_at = NOW()
      WHERE id = x.review_id;

      PERFORM review_notify(
        r.org_id, ARRAY[r.requested_by], NULL, 'review_cancelled',
        'Review cancelled: ' || v_title, 'Every file in this review was deleted.',
        x.review_id, r.priority);
      CONTINUE;
    END IF;

    IF r.status = 'pending' THEN
      v_status := review_settle(x.review_id, NULL, true);
    ELSE
      v_status := r.status::text;
    END IF;

    IF v_status IN ('pending', 'kicked_back') THEN
      PERFORM review_notify(
        r.org_id, ARRAY[r.requested_by], NULL, 'review_item_removed',
        'File removed from review: ' || v_title,
        x.n || ' file(s) in this review were deleted and removed from it.',
        x.review_id, r.priority);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_review_item_resettle_on_delete
  AFTER DELETE ON review_item
  REFERENCING OLD TABLE AS old_items
  FOR EACH STATEMENT EXECUTE FUNCTION trg_review_item_resettle_on_delete();

-- ===========================================
-- REVIEW PACKAGES: RPCs (schema 107)
-- ===========================================

-- Ask for a review of a package of file versions.
--
-- Versions are pinned here, from file_version ids: each must exist, belong to a
-- live file of the caller's organization in a vault the caller may see, and a
-- file may appear once. Reviewers are users (p_reviewer_ids) and teams
-- (p_team_ids, expanded by team_reviewer_list_user_ids()), all in the caller's
-- organization. A named reviewer who cannot see one of the items' vaults is
-- refused; a team member who cannot is skipped and reported. The requester is
-- never their own reviewer. Everything, notifications included, is one
-- transaction: a review either exists complete with reviewers or not at all.
CREATE OR REPLACE FUNCTION review_request(
  p_file_version_ids UUID[],
  p_reviewer_ids UUID[] DEFAULT '{}'::UUID[],
  p_team_ids UUID[] DEFAULT '{}'::UUID[],
  p_title TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_mode TEXT DEFAULT 'all',
  p_priority TEXT DEFAULT 'normal',
  p_due_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  v_review_id UUID;
  v_bad UUID;
  v_count INTEGER;
  v_vaults UUID[];
  v_reviewers UUID[];
  v_skipped JSONB;
  v_items INTEGER;
  v_title TEXT;
  v_priority TEXT;
BEGIN
  v_actor := my_actor_id();
  SELECT u.org_id INTO v_org_id FROM app_user u WHERE u.id = v_actor;
  PERFORM org_require_member(v_org_id);

  IF NOT has_team_permission('module:reviews', 'create') THEN
    RAISE EXCEPTION 'You do not have permission to request reviews'
      USING ERRCODE = 'insufficient_privilege', HINT = 'FORBIDDEN';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('all', 'any') THEN
    RAISE EXCEPTION 'Mode must be all or any'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'BAD_MODE';
  END IF;

  v_priority := COALESCE(p_priority, 'normal');
  IF v_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Priority must be low, normal, high or urgent'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'BAD_PRIORITY';
  END IF;

  v_count := COALESCE(cardinality(p_file_version_ids), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'A review needs at least one file'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'NO_ITEMS';
  END IF;
  IF v_count > 500 THEN
    RAISE EXCEPTION 'A review can hold at most 500 files'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'TOO_MANY_ITEMS';
  END IF;

  -- Every version exists, on a live file of this organization the caller may see.
  -- Missing and foreign are the same answer.
  SELECT x.id INTO v_bad
  FROM unnest(p_file_version_ids) AS x(id)
  LEFT JOIN file_version fv ON fv.id = x.id
  LEFT JOIN file f ON f.id = fv.file_id
  WHERE fv.id IS NULL
     OR f.org_id IS DISTINCT FROM v_org_id
     OR f.deleted_at IS NOT NULL
     OR NOT can_user_access_vault(v_actor, f.vault_id)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'File version not found'
      USING ERRCODE = 'insufficient_privilege', HINT = 'VERSION_NOT_FOUND',
            DETAIL = COALESCE(v_bad::text, '');
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_file_version_ids) AS x(id)
    JOIN file_version fv ON fv.id = x.id
    GROUP BY fv.file_id HAVING count(DISTINCT fv.id) > 1
  ) THEN
    RAISE EXCEPTION 'A file can be in a review only once'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'DUPLICATE_FILE';
  END IF;

  SELECT x.id INTO v_bad
  FROM unnest(COALESCE(p_reviewer_ids, '{}'::UUID[])) AS x(id)
  LEFT JOIN app_user u ON u.id = x.id AND u.org_id = v_org_id
  WHERE u.id IS NULL
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Reviewer not found in your organization'
      USING ERRCODE = 'insufficient_privilege', HINT = 'REVIEWER_NOT_FOUND',
            DETAIL = COALESCE(v_bad::text, '');
  END IF;

  SELECT x.id INTO v_bad
  FROM unnest(COALESCE(p_team_ids, '{}'::UUID[])) AS x(id)
  LEFT JOIN team t ON t.id = x.id AND t.org_id = v_org_id
  WHERE t.id IS NULL
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Team not found in your organization'
      USING ERRCODE = 'insufficient_privilege', HINT = 'TEAM_NOT_FOUND',
            DETAIL = COALESCE(v_bad::text, '');
  END IF;

  v_vaults := ARRAY(
    SELECT DISTINCT f.vault_id
    FROM unnest(p_file_version_ids) AS x(id)
    JOIN file_version fv ON fv.id = x.id
    JOIN file f ON f.id = fv.file_id
    WHERE f.vault_id IS NOT NULL
  );

  SELECT x.id INTO v_bad
  FROM unnest(COALESCE(p_reviewer_ids, '{}'::UUID[])) AS x(id)
  WHERE x.id <> v_actor
    AND EXISTS (SELECT 1 FROM unnest(v_vaults) AS vv(id) WHERE NOT can_user_access_vault(x.id, vv.id))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'A reviewer cannot see a vault this review uses'
      USING ERRCODE = 'insufficient_privilege', HINT = 'REVIEWER_NO_VAULT_ACCESS',
            DETAIL = COALESCE(v_bad::text, '');
  END IF;

  v_review_id := gen_random_uuid();

  INSERT INTO review (
    id, org_id, vault_id, requested_by, requested_at, title, message, status,
    due_date, priority, team_id, mode, current_round
  ) VALUES (
    v_review_id, v_org_id,
    CASE WHEN cardinality(v_vaults) = 1 THEN v_vaults[1] END,
    v_actor, NOW(), NULLIF(btrim(p_title), ''), NULLIF(btrim(p_message), ''), 'pending',
    p_due_date, v_priority, (COALESCE(p_team_ids, '{}'::UUID[]))[1], p_mode, 1
  );

  INSERT INTO review_item (org_id, review_id, file_id, vault_id, file_version_id, sort_order, added_in_round)
  SELECT DISTINCT ON (fv.file_id)
         v_org_id, v_review_id, fv.file_id, f.vault_id, fv.id, x.ord::integer, 1
  FROM unnest(p_file_version_ids) WITH ORDINALITY AS x(id, ord)
  JOIN file_version fv ON fv.id = x.id
  JOIN file f ON f.id = fv.file_id
  ORDER BY fv.file_id, x.ord;
  GET DIAGNOSTICS v_items = ROW_COUNT;

  INSERT INTO review_round (org_id, review_id, round_number, opened_by, opened_at)
  VALUES (v_org_id, v_review_id, 1, v_actor, NOW());

  INSERT INTO review_round_item (org_id, review_id, item_id, round_number, file_version_id)
  SELECT v_org_id, v_review_id, i.id, 1, i.file_version_id
  FROM review_item i WHERE i.review_id = v_review_id;

  -- Candidates: named users first (they win over a team membership), then team
  -- members. Team members who cannot see every vault are skipped and reported.
  WITH cand AS (
    SELECT x.id AS user_id, NULL::UUID AS via_team_id, 0 AS pri
    FROM unnest(COALESCE(p_reviewer_ids, '{}'::UUID[])) AS x(id)
    UNION ALL
    SELECT m.user_id, t.id, 1
    FROM unnest(COALESCE(p_team_ids, '{}'::UUID[])) AS t(id)
    CROSS JOIN LATERAL team_reviewer_list_user_ids(t.id) AS m(user_id)
  ),
  best AS (
    SELECT DISTINCT ON (c.user_id) c.user_id, c.via_team_id, c.pri
    FROM cand c
    JOIN app_user u ON u.id = c.user_id AND u.org_id = v_org_id
    ORDER BY c.user_id, c.pri
  ),
  judged AS (
    SELECT b.*,
      CASE
        WHEN b.user_id = v_actor THEN 'requester'
        WHEN EXISTS (SELECT 1 FROM unnest(v_vaults) AS vv(id) WHERE NOT can_user_access_vault(b.user_id, vv.id))
          THEN 'no_vault_access'
      END AS skip_reason
    FROM best b
  ),
  ins AS (
    INSERT INTO review_response (org_id, review_id, round_number, reviewer_id, via_team_id, status)
    SELECT v_org_id, v_review_id, 1, j.user_id, j.via_team_id, 'pending'
    FROM judged j WHERE j.skip_reason IS NULL
    RETURNING reviewer_id
  )
  SELECT
    ARRAY(SELECT ins.reviewer_id FROM ins),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', j.user_id, 'reason', j.skip_reason))
              FROM judged j WHERE j.skip_reason IS NOT NULL), '[]'::jsonb)
    INTO v_reviewers, v_skipped;

  IF cardinality(v_reviewers) = 0 THEN
    RAISE EXCEPTION 'A review needs at least one reviewer other than yourself'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'NO_REVIEWERS';
  END IF;

  v_title := review_get_display_title(v_review_id);

  PERFORM review_notify(
    v_org_id, v_reviewers, v_actor, 'review_request',
    'Review requested: ' || v_title,
    COALESCE(NULLIF(btrim(p_message), ''), v_items || ' file(s) to review'),
    v_review_id, v_priority);

  RETURN jsonb_build_object(
    'review_id', v_review_id,
    'item_count', v_items,
    'reviewer_ids', to_jsonb(v_reviewers),
    'skipped', v_skipped
  );
END;
$$;

-- Record the caller's decisions on items of a review's current round.
--
-- p_decisions: [{ item_id, decision, comment? }], decision one of approved,
-- approved_with_comments, changes_requested, rejected; a comment is required for
-- all but approved. Each item must be one the caller still owes. All or nothing:
-- one bad entry refuses the call. The review row is locked, so two reviewers
-- deciding the last items at once settle the review exactly once.
CREATE OR REPLACE FUNCTION review_item_respond(p_review_id UUID, p_decisions JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  r review%ROWTYPE;
  d RECORD;
  v_n INTEGER := 0;
  v_approved INTEGER := 0;
  v_changes INTEGER := 0;
  v_rejected INTEGER := 0;
  v_status TEXT;
  v_owed INTEGER;
BEGIN
  v_actor := my_actor_id();
  v_org_id := review_require_access(p_review_id);

  SELECT * INTO r FROM review WHERE id = p_review_id AND org_id = v_org_id FOR UPDATE;

  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'This review is not open for decisions'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REVIEW_CLOSED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM review_response rr
    WHERE rr.review_id = p_review_id AND rr.round_number = r.current_round AND rr.reviewer_id = v_actor
      AND rr.withdrawn_at IS NULL
  ) THEN
    RAISE EXCEPTION 'You are not a reviewer in this round'
      USING ERRCODE = 'insufficient_privilege', HINT = 'NOT_A_REVIEWER';
  END IF;

  IF p_decisions IS NULL OR jsonb_typeof(p_decisions) <> 'array' OR jsonb_array_length(p_decisions) = 0 THEN
    RAISE EXCEPTION 'Decisions must be a non-empty JSON array'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'BAD_DECISIONS';
  END IF;

  FOR d IN
    SELECT NULLIF(e->>'item_id', '')::uuid AS item_id,
           e->>'decision' AS decision,
           NULLIF(btrim(e->>'comment'), '') AS comment
    FROM jsonb_array_elements(p_decisions) AS e
  LOOP
    IF d.decision IS NULL OR d.decision NOT IN ('approved', 'approved_with_comments', 'changes_requested', 'rejected') THEN
      RAISE EXCEPTION 'Unknown decision'
        USING ERRCODE = 'invalid_parameter_value', HINT = 'BAD_DECISION',
              DETAIL = COALESCE(d.item_id::text, '');
    END IF;

    IF d.decision <> 'approved' AND d.comment IS NULL THEN
      RAISE EXCEPTION 'A comment is required for this decision'
        USING ERRCODE = 'invalid_parameter_value', HINT = 'COMMENT_REQUIRED',
              DETAIL = COALESCE(d.item_id::text, '');
    END IF;

    IF d.item_id IS NULL OR NOT (d.item_id IN (SELECT review_item_list_owed_ids(p_review_id, v_actor))) THEN
      RAISE EXCEPTION 'This item is not awaiting your decision'
        USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'ITEM_NOT_OWED',
              DETAIL = COALESCE(d.item_id::text, '');
    END IF;

    INSERT INTO review_decision (org_id, review_id, item_id, round_number, reviewer_id, decision, comment)
    VALUES (v_org_id, p_review_id, d.item_id, r.current_round, v_actor, d.decision, d.comment);

    v_n := v_n + 1;
    IF d.decision IN ('approved', 'approved_with_comments') THEN
      v_approved := v_approved + 1;
    ELSIF d.decision = 'changes_requested' THEN
      v_changes := v_changes + 1;
    ELSE
      v_rejected := v_rejected + 1;
    END IF;
  END LOOP;

  v_status := review_settle(p_review_id, v_actor, true);

  -- Still open: tell the requester what was decided. A settled review already
  -- told them its outcome.
  IF v_status = 'pending' THEN
    PERFORM review_notify(
      r.org_id, ARRAY[r.requested_by], v_actor, 'review_decision',
      'Review decision: ' || review_get_display_title(p_review_id),
      concat_ws(', ',
        CASE WHEN v_approved > 0 THEN v_approved || ' approved' END,
        CASE WHEN v_changes > 0 THEN v_changes || ' changes requested' END,
        CASE WHEN v_rejected > 0 THEN v_rejected || ' rejected' END),
      p_review_id, r.priority);
  END IF;

  SELECT count(*) INTO v_owed FROM review_item_list_owed_ids(p_review_id, v_actor);

  RETURN jsonb_build_object(
    'review_id', p_review_id,
    'decided', v_n,
    'status', review_status_get_label(v_status::review_status),
    'owed_remaining', v_owed
  );
END;
$$;

-- Approve every item the caller still owes in the current round, with one
-- optional comment (approved_with_comments when given).
CREATE OR REPLACE FUNCTION review_approve_all_remaining(p_review_id UUID, p_comment TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  v_comment TEXT;
  v_decisions JSONB;
BEGIN
  v_actor := my_actor_id();
  v_org_id := review_require_access(p_review_id);

  PERFORM 1 FROM review r WHERE r.id = p_review_id AND r.org_id = v_org_id FOR UPDATE;

  v_comment := NULLIF(btrim(p_comment), '');

  SELECT jsonb_agg(jsonb_build_object(
           'item_id', x.item_id,
           'decision', CASE WHEN v_comment IS NULL THEN 'approved' ELSE 'approved_with_comments' END,
           'comment', v_comment))
    INTO v_decisions
  FROM review_item_list_owed_ids(p_review_id, v_actor) AS x(item_id);

  IF v_decisions IS NULL THEN
    RAISE EXCEPTION 'Nothing in this review is awaiting your decision'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'NOTHING_OWED';
  END IF;

  RETURN review_item_respond(p_review_id, v_decisions);
END;
$$;

-- Open the next round of a review that came back with changes requested or
-- rejected. p_items: [{ item_id, file_version_id }] - every item that needs
-- changes or was rejected must move to a newer version of the same file (the
-- same or an older version is refused); an approved item may also be listed with
-- a newer version to have it reviewed again. Approved items not listed carry
-- forward and are not re-reviewed. The round's reviewers are the previous
-- round's, and only they are notified.
CREATE OR REPLACE FUNCTION review_resubmit(p_review_id UUID, p_items JSONB, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  r review%ROWTYPE;
  e RECORD;
  v_item review_item%ROWTYPE;
  v_cur_version INTEGER;
  v_new_version INTEGER;
  v_listed UUID[] := '{}'::UUID[];
  v_listed_versions UUID[] := '{}'::UUID[];
  v_new_round INTEGER;
  v_reviewers UUID[];
  v_bad UUID;
  v_carried INTEGER;
BEGIN
  v_actor := my_actor_id();
  v_org_id := review_require_access(p_review_id);

  SELECT * INTO r FROM review WHERE id = p_review_id AND org_id = v_org_id FOR UPDATE;

  IF r.requested_by IS DISTINCT FROM v_actor AND NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only the requester or an administrator can resubmit a review'
      USING ERRCODE = 'insufficient_privilege', HINT = 'FORBIDDEN';
  END IF;

  IF r.status NOT IN ('kicked_back', 'rejected') THEN
    RAISE EXCEPTION 'Only a review that came back with changes requested or rejected can be resubmitted'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'NOT_RESUBMITTABLE';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Resubmitting needs at least one item at a newer version'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'NOTHING_TO_RESUBMIT';
  END IF;

  v_new_round := r.current_round + 1;

  FOR e IN
    SELECT NULLIF(x->>'item_id', '')::uuid AS item_id,
           NULLIF(x->>'file_version_id', '')::uuid AS file_version_id
    FROM jsonb_array_elements(p_items) AS x
  LOOP
    SELECT * INTO v_item FROM review_item i WHERE i.id = e.item_id AND i.review_id = p_review_id;
    IF v_item.id IS NULL THEN
      RAISE EXCEPTION 'Item not found in this review'
        USING ERRCODE = 'invalid_parameter_value', HINT = 'ITEM_NOT_FOUND',
              DETAIL = COALESCE(e.item_id::text, '');
    END IF;

    IF v_item.id = ANY (v_listed) THEN
      RAISE EXCEPTION 'An item is listed twice'
        USING ERRCODE = 'invalid_parameter_value', HINT = 'DUPLICATE_ITEM',
              DETAIL = v_item.id::text;
    END IF;

    SELECT fv.version INTO v_cur_version FROM file_version fv WHERE fv.id = v_item.file_version_id;

    SELECT fv.version INTO v_new_version
    FROM file_version fv
    JOIN file f ON f.id = fv.file_id
    WHERE fv.id = e.file_version_id AND fv.file_id = v_item.file_id AND f.org_id = v_org_id;

    IF v_new_version IS NULL THEN
      RAISE EXCEPTION 'That version does not belong to this item''s file'
        USING ERRCODE = 'invalid_parameter_value', HINT = 'VERSION_NOT_FOUND',
              DETAIL = v_item.id::text;
    END IF;

    IF v_new_version <= v_cur_version THEN
      RAISE EXCEPTION 'An item can only be resubmitted at a newer version than the one reviewed (v%)', v_cur_version
        USING ERRCODE = 'invalid_parameter_value', HINT = 'SAME_VERSION',
              DETAIL = v_item.id::text;
    END IF;

    v_listed := v_listed || v_item.id;
    v_listed_versions := v_listed_versions || e.file_version_id;
  END LOOP;

  SELECT i.id INTO v_bad
  FROM review_item i
  WHERE i.review_id = p_review_id
    AND i.outcome <> 'approved'
    AND NOT (i.id = ANY (v_listed))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Every item that needs changes or was rejected must be resubmitted at a newer version'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'ITEM_NEEDS_NEW_VERSION',
            DETAIL = v_bad::text;
  END IF;

  INSERT INTO review_round (org_id, review_id, round_number, opened_by, opened_at, note)
  VALUES (v_org_id, p_review_id, v_new_round, v_actor, NOW(), NULLIF(btrim(p_note), ''));

  UPDATE review_item i
  SET file_version_id = ri.file_version_id, outcome = 'pending'
  FROM unnest(v_listed, v_listed_versions) AS ri(item_id, file_version_id)
  WHERE i.id = ri.item_id AND i.review_id = p_review_id;

  INSERT INTO review_round_item (org_id, review_id, item_id, round_number, file_version_id, is_carried_forward, outcome)
  SELECT v_org_id, p_review_id, i.id, v_new_round, i.file_version_id,
         NOT (i.id = ANY (v_listed)),
         CASE WHEN i.id = ANY (v_listed) THEN 'pending' ELSE 'approved' END
  FROM review_item i
  WHERE i.review_id = p_review_id;

  SELECT count(*) INTO v_carried
  FROM review_round_item rri
  WHERE rri.review_id = p_review_id AND rri.round_number = v_new_round AND rri.is_carried_forward;

  INSERT INTO review_response (org_id, review_id, round_number, reviewer_id, via_team_id, status)
  SELECT v_org_id, p_review_id, v_new_round, rr.reviewer_id, rr.via_team_id, 'pending'
  FROM review_response rr
  JOIN app_user u ON u.id = rr.reviewer_id AND u.org_id = v_org_id
  WHERE rr.review_id = p_review_id AND rr.round_number = r.current_round
    AND rr.withdrawn_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM review_item i
      WHERE i.review_id = p_review_id AND NOT can_user_access_vault(rr.reviewer_id, i.vault_id));

  v_reviewers := ARRAY(
    SELECT rr.reviewer_id FROM review_response rr
    WHERE rr.review_id = p_review_id AND rr.round_number = v_new_round
  );

  IF cardinality(v_reviewers) = 0 THEN
    RAISE EXCEPTION 'None of this review''s reviewers is still in the organization'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'NO_REVIEWERS';
  END IF;

  UPDATE review
  SET current_round = v_new_round, status = 'pending', completed_at = NULL, updated_at = NOW()
  WHERE id = p_review_id;

  PERFORM review_notify(
    v_org_id, v_reviewers, v_actor, 'review_round',
    'Resubmitted for review (round ' || v_new_round || '): ' || review_get_display_title(p_review_id),
    COALESCE(NULLIF(btrim(p_note), ''), cardinality(v_listed) || ' file(s) at a newer version'),
    p_review_id, r.priority);

  RETURN jsonb_build_object(
    'review_id', p_review_id,
    'round', v_new_round,
    'items_to_review', cardinality(v_listed),
    'carried_forward', v_carried
  );
END;
$$;

-- Cancel an open review (requester or administrator). Reviewers who still owed a
-- decision are told; the requester is told when an administrator cancelled it.
CREATE OR REPLACE FUNCTION review_cancel(p_review_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  r review%ROWTYPE;
  v_owing UUID[];
  v_title TEXT;
  v_reason TEXT;
BEGIN
  v_actor := my_actor_id();
  v_org_id := review_require_access(p_review_id);

  SELECT * INTO r FROM review WHERE id = p_review_id AND org_id = v_org_id FOR UPDATE;

  IF r.requested_by IS DISTINCT FROM v_actor AND NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only the requester or an administrator can cancel a review'
      USING ERRCODE = 'insufficient_privilege', HINT = 'FORBIDDEN';
  END IF;

  IF r.status NOT IN ('pending', 'kicked_back') THEN
    RAISE EXCEPTION 'This review is already closed'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REVIEW_CLOSED';
  END IF;

  v_reason := NULLIF(btrim(p_reason), '');

  v_owing := ARRAY(
    SELECT rr.reviewer_id FROM review_response rr
    WHERE rr.review_id = p_review_id AND rr.round_number = r.current_round AND rr.status = 'pending'
  );

  UPDATE review_response
  SET status = 'cancelled', updated_at = NOW()
  WHERE review_id = p_review_id AND status = 'pending';

  UPDATE review_round
  SET closed_at = COALESCE(closed_at, NOW()),
      outcome = COALESCE(outcome, 'cancelled')
  WHERE review_id = p_review_id AND round_number = r.current_round;

  UPDATE review
  SET status = 'cancelled', cancelled_by = v_actor, cancelled_at = NOW(),
      cancel_reason = v_reason, completed_at = NOW(), updated_at = NOW()
  WHERE id = p_review_id;

  v_title := review_get_display_title(p_review_id);

  PERFORM review_notify(
    v_org_id,
    CASE WHEN r.requested_by IS DISTINCT FROM v_actor THEN v_owing || r.requested_by ELSE v_owing END,
    v_actor, 'review_cancelled',
    'Review cancelled: ' || v_title,
    COALESCE(v_reason, 'This review no longer needs a decision.'),
    p_review_id, r.priority);

  RETURN jsonb_build_object('review_id', p_review_id, 'status', 'cancelled');
END;
$$;

-- ===========================================
-- REVIEW ITEMS: ADD TO / REMOVE FROM AN OPEN REVIEW (schema 110)
-- ===========================================

-- Open reviews a file selection can be added to or removed from, for the file
-- context menu (Reviews > Add to review / Remove from review). Lists reviews that
-- are still open (pending, or kicked_back awaiting a resubmit) that the caller
-- requested, plus, for an administrator, every open review holding one of the
-- files. contained_file_ids says which of p_file_ids each review already holds;
-- can_add is true only while the round is open (pending).
CREATE OR REPLACE FUNCTION review_list_open_for_files(p_file_ids UUID[] DEFAULT '{}'::UUID[])
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  v_admin BOOLEAN;
  v_files UUID[];
BEGIN
  v_actor := my_actor_id();
  SELECT u.org_id INTO v_org_id FROM app_user u WHERE u.id = v_actor;
  PERFORM org_require_member(v_org_id);
  v_admin := is_org_admin();
  v_files := COALESCE(p_file_ids, '{}'::UUID[]);

  RETURN COALESCE((
    SELECT jsonb_agg(x.row_json ORDER BY x.requested_at DESC)
    FROM (
      SELECT r.requested_at,
        jsonb_build_object(
          'review_id', r.id,
          'title', review_get_display_title(r.id),
          'status', r.status,
          'item_count', (SELECT count(*) FROM review_item i WHERE i.review_id = r.id),
          'requested_by_me', r.requested_by = v_actor,
          'can_add', r.status = 'pending',
          'contained_file_ids', COALESCE((
            SELECT jsonb_agg(i.file_id) FROM review_item i
            WHERE i.review_id = r.id AND i.file_id = ANY (v_files)
          ), '[]'::jsonb)
        ) AS row_json
      FROM review r
      WHERE r.org_id = v_org_id
        AND r.status IN ('pending', 'kicked_back')
        AND (
          r.requested_by = v_actor
          OR (v_admin AND EXISTS (
            SELECT 1 FROM review_item i WHERE i.review_id = r.id AND i.file_id = ANY (v_files)
          ))
        )
      ORDER BY r.requested_at DESC
      LIMIT 50
    ) x
  ), '[]'::jsonb);
END;
$$;

-- Add file versions to a review whose round is open (requester or administrator).
--
-- The versions are pinned and validated as review_request pins them. A file
-- already in the review is refused (DUPLICATE_FILE): a newer version of an item
-- goes in through resubmit. Every reviewer of the current round must be able to
-- see the new items' vaults (REVIEWER_NO_VAULT_ACCESS), because they owe a
-- decision on them. The new items join the current round, so reviewers who had
-- finished it owe a decision again (review_settle recomputes their assignment),
-- and they are told what was added.
CREATE OR REPLACE FUNCTION review_item_add(p_review_id UUID, p_file_version_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  r review%ROWTYPE;
  v_bad UUID;
  v_count INTEGER;
  v_items INTEGER;
  v_base INTEGER;
  v_reviewers UUID[];
  v_title TEXT;
BEGIN
  v_actor := my_actor_id();
  v_org_id := review_require_access(p_review_id);

  SELECT * INTO r FROM review WHERE id = p_review_id AND org_id = v_org_id FOR UPDATE;

  IF r.requested_by IS DISTINCT FROM v_actor AND NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only the requester or an administrator can add files to a review'
      USING ERRCODE = 'insufficient_privilege', HINT = 'FORBIDDEN';
  END IF;

  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Files can be added only while the review is waiting on its reviewers'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REVIEW_NOT_OPEN';
  END IF;

  v_count := COALESCE(cardinality(p_file_version_ids), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nothing to add'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'NO_ITEMS';
  END IF;
  IF v_count + (SELECT count(*) FROM review_item i WHERE i.review_id = p_review_id) > 500 THEN
    RAISE EXCEPTION 'A review can hold at most 500 files'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'TOO_MANY_ITEMS';
  END IF;

  SELECT x.id INTO v_bad
  FROM unnest(p_file_version_ids) AS x(id)
  LEFT JOIN file_version fv ON fv.id = x.id
  LEFT JOIN file f ON f.id = fv.file_id
  WHERE fv.id IS NULL
     OR f.org_id IS DISTINCT FROM v_org_id
     OR f.deleted_at IS NOT NULL
     OR NOT can_user_access_vault(v_actor, f.vault_id)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'File version not found'
      USING ERRCODE = 'insufficient_privilege', HINT = 'VERSION_NOT_FOUND',
            DETAIL = COALESCE(v_bad::text, '');
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_file_version_ids) AS x(id)
    JOIN file_version fv ON fv.id = x.id
    GROUP BY fv.file_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM unnest(p_file_version_ids) AS x(id)
    JOIN file_version fv ON fv.id = x.id
    JOIN review_item i ON i.review_id = p_review_id AND i.file_id = fv.file_id
  ) THEN
    RAISE EXCEPTION 'A file can be in a review only once'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'DUPLICATE_FILE';
  END IF;

  v_reviewers := ARRAY(
    SELECT rr.reviewer_id FROM review_response rr
    WHERE rr.review_id = p_review_id AND rr.round_number = r.current_round AND rr.withdrawn_at IS NULL
  );

  SELECT rv.id INTO v_bad
  FROM unnest(v_reviewers) AS rv(id)
  WHERE EXISTS (
    SELECT 1 FROM unnest(p_file_version_ids) AS x(id)
    JOIN file_version fv ON fv.id = x.id
    JOIN file f ON f.id = fv.file_id
    WHERE NOT can_user_access_vault(rv.id, f.vault_id)
  )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'A reviewer cannot see a vault these files use'
      USING ERRCODE = 'insufficient_privilege', HINT = 'REVIEWER_NO_VAULT_ACCESS',
            DETAIL = COALESCE(v_bad::text, '');
  END IF;

  SELECT COALESCE(max(i.sort_order), 0) INTO v_base FROM review_item i WHERE i.review_id = p_review_id;

  INSERT INTO review_item (org_id, review_id, file_id, vault_id, file_version_id, sort_order, added_in_round)
  SELECT v_org_id, p_review_id, fv.file_id, f.vault_id, fv.id, v_base + x.ord::integer, r.current_round
  FROM unnest(p_file_version_ids) WITH ORDINALITY AS x(id, ord)
  JOIN file_version fv ON fv.id = x.id
  JOIN file f ON f.id = fv.file_id;
  GET DIAGNOSTICS v_items = ROW_COUNT;

  INSERT INTO review_round_item (org_id, review_id, item_id, round_number, file_version_id)
  SELECT v_org_id, p_review_id, i.id, r.current_round, i.file_version_id
  FROM review_item i
  WHERE i.review_id = p_review_id
    AND NOT EXISTS (
      SELECT 1 FROM review_round_item rri WHERE rri.item_id = i.id AND rri.round_number = r.current_round
    );

  -- One vault for the whole review, or none once it spans several.
  UPDATE review
  SET vault_id = (
        SELECT CASE WHEN count(DISTINCT i.vault_id) = 1 THEN min(i.vault_id::text)::uuid END
        FROM review_item i WHERE i.review_id = p_review_id
      ),
      updated_at = NOW()
  WHERE id = p_review_id;

  PERFORM review_settle(p_review_id, v_actor, false);

  v_title := review_get_display_title(p_review_id);
  PERFORM review_notify(
    v_org_id, v_reviewers, v_actor, 'review_request',
    'Files added to review: ' || v_title,
    v_items || ' file(s) were added to this review and need your decision.',
    p_review_id, r.priority);

  RETURN jsonb_build_object('review_id', p_review_id, 'added', v_items);
END;
$$;

-- Take files out of an open review (requester or administrator). Their items,
-- rounds and decisions go with them (ON DELETE CASCADE). Removing every file is
-- refused (LAST_ITEM): cancel the review instead. The round is re-settled here, so
-- the review completes when what is left is decided. The delete trigger, which is
-- for files deleted from the vault, is told to stand aside so the requester is
-- not told their files were deleted.
CREATE OR REPLACE FUNCTION review_item_remove(p_review_id UUID, p_file_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  r review%ROWTYPE;
  v_files UUID[];
  v_removed INTEGER;
  v_status TEXT;
  v_owing UUID[];
  v_title TEXT;
BEGIN
  v_actor := my_actor_id();
  v_org_id := review_require_access(p_review_id);
  v_files := COALESCE(p_file_ids, '{}'::UUID[]);

  SELECT * INTO r FROM review WHERE id = p_review_id AND org_id = v_org_id FOR UPDATE;

  IF r.requested_by IS DISTINCT FROM v_actor AND NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only the requester or an administrator can remove files from a review'
      USING ERRCODE = 'insufficient_privilege', HINT = 'FORBIDDEN';
  END IF;

  IF r.status NOT IN ('pending', 'kicked_back') THEN
    RAISE EXCEPTION 'This review is already closed'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REVIEW_CLOSED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM review_item i WHERE i.review_id = p_review_id AND NOT (i.file_id = ANY (v_files))
  ) THEN
    RAISE EXCEPTION 'A review needs at least one file. Cancel the review instead.'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'LAST_ITEM';
  END IF;

  v_owing := ARRAY(
    SELECT rr.reviewer_id FROM review_response rr
    WHERE rr.review_id = p_review_id AND rr.round_number = r.current_round
      AND rr.status = 'pending' AND rr.withdrawn_at IS NULL
  );

  PERFORM set_config('blueplm.review_items_removed_by_rpc', 'on', true);
  DELETE FROM review_item i WHERE i.review_id = p_review_id AND i.file_id = ANY (v_files);
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  PERFORM set_config('blueplm.review_items_removed_by_rpc', '', true);

  IF v_removed = 0 THEN
    RETURN jsonb_build_object('review_id', p_review_id, 'removed', 0, 'status', r.status::text);
  END IF;

  UPDATE review
  SET vault_id = (
        SELECT CASE WHEN count(DISTINCT i.vault_id) = 1 THEN min(i.vault_id::text)::uuid END
        FROM review_item i WHERE i.review_id = p_review_id
      ),
      updated_at = NOW()
  WHERE id = p_review_id;

  IF r.status = 'pending' THEN
    v_status := review_settle(p_review_id, v_actor, true);
  ELSIF NOT EXISTS (
    SELECT 1 FROM review_item i WHERE i.review_id = p_review_id AND i.outcome <> 'approved'
  ) THEN
    -- A review sent back for changes whose only unapproved files were just taken
    -- out: everything left is approved, so the review is.
    UPDATE review SET status = 'approved', completed_at = NOW(), updated_at = NOW()
    WHERE id = p_review_id;
    UPDATE review_round SET outcome = 'approved'
    WHERE review_id = p_review_id AND round_number = r.current_round;
    v_status := 'approved';
    PERFORM review_apply_workflow_after_settle(p_review_id, v_status);
  ELSE
    v_status := r.status::text;
  END IF;

  IF v_status = 'pending' THEN
    v_title := review_get_display_title(p_review_id);
    PERFORM review_notify(
      v_org_id, v_owing, v_actor, 'review_item_removed',
      'Files removed from review: ' || v_title,
      v_removed || ' file(s) were taken out of this review and no longer need a decision.',
      p_review_id, r.priority);
  END IF;

  RETURN jsonb_build_object('review_id', p_review_id, 'removed', v_removed, 'status', v_status);
END;
$$;

-- ===========================================
-- REVIEW STAGES: WORKFLOW AFTER A REVIEW (schema 110)
-- ===========================================
-- A review stage is a workflow state with is_review_stage. When files in a review
-- stage are approved in a review, they leave the stage by
-- review_stage_get_exit_transition(). Two organization settings
-- (organization.settings) decide when:
--
--   review_stage_on_approval     'hold' (default): the files are approved and wait
--                                for the requester (or an administrator) to move
--                                them, with review_advance_files().
--                                'advance': they move as soon as the rule below
--                                allows.
--   review_stage_package_policy  'together' (default): a package moves as one,
--                                once the whole review is approved.
--                                'approved_only': each file moves as soon as it is
--                                approved, while the rest of the package is still
--                                under review or being reworked.
--
-- Nothing moves while file workflows are off for the organization.

-- Move a review's approved items out of their review stage. p_only_approved =
-- false is the package move: the caller has checked that every item is
-- approved. An item moves only when all of these hold, otherwise it is reported
-- in 'skipped' with the reason:
--   approved; the file is live; it sits in a review stage; it is still at the
--   version that was approved (a newer check-in was not reviewed); nobody has it
--   checked out; its stage names one exit; that exit has no blocking gate (a gate
--   is its own approval, which a review does not replace); and its target state
--   does not require a checkout.
-- The review's approval is the authority for the move, so the transition's
-- workflow roles are not asked of the actor. Each move is its own subtransaction:
-- one failure is reported and does not undo the others.
CREATE OR REPLACE FUNCTION review_advance_items(p_review_id UUID, p_only_approved BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x RECORD;
  v_moved INTEGER := 0;
  v_skipped JSONB := '[]'::jsonb;
  v_reason TEXT;
  v_transition workflow_transition%ROWTYPE;
BEGIN
  FOR x IN
    SELECT i.id AS item_id, i.file_id, i.outcome, fv.version AS reviewed_version,
           f.version AS current_version, f.deleted_at, f.checked_out_by, f.file_name,
           fwa.current_state_id, COALESCE(ws.is_review_stage, false) AS in_review_stage
    FROM review_item i
    JOIN file_version fv ON fv.id = i.file_version_id
    JOIN file f ON f.id = i.file_id
    LEFT JOIN file_workflow_assignment fwa ON fwa.file_id = i.file_id
    LEFT JOIN workflow_state ws ON ws.id = fwa.current_state_id
    WHERE i.review_id = p_review_id
      AND i.advanced_at IS NULL
      AND (NOT p_only_approved OR i.outcome = 'approved')
    ORDER BY i.sort_order, i.id
  LOOP
    v_reason := NULL;
    v_transition := NULL;

    IF x.outcome <> 'approved' THEN
      v_reason := 'not_approved';
    ELSIF x.deleted_at IS NOT NULL THEN
      v_reason := 'deleted';
    ELSIF x.current_state_id IS NULL OR NOT x.in_review_stage THEN
      v_reason := 'not_in_review_stage';
    ELSIF x.current_version IS DISTINCT FROM x.reviewed_version THEN
      v_reason := 'changed_since_review';
    ELSIF x.checked_out_by IS NOT NULL THEN
      v_reason := 'checked_out';
    ELSE
      SELECT * INTO v_transition FROM workflow_transition
      WHERE id = review_stage_get_exit_transition(x.current_state_id);
      IF v_transition.id IS NULL THEN
        v_reason := 'no_next_stage';
      ELSIF EXISTS (
        SELECT 1 FROM workflow_gate g
        WHERE g.transition_id = v_transition.id AND COALESCE(g.is_blocking, true)
      ) THEN
        v_reason := 'gated';
      ELSIF EXISTS (
        SELECT 1 FROM workflow_state s
        WHERE s.id = v_transition.to_state_id AND COALESCE(s.is_checkout_required, false)
      ) THEN
        v_reason := 'checkout_required';
      END IF;
    END IF;

    IF v_reason IS NULL THEN
      BEGIN
        PERFORM 1 FROM file_workflow_assignment WHERE file_id = x.file_id FOR UPDATE;
        PERFORM workflow_transition_apply(x.file_id, v_transition.id, 'Review approved', NULL);
        UPDATE review_item
        SET advanced_at = NOW(), advanced_to_state_id = v_transition.to_state_id
        WHERE id = x.item_id;
        v_moved := v_moved + 1;
      EXCEPTION WHEN OTHERS THEN
        v_reason := 'transition_failed';
      END;
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'item_id', x.item_id, 'file_id', x.file_id, 'file_name', x.file_name, 'reason', v_reason);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('moved', v_moved, 'skipped', v_skipped);
END;
$$;

-- Called by review_settle() with the status it settled on. Applies the
-- organization's 'advance' setting; with 'hold' it does nothing.
CREATE OR REPLACE FUNCTION review_apply_workflow_after_settle(p_review_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settings JSONB;
BEGIN
  SELECT r.org_id INTO v_org_id FROM review r WHERE r.id = p_review_id;
  IF v_org_id IS NULL OR NOT is_org_file_workflows_enabled(v_org_id) THEN
    RETURN;
  END IF;

  SELECT COALESCE(o.settings, '{}'::jsonb) INTO v_settings FROM organization o WHERE o.id = v_org_id;
  IF COALESCE(v_settings ->> 'review_stage_on_approval', 'hold') <> 'advance' THEN
    RETURN;
  END IF;

  IF COALESCE(v_settings ->> 'review_stage_package_policy', 'together') = 'approved_only' THEN
    PERFORM review_advance_items(p_review_id, true);
  ELSIF p_status = 'approved' THEN
    PERFORM review_advance_items(p_review_id, false);
  END IF;
END;
$$;

-- The requester (or an administrator) moves reviewed files to their next stage.
-- p_only_approved = false moves the package as one and needs the whole review
-- approved (NOT_APPROVED otherwise); true moves the approved files and leaves the
-- rest in their review stage. Returns { moved, skipped: [{ item_id, file_id,
-- file_name, reason }] }.
CREATE OR REPLACE FUNCTION review_advance_files(p_review_id UUID, p_only_approved BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  r review%ROWTYPE;
BEGIN
  v_actor := my_actor_id();
  v_org_id := review_require_access(p_review_id);

  SELECT * INTO r FROM review WHERE id = p_review_id AND org_id = v_org_id FOR UPDATE;

  IF r.requested_by IS DISTINCT FROM v_actor AND NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only the requester or an administrator can move reviewed files'
      USING ERRCODE = 'insufficient_privilege', HINT = 'FORBIDDEN';
  END IF;

  IF NOT is_org_file_workflows_enabled(v_org_id) THEN
    RAISE EXCEPTION 'File workflows are turned off for this organization'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'WORKFLOWS_DISABLED';
  END IF;

  IF r.status = 'cancelled' THEN
    RAISE EXCEPTION 'This review was cancelled'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REVIEW_CLOSED';
  END IF;

  IF NOT COALESCE(p_only_approved, false) AND r.status <> 'approved' THEN
    RAISE EXCEPTION 'The package moves as one only once every file is approved'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'NOT_APPROVED';
  END IF;

  RETURN review_advance_items(p_review_id, COALESCE(p_only_approved, false));
END;
$$;

-- Where each item of a review stands in its workflow, for the review's header:
-- the organization's settings, and per item its current state, whether that is a
-- review stage, the stage it would move to, and when the review moved it.
CREATE OR REPLACE FUNCTION review_get_workflow_status(p_review_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settings JSONB;
BEGIN
  v_org_id := review_require_access(p_review_id);
  SELECT COALESCE(o.settings, '{}'::jsonb) INTO v_settings FROM organization o WHERE o.id = v_org_id;

  RETURN jsonb_build_object(
    'workflows_enabled', is_org_file_workflows_enabled(v_org_id),
    'on_approval', COALESCE(v_settings ->> 'review_stage_on_approval', 'hold'),
    'package_policy', COALESCE(v_settings ->> 'review_stage_package_policy', 'together'),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'item_id', i.id,
        'file_id', i.file_id,
        'outcome', i.outcome,
        'state_name', ws.name,
        'state_color', ws.color,
        'in_review_stage', COALESCE(ws.is_review_stage, false),
        'next_state_name', nx.name,
        'advanced_at', i.advanced_at,
        'advanced_to_state_name', adv.name
      ) ORDER BY i.sort_order, i.id)
      FROM review_item i
      LEFT JOIN file_workflow_assignment fwa ON fwa.file_id = i.file_id
      LEFT JOIN workflow_state ws ON ws.id = fwa.current_state_id
      LEFT JOIN workflow_transition t
        ON ws.is_review_stage AND t.id = review_stage_get_exit_transition(ws.id)
      LEFT JOIN workflow_state nx ON nx.id = t.to_state_id
      LEFT JOIN workflow_state adv ON adv.id = i.advanced_to_state_id
      WHERE i.review_id = p_review_id
    ), '[]'::jsonb)
  );
END;
$$;

-- Change the priority or due date of an open review (requester or
-- administrator). NULL leaves a value as it is; p_clear_due_date removes the
-- due date.
CREATE OR REPLACE FUNCTION review_update_meta(
  p_review_id UUID,
  p_priority TEXT DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_clear_due_date BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  r review%ROWTYPE;
BEGIN
  v_actor := my_actor_id();
  v_org_id := review_require_access(p_review_id);

  SELECT * INTO r FROM review WHERE id = p_review_id AND org_id = v_org_id FOR UPDATE;

  IF r.requested_by IS DISTINCT FROM v_actor AND NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only the requester or an administrator can change a review'
      USING ERRCODE = 'insufficient_privilege', HINT = 'FORBIDDEN';
  END IF;

  IF r.status NOT IN ('pending', 'kicked_back') THEN
    RAISE EXCEPTION 'This review is already closed'
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'REVIEW_CLOSED';
  END IF;

  IF p_priority IS NOT NULL AND p_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Priority must be low, normal, high or urgent'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'BAD_PRIORITY';
  END IF;

  UPDATE review
  SET priority = COALESCE(p_priority, priority),
      due_date = CASE WHEN COALESCE(p_clear_due_date, false) THEN NULL ELSE COALESCE(p_due_date, due_date) END,
      updated_at = NOW()
  WHERE id = p_review_id
  RETURNING * INTO r;

  RETURN jsonb_build_object(
    'review_id', r.id,
    'priority', r.priority,
    'due_date', to_char(r.due_date, 'YYYY-MM-DD')
  );
END;
$$;

-- The review queue, one page at a time.
--
-- Buckets: awaiting_me (package reviews where the caller owes an item in the
-- current round, plus gate reviews the caller may decide), requested_by_me (open
-- reviews the caller asked for), my_teams (open reviews assigned through a team
-- the caller belongs to), done (approved, rejected or cancelled reviews the caller
-- requested or reviewed). Open buckets sort overdue first, then priority, due
-- date, age; done sorts most recently closed first. Every row carries `cursor`,
-- an opaque sort key; pass the last row's cursor (returned as next_cursor) to get
-- the next page.
CREATE OR REPLACE FUNCTION review_list_queue(
  p_bucket TEXT DEFAULT 'awaiting_me',
  p_team_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_cursor TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  v_limit INTEGER;
  v_pattern TEXT;
  v_rows JSONB;
  v_count INTEGER;
  v_next TEXT;
BEGIN
  v_actor := my_actor_id();
  SELECT u.org_id INTO v_org_id FROM app_user u WHERE u.id = v_actor;
  PERFORM org_require_member(v_org_id);

  IF p_bucket IS NULL OR p_bucket NOT IN ('awaiting_me', 'requested_by_me', 'my_teams', 'done') THEN
    RAISE EXCEPTION 'Unknown queue bucket'
      USING ERRCODE = 'invalid_parameter_value', HINT = 'BAD_BUCKET';
  END IF;

  IF p_team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM team t WHERE t.id = p_team_id AND t.org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Team not found in your organization'
      USING ERRCODE = 'insufficient_privilege', HINT = 'TEAM_NOT_FOUND';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_pattern := CASE WHEN NULLIF(btrim(p_search), '') IS NULL THEN NULL
                    ELSE '%' || like_pattern_escape(btrim(p_search)) || '%' END;

  WITH my_teams AS (
    SELECT tm.team_id
    FROM team_member tm
    JOIN team t ON t.id = tm.team_id AND t.org_id = v_org_id
    WHERE tm.user_id = v_actor
  ),
  owed AS (
    SELECT rri.review_id, count(*)::integer AS n
    FROM review r
    JOIN review_response rr
      ON rr.review_id = r.id AND rr.round_number = r.current_round AND rr.reviewer_id = v_actor
     AND rr.withdrawn_at IS NULL
    JOIN review_round_item rri
      ON rri.review_id = r.id AND rri.round_number = r.current_round
     AND NOT rri.is_carried_forward AND rri.outcome = 'pending'
    WHERE r.org_id = v_org_id
      AND r.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM review_decision d
        WHERE d.item_id = rri.item_id AND d.round_number = r.current_round AND d.reviewer_id = v_actor)
    GROUP BY rri.review_id
  ),
  pkg AS (
    SELECT r.*,
           COALESCE(o.n, 0) AS owed_n,
           (r.status IN ('pending', 'kicked_back') AND r.due_date IS NOT NULL AND r.due_date < current_date) AS overdue
    FROM review r
    LEFT JOIN owed o ON o.review_id = r.id
    WHERE r.org_id = v_org_id
      AND CASE p_bucket
            WHEN 'awaiting_me' THEN COALESCE(o.n, 0) > 0
            WHEN 'requested_by_me' THEN r.requested_by = v_actor AND r.status IN ('pending', 'kicked_back')
            WHEN 'my_teams' THEN r.status IN ('pending', 'kicked_back') AND (
                   r.team_id IN (SELECT mt.team_id FROM my_teams mt)
                   OR EXISTS (SELECT 1 FROM review_response rr
                              WHERE rr.review_id = r.id AND rr.via_team_id IN (SELECT mt.team_id FROM my_teams mt)))
            ELSE r.status IN ('approved', 'rejected', 'cancelled') AND (
                   r.requested_by = v_actor
                   OR EXISTS (SELECT 1 FROM review_response rr WHERE rr.review_id = r.id AND rr.reviewer_id = v_actor))
          END
      AND (p_team_id IS NULL
           OR r.team_id = p_team_id
           OR EXISTS (SELECT 1 FROM review_response rr WHERE rr.review_id = r.id AND rr.via_team_id = p_team_id))
      AND (v_pattern IS NULL
           OR r.title ILIKE v_pattern
           OR r.message ILIKE v_pattern
           OR EXISTS (SELECT 1 FROM app_user ru WHERE ru.id = r.requested_by
                        AND (ru.full_name ILIKE v_pattern OR ru.email ILIKE v_pattern))
           OR EXISTS (SELECT 1 FROM review_item i JOIN file f ON f.id = i.file_id
                      WHERE i.review_id = r.id
                        AND (f.file_name ILIKE v_pattern OR f.part_number ILIKE v_pattern
                             OR f.description ILIKE v_pattern)))
      -- Vault access: a review the caller is not part of is listed only when at
      -- least one of its items is in a vault they may see.
      AND (r.requested_by = v_actor
           OR COALESCE(o.n, 0) > 0
           OR EXISTS (SELECT 1 FROM review_response rr WHERE rr.review_id = r.id AND rr.reviewer_id = v_actor)
           OR EXISTS (SELECT 1 FROM review_item i WHERE i.review_id = r.id AND can_user_access_vault(v_actor, i.vault_id)))
  ),
  -- Sort keys only. The row payload (several subqueries per review) is built in
  -- `payloads` below for the page alone, not for every review in the bucket:
  -- the done bucket of a long-lived organization holds thousands.
  pkg_rows AS (
    SELECT
      CASE WHEN p_bucket = 'done' THEN
        lpad((253402300799999999
              - floor(extract(epoch FROM COALESCE(p.completed_at, p.cancelled_at, p.updated_at, p.requested_at, p.created_at)) * 1000000)::bigint)::text,
             18, '0') || p.id::text
      ELSE
        (CASE WHEN p.overdue THEN '0' ELSE '1' END)
        || review_priority_get_rank(p.priority)::text
        || to_char(COALESCE(p.due_date, DATE '9999-12-31'), 'YYYYMMDD')
        || to_char(COALESCE(p.requested_at, p.created_at, 'epoch'::timestamptz) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS')
        || p.id::text
      END AS sort_key,
      'package'::text AS kind, p.id, p.owed_n, p.overdue
    FROM pkg p
  ),
  gate_rows AS (
    SELECT
      '1' || '2' || '99991231'
        || to_char(COALESCE(pr.requested_at, pr.created_at, 'epoch'::timestamptz) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS')
        || pr.id::text AS sort_key,
      'gate'::text AS kind, pr.id, 1 AS owed_n, false AS overdue
    FROM workflow_gate_review pr
    JOIN file f ON f.id = pr.file_id
    JOIN workflow_gate wg ON wg.id = pr.gate_id
    WHERE p_bucket = 'awaiting_me'
      AND p_team_id IS NULL
      AND pr.org_id = v_org_id
      AND pr.id IN (SELECT gate_review_list_awaiting_ids(v_actor))
      AND (v_pattern IS NULL OR f.file_name ILIKE v_pattern OR wg.name ILIKE v_pattern)
  ),
  all_rows AS (
    SELECT sort_key, kind, id, owed_n, overdue FROM pkg_rows
    UNION ALL
    SELECT sort_key, kind, id, owed_n, overdue FROM gate_rows
  ),
  page AS (
    SELECT a.sort_key, a.kind, a.id, a.owed_n, a.overdue,
           row_number() OVER (ORDER BY a.sort_key COLLATE "C") AS rn
    FROM all_rows a
    WHERE p_cursor IS NULL OR a.sort_key COLLATE "C" > p_cursor COLLATE "C"
    ORDER BY a.sort_key COLLATE "C"
    LIMIT v_limit + 1
  ),
  payloads AS (
    SELECT pg.rn, pg.sort_key,
      CASE WHEN pg.kind = 'package' THEN (
        SELECT jsonb_build_object(
          'kind', 'package',
          'id', p.id,
          'title', review_get_display_title(p.id),
          'status', review_status_get_label(p.status),
          'priority', p.priority,
          'due_date', to_char(p.due_date, 'YYYY-MM-DD'),
          'overdue', pg.overdue,
          'mode', p.mode,
          'round', p.current_round,
          'requested_by', review_get_user_json(p.requested_by),
          'requested_at', p.requested_at,
          'completed_at', p.completed_at,
          'team_id', p.team_id,
          'item_count', (SELECT count(*) FROM review_item i WHERE i.review_id = p.id),
          'items_decided', (SELECT count(*) FROM review_round_item rri
                            WHERE rri.review_id = p.id AND rri.round_number = p.current_round
                              AND rri.outcome <> 'pending'),
          'items_owed_by_me', pg.owed_n,
          'preview', (SELECT jsonb_build_object(
                               'file_id', f.id, 'file_name', f.file_name, 'extension', f.extension,
                               'file_version_id', fv.id, 'version', fv.version, 'revision', fv.revision)
                      FROM review_item i
                      JOIN file f ON f.id = i.file_id
                      JOIN file_version fv ON fv.id = i.file_version_id
                      WHERE i.review_id = p.id
                      ORDER BY i.sort_order, f.file_name
                      LIMIT 1),
          'gate', NULL)
        FROM review p WHERE p.id = pg.id)
      ELSE (
        SELECT jsonb_build_object(
        'kind', 'gate',
        'id', pr.id,
        'title', f.file_name || ' - ' || wg.name,
        'status', 'open',
        'priority', 'normal',
        'due_date', NULL,
        'overdue', false,
        'mode', NULL,
        'round', NULL,
        'requested_by', review_get_user_json(pr.requested_by),
        'requested_at', pr.requested_at,
        'completed_at', NULL,
        'team_id', NULL,
        'item_count', 1,
        'items_decided', 0,
        'items_owed_by_me', 1,
        'preview', jsonb_build_object('file_id', f.id, 'file_name', f.file_name, 'extension', f.extension,
                                      'file_version_id', NULL, 'version', f.version, 'revision', f.revision),
        'gate', jsonb_build_object(
          'pending_review_id', pr.id,
          'file_id', f.id,
          'file_name', f.file_name,
          'file_path', f.file_path,
          'gate_id', wg.id,
          'gate_name', wg.name,
          'gate_type', wg.gate_type,
          'transition_id', wt.id,
          'transition_name', wt.name,
          'from_state_name', fs.name,
          'to_state_name', ts.name,
          'checklist_items', wg.checklist_items))
        FROM workflow_gate_review pr
        JOIN file f ON f.id = pr.file_id
        JOIN workflow_gate wg ON wg.id = pr.gate_id
        JOIN workflow_transition wt ON wt.id = pr.transition_id
        LEFT JOIN workflow_state fs ON fs.id = wt.from_state_id
        LEFT JOIN workflow_state ts ON ts.id = wt.to_state_id
        WHERE pr.id = pg.id)
      END AS payload
    FROM page pg
    WHERE pg.rn <= v_limit
  )
  SELECT COALESCE((SELECT jsonb_agg(pl.payload || jsonb_build_object('cursor', pl.sort_key) ORDER BY pl.rn)
                   FROM payloads pl), '[]'::jsonb),
         (SELECT count(*)::integer FROM page),
         (SELECT max(pg.sort_key COLLATE "C") FILTER (WHERE pg.rn <= v_limit) FROM page pg)
    INTO v_rows, v_count, v_next;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'next_cursor', CASE WHEN v_count > v_limit THEN v_next END
  );
END;
$$;

-- One review in full: header, items with their pinned version, PDF and per-round
-- history (decisions included), rounds, reviewers per round, and what the caller
-- may do with it. Items in vaults the caller may not see are left out unless
-- the caller is the requester, a reviewer or an administrator.
CREATE OR REPLACE FUNCTION review_get_detail(p_review_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  r review%ROWTYPE;
  v_is_admin BOOLEAN;
  v_is_requester BOOLEAN;
  v_is_reviewer BOOLEAN;
  v_involved BOOLEAN;
  v_owed UUID[];
BEGIN
  v_actor := my_actor_id();
  v_org_id := review_require_access(p_review_id);

  SELECT * INTO r FROM review WHERE id = p_review_id AND org_id = v_org_id;

  v_is_admin := is_org_admin();
  v_is_requester := r.requested_by = v_actor;
  v_is_reviewer := EXISTS (
    SELECT 1 FROM review_response rr WHERE rr.review_id = r.id AND rr.reviewer_id = v_actor);
  v_involved := v_is_requester OR v_is_reviewer OR v_is_admin;
  v_owed := ARRAY(SELECT review_item_list_owed_ids(r.id, v_actor));

  RETURN jsonb_build_object(
    'review', jsonb_build_object(
      'id', r.id,
      'title', review_get_display_title(r.id),
      'raw_title', r.title,
      'message', r.message,
      'status', review_status_get_label(r.status),
      'priority', r.priority,
      'due_date', to_char(r.due_date, 'YYYY-MM-DD'),
      'overdue', r.status IN ('pending', 'kicked_back') AND r.due_date IS NOT NULL AND r.due_date < current_date,
      'mode', r.mode,
      'current_round', r.current_round,
      'team_id', r.team_id,
      'requested_by', review_get_user_json(r.requested_by),
      'requested_at', r.requested_at,
      'completed_at', r.completed_at,
      'cancelled_by', review_get_user_json(r.cancelled_by),
      'cancelled_at', r.cancelled_at,
      'cancel_reason', r.cancel_reason
    ),
    'items', COALESCE((
      SELECT jsonb_agg(x.item ORDER BY x.sort_order, x.file_name)
      FROM (
        SELECT i.sort_order, f.file_name,
          jsonb_build_object(
            'id', i.id,
            'file_id', i.file_id,
            'vault_id', i.vault_id,
            'sort_order', i.sort_order,
            'outcome', i.outcome,
            'added_in_round', i.added_in_round,
            'file', jsonb_build_object(
              'file_name', f.file_name,
              'file_path', f.file_path,
              'extension', f.extension,
              'part_number', f.part_number,
              'description', f.description,
              'latest_version', f.version,
              'deleted', f.deleted_at IS NOT NULL),
            'version', jsonb_build_object(
              'file_version_id', fv.id,
              'version', fv.version,
              'revision', fv.revision,
              'content_hash', fv.content_hash,
              'file_size', fv.file_size,
              'state', fv.state,
              'created_at', fv.created_at,
              'created_by', fv.created_by,
              'references_recorded', fv.references_recorded_at IS NOT NULL),
            'pdf', (SELECT jsonb_build_object(
                             'storage_hash', d.storage_hash,
                             'file_size', d.file_size,
                             'is_closure_exact', d.is_closure_exact,
                             'generated_by', d.generated_by,
                             'generated_at', d.generated_at)
                    FROM drawing_pdf_render d WHERE d.file_version_id = fv.id),
            'rounds', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'round_number', rri.round_number,
                       'file_version_id', rri.file_version_id,
                       'version', rv.version,
                       'revision', rv.revision,
                       'is_carried_forward', rri.is_carried_forward,
                       'outcome', rri.outcome,
                       'decided_at', rri.decided_at,
                       'decisions', COALESCE((
                         SELECT jsonb_agg(jsonb_build_object(
                                  'reviewer_id', d.reviewer_id,
                                  'decision', d.decision,
                                  'comment', d.comment,
                                  'decided_at', d.decided_at,
                                  'legacy', d.is_legacy) ORDER BY d.decided_at, d.id)
                         FROM review_decision d
                         WHERE d.item_id = rri.item_id AND d.round_number = rri.round_number), '[]'::jsonb)
                     ) ORDER BY rri.round_number)
              FROM review_round_item rri
              JOIN file_version rv ON rv.id = rri.file_version_id
              WHERE rri.item_id = i.id), '[]'::jsonb)
          ) AS item
        FROM review_item i
        JOIN file f ON f.id = i.file_id
        JOIN file_version fv ON fv.id = i.file_version_id
        WHERE i.review_id = r.id
          AND (v_involved OR can_user_access_vault(v_actor, i.vault_id))
      ) x), '[]'::jsonb),
    'rounds', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'round_number', rd.round_number,
               'opened_by', rd.opened_by,
               'opened_at', rd.opened_at,
               'note', rd.note,
               'closed_at', rd.closed_at,
               'outcome', rd.outcome) ORDER BY rd.round_number)
      FROM review_round rd WHERE rd.review_id = r.id), '[]'::jsonb),
    'reviewers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'user', review_get_user_json(rr.reviewer_id),
               'round_number', rr.round_number,
               'status', CASE rr.status WHEN 'kicked_back' THEN 'changes_requested' ELSE rr.status::text END,
               'via_team_id', rr.via_team_id,
               'responded_at', rr.responded_at,
               'withdrawn_reason', rr.withdrawn_reason) ORDER BY rr.round_number, rr.created_at, rr.reviewer_id)
      FROM review_response rr WHERE rr.review_id = r.id), '[]'::jsonb),
    'me', jsonb_build_object(
      'user_id', v_actor,
      'is_requester', v_is_requester,
      'is_reviewer', v_is_reviewer,
      'is_admin', v_is_admin,
      'owed_item_ids', to_jsonb(v_owed),
      'can_respond', r.status = 'pending' AND cardinality(v_owed) > 0,
      'can_cancel', r.status IN ('pending', 'kicked_back') AND (v_is_requester OR v_is_admin),
      'can_resubmit', r.status IN ('kicked_back', 'rejected') AND (v_is_requester OR v_is_admin),
      'can_edit_meta', r.status IN ('pending', 'kicked_back') AND (v_is_requester OR v_is_admin)
    )
  );
END;
$$;

-- The activity-bar badge: package items the caller owes in open reviews plus
-- gate reviews waiting on them - the same set as the awaiting_me bucket, counted
-- by item rather than by review.
CREATE OR REPLACE FUNCTION review_count_badge()
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_org_id UUID;
  v_items INTEGER;
  v_gates INTEGER;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RETURN 0;
  END IF;

  SELECT u.org_id INTO v_org_id FROM app_user u WHERE u.id = v_actor;
  IF v_org_id IS NULL OR NOT is_org_member(v_org_id) THEN
    RETURN 0;
  END IF;

  SELECT count(*)::integer INTO v_items
  FROM review r
  JOIN review_response rr
    ON rr.review_id = r.id AND rr.round_number = r.current_round AND rr.reviewer_id = v_actor
   AND rr.withdrawn_at IS NULL
  JOIN review_round_item rri
    ON rri.review_id = r.id AND rri.round_number = r.current_round
   AND NOT rri.is_carried_forward AND rri.outcome = 'pending'
  WHERE r.org_id = v_org_id
    AND r.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM review_decision d
      WHERE d.item_id = rri.item_id AND d.round_number = r.current_round AND d.reviewer_id = v_actor);

  SELECT count(*)::integer INTO v_gates FROM gate_review_list_awaiting_ids(v_actor);

  RETURN COALESCE(v_items, 0) + COALESCE(v_gates, 0);
END;
$$;

-- ===========================================
-- FILE COMMENTS: REVIEW LINK (schema 107)
-- ===========================================
-- A comment linked to a review must be on one of the review's files, made by
-- its requester, one of its reviewers or an administrator, in the current round,
-- and on an item of that review when it names one. Once written, the link cannot
-- be moved (it may be cleared when its review or item goes away), and a comment
-- from an earlier round cannot be edited: earlier rounds stay as they were.
CREATE OR REPLACE FUNCTION trg_file_comment_link_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r review%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.review_id IS NOT NULL AND NEW.review_id IS DISTINCT FROM OLD.review_id)
       OR (NEW.review_item_id IS NOT NULL AND NEW.review_item_id IS DISTINCT FROM OLD.review_item_id)
       OR NEW.review_round IS DISTINCT FROM OLD.review_round THEN
      RAISE EXCEPTION 'A comment cannot be moved to another review, round or item'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- A link is cleared only by its FK's ON DELETE SET NULL, when the review or
    -- item is gone. Clearing it by hand would detach an earlier-round comment
    -- from its round and make it editable again.
    IF (OLD.review_id IS NOT NULL AND NEW.review_id IS NULL
        AND EXISTS (SELECT 1 FROM review rv WHERE rv.id = OLD.review_id))
       OR (OLD.review_item_id IS NOT NULL AND NEW.review_item_id IS NULL
        AND EXISTS (SELECT 1 FROM review_item i WHERE i.id = OLD.review_item_id)) THEN
      RAISE EXCEPTION 'A comment cannot be detached from its review'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF OLD.review_id IS NOT NULL AND OLD.review_round IS NOT NULL
       AND (NEW.comment IS DISTINCT FROM OLD.comment
            OR NEW.position IS DISTINCT FROM OLD.position
            OR NEW.page_number IS DISTINCT FROM OLD.page_number)
       AND EXISTS (SELECT 1 FROM review rv WHERE rv.id = OLD.review_id AND rv.current_round > OLD.review_round) THEN
      RAISE EXCEPTION 'Comments from an earlier review round cannot be edited'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.review_id IS NULL THEN
    IF NEW.review_item_id IS NOT NULL OR NEW.review_round IS NOT NULL THEN
      RAISE EXCEPTION 'A review round or item needs its review'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO r FROM review rv WHERE rv.id = NEW.review_id;

  IF r.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM file f WHERE f.id = NEW.file_id AND f.org_id = r.org_id
  ) THEN
    RAISE EXCEPTION 'Review not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.user_id IS DISTINCT FROM r.requested_by
     AND NOT EXISTS (SELECT 1 FROM review_response rr WHERE rr.review_id = r.id AND rr.reviewer_id = NEW.user_id)
     AND NOT is_org_admin(NEW.user_id) THEN
    RAISE EXCEPTION 'Only the requester and the reviewers can comment in a review'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.review_round IS NULL THEN
    NEW.review_round := r.current_round;
  ELSIF NEW.review_round <> r.current_round THEN
    RAISE EXCEPTION 'Comments can only be added to the current round'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NEW.review_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM review_item i
    WHERE i.id = NEW.review_item_id AND i.review_id = NEW.review_id AND i.file_id = NEW.file_id
  ) THEN
    RAISE EXCEPTION 'That item is not this file in this review'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_file_comment_link_review
  BEFORE INSERT OR UPDATE ON file_comment
  FOR EACH ROW EXECUTE FUNCTION trg_file_comment_link_review();

-- Notify overdue reviews (schema 107: rewritten for packages).
--
-- Not callable by clients: it acts on every organization at once, so its only
-- defence is the missing EXECUTE grant, which schema_get_withdrawn_execute_manifest() in
-- core.sql asserts. A scheduled caller (pg_cron or the API, as service role) is
-- left for later; overdue is otherwise computed in the queries
-- (due_date < current_date). Notifies the reviewers who still owe a decision and
-- the requester, at most once a day per review and user, deduplicated by type
-- rather than by a title that might one day be localised.
CREATE OR REPLACE FUNCTION review_notify_overdue()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rv RECORD;
  v_n INTEGER;
  v_total INTEGER := 0;
BEGIN
  FOR rv IN
    SELECT r.id, r.org_id, r.requested_by, r.priority, r.due_date,
           review_get_display_title(r.id) AS title,
           ARRAY(
             SELECT rr.reviewer_id FROM review_response rr
             WHERE rr.review_id = r.id AND rr.round_number = r.current_round AND rr.status = 'pending'
           ) AS owing
    FROM review r
    WHERE r.status = 'pending'
      AND r.due_date IS NOT NULL
      AND r.due_date < current_date
  LOOP
    INSERT INTO notification (
      org_id, user_id, type, category, title, message, priority,
      entity_type, entity_id, from_user_id, action_type
    )
    SELECT rv.org_id, u.id, 'review_overdue', 'review',
           'Overdue: ' || rv.title,
           'This review was due ' || to_char(rv.due_date, 'YYYY-MM-DD') || '.',
           rv.priority, 'review', rv.id, NULL, 'open_review'
    FROM app_user u
    WHERE u.org_id = rv.org_id
      AND (u.id = ANY (rv.owing) OR u.id = rv.requested_by)
      AND NOT EXISTS (
        SELECT 1 FROM notification n
        WHERE n.entity_type = 'review' AND n.entity_id = rv.id AND n.user_id = u.id
          AND n.type = 'review_overdue' AND n.created_at > NOW() - INTERVAL '1 day'
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;

  RETURN v_total;
END;
$$;

COMMENT ON TABLE eco IS 'Engineering Change Orders for tracking changes to files/products';
COMMENT ON TABLE file_eco IS 'Links files to ECOs';
COMMENT ON TABLE review IS 'Review packages: a set of file versions reviewed in rounds';
COMMENT ON TABLE review_item IS 'Files in a review package, each pinned to a file version';
COMMENT ON TABLE review_round IS 'Rounds of a review package; review_resubmit opens the next';
COMMENT ON TABLE review_round_item IS 'The version each item was reviewed at in each round, and its outcome there';
COMMENT ON TABLE review_response IS 'One row per reviewer per round: the assignment and its summary';
COMMENT ON TABLE review_decision IS 'Per-item, per-reviewer, per-round decisions; never edited';
COMMENT ON TABLE deviation IS 'Approved departures from specifications for files/parts';
COMMENT ON TABLE file_deviation IS 'Links files to deviations with optional version/revision scope';
COMMENT ON TABLE process_template IS 'Templates defining phase-gate processes for ECOs';
COMMENT ON TABLE process_template_phase IS 'Phases within a process template';
COMMENT ON TABLE process_template_item IS 'Deliverable items (checklist) within a phase';
COMMENT ON TABLE eco_checklist_item IS 'Instantiated checklist items for a specific ECO';
COMMENT ON TABLE eco_gate_approval IS 'Gate approval tracking for ECOs';
COMMENT ON TABLE eco_checklist_activity IS 'Audit trail for ECO checklist changes';

REVOKE ALL ON FUNCTION
  check_gate_requirements(uuid,text),
  eco_gate_approve(uuid,text,text),
  eco_require_access(uuid),
  process_template_instantiate(uuid,uuid),
  review_advance_files(uuid,boolean),
  review_approve_all_remaining(uuid,text),
  review_cancel(uuid,text),
  review_count_badge(),
  review_get_detail(uuid),
  review_get_workflow_status(uuid),
  review_item_add(uuid,uuid[]),
  review_item_remove(uuid,uuid[]),
  review_item_respond(uuid,jsonb),
  review_list_open_for_files(uuid[]),
  review_list_queue(text,uuid,text,integer,text),
  review_priority_get_rank(text),
  review_request(uuid[],uuid[],uuid[],text,text,text,text,date),
  review_require_access(uuid),
  review_resubmit(uuid,jsonb,text),
  review_status_get_label(review_status),
  review_update_meta(uuid,text,date,boolean),
  trg_eco_sync_file_tags(),
  trg_file_eco_sync_tags()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  check_gate_requirements(uuid,text),
  eco_gate_approve(uuid,text,text),
  eco_require_access(uuid),
  process_template_instantiate(uuid,uuid),
  review_advance_files(uuid,boolean),
  review_approve_all_remaining(uuid,text),
  review_cancel(uuid,text),
  review_count_badge(),
  review_get_detail(uuid),
  review_get_workflow_status(uuid),
  review_item_add(uuid,uuid[]),
  review_item_remove(uuid,uuid[]),
  review_item_respond(uuid,jsonb),
  review_list_open_for_files(uuid[]),
  review_list_queue(text,uuid,text,integer,text),
  review_priority_get_rank(text),
  review_request(uuid[],uuid[],uuid[],text,text,text,text,date),
  review_require_access(uuid),
  review_resubmit(uuid,jsonb,text),
  review_status_get_label(review_status),
  review_update_meta(uuid,text,date,boolean),
  trg_eco_sync_file_tags(),
  trg_file_eco_sync_tags()
TO authenticated, service_role;
REVOKE ALL ON FUNCTION
  review_advance_items(uuid,boolean),
  review_apply_workflow_after_settle(uuid,text),
  review_get_display_title(uuid),
  review_get_user_json(uuid),
  review_item_list_owed_ids(uuid,uuid),
  review_notify(uuid,uuid[],uuid,text,text,text,uuid,text),
  review_notify_overdue(),
  review_settle(uuid,uuid,boolean),
  review_withdraw_lost_reviewers(),
  team_reviewer_list_user_ids(uuid),
  trg_file_comment_link_review(),
  trg_review_item_resettle_on_delete(),
  trg_review_withdraw_lost_reviewers()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  review_advance_items(uuid,boolean),
  review_apply_workflow_after_settle(uuid,text),
  review_get_display_title(uuid),
  review_get_user_json(uuid),
  review_item_list_owed_ids(uuid,uuid),
  review_notify(uuid,uuid[],uuid,text,text,text,uuid,text),
  review_notify_overdue(),
  review_settle(uuid,uuid,boolean),
  review_withdraw_lost_reviewers(),
  team_reviewer_list_user_ids(uuid),
  trg_file_comment_link_review(),
  trg_review_item_resettle_on_delete(),
  trg_review_withdraw_lost_reviewers()
TO service_role;

REVOKE ALL ON TABLE deviation, eco, eco_checklist_activity, eco_checklist_item, eco_gate_approval, file_deviation, file_eco, process_template, process_template_item, process_template_phase, review, review_decision, review_item, review_response, review_round, review_round_item FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE deviation, eco, eco_checklist_activity, eco_checklist_item, eco_gate_approval, file_deviation, file_eco, process_template, process_template_item, process_template_phase, review, review_decision, review_item, review_response, review_round, review_round_item TO authenticated, service_role;

SELECT anon_enforce_execute_posture();

-- ===================== from supabase/modules/30-supply-chain.sql =====================

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION trg_org_address_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_address_set_updated_at
  BEFORE UPDATE ON org_address
  FOR EACH ROW
  EXECUTE FUNCTION trg_org_address_set_updated_at();

-- Function to ensure only one default per type per org
CREATE OR REPLACE FUNCTION trg_org_address_ensure_single_default()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    UPDATE org_address
    SET is_default = FALSE
    WHERE org_id = NEW.org_id 
      AND address_type = NEW.address_type 
      AND id != NEW.id
      AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_address_ensure_single_default
  BEFORE INSERT OR UPDATE ON org_address
  FOR EACH ROW
  EXECUTE FUNCTION trg_org_address_ensure_single_default();

CREATE POLICY "org_address: users read"
  ON org_address FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "org_address: admins insert"
  ON org_address FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_user WHERE id = auth.uid() AND org_id = org_address.org_id)
    AND is_org_admin()
  );

CREATE POLICY "org_address: admins update"
  ON org_address FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM app_user WHERE id = auth.uid() AND org_id = org_address.org_id)
    AND is_org_admin()
  );

CREATE POLICY "org_address: admins delete"
  ON org_address FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM app_user WHERE id = auth.uid() AND org_id = org_address.org_id)
    AND is_org_admin()
  );

-- Suppliers
CREATE POLICY "supplier: users read"
  ON supplier FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "supplier: engineers insert"
  ON supplier FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:items', 'create'));

CREATE POLICY "supplier: engineers update"
  ON supplier FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:items', 'edit'));

CREATE POLICY "supplier: admins delete"
  ON supplier FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:items', 'delete'));

-- Supplier Contacts
CREATE POLICY "supplier_contact: users read"
  ON supplier_contact FOR SELECT
  USING (supplier_id IN (SELECT id FROM supplier WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "supplier_contact: engineers manage"
  ON supplier_contact FOR ALL
  USING (supplier_id IN (SELECT id FROM supplier WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND has_team_permission('module:items', 'edit'));

-- Supplier Invitations
CREATE POLICY "supplier_invitation: users read"
  ON supplier_invitation FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "supplier_invitation: engineers manage"
  ON supplier_invitation FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:items', 'edit'));

-- Part Suppliers
CREATE POLICY "part_supplier: users read"
  ON part_supplier FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "part_supplier: engineers manage"
  ON part_supplier FOR ALL
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:items', 'edit'));

-- RFQs
CREATE POLICY "rfq: users read"
  ON rfq FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "rfq: engineers insert"
  ON rfq FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:rfq', 'create'));

CREATE POLICY "rfq: engineers update"
  ON rfq FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:rfq', 'edit'));

CREATE POLICY "rfq: admins delete"
  ON rfq FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('module:rfq', 'delete'));

-- RFQ Items
CREATE POLICY "rfq_item: users read"
  ON rfq_item FOR SELECT
  USING (rfq_id IN (SELECT id FROM rfq WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "rfq_item: engineers manage"
  ON rfq_item FOR ALL
  USING (rfq_id IN (SELECT id FROM rfq WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND has_team_permission('module:rfq', 'edit'));

-- RFQ Suppliers
CREATE POLICY "rfq_supplier: users read"
  ON rfq_supplier FOR SELECT
  USING (rfq_id IN (SELECT id FROM rfq WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "rfq_supplier: engineers manage"
  ON rfq_supplier FOR ALL
  USING (rfq_id IN (SELECT id FROM rfq WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND has_team_permission('module:rfq', 'edit'));

-- RFQ Quotes
CREATE POLICY "rfq_quote: users read"
  ON rfq_quote FOR SELECT
  USING (rfq_id IN (SELECT id FROM rfq WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "rfq_quote: engineers manage"
  ON rfq_quote FOR ALL
  USING (rfq_id IN (SELECT id FROM rfq WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())) AND has_team_permission('module:rfq', 'edit'));

-- RFQ Activity
CREATE POLICY "rfq_activity: users read"
  ON rfq_activity FOR SELECT
  USING (rfq_id IN (SELECT id FROM rfq WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())));

CREATE POLICY "rfq_activity: engineers insert"
  ON rfq_activity FOR INSERT
  -- Schema 112: performed_by is the caller.
  WITH CHECK (rfq_id IN (SELECT id FROM rfq WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()))
              AND performed_by = auth.uid());

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Allocate the next RFQ number for an organization, as RFQ-<year>-<4-digit sequence>.
-- The format predates the split of schema.sql into modules and is preserved here so
-- that numbering continues unbroken on databases that already hold RFQs.
--
-- The sequence is consumed, not derived: the caller runs this in one transaction and
-- INSERTs the RFQ in a later one, so deriving MAX(rfq_number) would hand the same
-- number to two clients that both call this before either has inserted anything. The
-- UPDATE ... RETURNING below takes a row lock and increments in a single statement, so
-- a second caller blocks until the first commits and then reads the incremented value.
-- Numbers are therefore allocated once each and may be skipped if a create is abandoned.
--
-- org_require_member() is what makes p_org_id a claim to be checked rather than an
-- instruction to be followed. SECURITY DEFINER means the policies below are not
-- consulted, and PostgREST reaches this function without a session, so an anonymous
-- caller naming another organization's id used to get back that organization's next
-- RFQ number - which reports how many RFQs it has raised this year, seeds the counter
-- from rows RLS otherwise hides, burns numbers out of its sequence, and creates
-- rfq_number_counter rows for organizations chosen by the caller.
CREATE OR REPLACE FUNCTION rfq_generate_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_seq INTEGER;
BEGIN
  PERFORM org_require_member(p_org_id);

  -- Seed the counter from any RFQs the organization already has for this year, so that
  -- installing this function on a populated database does not reissue existing numbers.
  IF NOT EXISTS (
    SELECT 1 FROM rfq_number_counter WHERE org_id = p_org_id AND year = v_year
  ) THEN
    INSERT INTO rfq_number_counter (org_id, year, last_number)
    SELECT
      p_org_id,
      v_year,
      COALESCE(MAX(SUBSTRING(rfq_number FROM '^RFQ-' || v_year || '-(\d+)$')::INTEGER), 0)
    FROM rfq
    WHERE org_id = p_org_id
    ON CONFLICT (org_id, year) DO NOTHING;
  END IF;

  UPDATE rfq_number_counter
  SET last_number = last_number + 1,
      updated_at = NOW()
  WHERE org_id = p_org_id AND year = v_year
  RETURNING last_number INTO v_seq;

  -- LPAD truncates rather than widens once the sequence outgrows the pad width, which
  -- would silently reissue a number from earlier in the year.
  RETURN 'RFQ-' || v_year || '-' ||
    CASE WHEN v_seq < 10000 THEN LPAD(v_seq::TEXT, 4, '0') ELSE v_seq::TEXT END;
END;
$$;

-- This grant only means "authenticated and no one else" because
-- org_rpc_revoke_public_execute() runs at the end of this file. On its own it
-- adds nothing: a newly created function already carries EXECUTE for PUBLIC.

-- Get best price for a part at a given quantity
CREATE OR REPLACE FUNCTION part_supplier_get_best_price(p_file_id UUID, p_quantity INT DEFAULT 1)
RETURNS TABLE (
  supplier_id UUID,
  supplier_name TEXT,
  supplier_code TEXT,
  supplier_part_number TEXT,
  unit_price DECIMAL(12,4),
  total_price DECIMAL(12,2),
  currency TEXT,
  lead_time_days INT,
  is_preferred BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH pricing AS (
    SELECT 
      ps.supplier_id,
      s.name as supplier_name,
      s.code as supplier_code,
      ps.supplier_part_number,
      ps.currency,
      ps.is_preferred,
      COALESCE(ps.lead_time_days, s.default_lead_time_days) as lead_time_days,
      CASE 
        WHEN ps.price_breaks IS NOT NULL AND jsonb_array_length(ps.price_breaks) > 0 THEN
          (SELECT (pb->>'price')::DECIMAL(12,4)
           FROM jsonb_array_elements(ps.price_breaks) pb
           WHERE (pb->>'qty')::INT <= p_quantity
           ORDER BY (pb->>'qty')::INT DESC LIMIT 1)
        ELSE ps.unit_price
      END as calculated_price
    FROM part_supplier ps
    JOIN supplier s ON ps.supplier_id = s.id
    WHERE ps.file_id = p_file_id AND ps.is_active = true AND s.is_active = true
  )
  SELECT 
    p.supplier_id, p.supplier_name, p.supplier_code, p.supplier_part_number,
    p.calculated_price, (p.calculated_price * p_quantity)::DECIMAL(12,2),
    p.currency, p.lead_time_days, p.is_preferred
  FROM pricing p
  WHERE p.calculated_price IS NOT NULL
  ORDER BY p.is_preferred DESC, p.calculated_price ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Calculate BOM cost
CREATE OR REPLACE FUNCTION bom_calculate_cost(p_assembly_id UUID, p_quantity INT DEFAULT 1)
RETURNS TABLE (
  assembly_id UUID,
  assembly_name TEXT,
  assembly_part_number TEXT,
  total_cost DECIMAL(12,2),
  currency TEXT,
  component_count INT,
  missing_pricing_count INT
) AS $$
DECLARE
  v_total DECIMAL(12,2) := 0;
  v_missing INT := 0;
  v_component_count INT := 0;
  v_currency TEXT := 'USD';
  v_assembly RECORD;
  v_component RECORD;
  v_best_price RECORD;
BEGIN
  SELECT id, file_name, part_number INTO v_assembly FROM file WHERE id = p_assembly_id;
  
  FOR v_component IN
    SELECT fr.child_file_id, fr.quantity, f.file_name, f.part_number
    FROM file_reference fr
    JOIN file f ON fr.child_file_id = f.id
    WHERE fr.parent_file_id = p_assembly_id
  LOOP
    v_component_count := v_component_count + 1;
    SELECT * INTO v_best_price FROM part_supplier_get_best_price(v_component.child_file_id, v_component.quantity * p_quantity) LIMIT 1;
    
    IF v_best_price IS NOT NULL AND v_best_price.unit_price IS NOT NULL THEN
      v_total := v_total + (v_best_price.unit_price * v_component.quantity * p_quantity);
    ELSE
      v_missing := v_missing + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_assembly.id, v_assembly.file_name, v_assembly.part_number, v_total, v_currency, v_component_count, v_missing;
END;
$$ LANGUAGE plpgsql STABLE;

-- Parts with pricing view
--
-- security_invoker, and not readable by anon.
--
-- Without it this view was the largest hole in the release, and nothing in the
-- release could see it. A view has no row-level security of its own, and one
-- that is not security_invoker reads its base tables as the view's *owner* -
-- here postgres, which Supabase's demotion leaves holding BYPASSRLS. So RLS on
-- files, part_supplier and suppliers did not apply, and the view returned
-- every organization's rows to anyone who could select from it. Supabase's
-- default grants meant that included anon: file ids, part numbers,
-- descriptions, paths, revisions, states, preferred supplier, supplier code and
-- unit price, all readable at GET /rest/v1/parts_with_pricing with no JWT.
--
-- Neither check caught it. check_anon_reach() filtered relkind = 'r', and
-- check_org_gates() only looks at functions. Both now cover views; see
-- check_anon_reach() in core.sql.
--
-- security_invoker = true makes the base-table reads happen as the querying
-- user, so RLS applies to them and each caller sees their own organization.
-- That is the half that also closes the leak to authenticated users of *other*
-- tenants, which revoking anon on its own would have left open.
CREATE OR REPLACE VIEW part_with_pricing
WITH (security_invoker = true) AS
SELECT 
  f.id, f.org_id, f.vault_id, f.file_path, f.file_name, f.part_number,
  f.description, f.revision, f.version, f.state, f.file_type,
  (SELECT jsonb_build_object(
    'supplier_id', s.id, 'supplier_name', s.name, 'supplier_code', s.code,
    'supplier_part_number', ps.supplier_part_number, 'unit_price', ps.unit_price,
    'currency', ps.currency, 'lead_time_days', COALESCE(ps.lead_time_days, s.default_lead_time_days)
  ) FROM part_supplier ps JOIN supplier s ON ps.supplier_id = s.id
    WHERE ps.file_id = f.id AND ps.is_preferred = true AND ps.is_active = true LIMIT 1
  ) as preferred_supplier,
  (SELECT COUNT(*) FROM part_supplier WHERE file_id = f.id AND is_active = true) as supplier_count,
  (SELECT MIN(unit_price) FROM part_supplier WHERE file_id = f.id AND is_active = true AND unit_price IS NOT NULL) as lowest_price,
  f.created_at, f.updated_at
FROM file f
WHERE f.deleted_at IS NULL AND f.part_number IS NOT NULL;

COMMENT ON TABLE org_address IS 'Billing and shipping addresses for organizations';
COMMENT ON TABLE supplier IS 'Vendor/supplier companies';
COMMENT ON TABLE supplier_contact IS 'Portal users who work at supplier companies';
COMMENT ON TABLE supplier_invitation IS 'Invitations sent to suppliers to join the portal';
COMMENT ON TABLE part_supplier IS 'Links parts to suppliers with pricing information';
COMMENT ON TABLE rfq IS 'Request for Quote documents';
COMMENT ON TABLE rfq_number_counter IS 'Per-organization, per-year RFQ number sequence consumed by rfq_generate_number()';
COMMENT ON TABLE rfq_item IS 'Line items within an RFQ';
COMMENT ON TABLE rfq_supplier IS 'Suppliers associated with an RFQ';
COMMENT ON TABLE rfq_quote IS 'Quotes received from suppliers for RFQ items';
COMMENT ON TABLE rfq_activity IS 'Activity/audit log for RFQs';

REVOKE ALL ON FUNCTION
  bom_calculate_cost(uuid,integer),
  part_supplier_get_best_price(uuid,integer),
  rfq_generate_number(uuid),
  trg_org_address_ensure_single_default(),
  trg_org_address_set_updated_at()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  bom_calculate_cost(uuid,integer),
  part_supplier_get_best_price(uuid,integer),
  rfq_generate_number(uuid),
  trg_org_address_ensure_single_default(),
  trg_org_address_set_updated_at()
TO authenticated, service_role;

REVOKE ALL ON TABLE org_address, part_supplier, part_with_pricing, rfq, rfq_activity, rfq_item, rfq_number_counter, rfq_quote, rfq_supplier, supplier, supplier_contact, supplier_invitation FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE org_address, part_supplier, part_with_pricing, rfq, rfq_activity, rfq_item, rfq_number_counter, rfq_quote, rfq_supplier, supplier, supplier_contact, supplier_invitation TO authenticated, service_role;

SELECT anon_enforce_execute_posture();

-- ===================== from supabase/modules/40-integrations.sql =====================

-- Organization Integrations
CREATE POLICY "org_integration: org members read"
  ON org_integration FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "org_integration: admins insert"
  ON org_integration FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "org_integration: admins update"
  ON org_integration FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "org_integration: admins delete"
  ON org_integration FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Integration Sync Log
CREATE POLICY "integration_sync_log: engineers read"
  ON integration_sync_log FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('system:integrations', 'view'));

CREATE POLICY "integration_sync_log: system insert"
  ON integration_sync_log FOR INSERT
  -- Schema 112: triggered_by is the caller.
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND triggered_by = auth.uid());

-- Odoo Saved Configs
CREATE POLICY "odoo_saved_config: org members read"
  ON odoo_saved_config FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "odoo_saved_config: admins insert"
  ON odoo_saved_config FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "odoo_saved_config: admins update"
  ON odoo_saved_config FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "odoo_saved_config: admins delete"
  ON odoo_saved_config FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Webhooks
CREATE POLICY "webhook: users read"
  ON webhook FOR SELECT
  -- Schema 112: admins only; the row carries the signing secret. Every write was
  -- already admin-only and nothing outside the admin settings page reads it.
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "webhook: admins insert"
  ON webhook FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "webhook: admins update"
  ON webhook FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "webhook: admins delete"
  ON webhook FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Webhook Deliveries
CREATE POLICY "webhook_delivery: users read"
  ON webhook_delivery FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Schema 112: withdrawn. "Service" policies with TRUE applied to every role,
-- anon included, so anyone could insert or rewrite any organization's delivery
-- log. The service role bypasses RLS and needs no policy.

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Get organization integration status (no credentials exposed)
CREATE OR REPLACE FUNCTION org_integration_get_status(p_org_id UUID, p_integration_type TEXT)
RETURNS TABLE (
  id UUID,
  integration_type TEXT,
  is_active BOOLEAN,
  is_connected BOOLEAN,
  last_connected_at TIMESTAMPTZ,
  is_auto_sync BOOLEAN,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_count INT
) AS $$
BEGIN
  -- Returns the empty set rather than raising, so is_org_member() rather than
  -- org_require_member(). The test was
  -- `p_org_id NOT IN (SELECT org_id FROM users WHERE app_user.id = auth.uid())`,
  -- which is NULL for an account that has not joined an organization, so the
  -- RETURN was skipped and the query below ran for the named organization.
  -- Reproduced against another tenant's Odoo integration.
  IF NOT is_org_member(p_org_id) THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    oi.id, oi.integration_type, oi.is_active, oi.is_connected,
    oi.last_connected_at, oi.is_auto_sync, oi.last_sync_at,
    oi.last_sync_status, oi.last_sync_count
  FROM org_integration oi
  WHERE oi.org_id = p_org_id AND oi.integration_type = p_integration_type AND oi.is_active = true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get Odoo configs (no API keys exposed)
CREATE OR REPLACE FUNCTION odoo_saved_config_list(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  url TEXT,
  database TEXT,
  color TEXT,
  is_active BOOLEAN,
  last_tested_at TIMESTAMPTZ,
  is_last_test_successful BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Same NULL-unsafe test as org_integration_get_status. Reproduced: an account
  -- with app_user.org_id NULL read another tenant's saved Odoo configuration -
  -- its URL, database name and service account - over PostgREST.
  IF NOT is_org_member(p_org_id) THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    osc.id, osc.name, osc.description, osc.url, osc.database,
    osc.color, osc.is_active, osc.last_tested_at, osc.is_last_test_successful, osc.created_at
  FROM odoo_saved_config osc
  WHERE osc.org_id = p_org_id AND osc.is_active = true
  ORDER BY osc.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get webhooks for event
CREATE OR REPLACE FUNCTION webhook_list_for_event(p_org_id UUID, p_event_type webhook_event)
RETURNS SETOF webhook
LANGUAGE sql STABLE AS $$
  SELECT * FROM webhook
  WHERE org_id = p_org_id AND is_active = TRUE AND p_event_type = ANY(events);
$$;

-- Google Drive settings (only if user is in org)
-- Recreate to add inspection_template_folder_id to the return signature
--
-- Both of these hand-wrote their membership test out of auth.uid(). Both were
-- correct, and their correctness was the problem: check_org_gates() had to
-- treat a bare auth.uid() as evidence of a gate in order to keep passing them,
-- and that accommodation certified a function with no authorization at all. See
-- c_gate_binding in core.sql. org_require_member() admits exactly the same
-- callers this test did.
CREATE OR REPLACE FUNCTION org_get_google_drive_settings(p_org_id UUID)
RETURNS TABLE (client_id TEXT, client_secret TEXT, is_enabled BOOLEAN, inspection_template_folder_id TEXT) 
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM org_require_member(p_org_id);

  RETURN QUERY
  SELECT o.google_drive_client_id, o.google_drive_client_secret, o.is_google_drive_enabled,
         o.google_drive_inspection_template_folder_id
  FROM organization o WHERE o.id = p_org_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION org_update_google_drive_settings(
  p_org_id UUID, p_client_id TEXT, p_client_secret TEXT, p_enabled BOOLEAN,
  p_inspection_template_folder_id TEXT DEFAULT NULL
) RETURNS BOOLEAN SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  -- Membership first, then the narrower admin question. The organization
  -- binding is a call something can recognise. "Admin" is is_org_admin(): the
  -- role column OR membership of the Administrators team, the same answer the
  -- renderer and the API now give.
  PERFORM org_require_member(p_org_id);

  IF NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only admins can update Google Drive settings';
  END IF;
  
  UPDATE organization
  SET google_drive_client_id = p_client_id,
      google_drive_client_secret = p_client_secret,
      is_google_drive_enabled = p_enabled,
      google_drive_inspection_template_folder_id = p_inspection_template_folder_id
  WHERE id = p_org_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- TRIGGERS
-- ===========================================
CREATE TRIGGER trg_webhook_set_updated_at
  BEFORE UPDATE ON webhook
  FOR EACH ROW
  EXECUTE FUNCTION trg_set_updated_at();

-- Licenses: admins read every licence in their organization; anyone else reads
-- only the licences assigned to them (schema 106). Before 106 every member read
-- every row, serial_number included. The assignment test goes through a
-- SECURITY DEFINER helper because the assignment policies below read
-- solidworks_license, and a licence policy that read the assignments table
-- under RLS would recurse.
--
-- The helper takes no argument on purpose: it answers only about the caller, so
-- there is no row id for check_unbound_entity_args() to ask about and nothing
-- to hand it that reaches another user's assignments.
CREATE OR REPLACE FUNCTION my_solidworks_license_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT license_id FROM solidworks_license_assignment WHERE user_id = auth.uid()
$$;

CREATE POLICY "solidworks_license: admins and assignees read"
  ON solidworks_license FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    AND (is_org_admin() OR id IN (SELECT my_solidworks_license_ids()))
  );

-- Licenses: Admins can insert
CREATE POLICY "solidworks_license: admins insert"
  ON solidworks_license FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Licenses: Admins can update
CREATE POLICY "solidworks_license: admins update"
  ON solidworks_license FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Licenses: Admins can delete
CREATE POLICY "solidworks_license: admins delete"
  ON solidworks_license FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Assignments: users read their own, admins read every assignment in the org.
-- The second arm used to admit any org member (the comment always said admins),
-- which told every member who held which licence.
CREATE POLICY "solidworks_license_assignment: users read own"
  ON solidworks_license_assignment FOR SELECT
  USING (
    user_id = auth.uid() OR (
      is_org_admin() AND license_id IN (
        SELECT id FROM solidworks_license
        WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
      )
    )
  );

-- Assignments: Admins can manage all
CREATE POLICY "solidworks_license_assignment: admins insert"
  ON solidworks_license_assignment FOR INSERT
  WITH CHECK (
    license_id IN (
      SELECT id FROM solidworks_license 
      WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    ) AND is_org_admin()
  );

CREATE POLICY "solidworks_license_assignment: admins update"
  ON solidworks_license_assignment FOR UPDATE
  USING (
    license_id IN (
      SELECT id FROM solidworks_license 
      WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    ) AND is_org_admin()
  );

CREATE POLICY "solidworks_license_assignment: admins delete"
  ON solidworks_license_assignment FOR DELETE
  USING (
    license_id IN (
      SELECT id FROM solidworks_license 
      WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    ) AND is_org_admin()
  );

-- Withdrawn in schema 106. It let a user UPDATE any column of their own
-- assignment, license_id included, so pointing it at another licence made that
-- licence's serial readable through the assignee arm of the licence policy.
-- Users change their activation through solidworks_license_activate() and
-- solidworks_license_deactivate(), which are SECURITY DEFINER and touch only
-- the activation columns; nothing in the app updated the row directly.

-- Helper function: Assign license to user
CREATE OR REPLACE FUNCTION solidworks_license_assign(
  p_license_id UUID,
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_current_user_id UUID;
  v_license_org_id UUID;
  v_user_org_id UUID;
  v_assignment_id UUID;
BEGIN
  v_current_user_id := auth.uid();
  
  -- Get license org
  SELECT org_id INTO v_license_org_id FROM solidworks_license WHERE id = p_license_id;
  
  IF v_license_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'License not found');
  END IF;
  
  -- The comment below used to say "admin of the license org" while the code
  -- asked only whether the caller was an admin of *some* organization - their
  -- own. An admin anywhere could therefore hand out any other organization's
  -- licences. Membership of the licence's organization is the missing half.
  IF NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = v_current_user_id AND u.org_id = v_license_org_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'License not found');
  END IF;

  -- Verify current user is admin of the license org
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can assign licenses');
  END IF;
  
  -- Verify target user is in the same org
  SELECT org_id INTO v_user_org_id FROM app_user WHERE id = p_user_id;
  
  IF v_user_org_id IS NULL OR v_user_org_id != v_license_org_id THEN
    RETURN json_build_object('success', false, 'error', 'User not found in organization');
  END IF;
  
  -- Check if assignment already exists
  IF EXISTS (SELECT 1 FROM solidworks_license_assignment WHERE license_id = p_license_id AND user_id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'License already assigned to this user');
  END IF;
  
  -- Create assignment
  INSERT INTO solidworks_license_assignment (license_id, user_id, assigned_by)
  VALUES (p_license_id, p_user_id, v_current_user_id)
  RETURNING id INTO v_assignment_id;
  
  RETURN json_build_object('success', true, 'assignment_id', v_assignment_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Helper function: Unassign license from user
CREATE OR REPLACE FUNCTION solidworks_license_unassign(
  p_assignment_id UUID
) RETURNS JSON AS $$
DECLARE
  v_license_org_id UUID;
BEGIN
  -- Get the org from the license via assignment
  SELECT sl.org_id INTO v_license_org_id
  FROM solidworks_license_assignment sla
  JOIN solidworks_license sl ON sl.id = sla.license_id
  WHERE sla.id = p_assignment_id;
  
  IF v_license_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;
  
  -- Being an admin somewhere is not being an admin here: without this, an admin
  -- of any organization could revoke any other organization's licence
  -- assignments. Same refusal as a nonexistent assignment, so this is not a way
  -- to enumerate them.
  IF NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_license_org_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  -- Verify current user is admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can unassign licenses');
  END IF;
  
  -- Delete assignment
  DELETE FROM solidworks_license_assignment WHERE id = p_assignment_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Helper function: Activate license on a machine
CREATE OR REPLACE FUNCTION solidworks_license_activate(
  p_assignment_id UUID,
  p_machine_id TEXT,
  p_machine_name TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_license_org_id UUID;
BEGIN
  -- Get the assignment user
  SELECT sla.user_id, sl.org_id INTO v_user_id, v_license_org_id
  FROM solidworks_license_assignment sla
  JOIN solidworks_license sl ON sl.id = sla.license_id
  WHERE sla.id = p_assignment_id;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  -- is_org_admin() answers "an admin of your own organization", so on its own it
  -- let an admin anywhere activate any assignment. Scope it to this licence's
  -- organization.
  IF NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_license_org_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;
  
  -- Verify current user owns this assignment or is admin
  IF auth.uid() != v_user_id AND NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to activate this license');
  END IF;
  
  -- Update activation status
  UPDATE solidworks_license_assignment
  SET 
    is_active = true,
    activated_at = NOW(),
    machine_id = p_machine_id,
    machine_name = p_machine_name,
    deactivated_at = NULL
  WHERE id = p_assignment_id;
  
  RETURN json_build_object('success', true, 'activated_at', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Helper function: Deactivate license
CREATE OR REPLACE FUNCTION solidworks_license_deactivate(
  p_assignment_id UUID
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_license_org_id UUID;
BEGIN
  -- Get the assignment user
  SELECT sla.user_id, sl.org_id INTO v_user_id, v_license_org_id
  FROM solidworks_license_assignment sla
  JOIN solidworks_license sl ON sl.id = sla.license_id
  WHERE sla.id = p_assignment_id;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  -- Scope the admin check to this licence's organization; is_org_admin() only
  -- says the caller is an admin of their own.
  IF NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_license_org_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;
  
  -- Verify current user owns this assignment or is admin
  IF auth.uid() != v_user_id AND NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to deactivate this license');
  END IF;
  
  -- Update deactivation status
  UPDATE solidworks_license_assignment
  SET 
    is_active = false,
    deactivated_at = NOW()
  WHERE id = p_assignment_id;
  
  RETURN json_build_object('success', true, 'deactivated_at', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Trigger for updated_at
CREATE TRIGGER trg_solidworks_license_set_updated_at
  BEFORE UPDATE ON solidworks_license
  FOR EACH ROW
  EXECUTE FUNCTION trg_set_updated_at();

-- Function to add a license to a pending member's pre-assigned list
CREATE OR REPLACE FUNCTION pending_license_assignment_add(
  p_pending_member_id UUID,
  p_license_id UUID
) RETURNS JSON AS $$
DECLARE
  v_pending RECORD;
  v_license_org_id UUID;
BEGIN
  -- Verify admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can assign licenses');
  END IF;
  
  -- Get pending member
  SELECT * INTO v_pending FROM pending_org_member WHERE id = p_pending_member_id AND claimed_at IS NULL;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Pending member not found');
  END IF;

  -- The admin check above is satisfied by being an admin of any organization,
  -- so without this an admin elsewhere could edit this organization's pending
  -- invitations. Same refusal as a nonexistent invitation.
  IF NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_pending.org_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Pending member not found');
  END IF;
  
  -- Verify license belongs to same org
  SELECT org_id INTO v_license_org_id FROM solidworks_license WHERE id = p_license_id;
  IF v_license_org_id IS NULL OR v_license_org_id != v_pending.org_id THEN
    RETURN json_build_object('success', false, 'error', 'License not found in organization');
  END IF;
  
  -- Add license to array if not already present
  UPDATE pending_org_member
  SET solidworks_license_ids = array_append(
    array_remove(solidworks_license_ids, p_license_id), -- Remove first to avoid duplicates
    p_license_id
  )
  WHERE id = p_pending_member_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Function to remove a license from a pending member's pre-assigned list
CREATE OR REPLACE FUNCTION pending_license_assignment_remove(
  p_pending_member_id UUID,
  p_license_id UUID
) RETURNS JSON AS $$
BEGIN
  -- Verify admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can unassign licenses');
  END IF;
  
  -- ...of this invitation's organization. is_org_admin() alone let an admin
  -- anywhere strip licences from anyone's pending invitations.
  UPDATE pending_org_member
  SET solidworks_license_ids = array_remove(solidworks_license_ids, p_license_id)
  WHERE id = p_pending_member_id
    AND claimed_at IS NULL
    AND org_id = (SELECT u.org_id FROM app_user u WHERE u.id = auth.uid());
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Function to apply pending license assignments when user signs up
-- This should be called from the trg_app_user_claim_pending_membership trigger
CREATE OR REPLACE FUNCTION pending_license_assignment_apply(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_pending RECORD;
  v_license_id UUID;
  v_invited_by UUID;
BEGIN
  -- Find the pending member record for this user
  SELECT * INTO v_pending
  FROM pending_org_member
  -- Schema 111: verified address and the account's own organization, as in
  -- team_member_apply_pending() (core.sql).
  WHERE LOWER(email) = user_get_verified_email(p_user_id)
    AND org_id = (SELECT org_id FROM app_user WHERE id = p_user_id)
    AND claimed_at IS NULL
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Assign each pre-assigned license
  IF v_pending.solidworks_license_ids IS NOT NULL AND array_length(v_pending.solidworks_license_ids, 1) > 0 THEN
    v_invited_by := v_pending.invited_by;
    
    FOREACH v_license_id IN ARRAY v_pending.solidworks_license_ids
    LOOP
      -- Only assign if license still exists and isn't already assigned to someone else
      IF EXISTS (
        SELECT 1 FROM solidworks_license 
        WHERE id = v_license_id 
        AND org_id = v_pending.org_id
        AND NOT EXISTS (SELECT 1 FROM solidworks_license_assignment WHERE license_id = v_license_id)
      ) THEN
        INSERT INTO solidworks_license_assignment (license_id, user_id, assigned_by)
        VALUES (v_license_id, p_user_id, v_invited_by)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- No policies are defined for anon or authenticated, and that is deliberate.
-- With RLS enabled and no matching policy, PostgREST returns zero rows to
-- those roles. service_role bypasses RLS, so only the API can reach these
-- values. Do not add a "users can view their org's credentials" policy here:
-- that would reintroduce exactly the problem this table exists to fix.
CREATE OR REPLACE FUNCTION trg_integration_credential_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_integration_credential_set_updated_at
  BEFORE UPDATE ON integration_credential
  FOR EACH ROW EXECUTE FUNCTION trg_integration_credential_set_updated_at();

COMMENT ON TABLE org_integration IS 'Generic integration configurations for orgs';
COMMENT ON TABLE integration_sync_log IS 'Audit trail for integration sync operations';
COMMENT ON COLUMN integration_sync_log.sync_watermark_at IS 'How far through the source system''s change history this run got, in the SOURCE system''s clock (for Odoo, res.partner/sale.order write_date). The next run of the same sync_type resumes from the newest successful run''s value. Only written on success, so a cancelled or failed run leaves the window to be re-read.';
COMMENT ON TABLE odoo_saved_config IS 'Saved Odoo ERP connection configurations';
COMMENT ON TABLE webhook IS 'Webhook configurations for external integrations';
COMMENT ON TABLE webhook_delivery IS 'Webhook delivery attempts and history';
COMMENT ON TABLE solidworks_license IS 'Organization SOLIDWORKS license keys and metadata';
COMMENT ON TABLE solidworks_license_assignment IS 'User-license assignments with activation tracking';
COMMENT ON TABLE integration_credential IS 'Encrypted credentials for external integrations. Readable only by service_role: RLS is enabled with no policies for anon or authenticated, so PostgREST returns nothing to clients. Ciphertext is AES-256-GCM under EXTENSION_ENCRYPTION_KEY.';

REVOKE ALL ON FUNCTION
  my_solidworks_license_ids(),
  odoo_saved_config_list(uuid),
  org_get_google_drive_settings(uuid),
  org_integration_get_status(uuid,text),
  org_update_google_drive_settings(uuid,text,text,boolean,text),
  pending_license_assignment_add(uuid,uuid),
  pending_license_assignment_remove(uuid,uuid),
  solidworks_license_activate(uuid,text,text),
  solidworks_license_assign(uuid,uuid),
  solidworks_license_deactivate(uuid),
  solidworks_license_unassign(uuid),
  trg_integration_credential_set_updated_at(),
  webhook_list_for_event(uuid,webhook_event)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  my_solidworks_license_ids(),
  odoo_saved_config_list(uuid),
  org_get_google_drive_settings(uuid),
  org_integration_get_status(uuid,text),
  org_update_google_drive_settings(uuid,text,text,boolean,text),
  pending_license_assignment_add(uuid,uuid),
  pending_license_assignment_remove(uuid,uuid),
  solidworks_license_activate(uuid,text,text),
  solidworks_license_assign(uuid,uuid),
  solidworks_license_deactivate(uuid),
  solidworks_license_unassign(uuid),
  trg_integration_credential_set_updated_at(),
  webhook_list_for_event(uuid,webhook_event)
TO authenticated, service_role;
REVOKE ALL ON FUNCTION
  pending_license_assignment_apply(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  pending_license_assignment_apply(uuid)
TO service_role;

REVOKE ALL ON TABLE integration_sync_log, odoo_saved_config, org_integration, solidworks_license, solidworks_license_assignment, webhook, webhook_delivery FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE integration_sync_log, odoo_saved_config, org_integration, solidworks_license, solidworks_license_assignment, webhook, webhook_delivery TO authenticated, service_role;
REVOKE ALL ON TABLE integration_credential FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE integration_credential TO service_role;

SELECT anon_enforce_execute_posture();

-- ===================== from supabase/modules/50-extensions.sql =====================

-- Installed Extensions: Org members can view, admins can manage
CREATE POLICY "org_installed_extension: org members read"
  ON org_installed_extension FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

-- Writes are admin-only, spelled out per command so an INSERT or UPDATE is
-- checked against the row it writes (WITH CHECK), not only the row it replaces.
-- Installing a native extension is an admin decision to run code with full trust
-- for the whole organization.
CREATE POLICY "org_installed_extension: admins insert"
  ON org_installed_extension FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "org_installed_extension: admins update"
  ON org_installed_extension FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin())
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "org_installed_extension: admins delete"
  ON org_installed_extension FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Extension Config: Similar to installed extensions

-- Extension Storage: written and read by the API on an extension's behalf, never
-- by a signed-in user directly. The old policy let every member of an org read
-- and rewrite every extension's storage for that org, so one member could forge
-- another extension's state. Only service_role now; admins keep DELETE so that
-- uninstalling an extension (api/src/extensions/loader.ts uninstallExtension,
-- which runs with the admin's own client) still clears its rows.

-- Extension Secrets: Admins can view names, service role can access values

-- Secret Versions: Service role only

-- Secret Access Log: Admins can view

-- An audit log any signed-in user can append to is not evidence: the old
-- policy had no TO clause, so it applied to every role, and WITH CHECK (TRUE)
-- let anyone insert rows for any org. Only service_role writes it now.

-- HTTP Log: Admins can view

-- An audit log any signed-in user can append to is not evidence: the old
-- policy had no TO clause, so it applied to every role, and WITH CHECK (TRUE)
-- let anyone insert rows for any org. Only service_role writes it now.

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Get extension config (safe for UI)
--
-- "Safe for UI" was only ever true for the caller's own organization.
-- extension_config_update below has always checked the caller's membership;
-- these two read the same rows and did not, so an extension's configuration for
-- any organization came back to anyone who named its id.
-- plpgsql rather than sql so the membership check runs before the query and not
-- as one more conjunct the planner is free to skip when no row matches.

-- Update extension config

-- Get extension statistics

-- Both cleanup routines sweep every organization at once: the DELETE is
-- qualified by age only, never by org_id. That is correct for an operator
-- maintenance sweep and catastrophic for anything a tenant can call, so the
-- ACL is the entire boundary. Neither had a GRANT in this file, which is
-- exactly why they looked safe; on Supabase, ALTER DEFAULT PRIVILEGES grants
-- authenticated EXECUTE on every function postgres creates, and an absent
-- GRANT means the default stands rather than that no one holds the privilege.
--
-- Measured before this revoke, on a harness at this release: a signed-in user
-- belonging to NO organization called POST /rpc/cleanup_extension_http_logs
-- with p_retention_days = 0 and got HTTP 200 with a row count, taking another
-- tenant's extension_http_log from 1 row to 0. The same held for
-- extension_secret_access_cleanup against extension_secret_access. That
-- is destruction of audit evidence by an unrelated tenant.
--
-- Withdrawing the endpoint is the whole fix, and org scoping would be the
-- wrong shape, because nothing signed-in is supposed to call these at all:
--   * no caller anywhere in src/, api/, electron/ or scripts/
--   * no pg_cron schedule and no scheduled job in the tree
--   * the retention path the application actually uses is cleanupHttpLogs()
--     in api/src/extensions/http-logger.ts, which deletes straight from the
--     table filtered by org_id and extension_id, under RLS, and never touches
--     this RPC
-- Adding a membership check would therefore gate a door with nobody behind it
-- while leaving the sweep unable to do the one job it exists for. postgres and
-- service_role keep EXECUTE and can still run the sweep.
--
-- check_org_gates() cannot police this pair - they take no organization
-- argument, so there is no foreign id for it to substitute and no refusal for
-- it to require. Coverage is negative control NC19, which regrants EXECUTE
-- exactly as the default ACL had it and requires the stamp to be withheld.

-- Same shape, same reasoning, same measurement - see the comment above.

-- ===========================================
-- NATIVE EXTENSION PACKAGES (storage bucket org-extensions)
-- ===========================================
-- Private bucket. Objects live under <org_id>/<extension_id>/<version>-<sha256>.bpx.
-- Members of an organization read their own organization's prefix (the desktop
-- downloads through a short-lived signed URL); only that organization's admins
-- write it. The API reads with the service role.
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-extensions', 'org-extensions', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

CREATE POLICY "Org members read their org extension packages"
  ON storage.objects FOR SELECT TO authenticated
  USING (((bucket_id = 'org-extensions'::text) AND ((storage.foldername(name))[1] IN ( SELECT (app_user.org_id)::text AS org_id
   FROM app_user
  WHERE ((app_user.id = auth.uid()) AND (app_user.org_id IS NOT NULL))))));

CREATE POLICY "Org admins upload extension packages"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'org-extensions'::text) AND is_org_admin() AND ((storage.foldername(name))[1] IN ( SELECT (app_user.org_id)::text AS org_id
   FROM app_user
  WHERE ((app_user.id = auth.uid()) AND (app_user.org_id IS NOT NULL))))));

CREATE POLICY "Org admins update extension packages"
  ON storage.objects FOR UPDATE TO authenticated
  USING (((bucket_id = 'org-extensions'::text) AND is_org_admin() AND ((storage.foldername(name))[1] IN ( SELECT (app_user.org_id)::text AS org_id
   FROM app_user
  WHERE ((app_user.id = auth.uid()) AND (app_user.org_id IS NOT NULL))))))
  WITH CHECK (((bucket_id = 'org-extensions'::text) AND is_org_admin() AND ((storage.foldername(name))[1] IN ( SELECT (app_user.org_id)::text AS org_id
   FROM app_user
  WHERE ((app_user.id = auth.uid()) AND (app_user.org_id IS NOT NULL))))));

CREATE POLICY "Org admins delete extension packages"
  ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'org-extensions'::text) AND is_org_admin() AND ((storage.foldername(name))[1] IN ( SELECT (app_user.org_id)::text AS org_id
   FROM app_user
  WHERE ((app_user.id = auth.uid()) AND (app_user.org_id IS NOT NULL))))));

COMMENT ON TABLE org_installed_extension IS 'Native extensions installed per organization, each pinned to the package an org admin installed (package_sha256).';
COMMENT ON COLUMN org_installed_extension.manifest IS 'Full extension.json manifest with metadata and contributions';
COMMENT ON COLUMN org_installed_extension.package_sha256 IS 'Native extensions: lowercase hex SHA-256 of the .bpx. The desktop and the API refuse to run a package that does not hash to this.';
COMMENT ON COLUMN org_installed_extension.package_path IS 'Native extensions: object path in the org-extensions bucket, <org_id>/<extension_id>/<version>-<sha256>.bpx.';
COMMENT ON COLUMN org_installed_extension.category IS 'Manifest category: native or sandboxed (NULL on rows from before schema 104).';

REVOKE ALL ON TABLE org_installed_extension FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE org_installed_extension TO authenticated, service_role;

-- Every SECURITY DEFINER function the baseline defines pins search_path, and verification refuses to
-- stamp while any public one does not. What is left without it at this point was installed outside
-- this repository (a native extension's own SQL, or drift), was written against the 4.x names, and
-- would hold the stamp back. Drop it with whatever depends on it; an installed extension recreates
-- its objects when its 5.0 SQL is applied after this migration. Functions owned by a Postgres
-- extension are left alone.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS c WHERE c LIKE 'search_path=%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    RAISE NOTICE '0500: dropping % (SECURITY DEFINER without search_path, not part of the 5.0 baseline)', f;
    EXECUTE format('DROP FUNCTION %s CASCADE', f);
  END LOOP;
END
$$;

SELECT anon_enforce_execute_posture();
