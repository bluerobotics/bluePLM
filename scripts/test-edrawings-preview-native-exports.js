const { spawnSync } = require('node:child_process')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const buildScript = path.join(__dirname, 'build-edrawings-preview.js')
const inspectScript = path.join(__dirname, 'inspect-edrawings-preview-exports.cjs')
const electronExecutable = require('electron')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? 'no status'}`)
  }
}

try {
  run(process.execPath, [buildScript])
  run(electronExecutable, [inspectScript, 'production'])
  run(process.execPath, [buildScript, '--verify'])
  run(electronExecutable, [inspectScript, 'verify'])
} finally {
  // Never leave a verify-only GetPixel build in the production resource path.
  run(process.execPath, [buildScript])
}
