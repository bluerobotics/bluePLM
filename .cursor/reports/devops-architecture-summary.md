# bluePLM — Architecture & Touchpoint Summary

> For DevOps review. Covers everything the app touches: network, disk, processes, ports, and secrets.

---

## What Is It

An **Electron desktop app** (TypeScript/React) for managing engineering files (PDM — Product Data Management). Ships on Windows, macOS, and Linux. Includes an optional **Fastify REST API** for ERP/CI integrations and a **CLI** for automation.

---

## High-Level Architecture

```
┌─────────────────────────────────────┐
│         Electron Desktop App        │
│  ┌───────────┐    ┌──────────────┐  │
│  │  Renderer  │    │ Main Process │  │
│  │  (React)   │◄──►│  (Node.js)   │  │
│  └───────────┘    └──────┬───────┘  │
│                          │          │
│  ┌───────────────────────┤          │
│  │ Extension Host Window │          │
│  └───────────────────────┘          │
└──────────┬──────────────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
  Supabase    Local Disk
  (Cloud)     (Vault Folder)
```

---

## Network — What It Talks To

| Destination | Why | Protocol | Auth |
|---|---|---|---|
| `*.supabase.co` (org-configured) | Database, Auth, Realtime subscriptions, File storage | HTTPS / WSS | Supabase anon key + user JWT |
| `api.github.com` / GitHub Releases | Auto-update checks, release notes | HTTPS | None (public) |
| `*.ingest.sentry.io` | Error tracking & analytics (opt-in) | HTTPS | DSN |
| `extensions.blueplm.io/api` | Extension store discovery | HTTPS | None |
| `www.googleapis.com` | Google Drive OAuth + file ops | HTTPS | OAuth2 tokens |
| `unpkg.com` | PDF.js worker script (one-time CDN fetch) | HTTPS | None |

**No hardcoded IPs.** Supabase project URL is per-organization — each customer points at their own project.

---

## Local Network / Ports

| Port | Binding | Purpose |
|---|---|---|
| `127.0.0.1:31337` | Loopback only | CLI ↔ Electron IPC (HTTP server inside main process) |
| Ephemeral loopback port | Loopback only | OAuth callback receiver (temporary, dies after auth completes) |
| `localhost:5173` | Dev only | Vite dev server (not in production builds) |

**No ports are exposed externally from the desktop app.**

---

## Disk — What It Reads & Writes

### App Data (`%APPDATA%/blue-plm/` on Windows)

| Path | Content |
|---|---|
| `logs/blueplm-*.log` | Rotating application logs |
| `log-settings.json` | Log level config |
| `analytics-settings.json` | Sentry opt-in toggle |
| `window-state.json` | Window size/position persistence |
| `.instance-lock` | Single-instance lock file |
| `update-reminder.json` | Update snooze state |
| `extensions/` | Installed extension packages |
| `Crashpad/reports/` | Chromium crash dumps |

### User's Vault (user-selected folder)

The app reads, writes, copies, and deletes files in a **user-chosen working directory** (the "vault"). This is the core function — syncing engineering files between local disk and Supabase Storage. Uses `chokidar` for filesystem watching.

### CLI Token

| OS | Path |
|---|---|
| Windows | `%APPDATA%/blueplm/cli-token.json` |
| Unix | `~/.config/blueplm/cli-token.json` |

### Browser Storage

- `localStorage` key `blue-plm-storage` — Zustand persisted UI state
- `localStorage` key `blueplm-supabase-config` — Supabase connection config

---

## Spawned Processes

| Binary | When | Purpose |
|---|---|---|
| `BluePLM.SolidWorksService.exe` | Windows only, on CAD operations | .NET 4.8 service for SolidWorks COM interop |
| `restic` | On backup operations | Encrypted incremental backups to user-configured remotes (e.g., S3) |
| eDrawings viewer | User-triggered | Preview CAD files |

Binaries are bundled in `resources/bin/` (unpacked from ASAR at install time via `extraResources`).

---

## Database (Supabase / PostgreSQL)

- **Not self-hosted** — each organization brings their own Supabase project
- Desktop app talks **directly** to Supabase (PostgREST + Realtime + Storage) using the anon key + user JWT
- The optional API server uses a **service role key** for admin operations
- Schema: idempotent SQL files in `supabase/core.sql` + `supabase/modules/` (versioned, currently v59)
- RLS (Row Level Security) enforced across all tables
- No Edge Functions deployed

### Tables (by module)

| Module | Covers |
|---|---|
| `core.sql` | Orgs, users, teams, permissions, sessions, notifications, schema versioning |
| `10-source-files.sql` | Vaults, files, versions, workflows, backups |
| `20-change-control.sql` | ECOs, reviews, deviations |
| `30-supply-chain.sql` | Suppliers, RFQs, costing |
| `40-integrations.sql` | Odoo, WooCommerce, webhooks, SolidWorks licenses |
| `50-extensions.sql` | Extension registry, secrets, storage, HTTP logs |

---

## API Server (Optional, Separate Deployment)

| Property | Value |
|---|---|
| Framework | Fastify 5 |
| Default port | `3001` |
| Container image | `ghcr.io/bluerobotics/blueplm-api` |
| Base image | Node 20 Alpine |
| Health check | `GET /health` |
| Auth | JWT Bearer (Supabase tokens) |
| Docs | Swagger UI at `/docs` |
| Rate limiting | Configurable via env |

**Required env vars:** `SUPABASE_URL`, `SUPABASE_KEY`
**Optional:** `SUPABASE_SERVICE_KEY`, `EXTENSION_ENCRYPTION_KEY`, `CORS_ORIGINS`, `RATE_LIMIT_MAX`, `PORT`

---

## Secrets & Credentials

| Secret | Where Used | How Stored |
|---|---|---|
| Supabase URL + Anon Key | Desktop app | localStorage or `VITE_*` env vars |
| Supabase Service Key | API server only | `SUPABASE_SERVICE_KEY` env var |
| Google OAuth client ID/secret | Electron main process | `GOOGLE_DRIVE_CLIENT_ID/SECRET` env vars |
| Sentry DSN | Main + renderer | `VITE_SENTRY_DSN` env var |
| Extension encryption key | API server | `EXTENSION_ENCRYPTION_KEY` env var |
| Supabase access token | Dev tooling only | `SUPABASE_ACCESS_TOKEN` for type generation |

**No secrets are hardcoded in source.** All sensitive values come from environment variables or user-configured storage.

---

## CI/CD & Distribution

| Workflow | Trigger | What It Does |
|---|---|---|
| `release.yml` | Git tag `v*` | Builds Electron (Win + macOS), builds .NET service, pushes API Docker image, creates GitHub Release |
| `publish-api.yml` | Push to `main` (api/ changes) | Builds & pushes API Docker image to GHCR |
| `deploy-docs.yml` | Push to `main` (docs/ changes) | Deploys VitePress docs to Cloudflare Pages |

### Desktop Updates

- **Mechanism:** `electron-updater` checking GitHub Releases
- **Auto-download:** Disabled (user must confirm)
- **Auto-install:** On next app quit after download
- **Publish target:** `github` provider → `bluerobotics/bluePLM` repo

### Build Targets

| OS | Format |
|---|---|
| Windows | NSIS installer (x64) |
| macOS | DMG + ZIP (universal) |
| Linux | AppImage |

---

## Extension System

- Extensions run in a sandboxed `BrowserWindow` (Extension Host) inside the Electron process
- Installed to `%APPDATA%/blue-plm/extensions/`
- Discovery via `extensions.blueplm.io/api`
- API server can also manage extensions (install/uninstall/proxy routes)
- Google Drive is the primary extension (separate repo: `blueplm-ext-google-drive`)

---

## OS-Level Permissions

| Permission | Reason |
|---|---|
| Filesystem (user-selected dirs) | Vault sync — read/write/watch |
| Network (outbound HTTPS/WSS) | Supabase, GitHub, Sentry, Google |
| Loopback HTTP server | CLI communication, OAuth callbacks |
| Process spawn | SolidWorks service, restic, eDrawings |
| Custom protocol (`blueplm://`) | Deep linking from browser/other apps |
| Clipboard read | Explicitly allowed in session permissions |
| Single-instance lock | Prevents duplicate app instances |

---

## TL;DR for DevOps

1. **Cloud dependency:** Supabase (Postgres + Auth + Storage + Realtime) — customer-managed, not a shared backend
2. **No server required for basic use** — desktop app talks directly to Supabase
3. **Optional API server** — Docker container on GHCR, for ERP integrations only
4. **Local footprint:** App data in `%APPDATA%`, user vault folder, bundled binaries (restic, SolidWorks service)
5. **Outbound-only networking** from desktop — no inbound ports exposed externally
6. **Updates via GitHub Releases** — no custom update server
7. **Secrets** are all env-var or user-configured — nothing hardcoded
