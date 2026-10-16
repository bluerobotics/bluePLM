import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface NpmInvocation {
  command: string
  args: string[]
}

const require = createRequire(import.meta.url)
const { resolveNpmInvocation } = require('./resolve-npm-invocation.js') as {
  resolveNpmInvocation: (platform?: string, environment?: Record<string, string>) => NpmInvocation
}

describe('resolveNpmInvocation', () => {
  it('executes npm directly on non-Windows platforms', () => {
    expect(resolveNpmInvocation('linux', {})).toEqual({
      command: 'npm',
      args: ['install', '--ignore-scripts'],
    })
  })

  it('runs the Windows npm command through cmd.exe without shell interpolation', () => {
    expect(resolveNpmInvocation('win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' })).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'install', '--ignore-scripts'],
    })
  })

  it('falls back to cmd.exe when ComSpec is not set', () => {
    expect(resolveNpmInvocation('win32', {})).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'install', '--ignore-scripts'],
    })
  })
})
