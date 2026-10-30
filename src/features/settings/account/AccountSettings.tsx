import { useState, useEffect } from 'react'
import {
  Mail,
  LogOut,
  Monitor,
  Laptop,
  Loader2,
  RefreshCw,
  Download,
  CheckCircle,
  Plus,
  X,
  FileText,
  ToggleLeft,
  ToggleRight,
  Moon,
  Sun,
  Waves,
  Globe,
  ChevronDown,
  Snowflake,
  Ghost,
  CloudSun,
  Crown,
} from 'lucide-react'
import { log } from '@/lib/logger'
import { usePDMStore, ThemeMode, Language } from '@/stores/pdmStore'
import { useShallow } from 'zustand/react/shallow'
import { getSupabaseClient, endRemoteSession } from '@/lib/supabase'
import { getBackend } from '@/lib/backend'
import { getInitials, getEffectiveAvatarUrl } from '@/lib/utils'
import { getMachineId } from '@/lib/backup'
import { useTranslation } from '@/lib/i18n'
import { ContributionHistory } from '../system/ContributionHistory'

interface UserSession {
  id: string
  machine_id: string
  machine_name: string | null
  os_version: string | null
  app_version: string | null
  platform: string | null
  last_active_at: string | null
  last_seen_at: string | null
  is_active: boolean | null
  created_at: string | null
}

// Only show languages that have actual translations (not English fallback)
const languageOptions: { value: Language; label: string; nativeLabel: string }[] = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'fr', label: 'French', nativeLabel: 'Français' },
  { value: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { value: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { value: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { value: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { value: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文' },
  { value: 'sindarin', label: 'Sindarin (Elvish)', nativeLabel: '🧝 Tengwar' },
]

export function AccountSettings() {
  const { t } = useTranslation()
  const {
    user,
    setUser,
    setOrganization,
    activeVaultId,
    lowercaseExtensions,
    setLowercaseExtensions,
    ignorePatterns,
    addIgnorePattern,
    removeIgnorePattern,
    theme,
    setTheme,
    language,
    setLanguage,
  } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      setUser: s.setUser,
      setOrganization: s.setOrganization,
      activeVaultId: s.activeVaultId,
      lowercaseExtensions: s.lowercaseExtensions,
      setLowercaseExtensions: s.setLowercaseExtensions,
      ignorePatterns: s.ignorePatterns,
      addIgnorePattern: s.addIgnorePattern,
      removeIgnorePattern: s.removeIgnorePattern,
      theme: s.theme,
      setTheme: s.setTheme,
      language: s.language,
      setLanguage: s.setLanguage,
    })),
  )

  const [sessions, setSessions] = useState<UserSession[]>([])
  const [currentMachineId, setCurrentMachineId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [signingOutSessionId, setSigningOutSessionId] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateCheckResult, setUpdateCheckResult] = useState<'none' | 'available' | 'error' | null>(
    null,
  )
  const [newIgnorePattern, setNewIgnorePattern] = useState('')
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false)

  // Theme options with translations
  const themeOptions: {
    value: ThemeMode
    label: string
    icon: React.ReactNode
    description: string
  }[] = [
    {
      value: 'dark',
      label: t('preferences.themeDark'),
      icon: <Moon size={18} />,
      description: t('preferences.themeDarkDesc'),
    },
    {
      value: 'deep-blue',
      label: t('preferences.themeDeepBlue'),
      icon: <Waves size={18} />,
      description: t('preferences.themeDeepBlueDesc'),
    },
    {
      value: 'kenneth',
      label: t('preferences.themeKenneth'),
      icon: <Crown size={18} />,
      description: t('preferences.themeKennethDesc'),
    },
    {
      value: 'light',
      label: t('preferences.themeLight'),
      icon: <Sun size={18} />,
      description: t('preferences.themeLightDesc'),
    },
    {
      value: 'weather',
      label: t('preferences.themeWeather'),
      icon: <CloudSun size={18} />,
      description: t('preferences.themeWeatherDesc'),
    },
    {
      value: 'christmas',
      label: t('preferences.themeChristmas'),
      icon: <Snowflake size={18} />,
      description: t('preferences.themeChristmasDesc'),
    },
    {
      value: 'halloween',
      label: t('preferences.themeHalloween'),
      icon: <Ghost size={18} />,
      description: t('preferences.themeHalloweenDesc'),
    },
    {
      value: 'system',
      label: t('preferences.themeSystem'),
      icon: <Monitor size={18} />,
      description: t('preferences.themeSystemDesc'),
    },
  ]

  // Get app version on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getVersion().then(setAppVersion)
    }
  }, [])

  useEffect(() => {
    if (!user) return

    const loadSessions = async () => {
      setIsLoading(true)
      try {
        // Get current machine ID
        const machineId = await getMachineId()
        setCurrentMachineId(machineId)

        // Fetch all sessions for this user (active within last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const client = getSupabaseClient()

        const { data, error } = await client
          .from('user_session')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .gte('last_seen_at', fiveMinutesAgo)
          .order('last_seen_at', { ascending: false })

        if (!error && data) {
          // Cast to UserSession[] - Supabase types may be out of sync with actual schema
          setSessions(data as unknown as UserSession[])
        }
      } catch (error) {
        log.error('[Account]', 'Error loading sessions', { error: error })
      } finally {
        setIsLoading(false)
      }
    }

    loadSessions()

    // Refresh every 30 seconds
    const interval = setInterval(loadSessions, 30000)
    return () => clearInterval(interval)
  }, [user])

  const handleSignOut = async () => {
    await getBackend().auth.signOut()
    setUser(null)
    setOrganization(null)
  }

  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return 'unknown'
    const date = new Date(lastSeen)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getPlatformIcon = (platform: string | null) => {
    if (platform === 'darwin') return <Laptop size={16} className="text-ui-fg-secondary" />
    return <Monitor size={16} className="text-ui-fg-secondary" />
  }

  const handleRemoteSignOut = async (sessionId: string) => {
    setSigningOutSessionId(sessionId)
    try {
      const { success, error } = await endRemoteSession(sessionId)
      if (success) {
        // Remove the session from state immediately
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      } else {
        log.error('[Account]', 'Failed to sign out session', { error })
      }
    } catch (error) {
      log.error('[Account]', 'Error signing out session', { error: error })
    } finally {
      setSigningOutSessionId(null)
    }
  }

  // Handle manual update check
  const handleCheckForUpdates = async () => {
    if (!window.electronAPI || isCheckingUpdate) return

    setIsCheckingUpdate(true)
    setUpdateCheckResult(null)

    try {
      const result = await window.electronAPI.checkForUpdates()
      if (result.success && result.updateInfo) {
        setUpdateCheckResult('available')
      } else if (result.success) {
        setUpdateCheckResult('none')
      } else {
        setUpdateCheckResult('error')
      }
    } catch (error) {
      log.error('[Account]', 'Update check error', { error: error })
      setUpdateCheckResult('error')
    } finally {
      setIsCheckingUpdate(false)
      setTimeout(() => setUpdateCheckResult(null), 5000)
    }
  }

  const handleAddIgnorePattern = () => {
    if (!newIgnorePattern.trim() || !activeVaultId) return
    addIgnorePattern(activeVaultId, newIgnorePattern.trim())
    setNewIgnorePattern('')
  }

  // Get ignore patterns for current vault
  const currentVaultPatterns = activeVaultId ? ignorePatterns[activeVaultId] || [] : []

  if (!user) {
    return <div className="text-center py-12 text-ui-fg-secondary text-[14px]">Not signed in</div>
  }

  // Sort sessions so current device is first
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.machine_id === currentMachineId) return -1
    if (b.machine_id === currentMachineId) return 1
    return 0
  })

  return (
    <div className="space-y-8">
      {/* User profile card */}
      <section>
        <h2 className="text-[13px] text-ui-fg-secondary uppercase tracking-wide font-medium mb-3">
          Profile
        </h2>
        <div className="flex items-center gap-4 p-4 bg-ui-bg rounded-lg border border-ui-divider">
          {getEffectiveAvatarUrl(user) ? (
            <>
              <img
                src={getEffectiveAvatarUrl(user)!}
                alt={user.full_name || user.email}
                className="w-16 h-16 rounded-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  target.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <div className="w-16 h-16 rounded-full bg-ui-accent flex items-center justify-center text-xl text-white font-semibold hidden">
                {getInitials(user.full_name || user.email)}
              </div>
            </>
          ) : (
            <div className="w-16 h-16 rounded-full bg-ui-accent flex items-center justify-center text-xl text-white font-semibold">
              {getInitials(user.full_name || user.email)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xl font-medium text-ui-fg truncate">
              {user.full_name || 'No name'}
            </div>
            {user.job_title && <div className="text-[14px] text-ui-fg-secondary">{user.job_title}</div>}
            <div className="text-[14px] text-ui-fg-secondary truncate flex items-center gap-1.5">
              <Mail size={16} />
              {user.email}
            </div>
            <div className="text-[13px] text-ui-fg mt-1">
              Role: <span className="capitalize">{user.role}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Contribution History */}
      <ContributionHistory />

      {/* Sessions */}
      <section>
        <h2 className="text-[13px] text-ui-fg-secondary uppercase tracking-wide font-medium mb-3">
          Sessions
        </h2>
        <div className="bg-ui-bg rounded-lg border border-ui-divider overflow-hidden">
          <div className="px-4 py-3 border-b border-ui-divider">
            <p className="text-[13px] text-ui-fg-secondary">Devices where you're currently signed in</p>
          </div>

          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-4 text-ui-fg-secondary">
                <Loader2 size={18} className="animate-spin mr-2" />
                <span className="text-[14px]">Loading sessions...</span>
              </div>
            ) : sortedSessions.length === 0 ? (
              <div className="text-center py-4 text-ui-fg-secondary text-[14px]">No active sessions</div>
            ) : (
              <div className="space-y-2">
                {sortedSessions.map((session) => {
                  const isCurrentDevice = session.machine_id === currentMachineId
                  const isSigningOut = signingOutSessionId === session.id
                  return (
                    <div
                      key={session.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        isCurrentDevice
                          ? 'bg-ui-accent/5 border-ui-accent/30'
                          : 'bg-ui-field border-ui-divider'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isCurrentDevice ? 'bg-ui-accent/20' : 'bg-ui-hover'
                        }`}
                      >
                        {getPlatformIcon(session.platform)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium text-ui-fg truncate flex items-center gap-2">
                          {session.machine_name}
                          {isCurrentDevice && (
                            <span className="text-[12px] px-1.5 py-0.5 rounded bg-ui-accent/20 text-ui-accent font-medium">
                              This device
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] text-ui-fg-secondary flex items-center gap-2">
                          <span className="capitalize">{session.platform || 'Unknown'}</span>
                          {session.app_version && (
                            <>
                              <span className="text-ui-divider">•</span>
                              <span>v{session.app_version}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-[13px] text-ui-fg-secondary flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full bg-ui-success ${isCurrentDevice ? 'animate-pulse' : ''}`}
                          />
                          {formatLastSeen(session.last_seen_at)}
                        </div>
                        <button
                          onClick={() =>
                            isCurrentDevice ? handleSignOut() : handleRemoteSignOut(session.id)
                          }
                          disabled={isSigningOut}
                          className="p-1.5 rounded hover:bg-ui-danger/20 text-ui-fg-secondary hover:text-ui-danger transition-colors disabled:opacity-50"
                          title={isCurrentDevice ? 'Sign out' : 'Sign out this device'}
                        >
                          {isSigningOut ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <LogOut size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Application Updates */}
      <section>
        <h2 className="text-[13px] text-ui-fg-secondary uppercase tracking-wide font-medium mb-3">
          {t('preferences.applicationUpdates')}
        </h2>
        <div className="p-4 bg-ui-bg rounded-lg border border-ui-divider">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[14px] font-medium text-ui-fg">BluePLM {appVersion || '...'}</div>
              <div className="text-[13px] text-ui-fg-secondary mt-0.5">
                {updateCheckResult === 'none' && t('preferences.youHaveLatest')}
                {updateCheckResult === 'available' && t('preferences.updateAvailable')}
                {updateCheckResult === 'error' && t('preferences.couldNotCheck')}
                {updateCheckResult === null &&
                  !isCheckingUpdate &&
                  t('preferences.checkForNewVersions')}
              </div>
            </div>
            <button
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdate}
              className={`flex items-center gap-2 px-4 py-2 text-[14px] font-medium rounded-lg transition-colors ${
                updateCheckResult === 'none'
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                  : updateCheckResult === 'available'
                    ? 'bg-ui-accent/20 text-ui-accent border border-ui-accent/30'
                    : 'bg-ui-hover text-ui-fg-secondary hover:text-ui-fg hover:bg-ui-hover/80'
              }`}
            >
              {isCheckingUpdate ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t('preferences.checking')}
                </>
              ) : updateCheckResult === 'none' ? (
                <>
                  <CheckCircle size={14} />
                  {t('preferences.upToDate')}
                </>
              ) : updateCheckResult === 'available' ? (
                <>
                  <Download size={14} />
                  {t('preferences.available')}
                </>
              ) : (
                <>
                  <RefreshCw size={14} />
                  {t('preferences.checkForUpdates')}
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Theme Selection */}
      <section>
        <h2 className="text-[13px] text-ui-fg-secondary uppercase tracking-wide font-medium mb-3">
          {t('preferences.appearance')}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {themeOptions.map((option) => {
            const isSelected = theme === option.value
            return (
              <button
                key={option.value}
                onClick={() => !isSelected && setTheme(option.value)}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                  isSelected
                    ? 'bg-ui-accent/15 border-ui-accent cursor-default'
                    : 'bg-ui-bg border-ui-divider hover:border-ui-accent/50 hover:bg-ui-hover cursor-pointer'
                }`}
              >
                <div
                  className={`p-2.5 rounded-lg ${
                    isSelected ? 'bg-ui-accent text-white' : 'bg-ui-field text-ui-fg-secondary'
                  }`}
                >
                  {option.icon}
                </div>
                <div className="flex-1">
                  <div
                    className={`text-[14px] font-medium ${isSelected ? 'text-ui-fg' : 'text-ui-fg'}`}
                  >
                    {option.label}
                  </div>
                  <div className="text-[13px] text-ui-fg-secondary">{option.description}</div>
                </div>
                {isSelected && <CheckCircle size={18} className="text-ui-accent flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </section>

      {/* Language Selection */}
      <section>
        <h2 className="text-[13px] text-ui-fg-secondary uppercase tracking-wide font-medium mb-3">
          {t('preferences.language')}
        </h2>
        <div className="p-4 bg-ui-bg rounded-lg border border-ui-divider">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-ui-accent text-white">
                <Globe size={18} />
              </div>
              <div>
                <div className="text-[14px] font-medium text-ui-fg">
                  {t('preferences.displayLanguage')}
                </div>
                <div className="text-[13px] text-ui-fg-secondary mt-0.5">
                  {t('preferences.chooseLanguage')}
                </div>
              </div>
            </div>
            <div className="relative">
              <button
                onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-ui-field border border-ui-divider rounded-lg hover:border-ui-accent/50 transition-colors min-w-[180px]"
              >
                <span className="flex-1 text-left">
                  <span className="text-ui-fg font-medium">
                    {languageOptions.find((l) => l.value === language)?.nativeLabel || 'English'}
                  </span>
                  <span className="text-ui-fg-secondary text-[13px] ml-2">
                    ({languageOptions.find((l) => l.value === language)?.label || 'English'})
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  className={`text-ui-fg-secondary transition-transform ${isLanguageDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isLanguageDropdownOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsLanguageDropdownOpen(false)}
                  />
                  {/* Dropdown */}
                  <div className="absolute right-0 top-full mt-1 z-50 bg-ui-field border border-ui-divider rounded-lg shadow-xl max-h-[320px] overflow-y-auto min-w-[240px]">
                    {languageOptions.map((option) => {
                      const isSelected = language === option.value
                      return (
                        <button
                          key={option.value}
                          onClick={() => {
                            setLanguage(option.value)
                            setIsLanguageDropdownOpen(false)
                          }}
                          className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                            isSelected
                              ? 'bg-ui-accent/15 text-ui-accent'
                              : 'text-ui-fg hover:bg-ui-hover'
                          }`}
                        >
                          <div>
                            <span className="font-medium">{option.nativeLabel}</span>
                            <span className="text-ui-fg-secondary text-[13px] ml-2">({option.label})</span>
                          </div>
                          {isSelected && <CheckCircle size={16} className="flex-shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="text-[12px] text-ui-fg mt-3">{t('preferences.translationsNote')}</p>
        </div>
      </section>

      {/* File Extensions */}
      <section>
        <h2 className="text-[13px] text-ui-fg-secondary uppercase tracking-wide font-medium mb-3">
          {t('preferences.fileExtensions')}
        </h2>
        <div className="p-4 bg-ui-bg rounded-lg border border-ui-divider">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] text-ui-fg">{t('preferences.lowercaseExtensions')}</div>
              <div className="text-[13px] text-ui-fg-secondary mt-0.5">
                {t('preferences.lowercaseExtensionsDesc')}
              </div>
            </div>
            <button
              onClick={() => setLowercaseExtensions(!lowercaseExtensions)}
              className="text-ui-accent"
            >
              {lowercaseExtensions ? (
                <ToggleRight size={28} />
              ) : (
                <ToggleLeft size={28} className="text-ui-fg-secondary" />
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Ignore Patterns */}
      <section>
        <h2 className="text-[13px] text-ui-fg-secondary uppercase tracking-wide font-medium mb-3">
          {t('preferences.ignorePatterns')}
        </h2>
        <div className="p-4 bg-ui-bg rounded-lg border border-ui-divider space-y-3">
          <p className="text-[13px] text-ui-fg-secondary">{t('preferences.ignorePatternsDesc')}</p>

          {/* Add new pattern */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newIgnorePattern}
              onChange={(e) => setNewIgnorePattern(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddIgnorePattern()
              }}
              placeholder={t('preferences.ignorePlaceholder')}
              className="flex-1 bg-ui-field border border-ui-divider rounded-lg px-3 py-2 text-[14px] focus:border-ui-accent focus:outline-none font-mono"
              disabled={!activeVaultId}
            />
            <button
              onClick={handleAddIgnorePattern}
              disabled={!newIgnorePattern.trim() || !activeVaultId}
              className="btn btn-primary btn-sm flex items-center gap-1"
            >
              <Plus size={14} />
              {t('common.add')}
            </button>
          </div>

          {!activeVaultId && (
            <p className="text-[13px] text-ui-warning">{t('preferences.connectVaultForPatterns')}</p>
          )}

          {/* Pattern list */}
          {currentVaultPatterns.length > 0 ? (
            <div className="space-y-1">
              {currentVaultPatterns.map((pattern, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 bg-ui-field rounded-lg group"
                >
                  <FileText size={16} className="text-ui-fg-secondary flex-shrink-0" />
                  <code className="flex-1 text-[14px] font-mono text-ui-fg">{pattern}</code>
                  <button
                    onClick={() => activeVaultId && removeIgnorePattern(activeVaultId, pattern)}
                    className="p-1 text-ui-fg-secondary hover:text-ui-danger rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : activeVaultId ? (
            <p className="text-[13px] text-ui-fg text-center py-2">
              {t('preferences.noIgnorePatterns')}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
