-- Quick diagnostic for Odoo config visibility issue
-- Run this in Supabase SQL editor to identify the problem

-- 1. Show the Odoo config that exists but isn't loading
SELECT 
  osc.id,
  osc.name,
  osc.url,
  osc.org_id as config_org_id,
  o.name as config_org_name
FROM odoo_saved_configs osc
JOIN organizations o ON osc.org_id = o.id
WHERE osc.name = 'BR Production Server'  -- The config name from the error
   OR osc.name ILIKE '%production%';     -- Or similar

-- 2. Show all users and their org_ids
SELECT 
  email,
  role,
  org_id as user_org_id,
  (SELECT name FROM organizations WHERE id = users.org_id) as org_name
FROM users
ORDER BY email;

-- 3. Quick visibility check - do ANY users have matching org_id?
SELECT 
  osc.name as config_name,
  osc.org_id as config_org_id,
  COUNT(*) FILTER (WHERE u.org_id = osc.org_id) as users_who_can_see,
  COUNT(*) FILTER (WHERE u.org_id IS NULL) as users_with_null_org,
  COUNT(*) FILTER (WHERE u.org_id != osc.org_id AND u.org_id IS NOT NULL) as users_with_different_org
FROM odoo_saved_configs osc
CROSS JOIN users u
WHERE osc.is_active = true
GROUP BY osc.id, osc.name, osc.org_id;

-- 4. If the problem is NULL org_ids, fix them:
-- (Run this to see what WOULD be fixed)
SELECT 
  u.email,
  u.org_id as current_org_id,
  o.id as should_be_org_id,
  o.name as org_name
FROM users u
JOIN organizations o ON SPLIT_PART(u.email, '@', 2) = ANY(o.email_domains)
WHERE u.org_id IS NULL OR u.org_id != o.id;

-- 5. THE FIX: Update users to correct org_id based on email domain
UPDATE users u
SET org_id = o.id
FROM organizations o
WHERE SPLIT_PART(u.email, '@', 2) = ANY(o.email_domains)
  AND (u.org_id IS NULL OR u.org_id != o.id);

