export const MDB_SETUP_PRESET_FORMAT = 'blueplm-mdb-setup-preset'
export const MDB_SETUP_PRESET_VERSION = 1

const PLACEHOLDERS = {
  ftpPassword: '<ENTER_FTP_PASSWORD_ON_IMPORT>',
  databasePassword: '<ENTER_DATABASE_PASSWORD_ON_IMPORT>',
  sessionSecret: '<ENTER_SESSION_SECRET_ON_IMPORT>',
  bootstrapToken: '<ENTER_BOOTSTRAP_TOKEN_ON_IMPORT>',
  maintenanceToken: '<ENTER_MAINTENANCE_TOKEN_ON_IMPORT>',
  ownerPassword: '<ENTER_OWNER_PASSWORD_ON_IMPORT>',
} as const

export interface MdbSetupPresetInput {
  publicUrl: string
  ftpUrl: string
  ftpSecurity: 'explicit' | 'implicit'
  ftpRemotePath: string
  ftpUsername: string
  ftpPassword: string
  databaseHost: string
  databasePort: string
  databaseName: string
  databaseUser: string
  databasePassword: string
  sessionSecret: string
  bootstrapToken: string
  maintenanceToken: string
  documentRootConfirmed: boolean
  companyName: string
  companySlug: string
  ownerName: string
  ownerEmail: string
  ownerPassword: string
  vaultName: string
  networkRoot: string
}

export interface MdbSetupPreset {
  format: typeof MDB_SETUP_PRESET_FORMAT
  version: typeof MDB_SETUP_PRESET_VERSION
  values: MdbSetupPresetInput & {
    ftpPassword: typeof PLACEHOLDERS.ftpPassword
    databasePassword: typeof PLACEHOLDERS.databasePassword
    sessionSecret: typeof PLACEHOLDERS.sessionSecret
    bootstrapToken: typeof PLACEHOLDERS.bootstrapToken
    maintenanceToken: typeof PLACEHOLDERS.maintenanceToken
    ownerPassword: typeof PLACEHOLDERS.ownerPassword
  }
}

/**
 * Build an importable setup preset without serializing any credentials or
 * secrets. The placeholders are deliberately visible so a human knows which
 * values must be entered again after importing.
 */
export function createMdbSetupPreset(input: MdbSetupPresetInput): MdbSetupPreset {
  return {
    format: MDB_SETUP_PRESET_FORMAT,
    version: MDB_SETUP_PRESET_VERSION,
    values: {
      ...input,
      ftpPassword: PLACEHOLDERS.ftpPassword,
      databasePassword: PLACEHOLDERS.databasePassword,
      sessionSecret: PLACEHOLDERS.sessionSecret,
      bootstrapToken: PLACEHOLDERS.bootstrapToken,
      maintenanceToken: PLACEHOLDERS.maintenanceToken,
      ownerPassword: PLACEHOLDERS.ownerPassword,
    },
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 4096) : ''
}

/**
 * Validate and normalize an imported preset. Sensitive fields are always
 * cleared, even if a hand-edited file tried to include real credentials.
 */
export function parseMdbSetupPreset(raw: unknown): MdbSetupPresetInput {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid MDB setup preset.')
  const record = raw as Record<string, unknown>
  if (record.format !== MDB_SETUP_PRESET_FORMAT || record.version !== MDB_SETUP_PRESET_VERSION) {
    throw new Error('Unsupported MDB setup preset.')
  }
  const values = record.values
  if (!values || typeof values !== 'object') throw new Error('Invalid MDB setup preset values.')
  const source = values as Record<string, unknown>

  return {
    publicUrl: text(source.publicUrl),
    ftpUrl: text(source.ftpUrl),
    ftpSecurity: source.ftpSecurity === 'implicit' ? 'implicit' : 'explicit',
    ftpRemotePath: text(source.ftpRemotePath),
    ftpUsername: text(source.ftpUsername),
    ftpPassword: '',
    databaseHost: text(source.databaseHost) || 'localhost',
    databasePort: text(source.databasePort) || '3306',
    databaseName: text(source.databaseName),
    databaseUser: text(source.databaseUser),
    databasePassword: '',
    sessionSecret: '',
    bootstrapToken: '',
    maintenanceToken: '',
    documentRootConfirmed: source.documentRootConfirmed === true,
    companyName: text(source.companyName),
    companySlug: text(source.companySlug),
    ownerName: text(source.ownerName),
    ownerEmail: text(source.ownerEmail),
    ownerPassword: '',
    vaultName: text(source.vaultName),
    networkRoot: text(source.networkRoot),
  }
}

export function serializeMdbSetupPreset(input: MdbSetupPresetInput): string {
  return `${JSON.stringify(createMdbSetupPreset(input), null, 2)}\n`
}
