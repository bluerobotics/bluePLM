-- =====================================================================
-- BluePLM Supply Chain Module (5.0 baseline)
-- =====================================================================
-- Organization addresses, suppliers and contacts, part pricing, RFQs.
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

CREATE TYPE rfq_status AS ENUM ('draft', 'pending_files', 'generating', 'ready', 'sent', 'awaiting_quote', 'quoted', 'awarded', 'cancelled', 'completed');
CREATE TYPE supplier_auth_method AS ENUM ('email', 'phone', 'wechat');
CREATE TYPE address_type AS ENUM ('billing', 'shipping');

-- ===========================================
-- TABLES
-- ===========================================

-- ===========================================
-- ORGANIZATION ADDRESSES
-- ===========================================
-- Billing and shipping addresses for organizations (used by RFQs)
CREATE TABLE org_address (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  address_type address_type NOT NULL,
  label TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  company_name TEXT,
  contact_name TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'USA'::text,
  attention_to TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT org_address_attention_to_check CHECK (((address_type <> 'billing'::address_type) OR (attention_to IS NULL)))
);

-- RLS for org_address

-- ===========================================
-- COMMENTS
-- ===========================================

CREATE INDEX org_address_org_id_idx ON org_address (org_id);
CREATE INDEX org_address_org_id_address_type_idx ON org_address (org_id, address_type);

COMMENT ON TABLE org_address IS 'Billing and shipping addresses for organizations';
ALTER TABLE org_address ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- RFQ SETTINGS MIGRATION
-- ===========================================
-- Add rfq_settings column to organizations (managed by supply-chain module)

-- ===========================================
-- SUPPLIERS
-- ===========================================
CREATE TABLE supplier (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Basic info
  name TEXT NOT NULL,
  code TEXT,
  -- Contact info
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'USA'::text,
  -- Business terms
  payment_terms TEXT,
  default_lead_time_days INTEGER,
  min_order_value NUMERIC(12,2),
  currency TEXT DEFAULT 'USD'::text,
  shipping_account TEXT,
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES app_user(id),
  -- Notes
  notes TEXT,
  -- ERP sync
  erp_id TEXT,
  erp_synced_at TIMESTAMPTZ,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  CONSTRAINT supplier_org_id_code_key UNIQUE (org_id, code)
);

-- ===========================================
-- RLS POLICIES
-- ===========================================

-- ===========================================
-- REALTIME
-- ===========================================

CREATE INDEX supplier_org_id_idx ON supplier (org_id);
CREATE INDEX supplier_name_idx ON supplier (name);
CREATE INDEX supplier_code_idx ON supplier (code);
CREATE INDEX supplier_is_active_idx ON supplier (is_active);
CREATE INDEX supplier_erp_id_idx ON supplier (erp_id) WHERE (erp_id IS NOT NULL);
CREATE INDEX supplier_search_idx ON supplier USING gin (to_tsvector('simple'::regconfig, ((((COALESCE(name, ''::text) || ' '::text) || COALESCE(code, ''::text)) || ' '::text) || COALESCE(notes, ''::text))));

COMMENT ON TABLE supplier IS 'Vendor/supplier companies';
ALTER TABLE supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE supplier;

-- ===========================================
-- SUPPLIER CONTACTS (Portal Users)
-- ===========================================
CREATE TABLE supplier_contact (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  -- Contact info
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  phone_country_code TEXT,
  full_name TEXT NOT NULL,
  job_title TEXT,
  avatar_url TEXT,
  -- Auth configuration
  auth_method supplier_auth_method DEFAULT 'email'::supplier_auth_method,
  wechat_openid TEXT UNIQUE,
  -- Status
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  is_email_verified BOOLEAN DEFAULT false,
  is_phone_verified BOOLEAN DEFAULT false,
  -- Portal access permissions
  can_view_rfqs BOOLEAN DEFAULT true,
  can_submit_quotes BOOLEAN DEFAULT true,
  can_view_orders BOOLEAN DEFAULT true,
  can_update_pricing BOOLEAN DEFAULT true,
  can_manage_catalog BOOLEAN DEFAULT true,
  -- Last activity
  last_sign_in_at TIMESTAMPTZ,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX supplier_contact_supplier_id_idx ON supplier_contact (supplier_id);
CREATE INDEX supplier_contact_email_idx ON supplier_contact (email) WHERE (email IS NOT NULL);
CREATE INDEX supplier_contact_phone_idx ON supplier_contact (phone) WHERE (phone IS NOT NULL);
CREATE INDEX supplier_contact_auth_user_id_idx ON supplier_contact (auth_user_id) WHERE (auth_user_id IS NOT NULL);

COMMENT ON TABLE supplier_contact IS 'Portal users who work at supplier companies';
ALTER TABLE supplier_contact ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- SUPPLIER INVITATIONS
-- ===========================================
CREATE TABLE supplier_invitation (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  -- Invitation details
  email TEXT,
  phone TEXT,
  full_name TEXT NOT NULL,
  -- Invitation tracking
  invited_by UUID REFERENCES app_user(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  -- Status
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX supplier_invitation_org_id_idx ON supplier_invitation (org_id);
CREATE INDEX supplier_invitation_supplier_id_idx ON supplier_invitation (supplier_id);
CREATE INDEX supplier_invitation_token_idx ON supplier_invitation (token);

COMMENT ON TABLE supplier_invitation IS 'Invitations sent to suppliers to join the portal';
ALTER TABLE supplier_invitation ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- PART-SUPPLIER ASSOCIATIONS (with pricing)
-- ===========================================
CREATE TABLE part_supplier (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES file(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  -- Supplier's part info
  supplier_part_number TEXT,
  supplier_description TEXT,
  supplier_url TEXT,
  -- Pricing
  unit_price NUMERIC(12,4),
  currency TEXT DEFAULT 'USD'::text,
  price_unit TEXT DEFAULT 'each'::text,
  price_breaks JSONB DEFAULT '[]'::jsonb,
  -- Ordering constraints
  min_order_qty INTEGER DEFAULT 1,
  order_multiple INTEGER DEFAULT 1,
  lead_time_days INTEGER,
  -- Status
  is_preferred BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  -- Quality/compliance
  is_qualified BOOLEAN DEFAULT false,
  qualified_at TIMESTAMPTZ,
  qualified_by UUID REFERENCES app_user(id),
  -- Notes
  notes TEXT,
  -- ERP sync
  erp_id TEXT,
  erp_synced_at TIMESTAMPTZ,
  -- Metadata
  price_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  CONSTRAINT part_supplier_file_id_supplier_id_key UNIQUE (file_id, supplier_id)
);

CREATE INDEX part_supplier_org_id_idx ON part_supplier (org_id);
CREATE INDEX part_supplier_file_id_idx ON part_supplier (file_id);
CREATE INDEX part_supplier_supplier_id_idx ON part_supplier (supplier_id);
CREATE INDEX part_supplier_is_preferred_idx ON part_supplier (is_preferred) WHERE (is_preferred = true);
CREATE INDEX part_supplier_supplier_part_number_idx ON part_supplier (supplier_part_number) WHERE (supplier_part_number IS NOT NULL);

COMMENT ON TABLE part_supplier IS 'Links parts to suppliers with pricing information';
ALTER TABLE part_supplier ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- RFQs (Request for Quote)
-- ===========================================
CREATE TABLE rfq (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- RFQ identity
  rfq_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  -- Status
  status rfq_status DEFAULT 'draft'::rfq_status NOT NULL,
  -- Dates
  due_date DATE,
  required_date DATE,
  valid_until DATE,
  -- Options
  is_samples_required BOOLEAN DEFAULT false,
  is_first_article_required BOOLEAN DEFAULT false,
  is_quality_report_required BOOLEAN DEFAULT false,
  is_partial_quote_allowed BOOLEAN DEFAULT true,
  -- File generation
  is_release_files_generated BOOLEAN DEFAULT false,
  release_files_generated_at TIMESTAMPTZ,
  release_folder_path TEXT,
  -- Addresses
  billing_address_id UUID REFERENCES org_address(id) ON DELETE SET NULL,
  shipping_address_id UUID REFERENCES org_address(id) ON DELETE SET NULL,
  shipping_address TEXT,
  shipping_notes TEXT,
  incoterms TEXT,
  -- Notes
  internal_notes TEXT,
  supplier_notes TEXT,
  -- PDF generation
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,
  -- Awarded supplier
  awarded_supplier_id UUID REFERENCES supplier(id) ON DELETE SET NULL,
  awarded_at TIMESTAMPTZ,
  awarded_by UUID REFERENCES app_user(id),
  award_notes TEXT,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  CONSTRAINT rfq_org_id_rfq_number_key UNIQUE (org_id, rfq_number)
);

CREATE INDEX rfq_org_id_idx ON rfq (org_id);
CREATE INDEX rfq_status_idx ON rfq (status);
CREATE INDEX rfq_created_at_idx ON rfq (created_at DESC);

COMMENT ON TABLE rfq IS 'Request for Quote documents';
ALTER TABLE rfq ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE rfq;

-- ===========================================
-- RFQ NUMBER COUNTERS
-- ===========================================
-- Backs rfq_generate_number(). The counter lives in its own table rather than in
-- organization.rfq_settings because the settings screen saves that column with a
-- whole-object UPDATE, which would reset the counter and hand out RFQ numbers that
-- already exist. serialization_settings needs org_update_serialization_settings()
-- for exactly that reason; a separate table avoids the problem instead of guarding it.
CREATE TABLE rfq_number_counter (
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  last_number INTEGER DEFAULT 0 NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rfq_number_counter_pkey PRIMARY KEY (org_id, year)
);

-- rfq_number_counter is deliberately left without policies. Clients never read or
-- write it directly; rfq_generate_number() is SECURITY DEFINER and so bypasses RLS.
-- Enabling RLS with no policy is what denies every direct client access to it.

COMMENT ON TABLE rfq_number_counter IS 'Per-organization, per-year RFQ number sequence consumed by rfq_generate_number()';
ALTER TABLE rfq_number_counter ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- RFQ ITEMS
-- ===========================================
CREATE TABLE rfq_item (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rfq_id UUID NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  -- Line item
  line_number INTEGER NOT NULL,
  -- Part reference
  file_id UUID REFERENCES file(id) ON DELETE SET NULL,
  part_number TEXT,
  description TEXT,
  revision TEXT,
  -- Quantity
  quantity INTEGER DEFAULT 1 NOT NULL,
  uom TEXT DEFAULT 'each'::text,
  -- Specifications
  material TEXT,
  finish TEXT,
  notes TEXT,
  -- Release files
  release_files_status TEXT DEFAULT 'pending'::text,
  release_files_error TEXT,
  -- Sort order
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX rfq_item_rfq_id_idx ON rfq_item (rfq_id);
CREATE INDEX rfq_item_file_id_idx ON rfq_item (file_id);

COMMENT ON TABLE rfq_item IS 'Line items within an RFQ';
ALTER TABLE rfq_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_item REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE rfq_item;

-- ===========================================
-- RFQ-SUPPLIER ASSOCIATIONS
-- ===========================================
CREATE TABLE rfq_supplier (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rfq_id UUID NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  -- Sending
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES app_user(id),
  sent_via TEXT DEFAULT 'email'::text,
  -- Response tracking
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response_status TEXT DEFAULT 'pending'::text,
  -- Contact
  contact_id UUID REFERENCES supplier_contact(id) ON DELETE SET NULL,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rfq_supplier_rfq_id_supplier_id_key UNIQUE (rfq_id, supplier_id)
);

CREATE INDEX rfq_supplier_rfq_id_idx ON rfq_supplier (rfq_id);
CREATE INDEX rfq_supplier_supplier_id_idx ON rfq_supplier (supplier_id);

COMMENT ON TABLE rfq_supplier IS 'Suppliers associated with an RFQ';
ALTER TABLE rfq_supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_supplier REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE rfq_supplier;

-- ===========================================
-- RFQ QUOTES
-- ===========================================
CREATE TABLE rfq_quote (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rfq_id UUID NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  rfq_item_id UUID NOT NULL REFERENCES rfq_item(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  -- Quote details
  unit_price NUMERIC(12,4),
  currency TEXT DEFAULT 'USD'::text,
  lead_time_days INTEGER,
  min_order_qty INTEGER,
  notes TEXT,
  -- Status
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rfq_quote_rfq_item_id_supplier_id_key UNIQUE (rfq_item_id, supplier_id)
);

CREATE INDEX rfq_quote_rfq_id_idx ON rfq_quote (rfq_id);
CREATE INDEX rfq_quote_rfq_item_id_idx ON rfq_quote (rfq_item_id);
CREATE INDEX rfq_quote_supplier_id_idx ON rfq_quote (supplier_id);

COMMENT ON TABLE rfq_quote IS 'Quotes received from suppliers for RFQ items';
ALTER TABLE rfq_quote ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- RFQ ACTIVITY LOG
-- ===========================================
CREATE TABLE rfq_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rfq_id UUID NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  -- Activity details
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  -- Who/when
  performed_by UUID REFERENCES app_user(id),
  supplier_contact_id UUID REFERENCES supplier_contact(id),
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX rfq_activity_rfq_id_idx ON rfq_activity (rfq_id);
CREATE INDEX rfq_activity_performed_at_idx ON rfq_activity (performed_at DESC);

COMMENT ON TABLE rfq_activity IS 'Activity/audit log for RFQs';
ALTER TABLE rfq_activity ENABLE ROW LEVEL SECURITY;


-- ===========================================
-- ADDITIONS TO TABLES OF EARLIER FILES
-- ===========================================

-- Added to organization (core.sql) by this module.
ALTER TABLE organization ADD COLUMN rfq_settings JSONB DEFAULT '{"footer_text": "", "default_incoterms": "FOB", "show_company_logo": true, "show_notes_column": true, "default_valid_days": 30, "show_finish_column": true, "show_material_column": true, "show_revision_column": true, "terms_and_conditions": "", "default_payment_terms": "Net 30"}'::jsonb;

-- Added to release_file (modules/10-source-files.sql) by this module.
ALTER TABLE release_file ADD CONSTRAINT release_file_rfq_id_fkey
  FOREIGN KEY (rfq_id) REFERENCES rfq(id) ON DELETE SET NULL;
ALTER TABLE release_file ADD CONSTRAINT release_file_rfq_item_id_fkey
  FOREIGN KEY (rfq_item_id) REFERENCES rfq_item(id) ON DELETE SET NULL;

-- ===========================================
-- FUNCTIONS, VIEWS, TRIGGERS AND POLICIES
-- ===========================================

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

-- ===========================================
-- PRIVILEGES
-- ===========================================

-- Written out in full rather than left to the platform's default privileges, so a
-- fresh database and an upgraded one hold the same grants. anon holds nothing
-- here except what anon_get_read_allowlist() and anon_get_execute_allowlist() name.
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
