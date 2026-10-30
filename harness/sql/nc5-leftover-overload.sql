-- Negative control for the leftover-overload case: a previous release's version
-- of a function, with a different argument list, left behind because a release
-- dropped it by exact signature. PostgREST chooses an overload by the argument
-- names in the request body, so a client can ask for the old one on purpose.
-- The function must be one the release manifest names (5.0 dropped the 4.x
-- extension_config_get this control used to overload).
CREATE OR REPLACE FUNCTION org_get_google_drive_settings(p_org_id UUID, p_legacy BOOLEAN)
RETURNS JSONB AS $$
BEGIN
  PERFORM org_require_member(p_org_id);
  RETURN (SELECT jsonb_build_object('client_secret', google_drive_client_secret)
            FROM organization WHERE id = p_org_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
