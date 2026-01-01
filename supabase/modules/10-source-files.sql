-- =====================================================================
-- BluePLM Source Files Module
-- =====================================================================
-- 
-- This module contains:
--   - Vaults (file storage containers)
--   - Files and file versions
--   - File references (BOM/assembly relationships)
--   - Activity logging
--   - Workflow system (templates, states, transitions, gates)
--   - Backup system
--   - File watchers, share links, comments
--   - Custom metadata columns
--
-- DEPENDENCIES: core.sql must be installed first
--
-- IDEMPOTENT: Safe to run multiple times
--
-- =====================================================================

-- ===========================================
-- SOURCE FILES ENUMS
-- ===========================================

DO $$ BEGIN
  CREATE TYPE file_type AS ENUM (
    'part', 'assembly', 'drawing', 'pdf', 'step', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reference_type AS ENUM (
    'component', 'derived', 'reference'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_action AS ENUM (
    'create', 'update', 'checkout', 'checkin', 'state_change', 
    'revision_change', 'delete', 'restore', 'move', 'rename'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE release_file_type AS ENUM (
    'step', 'pdf', 'dxf', 'iges', 'stl', 'dwg', 'dxf_flat'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE metadata_column_type AS ENUM (
    'text', 'number', 'date', 'boolean', 'select'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================
-- WORKFLOW ENUMS
-- ===========================================

DO $$ BEGIN
  CREATE TYPE state_type AS ENUM ('state', 'gate');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE state_shape AS ENUM (
    'rectangle', 'diamond', 'hexagon', 'ellipse'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transition_line_style AS ENUM (
    'solid', 'dashed', 'dotted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transition_path_type AS ENUM (
    'straight', 'spline', 'elbow'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transition_arrow_head AS ENUM (
    'none', 'end', 'start', 'both'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gate_type AS ENUM (
    'approval', 'checklist', 'condition'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_mode AS ENUM (
    'any', 'all', 'majority'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reviewer_type AS ENUM (
    'user', 'role', 'group', 'workflow_role'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM (
    'pending', 'approved', 'rejected', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Advanced workflow enums
DO $$ BEGIN
  CREATE TYPE state_permission_type AS ENUM (
    'read_file', 'write_file', 'delete_file', 'add_file',
    'rename_file', 'change_state', 'edit_metadata'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE condition_type AS ENUM (
    'file_path', 'file_extension', 'variable', 'revision',
    'category', 'checkout_status', 'user_role', 'workflow_role',
    'file_owner', 'custom_sql'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE action_type AS ENUM (
    'increment_revision', 'set_variable', 'clear_variable',
    'send_notification', 'execute_task', 'set_file_permission',
    'copy_file', 'run_script'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE revision_scheme_type AS ENUM (
    'numeric', 'alpha_upper', 'alpha_lower', 'alphanumeric', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE auto_trigger_type AS ENUM (
    'timer', 'condition_met', 'all_approvals', 'schedule'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE workflow_task_type AS ENUM (
    'convert_pdf', 'convert_step', 'convert_iges', 'convert_edrawings',
    'convert_dxf', 'custom_export', 'run_script', 'webhook'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_recipient_type AS ENUM (
    'user', 'role', 'workflow_role', 'file_owner', 'file_creator',
    'checkout_user', 'previous_state_user', 'all_org'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================
-- VAULTS
-- ===========================================

CREATE TABLE IF NOT EXISTS vaults (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  local_path TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'folder',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  UNIQUE(org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_vaults_org_id ON vaults(org_id);

-- ===========================================
-- VAULT ACCESS (Per-user permissions)
-- ===========================================

CREATE TABLE IF NOT EXISTS vault_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(vault_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vault_access_vault_id ON vault_access(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_access_user_id ON vault_access(user_id);

-- Team vault access (references teams from core)
CREATE TABLE IF NOT EXISTS team_vault_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  
  UNIQUE(team_id, vault_id)
);

CREATE INDEX IF NOT EXISTS idx_team_vault_access_team_id ON team_vault_access(team_id);
CREATE INDEX IF NOT EXISTS idx_team_vault_access_vault_id ON team_vault_access(vault_id);

-- ===========================================
-- WORKFLOW TEMPLATES (must come before files)
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  canvas_config JSONB DEFAULT '{"zoom": 1, "panX": 0, "panY": 0}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_org_id ON workflow_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_is_default ON workflow_templates(is_default);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_is_active ON workflow_templates(is_active);

-- ===========================================
-- WORKFLOW STATES
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  state_type state_type DEFAULT 'state',
  shape state_shape DEFAULT 'rectangle',
  name TEXT NOT NULL,
  label TEXT,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  fill_opacity DECIMAL(3,2) DEFAULT 1.0,
  border_color TEXT,
  border_opacity DECIMAL(3,2) DEFAULT 1.0,
  border_thickness INTEGER DEFAULT 2,
  corner_radius INTEGER DEFAULT 8,
  icon TEXT DEFAULT 'circle',
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  is_editable BOOLEAN DEFAULT true,
  requires_checkout BOOLEAN DEFAULT true,
  auto_increment_revision BOOLEAN DEFAULT false,
  gate_config JSONB DEFAULT '{}'::jsonb,
  required_workflow_roles UUID[] DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_states_workflow_id ON workflow_states(workflow_id);

-- ===========================================
-- FILES
-- ===========================================

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
  
  -- File identity
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  file_type file_type DEFAULT 'other',
  
  -- Engineering metadata
  part_number TEXT,
  description TEXT,
  revision TEXT DEFAULT 'A',
  version INTEGER DEFAULT 1,
  
  -- Content reference
  content_hash TEXT,
  file_size BIGINT DEFAULT 0,
  
  -- Workflow state
  workflow_state_id UUID REFERENCES workflow_states(id),
  state TEXT DEFAULT 'WIP', -- Legacy field for backwards compatibility
  state_changed_at TIMESTAMPTZ DEFAULT NOW(),
  state_changed_by UUID REFERENCES users(id),
  
  -- Checkout lock
  checked_out_by UUID REFERENCES users(id),
  checked_out_at TIMESTAMPTZ,
  lock_message TEXT,
  checked_out_by_machine_id TEXT,
  checked_out_by_machine_name TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  -- Custom properties
  custom_properties JSONB DEFAULT '{}'::jsonb,
  
  -- ECO tags (denormalized)
  eco_tags TEXT[] DEFAULT '{}',
  
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id)
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_vault_path_unique_active 
  ON files(vault_id, file_path) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_org_id ON files(org_id);
CREATE INDEX IF NOT EXISTS idx_files_vault_id ON files(vault_id);
CREATE INDEX IF NOT EXISTS idx_files_file_path ON files(file_path);
CREATE INDEX IF NOT EXISTS idx_files_part_number ON files(part_number) WHERE part_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_state ON files(state);
CREATE INDEX IF NOT EXISTS idx_files_checked_out_by ON files(checked_out_by) WHERE checked_out_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_active ON files(vault_id, file_path) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_eco_tags ON files USING GIN (eco_tags);

-- Full text search
DO $$ BEGIN
  CREATE INDEX idx_files_search ON files USING GIN (
    to_tsvector('simple'::regconfig, 
      coalesce(file_name, '') || ' ' || 
      coalesce(part_number, '') || ' ' || 
      coalesce(description, '') || ' ' ||
      coalesce(array_to_string(eco_tags, ' '), '')
    )
  );
EXCEPTION WHEN OTHERS THEN 
  RAISE NOTICE 'Could not create idx_files_search: %', SQLERRM;
END $$;

-- ===========================================
-- FILE VERSIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS file_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  revision TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  workflow_state_id UUID REFERENCES workflow_states(id),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  
  UNIQUE(file_id, version)
);

CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON file_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_content_hash ON file_versions(content_hash);

-- ===========================================
-- RELEASE FILES
-- ===========================================

CREATE TABLE IF NOT EXISTS release_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  file_version_id UUID REFERENCES file_versions(id) ON DELETE SET NULL,
  version INTEGER NOT NULL,
  revision TEXT,
  file_type release_file_type NOT NULL,
  file_name TEXT NOT NULL,
  local_path TEXT,
  storage_path TEXT,
  storage_hash TEXT,
  file_size BIGINT DEFAULT 0,
  generated_by UUID REFERENCES users(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  rfq_id UUID,
  rfq_item_id UUID,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_release_files_file_id ON release_files(file_id);
CREATE INDEX IF NOT EXISTS idx_release_files_file_version ON release_files(file_version_id);
CREATE INDEX IF NOT EXISTS idx_release_files_org ON release_files(org_id);
CREATE INDEX IF NOT EXISTS idx_release_files_file_version_type ON release_files(file_id, version, file_type);

-- ===========================================
-- FILE REFERENCES (BOM/Assembly)
-- ===========================================

CREATE TABLE IF NOT EXISTS file_references (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  child_file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  reference_type reference_type DEFAULT 'component',
  quantity INTEGER DEFAULT 1,
  configuration TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(parent_file_id, child_file_id, configuration)
);

CREATE INDEX IF NOT EXISTS idx_file_references_parent ON file_references(parent_file_id);
CREATE INDEX IF NOT EXISTS idx_file_references_child ON file_references(child_file_id);

-- ===========================================
-- ACTIVITY LOG
-- ===========================================

CREATE TABLE IF NOT EXISTS activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  user_email TEXT NOT NULL,
  action activity_action NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_org_id ON activity(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_file_id ON activity(file_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_id ON activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity(action);

-- ===========================================
-- WORKFLOW TRANSITIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_transitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  from_state_id UUID NOT NULL REFERENCES workflow_states(id) ON DELETE CASCADE,
  to_state_id UUID NOT NULL REFERENCES workflow_states(id) ON DELETE CASCADE,
  name TEXT,
  description TEXT,
  line_style transition_line_style DEFAULT 'solid',
  line_color TEXT,
  line_path_type transition_path_type DEFAULT 'spline',
  line_arrow_head transition_arrow_head DEFAULT 'end',
  line_thickness INTEGER DEFAULT 2,
  allowed_workflow_roles UUID[] DEFAULT '{}',
  auto_conditions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(from_state_id, to_state_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_transitions_workflow_id ON workflow_transitions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_from_state ON workflow_transitions(from_state_id);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_to_state ON workflow_transitions(to_state_id);

-- ===========================================
-- WORKFLOW GATES
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_gates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transition_id UUID NOT NULL REFERENCES workflow_transitions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  gate_type gate_type DEFAULT 'approval',
  required_approvals INTEGER DEFAULT 1,
  approval_mode approval_mode DEFAULT 'any',
  checklist_items JSONB DEFAULT '[]'::jsonb,
  conditions JSONB,
  is_blocking BOOLEAN DEFAULT true,
  can_be_skipped_by user_role[] DEFAULT '{}'::user_role[],
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_gates_transition_id ON workflow_gates(transition_id);

-- ===========================================
-- WORKFLOW GATE REVIEWERS
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_gate_reviewers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gate_id UUID NOT NULL REFERENCES workflow_gates(id) ON DELETE CASCADE,
  reviewer_type reviewer_type NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role user_role,
  group_name TEXT,
  workflow_role_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_gate_reviewers_gate_id ON workflow_gate_reviewers(gate_id);
CREATE INDEX IF NOT EXISTS idx_workflow_gate_reviewers_user_id ON workflow_gate_reviewers(user_id);

-- ===========================================
-- WORKFLOW ROLES
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  icon TEXT DEFAULT 'badge-check',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_workflow_roles_org_id ON workflow_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_roles_name ON workflow_roles(org_id, name);

-- User workflow role assignments
CREATE TABLE IF NOT EXISTS user_workflow_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_role_id UUID NOT NULL REFERENCES workflow_roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  UNIQUE(user_id, workflow_role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_workflow_roles_user_id ON user_workflow_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_workflow_roles_role_id ON user_workflow_roles(workflow_role_id);

-- Add workflow_role_id FK to gate_reviewers after workflow_roles exists
DO $$ BEGIN
  ALTER TABLE workflow_gate_reviewers 
    ADD CONSTRAINT fk_workflow_gate_reviewers_workflow_role 
    FOREIGN KEY (workflow_role_id) REFERENCES workflow_roles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================
-- FILE WORKFLOW ASSIGNMENTS
-- ===========================================

CREATE TABLE IF NOT EXISTS file_workflow_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE UNIQUE,
  workflow_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  current_state_id UUID REFERENCES workflow_states(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_file_workflow_assignments_file_id ON file_workflow_assignments(file_id);
CREATE INDEX IF NOT EXISTS idx_file_workflow_assignments_workflow_id ON file_workflow_assignments(workflow_id);
CREATE INDEX IF NOT EXISTS idx_file_workflow_assignments_current_state ON file_workflow_assignments(current_state_id);

-- ===========================================
-- PENDING REVIEWS
-- ===========================================

CREATE TABLE IF NOT EXISTS pending_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  transition_id UUID NOT NULL REFERENCES workflow_transitions(id) ON DELETE CASCADE,
  gate_id UUID NOT NULL REFERENCES workflow_gates(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  status review_status DEFAULT 'pending',
  assigned_to UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  checklist_responses JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_reviews_org_id ON pending_reviews(org_id);
CREATE INDEX IF NOT EXISTS idx_pending_reviews_file_id ON pending_reviews(file_id);
CREATE INDEX IF NOT EXISTS idx_pending_reviews_status ON pending_reviews(status);
CREATE INDEX IF NOT EXISTS idx_pending_reviews_assigned_to ON pending_reviews(assigned_to);

-- ===========================================
-- WORKFLOW REVIEW HISTORY
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_review_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  workflow_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
  workflow_name TEXT NOT NULL,
  transition_id UUID REFERENCES workflow_transitions(id) ON DELETE SET NULL,
  from_state_name TEXT NOT NULL,
  to_state_name TEXT NOT NULL,
  gate_id UUID REFERENCES workflow_gates(id) ON DELETE SET NULL,
  gate_name TEXT NOT NULL,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_by_email TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_email TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL,
  decision TEXT NOT NULL,
  comment TEXT,
  checklist_responses JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_review_history_org_id ON workflow_review_history(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_review_history_file_id ON workflow_review_history(file_id);
CREATE INDEX IF NOT EXISTS idx_workflow_review_history_created_at ON workflow_review_history(created_at DESC);

-- ===========================================
-- ADVANCED WORKFLOW: REVISION SCHEMES
-- ===========================================

CREATE TABLE IF NOT EXISTS revision_schemes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  scheme_type revision_scheme_type NOT NULL DEFAULT 'numeric',
  start_value INTEGER DEFAULT 1,
  increment_by INTEGER DEFAULT 1,
  major_minor_separator TEXT DEFAULT '.',
  minor_scheme_type revision_scheme_type DEFAULT 'numeric',
  custom_pattern TEXT,
  prefix TEXT DEFAULT '',
  suffix TEXT DEFAULT '',
  zero_padding INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revision_schemes_org_id ON revision_schemes(org_id);
CREATE INDEX IF NOT EXISTS idx_revision_schemes_is_default ON revision_schemes(is_default);

-- ===========================================
-- ADVANCED WORKFLOW: STATE PERMISSIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_state_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state_id UUID NOT NULL REFERENCES workflow_states(id) ON DELETE CASCADE,
  permission_for TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role user_role,
  workflow_role_id UUID REFERENCES workflow_roles(id) ON DELETE CASCADE,
  can_read BOOLEAN DEFAULT true,
  can_write BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_add BOOLEAN DEFAULT false,
  can_rename BOOLEAN DEFAULT false,
  can_change_state BOOLEAN DEFAULT false,
  can_edit_metadata BOOLEAN DEFAULT false,
  comment_required_on_change BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(state_id, permission_for, user_id, role, workflow_role_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_state_permissions_state_id ON workflow_state_permissions(state_id);
CREATE INDEX IF NOT EXISTS idx_workflow_state_permissions_user_id ON workflow_state_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_state_permissions_role ON workflow_state_permissions(role);
CREATE INDEX IF NOT EXISTS idx_workflow_state_permissions_workflow_role_id ON workflow_state_permissions(workflow_role_id);

-- ===========================================
-- ADVANCED WORKFLOW: TRANSITION CONDITIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_transition_conditions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transition_id UUID NOT NULL REFERENCES workflow_transitions(id) ON DELETE CASCADE,
  condition_type condition_type NOT NULL,
  operator TEXT NOT NULL DEFAULT 'equals',
  value TEXT,
  value_list TEXT[],
  custom_sql TEXT,
  is_required BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_transition_conditions_transition_id ON workflow_transition_conditions(transition_id);

-- ===========================================
-- ADVANCED WORKFLOW: TRANSITION ACTIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_transition_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transition_id UUID NOT NULL REFERENCES workflow_transitions(id) ON DELETE CASCADE,
  action_type action_type NOT NULL,
  execute_on TEXT DEFAULT 'success',
  config JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_transition_actions_transition_id ON workflow_transition_actions(transition_id);

-- ===========================================
-- ADVANCED WORKFLOW: TRANSITION NOTIFICATIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_transition_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transition_id UUID NOT NULL REFERENCES workflow_transitions(id) ON DELETE CASCADE,
  recipient_type notification_recipient_type NOT NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_role user_role,
  recipient_workflow_role_id UUID REFERENCES workflow_roles(id) ON DELETE CASCADE,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  send_email BOOLEAN DEFAULT true,
  send_in_app BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_transition_notifications_transition_id ON workflow_transition_notifications(transition_id);

-- ===========================================
-- ADVANCED WORKFLOW: TRANSITION APPROVALS
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_transition_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transition_id UUID NOT NULL REFERENCES workflow_transitions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  required_approvals INTEGER DEFAULT 1,
  approval_mode approval_mode DEFAULT 'any',
  allow_self_approval BOOLEAN DEFAULT false,
  require_comment BOOLEAN DEFAULT false,
  timeout_hours INTEGER,
  escalation_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_transition_approvals_transition_id ON workflow_transition_approvals(transition_id);

-- ===========================================
-- ADVANCED WORKFLOW: APPROVAL REVIEWERS
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_approval_reviewers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_id UUID NOT NULL REFERENCES workflow_transition_approvals(id) ON DELETE CASCADE,
  reviewer_type notification_recipient_type NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role user_role,
  workflow_role_id UUID REFERENCES workflow_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_approval_reviewers_approval_id ON workflow_approval_reviewers(approval_id);

-- ===========================================
-- ADVANCED WORKFLOW: AUTO TRANSITIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_auto_transitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transition_id UUID NOT NULL REFERENCES workflow_transitions(id) ON DELETE CASCADE,
  trigger_type auto_trigger_type NOT NULL,
  timer_hours INTEGER,
  schedule_cron TEXT,
  schedule_timezone TEXT DEFAULT 'UTC',
  condition_expression JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_auto_transitions_transition_id ON workflow_auto_transitions(transition_id);

-- ===========================================
-- ADVANCED WORKFLOW: TASKS
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  task_type workflow_task_type NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_org_id ON workflow_tasks(org_id);

-- ===========================================
-- PENDING TRANSITION APPROVALS
-- ===========================================

CREATE TABLE IF NOT EXISTS pending_transition_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  transition_id UUID NOT NULL REFERENCES workflow_transitions(id) ON DELETE CASCADE,
  approval_id UUID NOT NULL REFERENCES workflow_transition_approvals(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  status review_status DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_transition_approvals_org_id ON pending_transition_approvals(org_id);
CREATE INDEX IF NOT EXISTS idx_pending_transition_approvals_file_id ON pending_transition_approvals(file_id);
CREATE INDEX IF NOT EXISTS idx_pending_transition_approvals_status ON pending_transition_approvals(status);

-- ===========================================
-- WORKFLOW HISTORY
-- ===========================================

CREATE TABLE IF NOT EXISTS workflow_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  workflow_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
  workflow_name TEXT NOT NULL,
  from_state_id UUID REFERENCES workflow_states(id) ON DELETE SET NULL,
  from_state_name TEXT NOT NULL,
  to_state_id UUID REFERENCES workflow_states(id) ON DELETE SET NULL,
  to_state_name TEXT NOT NULL,
  transition_id UUID REFERENCES workflow_transitions(id) ON DELETE SET NULL,
  transition_name TEXT,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_by_email TEXT NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comment TEXT,
  revision_before TEXT,
  revision_after TEXT,
  approvals_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_history_org_id ON workflow_history(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_history_file_id ON workflow_history(file_id);
CREATE INDEX IF NOT EXISTS idx_workflow_history_performed_at ON workflow_history(performed_at DESC);

-- ===========================================
-- FILE STATE ENTRIES (Per-state file list)
-- ===========================================

CREATE TABLE IF NOT EXISTS file_state_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  state_id UUID NOT NULL REFERENCES workflow_states(id) ON DELETE CASCADE,
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  entered_by UUID REFERENCES users(id),
  exited_at TIMESTAMPTZ,
  exited_by UUID REFERENCES users(id),
  duration_seconds INTEGER,
  
  UNIQUE(file_id, state_id, entered_at)
);

CREATE INDEX IF NOT EXISTS idx_file_state_entries_file_id ON file_state_entries(file_id);
CREATE INDEX IF NOT EXISTS idx_file_state_entries_state_id ON file_state_entries(state_id);
CREATE INDEX IF NOT EXISTS idx_file_state_entries_active ON file_state_entries(state_id) WHERE exited_at IS NULL;

-- ===========================================
-- FILE WATCHERS
-- ===========================================

CREATE TABLE IF NOT EXISTS file_watchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notify_on_checkin BOOLEAN DEFAULT true,
  notify_on_checkout BOOLEAN DEFAULT false,
  notify_on_state_change BOOLEAN DEFAULT true,
  notify_on_review BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(file_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_file_watchers_file_id ON file_watchers(file_id);
CREATE INDEX IF NOT EXISTS idx_file_watchers_user_id ON file_watchers(user_id);
CREATE INDEX IF NOT EXISTS idx_file_watchers_org_id ON file_watchers(org_id);

-- ===========================================
-- FILE SHARE LINKS
-- ===========================================

CREATE TABLE IF NOT EXISTS file_share_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  max_downloads INTEGER,
  download_count INTEGER DEFAULT 0,
  password_hash TEXT,
  file_version INTEGER,
  allow_download BOOLEAN DEFAULT true,
  require_auth BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_file_share_links_token ON file_share_links(token);
CREATE INDEX IF NOT EXISTS idx_file_share_links_file_id ON file_share_links(file_id);
CREATE INDEX IF NOT EXISTS idx_file_share_links_org_id ON file_share_links(org_id);
CREATE INDEX IF NOT EXISTS idx_file_share_links_created_by ON file_share_links(created_by);
CREATE INDEX IF NOT EXISTS idx_file_share_links_expires_at ON file_share_links(expires_at) WHERE expires_at IS NOT NULL;

-- ===========================================
-- FILE COMMENTS
-- ===========================================

CREATE TABLE IF NOT EXISTS file_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_comments_file_id ON file_comments(file_id);
CREATE INDEX IF NOT EXISTS idx_file_comments_user_id ON file_comments(user_id);

-- ===========================================
-- FILE METADATA COLUMNS (Custom fields)
-- ===========================================

CREATE TABLE IF NOT EXISTS file_metadata_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  data_type metadata_column_type DEFAULT 'text',
  select_options TEXT[] DEFAULT '{}',
  width INTEGER DEFAULT 120,
  visible BOOLEAN DEFAULT true,
  sortable BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  required BOOLEAN DEFAULT false,
  default_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_file_metadata_columns_org_id ON file_metadata_columns(org_id);
CREATE INDEX IF NOT EXISTS idx_file_metadata_columns_sort_order ON file_metadata_columns(org_id, sort_order);

-- ===========================================
-- BACKUP SYSTEM
-- ===========================================

CREATE TABLE IF NOT EXISTS backup_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  provider TEXT NOT NULL DEFAULT 'backblaze_b2',
  bucket TEXT,
  region TEXT,
  access_key_encrypted TEXT,
  secret_key_encrypted TEXT,
  schedule_enabled BOOLEAN DEFAULT false,
  schedule_cron TEXT DEFAULT '0 0 * * *',
  schedule_hour INT DEFAULT 0,
  schedule_minute INT DEFAULT 0,
  schedule_timezone TEXT DEFAULT 'UTC',
  designated_machine_id TEXT,
  designated_machine_name TEXT,
  designated_machine_platform TEXT,
  designated_machine_user_email TEXT,
  designated_machine_last_seen TIMESTAMPTZ,
  backup_requested_at TIMESTAMPTZ,
  backup_requested_by TEXT,
  backup_running_since TIMESTAMPTZ,
  retention_daily INT DEFAULT 14,
  retention_weekly INT DEFAULT 10,
  retention_monthly INT DEFAULT 10,
  retention_yearly INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_backup_config_org_id ON backup_config(org_id);

CREATE TABLE IF NOT EXISTS backup_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  machine_id TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  files_total INT,
  files_added INT,
  files_modified INT,
  bytes_added BIGINT,
  bytes_total BIGINT,
  duration_seconds INT,
  snapshot_id TEXT,
  error_message TEXT,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_history_org_id ON backup_history(org_id);
CREATE INDEX IF NOT EXISTS idx_backup_history_started_at ON backup_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status);

CREATE TABLE IF NOT EXISTS backup_machines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  machine_id TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  user_email TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_designated BOOLEAN DEFAULT false,
  platform TEXT,
  app_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_backup_machines_org_id ON backup_machines(org_id);
CREATE INDEX IF NOT EXISTS idx_backup_machines_last_seen ON backup_machines(last_seen);

CREATE TABLE IF NOT EXISTS backup_locks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  locked_by_machine_id TEXT NOT NULL,
  locked_by_machine_name TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  backup_history_id UUID REFERENCES backup_history(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backup_locks_org_id ON backup_locks(org_id);
CREATE INDEX IF NOT EXISTS idx_backup_locks_expires_at ON backup_locks(expires_at);

-- ===========================================
-- RLS POLICIES
-- ===========================================

ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_vault_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_gate_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_workflow_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_workflow_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_state_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_transition_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_transition_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_transition_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_transition_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_approval_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_auto_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_transition_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_state_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_metadata_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_locks ENABLE ROW LEVEL SECURITY;

-- Vaults
DROP POLICY IF EXISTS "Authenticated users can view vaults" ON vaults;
CREATE POLICY "Authenticated users can view vaults"
  ON vaults FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can create vaults" ON vaults;
CREATE POLICY "Admins can create vaults"
  ON vaults FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can update vaults" ON vaults;
CREATE POLICY "Admins can update vaults"
  ON vaults FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can delete vaults" ON vaults;
CREATE POLICY "Admins can delete vaults"
  ON vaults FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

-- Vault Access
DROP POLICY IF EXISTS "Users can view vault access" ON vault_access;
CREATE POLICY "Users can view vault access"
  ON vault_access FOR SELECT
  USING (vault_id IN (SELECT id FROM vaults WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Admins can manage vault access" ON vault_access;
CREATE POLICY "Admins can manage vault access"
  ON vault_access FOR ALL
  USING (vault_id IN (SELECT id FROM vaults WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())) AND is_org_admin());

-- Team Vault Access
DROP POLICY IF EXISTS "Users can view team vault access" ON team_vault_access;
CREATE POLICY "Users can view team vault access"
  ON team_vault_access FOR SELECT
  USING (team_id IN (SELECT id FROM teams WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Admins can manage team vault access" ON team_vault_access;
CREATE POLICY "Admins can manage team vault access"
  ON team_vault_access FOR ALL
  USING (team_id IN (SELECT id FROM teams WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())) AND is_org_admin());

-- Files
DROP POLICY IF EXISTS "Users can view org files" ON files;
CREATE POLICY "Users can view org files"
  ON files FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Engineers can insert files" ON files;
CREATE POLICY "Engineers can insert files"
  ON files FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND user_has_team_permission('system:files', 'create'));

DROP POLICY IF EXISTS "Engineers can update files" ON files;
CREATE POLICY "Engineers can update files"
  ON files FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND user_has_team_permission('system:files', 'edit'));

DROP POLICY IF EXISTS "Admins can delete files" ON files;
CREATE POLICY "Admins can delete files"
  ON files FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND user_has_team_permission('system:files', 'delete'));

-- File Versions
DROP POLICY IF EXISTS "Users can view file versions" ON file_versions;
CREATE POLICY "Users can view file versions"
  ON file_versions FOR SELECT
  USING (file_id IN (SELECT id FROM files WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Engineers can manage file versions" ON file_versions;
CREATE POLICY "Engineers can manage file versions"
  ON file_versions FOR ALL
  USING (file_id IN (SELECT id FROM files WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())) AND user_has_team_permission('system:files', 'edit'));

-- Release Files
DROP POLICY IF EXISTS "Users can view org release files" ON release_files;
CREATE POLICY "Users can view org release files"
  ON release_files FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Engineers can manage release files" ON release_files;
CREATE POLICY "Engineers can manage release files"
  ON release_files FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND user_has_team_permission('system:files', 'edit'));

-- File References
DROP POLICY IF EXISTS "Users can view file references" ON file_references;
CREATE POLICY "Users can view file references"
  ON file_references FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Engineers can manage references" ON file_references;
CREATE POLICY "Engineers can manage references"
  ON file_references FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND user_has_team_permission('system:files', 'edit'));

-- Activity
DROP POLICY IF EXISTS "Users can view org activity" ON activity;
CREATE POLICY "Users can view org activity"
  ON activity FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can log activity" ON activity;
CREATE POLICY "Users can log activity"
  ON activity FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Workflow Templates
DROP POLICY IF EXISTS "Users can view org workflows" ON workflow_templates;
CREATE POLICY "Users can view org workflows"
  ON workflow_templates FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can create workflows" ON workflow_templates;
CREATE POLICY "Admins can create workflows"
  ON workflow_templates FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can update workflows" ON workflow_templates;
CREATE POLICY "Admins can update workflows"
  ON workflow_templates FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can delete workflows" ON workflow_templates;
CREATE POLICY "Admins can delete workflows"
  ON workflow_templates FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

-- Workflow States
DROP POLICY IF EXISTS "Users can view workflow states" ON workflow_states;
CREATE POLICY "Users can view workflow states"
  ON workflow_states FOR SELECT
  USING (workflow_id IN (SELECT id FROM workflow_templates WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Admins can manage workflow states" ON workflow_states;
CREATE POLICY "Admins can manage workflow states"
  ON workflow_states FOR ALL
  USING (workflow_id IN (SELECT id FROM workflow_templates WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())) AND is_org_admin());

-- Workflow Transitions
DROP POLICY IF EXISTS "Users can view workflow transitions" ON workflow_transitions;
CREATE POLICY "Users can view workflow transitions"
  ON workflow_transitions FOR SELECT
  USING (workflow_id IN (SELECT id FROM workflow_templates WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Admins can manage workflow transitions" ON workflow_transitions;
CREATE POLICY "Admins can manage workflow transitions"
  ON workflow_transitions FOR ALL
  USING (workflow_id IN (SELECT id FROM workflow_templates WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())) AND is_org_admin());

-- Workflow Gates
DROP POLICY IF EXISTS "Users can view workflow gates" ON workflow_gates;
CREATE POLICY "Users can view workflow gates"
  ON workflow_gates FOR SELECT
  USING (transition_id IN (SELECT id FROM workflow_transitions WHERE workflow_id IN (SELECT id FROM workflow_templates WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))));

DROP POLICY IF EXISTS "Admins can manage workflow gates" ON workflow_gates;
CREATE POLICY "Admins can manage workflow gates"
  ON workflow_gates FOR ALL
  USING (transition_id IN (SELECT id FROM workflow_transitions WHERE workflow_id IN (SELECT id FROM workflow_templates WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid()))) AND is_org_admin());

-- Gate Reviewers
DROP POLICY IF EXISTS "Users can view gate reviewers" ON workflow_gate_reviewers;
CREATE POLICY "Users can view gate reviewers"
  ON workflow_gate_reviewers FOR SELECT
  USING (gate_id IN (SELECT id FROM workflow_gates WHERE transition_id IN (SELECT id FROM workflow_transitions WHERE workflow_id IN (SELECT id FROM workflow_templates WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())))));

DROP POLICY IF EXISTS "Admins can manage gate reviewers" ON workflow_gate_reviewers;
CREATE POLICY "Admins can manage gate reviewers"
  ON workflow_gate_reviewers FOR ALL
  USING (gate_id IN (SELECT id FROM workflow_gates WHERE transition_id IN (SELECT id FROM workflow_transitions WHERE workflow_id IN (SELECT id FROM workflow_templates WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())))) AND is_org_admin());

-- Workflow Roles
DROP POLICY IF EXISTS "Users can view org workflow roles" ON workflow_roles;
CREATE POLICY "Users can view org workflow roles"
  ON workflow_roles FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage workflow roles" ON workflow_roles;
CREATE POLICY "Admins can manage workflow roles"
  ON workflow_roles FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

-- User Workflow Roles
DROP POLICY IF EXISTS "Users can view workflow role assignments in their org" ON user_workflow_roles;
CREATE POLICY "Users can view workflow role assignments in their org"
  ON user_workflow_roles FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Admins can manage workflow role assignments" ON user_workflow_roles;
CREATE POLICY "Admins can manage workflow role assignments"
  ON user_workflow_roles FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())) AND is_org_admin());

-- File Workflow Assignments
DROP POLICY IF EXISTS "Users can view file workflow assignments" ON file_workflow_assignments;
CREATE POLICY "Users can view file workflow assignments"
  ON file_workflow_assignments FOR SELECT
  USING (file_id IN (SELECT id FROM files WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Engineers can manage file workflow assignments" ON file_workflow_assignments;
CREATE POLICY "Engineers can manage file workflow assignments"
  ON file_workflow_assignments FOR ALL
  USING (file_id IN (SELECT id FROM files WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())) AND user_has_team_permission('module:workflows', 'edit'));

-- Pending Reviews
DROP POLICY IF EXISTS "Users can view pending reviews" ON pending_reviews;
CREATE POLICY "Users can view pending reviews"
  ON pending_reviews FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Engineers can create pending reviews" ON pending_reviews;
CREATE POLICY "Engineers can create pending reviews"
  ON pending_reviews FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND user_has_team_permission('module:reviews', 'create'));

DROP POLICY IF EXISTS "Users can update pending reviews" ON pending_reviews;
CREATE POLICY "Users can update pending reviews"
  ON pending_reviews FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Workflow Review History
DROP POLICY IF EXISTS "Users can view workflow review history" ON workflow_review_history;
CREATE POLICY "Users can view workflow review history"
  ON workflow_review_history FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "System can insert workflow review history" ON workflow_review_history;
CREATE POLICY "System can insert workflow review history"
  ON workflow_review_history FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- File Watchers
DROP POLICY IF EXISTS "Users can view file watchers in org" ON file_watchers;
CREATE POLICY "Users can view file watchers in org"
  ON file_watchers FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can watch files" ON file_watchers;
CREATE POLICY "Users can watch files"
  ON file_watchers FOR INSERT
  WITH CHECK (user_id = auth.uid() AND org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own watchers" ON file_watchers;
CREATE POLICY "Users can update own watchers"
  ON file_watchers FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can unwatch files" ON file_watchers;
CREATE POLICY "Users can unwatch files"
  ON file_watchers FOR DELETE USING (user_id = auth.uid());

-- File Share Links
DROP POLICY IF EXISTS "Users can view share links in org" ON file_share_links;
CREATE POLICY "Users can view share links in org"
  ON file_share_links FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Engineers can create share links" ON file_share_links;
CREATE POLICY "Engineers can create share links"
  ON file_share_links FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND user_has_team_permission('system:files', 'create'));

DROP POLICY IF EXISTS "Users can update own share links" ON file_share_links;
CREATE POLICY "Users can update own share links"
  ON file_share_links FOR UPDATE USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can delete share links" ON file_share_links;
CREATE POLICY "Users can delete share links"
  ON file_share_links FOR DELETE USING (created_by = auth.uid() OR is_org_admin());

-- File Comments
DROP POLICY IF EXISTS "Users can view file comments in org" ON file_comments;
CREATE POLICY "Users can view file comments in org"
  ON file_comments FOR SELECT
  USING (file_id IN (SELECT id FROM files WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Users can create file comments" ON file_comments;
CREATE POLICY "Users can create file comments"
  ON file_comments FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own comments" ON file_comments;
CREATE POLICY "Users can update own comments"
  ON file_comments FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own comments" ON file_comments;
CREATE POLICY "Users can delete own comments"
  ON file_comments FOR DELETE USING (user_id = auth.uid());

-- File Metadata Columns
DROP POLICY IF EXISTS "Users can view org metadata columns" ON file_metadata_columns;
CREATE POLICY "Users can view org metadata columns"
  ON file_metadata_columns FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can create metadata columns" ON file_metadata_columns;
CREATE POLICY "Admins can create metadata columns"
  ON file_metadata_columns FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can update metadata columns" ON file_metadata_columns;
CREATE POLICY "Admins can update metadata columns"
  ON file_metadata_columns FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can delete metadata columns" ON file_metadata_columns;
CREATE POLICY "Admins can delete metadata columns"
  ON file_metadata_columns FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

-- Backup Config
DROP POLICY IF EXISTS "Users can view org backup config" ON backup_config;
CREATE POLICY "Users can view org backup config"
  ON backup_config FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert backup config" ON backup_config;
CREATE POLICY "Admins can insert backup config"
  ON backup_config FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can update backup config" ON backup_config;
CREATE POLICY "Admins can update backup config"
  ON backup_config FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can delete backup config" ON backup_config;
CREATE POLICY "Admins can delete backup config"
  ON backup_config FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

-- Backup History
DROP POLICY IF EXISTS "Users can view org backup history" ON backup_history;
CREATE POLICY "Users can view org backup history"
  ON backup_history FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "System can manage backup history" ON backup_history;
CREATE POLICY "System can manage backup history"
  ON backup_history FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Backup Machines
DROP POLICY IF EXISTS "Users can view org backup machines" ON backup_machines;
CREATE POLICY "Users can view org backup machines"
  ON backup_machines FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own backup machines" ON backup_machines;
CREATE POLICY "Users can manage own backup machines"
  ON backup_machines FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND (user_id = auth.uid() OR is_org_admin()));

-- Backup Locks
DROP POLICY IF EXISTS "Users can view backup locks" ON backup_locks;
CREATE POLICY "Users can view backup locks"
  ON backup_locks FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage backup locks" ON backup_locks;
CREATE POLICY "Users can manage backup locks"
  ON backup_locks FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Log file activity
CREATE OR REPLACE FUNCTION log_file_activity()
RETURNS TRIGGER AS $$
DECLARE
  action_type activity_action;
  activity_details JSONB := '{}'::jsonb;
  user_email_val TEXT;
BEGIN
  SELECT email INTO user_email_val FROM users WHERE id = auth.uid();
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS log_file_changes ON files;
CREATE TRIGGER log_file_changes
  AFTER INSERT OR UPDATE OR DELETE ON files
  FOR EACH ROW EXECUTE FUNCTION log_file_activity();

-- Create default workflow
CREATE OR REPLACE FUNCTION create_default_workflow(p_org_id UUID, p_created_by UUID)
RETURNS UUID AS $$
DECLARE
  v_workflow_id UUID;
  v_wip_state_id UUID;
  v_review_state_id UUID;
  v_released_state_id UUID;
  v_obsolete_state_id UUID;
BEGIN
  INSERT INTO workflow_templates (org_id, name, description, is_default, created_by)
  VALUES (p_org_id, 'Standard Release Process', 'Default workflow for releasing engineering files', true, p_created_by)
  RETURNING id INTO v_workflow_id;
  
  INSERT INTO workflow_states (workflow_id, name, label, color, icon, position_x, position_y, is_editable, requires_checkout, sort_order)
  VALUES (v_workflow_id, 'WIP', 'Work In Progress', '#EAB308', 'pencil', 100, 200, true, true, 1)
  RETURNING id INTO v_wip_state_id;
  
  INSERT INTO workflow_states (workflow_id, name, label, color, icon, position_x, position_y, is_editable, requires_checkout, sort_order)
  VALUES (v_workflow_id, 'In Review', 'In Review', '#3B82F6', 'eye', 350, 200, false, false, 2)
  RETURNING id INTO v_review_state_id;
  
  INSERT INTO workflow_states (workflow_id, name, label, color, icon, position_x, position_y, is_editable, requires_checkout, auto_increment_revision, sort_order)
  VALUES (v_workflow_id, 'Released', 'Released', '#22C55E', 'check-circle', 600, 200, false, false, true, 3)
  RETURNING id INTO v_released_state_id;
  
  INSERT INTO workflow_states (workflow_id, name, label, color, icon, position_x, position_y, is_editable, requires_checkout, sort_order)
  VALUES (v_workflow_id, 'Obsolete', 'Obsolete', '#6B7280', 'archive', 600, 350, false, false, 4)
  RETURNING id INTO v_obsolete_state_id;
  
  INSERT INTO workflow_transitions (workflow_id, from_state_id, to_state_id, name, line_style) VALUES
    (v_workflow_id, v_wip_state_id, v_review_state_id, 'Submit for Review', 'solid'),
    (v_workflow_id, v_review_state_id, v_released_state_id, 'Approve', 'solid'),
    (v_workflow_id, v_review_state_id, v_wip_state_id, 'Reject', 'dashed'),
    (v_workflow_id, v_released_state_id, v_wip_state_id, 'Revise', 'dashed'),
    (v_workflow_id, v_released_state_id, v_obsolete_state_id, 'Obsolete', 'dotted');
  
  RETURN v_workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get available transitions
CREATE OR REPLACE FUNCTION get_available_transitions(p_file_id UUID, p_user_id UUID)
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
BEGIN
  SELECT fwa.current_state_id INTO v_current_state_id
  FROM file_workflow_assignments fwa WHERE fwa.file_id = p_file_id;
  
  IF v_current_state_id IS NULL THEN RETURN; END IF;
  
  RETURN QUERY
  SELECT 
    wt.id, wt.name, ws.id, ws.name, ws.color,
    EXISTS(SELECT 1 FROM workflow_gates wg WHERE wg.transition_id = wt.id),
    true
  FROM workflow_transitions wt
  JOIN workflow_states ws ON wt.to_state_id = ws.id
  WHERE wt.from_state_id = v_current_state_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..12 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create file share link
CREATE OR REPLACE FUNCTION create_file_share_link(
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
BEGIN
  LOOP
    v_token := generate_share_token();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM file_share_links WHERE file_share_links.token = v_token);
  END LOOP;
  
  IF p_expires_in_days IS NOT NULL THEN
    v_expires_at := NOW() + (p_expires_in_days || ' days')::interval;
  END IF;
  
  INSERT INTO file_share_links (org_id, file_id, token, created_by, expires_at, max_downloads, require_auth)
  VALUES (p_org_id, p_file_id, v_token, p_created_by, v_expires_at, p_max_downloads, p_require_auth)
  RETURNING id INTO v_link_id;
  
  RETURN QUERY SELECT v_link_id, v_token, v_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Validate share link
CREATE OR REPLACE FUNCTION validate_share_link(p_token TEXT)
RETURNS TABLE (is_valid BOOLEAN, file_id UUID, org_id UUID, file_version INTEGER, error_message TEXT) AS $$
DECLARE
  v_link RECORD;
BEGIN
  SELECT * INTO v_link FROM file_share_links WHERE token = p_token;
  
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
  
  UPDATE file_share_links SET download_count = download_count + 1, last_accessed_at = NOW() WHERE token = p_token;
  
  RETURN QUERY SELECT true::boolean, v_link.file_id, v_link.org_id, v_link.file_version, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify file watchers
CREATE OR REPLACE FUNCTION notify_file_watchers()
RETURNS TRIGGER AS $$
DECLARE
  watcher RECORD;
  change_type TEXT;
  notification_title TEXT;
  notification_message TEXT;
  actor_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(full_name, email) INTO actor_name FROM users WHERE id = COALESCE(NEW.updated_by, auth.uid());
    
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
      SELECT fw.user_id FROM file_watchers fw 
      WHERE fw.file_id = NEW.id
        AND fw.user_id != COALESCE(NEW.updated_by, auth.uid())
        AND ((change_type = 'checkin' AND fw.notify_on_checkin) OR
             (change_type = 'checkout' AND fw.notify_on_checkout) OR
             (change_type = 'state_change' AND fw.notify_on_state_change))
    LOOP
      INSERT INTO notifications (org_id, user_id, type, title, message, entity_type, entity_id, from_user_id)
      VALUES (NEW.org_id, watcher.user_id, 'file_updated', notification_title, notification_message, 'file', NEW.id, COALESCE(NEW.updated_by, auth.uid()));
    END LOOP;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'File watcher notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS notify_watchers_on_file_change ON files;
CREATE TRIGGER notify_watchers_on_file_change
  AFTER UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION notify_file_watchers();

-- Get user vault access
CREATE OR REPLACE FUNCTION get_user_vault_access(p_user_id UUID)
RETURNS TABLE (vault_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT va.vault_id
  FROM (
    SELECT vault_access.vault_id FROM vault_access WHERE vault_access.user_id = p_user_id
    UNION
    SELECT tva.vault_id FROM team_vault_access tva
    JOIN team_members tm ON tva.team_id = tm.team_id
    WHERE tm.user_id = p_user_id
  ) va;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_vault_access(UUID) TO authenticated;

-- ===========================================
-- REALTIME
-- ===========================================

ALTER TABLE vaults REPLICA IDENTITY FULL;
ALTER TABLE vault_access REPLICA IDENTITY FULL;
ALTER TABLE files REPLICA IDENTITY FULL;
ALTER TABLE workflow_templates REPLICA IDENTITY FULL;
ALTER TABLE workflow_states REPLICA IDENTITY FULL;
ALTER TABLE workflow_transitions REPLICA IDENTITY FULL;
ALTER TABLE workflow_gates REPLICA IDENTITY FULL;
ALTER TABLE workflow_gate_reviewers REPLICA IDENTITY FULL;
ALTER TABLE workflow_roles REPLICA IDENTITY FULL;
ALTER TABLE user_workflow_roles REPLICA IDENTITY FULL;
ALTER TABLE file_metadata_columns REPLICA IDENTITY FULL;
ALTER TABLE backup_config REPLICA IDENTITY FULL;
ALTER TABLE backup_machines REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE vaults; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE vault_access; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE files; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workflow_templates; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workflow_states; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workflow_transitions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workflow_gates; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workflow_gate_reviewers; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workflow_roles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE user_workflow_roles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE file_metadata_columns; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE backup_config; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE backup_machines; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ===========================================
-- END OF SOURCE FILES MODULE
-- ===========================================

DO $$
BEGIN
  RAISE NOTICE 'Source Files module installed successfully';
END $$;
