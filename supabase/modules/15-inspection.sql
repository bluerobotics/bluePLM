-- =====================================================================
-- BluePLM Inspection Module (5.0 baseline)
-- =====================================================================
-- Inspection characteristics (native ballooning) and inspection methods.
-- Required: file_checkin() in module 10 reads these tables.
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
-- TABLES
-- ===========================================

-- ===========================================
-- INSPECTION CHARACTERISTICS (live / working set)
-- ===========================================
-- One row per inspection characteristic for the current head of a drawing file.
CREATE TABLE inspection_characteristic (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  -- Ordering within the table
  sort_order INTEGER DEFAULT 0 NOT NULL,
  -- Balloon / characteristic identity
  -- Char # / balloon reference (e.g. "1", "2")
  balloon_number TEXT,
  -- Optional sub-identifier
  char_id TEXT,
  -- Char zone (e.g. "A2")
  zone TEXT,
  -- Characteristic classification
  -- Dimension, GTOL, Note, etc.
  char_type TEXT,
  -- e.g. Profile, Diameter
  sub_type TEXT,
  -- Nominal value and tolerances
  -- Nominal/spec value (free text to preserve symbols)
  nominal_value TEXT,
  unit TEXT,
  plus_tolerance TEXT,
  minus_tolerance TEXT,
  upper_limit TEXT,
  lower_limit TEXT,
  -- Inspection planning (PLM-specific)
  -- Criticality: Critical / Major / Minor / Incidental
  classification TEXT,
  inspection_method TEXT,
  operation TEXT,
  aql TEXT,
  sample_size INTEGER,
  -- Percentage 0-100
  supplier_inspection_rate NUMERIC,
  -- Percentage 0-100
  internal_inspection_rate NUMERIC,
  reference TEXT,
  comments TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  source_key TEXT,
  source_sheet TEXT,
  source_view TEXT
);

-- ===========================================
-- DRAWING SOURCE BINDING (schema 103)
-- ===========================================
-- Binds a row to the drawing annotation it was extracted from (native extraction through
-- the SOLIDWORKS API, no Inspection add-in). source_key is a stable hash of the
-- annotation's persist reference; source_sheet / source_view are for display only.
-- NULL on manual rows and on rows imported before 103. Snapshots copy all three
-- (file_checkin in 10-source-files.sql). They are not part of inspection_hash: see the
-- comment there.

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

-- ===========================================
-- REALTIME
-- ===========================================

CREATE INDEX inspection_characteristic_file_id_idx ON inspection_characteristic (file_id);
CREATE INDEX inspection_characteristic_org_id_idx ON inspection_characteristic (org_id);

ALTER TABLE inspection_characteristic ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_characteristic REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE inspection_characteristic;

-- ===========================================
-- INSPECTION CHARACTERISTIC VERSIONS (immutable snapshots)
-- ===========================================
-- A copy of the live rows captured each time the parent file version increments.
CREATE TABLE inspection_characteristic_version (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_version_id UUID NOT NULL REFERENCES file_version(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  balloon_number TEXT,
  char_id TEXT,
  zone TEXT,
  char_type TEXT,
  sub_type TEXT,
  nominal_value TEXT,
  unit TEXT,
  plus_tolerance TEXT,
  minus_tolerance TEXT,
  upper_limit TEXT,
  lower_limit TEXT,
  classification TEXT,
  inspection_method TEXT,
  operation TEXT,
  aql TEXT,
  sample_size INTEGER,
  supplier_inspection_rate NUMERIC,
  internal_inspection_rate NUMERIC,
  reference TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source_key TEXT,
  source_sheet TEXT,
  source_view TEXT
);

CREATE INDEX inspection_characteristic_version_file_version_id_idx ON inspection_characteristic_version (file_version_id);
CREATE INDEX inspection_characteristic_version_org_id_idx ON inspection_characteristic_version (org_id);

ALTER TABLE inspection_characteristic_version ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- INSPECTION METHODS (org-level custom list)
-- ===========================================
-- Reusable inspection method names (e.g. "Visual", "Calipers", "CMM") that an org
-- can extend. Built-in defaults live in the app; this table stores org additions so
-- they're shared across users and persist. The Method column in the inspection table
-- merges these with the app defaults.
CREATE TABLE inspection_method (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  CONSTRAINT inspection_method_org_id_name_key UNIQUE (org_id, name)
);

CREATE INDEX inspection_method_org_id_idx ON inspection_method (org_id);

ALTER TABLE inspection_method ENABLE ROW LEVEL SECURITY;


-- ===========================================
-- FUNCTIONS, VIEWS, TRIGGERS AND POLICIES
-- ===========================================

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

-- ===========================================
-- PRIVILEGES
-- ===========================================

-- Written out in full rather than left to the platform's default privileges, so a
-- fresh database and an upgraded one hold the same grants. anon holds nothing
-- here except what anon_get_read_allowlist() and anon_get_execute_allowlist() name.
REVOKE ALL ON TABLE inspection_characteristic, inspection_characteristic_version, inspection_method FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE inspection_characteristic, inspection_characteristic_version, inspection_method TO authenticated, service_role;

SELECT anon_enforce_execute_posture();
