# Schema 110: production apply (2026-10-30)

Applied by Claude at the owner's request ("can you do it") through the Supabase Management API
(`database/query`, token from the main checkout's `.env`), from the files on origin/main at
b40251e7 (the v4.9.0 release commit; schema files as of 3696094c). Production went from 109 to
110: Reviews submenu RPCs, File Workflows setting, review stages that move approved files.

## Scope and audit

- `git diff v4.8.1 origin/main -- supabase`: core, modules 10 and 20. Additive only: two nullable
  columns (`workflow_states.review_approved_state_id`, `review_items.advanced_at` /
  `advanced_to_state_id`), nine new functions, and new checks in `execute_workflow_transition`,
  `review_settle`, `review_items_deleted_resettle` and `import_workflow_graph`. No top-level
  statement deletes, rewrites or drops data.
- Released 4.8.1 keeps working against 110: nothing it reads or writes is removed or restricted.
  File workflows default on (`file_workflows_enabled` unset) and approved review-stage files default
  to hold (`review_stage_on_approval` unset), so no behaviour changes until an admin sets them from
  4.9.0. 4.8.1 shows a non-blocking "database newer than this app" notice.
- Independent review (release review of v4.8.1..b40251e7, schema included): RELEASE; no data-loss
  path, manifest and version files agree.
- Production facts before: version 109; 1 org, 32 users, 37,017 files, 45,707 versions, 2,617
  folders, 226,532 activity; 5 workflow states (0 review stages); 11 reviews (8 open), 11 review
  items; 229 public functions, 270 policies.
- Safety net: daily physical backup 2026-10-29 10:40 UTC completed (no PITR). Saved before the apply
  (session scratchpad): md5 of every public function definition and policy, all rows of
  workflow_states, review_items and organizations.

## Apply

core.sql, modules 10, 15, 20, 30, 40, 50, one request each: all returned 201. Then
`verify_and_stamp_schema()` on its own (the full verify-schema.sql hit Cloudflare's 100 s limit at
109) = `{"stamped":true,"version":110,"problems":[]}`.

## After

- Counts identical to before (files, versions, folders, users, activity, reviews, review items,
  workflow states, policies).
- Functions 229 -> 238: 9 added (exactly the manifest's new ones), 7 changed (`execute_workflow_transition`,
  `import_workflow_graph`, `review_settle`, `review_items_deleted_resettle`, the three
  `schema_release_*`), none removed. Policies unchanged.
- workflow_states and review_items rows identical apart from the new columns (all NULL);
  organizations unchanged.
