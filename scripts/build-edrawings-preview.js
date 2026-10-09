/* Build the optional Windows native eDrawings preview module for Electron. */
const { execFileSync, spawnSync } = require('node:child_process')
const { copyFileSync, existsSync, mkdirSync, rmSync, statSync } = require('node:fs')
const path = require('node:path')
const { resolveNpmInvocation } = require('./resolve-npm-invocation')

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

function commandExists(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore', windowsHide: true })
  return !result.error && result.status === 0
}

function hasVisualCppToolchain() {
  if (commandExists('cl.exe', ['/?'])) return true

  const vswhere = path.join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  )
  if (!existsSync(vswhere)) return false

  const result = spawnSync(
    vswhere,
    ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
    { encoding: 'utf8', windowsHide: true },
  )
  return result.status === 0 && result.stdout.trim().length > 0
}

function removeStaleResourceOutput(resourceFile) {
  rmSync(resourceFile, { force: true })
}

function resolveNativeBuildOptions(args) {
  const verify = args.includes('--verify')
  return {
    verify,
    gypDefine: `edrawings_verify=${verify ? 1 : 0}`,
  }
}

function skip(reason) {
  console.warn(`[eDrawings] Skipping optional native preview: ${reason}`)
}

function main() {
  const buildOptions = resolveNativeBuildOptions(process.argv.slice(2))
  const root = path.resolve(__dirname, '..')
  const nativeDirectory = path.join(root, 'native')
  const resourceDirectory = path.join(root, 'resources', 'bin', 'win32')
  const resourceFile = path.join(resourceDirectory, 'edrawings_preview.node')
  removeStaleResourceOutput(resourceFile)

  if (process.platform !== 'win32') {
    skip('it is supported only on Windows.')
    return
  }

  if (!commandExists('python.exe', ['--version']) && !commandExists('py.exe', ['-3', '--version'])) {
    skip('Python 3 was not found; install it before building the optional node-gyp addon.')
    return
  }

  if (!hasVisualCppToolchain()) {
    skip('Visual Studio Build Tools with the C++ workload were not found.')
    return
  }

  let gypEntrypoint = path.join(nativeDirectory, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
  if (!existsSync(gypEntrypoint)) {
    const { command, args } = resolveNpmInvocation()
    // Keep the cmd.exe npm bootstrap: it is required for Node 25 on Windows.
    execFileSync(command, args, { cwd: nativeDirectory, stdio: 'inherit' })
    gypEntrypoint = path.join(nativeDirectory, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
  }

  if (!existsSync(gypEntrypoint)) {
    throw new Error(`node-gyp bootstrap completed without producing ${gypEntrypoint}`)
  }

  const output = path.join(nativeDirectory, 'build', 'Release', 'edrawings_preview.node')
  const electronVersion = require(path.join(root, 'node_modules', 'electron', 'package.json')).version
  execFileSync(
    process.execPath,
    [
      gypEntrypoint,
      'rebuild',
      `--target=${electronVersion}`,
      '--arch=x64',
      '--dist-url=https://electronjs.org/headers',
    ],
    {
      cwd: nativeDirectory,
      env: {
        ...process.env,
        GYP_DEFINES: `${process.env.GYP_DEFINES ?? ''} ${buildOptions.gypDefine}`.trim(),
      },
      stdio: 'inherit',
    },
  )

  if (!existsSync(output)) {
    throw new Error(`node-gyp completed without producing ${output}`)
  }

  mkdirSync(resourceDirectory, { recursive: true })
  copyFileSync(output, resourceFile)
  const buildKind = buildOptions.verify ? 'verify-only diagnostic' : 'production'
  console.log(
    `[eDrawings] Built ${buildKind} native preview module for Electron ${electronVersion} (${formatBytes(statSync(resourceFile).size)}).`,
  )
}

if (require.main === module) main()

module.exports = {
  commandExists,
  formatBytes,
  hasVisualCppToolchain,
  removeStaleResourceOutput,
  resolveNativeBuildOptions,
}
