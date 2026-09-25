/* Build the optional Windows native eDrawings preview module for Electron. */
const { execFileSync } = require('node:child_process')
const { copyFileSync, existsSync, mkdirSync } = require('node:fs')
const path = require('node:path')

if (process.platform !== 'win32') {
  console.log('[eDrawings] Native preview is Windows-only; skipping.')
  process.exit(0)
}

const root = path.resolve(__dirname, '..')
const nativeDirectory = path.join(root, 'native')
const gypEntrypoint = path.join(nativeDirectory, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
const output = path.join(nativeDirectory, 'build', 'Release', 'edrawings_preview.node')
const resourceDirectory = path.join(root, 'resources', 'bin', 'win32')
const electronVersion = require(path.join(root, 'node_modules', 'electron', 'package.json')).version

if (!existsSync(gypEntrypoint)) {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--ignore-scripts'], {
    cwd: nativeDirectory,
    stdio: 'inherit',
  })
}

execFileSync(process.execPath, [gypEntrypoint, 'rebuild', `--target=${electronVersion}`, '--arch=x64', '--dist-url=https://electronjs.org/headers'], {
  cwd: nativeDirectory,
  stdio: 'inherit',
})

mkdirSync(resourceDirectory, { recursive: true })
copyFileSync(output, path.join(resourceDirectory, 'edrawings_preview.node'))
console.log(`[eDrawings] Built optional preview module for Electron ${electronVersion}.`)
