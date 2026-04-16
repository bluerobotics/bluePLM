![1775066225939](image/REPORT/1775066225939.png)![1775066227408](image/REPORT/1775066227408.png)![1775066234402](image/REPORT/1775066234402.png)# BluePLM![1775066274977](image/REPORT/1775066274977.png)![1775066276319](image/REPORT/1775066276319.png)

## Introduction

BluePLM is a free and open-source PLM system, designed primarily for teams using SolidWorks or other non-cloud mCAD and eCAD systems.

Since the downfall of GrabCAD Workbench, there has been no free engineering file management system, which leaves many engineering teams relying on SolidWorks PDM. SolidWorks PDM is robust, but slow, outdated, and expensive for the feature set it delivers.

## Scope

### Source file management

  File explorer with folder organization
  Check-in / check-out system with conflict and file corruption prevention
  Fully featured file operations (rename, move, delete local/server, copy, etc.)
  Item numbering, revision control, versioning, and full version history
  File metadata, comments, watchers, and share links
  Automated and scheduled backups with backup machine management
  Trash and file recovery
  Pending changes view
  PDF preview and annotation
  Drag-and-drop file operations
  Deep integration with SolidWorks via the SolidWorks API (dedicated .NET service)

### Workflows and change control

  Configurable workflow templates with states, transitions, gates, and roles
  File reviews and approval routing
  ECO and ECR system with checklists, gate approvals, and activity tracking
  Deviations management
  Process templates with phased execution

### BOM and item management

  Product and BOM structures
  Release file tracking

### Supply chain

  Supplier and supplier contact management
  Pre-production RFQ creation and tracking
  Quoting, costing, and technical specification management

### Organization and access control

Each organization runs on its own Supabase project — separate database, separate storage, separate auth. Organizations do not share infrastructure and have no awareness of each other. There is no central server or shared tenancy; each deployment is fully isolated.

  Team and role structures with permission presets
  Granular per-user and per-team permissions
  Team-based vault access control
  Member invitations and onboarding
  Job title assignment
  Blocked user management
  Admin recovery codes and session management
  Company profile and sign-in method configuration
  Organization-level defaults (checkout enforcement, part number prefixes, email domain restrictions, module visibility)
  Serialization and export settings
  File metadata column configuration
  RFQ settings
  Notifications (in-app toasts, review badges, teammate notify, Slack)

### Search and navigation

  Command palette with global search
  Tabbed workspaces with pinning and tab groups
  Customizable keybindings
  Activity feed and history timeline

### Integrations

  Google Drive integration
  Slack notifications
  Odoo connector with sync logging
  Webhook system with delivery tracking
  REST API with Swagger/OpenAPI documentation

### Extensions

  Extension store (browse, install, update, sideload)
  Sandboxed extension host with permissioned APIs
  Per-org extension config, secrets, storage, and HTTP logging

### Desktop application

  Auto-updates
  Deep link support (`blueplm://`)
  In-app terminal and CLI
  Realtime updates via Supabase subscriptions
  Theming (dark mode, seasonal themes)
  Localization (multiple locales)

### Developer tools

  Performance monitoring and FPS gauge
  Telemetry dashboard
  Log viewer
  File operation timing
  Reference diagnostics (SolidWorks assembly debugging)
  Test runner

## Security

Authentication is handled by Supabase Auth. Users sign in via email, phone, or Google OAuth — configurable per organization. The desktop app holds a JWT session that is passed directly to the Supabase client. The Fastify API validates Bearer JWTs in middleware and creates a per-request Supabase client scoped to the authenticated user.

Row Level Security is enforced on every table in the database. Policies scope all reads and writes to the user's organization via `org_id`, with admin-only restrictions on sensitive operations (team management, permissions, integrations, recovery codes). Permission checks are implemented as `SECURITY DEFINER` Postgres functions so they cannot be bypassed by the client.

The API layer adds Helmet security headers, configurable CORS origins, and rate limiting. Webhook secrets are stored per-webhook and used to sign outgoing payloads. Integration credentials (Odoo API keys, Google Drive client secrets) are stored encrypted in the database. Extension secrets use AES-256-GCM encryption with version history, and all secret access is audit-logged.

The Electron app enforces single-instance locking to prevent duplicate processes and stale PID conflicts. Error tracking is handled by Sentry in both the main and renderer processes.

## Data integrity

Files are tracked with a `content_hash` on both the `files` and `file_versions` tables. On checkin, the client passes the new content hash and file size, which are recorded atomically in the checkin RPC alongside the version bump, lock release, and activity log entry. This ensures the version record always reflects the actual file content at the time of checkin.

The checkout system uses a database-level lock — `checked_out_by`, `checked_out_at`, and the machine ID are set atomically with `SELECT ... FOR UPDATE` row locking in the checkout RPC. If another user already has the file checked out, the operation is rejected before any writes occur. This prevents concurrent edits and overwrites.

File operations that need atomicity (checkout, checkin, state transitions, gate approvals) are all implemented as single Postgres RPCs rather than multi-step client calls, so partial failures cannot leave the database in an inconsistent state.

## Backups

Backups use Restic under the hood, with the repository stored in a cloud object storage bucket. Supported providers are Backblaze B2, AWS S3, and Google Cloud Storage. Credentials and the Restic repository password are stored encrypted in the `backup_config` table.

One machine in the organization is designated as the backup source. That machine runs a background service that polls for backup requests and executes scheduled backups. Other machines can trigger a backup remotely if the designated machine is online. Backup locking prevents concurrent runs.

Backups are per-vault. The designated machine iterates over selected vaults and runs Restic against each vault's local file path. Snapshots are listed, restored, and deleted directly through Restic via Electron IPC. Retention policies are configurable (daily, weekly, monthly, yearly).

Restores pull files from a Restic snapshot back to the vault's local path. If the snapshot contains a database metadata export, it is automatically imported — restoring file records, version history, and associated metadata into the database.

Backup history, machine registration, and scheduling are all tracked in the database. The schedule supports configurable hour, minute, and timezone, checked against the designated machine's polling loop.

## Framework

| Layer | Technology |
| --- | --- |
| Deployment | Electron |
| Build | Vite |
| Language | TypeScript |
| Frontend | React 19 |
| State management | Zustand |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres) |
| API | Fastify |
| CAD service | .NET |
| Docs | VitePress |
| Testing | Playwright |
| Error tracking | Sentry |

### Libraries

**UI**

- `react` / `react-dom` — UI framework
- `zustand` — State management
- `lucide-react` — Icon set
- `@tanstack/react-virtual` — Virtualized lists

**Data & networking**

- `@supabase/supabase-js` — Database client, auth, storage, and realtime
- `fastify` — HTTP server
- `@fastify/cors` — CORS middleware
- `@fastify/helmet` — Security headers (API)
- `@fastify/rate-limit` — Rate limiting (API)
- `@fastify/swagger` / `@fastify/swagger-ui` — OpenAPI spec and docs UI (API)
- `fastify-plugin` — Plugin encapsulation helper (API)
- `@sinclair/typebox` — JSON Schema type builder (API)
- `zod` — Runtime schema validation

**Desktop & system**

- `electron-updater` — Auto-updates
- `@sentry/electron` — Error tracking (main + renderer)
- `chokidar` — Filesystem watcher
- `systeminformation` — Hardware and OS info

**File handling**

- `jszip` — ZIP archive read/write
- `cfb` — Compound Binary File parsing (SolidWorks native files)
- `pdfjs-dist` — PDF rendering
- `node-addon-api` — Native C++ bindings (eDrawings preview)

**Utilities**

- `date-fns` — Date formatting and arithmetic
- `pino-pretty` — Structured log formatting

**Dev tooling**

- `vite` / `vite-plugin-electron` — Bundler with Electron integration
- `typescript` / `typescript-eslint` — Type system and typed linting
- `eslint` / `prettier` — Linting and formatting
- `playwright` — End-to-end testing
- `electron-builder` — App packaging and signing
- `tailwindcss` / `postcss` / `autoprefixer` — CSS toolchain
- `vitepress` — Documentation site generator
- `sharp` / `png-to-ico` — Image processing for build assets
- `patch-package` — Post-install patch application

### Project structure

The repository is a monorepo with five main codebases and several supporting folders.

- `src/` — React frontend (Electron renderer). Feature-based architecture with vertical slices.
  - `app/` — Entry point
  - `components/` — Shared UI: `core/`, `layout/`, `shared/`, `effects/`
  - `features/` — Nine self-contained modules: source, settings, search, change-control, supply-chain, integrations, items, extensions, dev-tools
  - `stores/` — Single Zustand store composed of slices
  - `hooks/`, `lib/`, `types/`, `constants/` — Shared hooks, utilities, types, and constants
- `electron/` — Electron main process. IPC via contextBridge only.
  - `handlers/` — IPC channel implementations
  - `services/` — Background processes (backup agent, file watcher)
  - `extension-host/` — Sandboxed extension runtime
- `api/` — Fastify REST API.
  - `routes/` — REST endpoints including integration-specific routes
  - `middleware/` — JWT auth, rate limiting
  - `schemas/` — Request/response validation
  - `utils/` — Supabase client factory, webhook dispatch
- `supabase/` — Database schema and migrations.
  - `core.sql` then numbered modules (`10-source-files`, `20-change-control`, `30-supply-chain`, `40-integrations`, `50-extensions`)
  - `migrations/` — Incremental changes
  - `tools/` — Reset and verification scripts
- `solidworks-service/` — .NET CAD integration service
- `docs/` — VitePress documentation site
- `tests/` — Playwright end-to-end tests
- `scripts/` — Build tooling
- `native/` — C++ eDrawings preview

### Self-hosting

BluePLM follows a single-tenant model. Each organization provisions their own Supabase project and optionally their own API instance. The desktop app connects to the organization's Supabase URL and anon key, which are configured during first-run setup or distributed via an org invite code. The API can be deployed via Docker, Railway, Render, or Fly.io — each org manages their own deployment. There is no shared backend, no central registry, and no cross-org data access.

### Realtime

BluePLM uses Supabase Realtime (Postgres logical replication) to push changes to all connected clients instantly. The app subscribes to seven channels per organization:

  Files — checkout locks, version bumps, state changes, metadata updates. This is the most critical channel; checkout lock changes propagate in under 100ms so users see immediately when a file is locked by someone else.
  Activity — new activity log entries (checkins, state changes, comments).
  Organization — org settings changes (so admin changes propagate to all users without refresh).
  Vaults — vault creation, updates, and deletion.
  Permissions — vault access grants, team membership changes, user permission updates, and workflow role assignments. When permissions change, affected users see their access update in real-time.
  Member changes — team member, workflow role, and job title assignment changes (propagated to admin views so multiple admins see each other's edits).
  Color swatches — shared color palette changes.

On the database side, each table that participates in realtime has `REPLICA IDENTITY FULL` set (so the old row is included in change events) and is added to the `supabase_realtime` publication. This covers files, activity, vaults, vault access, teams, team members, team permissions, notifications, ECOs, reviews, deviations, checklist items, gate approvals, suppliers, RFQs, webhooks, integrations configs, SolidWorks licenses, and installed extensions.

### Data access

The desktop app talks to Supabase directly — Postgres queries, RPCs, Storage, and Realtime subscriptions all go straight from the Electron client to the organization's Supabase project. This is the primary data path for all interactive use: browsing files, checking in/out, managing workflows, org settings, etc.

The Fastify API is a separate, optional layer. It provides a REST interface with Swagger docs, rate limiting, and JWT auth for external integrations that cannot use the Supabase client directly. It covers the same data (vaults, files, checkout/checkin, parts, suppliers, activity, webhooks) but is not in the critical path for daily app use. The API also handles webhook dispatch and integration-specific logic for Odoo.

Large file transfers go through Supabase Storage in both cases. The API returns signed URLs rather than streaming file content through itself.

There is no central router that decides API vs direct — features that need the integration server (Odoo sync, Slack, webhooks, email invites) call the API URL if the org has one configured. Everything else uses the Supabase client.

### Data sources

All data originates from or flows through five categories:

**Supabase (Postgres)** — PostgREST, RPCs, and Realtime. Read and write. All application state: files, vaults, workflows, users, orgs, permissions, activity, supply chain, integrations config, extension storage. This is the single source of truth.

**Supabase Auth** — HTTPS with JWTs. Read and write. User identity, sessions, OAuth tokens. Linked to public.users via auth.users.id.

**Supabase Storage** — HTTPS with signed URLs. Read and write. Vault file blobs. Each vault maps to a storage bucket (vaults.storage_bucket). The API returns signed URLs rather than proxying file content.

**Local filesystem** — Electron IPC. Read and write. Working copies of vault files synced to vaults.local_path. SolidWorks and other CAD tools operate on these local copies.

**Restic backup targets** — S3-compatible, B2, or GCS. Write for backup, read for restore. Encrypted file snapshots. Credentials stored in backup_config. One designated machine per org runs the backup agent.

External services the API connects to (outbound only):

**Odoo** — XML-RPC over HTTPS. Triggered by user-initiated sync from the Integrations UI (/integrations/odoo/sync/*).

**Customer webhook URLs** — HTTPS POST with HMAC signature. Triggered by file and workflow events dispatched by the API.

**Sentry** — HTTPS. Error and performance telemetry from both Electron and API processes.

**GitHub Releases API** — HTTPS. App update checks (AboutSettings).

Nothing phones home to a central BluePLM server. Each organization's Supabase project is the only database, and the optional Fastify API connects to that same project. There is no second database. Cross-org data access is architecturally impossible because every table is scoped by org_id and enforced by Row Level Security.

The desktop app determines which Supabase project to connect to via org setup (URL and anon key stored in localStorage). The API reads SUPABASE_URL and SUPABASE_KEY from environment variables. Both paths terminate at the same Postgres instance.

### Database structure

The schema is written as modular SQL files, applied in order to the organization's Supabase project. All tables use UUIDs as primary keys and are scoped to `org_id` with foreign keys cascading to the `organizations` table. Row Level Security is enabled on every table — policies generally check that the requesting user belongs to the same organization, with admin-only restrictions on write operations where appropriate. Business logic that needs atomicity (checkout, checkin, state transitions) is implemented as Postgres RPCs rather than multi-step client calls.

Schema versioning is handled by a single-row `schema_version` table. The version number is bumped in `core.sql` on every schema change and checked against `EXPECTED_SCHEMA_VERSION` in the app at startup — a mismatch surfaces a warning to the user.

#### `core.sql` — 17 tables

Organizations, users, teams, permissions, and authentication.

  `schema_version`
  `organizations`
  `users`
  `blocked_users`
  `teams`
  `team_members`
  `team_reviewers`
  `team_permissions`
  `permission_presets`
  `user_permissions`
  `job_titles`
  `user_job_titles`
  `pending_org_members`
  `admin_recovery_codes`
  `user_sessions`
  `notifications`
  `color_swatches`

RPCs and triggers handle permission checks, user lifecycle (signup, org join, account deletion, admin removal), member invitations and pending membership claims, user blocking, recovery code usage, org branding, auth provider configuration, and module/column defaults at the org, team, and user level. Default permission teams and job titles are created automatically when an org is created.

#### `10-source-files.sql` — 37 tables

Vaults, files, workflows, and backups.

  `vaults`
  `vault_access`
  `team_vault_access`
  `folders`
  `files`
  `file_versions`
  `release_files`
  `file_references`
  `activity`
  `file_comments`
  `file_watchers`
  `file_share_links`
  `file_metadata_columns`
  `file_state_entries`
  `file_workflow_assignments`
  `workflow_templates`
  `workflow_states`
  `workflow_transitions`
  `workflow_gates`
  `workflow_gate_reviewers`
  `workflow_roles`
  `user_workflow_roles`
  `workflow_state_permissions`
  `workflow_transition_conditions`
  `workflow_transition_actions`
  `workflow_transition_notifications`
  `workflow_transition_approvals`
  `workflow_approval_reviewers`
  `workflow_auto_transitions`
  `workflow_tasks`
  `pending_reviews`
  `pending_transition_approvals`
  `workflow_review_history`
  `workflow_history`
  `revision_schemes`
  `backup_config`
  `backup_history`
  `backup_machines`
  `backup_locks`

RPCs handle atomic checkout/checkin, file state transitions through workflows, and revision scheme management. Realtime is enabled on files, activity, vaults, vault access, and workflow tables.

#### `20-change-control.sql` — 12 tables

ECOs, reviews, deviations, and process templates.

  `ecos`
  `file_ecos`
  `reviews`
  `review_responses`
  `deviations`
  `file_deviations`
  `process_templates`
  `process_template_phases`
  `process_template_items`
  `eco_checklist_items`
  `eco_gate_approvals`
  `eco_checklist_activity`

RPCs handle instantiating process templates onto ECOs, checking gate requirements, approving gates, notifying overdue reviewers, and syncing ECO tags back to files. Realtime is enabled on ECOs, reviews, deviations, checklist items, and gate approvals.

#### `30-supply-chain.sql` — 10 tables

Suppliers, RFQs, and costing.

  `organization_addresses`
  `suppliers`
  `supplier_contacts`
  `supplier_invitations`
  `part_suppliers`
  `rfqs`
  `rfq_items`
  `rfq_suppliers`
  `rfq_quotes`
  `rfq_activity`

RPCs handle best-price lookup across suppliers with price break support and BOM cost rollup across assemblies. Includes a `parts_with_pricing` view and full-text search on suppliers. Realtime is enabled on suppliers, RFQs, RFQ items, and RFQ suppliers.

#### `40-integrations.sql` — 7 tables

External integrations, webhooks, and SolidWorks license management.

  `organization_integrations`
  `integration_sync_log`
  `odoo_saved_configs`
  `webhooks`
  `webhook_deliveries`
  `solidworks_licenses`
  `solidworks_license_assignments`

RPCs handle integration status checks (without exposing credentials), Odoo config retrieval, webhook event routing, Google Drive settings, and full SolidWorks license lifecycle (assign, unassign, activate on a machine, deactivate). Pending org members can have licenses pre-assigned before signup. Realtime is enabled on webhooks, integrations, Odoo configs, and SolidWorks licenses.

#### `50-extensions.sql` — 7 tables

Extension system with sandboxed storage and secrets.

  `org_installed_extensions`
  `org_extension_config`
  `extension_storage`
  `extension_secrets`
  `extension_secret_versions`
  `extension_secret_access`
  `extension_http_log`

RPCs handle config read/write, extension usage stats, and periodic cleanup of HTTP and secret access logs. Secrets are AES-256-GCM encrypted with version history for rollback and a full access audit trail. Realtime is enabled on installed extensions and extension config.

## AI rules (`.cursor/rules/`)

Eight rule files govern how AI agents work in this codebase.

`always.mdc` — Use native Cursor tools for file operations, never shell equivalents. Bump schema and API versions in lockstep across their file pairs on every change; run typecheck before tagging a release.

`architecture.mdc` — Defines the source tree layout and a decision tree for component placement. Features go in `src/features/` as vertical slices with barrel exports; shared UI goes in `src/components/`.

`database.mdc` — Three-step change protocol: update the SQL file, sync the schema version constant, regenerate TypeScript types. Use explicit column selects and error handling in all Supabase queries.

`electron.mdc` — All IPC goes through `window.electronAPI` via contextBridge. Node.js is never exposed to the renderer; context isolation is always on; inputs are validated in the main process.

`plans.mdc` — Multi-agent work uses a single plan file per feature with per-agent ownership boundaries, copy-paste-ready prompts, and a completion report template.

`react.mdc` — Zustand-first state management with prop drilling capped at two levels. Tailwind-only styling using project theme tokens; one component per file.

`solidworks-service.mdc` — Every change must bump the version in both `Program.cs` and `swServiceVersion.ts`, then rebuild with `dotnet build -c Release`.

`zustand.mdc` — One global store (`usePDMStore`) composed of slices; creating new stores is forbidden. Fine-grained selectors required; never select the entire store.
