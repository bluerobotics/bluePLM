import { useState, useEffect } from 'react'
import { 
  RefreshCw, 
  Download, 
  CheckCircle, 
  Loader2,
  Plus,
  X,
  FileText,
  ToggleLeft,
  ToggleRight,
  Moon,
  Sun,
  Waves,
  Monitor,
  Globe,
  ChevronDown
} from 'lucide-react'
import { usePDMStore, ThemeMode, Language } from '../../stores/pdmStore'
import { useTranslation } from '../../lib/i18n'

const languageOptions: { value: Language; label: string; nativeLabel: string }[] = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'fr', label: 'French', nativeLabel: 'Français' },
  { value: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { value: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { value: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { value: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { value: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' },
  { value: 'sv', label: 'Swedish', nativeLabel: 'Svenska' },
  { value: 'pl', label: 'Polish', nativeLabel: 'Polski' },
  { value: 'ru', label: 'Russian', nativeLabel: 'Русский' },
  { value: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { value: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { value: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文' },
  { value: 'ko', label: 'Korean', nativeLabel: '한국어' },
]

export function PreferencesSettings() {
  const { t } = useTranslation()
  const { 
    activeVaultId,
    lowercaseExtensions, 
    setLowercaseExtensions,
    ignorePatterns,
    addIgnorePattern,
    removeIgnorePattern,
    theme,
    setTheme,
    language,
    setLanguage
  } = usePDMStore()
  
  // Theme options with translations
  const themeOptions: { value: ThemeMode; label: string; icon: React.ReactNode; description: string }[] = [
    { value: 'dark', label: t('preferences.themeDark'), icon: <Moon size={18} />, description: t('preferences.themeDarkDesc') },
    { value: 'deep-blue', label: t('preferences.themeDeepBlue'), icon: <Waves size={18} />, description: t('preferences.themeDeepBlueDesc') },
    { value: 'light', label: t('preferences.themeLight'), icon: <Sun size={18} />, description: t('preferences.themeLightDesc') },
    { value: 'system', label: t('preferences.themeSystem'), icon: <Monitor size={18} />, description: t('preferences.themeSystemDesc') },
  ]
  
  const [appVersion, setAppVersion] = useState<string>('')
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateCheckResult, setUpdateCheckResult] = useState<'none' | 'available' | 'error' | null>(null)
  const [newIgnorePattern, setNewIgnorePattern] = useState('')
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false)
  
  // Get app version on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getVersion().then(setAppVersion)
    }
  }, [])
  
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
    } catch (err) {
      console.error('Update check error:', err)
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
  const currentVaultPatterns = activeVaultId ? (ignorePatterns[activeVaultId] || []) : []

  return (
    <div className="space-y-6">
      {/* Application Updates */}
      <div className="space-y-3">
        <label className="text-sm text-pdm-fg-muted uppercase tracking-wide font-medium">
          {t('preferences.applicationUpdates')}
        </label>
        <div className="p-4 bg-pdm-bg rounded-lg border border-pdm-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-base font-medium text-pdm-fg">
                BluePDM {appVersion || '...'}
              </div>
              <div className="text-sm text-pdm-fg-muted mt-0.5">
                {updateCheckResult === 'none' && t('preferences.youHaveLatest')}
                {updateCheckResult === 'available' && t('preferences.updateAvailable')}
                {updateCheckResult === 'error' && t('preferences.couldNotCheck')}
                {updateCheckResult === null && !isCheckingUpdate && t('preferences.checkForNewVersions')}
              </div>
            </div>
            <button
              onClick={handleCheckForUpdates}
              disabled={isCheckingUpdate}
              className={`flex items-center gap-2 px-4 py-2 text-base font-medium rounded-lg transition-colors ${
                updateCheckResult === 'none'
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                  : updateCheckResult === 'available'
                  ? 'bg-pdm-accent/20 text-pdm-accent border border-pdm-accent/30'
                  : 'bg-pdm-highlight text-pdm-fg-muted hover:text-pdm-fg hover:bg-pdm-highlight/80'
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
      </div>

      {/* Theme Selection */}
      <div className="space-y-3">
        <label className="text-sm text-pdm-fg-muted uppercase tracking-wide font-medium">
          {t('preferences.appearance')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {themeOptions.map((option) => {
            const isSelected = theme === option.value
            return (
              <button
                key={option.value}
                onClick={() => !isSelected && setTheme(option.value)}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                  isSelected
                    ? 'bg-pdm-accent/15 border-pdm-accent cursor-default'
                    : 'bg-pdm-bg border-pdm-border hover:border-pdm-accent/50 hover:bg-pdm-highlight cursor-pointer'
                }`}
              >
                <div className={`p-2.5 rounded-lg ${
                  isSelected 
                    ? 'bg-pdm-accent text-white' 
                    : 'bg-pdm-bg-lighter text-pdm-fg-muted'
                }`}>
                  {option.icon}
                </div>
                <div className="flex-1">
                  <div className={`text-base font-medium ${isSelected ? 'text-pdm-fg' : 'text-pdm-fg-dim'}`}>
                    {option.label}
                  </div>
                  <div className="text-sm text-pdm-fg-muted">{option.description}</div>
                </div>
                {isSelected && (
                  <CheckCircle size={18} className="text-pdm-accent flex-shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Language Selection */}
      <div className="space-y-3">
        <label className="text-sm text-pdm-fg-muted uppercase tracking-wide font-medium">
          {t('preferences.language')}
        </label>
        <div className="p-4 bg-pdm-bg rounded-lg border border-pdm-border">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-pdm-accent text-white">
                <Globe size={18} />
              </div>
              <div>
                <div className="text-base font-medium text-pdm-fg">
                  {t('preferences.displayLanguage')}
                </div>
                <div className="text-sm text-pdm-fg-muted mt-0.5">
                  {t('preferences.chooseLanguage')}
                </div>
              </div>
            </div>
            <div className="relative">
              <button
                onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-pdm-bg-secondary border border-pdm-border rounded-lg hover:border-pdm-accent/50 transition-colors min-w-[180px]"
              >
                <span className="flex-1 text-left">
                  <span className="text-pdm-fg font-medium">
                    {languageOptions.find(l => l.value === language)?.nativeLabel || 'English'}
                  </span>
                  <span className="text-pdm-fg-muted text-sm ml-2">
                    ({languageOptions.find(l => l.value === language)?.label || 'English'})
                  </span>
                </span>
                <ChevronDown size={16} className={`text-pdm-fg-muted transition-transform ${isLanguageDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isLanguageDropdownOpen && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsLanguageDropdownOpen(false)} 
                  />
                  {/* Dropdown */}
                  <div className="absolute right-0 top-full mt-1 z-50 bg-pdm-bg-secondary border border-pdm-border rounded-lg shadow-xl max-h-[320px] overflow-y-auto min-w-[240px]">
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
                              ? 'bg-pdm-accent/15 text-pdm-accent'
                              : 'text-pdm-fg hover:bg-pdm-highlight'
                          }`}
                        >
                          <div>
                            <span className="font-medium">{option.nativeLabel}</span>
                            <span className="text-pdm-fg-muted text-sm ml-2">({option.label})</span>
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
          <p className="text-xs text-pdm-fg-dim mt-3">
            {t('preferences.translationsNote')}
          </p>
        </div>
      </div>

      {/* File Extensions */}
      <div className="space-y-3">
        <label className="text-sm text-pdm-fg-muted uppercase tracking-wide font-medium">
          {t('preferences.fileExtensions')}
        </label>
        <div className="p-4 bg-pdm-bg rounded-lg border border-pdm-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base text-pdm-fg">{t('preferences.lowercaseExtensions')}</div>
              <div className="text-sm text-pdm-fg-muted mt-0.5">
                {t('preferences.lowercaseExtensionsDesc')}
              </div>
            </div>
            <button
              onClick={() => setLowercaseExtensions(!lowercaseExtensions)}
              className="text-pdm-accent"
            >
              {lowercaseExtensions ? (
                <ToggleRight size={28} />
              ) : (
                <ToggleLeft size={28} className="text-pdm-fg-muted" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Ignore Patterns */}
      <div className="space-y-3">
        <label className="text-sm text-pdm-fg-muted uppercase tracking-wide font-medium">
          {t('preferences.ignorePatterns')}
        </label>
        <div className="p-4 bg-pdm-bg rounded-lg border border-pdm-border space-y-3">
          <p className="text-sm text-pdm-fg-muted">
            {t('preferences.ignorePatternsDesc')}
          </p>
          
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
              className="flex-1 bg-pdm-bg-secondary border border-pdm-border rounded-lg px-3 py-2 text-base focus:border-pdm-accent focus:outline-none font-mono"
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
            <p className="text-sm text-pdm-warning">
              {t('preferences.connectVaultForPatterns')}
            </p>
          )}
          
          {/* Pattern list */}
          {currentVaultPatterns.length > 0 ? (
            <div className="space-y-1">
              {currentVaultPatterns.map((pattern, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 bg-pdm-bg-secondary rounded-lg group"
                >
                  <FileText size={16} className="text-pdm-fg-muted flex-shrink-0" />
                  <code className="flex-1 text-base font-mono text-pdm-fg">{pattern}</code>
                  <button
                    onClick={() => activeVaultId && removeIgnorePattern(activeVaultId, pattern)}
                    className="p-1 text-pdm-fg-muted hover:text-pdm-error rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : activeVaultId ? (
            <p className="text-sm text-pdm-fg-dim text-center py-2">
              {t('preferences.noIgnorePatterns')}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
