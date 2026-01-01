-- BluePLM Cleanup Script
-- Run this BEFORE running the new modular schema files
-- This cleans up old/orphaned objects but PRESERVES ALL DATA
--
-- Safe to run: Only drops functions, triggers, types - NOT tables or data

-- ===========================================
-- DROP OLD TRIGGERS (will be recreated by modules)
-- ===========================================
DROP TRIGGER IF EXISTS log_file_changes ON files;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_organization_created ON organizations;
DROP TRIGGER IF EXISTS notify_watchers_on_file_change ON files;
DROP TRIGGER IF EXISTS trigger_sync_eco_tags_insert ON file_ecos;
DROP TRIGGER IF EXISTS trigger_sync_eco_tags_delete ON file_ecos;
DROP TRIGGER IF EXISTS trigger_sync_eco_tags_on_eco_update ON ecos;
DROP TRIGGER IF EXISTS webhooks_updated_at ON webhooks;
DROP TRIGGER IF EXISTS org_address_updated ON organization_addresses;
DROP TRIGGER IF EXISTS ensure_single_default ON organization_addresses;
DROP TRIGGER IF EXISTS auto_set_user_org_id ON users;
DROP TRIGGER IF EXISTS claim_pending_membership_trigger ON users;

-- ===========================================
-- DROP OLD FUNCTIONS (will be recreated by modules)
-- ===========================================
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS handle_new_organization() CASCADE;
DROP FUNCTION IF EXISTS log_file_activity() CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_trash() CASCADE;
DROP FUNCTION IF EXISTS update_org_address_timestamp() CASCADE;
DROP FUNCTION IF EXISTS ensure_single_default_address() CASCADE;
DROP FUNCTION IF EXISTS auto_set_user_org_id_func() CASCADE;
DROP FUNCTION IF EXISTS ensure_user_org_id() CASCADE;
DROP FUNCTION IF EXISTS update_last_online() CASCADE;
DROP FUNCTION IF EXISTS join_org_by_slug(TEXT) CASCADE;
DROP FUNCTION IF EXISTS block_user(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS unblock_user(TEXT) CASCADE;
DROP FUNCTION IF EXISTS regenerate_org_slug() CASCADE;
DROP FUNCTION IF EXISTS get_org_auth_providers(TEXT) CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_backup_locks() CASCADE;
DROP FUNCTION IF EXISTS acquire_backup_lock(UUID, TEXT, TEXT, UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS release_backup_lock(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_backup_heartbeat(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS request_backup(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS start_backup(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS complete_backup(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS create_default_workflow(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS get_available_transitions(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS get_google_drive_settings(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_google_drive_settings(UUID, TEXT, TEXT, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS get_best_price(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS calculate_bom_cost(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS generate_rfq_number(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_rfq_summary(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_org_integration_status(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_org_odoo_configs(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_org_woocommerce_configs(UUID) CASCADE;
DROP FUNCTION IF EXISTS is_supplier_account(TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_org_rfq_settings(UUID, JSONB) CASCADE;
DROP FUNCTION IF EXISTS update_org_branding(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_org_module_defaults(UUID) CASCADE;
DROP FUNCTION IF EXISTS set_org_module_defaults(UUID, JSONB, JSONB, JSONB, JSONB) CASCADE;
DROP FUNCTION IF EXISTS get_org_column_defaults(UUID) CASCADE;
DROP FUNCTION IF EXISTS set_org_column_defaults(UUID, JSONB) CASCADE;
DROP FUNCTION IF EXISTS get_next_serial_number(UUID) CASCADE;
DROP FUNCTION IF EXISTS preview_next_serial_number(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS update_schema_version(INT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_webhooks_for_event(UUID, webhook_event) CASCADE;
DROP FUNCTION IF EXISTS use_admin_recovery_code(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS notify_file_watchers() CASCADE;
DROP FUNCTION IF EXISTS generate_share_token() CASCADE;
DROP FUNCTION IF EXISTS create_file_share_link(UUID, UUID, UUID, INT, INT, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS validate_share_link(TEXT) CASCADE;
DROP FUNCTION IF EXISTS notify_overdue_reviews() CASCADE;
DROP FUNCTION IF EXISTS sync_file_eco_tags() CASCADE;
DROP FUNCTION IF EXISTS sync_eco_tags_on_eco_update() CASCADE;
DROP FUNCTION IF EXISTS is_org_admin() CASCADE;
DROP FUNCTION IF EXISTS is_org_admin(UUID) CASCADE;
DROP FUNCTION IF EXISTS user_has_permission(UUID, TEXT, permission_action, UUID) CASCADE;
DROP FUNCTION IF EXISTS user_has_team_permission(TEXT, permission_action, UUID) CASCADE;
DROP FUNCTION IF EXISTS get_user_permissions(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS get_user_vault_access(UUID) CASCADE;
DROP FUNCTION IF EXISTS create_default_job_titles(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS create_default_permission_teams(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS apply_pending_team_memberships(UUID) CASCADE;
DROP FUNCTION IF EXISTS claim_pending_membership() CASCADE;
DROP FUNCTION IF EXISTS delete_user_account() CASCADE;
DROP FUNCTION IF EXISTS admin_remove_user(TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_user_avatar(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS instantiate_process_template(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS check_gate_requirements(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS approve_eco_gate(UUID, TEXT, TEXT) CASCADE;

-- ===========================================
-- NOTE: Types are NOT dropped here
-- ===========================================
-- Dropping types would fail if tables reference them.
-- The module files handle types with "CREATE TYPE IF NOT EXISTS" 
-- wrapped in exception handlers, so they're safe to leave.

-- ===========================================
-- NEXT STEPS
-- ===========================================
-- After running this, run the module files in order:
--   1. core.sql
--   2. modules/10-source-files.sql
--   3. modules/20-change-control.sql
--   4. modules/30-supply-chain.sql
--   5. modules/40-integrations.sql
