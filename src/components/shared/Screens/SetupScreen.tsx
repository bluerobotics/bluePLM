import { useState, useEffect } from 'react'
import {
  Key,
  Users,
  Loader2,
  Check,
  Copy,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Server,
} from 'lucide-react'
import {
  saveConfig,
  generateOrgCode,
  parseOrgCode,
  validateConfig,
  clearConfig,
  type SupabaseConfig,
} from '@/lib/supabaseConfig'
import { reconfigureSupabase } from '@/lib/supabase'
import { LanguageSelector } from '@/components/shared/LanguageSelector'
import { useTranslation } from '@/lib/i18n'
import { copyToClipboard } from '@/lib/clipboard'
import { log } from '@/lib/logger'
import { clearCommunityConfig, saveCommunityConfig, validateCommunityConfig } from '@/lib/community'

interface SetupScreenProps {
  onConfigured: () => void
}

type SetupMode = 'select' | 'admin' | 'member' | 'mariadb' | 'mariadb-existing' | 'mariadb-install'

// Minimal title bar for window dragging (shown only on setup screen)
function SetupTitleBar() {
  const [appVersion, setAppVersion] = useState('')
  const [platform, setPlatform] = useState<string>('win32')
  const [titleBarPadding, setTitleBarPadding] = useState(140)

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getVersion().then(setAppVersion)
      window.electronAPI.getPlatform().then(setPlatform)
      window.electronAPI.getTitleBarOverlayRect?.().then((rect) => {
        if (rect?.width) {
          setTitleBarPadding(rect.width + 8)
        }
      })
    }
  }, [])

  return (
    <div className="h-[38px] bg-plm-activitybar border-b border-plm-border select-none flex-shrink-0 titlebar-drag-region relative">
      {/* Left side - App name (add padding on macOS for window buttons) */}
      <div
        className="absolute left-0 top-0 h-full flex items-center"
        style={{ paddingLeft: platform === 'darwin' ? 72 : 16 }}
      >
        <div className="flex items-center gap-2 titlebar-no-drag">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-plm-accent">
            <path
              d="M12 2L2 7L12 12L22 7L12 2Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2 17L12 22L22 17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2 12L12 17L22 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-sm font-semibold text-plm-fg">BluePLM</span>
          {appVersion && <span className="text-xs text-plm-fg-muted">v{appVersion}</span>}
        </div>
      </div>

      {/* Right side padding for window controls on Windows */}
      <div
        className="absolute right-0 top-0 h-full"
        style={{ paddingRight: platform === 'darwin' ? 16 : titleBarPadding }}
      />
    </div>
  )
}

export function SetupScreen({ onConfigured }: SetupScreenProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<SetupMode>('select')
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Admin mode state
  const [projectId, setProjectId] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)

  // Member mode state
  const [orgCode, setOrgCode] = useState('')
  const [mariadbServerUrl, setMariadbServerUrl] = useState('')
  const [mdbPublicUrl, setMdbPublicUrl] = useState('')
  const [mdbFtpUrl, setMdbFtpUrl] = useState('ftps://')
  const [mdbFtpSecurity, setMdbFtpSecurity] = useState<'explicit' | 'implicit'>('explicit')
  const [mdbFtpPath, setMdbFtpPath] = useState('')
  const [mdbFtpUser, setMdbFtpUser] = useState('')
  const [mdbFtpPassword, setMdbFtpPassword] = useState('')
  const [isTestingMdbFtp, setIsTestingMdbFtp] = useState(false)
  const [mdbFtpTestResult, setMdbFtpTestResult] = useState<'success' | null>(null)
  const [mdbDatabaseHost, setMdbDatabaseHost] = useState('localhost')
  const [mdbDatabasePort, setMdbDatabasePort] = useState('3306')
  const [mdbDatabaseName, setMdbDatabaseName] = useState('')
  const [mdbDatabaseUser, setMdbDatabaseUser] = useState('')
  const [mdbDatabasePassword, setMdbDatabasePassword] = useState('')
  const [mdbGenerateSecrets, setMdbGenerateSecrets] = useState(true)
  const [mdbSessionSecret, setMdbSessionSecret] = useState('')
  const [mdbBootstrapToken, setMdbBootstrapToken] = useState('')
  const [mdbMaintenanceToken, setMdbMaintenanceToken] = useState('')
  const [mdbDocumentRootConfirmed, setMdbDocumentRootConfirmed] = useState(false)
  const [mdbNetworkRoot, setMdbNetworkRoot] = useState('')
  const [mdbCompanyName, setMdbCompanyName] = useState('')
  const [mdbCompanySlug, setMdbCompanySlug] = useState('')
  const [mdbOwnerName, setMdbOwnerName] = useState('')
  const [mdbOwnerEmail, setMdbOwnerEmail] = useState('')
  const [mdbOwnerPassword, setMdbOwnerPassword] = useState('')
  const [mdbVaultName, setMdbVaultName] = useState('')
  const [mdbResetConfirmation, setMdbResetConfirmation] = useState('')
  const [mdbDatabaseAction, setMdbDatabaseAction] = useState<
    'install' | 'migrate' | 'reset' | null
  >(null)
  const [mdbInspection, setMdbInspection] = useState<{
    state: 'empty' | 'managed' | 'legacy' | 'foreign'
    tableCount: number
    bootstrapped: boolean
    appliedMigrations: number
    pendingMigrations: number
  } | null>(null)
  const [mdbProvisioned, setMdbProvisioned] = useState<{
    serverUrl: string
    migrated: boolean
    generatedSecrets?: { sessionSecret: string; bootstrapToken: string; maintenanceToken: string }
  } | null>(null)

  useEffect(() => {
    setMdbInspection(null)
    setMdbDatabaseAction(null)
    setMdbResetConfirmation('')
  }, [
    mdbPublicUrl,
    mdbFtpUrl,
    mdbFtpPath,
    mdbFtpUser,
    mdbFtpPassword,
    mdbDatabaseHost,
    mdbDatabasePort,
    mdbDatabaseName,
    mdbDatabaseUser,
    mdbDatabasePassword,
  ])

  const handleAdminSetup = async () => {
    if (!projectId.trim() || !anonKey.trim()) {
      setError(t('setup.enterBothFields'))
      return
    }

    // Basic project ID validation (alphanumeric, typically 20 chars)
    const cleanProjectId = projectId.trim().toLowerCase()
    if (!/^[a-z0-9]+$/.test(cleanProjectId)) {
      setError(t('setup.invalidProjectId'))
      return
    }

    setIsValidating(true)
    setError(null)

    // Construct URL from project ID
    const supabaseUrl = `https://${cleanProjectId}.supabase.co`

    const config: SupabaseConfig = {
      version: 1,
      url: supabaseUrl,
      anonKey: anonKey.trim(),
      orgSlug: orgSlug.trim() || undefined,
    }

    // Validate connection
    const { valid, error: validationError } = await validateConfig(config)

    if (!valid) {
      setError(validationError || 'Failed to connect to Supabase')
      setIsValidating(false)
      return
    }

    clearCommunityConfig()
    saveConfig(config)
    reconfigureSupabase(config)

    // Generate shareable code
    const code = generateOrgCode(config)
    setGeneratedCode(code)
    setIsValidating(false)
  }

  const handleCopyCode = async () => {
    if (!generatedCode) return

    const result = await copyToClipboard(generatedCode)
    if (result.success) {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } else {
      log.error('[SetupScreen]', 'Failed to copy', { error: result.error })
    }
  }

  const handleMemberSetup = async () => {
    if (!orgCode.trim()) {
      setError('Please enter the Organization Code')
      return
    }

    setIsValidating(true)
    setError(null)

    // Parse the code
    const config = parseOrgCode(orgCode.trim())

    if (!config) {
      setError('Invalid Organization Code. Please check and try again.')
      setIsValidating(false)
      return
    }

    // Validate connection
    const { valid, error: validationError } = await validateConfig(config)

    if (!valid) {
      setError(validationError || 'Failed to connect to Supabase with provided code')
      setIsValidating(false)
      return
    }

    clearCommunityConfig()
    saveConfig(config)
    reconfigureSupabase(config)
    setIsValidating(false)
    onConfigured()
  }

  const handleFinishAdminSetup = () => {
    onConfigured()
  }

  const handleMdbNetworkRootBrowse = async () => {
    if (!window.electronAPI?.selectDirectory) {
      setError(t('mdbSetup.folderPickerUnavailable'))
      return
    }
    try {
      const result = await window.electronAPI.selectDirectory(t('mdbSetup.selectNetworkFolder'))
      if (result.success && result.folderPath) setMdbNetworkRoot(result.folderPath)
    } catch (pickerError) {
      log.error('[SetupScreen]', 'Network folder picker failed', { error: pickerError })
      setError(t('mdbSetup.folderPickerFailed'))
    }
  }

  const handleMariadbSetup = async (serverUrl = mariadbServerUrl) => {
    if (!serverUrl.trim()) {
      setError(t('mdbSetup.backendUrlRequired'))
      return
    }
    setIsValidating(true)
    setError(null)
    const result = await validateCommunityConfig(serverUrl.trim())
    if (!result.valid) {
      log.warn('[SetupScreen]', 'MDB backend validation failed', { error: result.error })
      setError(t('mdbSetup.backendConnectionFailed'))
      setIsValidating(false)
      return
    }
    try {
      clearConfig()
      saveCommunityConfig({ version: 1, serverUrl: serverUrl.trim() })
      setIsValidating(false)
      onConfigured()
    } catch (setupError) {
      log.error('[SetupScreen]', 'MDB backend configuration could not be saved', {
        error: setupError,
      })
      setError(t('mdbSetup.backendConfigSaveFailed'))
      setIsValidating(false)
    }
  }

  const mdbInstallerRequest = () => ({
    publicUrl: mdbPublicUrl,
    ftpUrl: mdbFtpUrl,
    ftpSecurity: mdbFtpSecurity,
    ftpRemotePath: mdbFtpPath,
    ftpUsername: mdbFtpUser,
    ftpPassword: mdbFtpPassword,
    databaseHost: mdbDatabaseHost,
    databasePort: Number(mdbDatabasePort),
    databaseName: mdbDatabaseName,
    databaseUser: mdbDatabaseUser,
    databasePassword: mdbDatabasePassword,
    sessionSecret: mdbGenerateSecrets ? undefined : mdbSessionSecret,
    bootstrapToken: mdbGenerateSecrets ? undefined : mdbBootstrapToken,
    maintenanceToken: mdbGenerateSecrets ? undefined : mdbMaintenanceToken,
    documentRootConfirmed: mdbDocumentRootConfirmed,
  })

  const handleMdbInspect = async () => {
    if (!window.electronAPI?.inspectMdbDatabase) {
      setError(t('mdbSetup.databaseInspectionUnavailable'))
      return
    }
    setIsValidating(true)
    setError(null)
    setMdbInspection(null)
    setMdbDatabaseAction(null)
    const result = await window.electronAPI.inspectMdbDatabase(mdbInstallerRequest())
    setIsValidating(false)
    if (!result.success || !result.database) {
      log.error('[SetupScreen]', 'MDB database inspection failed', { error: result.error })
      setError(t('mdbSetup.databaseInspectionFailed'))
      return
    }
    setMdbInspection(result.database)
    if (result.database.state === 'empty') setMdbDatabaseAction('install')
  }

  const handleMdbProvision = async () => {
    if (!window.electronAPI?.provisionMdb) {
      setError(t('mdbSetup.installerUnavailable'))
      return
    }
    if (!mdbInspection || !mdbDatabaseAction) {
      setError(t('mdbSetup.inspectBeforeContinue'))
      return
    }
    setIsValidating(true)
    setError(null)
    const result = await window.electronAPI.provisionMdb({
      ...mdbInstallerRequest(),
      databaseAction: mdbDatabaseAction,
      resetConfirmation: mdbDatabaseAction === 'reset' ? mdbResetConfirmation : undefined,
      bootstrap: {
        organizationName: mdbCompanyName,
        organizationSlug: mdbCompanySlug,
        email: mdbOwnerEmail,
        displayName: mdbOwnerName,
        password: mdbOwnerPassword,
        vaultName: mdbVaultName,
        networkRoot: mdbNetworkRoot,
      },
    })
    setIsValidating(false)
    if (!result.success || !result.serverUrl) {
      log.error('[SetupScreen]', 'MDB provisioning failed', { error: result.error })
      setError(t('mdbSetup.installationFailed'))
      return
    }
    clearConfig()
    saveCommunityConfig({
      version: 1,
      serverUrl: result.serverUrl,
      accessToken: result.accessToken,
    })
    setMdbFtpPassword('')
    setMdbDatabasePassword('')
    setMdbOwnerPassword('')
    setMdbSessionSecret('')
    setMdbBootstrapToken('')
    setMdbMaintenanceToken('')
    setMdbProvisioned({
      serverUrl: result.serverUrl,
      migrated: result.migrated === true,
      generatedSecrets: result.generatedSecrets,
    })
  }

  const handleMdbFtpTest = async () => {
    if (!window.electronAPI?.testMdbFtp) {
      setError(t('mdbSetup.ftpTestUnavailable'))
      return
    }
    setIsTestingMdbFtp(true)
    setMdbFtpTestResult(null)
    setError(null)
    const result = await window.electronAPI.testMdbFtp({
      ftpUrl: mdbFtpUrl,
      ftpSecurity: mdbFtpSecurity,
      ftpRemotePath: mdbFtpPath,
      ftpUsername: mdbFtpUser,
      ftpPassword: mdbFtpPassword,
    })
    setIsTestingMdbFtp(false)
    if (!result.success) {
      log.error('[SetupScreen]', 'FTPS connection test failed', { error: result.error })
      setError(t('mdbSetup.ftpTestFailed'))
      return
    }
    setMdbFtpTestResult('success')
  }

  const mdbNeedsBootstrap =
    mdbDatabaseAction === 'install' ||
    mdbDatabaseAction === 'reset' ||
    (mdbDatabaseAction === 'migrate' && mdbInspection?.bootstrapped === false)
  const mdbBootstrapValid =
    !mdbNeedsBootstrap ||
    (mdbCompanyName.trim() !== '' &&
      /^[a-z0-9-]{2,100}$/.test(mdbCompanySlug) &&
      mdbOwnerName.trim() !== '' &&
      mdbOwnerEmail.includes('@') &&
      mdbOwnerPassword.length >= 12)
  const mdbCommitEnabled =
    Boolean(mdbDatabaseAction) &&
    mdbBootstrapValid &&
    (mdbDatabaseAction !== 'reset' || mdbResetConfirmation === 'DELETE ALL DATABASE DATA')

  // Selection mode - choose admin or member
  if (mode === 'select') {
    return (
      <div className="h-full flex flex-col bg-plm-bg">
        <SetupTitleBar />
        <div className="flex-1 flex items-center justify-center p-8 relative">
          {/* Language selector in corner */}
          <div className="absolute top-4 right-4">
            <LanguageSelector compact dropdownPosition="bottom-right" />
          </div>

          <div className="max-w-xl w-full">
            {/* Logo and Title */}
            <div className="text-center mb-8">
              <svg
                width="80"
                height="80"
                viewBox="0 0 512 512"
                fill="none"
                className="mx-auto mb-4"
              >
                {/* Gradient matching app icon */}
                <defs>
                  <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0a1929" />
                    <stop offset="100%" stopColor="#0d2137" />
                  </linearGradient>
                  <linearGradient id="iconGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#00b4d8" />
                    <stop offset="100%" stopColor="#0096c7" />
                  </linearGradient>
                </defs>
                {/* Rounded square background */}
                <rect x="0" y="0" width="512" height="512" rx="100" fill="url(#bgGradient)" />
                {/* Top layer - filled */}
                <path d="M256 96L96 176L256 256L416 176L256 96Z" fill="url(#iconGradient)" />
                {/* Middle layer - stroked */}
                <path
                  d="M96 256L256 336L416 256"
                  stroke="url(#iconGradient)"
                  strokeWidth="24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                {/* Bottom layer - stroked */}
                <path
                  d="M96 336L256 416L416 336"
                  stroke="url(#iconGradient)"
                  strokeWidth="24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
              <h1 className="text-3xl font-bold text-plm-fg mb-2">{t('setup.welcome')}</h1>
              <p className="text-plm-fg-muted">{t('setup.backendChooser')}</p>
            </div>

            {/* Setup Options */}
            <div className="space-y-4">
              <button
                onClick={() => setMode('mariadb')}
                className="w-full p-6 bg-plm-bg-light border border-plm-accent/50 rounded-xl hover:border-plm-accent transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-plm-accent/20 flex items-center justify-center flex-shrink-0">
                    <Server size={24} className="text-plm-accent" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-plm-fg text-lg">
                        {t('mdbSetup.backendTitle')}
                      </h3>
                      <ChevronRight
                        size={20}
                        className="text-plm-fg-muted group-hover:text-plm-accent transition-colors"
                      />
                    </div>
                    <p className="text-sm text-plm-fg-muted mt-1">{t('setup.mdbDescription')}</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMode('admin')}
                className="w-full p-6 bg-plm-bg-light border border-plm-border rounded-xl hover:border-plm-accent transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-plm-accent/20 flex items-center justify-center flex-shrink-0">
                    <Key size={24} className="text-plm-accent" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-plm-fg text-lg">
                        {t('mdbSetup.supabaseAdmin')}
                      </h3>
                      <ChevronRight
                        size={20}
                        className="text-plm-fg-muted group-hover:text-plm-accent transition-colors"
                      />
                    </div>
                    <p className="text-sm text-plm-fg-muted mt-1">{t('setup.imAdminDesc')}</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMode('member')}
                className="w-full p-6 bg-plm-bg-light border border-plm-border rounded-xl hover:border-plm-accent transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Users size={24} className="text-green-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-plm-fg text-lg">
                        {t('mdbSetup.supabaseMember')}
                      </h3>
                      <ChevronRight
                        size={20}
                        className="text-plm-fg-muted group-hover:text-plm-accent transition-colors"
                      />
                    </div>
                    <p className="text-sm text-plm-fg-muted mt-1">{t('setup.haveCodeDesc')}</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Help Link */}
            <div className="mt-8 text-center">
              <a
                href="https://docs.blueplm.io/admin-setup.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-plm-fg-muted hover:text-plm-accent transition-colors"
              >
                {t('setup.needHelp')}
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Admin setup mode
  if (mode === 'admin') {
    // Show success screen with code
    if (generatedCode) {
      return (
        <div className="h-full flex flex-col bg-plm-bg">
          <SetupTitleBar />
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-xl w-full">
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check size={32} className="text-green-500" />
                </div>
                <h1 className="text-2xl font-bold text-plm-fg mb-2">
                  {t('setup.connectedSuccess')}
                </h1>
                <p className="text-plm-fg-muted">{t('setup.shareCode')}</p>
              </div>

              {/* Organization Code */}
              <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 mb-6">
                <label className="block text-xs text-plm-fg-muted uppercase tracking-wide mb-2">
                  {t('setup.organizationCode')}
                </label>
                <div className="relative">
                  <div className="font-mono text-sm bg-plm-bg border border-plm-border rounded-lg p-4 pr-12 break-all text-plm-fg">
                    {generatedCode}
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="absolute top-1/2 right-3 -translate-y-1/2 p-2 hover:bg-plm-highlight rounded transition-colors"
                    title="Copy to clipboard"
                  >
                    {codeCopied ? (
                      <Check size={18} className="text-green-500" />
                    ) : (
                      <Copy size={18} className="text-plm-fg-muted" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-plm-fg-muted mt-3">{t('setup.keepCodeSecure')}</p>
              </div>

              <button
                onClick={handleFinishAdminSetup}
                className="w-full btn btn-primary btn-lg justify-center"
              >
                {t('setup.continueToBluePLM')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Admin credential entry form
    return (
      <div className="h-full flex flex-col bg-plm-bg">
        <SetupTitleBar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-xl w-full">
            <button
              onClick={() => setMode('select')}
              className="mb-6 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
            >
              ← {t('common.back')}
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-plm-accent/20 flex items-center justify-center">
                <Key size={32} className="text-plm-accent" />
              </div>
              <h1 className="text-2xl font-bold text-plm-fg mb-2">{t('setup.adminSetup')}</h1>
              <p className="text-plm-fg-muted">{t('setup.enterCredentials')}</p>
            </div>

            <div className="space-y-4">
              {/* Supabase Project ID */}
              <div>
                <label className="block text-sm text-plm-fg-muted mb-1.5">
                  {t('setup.projectId')}
                </label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="vvyhpdzqdizvorrhjhvq"
                  className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-4 py-3 text-plm-fg placeholder-plm-fg-dim focus:border-plm-accent focus:outline-none font-mono"
                />
                <p className="text-xs text-plm-fg-dim mt-1">{t('setup.projectIdHelp')}</p>
              </div>

              {/* Anon Key */}
              <div>
                <label className="block text-sm text-plm-fg-muted mb-1.5">
                  {t('setup.anonKey')}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-4 py-3 pr-12 text-plm-fg placeholder-plm-fg-dim focus:border-plm-accent focus:outline-none font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-plm-fg-muted hover:text-plm-fg"
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Organization Slug (optional) */}
              <div>
                <label className="block text-sm text-plm-fg-muted mb-1.5">
                  {t('setup.orgSlug')}{' '}
                  <span className="text-plm-fg-dim">({t('common.optional')})</span>
                </label>
                <input
                  type="text"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  placeholder="e.g., bluerobotics"
                  className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-4 py-3 text-plm-fg placeholder-plm-fg-dim focus:border-plm-accent focus:outline-none"
                />
                <p className="text-xs text-plm-fg-dim mt-1">{t('setup.orgSlugHelp')}</p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-red-400">{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleAdminSetup}
                disabled={isValidating || !projectId || !anonKey}
                className="w-full btn btn-primary btn-lg justify-center mt-6"
              >
                {isValidating ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    {t('common.connecting')}
                  </>
                ) : (
                  <>{t('setup.connectToSupabase')}</>
                )}
              </button>
            </div>

            {/* Help Text */}
            <p className="text-xs text-plm-fg-dim text-center mt-6">{t('setup.findInDashboard')}</p>
          </div>
        </div>
      </div>
    )
  }

  // Member setup mode
  if (mode === 'member') {
    return (
      <div className="h-full flex flex-col bg-plm-bg">
        <SetupTitleBar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-xl w-full">
            <button
              onClick={() => setMode('select')}
              className="mb-6 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
            >
              ← {t('common.back')}
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-500/20 flex items-center justify-center">
                <Users size={32} className="text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-plm-fg mb-2">{t('setup.joinOrg')}</h1>
              <p className="text-plm-fg-muted">{t('setup.enterCode')}</p>
            </div>

            <div className="space-y-4">
              {/* Organization Code Input */}
              <div>
                <label className="block text-sm text-plm-fg-muted mb-1.5">
                  {t('setup.organizationCode')}
                </label>
                <textarea
                  value={orgCode}
                  onChange={(e) => setOrgCode(e.target.value)}
                  placeholder="PDM-XXXX-XXXX-XXXX..."
                  rows={4}
                  className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-4 py-3 text-plm-fg placeholder-plm-fg-dim focus:border-plm-accent focus:outline-none font-mono text-sm resize-none"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-red-400">{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleMemberSetup}
                disabled={isValidating || !orgCode}
                className="w-full btn btn-primary btn-lg justify-center mt-6"
              >
                {isValidating ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    {t('common.connecting')}
                  </>
                ) : (
                  <>{t('common.connect')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'mariadb') {
    return (
      <div className="h-full flex flex-col bg-plm-bg">
        <SetupTitleBar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-xl w-full">
            <button
              onClick={() => setMode('select')}
              className="mb-6 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
            >
              ← {t('common.back')}
            </button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-plm-accent/20 flex items-center justify-center">
                <Server size={32} className="text-plm-accent" />
              </div>
              <h1 className="text-2xl font-bold text-plm-fg mb-2">{t('mdbSetup.title')}</h1>
              <p className="text-plm-fg-muted">{t('mdbSetup.chooseConnection')}</p>
            </div>
            <div className="space-y-4">
              <button
                onClick={() => {
                  setError(null)
                  setMode('mariadb-existing')
                }}
                className="w-full p-5 bg-plm-bg-light border border-plm-border rounded-xl hover:border-plm-accent text-left"
              >
                <h2 className="font-semibold text-plm-fg">{t('mdbSetup.existing')}</h2>
                <p className="text-sm text-plm-fg-muted mt-1">{t('mdbSetup.existingHelp')}</p>
              </button>
              <button
                onClick={() => {
                  setError(null)
                  setMode('mariadb-install')
                }}
                className="w-full p-5 bg-plm-bg-light border border-plm-accent/50 rounded-xl hover:border-plm-accent text-left"
              >
                <h2 className="font-semibold text-plm-fg">{t('mdbSetup.install')}</h2>
                <p className="text-sm text-plm-fg-muted mt-1">{t('mdbSetup.installHelp')}</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'mariadb-existing') {
    return (
      <div className="h-full flex flex-col bg-plm-bg">
        <SetupTitleBar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-xl w-full">
            <button
              onClick={() => setMode('mariadb')}
              className="mb-6 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
            >
              ← {t('common.back')}
            </button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-plm-accent/20 flex items-center justify-center">
                <Server size={32} className="text-plm-accent" />
              </div>
              <h1 className="text-2xl font-bold text-plm-fg mb-2">{t('mdbSetup.existing')}</h1>
              <p className="text-plm-fg-muted">{t('mdbSetup.existingHelp')}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-plm-fg-muted mb-1.5">
                  {t('mdbSetup.backendUrl')}
                </label>
                <input
                  type="url"
                  value={mariadbServerUrl}
                  onChange={(event) => setMariadbServerUrl(event.target.value)}
                  placeholder={t('mdbSetup.backendUrlPlaceholder')}
                  className="w-full bg-plm-bg-light border border-plm-border rounded-lg px-4 py-3 text-plm-fg placeholder-plm-fg-dim focus:border-plm-accent focus:outline-none"
                />
              </div>
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-red-400">{error}</span>
                </div>
              )}
              <button
                onClick={() => void handleMariadbSetup()}
                disabled={isValidating || !mariadbServerUrl}
                className="w-full btn btn-primary btn-lg justify-center mt-6"
              >
                {isValidating ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    {t('common.connecting')}
                  </>
                ) : (
                  <>{t('mdbSetup.connect')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'mariadb-install') {
    if (mdbProvisioned) {
      return (
        <div className="h-full flex flex-col bg-plm-bg">
          <SetupTitleBar />
          <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
            <div className="max-w-xl w-full space-y-5">
              <div className="text-center">
                <Check size={40} className="mx-auto text-green-500 mb-3" />
                <h1 className="text-2xl font-bold text-plm-fg">
                  {mdbProvisioned.migrated
                    ? t('mdbSetup.migrationComplete')
                    : t('mdbSetup.installationComplete')}
                </h1>
                <p className="text-plm-fg-muted">
                  {mdbProvisioned.migrated
                    ? t('mdbSetup.migrationCompleteHelp')
                    : t('mdbSetup.installationCompleteHelp')}
                </p>
              </div>
              {mdbProvisioned.generatedSecrets && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                  <strong className="text-amber-300">{t('mdbSetup.storeSecrets')}</strong>
                  <p className="text-sm text-plm-fg-muted mt-1">{t('mdbSetup.generatedHelp')}</p>
                  <code className="block break-all mt-3 text-xs">
                    BLUEPLM_SESSION_SECRET={mdbProvisioned.generatedSecrets.sessionSecret}{' '}
                    <span className="text-plm-fg-muted"># {t('mdbSetup.sessionComment')}</span>
                    <br />
                    BLUEPLM_BOOTSTRAP_TOKEN={mdbProvisioned.generatedSecrets.bootstrapToken}{' '}
                    <span className="text-plm-fg-muted"># {t('mdbSetup.bootstrapComment')}</span>
                    <br />
                    BLUEPLM_MAINTENANCE_TOKEN={
                      mdbProvisioned.generatedSecrets.maintenanceToken
                    }{' '}
                    <span className="text-plm-fg-muted"># {t('mdbSetup.maintenanceComment')}</span>
                  </code>
                </div>
              )}
              <button
                onClick={onConfigured}
                className="w-full btn btn-primary btn-lg justify-center"
              >
                {mdbProvisioned.migrated
                  ? t('mdbSetup.continueToLogin')
                  : t('mdbSetup.openBluePlm')}
              </button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="h-full flex flex-col bg-plm-bg">
        <SetupTitleBar />
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => setMode('mariadb')}
              className="mb-6 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
            >
              ← {t('common.back')}
            </button>
            <h1 className="text-2xl font-bold text-plm-fg mb-2">{t('mdbSetup.newServer')}</h1>
            <p className="text-plm-fg-muted mb-6">{t('mdbSetup.installHelp')}</p>
            <div className="space-y-5">
              <section className="bg-plm-bg-light border border-plm-border rounded-xl p-5">
                <h2 className="font-semibold text-plm-fg">{t('mdbSetup.hostingPreparation')}</h2>
                <p className="text-sm text-plm-fg-muted mt-2">{t('mdbSetup.hostingHelp')}</p>
                <label className="flex gap-2 items-start mt-4 text-sm text-plm-fg">
                  <input
                    type="checkbox"
                    checked={mdbDocumentRootConfirmed}
                    onChange={(event) => setMdbDocumentRootConfirmed(event.target.checked)}
                  />
                  {t('mdbSetup.documentRootConfirmed')}
                </label>
              </section>
              <section className="bg-plm-bg-light border border-plm-border rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <h2 className="font-semibold text-plm-fg md:col-span-2">
                  {t('mdbSetup.addressFtp')}
                </h2>
                <label>
                  {t('mdbSetup.publicHttps')}
                  <input
                    type="url"
                    value={mdbPublicUrl}
                    onChange={(event) => setMdbPublicUrl(event.target.value)}
                    placeholder={t('mdbSetup.publicUrlPlaceholder')}
                    className="w-full"
                  />
                </label>
                <label>
                  {t('mdbSetup.ftpSecurity')}
                  <select
                    value={mdbFtpSecurity}
                    onChange={(event) => {
                      const next = event.target.value as 'explicit' | 'implicit'
                      setMdbFtpSecurity(next)
                      setMdbFtpUrl((current) => {
                        try {
                          const url = new URL(current)
                          url.port = next === 'implicit' ? '990' : '21'
                          return url.toString().replace(/\/$/, '')
                        } catch {
                          return current
                        }
                      })
                      setMdbFtpTestResult(null)
                    }}
                    className="w-full"
                  >
                    <option value="explicit">{t('mdbSetup.ftpSecurityExplicit')}</option>
                    <option value="implicit">{t('mdbSetup.ftpSecurityImplicit')}</option>
                  </select>
                  <span className="block mt-1 text-xs text-plm-fg-muted">
                    {t(
                      mdbFtpSecurity === 'implicit'
                        ? 'mdbSetup.ftpSecurityImplicitHelp'
                        : 'mdbSetup.ftpSecurityExplicitHelp',
                    )}
                  </span>
                </label>
                <label>
                  {t('mdbSetup.ftpServer')}
                  <input
                    value={mdbFtpUrl}
                    onChange={(event) => {
                      setMdbFtpUrl(event.target.value)
                      setMdbFtpTestResult(null)
                    }}
                    placeholder={t(
                      mdbFtpSecurity === 'implicit'
                        ? 'mdbSetup.ftpImplicitPlaceholder'
                        : 'mdbSetup.ftpExplicitPlaceholder',
                    )}
                    className="w-full"
                  />
                </label>
                <label>
                  {t('mdbSetup.ftpTarget')}
                  <input
                    value={mdbFtpPath}
                    onChange={(event) => {
                      setMdbFtpPath(event.target.value)
                      setMdbFtpTestResult(null)
                    }}
                    placeholder={t('mdbSetup.ftpTargetPlaceholder')}
                    className="w-full"
                  />
                </label>
                <label>
                  {t('mdbSetup.ftpUser')}
                  <input
                    value={mdbFtpUser}
                    onChange={(event) => {
                      setMdbFtpUser(event.target.value)
                      setMdbFtpTestResult(null)
                    }}
                    className="w-full"
                  />
                </label>
                <label className="md:col-span-2">
                  {t('mdbSetup.ftpPassword')}
                  <input
                    type="password"
                    value={mdbFtpPassword}
                    onChange={(event) => {
                      setMdbFtpPassword(event.target.value)
                      setMdbFtpTestResult(null)
                    }}
                    autoComplete="new-password"
                    className="w-full"
                  />
                </label>
                <div className="md:col-span-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleMdbFtpTest()}
                    disabled={isTestingMdbFtp || !mdbFtpUrl || !mdbFtpUser || !mdbFtpPassword}
                    className="btn btn-secondary"
                  >
                    {isTestingMdbFtp ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        {t('mdbSetup.testingFtp')}
                      </>
                    ) : (
                      t('mdbSetup.testFtp')
                    )}
                  </button>
                  {mdbFtpTestResult && (
                    <span className="text-sm text-green-400">{t('mdbSetup.ftpTestPassed')}</span>
                  )}
                </div>
              </section>
              <section className="bg-plm-bg-light border border-plm-border rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <h2 className="font-semibold text-plm-fg md:col-span-2">
                  {t('mdbSetup.databaseConnection')}
                </h2>
                <label>
                  {t('mdbSetup.databaseHost')}
                  <input
                    value={mdbDatabaseHost}
                    onChange={(event) => setMdbDatabaseHost(event.target.value)}
                    className="w-full"
                  />
                </label>
                <label>
                  {t('mdbSetup.port')}
                  <input
                    inputMode="numeric"
                    value={mdbDatabasePort}
                    onChange={(event) => setMdbDatabasePort(event.target.value)}
                    className="w-full"
                  />
                </label>
                <label>
                  {t('mdbSetup.databaseName')}
                  <input
                    value={mdbDatabaseName}
                    onChange={(event) => setMdbDatabaseName(event.target.value)}
                    className="w-full"
                  />
                </label>
                <label>
                  {t('mdbSetup.databaseUser')}
                  <input
                    value={mdbDatabaseUser}
                    onChange={(event) => setMdbDatabaseUser(event.target.value)}
                    className="w-full"
                  />
                </label>
                <label className="md:col-span-2">
                  {t('mdbSetup.databasePassword')}
                  <input
                    type="password"
                    value={mdbDatabasePassword}
                    onChange={(event) => setMdbDatabasePassword(event.target.value)}
                    autoComplete="new-password"
                    className="w-full"
                  />
                </label>
              </section>
              {mdbInspection && (
                <section className="bg-plm-bg-light border border-plm-border rounded-xl p-5 space-y-4">
                  <div>
                    <h2 className="font-semibold text-plm-fg">{t('mdbSetup.databaseDetected')}</h2>
                    <p className="text-sm text-plm-fg-muted mt-1">
                      {mdbInspection.state === 'empty'
                        ? t('mdbSetup.databaseEmpty')
                        : mdbInspection.state === 'managed'
                          ? t('mdbSetup.databaseManaged')
                          : mdbInspection.state === 'legacy'
                            ? t('mdbSetup.databaseLegacy')
                            : t('mdbSetup.databaseForeign')}
                    </p>
                    <p className="text-xs text-plm-fg-muted mt-2">
                      {t('mdbSetup.databaseSummary')
                        .replace('{tables}', String(mdbInspection.tableCount))
                        .replace('{pending}', String(mdbInspection.pendingMigrations))}
                    </p>
                  </div>
                  {mdbInspection.state === 'managed' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setMdbDatabaseAction('migrate')
                          setMdbResetConfirmation('')
                        }}
                        className={`btn ${mdbDatabaseAction === 'migrate' ? 'btn-primary' : 'btn-secondary'} justify-center`}
                      >
                        {t('mdbSetup.migrateExisting')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMdbDatabaseAction('reset')}
                        className={`btn ${mdbDatabaseAction === 'reset' ? 'bg-red-600 text-white' : 'btn-secondary'} justify-center`}
                      >
                        {t('mdbSetup.eraseAndReinstall')}
                      </button>
                    </div>
                  )}
                  {(mdbInspection.state === 'legacy' || mdbInspection.state === 'foreign') && (
                    <button
                      type="button"
                      onClick={() => setMdbDatabaseAction('reset')}
                      className={`w-full btn ${mdbDatabaseAction === 'reset' ? 'bg-red-600 text-white' : 'btn-secondary'} justify-center`}
                    >
                      {t('mdbSetup.eraseAndReinstall')}
                    </button>
                  )}
                </section>
              )}
              {mdbNeedsBootstrap && (
                <section className="bg-plm-bg-light border border-plm-border rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <h2 className="font-semibold text-plm-fg">{t('mdbSetup.initialOwner')}</h2>
                    <p className="text-sm text-plm-fg-muted mt-1">
                      {t('mdbSetup.initialOwnerHelp')}
                    </p>
                  </div>
                  <label>
                    {t('mdbSetup.companyName')}
                    <input
                      value={mdbCompanyName}
                      onChange={(event) => setMdbCompanyName(event.target.value)}
                      className="w-full"
                    />
                  </label>
                  <label>
                    {t('mdbSetup.companySlug')}
                    <input
                      value={mdbCompanySlug}
                      onChange={(event) => setMdbCompanySlug(event.target.value.toLowerCase())}
                      placeholder={t('mdbSetup.companySlugPlaceholder')}
                      className="w-full"
                    />
                  </label>
                  <label>
                    {t('mdbSetup.ownerName')}
                    <input
                      value={mdbOwnerName}
                      onChange={(event) => setMdbOwnerName(event.target.value)}
                      className="w-full"
                    />
                  </label>
                  <label>
                    {t('mdbSetup.ownerEmail')}
                    <input
                      type="email"
                      value={mdbOwnerEmail}
                      onChange={(event) => setMdbOwnerEmail(event.target.value)}
                      className="w-full"
                    />
                  </label>
                  <label className="md:col-span-2">
                    {t('mdbSetup.ownerPassword')}
                    <input
                      type="password"
                      value={mdbOwnerPassword}
                      onChange={(event) => setMdbOwnerPassword(event.target.value)}
                      minLength={12}
                      autoComplete="new-password"
                      className="w-full"
                    />
                  </label>
                  <label>
                    {t('mdbSetup.vaultName')}
                    <input
                      value={mdbVaultName}
                      onChange={(event) => setMdbVaultName(event.target.value)}
                      className="w-full"
                    />
                  </label>
                  <label>
                    {t('mdbSetup.networkVaultPath')}
                    <div className="flex gap-2">
                      <input
                        value={mdbNetworkRoot}
                        onChange={(event) => setMdbNetworkRoot(event.target.value)}
                        placeholder={t('mdbSetup.networkRootPlaceholder')}
                        maxLength={1024}
                        className="min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => void handleMdbNetworkRootBrowse()}
                        className="btn btn-secondary whitespace-nowrap"
                      >
                        {t('mdbSetup.browseFolders')}
                      </button>
                    </div>
                  </label>
                </section>
              )}
              {mdbDatabaseAction === 'reset' && (
                <section className="bg-red-500/10 border border-red-500/40 rounded-xl p-5">
                  <h2 className="font-semibold text-red-300">
                    {t('mdbSetup.confirmDatabaseErase')}
                  </h2>
                  <p className="text-sm text-red-200/80 mt-2">
                    {t('mdbSetup.confirmDatabaseEraseHelp')}
                  </p>
                  <input
                    value={mdbResetConfirmation}
                    onChange={(event) => setMdbResetConfirmation(event.target.value)}
                    placeholder={t('mdbSetup.databaseErasePlaceholder')}
                    className="w-full mt-3"
                  />
                </section>
              )}
              <section className="bg-plm-bg-light border border-plm-border rounded-xl p-5">
                <h2 className="font-semibold text-plm-fg">{t('mdbSetup.firstSecrets')}</h2>
                <label className="flex gap-2 items-center mt-2 text-sm text-plm-fg">
                  <input
                    type="checkbox"
                    checked={mdbGenerateSecrets}
                    onChange={(event) => setMdbGenerateSecrets(event.target.checked)}
                  />
                  {t('mdbSetup.generateSecrets')}
                </label>
                <p className="text-xs text-plm-fg-muted mt-2">{t('mdbSetup.secretsHelp')}</p>
                {!mdbGenerateSecrets && (
                  <div className="grid grid-cols-1 gap-3 mt-4">
                    <label>
                      {t('mdbSetup.sessionSecret')}
                      <input
                        type="password"
                        value={mdbSessionSecret}
                        onChange={(event) => setMdbSessionSecret(event.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                    <label>
                      {t('mdbSetup.bootstrapToken')}
                      <input
                        type="password"
                        value={mdbBootstrapToken}
                        onChange={(event) => setMdbBootstrapToken(event.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                    <label>
                      {t('mdbSetup.maintenanceToken')}
                      <input
                        type="password"
                        value={mdbMaintenanceToken}
                        onChange={(event) => setMdbMaintenanceToken(event.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                  </div>
                )}
              </section>
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-red-400">{error}</span>
                </div>
              )}
              {!mdbInspection ? (
                <button
                  onClick={() => void handleMdbInspect()}
                  disabled={isValidating}
                  className="w-full btn btn-primary btn-lg justify-center"
                >
                  {isValidating ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      {t('mdbSetup.inspectingDatabase')}
                    </>
                  ) : (
                    <>{t('mdbSetup.inspectDatabase')}</>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => void handleMdbProvision()}
                  disabled={isValidating || !mdbCommitEnabled}
                  className="w-full btn btn-primary btn-lg justify-center"
                >
                  {isValidating ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      {t('mdbSetup.deploying')}
                    </>
                  ) : (
                    <>
                      {mdbDatabaseAction === 'migrate'
                        ? t('mdbSetup.runMigration')
                        : mdbDatabaseAction === 'reset'
                          ? t('mdbSetup.eraseAndInstall')
                          : t('mdbSetup.deploy')}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
