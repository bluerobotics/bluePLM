/* Verify the optional eDrawings payload before a Windows release is uploaded. */
const { createHash } = require('node:crypto')
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs')
const path = require('node:path')

const HOST_FILES = [
  'BluePLM.EDrawingsPreviewHost.exe',
  'BluePLM.EDrawingsPreviewHost.dll',
  'BluePLM.EDrawingsPreviewHost.deps.json',
  'BluePLM.EDrawingsPreviewHost.runtimeconfig.json',
]
const SOURCE_PAYLOAD_DIRECTORY = ['resources', 'bin', 'win32']
const PACKAGED_PAYLOAD_DIRECTORY = ['release', 'win-unpacked', 'resources', 'bin']

function directorySize(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const entryPath = path.join(directory, entry.name)
    return total + (entry.isDirectory() ? directorySize(entryPath) : statSync(entryPath).size)
  }, 0)
}

function assertFile(filePath) {
  if (!existsSync(filePath)) throw new Error(`Missing required eDrawings artifact: ${filePath}`)
  if (statSync(filePath).size === 0) throw new Error(`Empty eDrawings artifact: ${filePath}`)
}

function hashFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function verifyPayload(directory) {
  const addon = path.join(directory, 'edrawings_preview.node')
  assertFile(addon)
  const hostDirectory = path.join(directory, 'edrawings-preview-host')
  HOST_FILES.forEach(file => assertFile(path.join(hostDirectory, file)))
  return { addonBytes: statSync(addon).size, hostBytes: directorySize(hostDirectory) }
}

function verifyPackagedPayload(sourceDirectory, packagedDirectory) {
  const relativeFiles = [
    'edrawings_preview.node',
    ...HOST_FILES.map(file => path.join('edrawings-preview-host', file)),
  ]
  relativeFiles.forEach(relativeFile => {
    const sourceFile = path.join(sourceDirectory, relativeFile)
    const packagedFile = path.join(packagedDirectory, relativeFile)
    if (hashFile(sourceFile) !== hashFile(packagedFile)) {
      throw new Error(`Packaged eDrawings artifact does not match the fresh build: ${relativeFile}`)
    }
  })
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

function main(root = path.resolve(__dirname, '..')) {
  const sourceDirectory = path.join(root, ...SOURCE_PAYLOAD_DIRECTORY)
  const packagedDirectory = path.join(root, ...PACKAGED_PAYLOAD_DIRECTORY)
  const source = verifyPayload(sourceDirectory)
  const packaged = verifyPayload(packagedDirectory)
  verifyPackagedPayload(sourceDirectory, packagedDirectory)
  console.log(`[eDrawings] Verified source payload: addon ${formatBytes(source.addonBytes)}, host ${formatBytes(source.hostBytes)}.`)
  console.log(`[eDrawings] Verified packaged payload: addon ${formatBytes(packaged.addonBytes)}, host ${formatBytes(packaged.hostBytes)}.`)
}

if (require.main === module) main()

module.exports = {
  HOST_FILES,
  PACKAGED_PAYLOAD_DIRECTORY,
  SOURCE_PAYLOAD_DIRECTORY,
  directorySize,
  main,
  verifyPackagedPayload,
  verifyPayload,
}
