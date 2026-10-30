# Schemas 111 and 112: production apply (2026-10-30)

Applied by Claude at the owner's request ("can we apply those schema changes and version the app?")
through the Supabase Management API (`database/query`, token from the main checkout's `.env`), from
the files on origin/main at 8e52505e, then core.sql again with the manifest fix below. Production
went from 110 to 112: the database half of the blueplm.io security audit
(`blueplm-web-security-audit.md`; C1-C3 and H1 in 111, H2, H3, M2-M4 and part of Low in 112).

## Scope

- `git diff v4.9.0 8e52505e -- supabase`: core, modules 10, 15, 20, 30, 40, reset.sql. Policies and
  functions only: no DELETE, TRUNCATE, DROP TABLE / COLUMN or row rewrite. Rollback is re-applying
  the v4.9.0 SQL.
- Restrictive by design. Released 4.9.0 keeps working: every storage path the desktop writes is
  `<org>/<hash>`, `<org>/_assets/...` or `<org>/inspection-previews/...`, which the new storage
  policies allow; members (not admins) lose the backup snapshot list (backup_config is admin-only).
- Safety net: daily physical backup 2026-10-29 10:40 UTC completed (no PITR). Saved before the apply
  (session scratchpad): md5 of every public function and every public / storage policy.
- Before: version 110; 1 org, 32 users, 37,017 files, 45,707 versions, 2,617 folders, 226,532
  activity, 11 reviews, 1 backup_config, 238 functions, 278 policies.

## Apply

core.sql, modules 10, 15, 20, 30, 40, 50, one request each: all 201. `verify_and_stamp_schema()`
then refused: `get_backup_status()` reported stale because the manifest marker `'credentials_set'`
only appears as a string literal, and `strip_sql_noise()` removes literals before matching. Fixed
the marker in core.sql to `bc.restic_password_encrypted IS NOT NULL` (code, not a literal), applied
core.sql again (201), and stamped: `{"stamped":true,"version":112,"problems":[]}`.

## After

- Counts identical (users, files, versions, activity, backup_config, 12 pending invites, 36,358
  storage objects).
- Functions 238 -> 236: removed the seven orphans (`apply_pending_team_memberships_trigger`,
  `cleanup_stale_sessions`, `get_eco_files`, `get_file_ecos`, `get_unread_notification_count`,
  `mark_all_notifications_read`, `update_rfq_timestamp`); `handle_supplier_signup` kept with
  EXECUTE revoked because the `on_supplier_signup` trigger on auth.users uses it. Added
  `get_backup_status`, `may_read_vault_object`, `my_accessible_vault_ids`, `my_verified_email`,
  `verified_auth_email`. 131 changed.
- storage.objects: only the eight managed policies remain (four vault, four org-extensions); the
  dashboard-made "Allow authenticated access 1uo56a_0..3" are gone.
- Auth: sign-up reopened (`disable_signup` false). A new account has no org and reads nothing until
  an invitation naming the org or a confirmed `@bluerobotics.com` address (`email_domains`) joins it.

## Still to do

Rotate the backup storage keys, the restic password and the Google Drive client secret (readable by
members before 112). Open Low items: anon table grants and FORCE RLS, search_path on older definer
functions, the `user_can_access_module` cross-org oracle, realtime DELETE keys, `email_domains`
uniqueness, an unmanifested-function check.
