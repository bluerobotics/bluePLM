# Changelog

All notable changes to BluePLM will be documented in this file.

## [3.1.0] - 2026-01-07

### Added
- **Clean install on major upgrades**: App data is automatically wiped when upgrading between major versions (2→3, 3→4, etc.) ensuring a fresh start. Clears settings, logs, cache, browser storage, and temp files

### Fixed
- **Vault display consistency**: Fixed issue where file tree and file pane would show files from existing local folders even when no vault was connected in settings. Now consistently shows "No vault connected" state until a vault is explicitly connected via Settings > Vaults

---

## [3.0.2] - 2026-01-07

### Fixed
- **SolidWorks service bundling**: Fixed path in GitHub Actions workflow (`solidworks-addin` → `solidworks-service`) and corrected extraResources glob pattern so the service executable is properly included in Windows builds

## [3.0.0] - 2026-01-07

### Added

#### Architecture
- **Enterprise folder structure**: Reorganized `src/features/` to mirror database modules (source, items, change-control, supply-chain, integrations, dev-tools, settings)
- **Component layer separation**: `components/core/` (primitives), `components/layout/` (app shell), `components/shared/` (reusable), `components/effects/` (visual)
- **Lazy module loading**: Sidebar views and settings panels load on-demand. Disabled modules never load into memory

#### Zustand Store
- **17 specialized slices**: Decomposed monolithic store into focused slices (files, vaults, workflows, settings, UI, etc.)
- **Versioned migrations**: `src/stores/migrations.ts` with version tracking for safe state upgrades
- **Hydration tracking**: `onRehydrateStorage` callback prevents race conditions on app startup

#### API (v2.0.0)
- **Layered architecture**: Separated into core (types, errors), config, infrastructure (repositories), and HTTP layers
- **Repository pattern**: `FileRepository`, `VaultRepository`, `WebhookRepository` with mappers
- **TypeBox schemas**: Full OpenAPI documentation for all endpoints

#### Database (Schema v36)
- **Modular schema**: Split into `core.sql` + optional modules (`10-source-files.sql`, `20-change-control.sql`, `30-supply-chain.sql`, `40-integrations.sql`)
- **Atomic RPC functions**: `checkout_file`, `checkin_file` with `FOR UPDATE` row locks and built-in activity logging
- **Schema version tracking**: Automatic mismatch warnings between app and database versions

#### Performance
- **Concurrency limiting**: `processWithConcurrency()` utility with configurable worker pools (default: 20 concurrent ops)
- **Batch chunking**: `BATCH_CHUNK_SIZE = 100` for bulk database operations
- **SolidWorks optimization**: Skip service calls for files with cached hashes and no pending metadata
- **Fire-and-forget activity logging**: Non-blocking audit trail creation

#### Terminal
- **60+ CLI commands**: Full command system with categories (navigation, search, file ops, PDM, vault, backup, collaboration, admin, batch)
- **Self-registering commands**: `registerTerminalCommand()` with metadata, usage, examples
- **Command categories**: `help` shows commands grouped by function

### Changed
- **Database schema**: v36 with modular architecture
- **Electron**: v39 (Chromium 142, Node.js 22, V8 14.2)
- **React**: v19
- **Zustand**: v5 with slice architecture
- **Checkout/checkin**: Now use atomic PostgreSQL RPCs instead of multi-step client logic

### Fixed
- **Circular dependency crash**: Fixed "Cannot access 'COLUMN_TRANSLATION_KEYS' before initialization" in FilePane
- **Checkout race conditions**: Atomic RPCs with `FOR UPDATE` locks prevent concurrent checkout conflicts
- **Double activity logging**: RPCs handle logging; removed duplicate client-side logging
- **Store hydration races**: Hooks wait for Zustand rehydration before auto-starting services
- **SolidWorks service reliability**: Polling-based startup confirmation, proper cleanup on app quit

### Removed
- **Legacy fileService.ts**: Consolidated into `src/lib/supabase/files/`
- **Duplicate utilities**: Consolidated 9 copies of `buildFullPath`, 6 copies of `formatBytes` into single source
- **Dead code**: `StatusBar.tsx`, `SolidWorksPreviewPanel.tsx`, unused dependencies (@tanstack/react-query, @tanstack/react-table, clsx)
- **In-memory webhooks**: Now database-backed for persistence

---

## [2.22.0] - 2026-01-01

### Added
- **Per-configuration tab numbers**: Parts/assemblies with multiple SolidWorks configs can have different tab numbers per config (e.g., BR-12345-001, BR-12345-002, BR-12345-003). Datacard shows "Base #" (shared) and "Tab #" (per-config) fields with live preview
- **Export configurations from file browser**: Right-click on expanded configuration rows to export STEP/IGES/STL. Supports multi-select with Ctrl+click and Shift+click to export specific configurations
- **Configurable export filenames**: New Settings → Export Options page to customize exported file naming patterns with tokens like `{partNumber}`, `{config}`, `{rev}`, `{date}`, etc. Example: `{partNumber}_Rev{rev}` produces `BR-101011-394_RevA.step`
- **Bulk Refresh Metadata**: Right-click folders or vault header to refresh SolidWorks metadata for all SW files inside. Shows file count before processing
- **Detect highest serial number**: Admins can scan vault to find highest used serial and set counter accordingly (Settings → Serialization → "Scan Vault")
- **Custom profile picture uploads**: Upload profile pictures in Settings > Profile (PNG/JPG/WebP, max 2MB)
- **Log viewer multi-select**: Select multiple entries with checkboxes, Shift+click for range selection, copy with full content

### Changed
- **Electron upgraded to v39**: Major upgrade bringing Chromium 142, Node.js 22, V8 14.2, plus electron-builder 26 and electron-updater 6.7.3
- **SolidWorks datacard redesigned**: Cleaner 3-column layout (preview, properties, export). Config tabs only appear when needed. Service status is now a subtle indicator dot
- **SolidWorks property saving optimized**: "Save to File" now only writes configs with pending changes and uses batch API. Previously wrote all configs individually (N API calls), now makes 1 call for only changed configs
- **Log viewer toolbar**: Compact two-row layout with inline level counts and grouped controls

### Fixed
- **Slow checkout operations**: Fixed 10-20+ second checkouts by fetching machine info once per batch instead of per-file. Activity logging now fire-and-forget
- **SolidWorks drawing revision not syncing**: Fixed Revision property extraction from .slddrw files (incorrect COM interop types)
- **SolidWorks datacard not showing PDM metadata**: Fixed Item #, Description, Revision fields not loading from database
- **File browser not remembering folder**: Current folder now persists across app restarts
- **Avatar images not loading**: Fixed for Chromium 142 with `referrerPolicy="no-referrer"`
- **Security**: Updated systeminformation to fix Windows command injection vulnerability

### Removed
- Cleaned up dead code (`StatusBar.tsx`, `SolidWorksPreviewPanel.tsx`), unused dependencies (@tanstack/react-query, @tanstack/react-table, clsx), and consolidated duplicate utilities (9 copies of `buildFullPath`, 6 copies of `formatBytes`)

---

## [2.21.0] - 2025-12-31

### Added
- **User "last online" tracking**: Users now have a "last online" timestamp visible in member lists and user profiles. Shows relative time (e.g., "5m ago", "Online now") with a clock icon on its own line for cleaner layout
- **Real-time last online sync**: The "last online" timestamp now updates every 30 seconds via heartbeat, so it stays in sync with the online indicator in the top right
- **Team module defaults in Members & Teams**: Each team now has a "Modules" button to configure which modules are enabled by default for team members. If a user is in multiple teams, they get the union of all enabled modules (if any team enables a module, it's enabled)
- **Full module configuration per team**: Team module defaults now use the same full editor as Settings > Modules. Teams can have their own module order, custom groups, dividers, sub-menus (parent-child relationships), and icon colors - not just enable/disable toggles

### Fixed
- **Auth provider settings not respected on sign-in**: Sign-in screen now respects organization's auth provider settings. If admin disables email/phone sign-in, those options are hidden from the sign-in screen
- **User simulation not respecting team restrictions**: When simulating a user (admin feature), the sidebar now correctly shows only modules enabled for the simulated user's teams, and vaults are filtered based on the team's vault access. This works for both active and pending users
- **Backups failing due to stale repository locks**: Backups now automatically clear stale locks before starting and before applying retention policy. Previously, if a backup was interrupted, subsequent backups would fail with "repository is already locked" error

### Changed
- **Members & Teams UI improvements**: Teams and users in the Members & Teams settings now have a cleaner look with subtle ring borders, hover highlights, and colored left borders on team headers. Expanded teams have a prominent drop shadow effect on all sides to visually "pop out" from surrounding content
- **Team-based permissions architecture**: Admin status is now determined by membership in the "Administrators" team instead of the legacy `role` column. All permissions flow through the team system. The `role` column is deprecated but retained for backward compatibility
- **Lazy loading for modules**: All sidebar views and settings panels are now lazy loaded using React.lazy(). Disabled modules are never loaded into memory, and views are only loaded when navigated to. This significantly reduces memory usage for users who don't need all features
- **Group toggles in Modules settings**: Custom groups can now be toggled on/off. Disabling a group hides all modules within it from the sidebar
- **"In Development" modules can be toggled**: Modules marked as "In Development" (previously "Coming Soon") can now be enabled/disabled. They appear slightly greyed out in settings and show an "In Dev" badge in the sidebar
- **Inline vault selector for Source Files permissions**: In both "View Net Permissions" modal and team permissions editor, the vault selector is now inline within the Source Files section instead of a global dropdown. Only Source Files permissions are vault-specific; other modules show global permissions
- **Schema version**: Bumped to v24

### Removed
- **Performance Processes tab**: Removed the non-functional "Processes" tab from Performance settings. Module memory tracking was causing performance issues and has been replaced with lazy loading instead
- **Role impersonation from dev tools**: Removed the deprecated Admin/Engineer/Viewer role impersonation feature. User impersonation (simulating a specific user's permissions) remains available for admins
- **Deprecated TeamsSettings and MembersSettings**: Removed the orphaned separate Teams and Members settings pages. All team/member management now goes through the unified "Members & Teams" settings tab

---

## [2.20.3] - 2025-12-31

### Fixed
- **In-app update crashing on macOS**: Fixed auto-update install crashing on Mac. Replaced problematic `quitAndInstall` with `app.relaunch()` + `app.exit()` which is more reliable on macOS

---

## [2.20.2] - 2025-12-31

### Fixed
- **Pending users showing in main list**: Fixed in both MembersSettings and TeamMembersSettings views - users who haven't signed in yet now only appear in "Pending Members" section

---

## [2.20.1] - 2025-12-31

### Fixed
- **Pending users showing in main list**: Users who haven't signed in yet (still pending) now only appear in "Pending Members" section, not duplicated in the main user list

---

## [2.20.0] - 2025-12-31

### Added
- **Per-vault permissions**: Teams and individual users can now have different permission levels per vault. Set "All Vaults (Global)" for org-wide permissions, or select a specific vault for vault-scoped permissions. Example: Engineering team can have admin on Production vault but view-only on Archive vault

### Changed
- **Schema version**: Bumped to v20
- **Permission functions**: `get_user_permissions` and `user_has_permission` now accept optional `vault_id` parameter for vault-scoped checks

---

## [2.19.3] - 2025-12-31

### Fixed
- **User record not created after account deletion**: Fixed critical bug where signing in after "Delete Account" would fail to create the user record in `public.users`. The `ensure_user_org_id` RPC now creates the user record if the auth trigger failed, and applies pending team memberships

### Changed
- **Schema version**: Bumped to v19

---

## [2.19.2] - 2025-12-31

### Fixed
- **Invited users added to wrong team**: Fixed bug where users invited with specific teams (e.g., "Doris") were also incorrectly added to "New Users" team. Now only adds to default team if user has no team memberships yet

### Changed
- **Schema version**: Bumped to v18

---

## [2.19.1] - 2025-12-31

### Changed
- **Admin remove user fully deletes**: Removing a user from the organization now fully deletes them from `auth.users`, allowing clean re-invites without "user already registered" errors
- **Schema version**: Bumped to v17

---

## [2.19.0] - 2025-12-31

### Fixed
- **Multi-vault display bug on sign-in**: Fixed issue where the second vault would show the first vault's files until manually selecting each vault. Root cause was the working directory not updating when `activeVaultId` changed, and stale closure issues in the auto-connect flow
- **Invited users can't see teams/roles**: Fixed critical bug where `handle_new_user` didn't include `org_id` in the `ON CONFLICT UPDATE` clause, so returning users with pending invites never had their org assigned

### Changed
- **Schema version**: Bumped to v13

---

## [2.18.3] - 2025-12-31

### Added
- **Block user feature**: Admins can now block users from the organization. Blocked users cannot rejoin via org code and need an explicit re-invite
- **Regenerate org code**: Admins can regenerate the organization code/slug for security, invalidating all existing org codes

### Fixed
- **Invite flow 403 error**: Fixed RLS policy that queried `auth.users` directly (permission denied). Now uses `auth.jwt()` to get email from JWT token
- **Case-insensitive email matching**: All invite-related email comparisons are now case-insensitive (RLS policies, triggers, and client queries)
- **Re-invite after removal**: When removing a user from the org, their pending invite is now cleaned up properly, allowing them to be re-invited
- **API invite validation**: API now uses case-insensitive email matching and properly cleans up old invites before creating new ones

### Changed
- **Schema version**: Bumped to v12

---

## [2.18.2] - 2025-12-31

### Fixed
- **Backup scheduler not triggering**: Fixed React closure bug where scheduled backups never ran because the scheduler was checking stale config state instead of fetching fresh data from the database

---

## [2.18.1] - 2025-12-31

### Fixed
- **Non-admin inline edit buttons**: Team and workflow role badges are now non-interactive for non-admins (previously appeared clickable but saves would silently fail)

---

## [2.18.0] - 2025-12-31

### Added
- **Realtime permissions sync**: Vault access, team membership, and permission changes now sync instantly without refresh
  - When an admin changes your vault access, you see the update immediately
  - Team membership changes apply in real-time
  - Role changes (admin→engineer, etc.) reflect immediately
  - Toast notifications inform users when their access changes

### Fixed
- **Invite flow not associating organization**: Fixed RLS policy that prevented new users from seeing their pending invite (schema v8)
- **Pending membership not applying on re-login**: Fixed triggers to fire on UPDATE, not just INSERT, so users who failed initial login can retry (schema v9)
- **Ambiguous column reference in triggers**: Fixed `apply_pending_team_memberships` function variable naming conflict

### Changed
- **Schema version**: Bumped to v9

---

## [2.17.5] - 2025-12-31

### Added
- **Change Organization option**: Added "Change Organization" link on sign-in screen to clear stored config and return to setup

---

## [2.17.4] - 2025-12-31

### Changed
- **Schema version**: Bumped to v7 (was missing from v2.17.2/v2.17.3)

---

## [2.17.3] - 2025-12-31

### Added
- **Unassigned users visibility**: Users without teams now show a prominent yellow "Unassigned" badge
- **Default team warning**: Shows warning in Teams tab when no default team is set (users will have no permissions)

### Improved
- **Default team dropdown**: Clearer "Unassigned (no team permissions)" option text

---

## [2.17.2] - 2025-12-31

### Added
- **Default Team for New Users UI**: Admins can now select which team new users are added to in Settings → Team Members → Teams tab
- **Invited users without teams get default team**: Users invited without specific team assignments are now added to the default team (if configured)

### Fixed
- **Schema migration for existing orgs**: Running schema now creates default teams for existing organizations that don't have them

---

## [2.17.1] - 2025-12-31

### Fixed
- **Org code missing slug**: `generateOrgCode` now always includes the organization slug from the current org
- **Legacy org codes without slug**: Added fallback — if org code has no slug but there's only one organization in the database, automatically join it
- **Root cause of "no organization found"**: Users with non-matching email domains and no pending invite can now join via the org slug embedded in org codes

---

## [2.17.0] - 2025-12-31

### Added
- **"New Users" default team**: New organizations automatically get a "New Users" team with Engineer-level permissions
- **Org code join flow**: Users entering an org code can now sign in without a pre-created invite — they're automatically added to the org and default team
- **`join_org_by_slug` RPC**: Database function for joining an organization via org slug (from org code)
- **`default_new_user_team_id` setting**: Admins can configure which team new users (joining via org code) are auto-added to

### Fixed
- **Invited users auth flow**: `on_auth_user_created` trigger now fires on INSERT **and** UPDATE (fixes issue where `inviteUserByEmail` creates auth.users first, then user signs in)
- **Delete account now hard deletes**: `delete_user_account` actually removes records from `auth.users` and `public.users` instead of just soft-deleting
- **Pending membership role handling**: Improved logging shows exact role being assigned from pending_org_members
- **Backup RPC call**: App now calls `apply_pending_team_memberships` RPC as fallback if DB trigger doesn't fire

### Changed
- **Schema version**: Bumped to v6
- **Email domain enforcement**: `join_org_by_slug` respects email domain restrictions if configured

---

## [2.16.10] - 2025-12-30

### Fixed
- **New user auth race condition**: Added retry logic when fetching user profile (handles trigger timing)
- **Invited users not linked to org**: Now checks `pending_org_members` directly if trigger didn't run
- **Session registration fails for new users**: Added retry logic with helpful error message
- **Stuck spinners**: Users now see proper "No Organization Found" screen with helpful guidance

### Changed
- **Invite email button**: Links directly to blueplm.io/downloads instead of auth confirmation URL

---

## [2.16.9] - 2025-12-30

### Added
- **API version tracking**: App now checks if deployed API version matches expected version, shows warnings in Settings → API if outdated

---

## [2.16.8] - 2025-12-30

### Added
- **Invite email includes org code**: Users now receive the Organization Code directly in their invite email — no need to ask admin
- **Email delivery docs**: Added SMTP setup guide (Resend/SendGrid) to prevent invite emails going to spam

### Fixed
- **Re-invite users**: API now automatically cleans up stale auth users when re-inviting, fixing "user already exists" errors
- **API startup logging**: Shows whether service key is configured for invites

### Changed
- **Invite flow**: "Confirm & Download" button redirects to blueplm.io/downloads after account confirmation
- **Email template**: Updated invite template displays org code with copy-friendly formatting

---

## [2.16.7] - 2025-12-30

### Fixed
- **Schema version mismatch**: Updated app to expect schema v3 (was incorrectly set to v1, causing "database newer than app" warnings)

---

## [2.16.6] - 2025-12-30

### Added
- **Sign-In Methods settings**: Admins can control which authentication providers (Google, Email, Phone) are available for team members and suppliers

---

## [2.16.5] - 2025-12-30

### Added
- **Documentation site**: VitePress-powered docs at docs.blueplm.io with auto-deploy on release
- **Docs content**: Getting started guides, admin/user setup, source files, and settings documentation

### Fixed
- **Build**: Isolated docs dependencies to prevent conflicts with API Docker build

---

## [2.16.2] - 2025-12-30

### Changed
- **Schema version**: Bumped to v2 for workflow_roles, job_titles, pending_org_members, vault_users tables

---

## [2.16.1] - 2025-12-30

### Fixed
- **User invite**: Added REST API deployment step to main README and API docs (SUPABASE_SERVICE_KEY required for invite emails)

---

## [2.16.0] - 2025-12-29

### Added
- **Members settings redesign**: Tabbed UI with Users, Teams, Roles, and Titles tabs - each with search and full CRUD
- **Vault access enforcement**: Non-admins only see vaults they have access to; auto-disconnect on revoked access
- **Job Titles**: Display labels for users with inline assignment, create/edit/delete from modal
- **Workflow Roles inline**: Edit user roles directly from user rows; create/edit/delete with color/icon pickers
- **Default Permission Teams**: New orgs get Viewers/Engineers/Administrators with pre-configured permissions
- **Delete Account**: Users can permanently delete their account (Settings → Account) with type-name confirmation
- **Realtime settings sync**: Admin settings changes sync instantly to all connected users
- **Sentry user tracking**: Hashed user/org IDs in error reports (privacy-preserving, consent-based)

### Changed
- **Permissions simplified**: All permissions flow through team membership (removed role selection from dialogs)
- **Create User**: Now includes vault restrictions and optional invite email
- **Email auto-join removed**: Users join via pre-created accounts or organization code only

### Improved
- **Network resilience**: Auto-retry with exponential backoff; friendly error messages for connection issues

### Fixed
- **Clipboard**: Fixed "Write permission denied" in packaged app using Electron native API
- **Contribution count**: Accurate totals (previously capped at 1000)
- **Pending view**: SolidWorks temp files (`~$...`) now hidden
- **Light theme contrast**: Improved visibility of status colors, contribution grid, and UI indicators

---

## [2.15.0] - 2025-12-28

### Added
- **Workflow Roles**: Custom approval roles (Design Lead, QA Manager, etc.) assignable to states, transitions, and gate reviewers
- **Advanced Workflow Features**: State permissions, transition conditions/actions, revision schemes, auto-transitions, workflow tasks, transition approvals, and audit history
- **Workflow Canvas**: Right-click to create states, infinite canvas, elbow paths with draggable handles, connection point snapping, snap-to-grid/alignment with visual guides
- **History navigation**: Click history entries to reveal files in browser
- **Schema version checking**: Startup warnings for database migrations, status in Settings

### Changed
- **Workflow model simplified**: Gates replaced with transition approvals (industry-standard)

### Fixed
- Sidebar submenu animation drift
- Workflow: drag-to-connect, elbow paths, transition persistence, spline perpendicularity, control points, color picker layout

---

## [2.14.2] - 2025-12-28

### Fixed
- **Recursive subassembly fetching**: Fixed "too many connections" and performance issues
  - Batch queries with chunking (50 items at a time)
  - Proper connection management in recursive loops
  - ~10x faster for large assemblies
- **File metadata refresh**: Metadata now properly refreshes after file operations
  - Observer pattern notifies FileBrowser of changes
  - Timestamps and statuses update without page reload
- **File locking edge cases**: Better handling of lock/unlock failures
  - Graceful degradation when lock already held
  - Clear error messages for permission issues

---

## [2.14.1] - 2025-12-27

### Fixed
- **Subassembly support**: Deep recursive loading for multi-level assemblies
- **File status indicators**: Real-time sync status icons in file browser
- **Search performance**: Debounced search with proper cleanup

---

## [2.14.0] - 2025-12-27

### Added
- **Bill of Materials (BOM)**: Generate and export BOMs from assemblies
- **File comparison**: Side-by-side diff view for file versions
- **Bulk operations**: Select multiple files for batch checkout/checkin

### Changed
- **File browser redesign**: Tree view with drag-and-drop support
- **Settings organization**: Grouped into logical categories

---

## [2.13.0] - 2025-12-26

### Added
- **Workflow Designer**: Visual canvas for creating approval workflows
- **Custom states**: Define workflow states with colors and icons
- **Transition rules**: Configure who can move files between states

### Fixed
- **Memory leaks**: Proper cleanup of event listeners and subscriptions
- **Offline mode**: Better handling of network disconnection

---

## [2.12.0] - 2025-12-25

### Added
- **Team permissions**: Granular permission system based on team membership
- **Vault access control**: Restrict vault visibility per user/team
- **Activity feed**: Real-time updates of organization activity

### Changed
- **Authentication flow**: Simplified login with magic links
- **User onboarding**: Guided setup for new organizations

---

## [2.11.0] - 2025-12-24

### Added
- **SolidWorks integration**: Native add-in for direct PDM operations
- **eDrawings viewer**: Built-in 3D preview for CAD files
- **Thumbnail generation**: Automatic preview images for supported formats

### Fixed
- **Large file uploads**: Chunked uploads for files over 50MB
- **Version conflicts**: Better merge resolution for concurrent edits

---

## [2.10.0] - 2025-12-23

### Added
- **RFQ module**: Request for Quote generation and tracking
- **Supplier management**: Vendor database with contact info
- **Part costing**: Track costs and pricing history

### Changed
- **Database schema**: Optimized indexes for faster queries
- **API performance**: Reduced response times by 40%

---

## [2.9.0] - 2025-12-22

### Added
- **Custom fields**: User-defined metadata fields for files
- **Search filters**: Advanced search with field-specific filters
- **Export options**: CSV and Excel export for reports

### Fixed
- **File sync conflicts**: Improved conflict detection and resolution
- **UI responsiveness**: Fixed lag in large file listings

---

## [2.8.0] - 2025-12-21

### Added
- **Notifications**: In-app notifications for file changes and mentions
- **Comments**: Thread-based discussions on files and versions
- **@mentions**: Tag users in comments for notifications

### Changed
- **Navigation**: Streamlined sidebar with collapsible sections
- **Dark mode**: Improved contrast and readability

---

## [2.7.0] - 2025-12-20

### Added
- **Version history**: Complete audit trail of all file changes
- **Rollback**: Restore files to any previous version
- **Compare versions**: Visual diff between file versions

### Fixed
- **Download resumption**: Resume interrupted downloads
- **Upload validation**: Better file type and size checks

---

## [2.6.0] - 2025-12-19

### Added
- **Multi-vault support**: Manage multiple storage vaults per organization
- **Vault migration**: Move files between vaults
- **Storage analytics**: Track usage per vault and user

### Changed
- **File organization**: Folders now support nesting up to 10 levels
- **Search scope**: Search across all vaults or specific vault

---

## [2.5.0] - 2025-12-18

### Added
- **Google Drive integration**: Sync files with Google Drive folders
- **Auto-sync**: Automatic synchronization on file changes
- **Conflict resolution**: Handle sync conflicts gracefully

### Fixed
- **OAuth flow**: Fixed token refresh issues
- **Large folder sync**: Pagination for folders with 1000+ files

---

## [2.4.0] - 2025-12-17

### Added
- **Part numbering**: Configurable serial number schemes
- **Auto-increment**: Automatic part number generation
- **Number validation**: Prevent duplicate part numbers

### Changed
- **Part creation flow**: Streamlined form with smart defaults
- **Validation rules**: Configurable per organization

---

## [2.3.0] - 2025-12-16

### Added
- **Organization settings**: Company profile, logo, and branding
- **User management**: Invite, remove, and manage user roles
- **Audit logging**: Track all administrative actions

### Fixed
- **Permission checks**: Consistent enforcement across UI
- **Session handling**: Fixed logout issues on token expiry

---

## [2.2.0] - 2025-12-15

### Added
- **File preview**: In-browser preview for images, PDFs, and text files
- **Quick actions**: Context menu for common file operations
- **Keyboard shortcuts**: Navigate and operate with keyboard

### Changed
- **Upload UX**: Drag-and-drop with progress indicators
- **Error handling**: More descriptive error messages

---

## [2.1.0] - 2025-12-14

### Added
- **Checkout/Checkin**: File locking for collaborative editing
- **Lock status**: Visual indicators for locked files
- **Force unlock**: Admin ability to release stuck locks

### Fixed
- **Concurrent edits**: Prevent data loss from simultaneous saves
- **Lock cleanup**: Auto-release locks on session timeout

---

## [2.0.0] - 2025-12-13

### Added
- **Complete rewrite**: New architecture with React + Electron
- **Supabase backend**: PostgreSQL with real-time subscriptions
- **Modern UI**: Tailwind CSS with dark mode support
- **Cross-platform**: Windows, macOS, and Linux support

### Changed
- **Authentication**: Moved to Supabase Auth
- **Storage**: Cloud-first with local caching
- **Performance**: 5x faster file operations

---

## [1.0.0] - 2025-12-01

### Added
- Initial release
- Basic file management
- User authentication
- Organization support
