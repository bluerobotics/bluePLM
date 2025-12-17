-- Deviations Migration
-- Run this to add deviation tracking to your BluePLM database

-- ===========================================
-- DEVIATIONS SYSTEM
-- ===========================================
-- Deviations document approved departures from specifications,
-- drawings, or requirements for specific files/revisions

-- Deviation status enum
CREATE TYPE deviation_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'closed', 'expired');

-- Deviations table
CREATE TABLE deviations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Deviation identity
  deviation_number TEXT NOT NULL,           -- e.g., "DEV-001", "DVN-2024-0015"
  title TEXT NOT NULL,                      -- Short title/reason
  description TEXT,                         -- Detailed justification
  
  -- Status and approval
  status deviation_status DEFAULT 'draft',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Validity period (optional)
  effective_date TIMESTAMPTZ DEFAULT NOW(),
  expiration_date TIMESTAMPTZ,              -- NULL = no expiration
  
  -- Scope/Impact
  affected_part_numbers TEXT[],             -- Part numbers affected (for quick filtering)
  deviation_type TEXT,                      -- e.g., "Material", "Dimension", "Process", "Documentation"
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  -- Custom properties for flexibility
  custom_properties JSONB DEFAULT '{}'::jsonb,
  
  -- Unique deviation number per organization
  UNIQUE(org_id, deviation_number)
);

CREATE INDEX idx_deviations_org_id ON deviations(org_id);
CREATE INDEX idx_deviations_deviation_number ON deviations(deviation_number);
CREATE INDEX idx_deviations_status ON deviations(status);
CREATE INDEX idx_deviations_created_at ON deviations(created_at DESC);
CREATE INDEX idx_deviations_affected_parts ON deviations USING GIN (affected_part_numbers);

-- File-Deviation junction table (Many-to-Many with version tracking)
CREATE TABLE file_deviations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  deviation_id UUID NOT NULL REFERENCES deviations(id) ON DELETE CASCADE,
  
  -- Optional: specific version/revision the deviation applies to
  -- If NULL, applies to all versions
  file_version INTEGER,                     -- Specific version number (NULL = all)
  file_revision TEXT,                       -- Specific revision (NULL = all)
  
  -- When/who associated this file with the deviation
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  
  -- Notes about how this file is affected
  notes TEXT,
  
  -- Prevent duplicate file-deviation associations
  UNIQUE(file_id, deviation_id)
);

CREATE INDEX idx_file_deviations_file_id ON file_deviations(file_id);
CREATE INDEX idx_file_deviations_deviation_id ON file_deviations(deviation_id);

-- Deviation RLS
ALTER TABLE deviations ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_deviations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org deviations"
  ON deviations FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Engineers can create deviations"
  ON deviations FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer')));

CREATE POLICY "Engineers can update deviations"
  ON deviations FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer')));

CREATE POLICY "Admins can delete deviations"
  ON deviations FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can view file-deviation associations"
  ON file_deviations FOR SELECT
  USING (deviation_id IN (SELECT id FROM deviations WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid())));

CREATE POLICY "Engineers can manage file-deviation associations"
  ON file_deviations FOR ALL
  USING (deviation_id IN (SELECT id FROM deviations WHERE org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer'))));

-- Enable realtime for deviations
ALTER TABLE deviations REPLICA IDENTITY FULL;

COMMENT ON TABLE deviations IS 'Deviations document approved departures from specifications for files/parts.';
COMMENT ON TABLE file_deviations IS 'Links files to deviations, optionally with specific version/revision scope.';

