import { app, ipcMain } from 'electron'
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Client } from 'basic-ftp'

export type MdbFtpsSecurity = 'explicit' | 'implicit'

export interface MdbProvisionRequest {
  publicUrl: string
  ftpUrl: string
  ftpSecurity: MdbFtpsSecurity
  ftpRemotePath: string
  ftpUsername: string
  ftpPassword: string
  databaseHost: string
  databasePort: number
  databaseName: string
  databaseUser: string
  databasePassword: string
  sessionSecret?: string
  bootstrapToken?: string
  maintenanceToken?: string
  documentRootConfirmed: boolean
  databaseAction?: 'install' | 'migrate' | 'reset'
  resetConfirmation?: string
  bootstrap?: {
    organizationName: string
    organizationSlug: string
    email: string
    displayName: string
    password: string
    vaultName?: string
    networkRoot?: string
  }
}

export interface MdbProvisionResult {
  success: boolean
  serverUrl?: string
  accessToken?: string
  migrated?: boolean
  generatedSecrets?: { sessionSecret: string; bootstrapToken: string; maintenanceToken: string }
  error?: string
}

export interface MdbDatabaseInspection {
  state: 'empty' | 'managed' | 'legacy' | 'foreign'
  tableCount: number
  bootstrapped: boolean
  appliedMigrations: number
  pendingMigrations: number
}

export interface MdbInspectionResult {
  success: boolean
  database?: MdbDatabaseInspection
  error?: string
}

export interface MdbFtpTestRequest {
  ftpUrl: string
  ftpSecurity: MdbFtpsSecurity
  ftpRemotePath: string
  ftpUsername: string
  ftpPassword: string
}

type Secrets = Required<
  Pick<MdbProvisionRequest, 'sessionSecret' | 'bootstrapToken' | 'maintenanceToken'>
>

function fail(message: string): never {
  throw new Error(message)
}

function required(value: string, label: string, max = 2048): string {
  const clean = value.trim()
  if (!clean || clean.length > max) fail(`A valid ${label} is required.`)
  return clean
}

function singleLine(value: string, label: string, max = 2048): string {
  const clean = required(value, label, max)
  if (/[\r\n\0]/.test(clean)) fail(`${label} must not contain line breaks.`)
  return clean
}

function secret(value: string | undefined, label: string): string {
  if (!value || value.length < 32 || value.length > 512)
    fail(`${label} must contain at least 32 characters.`)
  if (/[\r\n\0]/.test(value)) fail(`${label} must not contain line breaks.`)
  return value
}

export function resolveSecrets(request: MdbProvisionRequest): {
  secrets: Secrets
  generated?: MdbProvisionResult['generatedSecrets']
} {
  const supplied = [request.sessionSecret, request.bootstrapToken, request.maintenanceToken]
  if (supplied.every((value) => !value)) {
    const generatedSecrets = {
      sessionSecret: randomBytes(32).toString('base64url'),
      bootstrapToken: randomBytes(32).toString('base64url'),
      maintenanceToken: randomBytes(32).toString('base64url'),
    }
    return { secrets: generatedSecrets, generated: generatedSecrets }
  }
  if (supplied.some((value) => !value))
    fail('Enter all three secrets or leave all three empty to generate them securely.')
  return {
    secrets: {
      sessionSecret: secret(request.sessionSecret, 'Session secret'),
      bootstrapToken: secret(request.bootstrapToken, 'Bootstrap token'),
      maintenanceToken: secret(request.maintenanceToken, 'Maintenance token'),
    },
  }
}

function publicBase(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    fail('The public backend URL must be a valid HTTPS URL.')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    fail('The public backend URL must be a plain root HTTPS URL.')
  url.pathname = url.pathname.replace(/\/$/, '')
  return url
}

export function ftpBase(raw: string, security: MdbFtpsSecurity): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    fail('The FTP server URL is invalid.')
  }
  const expectedPort = security === 'implicit' ? '990' : security === 'explicit' ? '21' : ''
  if (
    url.protocol !== 'ftps:' ||
    url.port !== expectedPort ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    fail('Use an ftps:// server URL with the port matching the selected TLS mode and without credentials.')
  return url
}

export function ftpAccessOptions(ftp: URL, security: MdbFtpsSecurity) {
  return {
    host: ftp.hostname,
    port: Number(ftp.port),
    secure: security === 'implicit' ? ('implicit' as const) : true,
  }
}

function remotePath(value: string): string {
  const clean = value.trim().replaceAll('\\', '/')
  if (!clean) return ''
  const segments = clean.split('/').filter(Boolean)
  if (
    segments.some(
      (segment) => segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment),
    )
  )
    fail('The FTP target path contains an invalid path segment.')
  return segments.join('/')
}

function serverBundleRoot(): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'blueplm-mdb-server')
    : path.resolve(app.getAppPath(), 'blueplm-mdb-php')
  return root
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const children = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name)
      return entry.isDirectory() ? await listFiles(full) : [full]
    }),
  )
  return children.flat()
}

async function upload(
  ftp: URL,
  security: MdbFtpsSecurity,
  destination: string,
  localFile: string,
  username: string,
  password: string,
): Promise<void> {
  const client = new Client(30_000)
  client.ftp.verbose = false
  const base = ftp.pathname.replace(/\/$/, '')
  const remote = `${base}/${destination}`.replaceAll('//', '/')
  try {
    await client.access({
      ...ftpAccessOptions(ftp, security),
      user: username,
      password,
    })
    const directory = remote.slice(0, remote.lastIndexOf('/')) || '/'
    await client.ensureDir(directory)
    await client.uploadFrom(localFile, remote.slice(remote.lastIndexOf('/') + 1))
  } finally {
    client.close()
  }
}

async function removeRemoteFile(
  ftp: URL,
  security: MdbFtpsSecurity,
  destination: string,
  username: string,
  password: string,
): Promise<void> {
  const client = new Client(30_000)
  client.ftp.verbose = false
  const base = ftp.pathname.replace(/\/$/, '')
  const remote = `${base}/${destination}`.replaceAll('//', '/')
  try {
    await client.access({
      ...ftpAccessOptions(ftp, security),
      user: username,
      password,
    })
    await client.remove(remote, true)
  } finally {
    client.close()
  }
}

async function testFtpConnection(
  request: MdbFtpTestRequest,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ftp = ftpBase(request.ftpUrl, request.ftpSecurity)
    const username = singleLine(request.ftpUsername, 'FTP username', 512)
    const password = singleLine(request.ftpPassword, 'FTP password')
    const targetRoot = remotePath(request.ftpRemotePath)
    const client = new Client(30_000)
    client.ftp.verbose = false
    const base = ftp.pathname.replace(/\/$/, '')
    try {
      await client.access({
        ...ftpAccessOptions(ftp, request.ftpSecurity),
        user: username,
        password,
      })
      await client.cd(`${base}/${targetRoot}`.replaceAll('//', '/'))
      await client.list()
    } finally {
      client.close()
    }
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'FTP connection test failed.',
    }
  }
}

function environment(
  request: MdbProvisionRequest,
  secrets: Secrets,
  publicUrl: URL,
  installationToken: string,
): string {
  const databasePort =
    Number.isInteger(request.databasePort) &&
    request.databasePort > 0 &&
    request.databasePort <= 65535
      ? request.databasePort
      : fail('The database port is invalid.')
  return [
    'BLUEPLM_ENV=production',
    'BLUEPLM_CORS_ORIGINS=null,file://,http://localhost:5173',
    `BLUEPLM_PUBLIC_URL=${publicUrl.toString().replace(/\/$/, '')}`,
    `MARIADB_HOST=${singleLine(request.databaseHost, 'database host', 255)}`,
    `MARIADB_PORT=${databasePort}`,
    `MARIADB_DATABASE=${singleLine(request.databaseName, 'database name', 255)}`,
    `MARIADB_USER=${singleLine(request.databaseUser, 'database user', 255)}`,
    `MARIADB_PASSWORD=${singleLine(request.databasePassword, 'database password')}`,
    `BLUEPLM_SESSION_SECRET=${secrets.sessionSecret}`,
    `BLUEPLM_BOOTSTRAP_TOKEN=${secrets.bootstrapToken}`,
    `BLUEPLM_MAINTENANCE_TOKEN=${secrets.maintenanceToken}`,
    `BLUEPLM_INSTALLATION_TOKEN=${installationToken}`,
    '',
  ].join('\n')
}

async function installerRequest<T>(
  publicUrl: URL,
  route: '/installer/database-status' | '/installer/commit',
  payload: Record<string, unknown>,
): Promise<T> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 30_000)
  try {
    const response = await fetch(new URL(route, publicUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abort.signal,
      body: JSON.stringify(payload),
    })
    const body = (await response.json().catch(() => ({}))) as T & {
      message?: string
      error?: string
    }
    if (!response.ok)
      fail(
        body.message ||
          body.error ||
          `The installer endpoint returned HTTP ${response.status}. Verify the webroot points to public/.`,
      )
    return body
  } finally {
    clearTimeout(timer)
  }
}

async function prepareInstaller(request: MdbProvisionRequest): Promise<{
  publicUrl: URL
  installationToken: string
  generated?: MdbProvisionResult['generatedSecrets']
  cleanupPendingEnvironment: () => Promise<void>
}> {
  if (!request.documentRootConfirmed) {
    fail(
      'Confirm that the domain document root points to the uploaded public/ directory before continuing.',
    )
  }
  const publicUrl = publicBase(request.publicUrl)
  const ftp = ftpBase(request.ftpUrl, request.ftpSecurity)
  const root = serverBundleRoot()
  await fs.access(path.join(root, 'public', 'index.php'))
  const ftpUsername = singleLine(request.ftpUsername, 'FTP username', 512)
  const ftpPassword = singleLine(request.ftpPassword, 'FTP password')
  const targetRoot = remotePath(request.ftpRemotePath)
  const pendingEnvironment = `${targetRoot}/.env.install`
  const cleanupPendingEnvironment = async () => {
    await removeRemoteFile(
      ftp,
      request.ftpSecurity,
      pendingEnvironment,
      ftpUsername,
      ftpPassword,
    )
  }
  const { secrets, generated } = resolveSecrets(request)
  const installationToken = randomBytes(32).toString('base64url')
  const allowedRoots = ['src', 'public', 'migrations']
  const files = (
    await Promise.all(allowedRoots.map((folder) => listFiles(path.join(root, folder))))
  ).flat()
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll('\\', '/')
    await upload(
      ftp,
      request.ftpSecurity,
      `${targetRoot}/${relative}`,
      file,
      ftpUsername,
      ftpPassword,
    )
  }
  const temp = await fs.mkdtemp(path.join(app.getPath('temp'), 'blueplm-mdb-env-'))
  const envPath = path.join(temp, '.env')
  try {
    await fs.writeFile(envPath, environment(request, secrets, publicUrl, installationToken), {
      mode: 0o600,
    })
    await upload(
      ftp,
      request.ftpSecurity,
      pendingEnvironment,
      envPath,
      ftpUsername,
      ftpPassword,
    )
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
  return { publicUrl, installationToken, generated, cleanupPendingEnvironment }
}

async function inspectDatabase(request: MdbProvisionRequest): Promise<MdbInspectionResult> {
  let cleanupPendingEnvironment: (() => Promise<void>) | undefined
  try {
    const prepared = await prepareInstaller(request)
    cleanupPendingEnvironment = prepared.cleanupPendingEnvironment
    const result = await installerRequest<{ database: MdbDatabaseInspection }>(
      prepared.publicUrl,
      '/installer/database-status',
      { installationToken: prepared.installationToken },
    )
    return { success: true, database: result.database }
  } catch (error) {
    await cleanupPendingEnvironment?.().catch(() => undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'MDB database inspection failed.',
    }
  }
}

async function provision(request: MdbProvisionRequest): Promise<MdbProvisionResult> {
  let cleanupPendingEnvironment: (() => Promise<void>) | undefined
  try {
    if (!request.databaseAction)
      fail('Inspect the database and choose an installation action first.')
    const prepared = await prepareInstaller(request)
    cleanupPendingEnvironment = prepared.cleanupPendingEnvironment
    const result = await installerRequest<{ token?: string | null }>(
      prepared.publicUrl,
      '/installer/commit',
      {
        installationToken: prepared.installationToken,
        action: request.databaseAction,
        confirmation: request.resetConfirmation,
        bootstrap: request.bootstrap,
      },
    )
    return {
      success: true,
      serverUrl: prepared.publicUrl.toString().replace(/\/$/, ''),
      accessToken: typeof result.token === 'string' ? result.token : undefined,
      migrated: request.databaseAction === 'migrate',
      generatedSecrets: request.databaseAction === 'migrate' ? undefined : prepared.generated,
    }
  } catch (error) {
    await cleanupPendingEnvironment?.().catch(() => undefined)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'MDB installation could not be completed.',
    }
  }
}

export function registerMdbInstallerHandlers(): void {
  ipcMain.handle(
    'mdb-installer:inspect-database',
    async (_event, request: MdbProvisionRequest) => await inspectDatabase(request),
  )
  ipcMain.handle(
    'mdb-installer:provision',
    async (_event, request: MdbProvisionRequest) => await provision(request),
  )
  ipcMain.handle(
    'mdb-installer:test-ftp',
    async (_event, request: MdbFtpTestRequest) => await testFtpConnection(request),
  )
}

export function unregisterMdbInstallerHandlers(): void {
  ipcMain.removeHandler('mdb-installer:inspect-database')
  ipcMain.removeHandler('mdb-installer:provision')
  ipcMain.removeHandler('mdb-installer:test-ftp')
}
