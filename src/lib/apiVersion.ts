/**
 * API Version Checking
 *
 * Detects mismatches between the app's expected API version
 * and the actual API version running on the server. This helps users understand
 * when their API deployment needs to be updated.
 *
 * VERSION HISTORY:
 * - Version 1.0.0: Initial API release (v2.15.0)
 * - Version 1.1.0: Added Odoo integrations (v2.16.0)
 * - Version 1.2.0: Invite flow includes org code, re-invite cleanup (v2.16.8)
 * - Version 2.0.0: Major API refactor with improved architecture
 * - Version 2.1.0: Customer sync reports progress and can be stopped (v3.23.0)
 * - Version 2.2.0: Customer sync pulls only what changed in Odoo since the last run
 * - Version 2.3.0: Customer sync credits orders to the company, not the contact
 * - Version 2.4.0: File state endpoints run through the workflow engine
 * - Version 2.5.0: Extension endpoints require authentication; rate limiting answers 429
 * - Version 2.6.0: 5xx responses carry a request id instead of the server's stack trace
 * - Version 2.7.0: A caller-supplied request id is validated before it is logged or reflected,
 *   and an extension's failed HTTP call is audited with the reason it failed
 * - Version 2.8.0: undo-checkout clears checked_out_by_machine_id/_name and the new
 *   checkout path snapshot, and restores file_path/file_name from that snapshot
 * - Version 2.8.1: restore (POST /trash/:id/restore) and the REST soft-delete
 *   (DELETE /files/:id) now bump updated_at, so delta sync propagates them to
 *   other clients
 * - Version 2.8.3: a missing row answers 404 instead of 500; checkout/checkin accept no
 *   body; PATCH /files/:id/metadata refuses a state change on a checked-out file
 * - Version 3.0.0: Native extension runtime (/ext/<extensionId>/...); the /customers/sync
 *   routes are removed, served by the blueplm.customers extension instead (app 4.8.0)
 *
 * When making API changes:
 * 1. Increment version in api/package.json
 * 2. Update EXPECTED_API_VERSION here if app requires the new API
 * 3. Add entry to API_VERSION_DESCRIPTIONS
 */

import { usePDMStore } from '../stores/pdmStore'

// The API version this app version expects
// Uses semver: MAJOR.MINOR.PATCH
export const EXPECTED_API_VERSION = '4.2.0'

// Minimum API version that will still work (for soft warnings vs hard errors)
// Breaking changes should bump the major version and update this
//
// This is a hard refusal, not a warning: raising it takes the app offline for every user whose
// API is below the floor, until that API is redeployed.
//
// 5.0 sets it to 4.0.0, equal to the expected version: API 4.0.0 is the first that speaks the 5.0
// schema names (organization, app_user, file, ...), and any 3.x API fails every query against a
// 5.0 database (its auth middleware turns that into 401 "User profile does not exist"). The
// runbook redeploys the API right after the database upgrade and checks /health.
export const MINIMUM_COMPATIBLE_API_VERSION = '4.0.0'

// Human-readable descriptions for each version
export const API_VERSION_DESCRIPTIONS: Record<string, string> = {
  '1.0.0': 'Initial API release with file operations, webhooks, auth',
  '1.1.0': 'Added Odoo integrations',
  '1.2.0': 'Invite flow includes org code, automatic re-invite cleanup',
  '2.0.0': 'Major API refactor with improved architecture',
  '2.1.0': 'Customer sync reports live progress and can be stopped',
  '2.2.0': 'Customer sync pulls only what changed in Odoo since the last successful run',
  '2.3.0':
    'Customer sync credits an order to the company behind the contact who placed it, and no longer drops orders whose contact Odoo does not flag as a customer',
  '2.4.0':
    'Release, obsolete and metadata state changes run through the workflow engine, so they honour role, checkout and approval-gate rules instead of writing the state column directly',
  '2.5.0':
    'Extension handler endpoints require a token and take the organization from it rather than from an X-Org-Id header, and a rate-limited request is answered with 429 RATE_LIMIT_EXCEEDED instead of 500',
  '2.6.0':
    "A 500 response no longer returns the server's error message and stack trace to the caller; it carries a requestId that matches the server log instead. CORS always allows the desktop app, so an API deployed with NODE_ENV=production keeps working, and the Swagger UI at /docs has its own ENABLE_DOCS switch",
  '2.7.0':
    'An X-Request-Id supplied by the caller is accepted only if it is short and alphanumeric, so a crafted one can no longer forge log lines or be reflected verbatim in an error response; anything else is replaced by a server-generated id. An extension HTTP call that fails is now audited with the reason it failed instead of an empty error column, and it rejects with the original Error rather than a string, so the stack survives',
  '2.8.0':
    'POST /files/:id/undo-checkout was leaving checked_out_by_machine_id and checked_out_by_machine_name set after releasing a lock, and never restored file_path/file_name from the new checkout path snapshot the way the client-side undoCheckout() now does. It clears both machine columns and the snapshot columns, restores the path/name from the snapshot first when one was recorded, and now bumps updated_at on release so delta sync actually sees the change - previously a release through this route was invisible to a client on the delta path and the file could keep showing as checked out. The file response schema gained checked_out_file_path/checked_out_file_name, which were being computed by the checkout_file RPC but silently stripped from the checkout response by Fastify because the schema never declared them',
  '2.8.1':
    'POST /trash/:id/restore was clearing deleted_at/deleted_by without bumping updated_at, so a restore was invisible to the watermark-based delta sync (get_vault_files_delta) for any client whose cache had already advanced past the delete - the row stayed a permanent ghost. The restore route now bumps updated_at, matching the desktop restoreFile() implementation. DELETE /files/:id (REST soft delete) had the same omission and now bumps updated_at too, matching the desktop softDeleteFile() implementation',
  '2.8.2':
    'Members of the Administrators team are administrators. Every admin-only route (extensions, webhooks, Odoo integration configuration and sync, supplier deletion, the recovery-code route and forced undo-checkout) tested only users.role, so a team member whose role column said engineer or viewer was refused. The auth middleware now resolves admin once per request through the is_org_admin() SQL function - role = admin OR Administrators team membership, the same answer the row-level security policies give - and exposes it as request.user.isAdmin, and the routes gate on that. A failure to answer is treated as not admin',
  '2.8.3':
    'Found by the route-level test suite (api/routes/authMatrix.test.ts, files.routes.test.ts). A lookup of a row that does not exist answered 500: .single() returns PostgREST PGRST116 and the routes threw it, so their 404 branches never ran; the error handler now answers 404. Administrators-team members whose role column says viewer were refused the five supplier write routes, which tested role alone; they now check isAdmin first. PATCH /files/:id/metadata changed the state of a checked-out file, which /release and /obsolete refuse; it now answers 409, and 404 for a file outside the organization of the caller. POST /files/:id/checkin answered 409 instead of 403 to a caller without the lock, because it matched a message checkin_file does not send. POST /files/:id/checkout and /checkin with no body answered 400 although every field is optional',
  '3.0.0':
    "Native extension runtime, and Customers leaves the API core. At startup the API loads every enabled native extension that has a serverMain, for the organizations named in NATIVE_EXTENSIONS_ORG_IDS: per extension id it takes the install with the latest installed_at, downloads the package from the org-extensions storage bucket with the service-role client, refuses it unless its sha256 matches the install row, extracts it safely and calls register(app) from its server module; a failing extension is logged and skipped. Its routes are served under /ext/<extensionId>/..., authenticated and rate limited like every other route, and answer 404 when the extension is not loaded or not enabled for the caller's org, 409 EXTENSION_VERSION_MISMATCH when the org's installed sha256 differs from the loaded one, and 504 EXTENSION_TIMEOUT when a handler runs past its timeout. POST /admin/extensions/reload (admin only) reloads them without a restart, and POST /admin/extensions/install refuses native manifests. The sandbox extension storage, secrets, secret-access log and HTTP log use the service-role client, filtered by org and extension. POST /customers/sync, GET /customers/sync/status and POST /customers/sync/cancel are removed, with the customers sync code and the read-only Odoo call guard only it used; the Odoo supplier sync and connection test are unchanged. The blueplm.customers extension serves the same three routes at /ext/blueplm.customers/sync, /sync/status and /sync/cancel. Removing routes is a breaking change, hence the major version",
  '3.0.1':
    'Rate limits count per client again. Behind the Railway or Render proxy every request arrived from the proxy address, so the global limit and the /auth/login limit were one bucket shared by every caller and one client could exhaust it for all. The API now trusts TRUST_PROXY_HOPS proxy hops (default 1) for the client address in X-Forwarded-For. It trusts a count, not every hop, so a caller cannot pick its own address; 0 turns it off for an API exposed directly',
  '4.0.0':
    'BluePLM 5.0. Every query uses the 5.0 schema names (organization, app_user, file, org_integration, ...), so 4.0.0 needs a 5.0 database and a 5.0 database needs 4.0.0; it is also the minimum version. Removed: the REST duplicates of what the app does through Supabase RPCs (/files/*, /vaults, /trash, /parts, /bom, /suppliers, /activity, /checkouts, /auth/login, /auth/refresh, /auth/me) and the sandbox extension system (/extensions/*, GET/POST/PATCH/DELETE /admin/extensions); kept: /health, /docs, /auth/invite, /integrations/odoo/*, /webhooks, /ext/* and POST /admin/extensions/reload. The Odoo connection settings take and return is_auto_sync, and the dropped always-NULL credential columns are no longer written. The Odoo supplier sync returns only its own raw XML samples (a module-wide buffer could hand one organization the responses of another). /health no longer reads a table with the anon key. Fastify 5.12 and @fastify/static 10.1: proxies are trusted by address (TRUST_PROXY, default the private ranges) instead of a hop count (TRUST_PROXY_HOPS is gone)',
  '4.1.0':
    'Server backups: a backup worker runs scheduled and requested backups and backup tests for organizations that choose server backups (backup_config.run_location, schema 501), with no desktop on. Needs SUPABASE_SERVICE_KEY; BACKUP_WORKER=false turns it off. Per-client rate limits on Railway: its edge reaches the API from a public address that TRUST_PROXY cannot match, so every caller shared one bucket; the rate limiter and the request log now take the client address from CLIENT_IP_HEADER (default x-real-ip on Railway, which its edge overwrites on every public request; first entry, validated as an IP, else request.ip; off turns it off). TRUST_PROXY is unchanged for other hosts.',
  '4.1.1':
    'A server backup or test in progress records how far it is (backup_history.report.progress: phase, done, total, bytes uploaded) every 30 s, so the backup page can show it.',
  '4.1.2':
    'Scheduled full test: every 30 days, 4 hours after the nightly backup slot, the backup worker reads every blob back and checks it (kind verify, trigger scheduled). A test a restart cut short is resumed in the same mode, like a backup.',
  '4.2.0':
    'Damaged-file tools (schema 503). The backup worker records damaged and missing vault content in vault_object_issue and closes findings a later backup reads back intact. New admin-only routes repair it, because only the service role may write a vault object: GET /backup/issues/:hash/copies, POST /backup/issues/:hash/restore (from the server backup) and POST /backup/issues/:hash/upload (a desktop copy, octet-stream); bytes are hashed against the name before writing and after, and a damaged object is kept under its own hash first.',
}

export interface ApiVersionCheckResult {
  status: 'current' | 'outdated' | 'ahead' | 'incompatible' | 'unknown'
  apiVersion: string | null
  expectedVersion: string
  message: string
  details?: string
}

/**
 * Parse semver string to comparable numbers
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const vA = parseVersion(a)
  const vB = parseVersion(b)

  if (!vA || !vB) return 0

  if (vA.major !== vB.major) return vA.major < vB.major ? -1 : 1
  if (vA.minor !== vB.minor) return vA.minor < vB.minor ? -1 : 1
  if (vA.patch !== vB.patch) return vA.patch < vB.patch ? -1 : 1

  return 0
}

/**
 * Check if the API version is compatible with this app version
 */
export function checkApiCompatibility(apiVersion: string | null): ApiVersionCheckResult {
  // No version info available
  if (!apiVersion) {
    return {
      status: 'unknown',
      apiVersion: null,
      expectedVersion: EXPECTED_API_VERSION,
      message: 'API version unknown',
      details:
        'Could not determine the API version. The API may be offline or running an old version.',
    }
  }

  // Perfect match
  if (apiVersion === EXPECTED_API_VERSION) {
    return {
      status: 'current',
      apiVersion,
      expectedVersion: EXPECTED_API_VERSION,
      message: 'API is up to date',
    }
  }

  const comparison = compareVersions(apiVersion, EXPECTED_API_VERSION)
  const minComparison = compareVersions(apiVersion, MINIMUM_COMPATIBLE_API_VERSION)

  // API is newer than app expects (user should update app)
  if (comparison > 0) {
    return {
      status: 'ahead',
      apiVersion,
      expectedVersion: EXPECTED_API_VERSION,
      message: 'App update available',
      details:
        `Your API (v${apiVersion}) is newer than this app expects (v${EXPECTED_API_VERSION}). ` +
        'Consider updating BluePLM for the best experience.',
    }
  }

  // API is too old - might cause errors
  if (minComparison < 0) {
    return {
      status: 'incompatible',
      apiVersion,
      expectedVersion: EXPECTED_API_VERSION,
      message: 'API update required',
      details:
        `Your API (v${apiVersion}) is too old for this app. ` +
        `Required: v${MINIMUM_COMPATIBLE_API_VERSION}+. Please redeploy the API with the latest version.`,
    }
  }

  // Older but still compatible (soft warning)
  return {
    status: 'outdated',
    apiVersion,
    expectedVersion: EXPECTED_API_VERSION,
    message: 'API update available',
    details:
      `Your API is on v${apiVersion}, but v${EXPECTED_API_VERSION} is available. ` +
      'Some new features may not work until you redeploy the API.',
  }
}

/**
 * Fetch API version from the health endpoint
 */
export async function fetchApiVersion(apiUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      return data.version || null
    }

    return null
  } catch {
    return null
  }
}

/**
 * Get the API URL from store
 */
export function getApiUrl(): string | null {
  const apiServerUrl = usePDMStore.getState().apiServerUrl
  if (apiServerUrl) {
    return apiServerUrl.replace(/\/$/, '')
  }
  return null
}

/**
 * Check API version and return result
 */
export async function checkApiVersion(): Promise<ApiVersionCheckResult | null> {
  const apiUrl = getApiUrl()
  if (!apiUrl) return null

  const version = await fetchApiVersion(apiUrl)
  return checkApiCompatibility(version)
}
