import { describe, expect, it } from 'vitest'

import { createMdbSetupPreset, parseMdbSetupPreset, serializeMdbSetupPreset } from './mdbSetupPreset'

const input = {
  publicUrl: 'https://blueplm.example.test',
  ftpUrl: 'ftps://ftp.example.test:21',
  ftpSecurity: 'explicit' as const,
  ftpRemotePath: '/blueplm',
  ftpUsername: 'ftp-user',
  ftpPassword: 'ftp-secret',
  databaseHost: 'db.example.test',
  databasePort: '3306',
  databaseName: 'blueplm',
  databaseUser: 'blueplm-user',
  databasePassword: 'db-secret',
  sessionSecret: 'session-secret',
  bootstrapToken: 'bootstrap-secret',
  maintenanceToken: 'maintenance-secret',
  documentRootConfirmed: true,
  companyName: 'Works3D',
  companySlug: 'works3d',
  ownerName: 'Owner',
  ownerEmail: 'owner@example.test',
  ownerPassword: 'owner-secret',
  vaultName: 'Vault',
  networkRoot: '\\\\server\\vault',
}

describe('MDB setup presets', () => {
  it('exports placeholders instead of credentials and secrets', () => {
    const serialized = serializeMdbSetupPreset(input)

    expect(serialized).toContain('<ENTER_FTP_PASSWORD_ON_IMPORT>')
    expect(serialized).toContain('<ENTER_DATABASE_PASSWORD_ON_IMPORT>')
    expect(serialized).toContain('<ENTER_SESSION_SECRET_ON_IMPORT>')
    expect(serialized).not.toContain('ftp-secret')
    expect(serialized).not.toContain('db-secret')
    expect(serialized).not.toContain('owner-secret')
  })

  it('imports non-sensitive fields and clears all sensitive fields', () => {
    const imported = parseMdbSetupPreset(createMdbSetupPreset(input))

    expect(imported.publicUrl).toBe(input.publicUrl)
    expect(imported.databaseName).toBe(input.databaseName)
    expect(imported.networkRoot).toBe(input.networkRoot)
    expect(imported.ftpPassword).toBe('')
    expect(imported.databasePassword).toBe('')
    expect(imported.sessionSecret).toBe('')
    expect(imported.bootstrapToken).toBe('')
    expect(imported.maintenanceToken).toBe('')
    expect(imported.ownerPassword).toBe('')
  })
})
