-- folder_rename with no vault supplied must work again for a caller whose
-- files live in exactly one vault, and must still be unable to touch anything
-- outside that caller's organisation.
\pset pager off
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"aaaaaaaa-1111-4000-8000-000000000001","role":"authenticated"}';

SELECT 'files before' AS step, org_id, vault_id, file_path FROM file ORDER BY file_path;

-- No vault id: resolved from the caller's own organisation.
SELECT 'rename own folder, NULL vault' AS step,
       folder_rename('Acme/Classified', 'Acme/Public',
                           NULL) AS result;

-- The other tenant's folder, also with no vault id. Must not match anything:
-- the resolution is scoped to the caller's own organisation, so there is no
-- candidate vault and nothing is rewritten.
SELECT 'rename OTHER tenant folder, NULL vault' AS step,
       folder_rename('Umbrella', 'Umbrella-Pwned',
                           NULL) AS result;

SELECT 'files after' AS step, org_id, vault_id, file_path FROM file ORDER BY file_path;

RESET ROLE;
