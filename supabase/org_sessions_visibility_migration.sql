-- Migration: Organization-wide Session Visibility
-- Allows users to see other organization members' online status
-- This enables the "Who's Online" feature in the app

-- Drop the old restrictive policy if it exists
DROP POLICY IF EXISTS "Users can view own sessions" ON user_sessions;

-- Create new policy: Users can view sessions of all org members
-- Users can see sessions where:
-- 1. The session belongs to them (user_id matches)
-- 2. OR the session's org_id matches the viewer's org_id
CREATE POLICY "Users can view org sessions"
  ON user_sessions FOR SELECT
  USING (
    user_id = auth.uid()
    OR 
    org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  );

-- Note: The existing "Users can manage own sessions" policy remains unchanged
-- Users can still only INSERT/UPDATE/DELETE their own sessions

