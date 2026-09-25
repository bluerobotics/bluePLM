/* Build the clean-room WinForms/ActiveX host used by the optional preview. */
const { execFileSync } = require('node:child_process')
const { cpSync, existsSync } = require('node:fs')
const path = require('node:path')

if (process.platform !== 'win32') {
  console.log('[eDrawings] Preview host is Windows-only; skipping.')
  process.exit(0)
}

const root = path.resolve(__dirname, '..')
const project = path.join(root, 'edrawings-preview-host', 'BluePLM.EDrawingsPreviewHost.csproj')
const publishDirectory = path.join(root, 'edrawings-preview-host', 'publish', 'win-x64')
const resourceDirectory = path.join(root, 'resources', 'bin', 'win32', 'edrawings-preview-host')

if (!existsSync(project)) {
  throw new Error(`eDrawings preview host project was not found: ${project}`)
}

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
    'true',
    '--output',
    publishDirectory,
  ],
  { cwd: root, stdio: 'inherit' },
)

cpSync(publishDirectory, resourceDirectory, { recursive: true, force: true })
console.log('[eDrawings] Built clean-room ActiveX preview host.')
