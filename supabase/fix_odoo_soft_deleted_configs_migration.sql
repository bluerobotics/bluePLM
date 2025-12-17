-- Migration: Fix Odoo saved configs - remove soft deletes entirely
-- Run this in your Supabase SQL editor

-- 1. Hard delete any soft-deleted configs (they're blocking name reuse)
DELETE FROM odoo_saved_configs WHERE is_active = false;

-- 2. Done! The table already has UNIQUE(org_id, name) which is correct
--    API will be updated to hard delete going forward

-- Verification: Show remaining configs
SELECT id, name, org_id, is_active FROM odoo_saved_configs ORDER BY name;

