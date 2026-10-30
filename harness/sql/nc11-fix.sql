-- The second id resolved through the organization the first one established.
CREATE OR REPLACE FUNCTION nc_two_entity_ids(p_file_id UUID, p_transition_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id UUID;
  v_name TEXT;
BEGIN
  v_org_id := file_require_access(p_file_id);

  SELECT wt.name INTO v_name
  FROM workflow_transition wt
  JOIN workflow_template wtpl ON wtpl.id = wt.workflow_id
  WHERE wt.id = p_transition_id AND wtpl.org_id = v_org_id;

  RETURN COALESCE(v_name, 'not found');
END;
$$;
