import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}))

import {
  ftpAccessOptions,
  ftpBase,
  resolveSecrets,
  type MdbProvisionRequest,
} from './mdbInstaller'

const request: MdbProvisionRequest = {
  publicUrl: 'https://blueplm.example.test',
  ftpUrl: 'ftps://ftp.example.test:21',
  ftpSecurity: 'explicit',
  ftpRemotePath: 'blueplm-mdb',
  ftpUsername: 'deploy',
  ftpPassword: 'not-used-by-this-test',
  databaseHost: 'localhost',
  databasePort: 3306,
  databaseName: 'blueplm',
  databaseUser: 'blueplm',
  databasePassword: 'not-used-by-this-test',
  documentRootConfirmed: true,
}

describe('MDB installer secrets', () => {
  it('generates three independent first-install secrets only when none were supplied', () => {
    const result = resolveSecrets(request)
    expect(result.generated).toBeDefined()
    expect(result.secrets.sessionSecret).toHaveLength(43)
    expect(new Set(Object.values(result.secrets)).size).toBe(3)
  })

  it('rejects partial secret input instead of silently mixing generated and supplied values', () => {
    expect(() => resolveSecrets({ ...request, sessionSecret: 'x'.repeat(32) })).toThrow(
      'Enter all three secrets',
    )
  })

  it('keeps a complete administrator-supplied secret set', () => {
    const supplied = {
      sessionSecret: 'a'.repeat(32),
      bootstrapToken: 'b'.repeat(32),
      maintenanceToken: 'c'.repeat(32),
    }
    expect(resolveSecrets({ ...request, ...supplied })).toEqual({ secrets: supplied })
  })
})

describe('MDB installer transport', () => {
  it('rejects plaintext FTP before credentials can be sent', () => {
    expect(() => ftpBase('ftp://ftp.example.test', 'explicit')).toThrow('ftps://')
    expect(() => ftpBase('ftps://ftp.example.test', 'explicit')).toThrow()
  })

  it('accepts only the port matching the selected FTPS mode', () => {
    expect(ftpBase('ftps://ftp.example.test:21', 'explicit').port).toBe('21')
    expect(ftpBase('ftps://ftp.example.test:990', 'implicit').port).toBe('990')
    expect(() => ftpBase('ftps://ftp.example.test:990', 'explicit')).toThrow()
    expect(() => ftpBase('ftps://ftp.example.test:21', 'implicit')).toThrow()
  })

  it('maps the selected FTPS mode to the secure basic-ftp transport', () => {
    expect(ftpAccessOptions(ftpBase('ftps://ftp.example.test:21', 'explicit'), 'explicit')).toEqual({
      host: 'ftp.example.test',
      port: 21,
      secure: true,
    })
    expect(ftpAccessOptions(ftpBase('ftps://ftp.example.test:990', 'implicit'), 'implicit')).toEqual({
      host: 'ftp.example.test',
      port: 990,
      secure: 'implicit',
    })
  })
})
