# Follow-up: Wrap `updateFolderPath` in Supabase RPC

## Summary
Currently `updateFolderPath` updates files one-by-one in a loop. Wrapping this in a Supabase RPC (stored procedure) would provide a true database transaction -- either all files update or none do. This is deferred as it requires a migration.

## Current State (After Fix 2)
Fix 2 improved the situation significantly:
- Errors are now logged per-file with details
- Return value accurately reports success/failure counts
- Callers (Fix 3) now warn users on partial failures
- Prefix matching is safe (`/%` suffix)
- Trashed files are excluded

## What a Transaction Would Add
1. **Atomicity**: If the 50th file out of 100 fails, all 49 previous updates roll back
2. **Performance**: Single round-trip to the database instead of N sequential requests
3. **Consistency**: No window where some files have old paths and some have new

## Proposed RPC

```sql
CREATE OR REPLACE FUNCTION update_folder_path(
  p_old_folder_path text,
  p_new_folder_path text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE files
  SET 
    file_path = p_new_folder_path || substring(file_path from length(p_old_folder_path) + 1),
    updated_at = now()
  WHERE 
    lower(file_path) LIKE lower(p_old_folder_path || '/%')
    AND deleted_at IS NULL
    AND vault_id = (SELECT active_vault_id FROM get_user_context());
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'updated', 0
  );
END;
$$;
```

## Implementation Steps
1. Create migration file with the RPC
2. Update `updateFolderPath` in `mutations.ts` to call `client.rpc('update_folder_path', { ... })`
3. Handle the RPC response format
4. Bump schema version

## Priority
**Low** -- Fix 2's error reporting is sufficient to prevent silent data loss. The RPC is a nice-to-have for atomicity.

## Risk
- RLS considerations: The RPC needs `SECURITY DEFINER` with proper vault_id filtering
- Case sensitivity: The RPC should use `lower()` for path comparison (matching current `ilike` behavior)
- Testing: Requires integration tests against a real Supabase instance
