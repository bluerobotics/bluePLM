# Security audit before blueplm.io (2026-10-30)

Four independent auditors (web client and delivery, table RLS and grants, RPCs, auth / storage / API) against
main at 0c9bd0ef and a read-only snapshot of production (schema 110). Two exploit chains were reproduced on
PGlite through the cloud runner. Production at audit time: 1 organization (blue-robotics, 32 members), 45 auth
users, 0 users without an org, 0 rows where `users.email` differs from `auth.users.email` (no sign of the email
forge being used), 12 pending invites.

None of the database findings is new with the web client: the project URL and anon key ship in the desktop
installer. The website makes them easier to find.

## Applied immediately (Supabase auth config, reversible; previous values in the audit snapshot)

| Setting | Was | Now | Why |
|---|---|---|---|
| `disable_signup` | false | **true** | Closes every stranger path (C1-C3 below). New people must be invited through the API invite (`/auth/invite`, `inviteUserByEmail`); a self-sign-up against a `pending_org_members` row no longer works. Undo: set false once C1-C3 are fixed, if wanted. |
| `uri_allow_list` | empty | `https://blueplm.io`, `https://blueplm.io/**`, `http://127.0.0.1:*/auth/callback`, `http://localhost:*/auth/callback` | Web sign-in; desktop OAuth callback listed explicitly instead of relying on `site_url`. |
| `site_url` | `http://localhost:3000` | `https://blueplm.io` | Email links no longer hand tokens to whatever listens on localhost:3000. |
| `security_update_password_require_reauthentication` | false | true | A stolen session cannot change the password. |
| `password_min_length` | 8 | 10 | HIBP check was already on. |
| `mailer_notifications_*` (password / email changed, identity linked, MFA enrolled / unenrolled) | off | on | Takeover is noticed. |
| `sessions_inactivity_timeout` | 0 | 336 h | Idle sessions end after 14 days; running desktop apps keep refreshing. |

## Database: must fix (schema release; owned by the vault-access RLS session)

- **C1 (critical, reproduced): email forge.** "Users can update their own profile" pins `role` and `org_id`
  but not `email`. `ensure_user_org_id()`, `apply_pending_team_memberships()`, `join_org_by_slug()` and the
  `blocked_users` checks trust `public.users.email`. PATCH own email to an invitee's address, call
  `ensure_user_org_id` → the invite's org, role (admin if invited as admin), teams, vaults. Any address at an
  `email_domains` domain auto-joins. Fix: email not client-writable (pin in WITH CHECK or column grant); all
  of these read `auth.users.email` and require `email_confirmed_at`; `handle_new_user` must not bind an
  invite before confirmation. `admin_remove_user` / `block_user` / `unblock_user` target by email too.
- **C2 (critical): storage.** Four dashboard-made `storage.objects` policies "Allow authenticated access
  1uo56a_0..3" grant SELECT / INSERT / UPDATE / DELETE with `true` to `authenticated` on every bucket. Any
  account can list, download, overwrite or delete every org's vault objects and the private extension
  packages. Non-hash objects (logos, item images, inspection previews, drawing-review PDFs) can be swapped.
  Fix: drop them; commit org-scoped policies (`(storage.foldername(name))[1] = caller's org_id`) for
  `vault` in module 10; no UPDATE on content-addressed paths (map the `upsert: true` writers:
  `itemImages.ts:118`, `uploadPreview.ts:71`, profile and company logos); DELETE admin-only; add vault
  access if paths allow; `check_release_residue()` refuses any `storage.objects` policy without an org term.
- **C3 (critical, reproduced): `join_org_by_slug`.** Only gate is `enforce_email_domain` (default false);
  slugs are public. Fix: require an invite or a verified-domain match against `auth.users`.
- **H1: cross-tenant reads.** `organizations`, `users`, `vaults` SELECT `USING (true)`. Exposes
  `google_drive_client_secret`, slugs, `email_domains`, every user's email / role / org. Scope to own org;
  anything needed before sign-in through an argument-less SECURITY DEFINER RPC with safe columns.
- **H2: backup secrets.** `backup_config.*_encrypted` hold plaintext S3 keys and the restic password,
  readable by every member (and in the realtime publication). Admin-only or move to
  `integration_credentials`; rotate the keys; write-only key with object lock. `webhooks.secret` likewise.
- **H3: orphan functions in production with no source and no caller checks:** `mark_all_notifications_read
  (uuid)`, `get_unread_notification_count(uuid)`, `get_eco_files(uuid)`, `get_file_ecos(uuid)`,
  `cleanup_stale_sessions()`, `handle_supplier_signup()`, `apply_pending_team_memberships_trigger()`,
  `update_rfq_timestamp()`. Confirm with `pg_get_functiondef`, drop, and refuse unmanifested public functions.
- **M1: vault access ignored** on `files`, `file_versions`, `reviews`, `review_rounds`, `review_responses`,
  `drawing_pdf_renders`, `file_version_references`, `file_comments`, `file_references`, `folders`,
  `release_files`, `inspection_characteristics` (only `review_items` uses `may_access_vault`).
- **M2: backup tampering.** `backup_history`, `backup_locks` FOR ALL with org only.
- **M3: forgeable audit rows.** INSERT checks only the org on `activity`, `workflow_history`,
  `eco_checklist_activity`, `rfq_activity`, `integration_sync_log`, `file_state_entries` (and its close
  UPDATE); `notifications` allows `from_user_id` NULL from clients; `user_sessions` leaves `org_id` free.
  Pin the actor to `auth.uid()` or write from triggers / RPCs.
- **M4: permission checks missing in RPCs.** `checkout_file`, `checkin_file`, `move_file`,
  `rename_folder_files` skip `module:explorer edit`; `update_item_definition_settings`,
  `update_serialization_settings_safe`, `reset_item_image`, `create_default_workflow` (also trusts
  `p_created_by`), `approve_eco_gate`, `instantiate_process_template` need admin or the module permission;
  `get_google_drive_settings` returns `client_secret` to members.
- **Low:** `file_share_links` DELETE not org-scoped; `webhook_deliveries` writable by anon; `anon` holds full
  table grants (TRUNCATE included); no FORCE RLS; 104 SECURITY DEFINER functions without `search_path`;
  admin helper functions executable by `authenticated`; `user_can_access_module` cross-org oracle;
  realtime DELETE events leak primary keys cross-org; `email_domains` not unique or verified.

## API (Fastify)

- Fixed in API 3.0.1: rate limits were shared by all callers behind the proxy. The API now trusts
  `TRUST_PROXY_HOPS` hops (default 1), a count rather than `true`, which would let a caller choose its own
  address. Needs an API redeploy.
- Not changed: `ENABLE_DOCS`. `api/src/config/env.ts` records a deliberate decision that `/docs` is
  documentation, not a security control (the surface is published in `api/README.md`).
- Otherwise sound (auth on every route, `isAdmin` from `is_org_admin()`, org from the profile, CORS strict).

## Status (2026-10-30)

- Web client findings: fixed and deployed.
- Auth config: applied (table above).
- API: 3.0.1 in the repo, not yet redeployed.
- Database C1-C3, H1-H3, M1-M4, Low: open, owned by the "Enforce vault access in RLS for files"
  session as one schema release. Until it is applied, the remaining exposure is to existing accounts
  (staff and any supplier contacts), not to strangers. After it lands, rotate the backup storage keys,
  the restic password and the Google Drive client secret.

## Web client: fixed in this pass

Sign-out that fails on the network now clears the stored session itself; implicit-flow token fragments
are stripped from the address bar; `frame-src` is `blob:` only; download names drop bidi and zero-width
characters; the sign-in log no longer records the email; Pages build uses `npm ci --ignore-scripts`.

Judged sound: CSP and Trusted Types, headers, no source maps or extra secrets in the bundle, PKCE, no open
redirects, no HTML sinks, LIKE-escaped filters, 60 s attachment signed URLs, PDF as a typed blob, no web
dependency in `npm audit`.
