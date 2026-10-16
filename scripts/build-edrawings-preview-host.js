/* Build the clean-room WinForms/ActiveX host used by the optional preview. */
const { execFileSync, spawnSync } = require('node:child_process')
const { cpSync, existsSync, readdirSync, rmSync, statSync } = require('node:fs')
const path = require('node:path')

function commandExists(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore', windowsHide: true })
  return !result.error && result.status === 0
}

function directorySize(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const entryPath = path.join(directory, entry.name)
    return total + (entry.isDirectory() ? directorySize(entryPath) : statSync(entryPath).size)
  }, 0)
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

function skip(reason) {
  console.warn(`[eDrawings] Skipping optional preview host: ${reason}`)
}

function removeStaleResourceOutput(resourceDirectory) {
  rmSync(resourceDirectory, { recursive: true, force: true })
}

function main() {
  const root = path.resolve(__dirname, '..')
  const project = path.join(root, 'edrawings-preview-host', 'BluePLM.EDrawingsPreviewHost.csproj')
  const publishDirectory = path.join(root, 'edrawings-preview-host', 'publish', 'win-x64')
  const resourceDirectory = path.join(root, 'resources', 'bin', 'win32', 'edrawings-preview-host')
  // A skip may happen after a successful local build. Remove only this generated
  // payload so a later package verification cannot mistake it for a fresh build.
  removeStaleResourceOutput(resourceDirectory)

  if (process.platform !== 'win32') {
    skip('it is supported only on Windows.')
    return
  }

  if (!commandExists('dotnet', ['--version'])) {
    skip('the .NET SDK was not found; install it to build the optional preview host.')
    return
  }

  if (!existsSync(project)) {
    throw new Error(`eDrawings preview host project was not found: ${project}`)
  }

  rmSync(publishDirectory, { recursive: true, force: true })
  execFileSync(
    'dotnet',
    [
      'publish',
      project,
      '--configuration',
      'Release',
      '--runtime',
      'win-x64',
      '--self-contained',
      'false',
      '--output',
      publishDirectory,
    ],
    { cwd: root, stdio: 'inherit' },
  )

  if (!existsSync(path.join(publishDirectory, 'BluePLM.EDrawingsPreviewHost.exe'))) {
    throw new Error(`dotnet publish completed without producing the preview host executable in ${publishDirectory}`)
  }

  cpSync(publishDirectory, resourceDirectory, { recursive: true, force: true })
  console.log(`[eDrawings] Built framework-dependent ActiveX preview host (${formatBytes(directorySize(resourceDirectory))}).`)
}

if (require.main === module) main()

module.exports = {
  commandExists,
  directorySize,
  formatBytes,
  removeStaleResourceOutput,
}
