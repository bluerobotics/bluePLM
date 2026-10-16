import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import { expect, test } from 'vitest'

const verifierPath = fileURLToPath(new URL('./verify-edrawings-preview.cjs', import.meta.url))
const verifierRequire = createRequire(verifierPath)

test('starting the manual verifier preserves unrelated files in the OS temp directory', () => {
  const isolatedTempDirectory = mkdtempSync(path.join(tmpdir(), 'blueplm-preview-startup-'))
  const legacyNames = [
    'BluePLM-eDrawings-preview-test-result.json',
    'BluePLM-eDrawings-preview-test-checkpoint.json',
  ]
  const contents = legacyNames.map((name) => `unrelated temp content: ${name}`)
  const paths = legacyNames.map((name) => path.join(isolatedTempDirectory, name))
  paths.forEach((filePath, index) => writeFileSync(filePath, contents[index]))

  try {
    const electronStub = {
      app: { whenReady: () => new Promise(() => undefined) },
      BrowserWindow: class {},
    }
    const isolatedRequire = (request: string) => {
      if (request === 'electron') return electronStub
      if (request === 'node:os') return { tmpdir: () => isolatedTempDirectory }
      return verifierRequire(request)
    }
    const source = readFileSync(verifierPath, 'utf8')
    new Script(source, { filename: verifierPath }).runInNewContext({
      __dirname: path.dirname(verifierPath),
      clearInterval,
      console,
      process,
      require: isolatedRequire,
      setInterval,
      setTimeout,
    })

    expect(paths.map((filePath) => existsSync(filePath))).toEqual([true, true])
    expect(paths.map((filePath) => readFileSync(filePath, 'utf8'))).toEqual(contents)
  } finally {
    rmSync(isolatedTempDirectory, { recursive: true, force: true })
  }
})
