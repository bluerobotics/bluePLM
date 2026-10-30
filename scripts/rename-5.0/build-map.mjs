#!/usr/bin/env node
// Builds supabase/rename-map-5.0.json from the SQL inventory and the naming decisions below.
//
//   node scripts/rename-5.0/build-map.mjs [--check]
//
// The decisions (table, column, function and trigger names) are written out by hand here, because a
// name is a judgement. Policies, indexes and constraints are derived from the new table and column
// names by the shapes in `.cursor/rules/database.mdc`. `--check` exits non-zero when the map on disk
// differs from what this script would write, or when a decision no longer matches the SQL.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSchema, inventory } from './schemaInventory.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'supabase/rename-map-5.0.json')

// ---------------------------------------------------------------------------------------------
// Tables (and the one view). Singular snake_case; `users` is reserved -> `app_user`;
// org-owned configuration tables named `organization_*` take the `org_` prefix.
// ---------------------------------------------------------------------------------------------
export const TABLES = {
  organizations: 'organization',
  users: 'app_user',
  blocked_users: 'blocked_user',
  teams: 'team',
  team_members: 'team_member',
  team_reviewers: 'team_reviewer',
  team_permissions: 'team_permission',
  permission_presets: 'permission_preset',
  user_permissions: 'user_permission',
  job_titles: 'job_title',
  user_job_titles: 'user_job_title',
  pending_org_members: 'pending_org_member',
  admin_recovery_codes: 'admin_recovery_code',
  user_sessions: 'user_session',
  notifications: 'notification',
  color_swatches: 'color_swatch',
  vaults: 'vault',
  workflow_templates: 'workflow_template',
  workflow_states: 'workflow_state',
  files: 'file',
  file_versions: 'file_version',
  release_files: 'release_file',
  file_references: 'file_reference',
  file_version_references: 'file_version_reference',
  drawing_pdf_renders: 'drawing_pdf_render',
  folders: 'folder',
  workflow_transitions: 'workflow_transition',
  workflow_gates: 'workflow_gate',
  workflow_gate_reviewers: 'workflow_gate_reviewer',
  workflow_roles: 'workflow_role',
  user_workflow_roles: 'user_workflow_role',
  file_workflow_assignments: 'file_workflow_assignment',
  // Gate reviews. `pending_review` would read as a state of `review` (drawing reviews), which it is not.
  pending_reviews: 'workflow_gate_review',
  file_state_entries: 'file_state_entry',
  file_watchers: 'file_watcher',
  file_share_links: 'file_share_link',
  file_comments: 'file_comment',
  file_metadata_columns: 'file_metadata_column',
  backup_machines: 'backup_machine',
  backup_locks: 'backup_lock',
  item_images: 'item_image',
  item_designations: 'item_designation',
  item_designation_assignments: 'item_designation_assignment',
  inspection_characteristics: 'inspection_characteristic',
  inspection_characteristic_versions: 'inspection_characteristic_version',
  inspection_methods: 'inspection_method',
  ecos: 'eco',
  file_ecos: 'file_eco',
  reviews: 'review',
  review_items: 'review_item',
  review_rounds: 'review_round',
  review_round_items: 'review_round_item',
  review_responses: 'review_response',
  review_decisions: 'review_decision',
  deviations: 'deviation',
  file_deviations: 'file_deviation',
  process_templates: 'process_template',
  process_template_phases: 'process_template_phase',
  process_template_items: 'process_template_item',
  eco_checklist_items: 'eco_checklist_item',
  eco_gate_approvals: 'eco_gate_approval',
  organization_addresses: 'org_address',
  suppliers: 'supplier',
  supplier_contacts: 'supplier_contact',
  supplier_invitations: 'supplier_invitation',
  part_suppliers: 'part_supplier',
  rfqs: 'rfq',
  rfq_number_counters: 'rfq_number_counter',
  rfq_items: 'rfq_item',
  rfq_suppliers: 'rfq_supplier',
  rfq_quotes: 'rfq_quote',
  organization_integrations: 'org_integration',
  odoo_saved_configs: 'odoo_saved_config',
  webhooks: 'webhook',
  webhook_deliveries: 'webhook_delivery',
  solidworks_licenses: 'solidworks_license',
  solidworks_license_assignments: 'solidworks_license_assignment',
  integration_credentials: 'integration_credential',
  org_installed_extensions: 'org_installed_extension',
  extension_secrets: 'extension_secret',
  extension_secret_versions: 'extension_secret_version',
}

export const VIEWS = {
  parts_with_pricing: 'part_with_pricing',
}

// ---------------------------------------------------------------------------------------------
// Columns: only where a rule is broken. [table (old name), old, new, reason]
// Role-named foreign keys (item_id, template_id, contact_id, title_id, parent_id) satisfy
// "<entity>_id" with the role as the entity and are kept: renaming them buys no clarity and
// they are among the most used identifiers in the review and RFQ code.
// ---------------------------------------------------------------------------------------------
const B = 'boolean without is_/has_/can_'
const T = 'timestamp without _at'
const F = 'foreign key without _id'
export const COLUMNS = [
  ['organizations', 'google_drive_enabled', 'is_google_drive_enabled', B],
  ['users', 'last_sign_in', 'last_sign_in_at', T],
  ['users', 'last_online', 'last_online_at', T],
  ['user_sessions', 'last_active', 'last_active_at', T],
  ['user_sessions', 'last_seen', 'last_seen_at', T],
  ['notifications', 'action_completed', 'is_action_completed', B],
  ['notifications', 'read', 'is_read', B],
  ['workflow_states', 'requires_checkout', 'is_checkout_required', B],
  ['workflow_states', 'auto_increment_revision', 'is_revision_auto_incremented', B],
  ['workflow_states', 'triggers_review', 'is_review_stage', B + '; the docs already call such a state a review stage'],
  ['file_version_references', 'exact', 'is_exact', B],
  ['drawing_pdf_renders', 'closure_exact', 'is_closure_exact', B],
  ['pending_reviews', 'assigned_to', 'assignee_id', F],
  ['file_watchers', 'notify_on_checkin', 'is_notified_on_checkin', B],
  ['file_watchers', 'notify_on_checkout', 'is_notified_on_checkout', B],
  ['file_watchers', 'notify_on_state_change', 'is_notified_on_state_change', B],
  ['file_watchers', 'notify_on_review', 'is_notified_on_review', B],
  ['file_share_links', 'allow_download', 'can_download', B],
  ['file_share_links', 'require_auth', 'is_auth_required', B],
  ['file_comments', 'resolved', 'is_resolved', B],
  ['file_metadata_columns', 'visible', 'is_visible', B],
  ['file_metadata_columns', 'sortable', 'is_sortable', B],
  ['file_metadata_columns', 'required', 'is_required', B],
  ['backup_config', 'schedule_enabled', 'is_schedule_enabled', B],
  ['backup_config', 'designated_machine_last_seen', 'designated_machine_last_seen_at', T],
  ['backup_config', 'backup_running_since', 'backup_started_at', T],
  ['backup_machines', 'last_seen', 'last_seen_at', T],
  ['review_round_items', 'carried_forward', 'is_carried_forward', B],
  ['review_decisions', 'legacy', 'is_legacy', B],
  ['deviations', 'effective_date', 'effective_at', T],
  ['deviations', 'expiration_date', 'expires_at', T + '; expires_at is the name every other table uses'],
  ['process_template_items', 'required_for_gate', 'is_required_for_gate', B],
  ['eco_checklist_items', 'required_for_gate', 'is_required_for_gate', B],
  ['supplier_contacts', 'email_verified', 'is_email_verified', B],
  ['supplier_contacts', 'phone_verified', 'is_phone_verified', B],
  ['supplier_contacts', 'last_sign_in', 'last_sign_in_at', T],
  ['part_suppliers', 'last_price_update', 'price_updated_at', T],
  ['rfqs', 'requires_samples', 'is_samples_required', B],
  ['rfqs', 'requires_first_article', 'is_first_article_required', B],
  ['rfqs', 'requires_quality_report', 'is_quality_report_required', B],
  ['rfqs', 'allow_partial_quotes', 'is_partial_quote_allowed', B],
  ['rfqs', 'release_files_generated', 'is_release_files_generated', B],
  ['organization_integrations', 'auto_sync', 'is_auto_sync', B],
  ['integration_sync_log', 'cancel_requested', 'is_cancel_requested', B],
  ['integration_sync_log', 'sync_watermark', 'sync_watermark_at', T],
  ['odoo_saved_configs', 'last_test_success', 'is_last_test_successful', B],
  ['org_installed_extensions', 'enabled', 'is_enabled', B],
  ['extension_http_log', 'timestamp', 'created_at', T + '; `timestamp` is also a type name'],
]

// ---------------------------------------------------------------------------------------------
// Functions: `<entity>_<verb>[_<qualifier>]`, or a kept prefix (is_/has_/can_/my_/check_/trg_).
// Keyed by name; every overload of a name takes the same new name. Unlisted names are kept.
// ---------------------------------------------------------------------------------------------
export const FUNCTIONS = {
  // schema tooling
  schema_release_version: 'schema_get_release_version',
  schema_release_description: 'schema_get_release_description',
  schema_release_manifest: 'schema_get_release_manifest',
  record_remediation: 'schema_remediation_record',
  like_escape: 'like_pattern_escape',
  strip_sql_noise: 'sql_strip_noise',
  probe_literal_for: 'probe_get_literal',
  probe_literal_for_arg: 'probe_get_literal_for_arg',
  org_gate_exclusion_reason: 'org_gate_get_exclusion_reason',
  org_gate_status_blocks: 'is_org_gate_status_blocking',
  anon_revoke_grantors: 'anon_list_revoke_grantors',
  anon_read_grantors: 'anon_list_read_grantors',
  anon_admitting_policies: 'anon_list_admitting_policies',
  anon_read_allowlist: 'anon_get_read_allowlist',
  row_selecting_id_args: 'routine_list_row_selecting_id_args',
  withdrawn_execute_manifest: 'schema_get_withdrawn_execute_manifest',
  verify_and_stamp_schema: 'schema_verify_and_stamp',
  try_stamp_schema: 'schema_stamp_quiet',
  update_schema_version: 'schema_version_update',
  anon_execute_allowlist: 'anon_get_execute_allowlist',
  enforce_anon_execute_posture: 'anon_enforce_execute_posture',
  revoke_public_execute_on_org_rpcs: 'org_rpc_revoke_public_execute',
  migrate_uuid_defaults: 'schema_migrate_uuid_defaults',
  drop_function_overloads: 'routine_drop_overloads',
  // access and identity
  user_has_team_permission: 'has_team_permission',
  user_has_permission: 'has_user_permission',
  verified_auth_email: 'user_get_verified_email',
  require_org_member: 'org_require_member',
  current_actor_id: 'my_actor_id',
  require_same_org_user: 'user_require_same_org',
  get_user_permissions: 'user_permission_list',
  ensure_user_org_id: 'user_ensure_org_id',
  update_last_online: 'user_update_last_online',
  join_org_by_slug: 'org_join_by_slug',
  block_user: 'user_block',
  unblock_user: 'user_unblock',
  regenerate_org_slug: 'org_regenerate_slug',
  update_org_branding: 'org_update_branding',
  get_org_auth_providers: 'org_get_auth_providers',
  create_default_job_titles: 'job_title_create_defaults',
  create_default_permission_teams: 'team_create_defaults',
  apply_pending_team_memberships: 'team_member_apply_pending',
  delete_user_account: 'user_delete_account',
  admin_remove_user: 'org_remove_user',
  use_admin_recovery_code: 'admin_recovery_code_use',
  update_user_avatar: 'user_update_avatar',
  get_org_module_defaults: 'org_get_module_defaults',
  set_org_module_defaults: 'org_set_module_defaults',
  force_org_module_defaults: 'org_force_module_defaults',
  get_team_module_defaults: 'team_get_module_defaults',
  set_team_module_defaults: 'team_set_module_defaults',
  clear_team_module_defaults: 'team_clear_module_defaults',
  get_user_module_defaults: 'user_get_module_defaults',
  user_can_access_module: 'can_access_module',
  get_denied_modules: 'module_list_denied',
  get_module_access_config: 'module_access_get_config',
  set_module_access: 'module_access_set',
  get_org_column_defaults: 'org_get_column_defaults',
  set_org_column_defaults: 'org_set_column_defaults',
  force_org_column_defaults: 'org_force_column_defaults',
  set_user_column_defaults: 'user_set_column_defaults',
  get_user_column_defaults: 'user_get_column_defaults',
  // source files
  require_file_access: 'file_require_access',
  require_vault_access: 'vault_require_access',
  remediate_case_colliding_folders: 'folder_remediate_case_collisions',
  get_backup_status: 'backup_get_status',
  create_default_workflow: 'workflow_create_default',
  get_available_transitions: 'workflow_transition_list_available',
  import_workflow_graph: 'workflow_import_graph',
  generate_share_token: 'file_share_link_generate_token',
  create_file_share_link: 'file_share_link_create',
  share_link_admission: 'file_share_link_admit',
  validate_share_link: 'file_share_link_validate',
  consume_share_link: 'file_share_link_consume',
  get_user_vault_access: 'user_vault_access_list',
  user_may_access_vault: 'can_user_access_vault',
  may_access_vault: 'can_access_vault',
  get_active_file_by_path: 'file_get_active_by_path',
  checkout_file: 'file_checkout',
  merge_custom_properties: 'custom_properties_merge',
  checkin_file: 'file_checkin',
  repair_config_maps: 'file_repair_config_maps',
  preview_next_serial_number: 'serial_number_preview_next',
  get_next_serial_number: 'serial_number_get_next',
  update_serialization_settings_safe: 'org_update_serialization_settings',
  get_item_definition_settings: 'org_get_item_definition_settings',
  update_item_definition_settings: 'org_update_item_definition_settings',
  get_item_images: 'item_image_list',
  upsert_item_image: 'item_image_upsert',
  reset_item_image: 'item_image_reset',
  get_item_designations: 'item_designation_list',
  upsert_item_designation: 'item_designation_upsert',
  delete_item_designation: 'item_designation_delete',
  get_item_designation_assignments: 'item_designation_assignment_list',
  set_item_designation_assignment: 'item_designation_assignment_set',
  get_vault_files_fast: 'vault_file_list',
  get_vault_files_count: 'vault_file_count',
  get_vault_files_delta: 'vault_file_list_delta',
  move_file: 'file_move',
  rename_folder_files: 'folder_rename',
  next_revision_value: 'revision_get_next',
  legacy_file_state: 'file_get_legacy_state',
  user_can_run_transition: 'can_run_transition',
  apply_workflow_transition: 'workflow_transition_apply',
  org_file_workflows_enabled: 'is_org_file_workflows_enabled',
  review_stage_exit_transition: 'review_stage_get_exit_transition',
  execute_workflow_transition: 'workflow_transition_execute',
  execute_transition_to_legacy_state: 'workflow_transition_execute_to_legacy_state',
  effective_user_role: 'user_get_effective_role',
  gate_reviewer_user_ids: 'gate_reviewer_list_user_ids',
  may_review_gate: 'can_review_gate',
  gate_review_ids_awaiting: 'gate_review_list_awaiting_ids',
  complete_gate_review: 'gate_review_complete',
  get_my_pending_reviews: 'gate_review_list_mine',
  record_version_references: 'file_version_reference_record',
  version_reference_edges: 'file_version_reference_list_edges',
  get_version_dependency_closure: 'file_version_get_dependency_closure',
  get_drawing_pdf: 'drawing_pdf_render_get',
  record_drawing_pdf: 'drawing_pdf_render_record',
  remediate_cross_tenant_share_links: 'file_share_link_remediate_cross_tenant',
  remediate_cross_tenant_workflow_history: 'workflow_history_remediate_cross_tenant',
  may_read_vault_object: 'can_read_vault_object',
  // change control
  require_eco_access: 'eco_require_access',
  instantiate_process_template: 'process_template_instantiate',
  approve_eco_gate: 'eco_gate_approve',
  review_status_label: 'review_status_get_label',
  review_priority_rank: 'review_priority_get_rank',
  require_review_access: 'review_require_access',
  review_user_json: 'review_get_user_json',
  review_display_title: 'review_get_display_title',
  team_reviewer_user_ids: 'team_reviewer_list_user_ids',
  review_owed_item_ids: 'review_item_list_owed_ids',
  request_review: 'review_request',
  respond_to_review_items: 'review_item_respond',
  approve_all_remaining: 'review_approve_all_remaining',
  resubmit_review: 'review_resubmit',
  cancel_review: 'review_cancel',
  list_open_reviews_for_files: 'review_list_open_for_files',
  add_review_items: 'review_item_add',
  remove_review_items: 'review_item_remove',
  review_workflow_after_settle: 'review_apply_workflow_after_settle',
  advance_reviewed_files: 'review_advance_files',
  get_review_workflow_status: 'review_get_workflow_status',
  update_review_meta: 'review_update_meta',
  list_review_queue: 'review_list_queue',
  get_review_detail: 'review_get_detail',
  get_review_badge_count: 'review_count_badge',
  notify_overdue_reviews: 'review_notify_overdue',
  // supply chain
  generate_rfq_number: 'rfq_generate_number',
  get_best_price: 'part_supplier_get_best_price',
  calculate_bom_cost: 'bom_calculate_cost',
  // integrations
  get_org_integration_status: 'org_integration_get_status',
  get_org_odoo_configs: 'odoo_saved_config_list',
  get_webhooks_for_event: 'webhook_list_for_event',
  get_google_drive_settings: 'org_get_google_drive_settings',
  update_google_drive_settings: 'org_update_google_drive_settings',
  assign_solidworks_license: 'solidworks_license_assign',
  unassign_solidworks_license: 'solidworks_license_unassign',
  activate_solidworks_license: 'solidworks_license_activate',
  deactivate_solidworks_license: 'solidworks_license_deactivate',
  add_pending_license_assignment: 'pending_license_assignment_add',
  remove_pending_license_assignment: 'pending_license_assignment_remove',
  apply_pending_license_assignments: 'pending_license_assignment_apply',
  // extensions
  get_extension_config: 'extension_config_get',
  update_extension_config: 'extension_config_update',
  get_extension_stats: 'extension_get_stats',
  cleanup_extension_http_logs: 'extension_http_log_cleanup',
  cleanup_extension_secret_access_logs: 'extension_secret_access_cleanup',
  // trigger functions: trg_<table>_<what>; a function shared by several tables is trg_<what>
  set_color_swatch_creator: 'trg_color_swatch_set_creator',
  auto_set_user_org_id_func: 'trg_app_user_set_org_id',
  claim_pending_membership: 'trg_app_user_claim_pending_membership',
  handle_new_user: 'trg_auth_user_sync_app_user',
  handle_new_organization: 'trg_organization_create_defaults',
  update_updated_at_column: 'trg_set_updated_at',
  file_comments_integrity: 'trg_file_comment_check_integrity',
  log_file_activity: 'trg_file_log_activity',
  notify_file_watchers: 'trg_file_notify_watchers',
  sync_file_eco_tags: 'trg_file_eco_sync_tags',
  sync_eco_tags_on_eco_update: 'trg_eco_sync_file_tags',
  review_withdraw_lost_reviewers_trigger: 'trg_review_withdraw_lost_reviewers',
  review_items_deleted_resettle: 'trg_review_item_resettle_on_delete',
  file_comments_review_link: 'trg_file_comment_link_review',
  update_org_address_timestamp: 'trg_org_address_set_updated_at',
  ensure_single_default_address: 'trg_org_address_ensure_single_default',
  update_integration_credentials_timestamp: 'trg_integration_credential_set_updated_at',
}

// Triggers: trg_<table>_<what>, keyed `<old table>.<old trigger>`.
export const TRIGGERS = {
  'color_swatches.set_color_swatch_creator': 'trg_color_swatch_set_creator',
  'users.auto_set_user_org_id': 'trg_app_user_set_org_id',
  'users.claim_pending_membership_trigger': 'trg_app_user_claim_pending_membership',
  'auth.users.on_auth_user_created': 'trg_auth_user_sync_app_user',
  'organizations.on_organization_created': 'trg_organization_create_defaults',
  'file_comments.trg_file_comments_integrity': 'trg_file_comment_check_integrity',
  'files.log_file_changes': 'trg_file_log_activity',
  'files.notify_watchers_on_file_change': 'trg_file_notify_watchers',
  'file_ecos.trigger_sync_eco_tags_insert': 'trg_file_eco_sync_tags_insert',
  'file_ecos.trigger_sync_eco_tags_delete': 'trg_file_eco_sync_tags_delete',
  'ecos.trigger_sync_eco_tags_on_eco_update': 'trg_eco_sync_file_tags',
  'users.review_withdraw_on_user_change': 'trg_app_user_withdraw_lost_reviewers',
  'team_members.review_withdraw_on_team_members': 'trg_team_member_withdraw_lost_reviewers',
  'vault_access.review_withdraw_on_vault_access': 'trg_vault_access_withdraw_lost_reviewers',
  'team_vault_access.review_withdraw_on_team_vault_access': 'trg_team_vault_access_withdraw_lost_reviewers',
  'review_items.review_items_deleted_resettle': 'trg_review_item_resettle_on_delete',
  'file_comments.trg_file_comments_review_link': 'trg_file_comment_link_review',
  'organization_addresses.org_address_updated': 'trg_org_address_set_updated_at',
  'organization_addresses.ensure_single_default': 'trg_org_address_ensure_single_default',
  'webhooks.webhooks_updated_at': 'trg_webhook_set_updated_at',
  'solidworks_licenses.solidworks_licenses_updated_at': 'trg_solidworks_license_set_updated_at',
  'integration_credentials.integration_credentials_updated': 'trg_integration_credential_set_updated_at',
  'extension_storage.extension_storage_updated_at': 'trg_extension_storage_set_updated_at',
  'extension_secrets.extension_secrets_updated_at': 'trg_extension_secret_set_updated_at',
  'org_extension_config.org_extension_config_updated_at': 'trg_org_extension_config_set_updated_at',
}

// Explicitly named constraints that are not derivable from their definition.
export const CONSTRAINTS = {
  'workflow_gate_reviewers.fk_workflow_gate_reviewers_workflow_role': 'workflow_gate_reviewer_workflow_role_id_fkey',
  'ecos.fk_ecos_process_template': 'eco_process_template_id_fkey',
  'review_decisions.review_decisions_comment_required': 'review_decision_comment_check',
  'organization_addresses.no_attn_for_billing': 'org_address_attention_to_check',
  'color_swatches.color_swatches_scope_check': 'color_swatch_scope_check',
  'color_swatches.color_swatches_created_by_fkey': 'color_swatch_created_by_fkey',
  'reviews.reviews_priority_check': 'review_priority_check',
  'reviews.reviews_mode_check': 'review_mode_check',
  'reviews.reviews_current_round_check': 'review_current_round_check',
  'review_responses.review_responses_review_id_round_number_reviewer_id_key': 'review_response_review_id_round_number_reviewer_id_key',
  'review_responses.review_responses_withdrawn_reason_check': 'review_response_withdrawn_reason_check',
  'org_installed_extensions.org_installed_extensions_native_package_check': 'org_installed_extension_native_package_check',
}

// Indexes whose derived name would be an expression or longer than Postgres allows.
export const INDEXES = {
  idx_files_search: 'file_search_idx',
  idx_suppliers_search: 'supplier_search_idx',
  idx_file_version_references_unique: 'file_version_reference_edge_idx',
  idx_extension_secret_versions_lookup: 'extension_secret_version_lookup_idx',
}

// Policies on Supabase-owned tables (storage.objects) keep their names: the plan leaves storage
// untouched and check_release_residue() matches the managed storage policies by name.
const POLICY_ACTION = { SELECT: 'read', INSERT: 'insert', UPDATE: 'update', DELETE: 'delete', ALL: 'manage' }

// ---------------------------------------------------------------------------------------------

const newTable = (t) => TABLES[t] ?? VIEWS[t] ?? t
const PG_MAX = 63

export function buildMap(inv) {
  const problems = []
  const colRename = new Map() // `${table}.${col}` -> new
  for (const [t, from, to] of COLUMNS) colRename.set(`${t}.${from}`, to)
  const newCol = (t, c) => colRename.get(`${t}.${c}`) ?? c

  // tables
  const tables = {}
  for (const [from, to] of Object.entries(TABLES)) {
    const t = inv.tables.get(from)
    if (!t) { problems.push(`table ${from} is in TABLES but not in the SQL`); continue }
    tables[from] = { to, file: t.file, realtime: t.published }
  }
  const views = {}
  for (const [from, to] of Object.entries(VIEWS)) {
    const v = inv.views.get(from)
    if (!v) { problems.push(`view ${from} is in VIEWS but not in the SQL`); continue }
    views[from] = { to, file: v.file }
  }

  // columns, with the scope a codemod may use: `global` when every table that has a column of
  // that name renames it the same way, so the bare name can be rewritten anywhere it is an identifier.
  const columns = []
  const byName = new Map()
  for (const t of inv.tables.values()) for (const c of t.columns.values()) {
    if (!byName.has(c.name)) byName.set(c.name, [])
    byName.get(c.name).push(t.name)
  }
  for (const [table, from, to, reason] of COLUMNS) {
    const t = inv.tables.get(table)
    const c = t?.columns.get(from)
    if (!c) { problems.push(`column ${table}.${from} is in COLUMNS but not in the SQL`); continue }
    if (t.columns.has(to)) problems.push(`column ${table}.${to} already exists`)
    const holders = byName.get(from) ?? []
    // ...and only for a distinctive name: one word (read, enabled, timestamp) is also a keyword,
    // variable or JSON key somewhere, so it is rewritten only where the table is known.
    const global = holders.every((h) => colRename.get(`${h}.${from}`) === to) && from.includes('_')
    const keptBy = holders.filter((h) => colRename.get(`${h}.${from}`) !== to)
    columns.push({ table, column: from, to, newTable: newTable(table), type: c.type, reason, scope: global ? 'global' : 'table', ...(keptBy.length ? { keptBy } : {}), file: c.file })
  }

  // functions
  const functions = {}
  for (const f of inv.functions.values()) {
    const to = FUNCTIONS[f.name]
    if (!to) continue
    functions[f.signature] = { name: f.name, to, args: f.args, returns: f.returns, file: f.file }
  }
  for (const name of Object.keys(FUNCTIONS)) {
    if (![...inv.functions.values()].some((f) => f.name === name)) problems.push(`function ${name} is in FUNCTIONS but not in the SQL`)
  }

  // triggers
  const triggers = []
  for (const tr of inv.triggers.values()) {
    const key = `${tr.table}.${tr.name}`
    const to = TRIGGERS[key]
    if (!to) { problems.push(`trigger ${key} has no decision`); continue }
    triggers.push({ table: tr.table, name: tr.name, to, newTable: tr.table.includes('.') ? tr.table : newTable(tr.table), function: tr.fn, file: tr.file })
  }

  // policies: "<table>: <who> <action>[ own]"
  const policies = []
  const taken = new Map()
  for (const p of inv.policies.values()) {
    if (p.table.includes('.')) continue
    const nt = newTable(p.table)
    const m = p.name.match(/^(.*?)\s+(?:can|manage)\b/i)
    let who = (m ? m[1] : p.name.split(' ')[0]).toLowerCase()
    if (/^anyone$/.test(who)) who = 'anyone'
    const own = /\b(own|their)\b(?!\s+org)/i.test(p.name) ? ' own' : ''
    let to = `${nt}: ${who} ${POLICY_ACTION[p.cmd]}${own}`
    const k = `${nt}|${to}`
    if (taken.has(k)) {
      const verb = (p.name.match(/\bcan\s+(\w+)/i) || [, 'alt'])[1].toLowerCase()
      to = `${to} (${verb})`
    }
    taken.set(`${nt}|${to}`, p.name)
    if (to.length > PG_MAX) problems.push(`policy name too long: ${to}`)
    if (to !== p.name) policies.push({ table: p.table, name: p.name, to, newTable: nt, command: p.cmd, file: p.file })
  }
  const dupPolicyNames = new Map()
  for (const p of inv.policies.values()) dupPolicyNames.set(p.name, (dupPolicyNames.get(p.name) ?? 0) + 1)
  for (const p of policies) if (dupPolicyNames.get(p.name) > 1) p.nameSharedWithOtherTables = true

  // indexes: <table>_<cols>_idx
  const indexes = {}
  const idxTaken = new Set()
  for (const i of inv.indexes.values()) {
    const nt = newTable(i.table)
    const paren = i.def.indexOf('(')
    let depth = 0, end = paren
    for (let k = paren; k < i.def.length; k++) { if (i.def[k] === '(') depth++; else if (i.def[k] === ')') { depth--; if (!depth) { end = k; break } } }
    const cols = i.def.slice(paren + 1, end)
    const idents = [...cols.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map((x) => x[0].toLowerCase())
      .filter((w) => !/^(lower|upper|coalesce|desc|asc|nulls|first|last|gin_trgm_ops|text_pattern_ops|jsonb_path_ops|collate|c|date_trunc|immutable_unaccent|md5)$/.test(w))
    const colPart = [...new Set(idents.map((c) => newCol(i.table, c)))].join('_')
    let to = INDEXES[i.name] ?? `${nt}_${colPart}_idx`
    if (!INDEXES[i.name] && idxTaken.has(to) || inv.indexes.has(to)) {
      const where = i.def.match(/\bWHERE\b(.*)$/i)
      const q = where ? [...where[1].matchAll(/[a-z_][a-z0-9_]*/g)].map((x) => x[0]).filter((w) => !/^(is|not|null|and|or|true|false)$/.test(w))[0] : null
      to = `${nt}_${colPart}_${q ? newCol(i.table, q) : 'alt'}_idx`
    }
    if (to.length > PG_MAX) problems.push(`index name too long: ${to} (${i.name})`)
    idxTaken.add(to)
    if (to !== i.name) indexes[i.name] = { to, table: i.table, newTable: nt, unique: i.unique, file: i.file }
  }

  // explicit constraints
  const constraints = {}
  for (const c of inv.constraints.values()) {
    const to = CONSTRAINTS[`${c.table}.${c.name}`]
    if (!to) { problems.push(`constraint ${c.table}.${c.name} has no decision`); continue }
    if (to !== c.name) constraints[c.name] = { to, table: c.table, newTable: newTable(c.table), file: c.file, explicit: true }
  }

  // derived (default-named) constraints. ALTER TABLE ... RENAME keeps them, so 0500 must rename
  // them; client code names foreign keys in `!<fkey>` embed hints.
  const derivedConstraints = {}
  for (const t of inv.tables.values()) {
    const nt = newTable(t.name)
    const add = (oldName, newName, kind) => {
      if (oldName === newName || constraints[oldName] || derivedConstraints[oldName]) return
      if (oldName.length > PG_MAX) return
      derivedConstraints[oldName] = { to: newName, table: t.name, newTable: nt, kind }
    }
    add(`${t.name}_pkey`, `${nt}_pkey`, 'pkey')
    for (const c of t.columns.values()) {
      const nc = newCol(t.name, c.name)
      if (c.references) add(`${t.name}_${c.name}_fkey`, `${nt}_${nc}_fkey`, 'fkey')
      if (c.unique && !c.primaryKey) add(`${t.name}_${c.name}_key`, `${nt}_${nc}_key`, 'key')
      if (c.check) add(`${t.name}_${c.name}_check`, `${nt}_${nc}_check`, 'check')
    }
    for (const tc of t.tableConstraints) {
      if (tc.name) continue
      const m = tc.def.match(/^(UNIQUE|FOREIGN\s+KEY)\s*(?:NULLS\s+NOT\s+DISTINCT\s*)?\(([^)]*)\)/i)
      if (!m) continue
      const cols = m[2].split(',').map((s) => s.trim().replace(/"/g, '').toLowerCase())
      const suffix = /^UNIQUE/i.test(m[1]) ? 'key' : 'fkey'
      add(`${t.name}_${cols.join('_')}_${suffix}`, `${nt}_${cols.map((c) => newCol(t.name, c)).join('_')}_${suffix}`, suffix)
    }
  }

  // one old identifier must never mean two new names across kinds (the SQL codemod is token based)
  const ident = new Map()
  const claim = (from, to, kind) => {
    const prev = ident.get(from)
    if (prev && prev.to !== to) problems.push(`identifier ${from} maps to ${prev.to} (${prev.kind}) and ${to} (${kind})`)
    else ident.set(from, { to, kind })
  }
  for (const [f, v] of Object.entries(tables)) claim(f, v.to, 'table')
  for (const [f, v] of Object.entries(views)) claim(f, v.to, 'view')
  for (const v of Object.values(functions)) claim(v.name, v.to, 'function')
  for (const v of triggers) claim(v.name, v.to, 'trigger')
  for (const [f, v] of Object.entries(indexes)) claim(f, v.to, 'index')
  for (const [f, v] of Object.entries(constraints)) claim(f, v.to, 'constraint')
  for (const c of columns.filter((c) => c.scope === 'global')) claim(c.column, c.to, 'column')

  // new names must not already exist as something else
  const existing = new Set([...inv.tables.keys(), ...inv.views.keys(), ...[...inv.functions.values()].map((f) => f.name), ...inv.types.keys()])
  const newNames = new Set([...Object.values(tables).map((v) => v.to), ...Object.values(views).map((v) => v.to)])
  for (const n of newNames) if (existing.has(n) && !TABLES[n] && !VIEWS[n]) problems.push(`new relation name ${n} already exists in the SQL`)
  for (const v of Object.values(functions)) if (existing.has(v.to) && !FUNCTIONS[v.to]) problems.push(`new function name ${v.to} already exists`)
  for (const n of newNames) if (inv.types.has(n)) problems.push(`new relation name ${n} collides with type ${n} (every table defines a row type)`)

  const realtimeOld = inv.publication
  return {
    map: {
      $comment: 'BluePLM 5.0 rename map. Generated by scripts/rename-5.0/build-map.mjs from the SQL and the decisions in that script; naming rules in .cursor/rules/database.mdc. Lists only objects whose name changes.',
      version: 500,
      sources: Object.fromEntries(['supabase/core.sql', ...new Set([...inv.tables.values()].map((t) => t.file))].map((f) => [f, true])),
      tables,
      views,
      columns,
      functions,
      triggers,
      policies,
      indexes,
      constraints,
      derivedConstraints,
      types: {},
      sequences: {},
      realtimePublication: { old: realtimeOld, new: realtimeOld.map(newTable).sort() },
      unchanged: {
        tables: [...inv.tables.keys()].filter((t) => !TABLES[t]).sort(),
        types: [...inv.types.keys()].sort(),
        storagePolicies: [...inv.policies.values()].filter((p) => p.table.includes('.')).map((p) => `${p.table}: ${p.name}`),
      },
      notes: [
        'Postgres keeps constraint and index names on ALTER TABLE ... RENAME. derivedConstraints lists the default names the 4.x schema produced (pkey, fkey, key, check); 0500 should rename by catalog (pg_constraint.conrelid) rather than trust this list, since a duplicate gets a numbered suffix and long names are truncated.',
        'columns[].scope = global: every table holding a column of that name renames it identically, so the bare identifier is safe to rewrite. scope = table: the old name is shared with tables that keep it; rewrite only where the table is known.',
        'Old JSON keys built in SQL (jsonb_build_object(\'files\', ...)) and RPC output column names are not renamed by the map: they are API shapes, not schema objects.',
        'New names that equal existing column names: table file_version vs the integer columns review.file_version, file_share_link.file_version, file_comment.file_version; table review_round vs file_comment.review_round. Postgres allows it; a PostgREST select must embed with parentheses to mean the table.',
      ],
    },
    problems,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inv = inventory(readSchema(ROOT))
  const { map, problems } = buildMap(inv)
  const text = JSON.stringify(map, null, 2) + '\n'
  for (const p of problems) console.error('problem:', p)
  if (process.argv.includes('--check')) {
    let current = ''
    try { current = readFileSync(OUT, 'utf8') } catch { /* missing */ }
    if (current !== text) { console.error('supabase/rename-map-5.0.json is out of date; run node scripts/rename-5.0/build-map.mjs'); process.exit(1) }
    process.exit(problems.length ? 1 : 0)
  }
  writeFileSync(OUT, text)
  const count = (o) => (Array.isArray(o) ? o.length : Object.keys(o).length)
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${['tables', 'views', 'columns', 'functions', 'triggers', 'policies', 'indexes', 'constraints', 'derivedConstraints'].map((k) => `${k} ${count(map[k])}`).join(', ')}; realtime ${map.realtimePublication.old.length}`)
  if (problems.length) process.exit(1)
}
