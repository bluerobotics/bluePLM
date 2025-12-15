-- Module configuration defaults for organizations
-- This migration adds org-level module default settings

-- Add module_defaults column to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS module_defaults JSONB DEFAULT NULL;

-- Comment explaining the structure
COMMENT ON COLUMN organizations.module_defaults IS 'Default module configuration for the organization. Structure: { enabled_modules: Record<string, boolean>, enabled_groups: Record<string, boolean>, module_order: string[], dividers: { id: string, afterGroup: string, enabled: boolean }[] }';

-- Function to get org module defaults
CREATE OR REPLACE FUNCTION get_org_module_defaults(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT module_defaults INTO result
  FROM organizations
  WHERE id = p_org_id;
  
  RETURN result;
END;
$$;

-- Function to set org module defaults (admin only)
CREATE OR REPLACE FUNCTION set_org_module_defaults(
  p_org_id UUID,
  p_enabled_modules JSONB,
  p_enabled_groups JSONB,
  p_module_order JSONB,
  p_dividers JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Check if user is admin of the organization
  SELECT role INTO user_role
  FROM organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid();
  
  IF user_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can set organization module defaults';
  END IF;
  
  -- Update the module defaults
  UPDATE organizations
  SET module_defaults = jsonb_build_object(
    'enabled_modules', p_enabled_modules,
    'enabled_groups', p_enabled_groups,
    'module_order', p_module_order,
    'dividers', p_dividers
  ),
  updated_at = NOW()
  WHERE id = p_org_id;
  
  RETURN TRUE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_org_module_defaults(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_org_module_defaults(UUID, JSONB, JSONB, JSONB, JSONB) TO authenticated;

