-- BluePLM RFQ (Request for Quote) Database Migration
-- Adds RFQ management for the supplier portal
-- Run this in your Supabase SQL editor AFTER suppliers_migration.sql

-- ===========================================
-- RFQ STATUS ENUM
-- ===========================================

CREATE TYPE rfq_status AS ENUM (
  'draft',           -- RFQ is being prepared
  'pending_files',   -- Files need to be added
  'generating',      -- Release files are being generated
  'ready',           -- RFQ is ready to send
  'sent',            -- RFQ has been sent to suppliers
  'awaiting_quote',  -- Waiting for supplier responses
  'quoted',          -- All quotes received
  'awarded',         -- Contract awarded to supplier
  'cancelled',       -- RFQ was cancelled
  'completed'        -- Order completed
);

-- ===========================================
-- RFQS (Request for Quote header)
-- ===========================================

CREATE TABLE rfqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- RFQ identity
  rfq_number TEXT NOT NULL,                -- e.g., "RFQ-2024-0042"
  title TEXT NOT NULL,                     -- Short description
  description TEXT,                        -- Detailed requirements
  
  -- Status tracking
  status rfq_status DEFAULT 'draft',
  
  -- Dates
  due_date DATE,                           -- When quotes are due
  required_date DATE,                      -- When parts are needed
  valid_until DATE,                        -- Quote validity period
  
  -- Options
  requires_samples BOOLEAN DEFAULT false,
  requires_first_article BOOLEAN DEFAULT false,
  requires_quality_report BOOLEAN DEFAULT false,
  allow_partial_quotes BOOLEAN DEFAULT true,
  
  -- File generation
  release_files_generated BOOLEAN DEFAULT false,
  release_files_generated_at TIMESTAMPTZ,
  release_folder_path TEXT,                -- Path where release files are stored
  
  -- Shipping/delivery
  shipping_address TEXT,
  shipping_notes TEXT,
  incoterms TEXT,                          -- e.g., "FOB", "DDP", "EXW"
  
  -- Notes
  internal_notes TEXT,                     -- Internal team notes (not shared with suppliers)
  supplier_notes TEXT,                     -- Notes visible to suppliers
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  
  UNIQUE(org_id, rfq_number)
);

CREATE INDEX idx_rfqs_org_id ON rfqs(org_id);
CREATE INDEX idx_rfqs_status ON rfqs(status);
CREATE INDEX idx_rfqs_rfq_number ON rfqs(rfq_number);
CREATE INDEX idx_rfqs_created_at ON rfqs(created_at DESC);
CREATE INDEX idx_rfqs_due_date ON rfqs(due_date);

-- ===========================================
-- RFQ ITEMS (Line items / files on the RFQ)
-- ===========================================

CREATE TABLE rfq_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  
  -- Item details
  line_number INT NOT NULL,                -- 1, 2, 3...
  
  -- Link to PDM file (optional - can be custom items too)
  file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  
  -- Item identification (can be filled from file or manually)
  part_number TEXT NOT NULL,
  description TEXT,
  revision TEXT,
  
  -- Quantity
  quantity INT NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'each',                -- 'each', 'set', 'pair', 'ft', 'm', etc.
  
  -- Material specs (optional)
  material TEXT,
  finish TEXT,
  
  -- Tolerances/specs
  tolerance_class TEXT,                    -- e.g., "ISO 2768-mK"
  special_requirements TEXT,
  
  -- SolidWorks configuration for export
  sw_configuration TEXT,                   -- Configuration to use for STEP export
  
  -- Release files (paths to generated STEP/PDF)
  step_file_path TEXT,
  pdf_file_path TEXT,
  step_file_generated BOOLEAN DEFAULT false,
  pdf_file_generated BOOLEAN DEFAULT false,
  step_file_size BIGINT,
  pdf_file_size BIGINT,
  
  -- Storage references (for cloud storage)
  step_storage_path TEXT,
  pdf_storage_path TEXT,
  
  -- Additional attachments (JSON array of {name, path, size})
  attachments JSONB DEFAULT '[]'::jsonb,
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(rfq_id, line_number)
);

CREATE INDEX idx_rfq_items_rfq_id ON rfq_items(rfq_id);
CREATE INDEX idx_rfq_items_file_id ON rfq_items(file_id) WHERE file_id IS NOT NULL;
CREATE INDEX idx_rfq_items_part_number ON rfq_items(part_number);

-- ===========================================
-- RFQ SUPPLIERS (Suppliers assigned to an RFQ)
-- ===========================================

CREATE TABLE rfq_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  
  -- Status
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  quoted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  declined_reason TEXT,
  
  -- Quote summary (for quick display)
  total_quoted_amount DECIMAL(12,2),
  currency TEXT DEFAULT 'USD',
  lead_time_days INT,
  
  -- Selection
  is_selected BOOLEAN DEFAULT false,       -- Selected for award
  selected_at TIMESTAMPTZ,
  selected_by UUID REFERENCES users(id),
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(rfq_id, supplier_id)
);

CREATE INDEX idx_rfq_suppliers_rfq_id ON rfq_suppliers(rfq_id);
CREATE INDEX idx_rfq_suppliers_supplier_id ON rfq_suppliers(supplier_id);

-- ===========================================
-- RFQ QUOTES (Line item quotes from suppliers)
-- ===========================================

CREATE TABLE rfq_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  rfq_supplier_id UUID NOT NULL REFERENCES rfq_suppliers(id) ON DELETE CASCADE,
  rfq_item_id UUID NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
  
  -- Pricing
  unit_price DECIMAL(12,4),
  currency TEXT DEFAULT 'USD',
  tooling_cost DECIMAL(12,2),              -- One-time tooling/setup cost
  
  -- Quantity breaks (optional)
  -- Format: [{"qty": 100, "price": 8.50}, {"qty": 1000, "price": 7.00}]
  price_breaks JSONB DEFAULT '[]'::jsonb,
  
  -- Lead time
  lead_time_days INT,
  
  -- Supplier's notes
  notes TEXT,
  
  -- Can they fulfill this item?
  can_quote BOOLEAN DEFAULT true,
  cannot_quote_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(rfq_supplier_id, rfq_item_id)
);

CREATE INDEX idx_rfq_quotes_rfq_id ON rfq_quotes(rfq_id);
CREATE INDEX idx_rfq_quotes_rfq_supplier_id ON rfq_quotes(rfq_supplier_id);
CREATE INDEX idx_rfq_quotes_rfq_item_id ON rfq_quotes(rfq_item_id);

-- ===========================================
-- RFQ ACTIVITY LOG
-- ===========================================

CREATE TABLE rfq_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  
  -- Activity info
  action TEXT NOT NULL,                    -- 'created', 'updated', 'sent', 'quote_received', etc.
  description TEXT,
  
  -- Actor
  user_id UUID REFERENCES users(id),
  supplier_id UUID REFERENCES suppliers(id),
  
  -- Details
  details JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rfq_activity_rfq_id ON rfq_activity(rfq_id);
CREATE INDEX idx_rfq_activity_created_at ON rfq_activity(created_at DESC);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_activity ENABLE ROW LEVEL SECURITY;

-- RFQs: All org members can view, engineers/admins can modify
CREATE POLICY "Users can view org RFQs"
  ON rfqs FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Engineers can create RFQs"
  ON rfqs FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer')));

CREATE POLICY "Engineers can update RFQs"
  ON rfqs FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer')));

CREATE POLICY "Admins can delete RFQs"
  ON rfqs FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RFQ Items: Access based on parent RFQ
CREATE POLICY "Users can view RFQ items"
  ON rfq_items FOR SELECT
  USING (rfq_id IN (SELECT id FROM rfqs WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

CREATE POLICY "Engineers can manage RFQ items"
  ON rfq_items FOR ALL
  USING (rfq_id IN (SELECT id FROM rfqs WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer'))));

-- RFQ Suppliers: Access based on parent RFQ
CREATE POLICY "Users can view RFQ suppliers"
  ON rfq_suppliers FOR SELECT
  USING (rfq_id IN (SELECT id FROM rfqs WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

CREATE POLICY "Engineers can manage RFQ suppliers"
  ON rfq_suppliers FOR ALL
  USING (rfq_id IN (SELECT id FROM rfqs WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer'))));

-- RFQ Quotes: Access based on parent RFQ
CREATE POLICY "Users can view RFQ quotes"
  ON rfq_quotes FOR SELECT
  USING (rfq_id IN (SELECT id FROM rfqs WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

CREATE POLICY "Engineers can manage RFQ quotes"
  ON rfq_quotes FOR ALL
  USING (rfq_id IN (SELECT id FROM rfqs WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer'))));

-- RFQ Activity: Read-only for org members
CREATE POLICY "Users can view RFQ activity"
  ON rfq_activity FOR SELECT
  USING (rfq_id IN (SELECT id FROM rfqs WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

CREATE POLICY "System can log RFQ activity"
  ON rfq_activity FOR INSERT
  WITH CHECK (rfq_id IN (SELECT id FROM rfqs WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Function to generate next RFQ number
CREATE OR REPLACE FUNCTION generate_rfq_number(p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_year TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  v_max_seq INT;
  v_new_seq INT;
BEGIN
  -- Get the max sequence number for this year
  SELECT COALESCE(MAX(
    CASE 
      WHEN rfq_number ~ ('^RFQ-' || v_year || '-\d{4}$')
      THEN SUBSTRING(rfq_number FROM 'RFQ-' || v_year || '-(\d{4})')::INT
      ELSE 0
    END
  ), 0)
  INTO v_max_seq
  FROM rfqs
  WHERE org_id = p_org_id;
  
  v_new_seq := v_max_seq + 1;
  
  RETURN 'RFQ-' || v_year || '-' || LPAD(v_new_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate RFQ totals
CREATE OR REPLACE FUNCTION get_rfq_summary(p_rfq_id UUID)
RETURNS TABLE (
  total_items INT,
  total_quantity INT,
  suppliers_invited INT,
  suppliers_quoted INT,
  lowest_quote DECIMAL(12,2),
  highest_quote DECIMAL(12,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INT FROM rfq_items WHERE rfq_id = p_rfq_id) as total_items,
    (SELECT COALESCE(SUM(quantity), 0)::INT FROM rfq_items WHERE rfq_id = p_rfq_id) as total_quantity,
    (SELECT COUNT(*)::INT FROM rfq_suppliers WHERE rfq_id = p_rfq_id) as suppliers_invited,
    (SELECT COUNT(*)::INT FROM rfq_suppliers WHERE rfq_id = p_rfq_id AND quoted_at IS NOT NULL) as suppliers_quoted,
    (SELECT MIN(total_quoted_amount) FROM rfq_suppliers WHERE rfq_id = p_rfq_id AND total_quoted_amount IS NOT NULL) as lowest_quote,
    (SELECT MAX(total_quoted_amount) FROM rfq_suppliers WHERE rfq_id = p_rfq_id AND total_quoted_amount IS NOT NULL) as highest_quote;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger to update RFQ timestamp
CREATE OR REPLACE FUNCTION update_rfq_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE rfqs SET updated_at = NOW() WHERE id = NEW.rfq_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_rfq_on_item_change
  AFTER INSERT OR UPDATE OR DELETE ON rfq_items
  FOR EACH ROW EXECUTE FUNCTION update_rfq_timestamp();

CREATE TRIGGER update_rfq_on_supplier_change
  AFTER INSERT OR UPDATE OR DELETE ON rfq_suppliers
  FOR EACH ROW EXECUTE FUNCTION update_rfq_timestamp();

-- ===========================================
-- ENABLE REALTIME
-- ===========================================

ALTER TABLE rfqs REPLICA IDENTITY FULL;
ALTER TABLE rfq_items REPLICA IDENTITY FULL;
ALTER TABLE rfq_suppliers REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE rfqs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE rfq_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE rfq_suppliers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ===========================================
-- USAGE EXAMPLES
-- ===========================================

/*
-- Create a new RFQ:
INSERT INTO rfqs (org_id, rfq_number, title, created_by)
VALUES (
  'your-org-id',
  (SELECT generate_rfq_number('your-org-id')),
  'CNC Machined Parts for Assembly XYZ',
  auth.uid()
);

-- Add items to RFQ:
INSERT INTO rfq_items (rfq_id, line_number, file_id, part_number, description, revision, quantity)
SELECT 
  'rfq-id',
  ROW_NUMBER() OVER (),
  f.id,
  f.part_number,
  f.description,
  f.revision,
  100  -- quantity
FROM files f
WHERE f.id = ANY(ARRAY['file-id-1', 'file-id-2']::UUID[]);

-- Invite suppliers:
INSERT INTO rfq_suppliers (rfq_id, supplier_id)
SELECT 'rfq-id', id FROM suppliers WHERE code IN ('SUPPLIER1', 'SUPPLIER2');

-- Get RFQ summary:
SELECT * FROM get_rfq_summary('rfq-id');
*/

