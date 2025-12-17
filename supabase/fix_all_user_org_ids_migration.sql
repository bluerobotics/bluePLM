-- Migration: Fix ALL users to have correct org_id based on email domain
-- This is a one-time fix + adds a trigger to prevent future issues
-- Run this in your Supabase SQL editor

-- ===========================================
-- STEP 1: DIAGNOSTIC - See current state
-- ===========================================

-- Show all users and which org they SHOULD belong to based on email domain
SELECT 
  u.id as user_id,
  u.email,
  u.role,
  u.org_id as current_org_id,
  o_current.name as current_org_name,
  o_target.id as correct_org_id,
  o_target.name as correct_org_name,
  CASE 
    WHEN u.org_id IS NULL THEN 'NULL_ORG'
    WHEN u.org_id != o_target.id THEN 'WRONG_ORG'
    ELSE 'OK'
  END as status
FROM users u
LEFT JOIN organizations o_current ON u.org_id = o_current.id
LEFT JOIN organizations o_target ON SPLIT_PART(u.email, '@', 2) = ANY(o_target.email_domains)
ORDER BY status DESC, u.email;

-- ===========================================
-- STEP 2: THE FIX - Update all users to correct org_id
-- ===========================================

-- Update users who have NULL or wrong org_id to the correct one based on email domain
UPDATE users u
SET org_id = o.id
FROM organizations o
WHERE SPLIT_PART(u.email, '@', 2) = ANY(o.email_domains)
  AND (u.org_id IS NULL OR u.org_id != o.id);

-- Also fix any user_sessions that have wrong/null org_id
UPDATE user_sessions us
SET org_id = u.org_id
FROM users u
WHERE us.user_id = u.id
  AND u.org_id IS NOT NULL
  AND (us.org_id IS NULL OR us.org_id != u.org_id);

-- ===========================================
-- STEP 3: CREATE TRIGGER - Auto-set org_id on user insert/update
-- ===========================================

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS auto_set_user_org_id ON users;
DROP FUNCTION IF EXISTS auto_set_user_org_id_func();

-- Create function to auto-set org_id based on email domain
CREATE OR REPLACE FUNCTION auto_set_user_org_id_func()
RETURNS TRIGGER AS $$
DECLARE
  matching_org_id UUID;
BEGIN
  -- Only run if org_id is NULL or being updated
  IF NEW.org_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id) THEN
    -- Find organization by email domain
    SELECT o.id INTO matching_org_id
    FROM organizations o
    WHERE SPLIT_PART(NEW.email, '@', 2) = ANY(o.email_domains)
    LIMIT 1;
    
    -- If found and not already set, update it
    IF matching_org_id IS NOT NULL AND NEW.org_id IS NULL THEN
      NEW.org_id := matching_org_id;
      RAISE NOTICE 'Auto-set org_id for user % to %', NEW.email, matching_org_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER auto_set_user_org_id
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_user_org_id_func();

-- ===========================================
-- STEP 4: CREATE RPC - For app to call to ensure org_id is set
-- ===========================================

-- Create an RPC function the app can call to ensure user has correct org_id
CREATE OR REPLACE FUNCTION ensure_user_org_id()
RETURNS JSON AS $$
DECLARE
  current_user_id UUID;
  current_org_id UUID;
  matching_org_id UUID;
  user_email TEXT;
  result JSON;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get user's current org_id and email
  SELECT org_id, email INTO current_org_id, user_email
  FROM users
  WHERE id = current_user_id;
  
  -- Find matching org by email domain
  SELECT o.id INTO matching_org_id
  FROM organizations o
  WHERE SPLIT_PART(user_email, '@', 2) = ANY(o.email_domains)
  LIMIT 1;
  
  -- If user has wrong or NULL org_id, fix it
  IF matching_org_id IS NOT NULL AND (current_org_id IS NULL OR current_org_id != matching_org_id) THEN
    UPDATE users
    SET org_id = matching_org_id
    WHERE id = current_user_id;
    
    -- Also fix their sessions
    UPDATE user_sessions
    SET org_id = matching_org_id
    WHERE user_id = current_user_id
      AND (org_id IS NULL OR org_id != matching_org_id);
    
    RETURN json_build_object(
      'success', true, 
      'fixed', true,
      'previous_org_id', current_org_id,
      'new_org_id', matching_org_id
    );
  END IF;
  
  -- Already correct
  RETURN json_build_object(
    'success', true,
    'fixed', false,
    'org_id', current_org_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION ensure_user_org_id() TO authenticated;

-- ===========================================
-- STEP 5: VERIFICATION - Confirm the fix worked
-- ===========================================

-- After running the fix, this should show no issues
SELECT 
  u.email,
  u.org_id,
  o.name as org_name,
  CASE 
    WHEN u.org_id IS NULL THEN 'STILL_NULL - No matching org for domain'
    ELSE 'OK'
  END as status
FROM users u
LEFT JOIN organizations o ON u.org_id = o.id
ORDER BY status DESC, u.email;


