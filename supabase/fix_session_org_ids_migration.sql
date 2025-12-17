-- Migration: Fix user_sessions with NULL org_id
-- This fixes the "online users not showing" bug where sessions were created before
-- the user's org_id was properly set.

-- Update all sessions with NULL org_id to use the org_id from the users table
UPDATE user_sessions us
SET org_id = u.org_id
FROM users u
WHERE us.user_id = u.id
  AND us.org_id IS NULL
  AND u.org_id IS NOT NULL;

-- Also ensure all users who belong to an org have their org_id set correctly
-- by checking their email domain against organization email_domains
UPDATE users u
SET org_id = o.id
FROM organizations o
WHERE u.org_id IS NULL
  AND o.email_domains IS NOT NULL
  AND SPLIT_PART(u.email, '@', 2) = ANY(o.email_domains);

-- Log how many records were affected (for manual verification)
-- SELECT 'Fixed sessions:', count(*) FROM user_sessions WHERE org_id IS NOT NULL;
-- SELECT 'Users without org:', count(*) FROM users WHERE org_id IS NULL;

