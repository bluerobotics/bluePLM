# BluePLM — Project Context

Electron + React + TypeScript PDM application for SOLIDWORKS, backed by Supabase and a Fastify
API. The renderer lives in `src/`, the Electron main process in `electron/`, the REST API in
`api/`, the database schema in `supabase/`, and the SOLIDWORKS interop service in
`solidworks-service/`.

## Active plan

Schema 112 (audit follow-up): `backup_config`, `webhooks` and `webhook_deliveries` are admin-only (members read `get_backup_status()` without secrets); audit rows (activity, workflow_history, file_state_entries, notifications, ...) must name `auth.uid()` as actor; file RPCs (`checkout_file`, `checkin_file`, `move_file`, `rename_folder_files`) require `module:explorer edit`; `approve_eco_gate` checks the ECO's org. Details: `.cursor/plans/vault-access-rls-111.md`.

Vault access enforced by the database (schema 111; renderer `checkin.ts` only; no API change). `my_accessible_vault_ids()` (argument-less SECURITY DEFINER) is the rule: an org admin (`is_org_admin()`) reads every vault of the organization, anyone else the vaults granted in `vault_access` or through a team in `team_vault_access`, and no grant means no vault (the renderer's `getAccessibleVaults`). Every SELECT or ALL policy on a file-data table (files, file_versions, folders, references, drawing PDFs, release files, comments, watchers, share links, state entries, workflow assignments and history, activity, inspection characteristics, ECO/deviation file links) must name it, directly or through `file_id IN (SELECT f.id FROM files f WHERE ... my_accessible_vault_ids())`; `check_release_residue()` refuses to stamp otherwise, and `src/lib/supabase/vaultAccessRls.test.ts` checks the module files and the policies on PGlite. A file with no vault is no restriction. `user_may_access_vault()` applies the same opt-in rule (107-110 read no grant as unrestricted). `require_file_access()`, `require_vault_access()`, `execute_workflow_transition`, `complete_gate_review` and the vault load RPCs (`get_vault_files_fast/count/delta`) refuse a vault the caller cannot see. `vaults` is readable by its own organization only. The `vault` storage bucket's policies now live in module 10 (`Vault: ...`): content is readable through a readable file, version or drawing PDF row (by hash), by its uploader or by an admin; module 10 drops any other policy naming the bucket. 111 also closes audit C1-C3 and H1: `users.email` is not client-writable and membership (invites, domain joins, blocks, `join_org_by_slug`, which now needs an invitation or a domain match) uses the confirmed `auth.users` address through `verified_auth_email()`; `organizations` and `users` are readable inside the caller's organization only; module 10 drops every `storage.objects` policy except the managed eight, content objects are never updated, and `check_release_residue()` refuses an unmanaged storage policy. Known limits: a review package's cross-vault closure children cannot be downloaded by a reviewer without that vault; `reviews` rows, `pending_reviews` and `item_designation_assignments` stay org-wide.

BluePLM Web (blueplm.io; Cloudflare Workers static assets; no schema change): the desktop renderer itself, built for the browser. `vite.web.config.ts` builds `web/index.html` → `web/src/main.tsx` (pins the backend, then imports `@/app/main`) into `dist-web/`; `npm run deploy:web` builds against production and deploys (`web/wrangler.jsonc`, route `blueplm.io/*`). There is no second UI: every web/desktop difference is a `hasDesktop()` / `IS_WEB_BUILD` check from `src/lib/platform.ts` at an entry point (modules via `useDeniedModules`, settings tabs via `desktopOnly` in the settings catalog, context-menu actions, toolbar, top bar, previews). `window.electronAPI` is optional in its type, so the compiler flags any code that assumes the bridge; guard it, and give the web a browser equivalent where one makes sense (`src/lib/browserDownload.ts`). On the web a vault is server-only: files load as cloud rows and Download saves through the browser. Never on the web: check out / check in, SOLIDWORKS, eDrawings and CAD previews, local vault sync, file watching, Re-align, moves, the licence registry, backups, native extensions. The build writes `dist-web/_headers` (strict CSP with Trusted Types `'none'`, no inline styles, HSTS) from `web/src/app/securityHeaders.ts`; `web/src/webBoundary.test.ts` walks the whole renderer from the web entry and fails on any Trusted Types sink (`innerHTML`, `<style>` in JSX and the like) or an import of `electron/`, so renderer code must build DOM with DOM calls and keep CSS in stylesheets. Plan, audit and deploy: `.cursor/plans/blueplm-web.plan.md`, `.cursor/plans/blueplm-web-security-audit.md`, `web/DEPLOY.md`.

Review stages and File Workflows (schema 110, renderer; no API or service change). A review stage is a workflow state with `triggers_review`; it names where an approval sends files (`review_approved_state_id`, else its only exit). `organizations.settings` holds `file_workflows_enabled` (only `false` turns workflows off: no Workflows view via `useDeniedModules`, no Change State, `execute_workflow_transition` refuses `WORKFLOWS_DISABLED`), `review_stage_on_approval` (`hold` default / `advance`) and `review_stage_package_policy` (`together` default / `approved_only`). Moves go through `review_advance_items()` only (from `review_settle` or `advance_reviewed_files`), which never moves a file that is checked out, changed since the approved version, or behind a gated exit. Read the setting through `fileWorkflowsEnabled()` in `src/lib/fileWorkflows.ts`. Files join or leave an open review through `add_review_items` / `remove_review_items`, from the Reviews submenu (`ReviewsSubmenu`), which is the only review entry in the file menus. Plan and decisions: `.cursor/plans/review-stages-workflows.plan.md`.

Administrators team = admin (4.7.1; API 2.8.2, schema 102). There is one definition of admin: `users.role = 'admin'` OR membership of the team named `Administrators`. Never test the role column alone. Renderer: `isAdminUser(role, teams)` in `src/lib/isAdminUser.ts`; `getEffectiveRole()` returns `'admin'` for team members once `userTeams` has loaded, so `getEffectiveRole() === 'admin'` gates are correct as written, but a direct `user.role === 'admin'` is a bug. API: gate on `request.user.isAdmin` (set by `api/middleware/auth.ts` from `is_org_admin()`, fails closed), not `request.user.role`. SQL: call `is_org_admin()`, never `SELECT 1 FROM users WHERE role = 'admin'`. `users.role` is never written to keep it in step with the team. The user must apply `core.sql` + modules 40/50 and redeploy the API; the renderer works on app update alone.

SolidWorks licence privacy (schema 106, renderer and Electron main; no API or service change): non-admins read only the `solidworks_licenses` rows assigned to them, through the argument-less SECURITY DEFINER helper `my_solidworks_license_ids()` (an argument-taking helper would be flagged by `check_unbound_entity_args()`, and a policy reading the assignments table directly would recurse with the assignment policies). Admins (`is_org_admin()`) read every licence. Assignments are readable by their own user and admins only, and the old "Users can update own assignment activation" policy is withdrawn because repointing `license_id` exposed another serial; `check_release_residue()` refuses to stamp while a licence or assignment policy without `is_org_admin()` remains. The released client (4.8.0) keeps working against 106: its licence screen already filtered a non-admin to their own licences. The top-bar SOLIDWORKS panel (`SolidWorksStatusIndicator`) shows the user's own serial masked (`maskSerial`, last 8) and warns when this machine's core "SolidWorks" registry serial is not one of theirs (`evaluateLicenseMatch` in `src/lib/solidworksLicense/serial.ts`). The machine serial comes from `HKLM\Software\SolidWorks\Licenses\Serial Numbers`, value name = product, value data = serial (`electron/handlers/solidworksSerialRegistry.ts`). BluePLM's "push licence to registry" (`setLicenseRegistry`) writes the same shape: value `SolidWorks` = the serial in 4-character groups, replacing the core serial; check and remove match on value data (`productsWithSerial`), and both delete the pre-4.8.0 empty-data value named after the serial. RLS is tested on real Postgres with PGlite (`src/lib/solidworksLicense/licenseRls.test.ts`).

Drawing reviews (schema 107, SolidWorks service 1.26.0, renderer; no API change): one review model. A review is a package of `review_items`, each pinned to a `file_versions` row, decided per item and per reviewer in `review_rounds` (mode `all` or `any`; decisions approved / approved_with_comments / changes_requested / rejected, comment required except approved). Every write goes through SECURITY DEFINER RPCs in `20-change-control.sql` that lock the review and write `notifications` in the same transaction; client RLS on the review tables is SELECT-only and follows vault access, and `check_release_residue()` refuses to stamp while a client write policy remains. Never add a client write path to these tables. Gate reviews (`pending_reviews`) stay separate but count approvals per `attempt_id` and are decided only through `complete_gate_review`. `file_version_references` (written at check-in, best effort, `checkinReferences.ts`) feeds `get_version_dependency_closure`, which falls back to an approximate closure for versions from before 107 and says so (`exact`). One PDF per drawing version lives in `drawing_pdf_renders` and is generated on a machine with SOLIDWORKS by staging the version's closure in a temp folder (`src/lib/reviewPackage/`); reviewers view that PDF, never their local copy. `download-review-package` stages pinned versions in vault layout and calls the service's `retargetReferences` (Document Manager only) so files point inside the package. UI: the package builder pane (`src/features/source/reviewPackage/`), the queue and detail (`src/features/source/reviews/`). Schema 108 keeps open reviews from waiting forever: a reviewer who still owes a decision and leaves the org or loses the vault is withdrawn (`review_responses.withdrawn_at` / `withdrawn_reason`, status `cancelled`) by `review_withdraw_lost_reviewers()`, run from statement triggers on `users`, `team_members`, `vault_access` and `team_vault_access`. Every "who owes what" query must filter `withdrawn_at IS NULL`. Deleting a `review_items` row (file or version hard-delete) re-settles the review, or cancels it when no item is left. `record_version_references` is write-once except for the author retrying on the newest version. Unverified at release: retargeting and PDF export against real Document Manager and SOLIDWORKS. Plan, audits and reports: `.cursor/plans/drawing-review*`.

Extensions (4.8.0; API 3.0.0, schema 104): native extensions run with full trust in the renderer and in-process in the API, and only from a package an org admin installed for the organization (Settings > Extensions > Install for organization): the `.bpx` goes to the private `org-extensions` bucket, `org_installed_extensions.package_sha256` pins it, and the desktop (`src/lib/nativeExtensions/`, `electron/handlers/extensions/native*.ts`, `blueplm-ext://`) and the API (`api/src/native-extensions/`, routes under `/ext/<extensionId>/`) refuse any bytes that do not hash to it. No sideload, store download or deep link can run native code. The API loads native extensions only for org ids listed in `NATIVE_EXTENSIONS_ORG_IDS` (unset = none); `POST /admin/extensions/reload` picks up a new install. Host contract v1 is `src/types/nativeExtensions.ts` and `api/src/native-extensions/types.ts`; an extension workspace uses its id verbatim as the module id, so `module_access` and `user_can_access_module` work unchanged. Customers is no longer core: it lives in the private repo `eldinmiller/blueplm-ext-customers` (`blueplm.customers`), and existing databases keep its tables and data. To bring Customers back for an org: apply the package's `sql/customers.sql` after core and modules 10-50, add the org to `NATIVE_EXTENSIONS_ORG_IDS` and redeploy the API, then install `blueplm.customers-<version>.bpx` for the org; `module:customers` team grants carry over. An extension workspace's sidebar position is saved in `moduleOrder` under its id (`setExtensionModulePlacement` in `src/features/settings/organization/extensionModules.ts`); `isExtensionWorkspaceId` keeps such ids when the persisted order is loaded, and every order consumer skips an id with no core definition. Extension routes get `request.supabase` (RLS as the caller) from core's auth; use `services.supabaseAdmin` only where RLS would refuse a needed write. Plan: `.cursor/plans/extensions-native-runtime.plan.md`.

Native inspection ballooning (schema 103, service 1.23.0, renderer): the Inspection tab's "Extract from drawing" and "Balloon drawing" need only SOLIDWORKS, not a SOLIDWORKS Inspection license. The service (`SolidWorksAPI.InspectionNative.cs`) keys each characteristic by a hash of the annotation's persist reference (`#n` sub-keys for hole callout values and GTOL frames), and rows store it in `source_key`. The merge planner (`src/lib/inspection/characteristicMerge.ts`) must keep these rules: balloon numbers and user metadata survive re-extraction, new numbers go above every number the file has ever used (live rows and snapshots), rows that could not be read are never offered for removal, and `inspection_hash` leaves out the source columns. Balloons live on the `BluePLM Inspection` layer and are the only annotations the service deletes. Runtime behaviour in real SOLIDWORKS (R1-R11 in the service file header) was unverified at release. Plan and reports: `.cursor/plans/native-inspection-balloons-*`.

Copy to Vault / Move to Vault: 4.5.0 adds both to the file context menus (renderer only - no schema change, no API change). The menu only picks a mode, a destination vault and keep-path; `VaultTransferDialog` (mounted once in `AppShell` through `pendingVaultTransfer`) previews and confirms, then the `copy-to-vault` / `move-to-vault` commands run. The planner, engine, removal and report are in `src/lib/vaultTransfer/`; the command is `src/lib/commands/handlers/vaultTransfer.ts`. Rules that must not loosen: skip-only conflicts (`syncFile` with `insertOnly`, never an overwrite), a Move verifies the destination and re-checks the source row before the Recycle Bin and soft delete, cloud-only files transfer as a row only, workflow state / reviews / ECO tags are not carried. Not yet covered by tests: the Supabase/Electron wrappers in `deps.ts` and `serverOps.ts`.

4.4.5 shipped (renderer and preload only — no schema change, no API change,
service untouched). It answers Wilson's FATHOM-X-ELEC-PCB-R1 report and the ~130 files
`scan-divergence` showed with an empty item number or description in BluePLM while the file
still holds one. Two writers silently wrote `null` over populated columns: `syncFile` updating an
existing row from a local entry with no metadata, and `syncSolidWorksFileMetadata` on a file read
with no value. Both now write only non-empty values (`nonEmptyText`). Recovery is a guarded fill,
never an overwrite: one conditional UPDATE per value (`is null or = ''`), no version, a
server-side skip for files someone else holds, and an activity row (`fillEmptyFileMetadataBatch`).
It is reachable two ways, from the `restore-metadata-from-files` terminal command and from Vault
Audit's new "Empty in BluePLM, still in the file" category ("Fill empty from file", admin-only,
preview before apply). Vault Audit is its home because it is the in-app face of
`scan-divergence`; Re-align is about paths and never reads file metadata. One predicate,
`isEmptyColumnWithFileValue`, drives the report section, the category and the planner, so the
three cannot disagree. The scanner's recoverability is unchanged: these stay `unattributed`
underneath, and nothing fills them automatically. Also in this release: unsaved metadata edits
stranded by a lost checkout are now announced instead of vanishing. Realtime warns when this
user's checkout goes away while edits are pending, and re-checkout lists the edits it would
discard and asks first (`confirmDroppingStrandedEdits`; cancel aborts, no confirm refuses). They
are never restored, because a colleague may have checked in newer values. The divergence report
saves again through a dedicated IPC, and the terminal parser now accepts quoted paths with
spaces. FATHOM's own cause is not proven: no logs from Wilson's machine exist. Report:
`.cursor/plans/metadata-blank-in-db-report.md`.

4.4.4 shipped (renderer and SolidWorks service 1.21.2 — no schema change, no API change):
everything in beta.1 below, plus two follow-ups from Quinlan's BR-107599 push, where BluePLM
showed the file as checked out while the attribute was still set. Sync Metadata now reads the
attribute before pushing and names read-only files instead of spending a minute on refused
saves; it does not clear the attribute, because checkout owns that and Check Out on a held file
repairs it. The service returns `DM_FILE_READ_ONLY` on Document Manager open error 4 instead of
falling back to SolidWorks COM, which can only refuse the same save. Folded in: the Sep 11
download/refresh work left uncommitted in the tree (hashless rows skipped, Refresh cloud rows
built like a full load, parent folders registered as expected watcher changes).

4.4.4-beta.1 (renderer and SolidWorks service — no schema change, no API change): checkout
now confirms the Windows read-only bit is actually clear, retries once, and names files that
stay read-only, including files the current user already has checked out. A read-only file
is refused before a serial number is issued or metadata is written, a write that verifies
nothing is reported as failed, and Document Manager open error 4 is logged as read-only
(service 1.21.1). The server checkout is not undone, and an issued serial is not rolled back.

4.4.3 shipped (renderer only — no schema change, no API change): downloading
a server-only folder no longer prefix-prunes that folder's files and cached server rows out of
the store. The incremental download updates used to match nothing (`matchCount: 0` in the doris
Burn Wire Release log), the folder vanished, and a file-pane Refresh rematerialized the files
as local-only until a full vault load rematched them. Download now clears cloud status on the
folder (and nested cloud dirs that just got local content) in the same store write as the files.
Plan: `.cursor/plans/download_folder_status_race_34bf65c6.plan.md`.

4.4.2 shipped the same day (renderer only — no schema change, no API change), two
independent efforts that went out together without coordinating in the same working tree.

The first closes the barxt600 incident (`.cursor/plans/barxt-move-download-incident-report.md`):
`syncFile` (First Check-In) has no move awareness and keys only on the exact path it is given, so
uploading a file that had already been moved locally, before the move itself was reconciled,
created a duplicate row at the new path instead of recognizing it — the old path's row was left
untouched and the "duplicate" only looked resolved once something else, out of band, deleted the
extra rows. Uploading now warns when a file about to go up matches another file's name and size at
a different path the vault already has a record for — a move signature, not new content, matched
in memory against rows already loaded for the batch and never a per-file server query — and lets
those files be pulled out of the batch to resolve the move first; the rest still uploads. Separately,
a folder the server still lists was correctly never being recycled (recycling early would just have
the server recreate it), but silently — some legacy rows can never be re-downloaded, which pins
the folder in that state forever, and now the app says so instead of leaving it unexplained.

The second lets Re-align choose keep-server or keep-local per pending move instead of one
all-or-nothing checkbox that always ran server-wins: the dialog lists every pending move with its
vault path and disk path, defaults each to keep-server, and keep-local now routes through
`reconcile-moved-paths` for only the files named that way, while keep-server still calls
`adopt-server-paths` — both commands take an optional `fileIds` filter for exactly this so a mixed
decision cannot spill onto a file left the other way. Folded into the same tag: the "waiting for a
confirmation" message for Re-align's own hang-avoidance line from 4.4.1's fix, written alongside
that release but never shipped because it was amended into the local commit after the tag had
already been cut.

Working the same tree without coordinating left a real seam, not a functional bug: the barxt
commit was made first and, because both efforts' changes were sitting uncommitted in the same
files at that point, its diff to `src/lib/commands/types.ts` and the locale files ended up
carrying some of the second effort's content too (the `fileIds` parameter additions and the
`realign.pendingMove.*` / `waitingForConfirmation` keys) — harmless since nothing consumed those
additions until the second commit wired them up, but it means the two commits' own descriptions of
what they touched are not perfectly clean boundaries. Checked before tagging: no duplicate or
orphaned i18n keys, every new key present in all seven locales, and the two efforts' command-layer
changes (params, preflights, `applyAlignment`'s step order) agree with each other.

4.4.0 shipped (renderer only — no schema change, no API change) on top of
4.3.3's `moved_away` stub (see below): a **Re-align with Server** button in vault settings that
answers "how does my copy of this vault disagree with the server, and what can be fixed
safely?" in one pass instead of one badge at a time. It classifies every file into buckets and
groups them into what can be fixed now, what needs the user's decision, and what is reported for
orientation only, then fixes the safe bucket by composing the existing guarded commands —
`adopt-server-paths`, `discard-orphaned`, `get-latest` — in that order, because resolving a move
changes the answer to whether a row is an orphan. Re-align is non-destructive by default and
never discards work the user did not agree to lose: cloud-only files are not downloaded (this is
not a bulk sync), local-only files are kept and listed so they can be checked in deliberately,
locally modified files keep their edits and are only flagged, and orphan recycling runs through
the automatic delete path, which leaves a file on disk rather than deleting it permanently when
the recycle bin is unavailable. The sync index repair this needs is a diff, not a rebuild — it
adds missing entries and drops genuinely stale ones while leaving orphan tombstones and
`localOnly` entries alone, since clearing them would reclassify every real orphan as new local
work, the exact pre-4.3.0 failure this release must not recreate.

Folded into the same 4.4.0 tag: three call sites 4.3.3 knowingly deferred, all the same shape —
code that assumed a row with `pdmData` has local content behind it, which stopped holding the
day `moved_away` shipped. `FileTree.tsx`'s tree-row double-click fell through to opening a
stub's path, which has no file behind it; it now opens the destination the stub names, matching
the file list and grid card, which already did this correctly through a shared handler.
`configDrawingLookup.ts` could resolve a drawing's component path to its stub instead of its
`moved` partner, sending a live SolidWorks read at a path with nothing there when the real file
was one row away; candidate resolution now redirects to the row with content, and the
folder-sibling scan excludes bare stubs outright. `drawingReferenceSync.ts`'s `syncOneDrawing`
turned out to already be safe — nothing on disk at a stub's path means the watcher event that
would reach it is theoretical, and a failed read there writes nothing by design — so it now says
so with an explicit guard instead of leaning on that read failing.

4.3.3 (renderer only — no schema change, no API change) is the release this all builds on: when
a file's local path diverges from the path the vault records, the merge used to drop the server
row entirely, so a folder renamed on one machine looked *empty* to everyone else. It now leaves
a `moved_away` stub at the recorded path naming where the content actually lives
(`src/hooks/useLoadFiles/cloudFileReconciliation.ts`), and the pending-move count that was
always computed but never rendered is visible on the tree row, file row, and grid card. A new
`adopt-server-paths` command (server wins) is the inverse of the terminal-only
`reconcile-moved-paths` (local wins), and a **Resolve Pending Moves** dialog puts both
directions behind a badge and context menu with per-direction preflight. `moved_away` is the
first status where a row can have `pdmData` and no local content, and where a single `files.id`
maps to two rows. Plan and four agent reports: `.cursor/plans/pending-move-visibility-*`; the
4.4.0 work: `.cursor/plans/realign-with-server-*` and `.cursor/plans/realign-4.4.0-foldin-report.md`.

`syncFile`'s primary existence check stays byte-exact and off `get_active_file_by_path` on
purpose — that was a deliberate scope decision for 4.3.1, not an oversight, and paying for a
case-insensitive lookup on every file during a bulk first check-in would slow down the path that
never collides. 4.4.2's duplicate-upload warning does not reverse this: it matches a file about
to be uploaded against rows the batch already has loaded in memory, by name and size, and adds no
per-file server query of any kind — it is advisory scaffolding in front of the same existence
check, not a change to what that check does or costs.

**Closed, do not reopen without new evidence:** cleaning up "orphaned" `files` rows from the
pre-4.3.0 move handling. The diagnosis was finally run against production and the premise did
not survive it — the 1,324 rows its `superseded_high_confidence` bucket flagged in `br-vault`
are archive snapshots, revision branches, design variants, release copies, RFQ packages and
vendored firmware trees, all backed by files really on disk, and its survivor rule would have
kept `_ARCHIVE` over live `DEVELOPMENT`. Content hashing cannot distinguish a stale row from
intentional duplication, which a CAD vault is full of. Path divergence is only detectable where
the disk is visible, which is the client — that is what 4.3.3's `moved` / `moved_away` handling
now does. Full verdict and the disproof at the top of
`.cursor/plans/orphaned-file-rows-report.md`; read-only queries to reproduce in
`.cursor/plans/orphaned-file-rows-runbook.sql`.

Plans and agent reports live in `.cursor/plans/`. Never create a plan outside the repository.

## Commands

Test suites and typechecks run on the Modal cloud test runner, not on this machine: see
`.cursor/rules/testing.mdc` for the commands. The npm scripts below are what those runs execute.

```bash
npm run typecheck      # renderer + electron; must pass before any tag
npm run typecheck:api  # api/ only
npm run check:all      # typecheck (the cloud runner's `check` gate)
npm run test           # vitest run
npm run lint           # eslint
npm run dev            # vite dev server
npm run gen:types      # regenerate src/types/supabase.ts (requires the schema applied)
```

## Rules

The authoritative conventions are the Cursor rule files, imported here so they load
automatically:

@.cursor/rules/always.mdc
@.cursor/rules/architecture.mdc
@.cursor/rules/style.mdc
@.cursor/rules/react.mdc
@.cursor/rules/zustand.mdc
@.cursor/rules/database.mdc
@.cursor/rules/electron.mdc
@.cursor/rules/solidworks-service.mdc
@.cursor/rules/plans.mdc
@.cursor/rules/testing.mdc

The points that most often get violated:

- **Schema changes require two files.** Bump `schema_release_version()` in `supabase/core.sql`
  *and* `EXPECTED_SCHEMA_VERSION` in `src/lib/schemaVersion.ts`, and register new objects in
  `schema_release_manifest()`. There are no migration files — `supabase/core.sql` and
  `supabase/modules/*.sql` are edited in place and must stay idempotent. Never write
  `schema_version` directly and never push SQL from a terminal command; the user applies it in
  the Supabase SQL editor.
  Apply order is always `core.sql` first, then modules `10` through `50` in order (then any
  installed native extension's own SQL, such as Customers' `sql/customers.sql`): applying core after
  module 40 once left production with core's drifted `claim_pending_membership`
  (`.cursor/plans/schema-103-production-apply.md`). A nightly cloud routine (08:00 UTC) may apply a
  finished schema release from `main` behind an independent review, so land a schema bump on `main`
  only when it is ready for production.
- **API changes require two files.** Bump `version` in `api/package.json` and
  `EXPECTED_API_VERSION` in `src/lib/apiVersion.ts`, with an `API_VERSION_DESCRIPTIONS` entry.
- **State goes in `usePDMStore` slices.** Never create a new Zustand store.
- **No `console.log`** in production code — use `log.*` (Pino in the API).
- **No hardcoded user-facing strings** — use `t()` from `src/lib/i18n`. A new namespace gets every
  locale in `src/lib/i18n/locales/` plus a test asserting it (see `resolveMovesKeys.test.ts`). Keys
  added to an existing English-only namespace such as `contextMenu` go in `en.ts` only, since other
  locales fall back to English per key. `newKeys.test.ts` checks only its own key list, not every
  locale.
- **No `any`.** Canonical domain types live in `src/types/`; `src/types/supabase.ts` is generated
  and must not be hand-edited.
- **Move, rename, and delete files with real filesystem operations**, never by writing a new file
  and deleting the old one.
- Files over 1,000 lines should be split; over 1,500 lines must be split before adding to them.
