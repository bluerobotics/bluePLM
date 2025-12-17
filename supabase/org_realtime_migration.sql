-- ===========================================
-- Organization Realtime Migration
-- ===========================================
-- Enables realtime subscriptions for organization settings changes
-- This allows all users in an org to see settings updates instantly
-- (e.g., DM license key, API URLs, Google Drive config)

-- Enable REPLICA IDENTITY FULL so Supabase sends old + new records on UPDATE
-- This is needed to detect which settings actually changed
ALTER TABLE organizations REPLICA IDENTITY FULL;

-- Add organizations table to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'organizations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE organizations;
    RAISE NOTICE 'Added organizations table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'organizations table already in supabase_realtime publication';
  END IF;
END $$;

-- Verify realtime is enabled
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

