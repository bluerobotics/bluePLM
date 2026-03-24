# BluePLM Security Audit

**Date:** 2026-03-23
**Scope:** Static analysis of full monorepo (Electron, Fastify API, Supabase schema, frontend)
**Method:** Code review — no runtime/penetration testing performed

---

## Executive Summary

The app is **not a dumpster fire**. The architecture is fundamentally sound — Supabase Auth with JWT, RLS on database tables, env-based secrets, proper `service_role` isolation to the server. That said, there are **a handful of real vulnerabilities** that should be fixed before anyone points a scanner at this, plus some hardening items that would make devops sleep better.

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH     | 4 |
| MEDIUM   | 5 |
| LOW      | 6 |

---

## CRITICAL

### C1. Unrestricted Filesystem Read via IPC (`fs:read-file`)

**File:** `electron/handlers/fs.ts:525`
**Issue:** The `fs:read-file` IPC handler accepts any file path from the renderer and reads it with no path restriction or traversal check.

```typescript
ipcMain.handle('fs:read-file', async (_, filePath: string) => {
    const data = fs.readFileSync(filePath)  // ANY path the OS user can read
```

**Impact:** If the renderer is compromised (XSS, malicious extension, supply chain attack), an attacker gets **read access to the entire filesystem** — SSH keys, `.env` files, browser profiles, etc.

**Fix:** Validate that `filePath` resolves to within a known vault root directory. Use `path.resolve()` + prefix check:

```typescript
const resolved = path.resolve(filePath)
const allowedRoots = getAllVaultPaths()  // or pass explicitly
if (!allowedRoots.some(root => resolved.startsWith(root))) {
  return { success: false, error: 'Path outside allowed roots' }
}
```

Your own `.cursor/rules/electron.mdc` says "File paths: sanitize against traversal (`../`)" — this handler doesn't do it.

---

### C2. Default Extension Encryption Key

**File:** `api/src/extensions/router.ts:174-177`
**Issue:** If `EXTENSION_ENCRYPTION_KEY` is not set, extension secrets are encrypted with the hardcoded string `'default-key-change-in-production'`.

```typescript
const encryptionKey = options.encryptionKey ?? 
  (env as Record<string, unknown>).EXTENSION_ENCRYPTION_KEY as string ??
  'default-key-change-in-production'
```

**Impact:** Anyone who reads the source code (it's on GitHub?) can decrypt all extension secrets (API keys, OAuth tokens, etc.) for any deployment that forgot to set this env var.

**Fix:** Make `EXTENSION_ENCRYPTION_KEY` **required** in `api/src/config/env.ts` (remove the `optional()`) and crash on startup if missing. Never ship a default encryption key.

---

## HIGH

### H1. PostgREST Filter Injection via `search` Parameter

**Files:** `api/routes/files.ts:60`, `api/routes/suppliers.ts:57`
**Issue:** User-controlled `search` string is interpolated directly into PostgREST `.or()` filter grammar:

```typescript
query = query.or(`file_name.ilike.%${search}%,part_number.ilike.%${search}%`)
```

A search value containing `,` can inject additional filter clauses (e.g., `%,id.eq.some-uuid`), altering query semantics beyond a simple substring search.

**Impact:** Data exfiltration via crafted filter expressions — an attacker can potentially match rows by arbitrary column values.

**Fix:** Use individual `.ilike()` calls instead of string interpolation into `.or()`:

```typescript
if (search) {
  query = query.or(`file_name.ilike.%${encodeFilterValue(search)}%,part_number.ilike.%${encodeFilterValue(search)}%`)
}
// where encodeFilterValue escapes , . % and other PostgREST grammar chars
```

Or better, restructure to avoid `.or()` string building entirely by using Supabase's filter builder with separate conditions.

---

### H2. Fastify Body Validation Bypass (CVE in Fastify <=5.7.2)

**Files:** `package.json`, `api/package.json`
**Issue:** `npm audit` flagged Fastify with **GHSA-jx2c-rxcm-jvmq** — a tab character in the `Content-Type` header allows body validation bypass.

**Impact:** An attacker can bypass Fastify's JSON schema validation on any endpoint, sending malformed/malicious bodies that skip your TypeBox/Zod schema checks.

**Fix:** `npm audit fix` in both root and `api/` to upgrade Fastify.

---

### H3. Cross-Org Data Leakage — RLS SELECT Policies

**File:** `supabase/core.sql:1682-1699`
**Issue:** The `organizations` and `users` tables have `USING (true)` SELECT policies:

```sql
CREATE POLICY "Authenticated users can view organizations"
  ON organizations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view users"
  ON users FOR SELECT TO authenticated USING (true);
```

**Impact:** Any authenticated user in **any** org can enumerate **all** organizations and **all** users across the entire project — emails, names, org metadata. In a multi-tenant SaaS, this is a privacy/compliance issue.

**Fix:** Scope SELECT to the user's own org:

```sql
CREATE POLICY "Users can view their organization"
  ON organizations FOR SELECT TO authenticated
  USING (id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can view org members"
  ON users FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));
```

---

### H4. `systeminformation` Command Injection (CVE)

**File:** `package.json` — `systeminformation <=5.30.7`
**Issue:** `npm audit` reports **GHSA-5vv4-hvf7-2h46** (command injection via unsanitized `locate` output) and **GHSA-9c88-49p5-5ggf** (command injection via unsanitized interface parameter).

**Impact:** If the app calls `systeminformation` functions with user-influenced parameters, this enables **OS command execution**.

**Fix:** `npm audit fix` or upgrade `systeminformation` to latest.

---

## MEDIUM

### M1. CORS Allows All Origins When `CORS_ORIGINS` Unset

**File:** `api/server.ts:54-57`
**Issue:** If the `CORS_ORIGINS` env var is not set, CORS falls back to `origin: true` (allow all) with `credentials: true`.

```typescript
const CORS_ORIGINS = env.CORS_ORIGINS 
  ? env.CORS_ORIGINS.split(',').map(o => o.trim())
  : true // Allow all in dev
```

**Impact:** In production, any website can make credentialed cross-origin requests to your API if this env var is forgotten.

**Fix:** Make `CORS_ORIGINS` required in production (`NODE_ENV === 'production'`), or default to a restrictive allowlist.

---

### M2. OAuth Callback Without `state` Parameter (CSRF)

**File:** `electron/handlers/oauth.ts:61-100`
**Issue:** The OAuth local server accepts tokens from `/auth/callback` without validating a `state` nonce. No verification that the callback corresponds to an auth request the app actually initiated.

**Impact:** An attacker could craft a URL that delivers their own tokens to the OAuth callback, potentially hijacking the session (OAuth CSRF / token fixation).

**Fix:** Generate a random `state` parameter before starting OAuth, store it, and verify it in the callback. (You already have a plan file for this: `.cursor/plans/security-improvements/p2-oauth-csrf-protection.plan.md`)

---

### M3. Extension Public Handlers Trust `X-Org-Id` Header

**File:** `api/src/extensions/router.ts:236-251`
**Issue:** For unauthenticated requests to `public` extension handlers, the org ID is taken from the `X-Org-Id` header. The Supabase client falls back to anon (no JWT).

```typescript
orgId = user?.orgId ?? request.headers['x-org-id']
```

**Impact:** Any caller can claim to be any org by setting the header. The actual security depends on RLS, but extension code that trusts `orgId` for authorization decisions is vulnerable.

**Fix:** Either require authentication for all extension routes, or sign/encrypt the org context so it can't be forged.

---

### M4. Webhook SSRF — No URL Validation

**File:** `api/utils/webhooks.ts:39-47`
**Issue:** Webhook URLs are fetched with `fetch(webhook.url)` without blocking internal/private IP ranges.

**Impact:** An admin could register a webhook pointing to `http://169.254.169.254/latest/meta-data/` (cloud metadata) or internal services, exfiltrating cloud credentials or probing the internal network.

**Fix:** Validate webhook URLs against a blocklist of private IP ranges (`10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`, `127.x`, `::1`, etc.) before making the request.

---

### M5. DOM XSS via `innerHTML` with File Names

**Files:** `src/hooks/useDragDrop.ts:44-45`, `src/features/source/browser/hooks/useDragState.ts:~389`, `src/features/source/explorer/file-tree/hooks/useTreeDragDrop.ts:~255`
**Issue:** File names are injected into `innerHTML` for drag preview elements without sanitization:

```typescript
const label = draggable.length > 1 ? `${draggable.length} items` : primaryFile.name
dragPreview.innerHTML = `${iconSvg}${label}`
```

**Impact:** A file named `<img onerror="alert(1)">` would execute arbitrary JavaScript in the Electron renderer.

**Fix:** Use `textContent` for the label portion, or `document.createTextNode()`:

```typescript
dragPreview.innerHTML = iconSvg  // SVG is trusted (hardcoded)
dragPreview.appendChild(document.createTextNode(label))  // name is untrusted
```

---

## LOW

### L1. No Security Headers on API (No Helmet)

**File:** `api/server.ts`
**Issue:** No `@fastify/helmet` or equivalent — API responses lack `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`, etc.

**Fix:** `npm install @fastify/helmet` and register it.

---

### L2. Swagger UI Publicly Accessible

**File:** `api/server.ts:124-134`
**Issue:** `/docs` serves full OpenAPI spec and Swagger UI without authentication.

**Fix:** Gate behind auth or disable in production: `if (env.NODE_ENV !== 'production') { await fastify.register(swaggerUi, ...) }`

---

### L3. Auth Rate Limiting Not Stricter Than Global

**File:** `api/server.ts:73-80`
**Issue:** Login and refresh endpoints share the global rate limit (100 req/60s). Credential stuffing typically needs stricter limits (e.g., 5 attempts/minute per IP).

**Fix:** Add per-route rate limiting on `/auth/login` and `/auth/refresh`.

---

### L4. Health Endpoint Leaks Database Error Messages

**File:** `api/routes/health.ts:91-96`
**Issue:** When the DB is unhealthy, `/health` returns the raw error string to unauthenticated callers.

**Fix:** Return a generic "unhealthy" status; log the actual error server-side.

---

### L5. Hardcoded Sentry DSNs

**Files:** `electron/main.ts:123`, `src/lib/analytics.ts:9`
**Issue:** Sentry DSNs are hardcoded as fallbacks. While not secret API keys, they identify the Sentry project and could be used to flood it with garbage events.

**Fix:** Move to env-only configuration; add Sentry rate limiting or allowed-domain rules in Sentry dashboard.

---

### L6. CLI Local Server Has `Access-Control-Allow-Origin: *`

**File:** `electron/handlers/cli.ts:241-245`
**Issue:** The CLI HTTP server on localhost allows all origins with `*`, which could allow a malicious webpage to interact with the CLI server.

**Fix:** Restrict to `http://localhost` or `http://127.0.0.1` only.

---

## Dependency Vulnerabilities (`npm audit`)

### Root package — 19 vulnerabilities (2 low, 2 moderate, 15 high)

| Package | Severity | Advisory |
|---------|----------|----------|
| fastify <=5.7.2 | HIGH | Body validation bypass, DoS via sendWebStream |
| systeminformation <=5.30.7 | HIGH | Command injection (2 CVEs) |
| rollup 4.0-4.58 | HIGH | Arbitrary file write via path traversal |
| axios 1.0-1.13.4 | HIGH | DoS via `__proto__` in mergeConfig |
| tar <=7.5.10 | HIGH | Multiple path traversal / symlink poisoning (6 CVEs) |
| minimatch | HIGH | Multiple ReDoS (4 CVEs) |
| ajv | MODERATE | ReDoS with `$data` option |
| lodash 4.x | MODERATE | Prototype pollution in `_.unset`/`_.omit` |

### API package — 4 vulnerabilities (1 moderate, 3 high)

| Package | Severity | Advisory |
|---------|----------|----------|
| fastify <=5.7.2 | HIGH | Body validation bypass, DoS |
| minimatch | HIGH | Multiple ReDoS |
| ajv | MODERATE | ReDoS |

**Fix:** Run `npm audit fix` in both root and `api/`. For remaining issues, check if major version bumps are needed.

---

## What's Actually Good

Credit where due — these are **not** beginner mistakes:

1. **Supabase `service_role` key is server-only** — not leaked to the frontend bundle
2. **RLS is enabled on all application tables** (the overly-broad SELECT on `users`/`organizations` is the exception, not the rule)
3. **API auth middleware validates JWTs properly** via `supabase.auth.getUser(token)` — no homebrew JWT parsing
4. **Environment validation with Zod** on the API — env vars are typed and validated at startup
5. **No raw SQL** — all queries go through Supabase JS client (parameterized)
6. **Error handler hides stack traces in production**
7. **Rate limiting exists** (global + extension-specific)
8. **`.env` is gitignored** — no committed secrets found
9. **Electron context isolation is enabled** and all IPC goes through `contextBridge`
10. **No `dangerouslySetInnerHTML`** usage found in the React codebase

---

## Recommended Priority Order

1. **Now (before next deploy):** C1, C2, H2 (npm audit fix), H1
2. **This sprint:** H3, H4 (npm audit fix), M1, M2
3. **Next sprint:** M3, M4, M5, L1, L2, L3
4. **Backlog:** L4, L5, L6

---

## What This Audit Did NOT Cover

- Supabase dashboard settings (Auth providers, MFA config, Storage bucket policies)
- Runtime penetration testing
- Electron `webPreferences` hardness beyond what's in source
- Extension sandbox escape paths (needs dynamic testing)
- SolidWorks .NET service security
- Network/infrastructure (Railway deployment, DNS, TLS)
- Supply chain (beyond `npm audit`) — no lockfile integrity check

---

*Tell devops they can relax a little — the fundamentals are solid. Fix the criticals, run `npm audit fix`, and tighten those RLS policies, and this is in good shape for a vibed codebase.*
