import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}))

import {
  ftpAccessOptions,
  ftpBase,
  installerBridge,
  resolveSecrets,
  swapRemoteDeployment,
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
    expect(ftpAccessOptions(ftpBase('ftps://ftp.example.test:21', 'explicit'), 'explicit')).toEqual(
      {
        host: 'ftp.example.test',
        port: 21,
        secure: true,
      },
    )
    expect(
      ftpAccessOptions(ftpBase('ftps://ftp.example.test:990', 'implicit'), 'implicit'),
    ).toEqual({
      host: 'ftp.example.test',
      port: 990,
      secure: 'implicit',
    })
  })
})

describe('MDB staged deployment', () => {
  class FakeDeploymentClient {
    entries = new Map<string, string>()
    failRenameFrom: string | null = null

    async cd(): Promise<string> {
      return '/'
    }
    async ensureDir(remotePath: string): Promise<string> {
      this.entries.set(remotePath, 'directory')
      return remotePath
    }
    async list(parent: string): Promise<Array<{ name: string }>> {
      const prefix = `${parent.replace(/\/$/, '')}/`
      return [...this.entries.keys()]
        .filter((entry) => entry.startsWith(prefix) && !entry.slice(prefix.length).includes('/'))
        .map((entry) => ({ name: entry.slice(prefix.length) }))
    }
    async rename(source: string, destination: string): Promise<void> {
      if (source === this.failRenameFrom) throw new Error('simulated FTP rename failure')
      const value = this.entries.get(source)
      if (!value) throw new Error(`missing ${source}`)
      this.entries.delete(source)
      this.entries.set(destination, value)
    }
    async removeDir(remotePath: string): Promise<void> {
      for (const entry of [...this.entries.keys()]) {
        if (entry === remotePath || entry.startsWith(`${remotePath}/`)) this.entries.delete(entry)
      }
    }
  }

  function deploymentFixture() {
    const client = new FakeDeploymentClient()
    const target = '/blueplm'
    const stage = '/blueplm/blueplm-stage-0123456789abcdef01234567'
    client.entries.set(`${target}/public`, 'old-public')
    client.entries.set(`${target}/src`, 'old-src')
    client.entries.set(`${target}/migrations`, 'old-migrations')
    client.entries.set(`${target}/.env`, 'old-env')
    client.entries.set(`${stage}/public`, 'new-public')
    client.entries.set(`${stage}/src`, 'new-src')
    client.entries.set(`${stage}/migrations`, 'new-migrations')
    return { client, target, stage }
  }

  it('activates all dependencies before restoring the public entry point', async () => {
    const { client, target, stage } = deploymentFixture()
    await swapRemoteDeployment(client as never, target, stage, false)

    expect(client.entries.get(`${target}/src`)).toBe('new-src')
    expect(client.entries.get(`${target}/migrations`)).toBe('new-migrations')
    expect(client.entries.get(`${target}/public`)).toBe('new-public')
    expect(client.entries.get(`${target}/.env`)).toBe('old-env')
  })

  it('rolls every component back when an FTP rename fails during activation', async () => {
    const { client, target, stage } = deploymentFixture()
    client.failRenameFrom = `${stage}/migrations`

    await expect(swapRemoteDeployment(client as never, target, stage, false)).rejects.toThrow(
      'simulated FTP rename failure',
    )
    expect(client.entries.get(`${target}/src`)).toBe('old-src')
    expect(client.entries.get(`${target}/migrations`)).toBe('old-migrations')
    expect(client.entries.get(`${target}/public`)).toBe('old-public')
    expect(client.entries.get(`${stage}/src`)).toBe('new-src')
  })

  it('limits the temporary bridge to authenticated installer routes', () => {
    const bridge = installerBridge('blueplm-stage-0123456789abcdef01234567')
    expect(bridge).toContain("'/installer/database-status'")
    expect(bridge).toContain("'/installer/commit'")
    expect(bridge).toContain("$_SERVER['BLUEPLM_LIVE_ROOT']")
    expect(bridge).not.toContain('installationToken')
  })

  it('rejects a stage name that could escape the deployment root', () => {
    expect(() => installerBridge('../outside')).toThrow('Invalid installer stage name')
  })
})
