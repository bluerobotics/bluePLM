# Schema 109: production apply (2026-10-29)

Applied by Claude at the owner's request ("can you do it please", bypass permissions) through the
Supabase Management API (`database/query`), from the files on origin/main at fcad6822. Production
went from 103 to 109 (schemas 104 extensions/Customers out of core, 105 colour swatch scope, 106
SOLIDWORKS licence privacy, 107 server-owned reviews, 108 review upkeep, 109 swatch realtime). The
"BluePLM drawing reviews" session cuts the app release; this session only applied the schema.

## Scope and audit

- `git diff v4.7.6 fcad6822 -- supabase`: core, modules 10, 20, 40, 50 changed; 60-customers.sql
  deleted (Customers moved to a private native extension).
- Read-only production facts first: 1 org, 31 users, 36,982 files, 45,613 versions; reviews 11,
  review_responses 11 (0 null status, 0 duplicate review/reviewer), every priority normalizes,
  `reviews.due_date` timestamptz; color_swatches 0, pending_reviews 0; customers 50,712,
  org_installed_extensions 0.
- Independent review (separate agent, not shown the audit): APPLY WITH CHANGES. No data loss
  (no customer object dropped; `user_can_access_module` kept without CASCADE). Its pre-checks, done:
  `postgres` can create policies on `storage.objects` (probe in a rolled-back transaction); every
  review-table write policy is dropped by name (module 10 drops the pending_reviews and
  workflow_review_history ones, module 20 the reviews/review_responses ones). Its timing note:
  released 4.7.6 cannot create, approve or cancel reviews against 109 (client write policies are
  gone) until users update to the release cut from this main.
- Safety net: daily backup of 2026-10-28 10:42 UTC completed (no PITR). Saved locally before the
  apply: table counts, md5 of all 193 public function definitions and 269 policies, all rows of
  reviews and review_responses.

## Apply

core.sql, modules 10, 15, 20, 30, 40, 50 (each one request), then the Customers extension's
`sql/customers.sql` (extension repo at e6b5b05). All succeeded. The first module 15 request
returned an empty body (dropped connection, nothing running, version still 103); the retry
succeeded. Module 50 stamped 109. `tools/verify-schema.sql` as one request hit Cloudflare's 524
(over 100 s), so its deciding call was run on its own: `verify_and_stamp_schema()` =
`{"stamped":true,"version":109,"problems":[]}`; 112 tables, 270 policies.

## After

- Unchanged: customers and every other customer table, files, file_versions, folders, users,
  activity. file_references 7,891 -> 7,887 (nothing in the diff deletes from it; live check-ins
  replace references).
- New: review_items 11, review_rounds 11, review_round_items 11, review_decisions 1; 0 reviews
  without items. file_version_references and drawing_pdf_renders 0.
- reviews: same 11 rows; only change is `due_date` timestamptz -> date on the two rows that had one.
  review_responses: identical.
- Functions: 36 added, 15 changed, none removed. Policies: 14 added, 9 changed, 13 removed, all
  ones the diff drops (old swatch, review write, extension, licence-visibility policies).

## Left for the owner

- API 3.0.0 is not deployed (Railway CLI here is logged out). Set `NATIVE_EXTENSIONS_ORG_IDS` to
  the org id, redeploy, then install `blueplm.customers-<version>.bpx` (Settings > Extensions >
  Install for organization) so Customers shows in the new app.
