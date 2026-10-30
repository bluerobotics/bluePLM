-- Negative control for finding 3: restore file_share_link_create to the shape
-- that shipped - org_require_member(p_org_id), then insert p_file_id without
-- ever asking whose file it is.
CREATE OR REPLACE FUNCTION file_share_link_create(
  p_org_id UUID,
  p_file_id UUID,
  p_created_by UUID DEFAULT NULL,
  p_expires_in_days INTEGER DEFAULT 7,
  p_max_downloads INTEGER DEFAULT NULL,
  p_require_auth BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (link_id UUID, token TEXT, expires_at TIMESTAMPTZ) AS $$
DECLARE
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_link_id UUID;
BEGIN
  PERFORM org_require_member(p_org_id);

  v_token := file_share_link_generate_token();
  v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;

  INSERT INTO file_share_link (org_id, file_id, token, created_by, expires_at, max_downloads, is_auth_required)
  VALUES (p_org_id, p_file_id, v_token, p_created_by, v_expires_at, p_max_downloads, p_require_auth)
  RETURNING id INTO v_link_id;

  RETURN QUERY SELECT v_link_id, v_token, v_expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION file_share_link_create(UUID, UUID, UUID, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION file_share_link_create(UUID, UUID, UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;
