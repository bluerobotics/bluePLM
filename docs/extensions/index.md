# BluePLM Extension Development

Welcome to the BluePLM Extension Development documentation. This comprehensive guide covers everything you need to know to create, test, and publish extensions for BluePLM.

## Status: what actually runs (October 2026)

Read this first. Most of these pages describe the sandboxed extension API as designed, not as
it runs in BluePLM 5.0: only native extensions run.

- **Native extensions run.** A `.bpx` with `"category": "native"` is installed for the whole
  organization by an administrator (Settings > Extensions > Install for organization). The
  package is stored in the organization's `org-extensions` bucket and pinned by SHA-256 in
  `org_installed_extension`. Every desktop runs `client/index.js` (`activate(host)`) and the
  API runs `server/index.js` (`register(app)`, routes under `/ext/<extension-id>/`) only from
  bytes that match that hash. Native code has full trust; it is not sandboxed. The contract
  (host API v1) is in `src/types/nativeExtensions.ts` (desktop) and
  `api/src/native-extensions/types.ts` (API) until it moves to its own page here.
- **The API runs native server code only for organizations its operator trusts.** A native
  extension's `server/index.js` runs in-process with the API's full privileges, including the
  service-role database client that can read every organization. An org admin installing one
  is therefore not enough: the API loads native extensions only for the organization ids in
  `NATIVE_EXTENSIONS_ORG_IDS` (comma-separated UUIDs). Unset means none are loaded and `/ext`
  answers `503 NATIVE_EXTENSIONS_DISABLED`; an org not in the list gets `403
  NATIVE_EXTENSIONS_DISABLED`. Each allowed org gets its own copy (keyed by org and extension),
  extracted into a private 0700 directory under `NATIVE_EXTENSIONS_DIR` (default: the OS temp
  directory). `POST /admin/extensions/reload` reloads only the calling admin's org.
- **There is no Extension Store and no per-machine install.** BluePLM 5.0 removed the
  per-machine Extension Store settings page and sideloading, and the API no longer has a
  sandbox for extension handlers. An extension is built into a `.bpx` from its own repository
  and installed for the organization; see [Distributing an Extension](./publishing.md).
- **What install checks:** the package id and version against the manifest schema, every zip
  entry (no absolute paths, no `..`, no symlinks, size and entry limits), and the
  `engines.blueplm` range. `SIGNATURE` files are not verified.
- **Who can install:** organization administrators only (the `admin` role or the
  Administrators team).
- **Permissions:** `contributes.permissions` declares team permission resources; the
  permissions editor lists them while the extension is installed for the organization.

## What are BluePLM Extensions?

BluePLM Extensions are modular packages that add functionality to the BluePLM desktop application. Built on an enterprise-grade architecture inspired by VS Code and Atlassian Forge, extensions can:

- **Add UI Components** — Panels, dialogs, settings pages, and sidebar items
- **Register Commands** — Keyboard shortcuts and command palette actions
- **Integrate External Services** — Connect to APIs like Google Drive, Odoo, SolidWorks
- **Process Files** — React to file changes and automate workflows
- **Store Data** — Persist configuration and user data securely

## Architecture Overview

The designed architecture (not running today; see Status above):

```
┌─────────────────────────────────────────────────────────┐
│                    BluePLM Application                   │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Extension Host (Sandboxed)             │ │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐         │ │
│  │  │ Your Ext  │ │ Ext B     │ │ Ext C     │  ...    │ │
│  │  └───────────┘ └───────────┘ └───────────┘         │ │
│  └─────────────────────────────────────────────────────┘ │
│                           │ IPC                          │
│  ┌────────────────────────▼────────────────────────────┐ │
│  │                   Main Process                      │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│               Organization API Server                    │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              V8 Isolate Sandbox Pool                │ │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐         │ │
│  │  │ Handler A │ │ Handler B │ │ Handler C │  ...    │ │
│  │  └───────────┘ └───────────┘ └───────────┘         │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Two Execution Environments

| Environment | Location | Purpose | Access |
|-------------|----------|---------|--------|
| **Client** | Extension Host (Electron renderer) | UI, commands, local storage | `ExtensionClientAPI` |
| **Server** | Org API (V8 isolate) | Database, secrets, external APIs | `ExtensionServerAPI` |

## Extension Categories

| Category | Description | Trust Level |
|----------|-------------|-------------|
| **Sandboxed** (default) | Runs in isolated Extension Host + V8 sandbox | Community or Verified |
| **Native** | Full trust in the app and the API; see Status above | Organization admins only |

## Documentation Sections

### Getting Started
- [Quick Start Guide](./getting-started.md) — Build your first extension in 10 minutes
- [Extension Structure](./structure.md) — Directory layout and file organization

### Reference
- [Manifest Reference](./manifest.md) — Complete `extension.json` specification
- [Client API Reference](./client-api.md) — UI, storage, commands, workspace APIs
- [Server API Reference](./server-api.md) — Database, secrets, HTTP APIs
- [Contributions Reference](./contributions.md) — Views, commands, settings, routes
- [Permissions Reference](./permissions.md) — Security model and permission scopes

### Guides
- [Package Format (.bpx)](./package-format.md) — Bundle structure and packaging
- [Distributing an Extension](./publishing.md) — Build a `.bpx` and install it for an organization
- [Best Practices](./best-practices.md) — Patterns and recommendations
- [Troubleshooting](./troubleshooting.md) — Common issues and solutions

## Quick Example

Here's a minimal extension that shows a toast when activated:

**extension.json**
```json
{
  "$schema": "https://blueplm.io/schemas/extension-v1.schema.json",
  "id": "mycompany.hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "publisher": "mycompany",
  "description": "A simple hello world extension",
  "license": "MIT",
  "engines": { "blueplm": "^1.0.0" },
  "main": "client/index.js",
  "activationEvents": ["onExtensionEnabled"],
  "contributes": {},
  "permissions": {
    "client": ["ui:toast"]
  }
}
```

**client/index.js**
```javascript
export async function activate(context, api) {
  context.log.info('Hello World extension activated!')
  api.ui.showToast('Hello from my extension!', 'success')
}

export function deactivate() {
  // Cleanup if needed
}
```

## Key Concepts

### 1. Manifest-Driven
Extensions declare all capabilities in `extension.json`. The system reads this to:
- Register commands, views, and settings
- Set up activation triggers
- Validate permissions

### 2. Lazy Activation
Extensions only load when needed, based on `activationEvents`:
- `onExtensionEnabled` — When user enables the extension
- `onStartup` — When BluePLM starts
- `onCommand:*` — When a command is executed
- `onNavigate:*` — When user navigates to a route
- `onView:*` — When a view is opened

### 3. Disposable Pattern
Resources are managed via the disposable pattern:
```javascript
export async function activate(context, api) {
  // Push to subscriptions for automatic cleanup
  context.subscriptions.push(
    api.commands.registerCommand('myext.doThing', () => {
      // handler
    })
  )
}
```

### 4. Permission-Gated APIs
All API calls require declared permissions. The system validates at runtime:
```json
{
  "permissions": {
    "client": ["ui:toast", "storage:local"],
    "server": ["storage:database", "http:domain:api.example.com"]
  }
}
```

## Support

- **GitHub Issues:** [bluerobotics/bluePLM](https://github.com/bluerobotics/bluePLM/issues)
- **Documentation:** You're here!

---

**Next:** [Quick Start Guide →](./getting-started.md)
