# Extension Structure

This document covers the directory layout, file organization, and project setup for BluePLM extensions.

## Directory Layout

### Minimal Extension

```
my-extension/
├── extension.json      # Manifest (required)
├── LICENSE             # Open source license (required)
└── client/
    └── index.js        # Entry point
```

### Full Extension

```
my-extension/
├── extension.json          # Manifest
├── README.md               # Documentation
├── CHANGELOG.md            # Version history
├── LICENSE                 # License file
├── icon.png                # 128x128 icon
├── package.json            # Build configuration
├── tsconfig.json           # TypeScript config
├── client/                 # Client-side code
│   ├── index.ts            # Entry point
│   ├── commands/           # Command handlers
│   │   ├── sync.ts
│   │   └── configure.ts
│   ├── components/         # React components
│   │   ├── Panel.tsx
│   │   ├── Settings.tsx
│   │   └── StatusBar.tsx
│   ├── views/              # View components
│   │   └── Sidebar.tsx
│   ├── services/           # Business logic
│   │   ├── syncService.ts
│   │   └── apiClient.ts
│   ├── hooks/              # React hooks
│   │   └── useConfig.ts
│   └── utils/              # Utilities
│       ├── formatting.ts
│       └── validation.ts
├── server/                 # Server-side code
│   ├── sync.ts             # Route handler
│   ├── status.ts           # Route handler
│   ├── webhook.ts          # Public handler
│   └── utils/              # Server utilities
│       └── helpers.ts
├── types/                  # Type definitions
│   └── index.ts
├── test/                   # Tests
│   ├── client/
│   └── server/
└── scripts/                # Build scripts
    └── package.js
```

---

## File Purposes

### Root Files

| File | Purpose | Required |
|------|---------|----------|
| `extension.json` | Extension manifest | ✓ |
| `LICENSE` | Open source license | ✓ |
| `README.md` | User documentation | Recommended |
| `CHANGELOG.md` | Version history | Recommended |
| `icon.png` | Extension icon | Recommended |
| `package.json` | npm dependencies and scripts | For development |
| `tsconfig.json` | TypeScript configuration | For TypeScript |

### Client Directory

| File/Folder | Purpose |
|-------------|---------|
| `index.ts` | Entry point with `activate` and `deactivate` exports |
| `commands/` | Command handler implementations |
| `components/` | React components for UI |
| `views/` | View components (sidebar, panel, dialog) |
| `services/` | Business logic and API clients |
| `hooks/` | Custom React hooks |
| `utils/` | Utility functions |

### Server Directory

| File/Folder | Purpose |
|-------------|---------|
| `*.ts` | Route handlers (one per API route) |
| `utils/` | Shared server utilities |

---

## Entry Point

### Client Entry (index.ts)

```typescript
import type { ExtensionContext, ExtensionClientAPI } from '@blueplm/extension-api'

// Required export
export async function activate(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  // Called when extension is activated
}

// Optional export
export function deactivate(): void {
  // Called when extension is deactivated
}
```

### Server Entry (handler.ts)

```typescript
import type { ExtensionServerAPI } from '@blueplm/extension-api'

// Default export required
export default async function handler(
  api: ExtensionServerAPI
): Promise<ExtensionResponse> {
  // Handler implementation
  return api.response.json({ success: true })
}
```

---

## Project Setup

### package.json

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "npm run build:client && npm run build:server",
    "build:client": "esbuild client/index.ts --bundle --outfile=dist/client/index.js --format=esm --platform=browser --external:react --external:react-dom --minify",
    "build:server": "esbuild server/*.ts --bundle --outdir=dist/server --format=esm --minify",
    "watch": "npm run build -- --watch",
    "package": "npm run build && node scripts/package.js",
    "lint": "eslint client server",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "devDependencies": {
    "@blueplm/extension-api": "^1.0.0",
    "@types/react": "^18.0.0",
    "archiver": "^6.0.0",
    "esbuild": "^0.19.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0",
    "typescript": "^5.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": false,
    "outDir": "dist",
    "rootDir": ".",
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM"],
    "types": ["node"]
  },
  "include": ["client/**/*", "server/**/*", "types/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### .gitignore

```
node_modules/
dist/
*.bpx
.env
.DS_Store
```

---

## Code Organization Patterns

### Commands Module

```
client/commands/
├── index.ts          # Export all commands
├── sync.ts           # Sync command
└── configure.ts      # Configure command
```

```typescript
// client/commands/index.ts
export { registerSyncCommand } from './sync'
export { registerConfigureCommand } from './configure'

// client/commands/sync.ts
import type { ExtensionContext, ExtensionClientAPI } from '@blueplm/extension-api'

export function registerSyncCommand(
  context: ExtensionContext,
  api: ExtensionClientAPI
) {
  return api.commands.registerCommand('myext.sync', async () => {
    // Implementation
  })
}
```

### Services Module

```
client/services/
├── index.ts          # Export all services
├── syncService.ts    # Sync logic
└── apiClient.ts      # API wrapper
```

```typescript
// client/services/apiClient.ts
import type { ExtensionClientAPI } from '@blueplm/extension-api'

export class ApiClient {
  constructor(private api: ExtensionClientAPI) {}

  async sync(vaultId: string) {
    return this.api.callOrgApi('/extensions/myext/sync', {
      method: 'POST',
      body: { vaultId }
    })
  }

  async getStatus() {
    return this.api.callOrgApi('/extensions/myext/status')
  }
}
```

### Components Module

```
client/components/
├── index.ts          # Export all components
├── Panel.tsx         # Main panel
├── Settings.tsx      # Settings page
└── shared/           # Shared components
    ├── Button.tsx
    └── StatusBadge.tsx
```

### Types Module

```
types/
└── index.ts          # All type definitions
```

```typescript
// types/index.ts
export interface SyncResult {
  fileCount: number
  duration: number
  errors: string[]
}

export interface ExtensionConfig {
  autoSync: boolean
  syncInterval: number
  excludePatterns: string[]
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  autoSync: true,
  syncInterval: 300,
  excludePatterns: ['*.tmp']
}
```

---

## Build Output

After building, the `dist/` directory should mirror the source structure:

```
dist/
├── client/
│   ├── index.js              # Bundled client entry
│   └── components/
│       ├── Panel.js          # Bundled components
│       └── Settings.js
└── server/
    ├── sync.js               # Bundled handlers
    └── status.js
```

The `.bpx` package includes:

```
my-extension-1.0.0.bpx
├── extension.json
├── README.md
├── LICENSE
├── icon.png
├── client/                   # From dist/client/
│   └── ...
└── server/                   # From dist/server/
    └── ...
```

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Extension ID | `publisher.name` | `mycompany.cloud-sync` |
| Command ID | `extension.action` | `cloud-sync.syncNow` |
| View ID | `extension.viewname` | `cloud-sync.panel` |
| Storage keys | `camelCase` | `lastSyncTime` |
| File names | `camelCase.ts` | `syncService.ts` |
| Component names | `PascalCase.tsx` | `SettingsPanel.tsx` |
| Server handlers | `lowercase.ts` | `sync.ts` |

---

## Best Practices

### 1. Separate Concerns

- Commands in `commands/`
- Business logic in `services/`
- UI in `components/`
- Types in `types/`

### 2. Single Responsibility

Each file should have one purpose:
- One command handler per file
- One component per file
- One service per file

### 3. Index Files

Use index files for clean imports:

```typescript
// client/commands/index.ts
export * from './sync'
export * from './configure'

// Usage in index.ts
import { registerSyncCommand, registerConfigureCommand } from './commands'
```

### 4. Type Everything

```typescript
// Strong typing for better AI assistance and IDE support
interface SyncOptions {
  vaultId: string
  force?: boolean
}

async function performSync(
  api: ExtensionClientAPI,
  options: SyncOptions
): Promise<SyncResult> {
  // Implementation
}
```

---

**[← Getting Started](./getting-started.md)** | **[Manifest Reference →](./manifest.md)**
