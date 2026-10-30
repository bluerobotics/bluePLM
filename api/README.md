# BluePLM REST API

Integration API for external systems (ERP, CI/CD, automation) built with [Fastify](https://fastify.dev/) and TypeScript.

**Package:** `ghcr.io/bluerobotics/blueplm-api`

> **Note**: This API is designed for **integrations**, not daily app use.
> - Desktop app users → Direct to Supabase (faster)
> - SolidWorks add-in → Direct to Supabase (faster)  
> - ERP systems (Odoo, SAP) → This API
> - CI/CD, webhooks, automation → This API

## Setup for Your Organization

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Deploy API (5 min)                                 │
│  Click "Deploy to Railway" button below                     │
│  Set: SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY,     │
│       EXTENSION_ENCRYPTION_KEY                              │
├─────────────────────────────────────────────────────────────┤
│  Step 2: Get API URL                                        │
│  Railway gives you: https://your-app.railway.app            │
├─────────────────────────────────────────────────────────────┤
│  Step 3: Configure in BluePLM                               │
│  Settings → REST API → Enter your API URL                   │
├─────────────────────────────────────────────────────────────┤
│  Step 4: Connect Odoo/ERP                                   │
│  Use the API URL + your access token from Settings          │
└─────────────────────────────────────────────────────────────┘
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Heavy Operations (CAD files)                               │
│  Desktop App / SolidWorks Add-in → Supabase Direct (fast)   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Integration Layer (this REST API)                          │
│  ERP / Purchasing / CI/CD / Slack → Lightweight queries     │
│  • State queries                                            │
│  • Metadata lookups                                         │
│  • Trigger actions (release, obsolete)                      │
│  • Webhooks → Push notifications                            │
└─────────────────────────────────────────────────────────────┘
```

| Integration | What They Can Do |
|-------------|------------------|
| **Odoo/ERP** | Query released parts, sync BOMs, get part numbers |
| **Purchasing** | "Get all files in Released state" |
| **Manufacturing** | "Download latest released drawing for part X" |
| **CI/CD** | "Automatically release files after tests pass" |
| **Slack Bot** | "Notify channel when files are released" |

## Features

- **Odoo** - Supplier sync and connection settings
- **Native extensions** - Server routes of installed extensions under `/ext/<id>`
- **Fast** - Built on Fastify (~30k req/s)
- **Type-Safe** - Written in TypeScript
- **Validated** - JSON Schema validation
- **Documented** - Interactive Swagger UI at `/docs`
- **Rate Limited** - Built-in rate limiting
- **Webhooks** - Real-time notifications

## Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"

# Start the API server
npm run api

# Or with auto-reload during development
npm run api:dev
```

The server will start on `http://127.0.0.1:3001` by default.

**Interactive API Documentation**: Open http://127.0.0.1:3001/docs for Swagger UI.

### Running from source vs. running the build

Local development still runs TypeScript directly through [tsx](https://tsx.is/) —
`npm run api` and `npm run api:dev` are unchanged, and tsx remains a
devDependency. Nothing about the day-to-day workflow has changed.

What changed is production. The published image no longer carries a TypeScript
runtime: it is compiled ahead of time with `tsc` and started with plain `node`.
To reproduce that locally:

```bash
# Compile api/ to api/dist (JavaScript + source maps)
npm run api:build

# Run exactly what the container runs
node --enable-source-maps api/dist/server.js
```

`api/dist` is generated and git-ignored. `tsconfig.json` is the type-check
configuration (`noEmit`); `tsconfig.build.json` is the one that emits, and it
excludes tests. Source maps are emitted with the TypeScript inlined, so stack
traces from the running service point at `.ts` files and line numbers.

Both `server.ts` and `routes/health.ts` read `package.json` at startup to report
the API version, resolving it relative to their own module URL. `dist/` mirrors
the source layout and the build copies `package.json` into it, so those reads
resolve the same way whether you run from source or from the build.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | - | Supabase project URL (required) |
| `SUPABASE_KEY` | - | Supabase anon key (required) |
| `SUPABASE_SERVICE_KEY` | - | Service role key (required for user invites and server backups) |
| `EXTENSION_ENCRYPTION_KEY` | - | Encrypts integration credentials and extension secrets at rest (min 32 chars). See below |
| `PORT` | `3001` | Port to listen on (auto-set by Railway/Render/Fly.io) |
| `API_PORT` | - | Override port (fallback if PORT not set) |
| `API_HOST` | `0.0.0.0` | Host to bind to |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW` | `60000` | Time window in ms (60s) |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal,100.64.0.0/10` | Proxies trusted for the client address (`X-Forwarded-For`): IPs, CIDRs or `loopback`/`linklocal`/`uniquelocal`; `off` trusts none |
| `CLIENT_IP_HEADER` | `x-real-ip` on Railway, else unset | Header the edge overwrites with the client address; the rate limiter and request log use it (first entry, must be an IP, else the TRUST_PROXY address). Railway is detected by `RAILWAY_ENVIRONMENT_NAME` / `RAILWAY_PROJECT_ID`; `off` disables it |
| `CORS_ORIGINS` | *(empty)* | Extra browser origins, comma-separated. See below |
| `ENABLE_DOCS` | `true` | Serve the Swagger UI and OpenAPI document at `/docs` |
| `BACKUP_WORKER` | `true` | Run scheduled and requested backups and backup tests for organizations that chose server backups (`api/src/backup/`, tools: `npm run backup -- <sandbox, dry-run, verify, list or restore>`) |
| `NODE_ENV` | `production` | `development` turns on pretty logs and the Vite dev origin |

You can also use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` if you have them set for development.

### Nothing here has to be set to be safe

Every one of these defaults to the conservative answer, so a deployment that
sets only the Supabase credentials is correctly configured:

- **A `500` never returns the server's error message or stack trace.** It
  returns `{"error":"INTERNAL_ERROR","message":"Internal server error","requestId":"…"}`.
  The real error, with its stack, is in the server log under that same
  `requestId`. This is not configurable — see [Error Responses](#error-responses).
- **`NODE_ENV` defaults to `production`.** It used to default to `development`,
  which meant a platform that did not set it got the developer's behaviour.
  It now decides only log format and level, and whether the Vite dev server is
  an allowed CORS origin. `npm run api` sets it to `development` for you.
- **CORS denies by default, with one permanent exception: the desktop app.**

### CORS and the desktop app

The origin `null` is **always** allowed, in every environment, and
`CORS_ORIGINS` adds to the allowlist rather than replacing it — so adding your
ERP's domain cannot take Integrations, extension routes, Webhooks, the Suppliers
view or the API health check offline.

That entry exists for a packaged BluePLM build, which loads its renderer from a
`file://` page. Measured on Electron 39, such a page is in fact not a CORS
client at all: its `fetch()` sends no `Origin` header and reads responses from
servers that send no CORS headers. The allowlist entry is therefore insurance
rather than a live dependency — it means the app keeps working if the renderer
ever moves to a custom scheme or Electron tightens `file://` to match the web.
A `npm run dev` renderer is a different matter: it is served over http, sends a
real `Origin`, and is subject to CORS normally, which is why
`http://localhost:5173` is allowed when `NODE_ENV=development`.

Most deployments never need `CORS_ORIGINS` at all. CORS is a browser mechanism:
Odoo, SAP, a CI job and a Python script send no `Origin` header and are not
subject to it. Set it only when a **browser** application other than BluePLM
calls this API.

`CORS_ORIGINS=*` is not honoured. It meant "any website may read this API's
responses", it shipped in `render.yaml`, and it is now ignored with a warning
in the startup log rather than refused outright, so an existing deployment
picking up a new image keeps running instead of failing to start.

### Encryption key

`EXTENSION_ENCRYPTION_KEY` encrypts secrets held at rest — ERP credentials such as
your Odoo API key, extension secrets, and AI provider keys. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

> ⚠️ **This value can never change.** Every secret encrypted with it becomes
> permanently unreadable if it does, and credentials would have to be re-entered
> by hand. Store it somewhere durable before you deploy.

If it is not set, the API refuses to save new integration credentials rather than
silently storing them in plaintext. Existing configurations keep working and are
re-encrypted automatically the next time they are saved.

## Deployment

Each organization hosts their own API server. This keeps your data under your control.

### Deploy from Docker Image (Recommended)

The easiest way - no repo access needed. The API automatically detects the `PORT` provided by PaaS platforms.

**Railway:**
1. Go to [railway.app/new](https://railway.app/new)
2. Select **"Deploy from Docker Image"**
3. Enter: `ghcr.io/bluerobotics/blueplm-api:latest`
4. Add variables: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`
5. Deploy!

> **Note**: The API automatically uses Railway's `PORT` environment variable. No port configuration needed.

**Render:**
1. Go to [render.com](https://render.com) → New → Web Service
2. Select **"Deploy an existing image from a registry"**
3. Enter: `ghcr.io/bluerobotics/blueplm-api:latest`
4. Add environment variables: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`
5. Deploy!

> **Those three variables are the whole list.** The image sets no behaviour
> switches of its own, and every default is the conservative one — see
> [Nothing here has to be set to be safe](#nothing-here-has-to-be-set-to-be-safe).
> `ENABLE_DOCS`, `CORS_ORIGINS` and `NODE_ENV` are set in the platform's own
> environment if you want them, never baked into the image, so changing one is
> a variable edit and a restart rather than a rebuild.

**Fly.io:**
```bash
fly launch --image ghcr.io/bluerobotics/blueplm-api:latest
fly secrets set SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=your-anon-key SUPABASE_SERVICE_KEY=your-service-key
fly deploy
```

**Docker (self-hosted):**
```bash
docker run -d -p 3001:3001 \
  -e SUPABASE_URL=https://xxx.supabase.co \
  -e SUPABASE_KEY=your-anon-key \
  -e SUPABASE_SERVICE_KEY=your-service-key \
  ghcr.io/bluerobotics/blueplm-api:latest
```

### Railway (from source)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and initialize
railway login
railway init

# Set environment variables (get these from your Supabase project settings)
railway variables set SUPABASE_URL=https://xxx.supabase.co
railway variables set SUPABASE_KEY=your-anon-key
railway variables set SUPABASE_SERVICE_KEY=your-service-key

# Optional. Only needed if a BROWSER app other than BluePLM calls this API —
# an ERP talking to it server-to-server sends no Origin and does not need it.
# railway variables set CORS_ORIGINS=https://your-browser-app.example
#
# Optional. Hides the Swagger UI at /docs, which is on by default.
# railway variables set ENABLE_DOCS=false

# Encrypts stored integration credentials. Generate once with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Losing or changing it makes every stored credential undecryptable.
railway variables set EXTENSION_ENCRYPTION_KEY=your-generated-key

# Deploy
railway up
```

> Railway does not restart on a variable change. Redeploy after setting these.

Your API will be live at `https://your-app.railway.app`

### Where to Find Your Supabase Credentials

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your BluePLM project
3. Go to **Settings → API**
4. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_KEY`
   - **service_role** key → `SUPABASE_SERVICE_KEY` (required for user invites)

> ⚠️ **Keep your service_role key secret!** It bypasses Row Level Security. Never expose it in client-side code.

### Render

1. Create new **Web Service** from your GitHub repo
2. Set:
   - **Build Command**: `npm ci --prefix api && npm run build --prefix api`
   - **Start Command**: `node --enable-source-maps api/dist/server.js`
3. Add environment variables in dashboard
4. Deploy

> Deploying the prebuilt image is preferred over building from source — it is
> the artefact that gets tested, and it needs no build step on the platform.

### Docker

The Dockerfile is a two-stage build: the first stage installs every dependency
and compiles `api/` with `tsc`, and the second copies only the emitted
JavaScript and the production dependencies onto a clean `node:22-alpine`. The
runtime image has no compiler and no tsx in it, and fetches nothing at startup.
Build it from the repository root — the context is the repository, not `api/`.

```bash
# Build
docker build -f api/Dockerfile -t blueplm-api .

# Run
docker run -p 3001:3001 \
  -e SUPABASE_URL=https://xxx.supabase.co \
  -e SUPABASE_KEY=your-anon-key \
  -e SUPABASE_SERVICE_KEY=your-service-key \
  blueplm-api
```

### Fly.io

```bash
# Install Fly CLI and login
fly auth login

# Launch (creates fly.toml)
fly launch

# Set secrets
fly secrets set SUPABASE_URL=https://xxx.supabase.co
fly secrets set SUPABASE_KEY=your-anon-key
fly secrets set SUPABASE_SERVICE_KEY=your-service-key

# Deploy
fly deploy
```

### Production Checklist

- [ ] Set `CORS_ORIGINS` **only** if a browser app other than BluePLM calls this
      API — an ERP or script does not need it, and the desktop app is always allowed
- [ ] Decide whether `/docs` should be public (`ENABLE_DOCS=false` hides it)
- [ ] Configure rate limiting appropriately (`RATE_LIMIT_MAX`)
- [ ] Set up monitoring/alerting on the `/health` endpoint
- [ ] Enable HTTPS (most platforms do this automatically)
- [ ] Consider adding API keys for additional security

## Authentication

Every endpoint except `GET /` and `GET /health` takes the caller's Supabase access token (the one the
desktop app signs in with) in the Authorization header:

```
Authorization: Bearer <access_token>
```

API 4.0.0 (BluePLM 5.0) removed `/auth/login`, `/auth/refresh` and `/auth/me`: sign in with Supabase directly.

---

## API Endpoints

API 4.0.0 (BluePLM 5.0) removed the REST copies of what the app does through Supabase RPCs: `/files/*`,
`/vaults`, `/trash`, `/parts`, `/bom`, `/suppliers`, `/activity`, `/checkouts`, and the sandbox extension
endpoints (`/extensions/*`, `/admin/extensions` except `POST /admin/extensions/reload`). They had drifted
from the app (no read-only checks, legacy state writes) and nothing called them. A future public API will be a
thin layer over the same RPCs the app calls. The interactive reference is the Swagger UI at `/docs`.

### Health & Info

#### `GET /health`
Health check with database status. No authentication required. It never reads a table with the anon key.

```bash
curl http://localhost:3001/health
```

#### `GET /`
API info.

### Invites

#### `POST /auth/invite`
Invite a user by email (admin only).

### Odoo Integration

`/integrations/odoo`, `/integrations/odoo/test`, `/integrations/odoo/sync/suppliers` and
`/integrations/odoo/configs[/:id[/activate]]`: configuration, connection test and supplier sync, used by the
desktop app's Odoo settings. The connection settings use `is_auto_sync`.

### Native Extensions

`/ext/<extensionId>/...` serves the routes of the native extensions installed for the caller's organization, and
`POST /admin/extensions/reload` (admin only) reloads them.

---

## Error Responses

All errors return JSON in this format:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

A **4xx** describes something the caller did, so its `message` says what to
correct, in every environment.

A **5xx** describes the server, and its message and stack trace would describe
paths inside the container, dependency versions and the shape of the call that
failed — none of which the caller can act on. So a 5xx is always exactly this:

```json
{
  "error": "INTERNAL_ERROR",
  "message": "Internal server error",
  "requestId": "0f2c9a3e-6b41-4c9e-9d55-1a2b3c4d5e6f"
}
```

There is no setting that turns the detail back on. The full error and its stack
are in the server log against the same `requestId`, so quote that id when
reporting a fault and the operator can find the exact line. Send your own
`X-Request-Id` header and it will be used instead of a generated one, which
lets you match a failure to a trace you already have.

Common status codes:
- `400` - Bad request (missing/invalid parameters)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (no organization membership)
- `404` - Not found
- `409` - Conflict (e.g., file already checked out)
- `500` - Server error

---

### Webhooks

Webhooks allow external systems to receive real-time notifications when events occur in BluePLM.

#### Webhook Events

| Event | Description |
|-------|-------------|
| `file.checkout` | File was checked out |
| `file.checkin` | File was checked in |
| `file.sync` | New file uploaded or existing file updated |
| `file.delete` | File was moved to trash |
| `file.restore` | File was restored from trash |
| `file.state_change` | File state changed (WIP → Released, etc.) |
| `file.version` | New version created |

#### `GET /webhooks`
List all webhooks for your organization.

#### `POST /webhooks`
Create a new webhook (admin only).

```bash
curl -X POST http://localhost:3001/webhooks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhook",
    "events": ["file.checkin", "file.state_change"]
  }'
```

Response includes a `secret` for verifying webhook signatures (only shown once).

#### `PATCH /webhooks/:id`
Update webhook (toggle active, change events).

#### `DELETE /webhooks/:id`
Delete a webhook (admin only).

#### Webhook Payload

```json
{
  "event": "file.checkin",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "org_id": "org-uuid",
  "data": {
    "file_id": "file-uuid",
    "file_path": "Parts/bracket.SLDPRT",
    "file_name": "bracket.SLDPRT",
    "user_id": "user-uuid",
    "user_email": "user@example.com"
  }
}
```

#### Verifying Signatures

Webhooks include `X-BluePLM-Signature` header (HMAC-SHA256):

```python
import hmac, hashlib

def verify(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

---

## Rate Limiting

Rate limiting is enabled by default:
- **100 requests** per **60 seconds** per IP
- Configure via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW` env vars
- Returns `429 Too Many Requests` when exceeded

## Security Notes

- The API binds to `127.0.0.1` by default for security
- To expose externally, set `API_HOST=0.0.0.0` (not recommended without additional security)
- All requests are logged with structured Pino logging
- Tokens expire after the Supabase-configured time (default 1 hour)
- Use HTTPS in production by placing behind a reverse proxy
- JSON Schema validation protects against malformed requests

## Performance

Built on Fastify for maximum performance:
- ~30,000 requests/second (2x faster than Express)
- Low memory footprint
- Efficient JSON serialization
- Native async/await support

## Logging

The API uses [Pino](https://getpino.io/) for structured JSON logging:

```
[05:08:38 UTC] INFO: incoming request
    reqId: "req-1"
    req: { "method": "GET", "url": "/health" }
[05:08:38 UTC] INFO: request completed
    reqId: "req-1"
    res: { "statusCode": 200 }
    responseTime: 0.58
```

That pretty-printed form is the development one. The default is `production`,
which logs single-line JSON at `info` — set `NODE_ENV=development` for the
above. Both the request logger and the standalone logger used by modules
without a Fastify instance are built from the same configuration, so one
process never emits two formats onto one stream.

Unhandled errors are logged here in full, with their stack, under the
`requestId` that the 5xx response returned to the caller.

## Troubleshooting

**"Supabase not configured" error**
- Set the `SUPABASE_URL` and `SUPABASE_KEY` environment variables

**"Service key not configured" error**
- Set the `SUPABASE_SERVICE_KEY` environment variable (required for `/auth/invite` endpoint)
- Get the service_role key from Supabase Dashboard → Settings → API

**"Encryption key not configured" error when saving an integration**
- Set `EXTENSION_ENCRYPTION_KEY` (min 32 chars) and redeploy — see [Encryption key](#encryption-key)
- The API refuses to store credentials in plaintext, so saving fails until it is set

**Integration credentials stopped decrypting**
- `EXTENSION_ENCRYPTION_KEY` was changed or regenerated. Restore the original value if you have it
- If it is lost, re-enter each integration's credentials to store them under the new key

**"Invalid token" error**
- Token may have expired - use `/auth/refresh` to get a new one
- Ensure you're using the full token (access tokens are long JWT strings)

**"User profile not found" error**
- User exists in Supabase Auth but not in the `users` table
- Sign in via the BluePLM desktop app first to create the profile

**"Validation Error" response**
- Request body doesn't match the JSON Schema
- Check the `details` field for specific validation errors

**File upload fails**
- Check that content is valid base64
- Ensure file size is under 100MB (configurable via `bodyLimit` in `server.ts`)

