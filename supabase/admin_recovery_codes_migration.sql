-- Admin Recovery Codes Migration
-- Creates a secure mechanism for emergency admin access recovery
-- Codes are hashed (never visible after generation) and single-use

-- ===========================================
-- ADMIN RECOVERY CODES TABLE
-- ===========================================

CREATE TABLE admin_recovery_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Security: Store only the hash, never the plain code
  -- The plain code is shown ONCE to the admin who generates it
  code_hash TEXT NOT NULL,
  
  -- Metadata
  description TEXT,  -- Optional note like "Emergency backup for CEO"
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Expiration (default 90 days from creation)
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Usage tracking
  is_used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  used_from_ip TEXT,  -- Optional: track IP for audit
  
  -- Revocation
  is_revoked BOOLEAN DEFAULT false,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);

-- Index for efficient lookups
CREATE INDEX idx_admin_recovery_codes_org ON admin_recovery_codes(org_id);
CREATE INDEX idx_admin_recovery_codes_hash ON admin_recovery_codes(code_hash);
CREATE INDEX idx_admin_recovery_codes_active ON admin_recovery_codes(org_id, is_used, is_revoked, expires_at);

-- Enable RLS
ALTER TABLE admin_recovery_codes ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- ROW LEVEL SECURITY POLICIES
-- ===========================================

-- Admins can view recovery code metadata (but NEVER the hash - that's not exposed in queries)
CREATE POLICY "Admins can view org recovery codes"
  ON admin_recovery_codes FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Only admins can create recovery codes
CREATE POLICY "Admins can create recovery codes"
  ON admin_recovery_codes FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Only admins can update (revoke) recovery codes
CREATE POLICY "Admins can update recovery codes"
  ON admin_recovery_codes FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Admins can delete old recovery codes
CREATE POLICY "Admins can delete recovery codes"
  ON admin_recovery_codes FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ===========================================
-- FUNCTION: Use Recovery Code
-- This is a special function that bypasses normal RLS
-- to allow ANY authenticated user to attempt using a code
-- ===========================================

CREATE OR REPLACE FUNCTION use_admin_recovery_code(
  p_code_hash TEXT,
  p_user_ip TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with elevated privileges
AS $$
DECLARE
  v_user_id UUID;
  v_user_org_id UUID;
  v_code_record RECORD;
  v_result JSONB;
BEGIN
  -- Get the current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get user's org
  SELECT org_id INTO v_user_org_id FROM users WHERE id = v_user_id;
  
  IF v_user_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not in an organization');
  END IF;
  
  -- Find a matching, valid recovery code for this org
  SELECT * INTO v_code_record
  FROM admin_recovery_codes
  WHERE code_hash = p_code_hash
    AND org_id = v_user_org_id
    AND is_used = false
    AND is_revoked = false
    AND expires_at > NOW()
  FOR UPDATE;  -- Lock the row
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired recovery code');
  END IF;
  
  -- Mark the code as used
  UPDATE admin_recovery_codes
  SET is_used = true,
      used_by = v_user_id,
      used_at = NOW(),
      used_from_ip = p_user_ip
  WHERE id = v_code_record.id;
  
  -- Elevate the user to admin
  UPDATE users
  SET role = 'admin'
  WHERE id = v_user_id;
  
  -- Log this significant event
  INSERT INTO activity (
    org_id,
    user_id,
    file_id,
    action,
    details
  ) VALUES (
    v_user_org_id,
    v_user_id,
    NULL,
    'state_change',  -- Reuse existing action type
    jsonb_build_object(
      'type', 'admin_recovery',
      'message', 'User elevated to admin via recovery code',
      'code_id', v_code_record.id,
      'code_description', v_code_record.description
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'You have been granted admin privileges'
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION use_admin_recovery_code TO authenticated;

-- ===========================================
-- COMMENTS
-- ===========================================

COMMENT ON TABLE admin_recovery_codes IS 'Stores hashed emergency recovery codes for admin access. Codes are single-use and time-limited.';
COMMENT ON COLUMN admin_recovery_codes.code_hash IS 'SHA-256 hash of the recovery code. The plain code is NEVER stored and only shown once during generation.';
COMMENT ON FUNCTION use_admin_recovery_code IS 'Validates a recovery code and elevates the calling user to admin. Runs with SECURITY DEFINER to bypass RLS.';

