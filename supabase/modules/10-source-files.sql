-- =====================================================================
-- BluePLM Source Files Module (5.0 baseline)
-- =====================================================================
-- Vaults and vault access, files and versions, references, folders, file
-- workflows and gate reviews, backups, metadata columns, item designations,
-- share links, comments and the vault storage bucket.
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
-- =====================================================================

-- ===========================================
-- TYPES
-- ===========================================

CREATE TYPE file_type AS ENUM ('part', 'assembly', 'drawing', 'pdf', 'step', 'other');
CREATE TYPE reference_type AS ENUM ('component', 'derived', 'reference');
CREATE TYPE activity_action AS ENUM ('create', 'update', 'checkout', 'checkin', 'state_change', 'revision_change', 'delete', 'restore', 'move', 'rename');
CREATE TYPE release_file_type AS ENUM ('step', 'pdf', 'dxf', 'iges', 'stl', 'dwg', 'dxf_flat');
CREATE TYPE metadata_column_type AS ENUM ('text', 'number', 'date', 'boolean', 'select');
CREATE TYPE state_type AS ENUM ('state', 'gate');
CREATE TYPE state_shape AS ENUM ('rectangle', 'diamond', 'hexagon', 'ellipse');
CREATE TYPE transition_line_style AS ENUM ('solid', 'dashed', 'dotted');
CREATE TYPE transition_path_type AS ENUM ('straight', 'spline', 'elbow');
CREATE TYPE transition_arrow_head AS ENUM ('none', 'end', 'start', 'both');
CREATE TYPE gate_type AS ENUM ('approval', 'checklist', 'condition');
CREATE TYPE approval_mode AS ENUM ('any', 'all', 'majority');
CREATE TYPE reviewer_type AS ENUM ('user', 'role', 'group', 'workflow_role');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'kicked_back');
CREATE TYPE transition_edge AS ENUM ('left', 'right', 'top', 'bottom');
CREATE TYPE revision_scheme AS ENUM ('letter', 'numeric');

-- ===========================================
-- TABLES
-- ===========================================

-- ===========================================
-- SOURCE FILES ENUMS
-- ===========================================

-- ===========================================
-- WORKFLOW ENUMS
-- ===========================================

-- Box edge an anchored transition endpoint is attached to

-- Revision scheme enum (used by organization.revision_scheme column)

-- ===========================================
-- ORGANIZATION COLUMNS (managed by source-files module)
-- ===========================================

-- ===========================================
-- VAULTS
-- ===========================================
CREATE TABLE vault (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  local_path TEXT,
  storage_bucket TEXT,
  color TEXT DEFAULT '#6366f1'::text,
  icon TEXT DEFAULT 'folder'::text,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  CONSTRAINT vault_org_id_slug_key UNIQUE (org_id, slug)
);

-- ===========================================
-- RLS POLICIES
-- ===========================================

-- ===========================================
-- REALTIME
-- ===========================================

-- ===========================================
-- MIGRATIONS FOR EXISTING DATABASES
-- ===========================================
-- These ALTER statements add columns that may be missing from existing installations.
-- Safe to run multiple times (uses IF NOT EXISTS or DO blocks with exception handling).

-- v26: Storage bucket for vaults (already handled inline, but included for completeness)

CREATE INDEX vault_org_id_idx ON vault (org_id);

ALTER TABLE vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE vault;

-- ===========================================
-- VAULT ACCESS (Per-user permissions)
-- ===========================================
CREATE TABLE vault_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id UUID NOT NULL REFERENCES vault(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES app_user(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT vault_access_vault_id_user_id_key UNIQUE (vault_id, user_id)
);

CREATE INDEX vault_access_vault_id_idx ON vault_access (vault_id);
CREATE INDEX vault_access_user_id_idx ON vault_access (user_id);

ALTER TABLE vault_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_access REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE vault_access;

-- Team vault access (references teams from core)
CREATE TABLE team_vault_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  vault_id UUID NOT NULL REFERENCES vault(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES app_user(id),
  CONSTRAINT team_vault_access_team_id_vault_id_key UNIQUE (team_id, vault_id)
);

CREATE INDEX team_vault_access_team_id_idx ON team_vault_access (team_id);
CREATE INDEX team_vault_access_vault_id_idx ON team_vault_access (vault_id);

ALTER TABLE team_vault_access ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- WORKFLOW TEMPLATES (must come before files)
-- ===========================================
CREATE TABLE workflow_template (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  canvas_config JSONB DEFAULT '{"panX": 0, "panY": 0, "zoom": 1}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id)
);

CREATE INDEX workflow_template_org_id_idx ON workflow_template (org_id);
CREATE INDEX workflow_template_is_default_idx ON workflow_template (is_default);
CREATE INDEX workflow_template_is_active_idx ON workflow_template (is_active);

ALTER TABLE workflow_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_template REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_template;

-- ===========================================
-- WORKFLOW STATES
-- ===========================================
CREATE TABLE workflow_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflow_template(id) ON DELETE CASCADE,
  state_type state_type DEFAULT 'state'::state_type,
  shape state_shape DEFAULT 'rectangle'::state_shape,
  name TEXT NOT NULL,
  label TEXT,
  description TEXT,
  color TEXT DEFAULT '#6B7280'::text,
  fill_opacity NUMERIC(3,2) DEFAULT 1.0,
  border_color TEXT,
  border_opacity NUMERIC(3,2) DEFAULT 1.0,
  border_thickness INTEGER DEFAULT 2,
  corner_radius INTEGER DEFAULT 8,
  icon TEXT DEFAULT 'circle'::text,
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 120 NOT NULL,
  height INTEGER DEFAULT 60 NOT NULL,
  is_editable BOOLEAN DEFAULT true,
  is_checkout_required BOOLEAN DEFAULT true,
  is_revision_auto_incremented BOOLEAN DEFAULT false,
  gate_config JSONB DEFAULT '{}'::jsonb,
  required_workflow_roles UUID[] DEFAULT '{}'::uuid[],
  is_review_stage BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  review_approved_state_id UUID REFERENCES workflow_state(id) ON DELETE SET NULL
);

-- Schema 110: a review stage (is_review_stage) names the state an approved review
-- moves its files to. NULL = the stage's only outgoing transition.

CREATE INDEX workflow_state_workflow_id_idx ON workflow_state (workflow_id);

ALTER TABLE workflow_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_state;

-- ===========================================
-- FILES
-- ===========================================
CREATE TABLE file (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  vault_id UUID NOT NULL REFERENCES vault(id) ON DELETE CASCADE,
  -- File identity
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  file_type file_type DEFAULT 'other'::file_type NOT NULL,
  -- Engineering metadata
  part_number TEXT,
  description TEXT,
  revision TEXT DEFAULT ''::text NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  -- Content reference
  content_hash TEXT,
  file_size BIGINT DEFAULT 0,
  -- Inspection table content fingerprint (drawings).
  -- Hash of the inspection_characteristic rows; used to detect inspection edits
  -- so they trigger a new version on check-in (see file_checkin).
  inspection_hash TEXT,
  -- Workflow state
  workflow_state_id UUID REFERENCES workflow_state(id),
  -- Legacy field for backwards compatibility
  state TEXT DEFAULT 'WIP'::text,
  state_changed_at TIMESTAMPTZ DEFAULT NOW(),
  state_changed_by UUID REFERENCES app_user(id),
  -- Checkout lock
  checked_out_by UUID REFERENCES app_user(id),
  checked_out_at TIMESTAMPTZ,
  lock_message TEXT,
  checked_out_by_machine_id TEXT,
  checked_out_by_machine_name TEXT,
  -- file_path / file_name at the moment file_checkout() ran, so discard can restore a
  -- rename or move made during the checkout - renames themselves keep propagating to
  -- file_path/file_name live, exactly as before. NULL when not checked out. Cleared by
  -- file_checkin(), undoCheckout() and adminForceDiscardCheckout() alongside the lock.
  checked_out_file_path TEXT,
  checked_out_file_name TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  -- Custom properties
  custom_properties JSONB DEFAULT '{}'::jsonb,
  -- Configuration-specific revisions (for multi-config parts/assemblies)
  -- Map of configuration name -> revision letter, e.g. {"Default": "B", "Anodized": "C"}
  -- Updated when drawings referencing this file's configs are released
  configuration_revisions JSONB DEFAULT '{}'::jsonb,
  -- ECO tags (denormalized)
  eco_tags TEXT[] DEFAULT '{}'::text[],
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES app_user(id)
);

-- v46: Configuration-specific revisions for multi-config parts/assemblies

-- v98: Checkout path snapshot, so discard can restore a rename or move made during checkout

CREATE UNIQUE INDEX file_vault_id_file_path_idx ON file (vault_id, lower(file_path)) WHERE (deleted_at IS NULL);
CREATE INDEX file_org_id_idx ON file (org_id);
CREATE INDEX file_vault_id_idx ON file (vault_id);
CREATE INDEX file_file_path_idx ON file (file_path);
CREATE INDEX file_part_number_idx ON file (part_number) WHERE (part_number IS NOT NULL);
CREATE INDEX file_state_idx ON file (state);
CREATE INDEX file_checked_out_by_idx ON file (checked_out_by) WHERE (checked_out_by IS NOT NULL);
CREATE INDEX file_extension_idx ON file (extension);
CREATE INDEX file_content_hash_idx ON file (content_hash) WHERE (content_hash IS NOT NULL);
CREATE INDEX file_deleted_at_idx ON file (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX file_vault_id_file_path_deleted_at_idx ON file (vault_id, file_path) WHERE (deleted_at IS NULL);
CREATE INDEX file_eco_tags_idx ON file USING gin (eco_tags);

ALTER TABLE file ENABLE ROW LEVEL SECURITY;
ALTER TABLE file REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE file;

-- Indexes
-- DROP+CREATE to ensure the index uses LOWER(file_path) for case-insensitive uniqueness on Windows

-- ===========================================
-- FILE VERSIONS
-- ===========================================
CREATE TABLE file_version (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  revision TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  workflow_state_id UUID REFERENCES workflow_state(id),
  -- Workflow state name at time of version
  state TEXT DEFAULT 'not_tracked'::text NOT NULL,
  comment TEXT,
  -- Snapshot of part number at time of version
  part_number TEXT,
  -- Snapshot of description at time of version
  description TEXT,
  -- Snapshot of inspection table fingerprint at time of version
  inspection_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES app_user(id),
  references_recorded_at TIMESTAMPTZ,
  CONSTRAINT file_version_file_id_version_key UNIQUE (file_id, version)
);

-- Schema 105: set when file_version_reference_record() has written this version's
-- reference set (possibly empty). NULL means the version predates per-version
-- references, and file_version_get_dependency_closure() falls back to file_reference.

-- v45: File versions metadata snapshots (already handled inline, but included for completeness)

CREATE INDEX file_version_file_id_idx ON file_version (file_id);
CREATE INDEX file_version_content_hash_idx ON file_version (content_hash);

ALTER TABLE file_version ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- RELEASE FILES
-- ===========================================
CREATE TABLE release_file (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  file_version_id UUID REFERENCES file_version(id) ON DELETE SET NULL,
  version INTEGER NOT NULL,
  revision TEXT,
  file_type release_file_type NOT NULL,
  file_name TEXT NOT NULL,
  local_path TEXT,
  storage_path TEXT,
  storage_hash TEXT,
  file_size BIGINT DEFAULT 0,
  generated_by UUID REFERENCES app_user(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  rfq_id UUID,
  rfq_item_id UUID,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.0 (audit S7): a release file's RFQ links were plain UUIDs while the supply
-- chain module was optional. Deleting the RFQ or its item clears the link.

CREATE INDEX release_file_file_id_idx ON release_file (file_id);
CREATE INDEX release_file_file_version_id_idx ON release_file (file_version_id);
CREATE INDEX release_file_org_id_idx ON release_file (org_id);
CREATE INDEX release_file_file_id_version_file_type_idx ON release_file (file_id, version, file_type);

ALTER TABLE release_file ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- FILE REFERENCES (BOM/Assembly)
-- ===========================================
CREATE TABLE file_reference (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  parent_file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  child_file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  reference_type reference_type DEFAULT 'component'::reference_type,
  quantity INTEGER DEFAULT 1,
  configuration TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT file_reference_parent_file_id_child_file_id_configuration_key UNIQUE (parent_file_id, child_file_id, configuration)
);

CREATE INDEX file_reference_parent_file_id_idx ON file_reference (parent_file_id);
CREATE INDEX file_reference_child_file_id_idx ON file_reference (child_file_id);

ALTER TABLE file_reference ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- FILE VERSION REFERENCES (schema 107)
-- ===========================================
-- file_reference says what a file references *now*. A review pins a drawing at a
-- version, and "the drawing and its parts at matching versions" needs what that
-- version referenced when it was checked in. One row per reference of one parent
-- version, written by file_version_reference_record() at check-in.
--
-- child_version_id is the child's version whose content hash matched the local
-- child at check-in (exact = true), else the child's latest version at that moment
-- (exact = false), else NULL (the child had no version). child_file_id is NULL for
-- a reference outside the vault; child_path still names it.
CREATE TABLE file_version_reference (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  parent_version_id UUID NOT NULL REFERENCES file_version(id) ON DELETE CASCADE,
  parent_file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  child_file_id UUID REFERENCES file(id) ON DELETE SET NULL,
  child_version_id UUID REFERENCES file_version(id) ON DELETE SET NULL,
  child_path TEXT NOT NULL CHECK ((length(btrim(child_path)) > 0)),
  configuration TEXT,
  reference_type reference_type DEFAULT 'component'::reference_type NOT NULL,
  quantity INTEGER DEFAULT 1 NOT NULL CHECK ((quantity >= 1)),
  is_exact BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX file_version_reference_edge_idx ON file_version_reference (parent_version_id, lower(child_path), COALESCE(configuration, ''::text));
CREATE INDEX file_version_reference_child_file_id_idx ON file_version_reference (child_file_id);
CREATE INDEX file_version_reference_child_version_id_idx ON file_version_reference (child_version_id);
CREATE INDEX file_version_reference_org_id_idx ON file_version_reference (org_id);

ALTER TABLE file_version_reference ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- DRAWING PDF RENDERS (schema 107)
-- ===========================================
-- The PDF a reviewer sees for a drawing version. Generated once (on a machine with
-- SOLIDWORKS), stored content-addressed in the vault bucket, and reused by every
-- later request for the same version.
--
-- Not release_file: its policy lets any member with module:explorer:edit write
-- any row of their organization with no uniqueness per version, so a review's PDF
-- could be silently replaced or duplicated. This table is SELECT-only for clients;
-- drawing_pdf_render_record() is the only writer and refuses to replace a render unless
-- the caller is an administrator.
CREATE TABLE drawing_pdf_render (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  file_version_id UUID NOT NULL UNIQUE REFERENCES file_version(id) ON DELETE CASCADE,
  storage_hash TEXT NOT NULL CHECK ((storage_hash ~ '^[0-9a-f]{64}$'::text)),
  file_size BIGINT NOT NULL CHECK ((file_size > 0)),
  -- Whether the references the drawing was rendered against were all exact
  -- versions. NULL when the generator did not say.
  is_closure_exact BOOLEAN,
  generated_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ===========================================
-- VAULT STORAGE BUCKET POLICIES (schema 111)
-- ===========================================
-- The `vault` bucket (docs/admin-setup.md step 3) holds file content addressed by
-- its SHA-256 as <org_id>/<hash[0:2]>/<hash> (older objects: <org_id>/<hash>),
-- drawing PDF renders the same way, organization assets under <org_id>/_assets/
-- (avatars, the company logo, item images), and inspection previews under
-- <org_id>/inspection-previews/<file_id>-<time>.<ext>.
--
-- Until 111 the bucket's policies were not in this repository at all. The only
-- set ever committed (cbe3997) admitted every signed-in user of every
-- organization to read, overwrite and delete every object, and a list() of the
-- bucket enumerated every content hash. These policies replace whatever is there:
--
--   read    - an object in the caller's organization, and one of: the caller is
--             an org admin; the caller uploaded it; it is an organization asset;
--             it is content whose hash a file, version or drawing PDF in a vault
--             the caller may see names, or an inspection preview of such a file
--             (can_read_vault_object()).
--   upload  - into the caller's organization.
--   update  - only the mutable areas (_assets/, inspection-previews/), in the
--             caller's organization, by an admin or the uploader (upserted
--             avatars, logo, item images, previews). Content-addressed objects are
--             never updated: overwriting one would change a file for everyone
--             whose version names that hash.
--   delete  - an admin, anywhere in the organization (vault deletion purges
--             content); the uploader, in the mutable areas only.
--
-- "The caller uploaded it" is what lets check-in verify the bytes it just wrote,
-- before any version row names the hash. Content is deduplicated across vaults,
-- so a user can be told an upload "already exists" for an object they cannot
-- list; the renderer treats that answer as success (checkin.ts).
--
-- Every other policy on storage.objects is dropped, by whatever name it was
-- installed under, because policies are OR-ed and one permissive leftover undoes
-- all of this. Production carried four dashboard-made policies ("Allow
-- authenticated access 1uo56a_0..3") granting every signed-in account SELECT,
-- INSERT, UPDATE and DELETE with `true` on every bucket. The application uses two
-- buckets: vault (these policies) and org-extensions (module 50's four, kept by
-- name). Each policy dropped is printed with its definition, and
-- check_release_residue() refuses to stamp while any other remains.

CREATE INDEX drawing_pdf_render_org_id_idx ON drawing_pdf_render (org_id);
CREATE INDEX drawing_pdf_render_file_id_idx ON drawing_pdf_render (file_id);
CREATE INDEX drawing_pdf_render_storage_hash_idx ON drawing_pdf_render (storage_hash);

ALTER TABLE drawing_pdf_render ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- FOLDERS (Explicit folder records for empty folders)
-- ===========================================
CREATE TABLE folder (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  vault_id UUID NOT NULL REFERENCES vault(id) ON DELETE CASCADE,
  -- relative path, e.g., "Assemblies" or "Project/Assemblies"
  folder_path TEXT NOT NULL,
  created_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES app_user(id)
);

-- v101: folders carries deleted_at/deleted_by like files does, and
-- deleteFolderByPath soft-deletes through them, but the table was never
-- published or given a full replica identity, so a folder deletion with no
-- files in it never reached another client. REPLICA IDENTITY FULL is the
-- load-bearing half - without it an UPDATE's old record on the wire carries
-- only the primary key, so a deleted_at null-to-set transition is
-- undetectable. See check_release_residue() in core.sql for the verification
-- this schema_get_release_manifest() cannot express for either statement.

CREATE UNIQUE INDEX folder_vault_id_folder_path_idx ON folder (vault_id, lower(folder_path)) WHERE (deleted_at IS NULL);
CREATE INDEX folder_org_id_idx ON folder (org_id);
CREATE INDEX folder_vault_id_idx ON folder (vault_id);
CREATE INDEX folder_deleted_at_idx ON folder (deleted_at) WHERE (deleted_at IS NOT NULL);

ALTER TABLE folder ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE folder;

-- ===========================================
-- ACTIVITY LOG
-- ===========================================
CREATE TABLE activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  file_id UUID REFERENCES file(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES app_user(id),
  user_email TEXT NOT NULL,
  action activity_action NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX activity_org_id_idx ON activity (org_id);
CREATE INDEX activity_file_id_idx ON activity (file_id);
CREATE INDEX activity_user_id_idx ON activity (user_id);
CREATE INDEX activity_created_at_idx ON activity (created_at DESC);
CREATE INDEX activity_action_idx ON activity (action);

ALTER TABLE activity ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- WORKFLOW TRANSITIONS
-- ===========================================
CREATE TABLE workflow_transition (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflow_template(id) ON DELETE CASCADE,
  from_state_id UUID NOT NULL REFERENCES workflow_state(id) ON DELETE CASCADE,
  to_state_id UUID NOT NULL REFERENCES workflow_state(id) ON DELETE CASCADE,
  name TEXT,
  description TEXT,
  line_style transition_line_style DEFAULT 'solid'::transition_line_style,
  line_color TEXT,
  line_path_type transition_path_type DEFAULT 'spline'::transition_path_type,
  line_arrow_head transition_arrow_head DEFAULT 'end'::transition_arrow_head,
  line_thickness INTEGER DEFAULT 2,
  allowed_workflow_roles UUID[] DEFAULT '{}'::uuid[],
  auto_conditions JSONB,
  -- Diagram routing. NULL anchors mean "wherever the centre-to-centre ray crosses
  -- the border"; a set edge + fraction pins the endpoint to a spot the user chose.
  start_edge transition_edge,
  start_fraction NUMERIC(4,3),
  end_edge transition_edge,
  end_fraction NUMERIC(4,3),
  waypoints JSONB DEFAULT '[]'::jsonb NOT NULL,
  label_offset JSONB,
  label_pinned JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT workflow_transition_from_state_id_to_state_id_key UNIQUE (from_state_id, to_state_id)
);

CREATE INDEX workflow_transition_workflow_id_idx ON workflow_transition (workflow_id);
CREATE INDEX workflow_transition_from_state_id_idx ON workflow_transition (from_state_id);
CREATE INDEX workflow_transition_to_state_id_idx ON workflow_transition (to_state_id);

ALTER TABLE workflow_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_transition REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_transition;

-- ===========================================
-- WORKFLOW GATES
-- ===========================================
CREATE TABLE workflow_gate (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transition_id UUID NOT NULL REFERENCES workflow_transition(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  gate_type gate_type DEFAULT 'approval'::gate_type,
  required_approvals INTEGER DEFAULT 1,
  approval_mode approval_mode DEFAULT 'any'::approval_mode,
  checklist_items JSONB DEFAULT '[]'::jsonb,
  conditions JSONB,
  is_blocking BOOLEAN DEFAULT true,
  can_be_skipped_by user_role[] DEFAULT '{}'::user_role[],
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX workflow_gate_transition_id_idx ON workflow_gate (transition_id);

ALTER TABLE workflow_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_gate REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_gate;

-- ===========================================
-- WORKFLOW GATE REVIEWERS
-- ===========================================
CREATE TABLE workflow_gate_reviewer (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gate_id UUID NOT NULL REFERENCES workflow_gate(id) ON DELETE CASCADE,
  reviewer_type reviewer_type NOT NULL,
  user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
  role user_role,
  group_name TEXT,
  workflow_role_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX workflow_gate_reviewer_gate_id_idx ON workflow_gate_reviewer (gate_id);
CREATE INDEX workflow_gate_reviewer_user_id_idx ON workflow_gate_reviewer (user_id);

ALTER TABLE workflow_gate_reviewer ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_gate_reviewer REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_gate_reviewer;

-- ===========================================
-- WORKFLOW ROLES
-- ===========================================
CREATE TABLE workflow_role (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280'::text,
  icon TEXT DEFAULT 'badge-check'::text,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  CONSTRAINT workflow_role_org_id_name_key UNIQUE (org_id, name)
);

CREATE INDEX workflow_role_org_id_idx ON workflow_role (org_id);
CREATE INDEX workflow_role_org_id_name_idx ON workflow_role (org_id, name);

ALTER TABLE workflow_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_role REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_role;

ALTER TABLE workflow_gate_reviewer ADD CONSTRAINT workflow_gate_reviewer_workflow_role_id_fkey
  FOREIGN KEY (workflow_role_id) REFERENCES workflow_role(id) ON DELETE CASCADE;

-- User workflow role assignments
CREATE TABLE user_workflow_role (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  workflow_role_id UUID NOT NULL REFERENCES workflow_role(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES app_user(id),
  CONSTRAINT user_workflow_role_user_id_workflow_role_id_key UNIQUE (user_id, workflow_role_id)
);

CREATE INDEX user_workflow_role_user_id_idx ON user_workflow_role (user_id);
CREATE INDEX user_workflow_role_workflow_role_id_idx ON user_workflow_role (workflow_role_id);

ALTER TABLE user_workflow_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_workflow_role REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE user_workflow_role;

-- ===========================================
-- FILE WORKFLOW ASSIGNMENTS
-- ===========================================
CREATE TABLE file_workflow_assignment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL UNIQUE REFERENCES file(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflow_template(id) ON DELETE CASCADE,
  current_state_id UUID REFERENCES workflow_state(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES app_user(id)
);

CREATE INDEX file_workflow_assignment_file_id_idx ON file_workflow_assignment (file_id);
CREATE INDEX file_workflow_assignment_workflow_id_idx ON file_workflow_assignment (workflow_id);
CREATE INDEX file_workflow_assignment_current_state_id_idx ON file_workflow_assignment (current_state_id);

ALTER TABLE file_workflow_assignment ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- PENDING REVIEWS
-- ===========================================
CREATE TABLE workflow_gate_review (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  transition_id UUID NOT NULL REFERENCES workflow_transition(id) ON DELETE CASCADE,
  gate_id UUID NOT NULL REFERENCES workflow_gate(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES app_user(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  status review_status DEFAULT 'pending'::review_status NOT NULL,
  assignee_id UUID REFERENCES app_user(id),
  reviewed_by UUID REFERENCES app_user(id),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  checklist_responses JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  attempt_id UUID NOT NULL
);

-- Schema 105: an attempt id scopes a gate's approval count to one run of the
-- transition. Before this, gate_review_complete() counted every row ever created
-- for (file, transition, gate), so an 'all' gate could never pass again after one
-- rejection and an 'any' gate with required_approvals > 1 passed by reusing
-- approvals from earlier attempts and earlier versions.
--
-- Backfill: workflow_transition_execute() inserted every row of one attempt in a
-- single statement loop, so they share requested_at (NOW() is fixed for the
-- transaction). One attempt per (file, transition, requested_at) is therefore the
-- attempt each legacy row actually belonged to. Only NULL rows are touched, so a
-- second run changes nothing.

CREATE INDEX workflow_gate_review_org_id_idx ON workflow_gate_review (org_id);
CREATE INDEX workflow_gate_review_file_id_idx ON workflow_gate_review (file_id);
CREATE INDEX workflow_gate_review_status_idx ON workflow_gate_review (status);
CREATE INDEX workflow_gate_review_assignee_id_idx ON workflow_gate_review (assignee_id);
CREATE INDEX workflow_gate_review_attempt_id_gate_id_idx ON workflow_gate_review (attempt_id, gate_id);

ALTER TABLE workflow_gate_review ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- WORKFLOW REVIEW HISTORY
-- ===========================================
CREATE TABLE workflow_review_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  file_id UUID REFERENCES file(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  workflow_id UUID REFERENCES workflow_template(id) ON DELETE SET NULL,
  workflow_name TEXT NOT NULL,
  transition_id UUID REFERENCES workflow_transition(id) ON DELETE SET NULL,
  from_state_name TEXT NOT NULL,
  to_state_name TEXT NOT NULL,
  gate_id UUID REFERENCES workflow_gate(id) ON DELETE SET NULL,
  gate_name TEXT NOT NULL,
  requested_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  requested_by_email TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  reviewed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  reviewed_by_email TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL,
  decision TEXT NOT NULL,
  comment TEXT,
  checklist_responses JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX workflow_review_history_org_id_idx ON workflow_review_history (org_id);
CREATE INDEX workflow_review_history_file_id_idx ON workflow_review_history (file_id);
CREATE INDEX workflow_review_history_created_at_idx ON workflow_review_history (created_at DESC);

ALTER TABLE workflow_review_history ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- WORKFLOW HISTORY
-- ===========================================
CREATE TABLE workflow_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  file_id UUID REFERENCES file(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  workflow_id UUID REFERENCES workflow_template(id) ON DELETE SET NULL,
  workflow_name TEXT NOT NULL,
  from_state_id UUID REFERENCES workflow_state(id) ON DELETE SET NULL,
  from_state_name TEXT NOT NULL,
  to_state_id UUID REFERENCES workflow_state(id) ON DELETE SET NULL,
  to_state_name TEXT NOT NULL,
  transition_id UUID REFERENCES workflow_transition(id) ON DELETE SET NULL,
  transition_name TEXT,
  performed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  performed_by_email TEXT NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  comment TEXT,
  revision_before TEXT,
  revision_after TEXT,
  approvals_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX workflow_history_org_id_idx ON workflow_history (org_id);
CREATE INDEX workflow_history_file_id_idx ON workflow_history (file_id);
CREATE INDEX workflow_history_performed_at_idx ON workflow_history (performed_at DESC);

ALTER TABLE workflow_history ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- FILE STATE ENTRIES (Per-state file list)
-- ===========================================
CREATE TABLE file_state_entry (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  state_id UUID NOT NULL REFERENCES workflow_state(id) ON DELETE CASCADE,
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  entered_by UUID REFERENCES app_user(id),
  exited_at TIMESTAMPTZ,
  exited_by UUID REFERENCES app_user(id),
  duration_seconds INTEGER,
  CONSTRAINT file_state_entry_file_id_state_id_entered_at_key UNIQUE (file_id, state_id, entered_at)
);

CREATE INDEX file_state_entry_file_id_idx ON file_state_entry (file_id);
CREATE INDEX file_state_entry_state_id_idx ON file_state_entry (state_id);
CREATE INDEX file_state_entry_state_id_exited_at_idx ON file_state_entry (state_id) WHERE (exited_at IS NULL);

ALTER TABLE file_state_entry ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- FILE WATCHERS
-- ===========================================
CREATE TABLE file_watcher (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  is_notified_on_checkin BOOLEAN DEFAULT true,
  is_notified_on_checkout BOOLEAN DEFAULT false,
  is_notified_on_state_change BOOLEAN DEFAULT true,
  is_notified_on_review BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT file_watcher_file_id_user_id_key UNIQUE (file_id, user_id)
);

CREATE INDEX file_watcher_file_id_idx ON file_watcher (file_id);
CREATE INDEX file_watcher_user_id_idx ON file_watcher (user_id);
CREATE INDEX file_watcher_org_id_idx ON file_watcher (org_id);

ALTER TABLE file_watcher ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- FILE SHARE LINKS
-- ===========================================
CREATE TABLE file_share_link (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES app_user(id),
  expires_at TIMESTAMPTZ,
  max_downloads INTEGER,
  download_count INTEGER DEFAULT 0,
  password_hash TEXT,
  file_version INTEGER,
  can_download BOOLEAN DEFAULT true,
  is_auth_required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX file_share_link_token_idx ON file_share_link (token);
CREATE INDEX file_share_link_file_id_idx ON file_share_link (file_id);
CREATE INDEX file_share_link_org_id_idx ON file_share_link (org_id);
CREATE INDEX file_share_link_created_by_idx ON file_share_link (created_by);
CREATE INDEX file_share_link_expires_at_idx ON file_share_link (expires_at) WHERE (expires_at IS NOT NULL);

ALTER TABLE file_share_link ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- FILE COMMENTS
-- ===========================================
CREATE TABLE file_comment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  -- PDF page (1-indexed), NULL for file-level comments
  page_number INTEGER,
  -- {x, y, width, height, pageWidth, pageHeight} for area highlights
  position JSONB,
  -- 'area', 'text', 'highlight', or 'file' (file-level)
  annotation_type TEXT DEFAULT 'text'::text,
  -- for threaded replies
  parent_id UUID REFERENCES file_comment(id) ON DELETE CASCADE,
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  -- version the comment was made on
  file_version INTEGER,
  -- tracks if comment was edited
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- FILE COMMENTS LINKED TO A REVIEW (schema 107)
-- ===========================================
-- PDF markups and comments made inside a review carry the review, the round and
-- the item they were made on, so a requester sees each reviewer's markups for
-- exactly the version and round they were made on. file_comment itself lives in
-- 10-source-files.sql; these columns live here because reviews does.
-- trg_file_comment_link_review() below validates them.

CREATE INDEX file_comment_file_id_idx ON file_comment (file_id);
CREATE INDEX file_comment_user_id_idx ON file_comment (user_id);
CREATE INDEX file_comment_parent_id_idx ON file_comment (parent_id);
CREATE INDEX file_comment_is_resolved_idx ON file_comment (is_resolved);

ALTER TABLE file_comment ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- FILE METADATA COLUMNS (Custom fields)
-- ===========================================
CREATE TABLE file_metadata_column (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  data_type metadata_column_type DEFAULT 'text'::metadata_column_type NOT NULL,
  select_options TEXT[] DEFAULT '{}'::text[] NOT NULL,
  width INTEGER DEFAULT 120 NOT NULL,
  is_visible BOOLEAN DEFAULT true NOT NULL,
  is_sortable BOOLEAN DEFAULT true NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_required BOOLEAN DEFAULT false NOT NULL,
  default_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  CONSTRAINT file_metadata_column_org_id_name_key UNIQUE (org_id, name)
);

CREATE INDEX file_metadata_column_org_id_idx ON file_metadata_column (org_id);
CREATE INDEX file_metadata_column_org_id_sort_order_idx ON file_metadata_column (org_id, sort_order);

ALTER TABLE file_metadata_column ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_metadata_column REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE file_metadata_column;

-- ===========================================
-- BACKUP SYSTEM
-- ===========================================
CREATE TABLE backup_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL UNIQUE REFERENCES organization(id) ON DELETE CASCADE,
  provider TEXT DEFAULT 'backblaze_b2'::text NOT NULL,
  bucket TEXT,
  region TEXT,
  endpoint TEXT,
  access_key_encrypted TEXT,
  secret_key_encrypted TEXT,
  restic_password_encrypted TEXT,
  is_schedule_enabled BOOLEAN DEFAULT false,
  schedule_cron TEXT DEFAULT '0 0 * * *'::text,
  schedule_hour INTEGER DEFAULT 0,
  schedule_minute INTEGER DEFAULT 0,
  schedule_timezone TEXT DEFAULT 'UTC'::text,
  designated_machine_id TEXT,
  designated_machine_name TEXT,
  designated_machine_platform TEXT,
  designated_machine_user_email TEXT,
  designated_machine_last_seen_at TIMESTAMPTZ,
  backup_requested_at TIMESTAMPTZ,
  backup_requested_by TEXT,
  backup_started_at TIMESTAMPTZ,
  retention_daily INTEGER DEFAULT 14,
  retention_weekly INTEGER DEFAULT 10,
  retention_monthly INTEGER DEFAULT 10,
  retention_yearly INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id)
);

-- v31: Backup config endpoint and restic password

CREATE INDEX backup_config_org_id_idx ON backup_config (org_id);

ALTER TABLE backup_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_config REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE backup_config;

CREATE TABLE backup_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running'::text NOT NULL,
  machine_id TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  files_total INTEGER,
  files_added INTEGER,
  files_modified INTEGER,
  bytes_added BIGINT,
  bytes_total BIGINT,
  duration_seconds INTEGER,
  snapshot_id TEXT,
  error_message TEXT,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX backup_history_org_id_idx ON backup_history (org_id);
CREATE INDEX backup_history_started_at_idx ON backup_history (started_at DESC);
CREATE INDEX backup_history_status_idx ON backup_history (status);

ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE backup_machine (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  machine_id TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  user_id UUID REFERENCES app_user(id),
  user_email TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  is_designated BOOLEAN DEFAULT false,
  platform TEXT,
  app_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT backup_machine_org_id_machine_id_key UNIQUE (org_id, machine_id)
);

CREATE INDEX backup_machine_org_id_idx ON backup_machine (org_id);
CREATE INDEX backup_machine_last_seen_at_idx ON backup_machine (last_seen_at);

ALTER TABLE backup_machine ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_machine REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE backup_machine;

CREATE TABLE backup_lock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL UNIQUE REFERENCES organization(id) ON DELETE CASCADE,
  locked_by_machine_id TEXT NOT NULL,
  locked_by_machine_name TEXT NOT NULL,
  locked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  backup_history_id UUID REFERENCES backup_history(id) ON DELETE CASCADE
);

CREATE INDEX backup_lock_org_id_idx ON backup_lock (org_id);
CREATE INDEX backup_lock_expires_at_idx ON backup_lock (expires_at);

ALTER TABLE backup_lock ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- ITEM IMAGES (Item Browser per-item visual override)
-- ===========================================

-- Per-item (part_number) image override, shared org-wide. The absence of a row
-- means the item falls back to the default SolidWorks preview.
CREATE TABLE item_image (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  image_type TEXT DEFAULT 'preview'::text NOT NULL CHECK ((image_type = ANY (ARRAY['preview'::text, 'icon'::text, 'image'::text]))),
  icon_name TEXT,
  icon_color TEXT,
  image_storage_path TEXT,
  updated_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT item_image_org_id_part_number_key UNIQUE (org_id, part_number)
);

CREATE INDEX item_image_org_id_idx ON item_image (org_id);

ALTER TABLE item_image ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- ITEM DESIGNATIONS (Item Browser part/assembly classification)
-- ===========================================

-- Org-configurable list of item designations (e.g. Part, Assembly, Packed
-- Assembly). Admins manage the list from Settings; every org is seeded with a
-- default set on first read (see item_designation_list).
CREATE TABLE item_designation (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id)
);

CREATE INDEX item_designation_org_id_idx ON item_designation (org_id);
CREATE UNIQUE INDEX item_designation_org_id_name_idx ON item_designation (org_id, lower(name));

ALTER TABLE item_designation ENABLE ROW LEVEL SECURITY;

-- Per-item designation assignment (override of the type-derived default),
-- keyed by vault + part number. Absence of a row means the default applies.
CREATE TABLE item_designation_assignment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  vault_id UUID NOT NULL REFERENCES vault(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  designation_id UUID NOT NULL REFERENCES item_designation(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT item_designation_assignment_org_id_vault_id_part_number_key UNIQUE (org_id, vault_id, part_number)
);

CREATE INDEX item_designation_assignment_org_id_vault_id_idx ON item_designation_assignment (org_id, vault_id);

ALTER TABLE item_designation_assignment ENABLE ROW LEVEL SECURITY;


-- ===========================================
-- ADDITIONS TO TABLES OF EARLIER FILES
-- ===========================================

-- Added to organization (core.sql) by this module.
ALTER TABLE organization ADD COLUMN revision_scheme revision_scheme DEFAULT 'letter'::revision_scheme;
ALTER TABLE organization ADD COLUMN serialization_settings JSONB DEFAULT '{"prefix": "PN-", "suffix": "", "enabled": true, "letter_count": 0, "keepout_zones": [], "letter_prefix": "", "padding_digits": 5, "current_counter": 0, "auto_apply_extensions": [], "use_letters_before_numbers": false}'::jsonb;
ALTER TABLE organization ADD COLUMN item_definition_settings JSONB DEFAULT '{"anyType": true, "anyStage": true, "fileTypes": [], "matchOrgFormat": true, "workflowStageIds": [], "requirePartNumber": true}'::jsonb;

-- Added to team_reviewer (core.sql) by this module.
ALTER TABLE team_reviewer ADD CONSTRAINT team_reviewer_workflow_role_id_fkey
  FOREIGN KEY (workflow_role_id) REFERENCES workflow_role(id) ON DELETE CASCADE;

-- Added to team_permission (core.sql) by this module.
ALTER TABLE team_permission ADD CONSTRAINT team_permission_vault_id_fkey
  FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE CASCADE;

-- Added to user_permission (core.sql) by this module.
ALTER TABLE user_permission ADD CONSTRAINT user_permission_vault_id_fkey
  FOREIGN KEY (vault_id) REFERENCES vault(id) ON DELETE CASCADE;

-- ===========================================
-- FUNCTIONS, VIEWS, TRIGGERS AND POLICIES
-- ===========================================

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

-- ===========================================
-- PRIVILEGES
-- ===========================================

-- Written out in full rather than left to the platform's default privileges, so a
-- fresh database and an upgraded one hold the same grants. anon holds nothing
-- here except what anon_get_read_allowlist() and anon_get_execute_allowlist() name.
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
