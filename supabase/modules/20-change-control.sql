-- =====================================================================
-- BluePLM Change Control Module (5.0 baseline)
-- =====================================================================
-- ECOs, drawing reviews (packages, rounds, responses, decisions),
-- deviations, process templates, ECO checklists and gate approvals.
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

CREATE TYPE eco_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
CREATE TYPE deviation_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'closed', 'expired');
CREATE TYPE checklist_item_status AS ENUM ('not_started', 'in_progress', 'complete', 'blocked', 'na');

-- ===========================================
-- TABLES
-- ===========================================

-- ===========================================
-- ECOs (Engineering Change Orders)
-- ===========================================
CREATE TABLE eco (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- ECO identity
  eco_number TEXT NOT NULL,
  title TEXT,
  description TEXT,
  -- Status
  status eco_status DEFAULT 'open'::eco_status,
  -- Process template (optional - for phase-gate tracking)
  process_template_id UUID,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  completed_at TIMESTAMPTZ,
  -- Custom properties
  custom_properties JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT eco_org_id_eco_number_key UNIQUE (org_id, eco_number)
);

-- ===========================================
-- RLS POLICIES
-- ===========================================

-- ===========================================
-- REALTIME
-- ===========================================

-- ===========================================
-- COMMENTS
-- ===========================================

CREATE INDEX eco_org_id_idx ON eco (org_id);
CREATE INDEX eco_eco_number_idx ON eco (eco_number);
CREATE INDEX eco_status_idx ON eco (status);
CREATE INDEX eco_created_at_idx ON eco (created_at DESC);
CREATE INDEX eco_process_template_id_idx ON eco (process_template_id);

COMMENT ON TABLE eco IS 'Engineering Change Orders for tracking changes to files/products';
ALTER TABLE eco ENABLE ROW LEVEL SECURITY;
ALTER TABLE eco REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE eco;

-- ===========================================
-- FILE-ECO ASSOCIATIONS
-- ===========================================
CREATE TABLE file_eco (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  eco_id UUID NOT NULL REFERENCES eco(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES app_user(id),
  notes TEXT,
  CONSTRAINT file_eco_file_id_eco_id_key UNIQUE (file_id, eco_id)
);

CREATE INDEX file_eco_file_id_idx ON file_eco (file_id);
CREATE INDEX file_eco_eco_id_idx ON file_eco (eco_id);

COMMENT ON TABLE file_eco IS 'Links files to ECOs';
ALTER TABLE file_eco ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- REVIEWS (review packages, schema 107)
-- ===========================================
-- A review is a package of items, each a file pinned to a file_version row. It
-- runs in rounds; in each round every assigned reviewer decides every item they
-- owe (mode 'all'), or the first decision on an item stands (mode 'any').
--
--   reviews             the package: requester, title, message, priority, due
--                       date, mode, current round, outcome (status)
--   review_item        one per file in the package, at its current version
--   review_round       one per round; review_resubmit() opens the next
--   review_round_item  the version each item was reviewed at in each round,
--                       and its outcome there; approved items carry forward
--   review_response    one per reviewer per round (the assignment)
--   review_decision    one per reviewer per item per round; never edited
--
-- Every write goes through the SECURITY DEFINER RPCs below, which lock the review
-- row and write notifications in the same transaction. Client policies are
-- SELECT-only. review.status keeps the review_status enum: 'pending' is open,
-- 'kicked_back' is changes requested; the RPCs report these as 'open' and
-- 'changes_requested'.
--
-- review.file_id and review.file_version are the pre-107 single-file columns.
-- Existing rows were migrated into one-item packages (see the end of this
-- section); nothing writes these columns any more.
CREATE TABLE review (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  file_id UUID REFERENCES file(id) ON DELETE CASCADE,
  vault_id UUID REFERENCES vault(id) ON DELETE SET NULL,
  -- Request info
  requested_by UUID NOT NULL REFERENCES app_user(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT,
  message TEXT,
  file_version INTEGER,
  -- Status
  status review_status DEFAULT 'pending'::review_status NOT NULL,
  completed_at TIMESTAMPTZ,
  -- Scheduling: a calendar date, so it cannot shift with the reader's time zone
  due_date DATE,
  priority TEXT DEFAULT 'normal'::text NOT NULL CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
  -- Team that was selected when requesting the review
  team_id UUID REFERENCES team(id) ON DELETE SET NULL,
  -- Completion rule and rounds (schema 107)
  mode TEXT DEFAULT 'all'::text NOT NULL CHECK ((mode = ANY (ARRAY['all'::text, 'any'::text]))),
  current_round INTEGER DEFAULT 1 NOT NULL CHECK ((current_round >= 1)),
  cancelled_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- The single-file columns become nullable legacy columns.

CREATE INDEX review_org_id_idx ON review (org_id);
CREATE INDEX review_file_id_idx ON review (file_id);
CREATE INDEX review_requested_by_idx ON review (requested_by);
CREATE INDEX review_status_idx ON review (status);
CREATE INDEX review_created_at_idx ON review (created_at DESC);
CREATE INDEX review_due_date_idx ON review (due_date) WHERE (due_date IS NOT NULL);
CREATE INDEX review_priority_idx ON review (priority);
CREATE INDEX review_team_id_idx ON review (team_id) WHERE (team_id IS NOT NULL);
CREATE INDEX review_org_id_status_idx ON review (org_id, status);

COMMENT ON TABLE review IS 'Review packages: a set of file versions reviewed in rounds';
ALTER TABLE review ENABLE ROW LEVEL SECURITY;
ALTER TABLE review REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE review;

-- ===========================================
-- REVIEW ITEMS
-- ===========================================
-- One per file in a package. file_version_id is the version under review in the
-- current round; the version of every earlier round is in review_round_item.
-- outcome is the item's outcome in the latest round that decided it.
CREATE TABLE review_item (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES review(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  vault_id UUID REFERENCES vault(id) ON DELETE SET NULL,
  file_version_id UUID NOT NULL REFERENCES file_version(id) ON DELETE CASCADE,
  outcome TEXT DEFAULT 'pending'::text NOT NULL CHECK ((outcome = ANY (ARRAY['pending'::text, 'approved'::text, 'changes_requested'::text, 'rejected'::text]))),
  sort_order INTEGER DEFAULT 0 NOT NULL,
  added_in_round INTEGER DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  advanced_at TIMESTAMPTZ,
  advanced_to_state_id UUID REFERENCES workflow_state(id) ON DELETE SET NULL,
  CONSTRAINT review_item_review_id_file_id_key UNIQUE (review_id, file_id)
);

-- Schema 110: when an approved review moved the item's file out of its review
-- stage, and to which state.

CREATE INDEX review_item_review_id_sort_order_idx ON review_item (review_id, sort_order);
CREATE INDEX review_item_file_id_idx ON review_item (file_id);
CREATE INDEX review_item_file_version_id_idx ON review_item (file_version_id);

COMMENT ON TABLE review_item IS 'Files in a review package, each pinned to a file version';
ALTER TABLE review_item ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- REVIEW ROUNDS
-- ===========================================
CREATE TABLE review_round (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES review(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK ((round_number >= 1)),
  opened_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  note TEXT,
  closed_at TIMESTAMPTZ,
  outcome TEXT CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY['approved'::text, 'changes_requested'::text, 'rejected'::text, 'cancelled'::text])))),
  CONSTRAINT review_round_review_id_round_number_key UNIQUE (review_id, round_number)
);

COMMENT ON TABLE review_round IS 'Rounds of a review package; review_resubmit opens the next';
ALTER TABLE review_round ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- REVIEW ROUND ITEMS
-- ===========================================
-- The version each item was reviewed at in each round. is_carried_forward = an item
-- approved in an earlier round and not re-reviewed in this one.
CREATE TABLE review_round_item (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES review(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES review_item(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK ((round_number >= 1)),
  file_version_id UUID NOT NULL REFERENCES file_version(id) ON DELETE CASCADE,
  is_carried_forward BOOLEAN DEFAULT false NOT NULL,
  outcome TEXT DEFAULT 'pending'::text NOT NULL CHECK ((outcome = ANY (ARRAY['pending'::text, 'approved'::text, 'changes_requested'::text, 'rejected'::text]))),
  decided_at TIMESTAMPTZ,
  CONSTRAINT review_round_item_item_id_round_number_key UNIQUE (item_id, round_number)
);

CREATE INDEX review_round_item_review_id_round_number_idx ON review_round_item (review_id, round_number);

COMMENT ON TABLE review_round_item IS 'The version each item was reviewed at in each round, and its outcome there';
ALTER TABLE review_round_item ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- REVIEW RESPONSES (one per reviewer per round)
-- ===========================================
-- The assignment. status summarises the reviewer's round: 'pending' while they
-- owe a decision, then 'approved', 'kicked_back' (requested changes on something)
-- or 'rejected' (rejected something); 'cancelled' when the round or the review
-- ended without needing them. Their per-item decisions are in review_decision.
CREATE TABLE review_response (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES review(id) ON DELETE CASCADE,
  round_number INTEGER DEFAULT 1 NOT NULL,
  reviewer_id UUID NOT NULL REFERENCES app_user(id),
  via_team_id UUID REFERENCES team(id) ON DELETE SET NULL,
  status review_status DEFAULT 'pending'::review_status NOT NULL,
  comment TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ,
  withdrawn_reason TEXT CHECK (((withdrawn_reason IS NULL) OR (withdrawn_reason = ANY (ARRAY['left_org'::text, 'lost_vault_access'::text])))),
  CONSTRAINT review_response_review_id_round_number_reviewer_id_key UNIQUE (review_id, round_number, reviewer_id)
);

-- Schema 108: a reviewer withdrawn from an open round because they left the
-- organization or can no longer see a vault the round's items are in
-- (review_withdraw_lost_reviewers()). A withdrawn reviewer no longer owes
-- anything and no longer counts toward a mode 'all' round; decisions they made
-- before stay as recorded.

CREATE INDEX review_response_review_id_idx ON review_response (review_id);
CREATE INDEX review_response_reviewer_id_idx ON review_response (reviewer_id);
CREATE INDEX review_response_status_idx ON review_response (status);
CREATE INDEX review_response_review_id_round_number_idx ON review_response (review_id, round_number);

COMMENT ON TABLE review_response IS 'One row per reviewer per round: the assignment and its summary';
ALTER TABLE review_response ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- REVIEW DECISIONS
-- ===========================================
-- One reviewer's decision on one item in one round. A comment is required for
-- every decision except a plain approval. Never updated or deleted; a later round
-- adds new rows. legacy marks rows migrated from pre-107 review_response, which
-- could carry a rejection with no comment.
CREATE TABLE review_decision (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES review(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES review_item(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK ((round_number >= 1)),
  reviewer_id UUID NOT NULL REFERENCES app_user(id),
  decision TEXT NOT NULL CHECK ((decision = ANY (ARRAY['approved'::text, 'approved_with_comments'::text, 'changes_requested'::text, 'rejected'::text]))),
  comment TEXT,
  decided_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  is_legacy BOOLEAN DEFAULT false NOT NULL,
  CONSTRAINT review_decision_comment_check CHECK ((is_legacy OR (decision = 'approved'::text) OR (length(btrim(COALESCE(comment, ''::text))) > 0))),
  CONSTRAINT review_decision_item_id_round_number_reviewer_id_key UNIQUE (item_id, round_number, reviewer_id)
);

CREATE INDEX review_decision_review_id_round_number_idx ON review_decision (review_id, round_number);
CREATE INDEX review_decision_reviewer_id_idx ON review_decision (reviewer_id);

COMMENT ON TABLE review_decision IS 'Per-item, per-reviewer, per-round decisions; never edited';
ALTER TABLE review_decision ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- DEVIATIONS
-- ===========================================
CREATE TABLE deviation (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Deviation identity
  deviation_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  -- Status and approval
  status deviation_status DEFAULT 'draft'::deviation_status,
  approved_by UUID REFERENCES app_user(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  -- Validity period
  effective_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  -- Scope/Impact
  affected_part_numbers TEXT[],
  deviation_type TEXT,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  -- Custom properties
  custom_properties JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT deviation_org_id_deviation_number_key UNIQUE (org_id, deviation_number)
);

CREATE INDEX deviation_org_id_idx ON deviation (org_id);
CREATE INDEX deviation_deviation_number_idx ON deviation (deviation_number);
CREATE INDEX deviation_status_idx ON deviation (status);
CREATE INDEX deviation_created_at_idx ON deviation (created_at DESC);
CREATE INDEX deviation_affected_part_numbers_idx ON deviation USING gin (affected_part_numbers);

COMMENT ON TABLE deviation IS 'Approved departures from specifications for files/parts';
ALTER TABLE deviation ENABLE ROW LEVEL SECURITY;
ALTER TABLE deviation REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE deviation;

-- ===========================================
-- FILE-DEVIATION ASSOCIATIONS
-- ===========================================
CREATE TABLE file_deviation (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  deviation_id UUID NOT NULL REFERENCES deviation(id) ON DELETE CASCADE,
  file_version INTEGER,
  file_revision TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES app_user(id),
  notes TEXT,
  CONSTRAINT file_deviation_file_id_deviation_id_key UNIQUE (file_id, deviation_id)
);

CREATE INDEX file_deviation_file_id_idx ON file_deviation (file_id);
CREATE INDEX file_deviation_deviation_id_idx ON file_deviation (deviation_id);

COMMENT ON TABLE file_deviation IS 'Links files to deviations with optional version/revision scope';
ALTER TABLE file_deviation ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- PROCESS TEMPLATES (Phase-Gate System for ECOs)
-- ===========================================
CREATE TABLE process_template (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT process_template_org_id_name_key UNIQUE (org_id, name)
);

CREATE INDEX process_template_org_id_idx ON process_template (org_id);

COMMENT ON TABLE process_template IS 'Templates defining phase-gate processes for ECOs';
ALTER TABLE process_template ENABLE ROW LEVEL SECURITY;

ALTER TABLE eco ADD CONSTRAINT eco_process_template_id_fkey
  FOREIGN KEY (process_template_id) REFERENCES process_template(id) ON DELETE SET NULL;

-- ===========================================
-- PROCESS TEMPLATE PHASES
-- ===========================================
CREATE TABLE process_template_phase (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES process_template(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  gate_name TEXT,
  gate_description TEXT,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX process_template_phase_template_id_idx ON process_template_phase (template_id);

COMMENT ON TABLE process_template_phase IS 'Phases within a process template';
ALTER TABLE process_template_phase ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- PROCESS TEMPLATE ITEMS (Deliverables)
-- ===========================================
CREATE TABLE process_template_item (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phase_id UUID NOT NULL REFERENCES process_template_phase(id) ON DELETE CASCADE,
  uid TEXT,
  doc_number TEXT,
  name TEXT NOT NULL,
  description TEXT,
  is_required_for_gate BOOLEAN DEFAULT false,
  default_accountable TEXT,
  default_responsible TEXT,
  default_consulted TEXT,
  default_informed TEXT,
  default_duration_days INTEGER,
  default_offset_days INTEGER,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX process_template_item_phase_id_idx ON process_template_item (phase_id);

COMMENT ON TABLE process_template_item IS 'Deliverable items (checklist) within a phase';
ALTER TABLE process_template_item ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- ECO CHECKLIST ITEMS (Instantiated from template)
-- ===========================================
CREATE TABLE eco_checklist_item (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  eco_id UUID NOT NULL REFERENCES eco(id) ON DELETE CASCADE,
  template_item_id UUID REFERENCES process_template_item(id) ON DELETE SET NULL,
  phase_name TEXT NOT NULL,
  phase_sort_order INTEGER DEFAULT 0,
  uid TEXT,
  doc_number TEXT,
  name TEXT NOT NULL,
  description TEXT,
  is_required_for_gate BOOLEAN DEFAULT false,
  gate_name TEXT,
  -- RACI assignments (user references)
  accountable_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  responsible_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  consulted_user_ids UUID[] DEFAULT '{}'::uuid[],
  informed_user_ids UUID[] DEFAULT '{}'::uuid[],
  -- RACI text (fallback/display)
  accountable_text TEXT,
  responsible_text TEXT,
  consulted_text TEXT,
  informed_text TEXT,
  -- Status tracking
  status checklist_item_status DEFAULT 'not_started'::checklist_item_status,
  target_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  -- Links
  link_url TEXT,
  link_file_id UUID REFERENCES file(id) ON DELETE SET NULL,
  notes TEXT,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id) ON DELETE SET NULL
);

CREATE INDEX eco_checklist_item_eco_id_idx ON eco_checklist_item (eco_id);
CREATE INDEX eco_checklist_item_status_idx ON eco_checklist_item (status);
CREATE INDEX eco_checklist_item_eco_id_phase_name_idx ON eco_checklist_item (eco_id, phase_name);

COMMENT ON TABLE eco_checklist_item IS 'Instantiated checklist items for a specific ECO';
ALTER TABLE eco_checklist_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE eco_checklist_item REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE eco_checklist_item;

-- ===========================================
-- ECO GATE APPROVALS
-- ===========================================
CREATE TABLE eco_gate_approval (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  eco_id UUID NOT NULL REFERENCES eco(id) ON DELETE CASCADE,
  gate_name TEXT NOT NULL,
  phase_name TEXT,
  is_approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT eco_gate_approval_eco_id_gate_name_key UNIQUE (eco_id, gate_name)
);

CREATE INDEX eco_gate_approval_eco_id_idx ON eco_gate_approval (eco_id);

COMMENT ON TABLE eco_gate_approval IS 'Gate approval tracking for ECOs';
ALTER TABLE eco_gate_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE eco_gate_approval REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE eco_gate_approval;

-- ===========================================
-- ECO CHECKLIST ACTIVITY LOG
-- ===========================================
CREATE TABLE eco_checklist_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  eco_id UUID NOT NULL REFERENCES eco(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES eco_checklist_item(id) ON DELETE SET NULL,
  gate_approval_id UUID REFERENCES eco_gate_approval(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  notes TEXT,
  performed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX eco_checklist_activity_eco_id_idx ON eco_checklist_activity (eco_id);
CREATE INDEX eco_checklist_activity_checklist_item_id_idx ON eco_checklist_activity (checklist_item_id);

COMMENT ON TABLE eco_checklist_activity IS 'Audit trail for ECO checklist changes';
ALTER TABLE eco_checklist_activity ENABLE ROW LEVEL SECURITY;


-- ===========================================
-- ADDITIONS TO TABLES OF EARLIER FILES
-- ===========================================

-- Added to file_comment (modules/10-source-files.sql) by this module.
ALTER TABLE file_comment ADD COLUMN review_id UUID;
ALTER TABLE file_comment ADD COLUMN review_round INTEGER;
ALTER TABLE file_comment ADD COLUMN review_item_id UUID;
ALTER TABLE file_comment ADD CONSTRAINT file_comment_review_id_fkey
  FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE SET NULL;
ALTER TABLE file_comment ADD CONSTRAINT file_comment_review_item_id_fkey
  FOREIGN KEY (review_item_id) REFERENCES review_item(id) ON DELETE SET NULL;
CREATE INDEX file_comment_review_id_review_round_idx ON file_comment (review_id, review_round) WHERE (review_id IS NOT NULL);
CREATE INDEX file_comment_review_item_id_idx ON file_comment (review_item_id) WHERE (review_item_id IS NOT NULL);

-- ===========================================
-- FUNCTIONS, VIEWS, TRIGGERS AND POLICIES
-- ===========================================

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

-- ===========================================
-- PRIVILEGES
-- ===========================================

-- Written out in full rather than left to the platform's default privileges, so a
-- fresh database and an upgraded one hold the same grants. anon holds nothing
-- here except what anon_get_read_allowlist() and anon_get_execute_allowlist() name.
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
