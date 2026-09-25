# eDrawings Preview Native Addon

Optional Windows addon for embedding an eDrawings preview in Electron.

## Prerequisites

- **Windows** (eDrawings is Windows-only)
- **Node.js** with node-gyp
- **Visual Studio Build Tools** (C++ workload)
- **eDrawings** installed (for runtime)

## Building

```bash
# Install dependencies
cd native
npm install

# Build the addon
npm run build
```

## Troubleshooting

### "Cannot find module" error
The native addon needs to be built first. Run `npm run build` in the `native` folder.

### Build errors with node-gyp
Make sure you have:
1. Visual Studio Build Tools with C++ workload
2. Python 3.x installed
3. Run `npm config set msvs_version 2022` (or your VS version)

### eDrawings not detected
The addon checks these paths:
- `C:\Program Files\SOLIDWORKS Corp\eDrawings\`
- `C:\Program Files\eDrawings\`
- `C:\Program Files (x86)\eDrawings\`

## API

```javascript
const edrawings = require('./native');

// Check if eDrawings is installed
const status = edrawings.checkEDrawingsInstalled();
// { installed: true, path: "C:\\Program Files\\..." }

// Open file in external eDrawings
edrawings.openInEDrawings('C:\\path\\to\\file.sldprt');

// Create embedded preview (Windows-only, experimental)
const preview = new edrawings.EDrawingsPreview();
preview.attachToWindow(hwnd);
preview.loadFile('C:\\path\\to\\file.sldprt', 'C:\\Program Files\\Common Files\\eDrawings2026\\eDrawings.exe');
preview.setBounds(x, y, width, height);
```

## Note

The module launches an eDrawings process owned by BluePLM and re-parents only
that window into BluePLM. This avoids relying on the legacy ActiveX control,
which is absent from some current eDrawings installations. It is deliberately
optional: when the module, Windows, or eDrawings are unavailable, BluePLM uses
the normal thumbnail or external-viewer workflow.

