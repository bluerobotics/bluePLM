import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const {
  commandExists,
  directorySize,
  formatBytes,
  removeStaleResourceOutput,
} = require('./build-edrawings-preview-host.js') as {
  commandExists: (command: string, args: string[]) => boolean
  directorySize: (directory: string) => number
  formatBytes: (bytes: number) => string
  removeStaleResourceOutput: (resourceDirectory: string) => void
}

test('treats a command with a nonzero exit status as unavailable', () => {
  expect(commandExists(process.execPath, ['-e', 'process.exit(3)'])).toBe(false)
})

test('removes a stale host payload before a toolchain skip', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'blueplm-edrawings-host-resource-'))
  writeFileSync(path.join(directory, 'stale.exe'), 'stale')

  removeStaleResourceOutput(directory)

  expect(existsSync(directory)).toBe(false)
})

test('measures the complete host payload recursively', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'blueplm-edrawings-host-'))
  mkdirSync(path.join(directory, 'nested'))
  writeFileSync(path.join(directory, 'host.exe'), '1234')
  writeFileSync(path.join(directory, 'nested', 'runtimeconfig.json'), '123')

  expect(directorySize(directory)).toBe(7)
})

test('formats host payload sizes for build logs', () => {
  expect(formatBytes(1024 * 1024)).toBe('1.0 MiB')
})
