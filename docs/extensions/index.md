# BluePLM Extension Development

Welcome to the BluePLM Extension Development documentation. This comprehensive guide covers everything you need to know to create, test, and publish extensions for BluePLM.

## What are BluePLM Extensions?

BluePLM Extensions are modular packages that add functionality to the BluePLM desktop application. Built on an enterprise-grade architecture inspired by VS Code and Atlassian Forge, extensions can:

- **Add UI Components** — Panels, dialogs, settings pages, and sidebar items
- **Register Commands** — Keyboard shortcuts and command palette actions
- **Integrate External Services** — Connect to APIs like Google Drive, Odoo, SolidWorks
- **Process Files** — React to file changes and automate workflows
- **Store Data** — Persist configuration and user data securely

## Architecture Overview

Extensions run in isolated environments for security:

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
| **Native** | Runs in main Electron process (SolidWorks, etc.) | Verified only |

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
- [Publishing Guide](./publishing.md) — Submit to the Extension Store
- [Best Practices](./best-practices.md) — Patterns and recommendations
- [Troubleshooting](./troubleshooting.md) — Common issues and solutions

### For AI Assistants
- [Complete Reference](./ai-reference.md) — Consolidated reference for AI code generation

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
- **Marketplace:** [marketplace.blueplm.io](https://marketplace.blueplm.io)
- **Documentation:** You're here!

---

**Next:** [Quick Start Guide →](./getting-started.md)
