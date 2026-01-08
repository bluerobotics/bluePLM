# Package Format (.bpx)

BluePLM extensions are distributed as `.bpx` files — ZIP archives containing the extension manifest, code, and assets. This document covers the package structure and creation process.

## Package Structure

```
my-extension-1.0.0.bpx  (ZIP archive)
├── extension.json          # Manifest (required)
├── README.md               # Documentation (recommended)
├── CHANGELOG.md            # Version history (optional)
├── LICENSE                 # Open source license (required)
├── icon.png                # Extension icon (recommended)
├── SIGNATURE               # Ed25519 signature (verified only)
├── client/                 # Client-side code
│   ├── index.js            # Main entry (required if main specified)
│   └── components/         # React components
│       ├── Panel.js
│       └── Settings.js
└── server/                 # Server-side code
    ├── index.js            # Server entry (optional)
    ├── sync.js             # Route handlers
    └── webhook.js
```

## Required Files

### extension.json

The manifest file. See [Manifest Reference](./manifest.md).

```json
{
  "$schema": "https://blueplm.io/schemas/extension-v1.schema.json",
  "id": "mycompany.my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "publisher": "mycompany",
  "license": "MIT",
  ...
}
```

### LICENSE

An open source license file. All BluePLM extensions must be open source.

Common licenses:
- `MIT` — Permissive, widely used
- `Apache-2.0` — Permissive with patent grant
- `GPL-3.0` — Copyleft

---

## Recommended Files

### README.md

Documentation for users. Displayed in the Extension Store.

```markdown
# My Extension

Brief description of what this extension does.

## Features

- Feature 1
- Feature 2

## Setup

1. Install from Extension Store
2. Configure in Settings → Extensions → My Extension
3. ...

## Usage

How to use the extension.

## Requirements

- BluePLM 1.0.0 or later
- ...
```

### icon.png

Extension icon displayed in the store and settings.

**Requirements:**
- Format: PNG
- Size: 128×128 pixels (recommended)
- Aspect ratio: Square
- Background: Transparent supported

### CHANGELOG.md

Version history for users.

```markdown
# Changelog

## [1.1.0] - 2024-03-15
### Added
- Batch sync feature
- Progress indicator

### Fixed
- Memory leak in file watcher

## [1.0.0] - 2024-03-01
### Added
- Initial release
```

---

## Code Organization

### Client Code

Client code runs in the Extension Host (isolated renderer process).

```
client/
├── index.ts              # Entry point (activate/deactivate)
├── components/           # React components
│   ├── Panel.tsx
│   └── Settings.tsx
├── views/                # View components
│   └── Sidebar.tsx
└── utils/                # Helper functions
    └── helpers.ts
```

**Entry Point (index.ts):**
```typescript
import type { ExtensionContext, ExtensionClientAPI } from '@blueplm/extension-api'

export async function activate(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  // Initialization
}

export function deactivate(): void {
  // Cleanup
}
```

### Server Code

Server code runs in V8 isolates on the organization's API server.

```
server/
├── index.ts              # Server entry (optional)
├── sync.ts               # Sync handler
├── status.ts             # Status handler
├── webhook.ts            # Webhook handler
└── utils/                # Shared utilities
    └── helpers.ts
```

**Handler Structure:**
```typescript
import type { ExtensionServerAPI } from '@blueplm/extension-api'

export default async function handler(
  api: ExtensionServerAPI
): Promise<ExtensionResponse> {
  // Handler logic
  return api.response.json({ success: true })
}
```

---

## Building

### Prerequisites

- Node.js 18+
- TypeScript
- Bundler (esbuild, rollup, or webpack)

### Package.json

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "npm run build:client && npm run build:server",
    "build:client": "esbuild client/index.ts --bundle --outfile=dist/client/index.js --format=esm --platform=browser --external:react --external:react-dom",
    "build:server": "esbuild server/*.ts --bundle --outdir=dist/server --format=esm --platform=node",
    "package": "npm run build && node scripts/package.js",
    "clean": "rimraf dist *.bpx"
  },
  "devDependencies": {
    "esbuild": "^0.19.0",
    "typescript": "^5.0.0",
    "rimraf": "^5.0.0"
  }
}
```

### Build Script (esbuild)

**scripts/package.js:**
```javascript
const fs = require('fs')
const path = require('path')
const archiver = require('archiver')

const manifest = JSON.parse(fs.readFileSync('extension.json', 'utf8'))
const filename = `${manifest.id.split('.')[1]}-${manifest.version}.bpx`

const output = fs.createWriteStream(filename)
const archive = archiver('zip', { zlib: { level: 9 } })

archive.pipe(output)

// Add manifest
archive.file('extension.json', { name: 'extension.json' })

// Add documentation
if (fs.existsSync('README.md')) {
  archive.file('README.md', { name: 'README.md' })
}
if (fs.existsSync('CHANGELOG.md')) {
  archive.file('CHANGELOG.md', { name: 'CHANGELOG.md' })
}
archive.file('LICENSE', { name: 'LICENSE' })

// Add icon
if (fs.existsSync('icon.png')) {
  archive.file('icon.png', { name: 'icon.png' })
}

// Add built code
archive.directory('dist/client/', 'client/')
archive.directory('dist/server/', 'server/')

archive.finalize()

output.on('close', () => {
  console.log(`Created ${filename} (${archive.pointer()} bytes)`)
})
```

### TypeScript Configuration

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": ".",
    "jsx": "react-jsx"
  },
  "include": ["client/**/*", "server/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Packaging Steps

### 1. Validate Manifest

```bash
# Using CLI (if available)
blueplm-ext validate extension.json

# Or use JSON Schema validation
npx ajv validate -s schemas/extension-v1.schema.json -d extension.json
```

### 2. Build Code

```bash
npm run build
```

### 3. Test Locally

Sideload the extension before packaging:

1. Build the code
2. Open BluePLM → Settings → Extensions
3. Click "Sideload Extension"
4. Select your `extension.json` file (from source directory)
5. Test all functionality

### 4. Create Package

```bash
npm run package
```

This creates `my-extension-1.0.0.bpx`.

### 5. Verify Package

```bash
# List contents
unzip -l my-extension-1.0.0.bpx

# Expected output:
#   extension.json
#   README.md
#   LICENSE
#   icon.png
#   client/index.js
#   client/components/Panel.js
#   client/components/Settings.js
#   server/sync.js
#   server/status.js
```

---

## Package Signing (Verified Extensions)

Verified extensions are signed with Ed25519 signatures by Blue Robotics.

### Signature File

```
SIGNATURE
```

Contains:
```
-----BEGIN BLUEPLM SIGNATURE-----
KeyId: bluerobotics-2024
Hash: SHA256:a1b2c3d4e5f6...
Signature: base64-encoded-ed25519-signature
-----END BLUEPLM SIGNATURE-----
```

### Verification Process

1. Calculate SHA-256 hash of package contents (excluding SIGNATURE)
2. Verify hash matches expected
3. Verify Ed25519 signature with Blue Robotics public key
4. Check key ID against revocation list

### Getting Verified

To get your extension verified:

1. Submit to Extension Store
2. Request verification review
3. Blue Robotics reviews code
4. If approved, extension is signed and marked verified

---

## Size Limits

| Limit | Value | Description |
|-------|-------|-------------|
| Package size | 10 MB | Maximum .bpx file size |
| Client bundle | 2 MB | Maximum client/index.js |
| Server handlers | 1 MB each | Per handler file |
| Total handlers | 5 MB | Combined server code |
| Assets | 5 MB | Icons, images, etc. |

### Reducing Size

1. **Tree shaking** — Only import what you use
2. **Minification** — Enable in bundler
3. **External deps** — Don't bundle React (provided by host)
4. **Lazy loading** — Split large components

**esbuild with minification:**
```bash
esbuild client/index.ts \
  --bundle \
  --minify \
  --external:react \
  --external:react-dom \
  --outfile=dist/client/index.js
```

---

## Best Practices

### 1. Keep Package Small

```json
// .npmignore or add to .gitignore
node_modules/
src/
tests/
*.ts  // Only ship compiled .js
```

### 2. Include Source Maps for Debugging

```bash
esbuild ... --sourcemap=external
```

### 3. Version Your Package

Use semantic versioning:
- 1.0.0 → 1.0.1 (patch: bug fix)
- 1.0.0 → 1.1.0 (minor: new feature)
- 1.0.0 → 2.0.0 (major: breaking change)

### 4. Test Before Publishing

1. Sideload and test all features
2. Test on different platforms (if cross-platform)
3. Test with different BluePLM versions
4. Check performance (startup time < 200ms)

### 5. Document Everything

- README with setup instructions
- CHANGELOG with version history
- Inline code comments for complex logic

---

## Example Build Setup

Complete example with esbuild and React:

**Directory Structure:**
```
my-extension/
├── client/
│   ├── index.tsx
│   └── components/
│       └── Panel.tsx
├── server/
│   └── sync.ts
├── extension.json
├── README.md
├── LICENSE
├── icon.png
├── package.json
├── tsconfig.json
└── scripts/
    └── package.js
```

**package.json:**
```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "scripts": {
    "build": "npm run build:client && npm run build:server",
    "build:client": "esbuild client/index.tsx --bundle --outfile=dist/client/index.js --format=esm --platform=browser --external:react --external:react-dom --minify",
    "build:server": "esbuild server/*.ts --bundle --outdir=dist/server --format=esm --minify",
    "package": "npm run build && node scripts/package.js",
    "dev": "npm run build -- --watch",
    "lint": "eslint client server",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "archiver": "^6.0.0",
    "esbuild": "^0.19.0",
    "eslint": "^8.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Build and package:**
```bash
npm install
npm run package
# Output: my-extension-1.0.0.bpx
```

---

**[← Permissions Reference](./permissions.md)** | **[Publishing Guide →](./publishing.md)**
