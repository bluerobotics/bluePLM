const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const destDir = path.join(__dirname, '..', 'dist-electron', 'extension-host');

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Copy the HTML file
const htmlSrc = path.join(__dirname, '..', 'electron', 'extension-host', 'host.html');
const htmlDest = path.join(destDir, 'host.html');
fs.copyFileSync(htmlSrc, htmlDest);
console.log('✓ Copied extension-host/host.html');

// Build the preload script using esbuild (faster than tsx for simple builds)
// The preload needs to be CommonJS for Electron
const preloadSrc = path.join(__dirname, '..', 'electron', 'extension-host', 'preload.ts');
const preloadDest = path.join(destDir, 'preload.js');

try {
  execSync(`npx esbuild "${preloadSrc}" --bundle --platform=node --target=node18 --format=cjs --external:electron --outfile="${preloadDest}"`, {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  console.log('✓ Built extension-host/preload.js');
} catch (err) {
  console.error('Failed to build preload:', err.message);
  process.exit(1);
}
