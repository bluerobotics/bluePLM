-- Migration: Fix Online Users Visibility
-- Fixes the issue where users cannot see other organization members online
-- Root cause: Sessions created with NULL org_id, and RLS policy not handling NULL correctly

-- Step 1: Add index on org_id for better query performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_org_id ON user_sessions(org_id);

-- Step 2: Drop existing policies and recreate with correct logic
DROP POLICY IF EXISTS "Users can view own sessions" ON user_sessions;
DROP POLICY IF EXISTS "Users can view org sessions" ON user_sessions;
DROP POLICY IF EXISTS "Users can manage own sessions" ON user_sessions;

-- Policy for SELECT: Users can see their own sessions AND sessions from org members
-- Uses a more robust check that handles NULL org_ids properly
CREATE POLICY "Users can view org sessions"
  ON user_sessions FOR SELECT
  USING (
    -- Always allow viewing own sessions
    user_id = auth.uid()
    OR 
    -- Allow viewing sessions from same organization
    -- Both the session's org_id and the user's org_id must be non-null and match
    (
      org_id IS NOT NULL 
      AND org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid() AND u.org_id IS NOT NULL)
    )
  );

-- Policy for INSERT/UPDATE/DELETE: Users can only manage their own sessions
CREATE POLICY "Users can manage own sessions"
  ON user_sessions FOR ALL
  USING (user_id = auth.uid());

-- Step 3: Fix all users who don't have org_id set
-- Match users to organizations based on email domain
UPDATE users u
SET org_id = o.id
FROM organizations o
WHERE u.org_id IS NULL
  AND o.email_domains IS NOT NULL
  AND SPLIT_PART(u.email, '@', 2) = ANY(o.email_domains);

-- Step 4: Fix all sessions that have NULL org_id
-- Get the org_id from the user who owns the session
UPDATE user_sessions us
SET org_id = u.org_id
FROM users u
WHERE us.user_id = u.id
  AND us.org_id IS NULL
  AND u.org_id IS NOT NULL;

-- Step 5: Log the results (run these manually to verify)
-- SELECT 'Users with NULL org_id:', count(*) FROM users WHERE org_id IS NULL;
-- SELECT 'Sessions with NULL org_id:', count(*) FROM user_sessions WHERE org_id IS NULL;
-- SELECT 'Users per org:', org_id, count(*) FROM users GROUP BY org_id;
-- SELECT 'Sessions per org:', org_id, count(*) FROM user_sessions GROUP BY org_id;


