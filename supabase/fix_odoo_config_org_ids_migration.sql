-- Migration: Fix Odoo config visibility issues caused by org_id mismatches
-- Similar to fix_session_org_ids_migration.sql but for Odoo saved configs
-- Run this in your Supabase SQL editor

-- ===========================================
-- DIAGNOSTIC: First, let's see the current state
-- ===========================================

-- Show all Odoo configs and their org assignments
SELECT 
  osc.id as config_id,
  osc.name as config_name,
  osc.url,
  osc.org_id as config_org_id,
  o.name as org_name,
  osc.created_by,
  u.email as created_by_email,
  u.org_id as creator_org_id
FROM odoo_saved_configs osc
LEFT JOIN organizations o ON osc.org_id = o.id
LEFT JOIN users u ON osc.created_by = u.id
ORDER BY osc.created_at;

-- Show all users and their org assignments (to identify mismatches)
SELECT 
  u.id,
  u.email,
  u.role,
  u.org_id as user_org_id,
  o.name as org_name,
  SPLIT_PART(u.email, '@', 2) as email_domain
FROM users u
LEFT JOIN organizations o ON u.org_id = o.id
ORDER BY email_domain, u.email;

-- Show orgs with their email domains (to identify which users should belong where)
SELECT 
  id as org_id,
  name as org_name,
  email_domains
FROM organizations
WHERE email_domains IS NOT NULL;

-- ===========================================
-- FIX 1: Ensure all users with same email domain belong to same org
-- ===========================================
-- This updates users who have NULL org_id but their email domain matches an org

UPDATE users u
SET org_id = o.id
FROM organizations o
WHERE u.org_id IS NULL
  AND o.email_domains IS NOT NULL
  AND SPLIT_PART(u.email, '@', 2) = ANY(o.email_domains);

-- ===========================================
-- FIX 2: If there are multiple orgs for the same domain, consolidate users
-- (Use with caution - verify the correct org_id first!)
-- ===========================================
-- This finds users whose email domain matches an org but they're assigned to a different org
-- Uncomment and run after verifying the target org_id

/*
-- First, identify the issue:
SELECT 
  u.email,
  u.org_id as current_org_id,
  o1.name as current_org_name,
  o2.id as matching_org_id,
  o2.name as matching_org_name
FROM users u
LEFT JOIN organizations o1 ON u.org_id = o1.id
JOIN organizations o2 ON SPLIT_PART(u.email, '@', 2) = ANY(o2.email_domains)
WHERE u.org_id IS DISTINCT FROM o2.id;

-- Then fix (replace YOUR_TARGET_ORG_ID and YOUR_EMAIL_DOMAIN):
-- UPDATE users
-- SET org_id = 'YOUR_TARGET_ORG_ID'
-- WHERE SPLIT_PART(email, '@', 2) = 'YOUR_EMAIL_DOMAIN';
*/

-- ===========================================
-- FIX 3: Reassign Odoo configs to correct org if needed
-- ===========================================
-- If a config was created with wrong org_id, update it
-- (Replace with actual values after running diagnostics)

/*
UPDATE odoo_saved_configs
SET org_id = 'CORRECT_ORG_ID'
WHERE id = 'CONFIG_ID_TO_FIX';
*/

-- ===========================================
-- VERIFICATION: Run after fixes to confirm
-- ===========================================

-- This should show all configs visible to each user:
SELECT 
  osc.name as config_name,
  osc.org_id as config_org_id,
  u.email as user_email,
  u.org_id as user_org_id,
  CASE WHEN osc.org_id = u.org_id THEN 'VISIBLE' ELSE 'HIDDEN' END as visibility
FROM odoo_saved_configs osc
CROSS JOIN users u
WHERE osc.is_active = true
ORDER BY u.email, osc.name;


