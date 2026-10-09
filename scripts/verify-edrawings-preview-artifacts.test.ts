import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const {
  HOST_FILES,
  PACKAGED_PAYLOAD_DIRECTORY,
  SOURCE_PAYLOAD_DIRECTORY,
  verifyPackagedPayload,
  verifyPayload,
} = require('./verify-edrawings-preview-artifacts.js') as {
  HOST_FILES: string[]
  PACKAGED_PAYLOAD_DIRECTORY: string[]
  SOURCE_PAYLOAD_DIRECTORY: string[]
  verifyPackagedPayload: (sourceDirectory: string, packagedDirectory: string) => void
  verifyPayload: (directory: string) => { addonBytes: number; hostBytes: number }
}

function writePayload(directory: string) {
  mkdirSync(path.join(directory, 'edrawings-preview-host'))
  writeFileSync(path.join(directory, 'edrawings_preview.node'), 'addon')
  HOST_FILES.forEach(file => writeFileSync(path.join(directory, 'edrawings-preview-host', file), file))
}

test('verifies a complete framework-dependent preview payload', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'blueplm-edrawings-artifacts-'))
  writePayload(directory)

  const payload = verifyPayload(directory)

  expect(payload.addonBytes).toBe(5)
  expect(payload.hostBytes).toBeGreaterThan(0)
})

test('rejects a stale partial payload', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'blueplm-edrawings-artifacts-'))
  writePayload(directory)

  const missing = path.join(directory, 'edrawings-preview-host', 'BluePLM.EDrawingsPreviewHost.runtimeconfig.json')
  rmSync(missing)

  expect(() => verifyPayload(directory)).toThrow(/Missing required eDrawings artifact/)
})

test('rejects a missing fresh native addon', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'blueplm-edrawings-artifacts-'))
  writePayload(directory)
  rmSync(path.join(directory, 'edrawings_preview.node'))

  expect(() => verifyPayload(directory)).toThrow(/Missing required eDrawings artifact/)
})

test('rejects a packaged payload left over from another build', () => {
  const source = mkdtempSync(path.join(tmpdir(), 'blueplm-edrawings-source-'))
  const packaged = mkdtempSync(path.join(tmpdir(), 'blueplm-edrawings-packaged-'))
  writePayload(source)
  writePayload(packaged)
  writeFileSync(path.join(packaged, 'edrawings-preview-host', 'BluePLM.EDrawingsPreviewHost.dll'), 'stale')

  expect(() => verifyPackagedPayload(source, packaged)).toThrow(
    /does not match the fresh build/,
  )
})

test('uses Electron Builder\'s unpacked Windows resource layout', () => {
  expect(SOURCE_PAYLOAD_DIRECTORY).toEqual(['resources', 'bin', 'win32'])
  expect(PACKAGED_PAYLOAD_DIRECTORY).toEqual(['release', 'win-unpacked', 'resources', 'bin'])
})
