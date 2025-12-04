# eDrawings Preview Native Addon

Native addon for embedding eDrawings preview in Electron.

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

// Create embedded preview (advanced)
const preview = edrawings.createPreview();
preview.attachToWindow(hwnd);
preview.loadFile('C:\\path\\to\\file.sldprt');
preview.setBounds(x, y, width, height);
```

## Note

The embedded preview feature requires the eDrawings ActiveX control to be properly installed and registered. The simpler "Open in eDrawings" approach works reliably and is recommended for most use cases.

