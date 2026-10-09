import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const {
  commandExists,
  formatBytes,
  removeStaleResourceOutput,
  resolveNativeBuildOptions,
} = require('./build-edrawings-preview.js') as {
  commandExists: (command: string, args: string[]) => boolean
  formatBytes: (bytes: number) => string
  removeStaleResourceOutput: (resourceFile: string) => void
  resolveNativeBuildOptions: (args: string[]) => { verify: boolean; gypDefine: string }
}

test('keeps desktop pixel diagnostics out of production builds', () => {
  expect(resolveNativeBuildOptions([])).toEqual({
    verify: false,
    gypDefine: 'edrawings_verify=0',
  })
})

test('enables desktop pixel diagnostics only for an explicit verify build', () => {
  expect(resolveNativeBuildOptions(['--verify'])).toEqual({
    verify: true,
    gypDefine: 'edrawings_verify=1',
  })
})

test('treats a command with a nonzero exit status as unavailable', () => {
  expect(commandExists(process.execPath, ['-e', 'process.exit(3)'])).toBe(false)
})

test('removes only the stale native resource artifact before a skip', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'blueplm-edrawings-'))
  const artifact = path.join(directory, 'edrawings_preview.node')
  const unrelated = path.join(directory, 'keep.txt')
  writeFileSync(artifact, 'stale')
  writeFileSync(unrelated, 'keep')

  removeStaleResourceOutput(artifact)

  expect(existsSync(artifact)).toBe(false)
  expect(existsSync(unrelated)).toBe(true)
})

test('formats native payload sizes for build logs', () => {
  expect(formatBytes(1024)).toBe('1.0 KiB')
})
