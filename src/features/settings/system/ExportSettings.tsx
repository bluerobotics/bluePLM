import { useState, useEffect, useMemo } from 'react'
import { Loader2, Package, FileOutput, Eye, RotateCcw, User, Building2, Box } from 'lucide-react'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
import { useTranslation } from '@/lib/i18n'
import { ExportSettings as ExportSettingsType, DEFAULT_EXPORT_SETTINGS } from '@/types/pdm'
import { getOrganizationSetting, setOrganizationSetting } from '@/lib/organizationSettings'

// LocalStorage key for user preferences
const USER_EXPORT_SETTINGS_KEY = 'blueplm_export_settings'

// Available tokens for filename patterns
const FILENAME_TOKENS = [
  {
    token: '{filename}',
    labelKey: 'fileName',
    descriptionKey: 'fileNameDescription',
    example: 'Part1',
  },
  {
    token: '{config}',
    labelKey: 'configuration',
    descriptionKey: 'configurationDescription',
    example: 'Default',
  },
  {
    token: '{partNumber}',
    labelKey: 'partNumber',
    descriptionKey: 'partNumberDescription',
    example: 'BR-101011-394',
  },
  {
    token: '{number}',
    labelKey: 'numberAlternate',
    descriptionKey: 'sameAsPartNumber',
    example: 'BR-101011-394',
  },
  {
    token: '{tab}',
    labelKey: 'tabNumber',
    descriptionKey: 'tabNumberDescription',
    example: '394',
  },
  { token: '{tabNumber}', labelKey: 'tabAlternate', descriptionKey: 'sameAsTab', example: '394' },
  {
    token: '{revision}',
    labelKey: 'revision',
    descriptionKey: 'revisionDescription',
    example: 'A',
  },
  { token: '{rev}', labelKey: 'revisionAlternate', descriptionKey: 'sameAsRevision', example: 'A' },
  {
    token: '{description}',
    labelKey: 'description',
    descriptionKey: 'descriptionDescription',
    example: 'Thruster Housing',
  },
  {
    token: '{desc}',
    labelKey: 'descriptionAlternate',
    descriptionKey: 'sameAsDescription',
    example: 'Thruster Housing',
  },
  {
    token: '{date}',
    labelKey: 'date',
    descriptionKey: 'dateDescription',
    example: '2026-01-01',
  },
  { token: '{time}', labelKey: 'time', descriptionKey: 'timeDescription', example: '14-30-00' },
  {
    token: '{datetime}',
    labelKey: 'dateTime',
    descriptionKey: 'dateTimeDescription',
    example: '2026-01-01_14-30-00',
  },
]

// Preset patterns for quick selection
const PRESET_PATTERNS = [
  { pattern: '{filename}_{config}', labelKey: 'fileAndConfig', description: 'Part1_Default.step' },
  { pattern: '{partNumber}', labelKey: 'partNumberOnly', description: 'BR-101011-394.step' },
  {
    pattern: '{partNumber}_Rev{rev}',
    labelKey: 'partAndRevision',
    description: 'BR-101011-394_RevA.step',
  },
  { pattern: '{partNumber}-{tab}', labelKey: 'partAndTab', description: 'BR-101011-394.step' },
  {
    pattern: '{partNumber}-{tab}_Rev{rev}',
    labelKey: 'partTabAndRevision',
    description: 'BR-101011-394_RevA.step',
  },
  {
    pattern: '{partNumber}_{config}',
    labelKey: 'partAndConfig',
    description: 'BR-101011-394_Default.step',
  },
  {
    pattern: '{partNumber}_{config}_Rev{rev}',
    labelKey: 'partConfigAndRevision',
    description: 'BR-101011-394_Default_RevA.step',
  },
  { pattern: '{filename}_{date}', labelKey: 'fileAndDate', description: 'Part1_2026-01-01.step' },
]

// Get user's export settings from localStorage
function getUserExportSettings(): ExportSettingsType | null {
  try {
    const stored = localStorage.getItem(USER_EXPORT_SETTINGS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

// Save user's export settings to localStorage
function saveUserExportSettings(settings: ExportSettingsType) {
  localStorage.setItem(USER_EXPORT_SETTINGS_KEY, JSON.stringify(settings))
}

// Clear user's export settings (revert to org default)
function clearUserExportSettings() {
  localStorage.removeItem(USER_EXPORT_SETTINGS_KEY)
}

// Get effective export settings (user override > org default > app default)
export function getEffectiveExportSettings(
  organization: { settings?: any } | null,
): ExportSettingsType {
  // First check user preference
  const userSettings = getUserExportSettings()
  if (userSettings) {
    return userSettings
  }

  // Then check org default
  const orgSettings = organization?.settings?.export_settings
  if (orgSettings) {
    return { ...DEFAULT_EXPORT_SETTINGS, ...orgSettings }
  }

  // Fall back to app default
  return DEFAULT_EXPORT_SETTINGS
}

export function ExportSettings() {
  const { t } = useTranslation()
  const { organization, addToast, getEffectiveRole } = usePDMStore()
  const isAdmin = getEffectiveRole() === 'admin'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<ExportSettingsType>(DEFAULT_EXPORT_SETTINGS)
  const [orgDefault, setOrgDefault] = useState<ExportSettingsType>(DEFAULT_EXPORT_SETTINGS)
  const [hasUserOverride, setHasUserOverride] = useState(false)

  // Load settings - user override takes priority over org default
  useEffect(() => {
    if (!organization) return

    const loadSettings = async () => {
      setLoading(true)
      try {
        const savedDefault = await getOrganizationSetting<ExportSettingsType>(
          'export',
          organization.id,
        )
        const mergedDefault = { ...DEFAULT_EXPORT_SETTINGS, ...savedDefault }
        setOrgDefault(mergedDefault)

        const userSettings = getUserExportSettings()
        if (userSettings) {
          setSettings(userSettings)
          setHasUserOverride(true)
        } else {
          setSettings(mergedDefault)
          setHasUserOverride(false)
        }
      } catch (error) {
        log.error('[ExportSettings]', 'Failed to load organization export settings', { error })
        setOrgDefault(DEFAULT_EXPORT_SETTINGS)
        setSettings(getUserExportSettings() || DEFAULT_EXPORT_SETTINGS)
      } finally {
        setLoading(false)
      }
    }
    void loadSettings()
  }, [organization?.id])

  // Generate a live preview of what the filename will look like
  const livePreview = useMemo(() => {
    let result = settings.filename_pattern

    // Sample values for preview
    const sampleValues: Record<string, string> = {
      '{filename}': 'Part1',
      '{config}': 'Config-A',
      '{partNumber}': 'BR-101011',
      '{number}': 'BR-101011',
      '{tab}': '394',
      '{tabNumber}': '394',
      '{revision}': 'A',
      '{rev}': 'A',
      '{description}': 'Thruster',
      '{desc}': 'Thruster',
      '{date}': '2026-01-01',
      '{time}': '14-30-00',
      '{datetime}': '2026-01-01_14-30-00',
    }

    // Replace tokens (case-insensitive)
    for (const [token, value] of Object.entries(sampleValues)) {
      const regex = new RegExp(token.replace(/[{}]/g, '\\$&'), 'gi')
      result = result.replace(regex, value)
    }

    return result + '.step'
  }, [settings.filename_pattern])

  // Save as user preference (localStorage)
  const handleSaveUserPreference = () => {
    saveUserExportSettings(settings)
    setHasUserOverride(true)
    addToast('success', t('settingsPages.export.savedPersonal'))
  }

  // Reset to org default
  const handleResetToOrgDefault = () => {
    clearUserExportSettings()
    setSettings(orgDefault)
    setHasUserOverride(false)
    addToast('info', t('settingsPages.export.resetOrganization'))
  }

  // Save as org default (admin only)
  const handleSaveOrgDefault = async () => {
    if (!organization?.id || !isAdmin) return

    setSaving(true)
    try {
      await setOrganizationSetting('export', organization.id, settings)
      setOrgDefault(settings)
      addToast('success', t('settingsPages.export.savedOrganization'))
    } catch (error) {
      log.error('[ExportSettings]', 'Failed to save org export settings', { error: error })
      addToast(
        'error',
        `${t('settingsPages.export.saveFailed')}: ${error instanceof Error ? error.message : t('settingsPages.export.unknownError')}`,
      )
    } finally {
      setSaving(false)
    }
  }

  // Insert token at cursor or end of pattern
  const insertToken = (token: string) => {
    setSettings((prev) => ({
      ...prev,
      filename_pattern: prev.filename_pattern + token,
    }))
  }

  if (!organization) {
    return (
      <div className="p-6 text-center text-plm-fg-muted">{t('settingsPages.noOrganization')}</div>
    )
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center gap-2">
        <Loader2 className="animate-spin" size={20} />
        <span>{t('settingsPages.export.loading')}</span>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Package className="text-emerald-400" size={24} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-plm-fg">{t('settingsPages.export.title')}</h2>
            <p className="text-sm text-plm-fg-muted">{t('settingsPages.export.description')}</p>
          </div>
        </div>

        {/* Save buttons */}
        <div className="flex items-center gap-2">
          {hasUserOverride && (
            <button
              onClick={handleResetToOrgDefault}
              className="flex items-center gap-2 px-3 py-2 bg-plm-bg border border-plm-border hover:bg-plm-bg-light rounded-lg text-plm-fg-muted hover:text-plm-fg text-sm transition-colors"
              title={t('settingsPages.export.resetOrganization')}
            >
              <RotateCcw size={14} />
              {t('settingsPages.export.resetDefault')}
            </button>
          )}

          <button
            onClick={handleSaveUserPreference}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white text-sm font-medium transition-colors"
          >
            <User size={16} />
            {t('settingsPages.export.saveForMe')}
          </button>

          {isAdmin && (
            <button
              onClick={handleSaveOrgDefault}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
              title={t('settingsPages.export.organizationWideDefault')}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
              {t('settingsPages.export.saveOrganizationDefault')}
            </button>
          )}
        </div>
      </div>

      {/* Current mode indicator */}
      <div
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
          hasUserOverride
            ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
            : 'bg-plm-bg-light/30 border border-plm-border/30 text-plm-fg-muted'
        }`}
      >
        {hasUserOverride ? (
          <>
            <User size={16} />
            <span>{t('settingsPages.export.usingPersonal')}</span>
          </>
        ) : (
          <>
            <Building2 size={16} />
            <span>{t('settingsPages.export.usingOrganization')}</span>
          </>
        )}
      </div>

      {/* Filename Pattern */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-plm-fg mb-2">
            {t('settingsPages.export.filenamePattern')}
          </label>
          <input
            type="text"
            value={settings.filename_pattern}
            onChange={(e) => setSettings((prev) => ({ ...prev, filename_pattern: e.target.value }))}
            placeholder="{filename}_{config}"
            className="w-full px-4 py-2.5 bg-plm-bg border border-plm-border rounded-lg text-plm-fg 
              focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20
              font-mono text-sm"
          />
          <p className="mt-1.5 text-xs text-plm-fg-muted">{t('settingsPages.export.tokenHelp')}</p>
        </div>

        {/* Live Preview */}
        <div className="bg-plm-bg-light/30 border border-plm-border/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-plm-fg-muted mb-2">
            <Eye size={14} />
            <span>{t('settingsPages.export.preview')}</span>
          </div>
          <div className="font-mono text-sm text-cyan-400">{livePreview}</div>
        </div>

        {/* Preset Patterns */}
        <div>
          <label className="block text-xs text-plm-fg-muted mb-2">
            {t('settingsPages.export.quickPresets')}
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_PATTERNS.map((preset) => (
              <button
                key={preset.pattern}
                onClick={() =>
                  setSettings((prev) => ({ ...prev, filename_pattern: preset.pattern }))
                }
                className={`px-3 py-1.5 rounded text-xs transition-colors
                  ${
                    settings.filename_pattern === preset.pattern
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'bg-plm-bg border border-plm-border/50 text-plm-fg-muted hover:bg-plm-bg-light/50 hover:text-plm-fg'
                  }`}
                title={preset.description}
              >
                {t(`settingsPages.export.presets.${preset.labelKey}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Available Tokens */}
        <div>
          <label className="block text-xs text-plm-fg-muted mb-2">
            {t('settingsPages.export.availableTokens')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {FILENAME_TOKENS.map(({ token, labelKey, descriptionKey, example }) => (
              <button
                key={token}
                onClick={() => insertToken(token)}
                className="flex flex-col items-start p-2 rounded bg-plm-bg border border-plm-border/50 
                  hover:bg-plm-bg-light/50 hover:border-plm-border text-left transition-colors group"
                title={`${t(`settingsPages.export.tokens.${descriptionKey}`)} (${t('settingsPages.export.exampleAbbreviation')}: ${example})`}
              >
                <span className="text-xs font-mono text-cyan-400 group-hover:text-cyan-300">
                  {token}
                </span>
                <span className="text-[10px] text-plm-fg-muted truncate w-full">
                  {t(`settingsPages.export.tokens.${labelKey}`)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Additional Options */}
      <div className="space-y-4 border-t border-plm-border/50 pt-6">
        <h3 className="text-sm font-medium text-plm-fg">
          {t('settingsPages.export.additionalOptions')}
        </h3>

        {/* Include config name checkbox */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.include_config_in_filename}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, include_config_in_filename: e.target.checked }))
            }
            className="w-4 h-4 rounded border-plm-border bg-plm-bg text-cyan-500 
              focus:ring-cyan-500/20 focus:ring-offset-0"
          />
          <div>
            <div className="text-sm text-plm-fg">
              {t('settingsPages.export.includeConfiguration')}
            </div>
            <div className="text-xs text-plm-fg-muted">
              {t('settingsPages.export.includeConfigurationHelp')}
            </div>
          </div>
        </label>

        {/* Default export format */}
        <div>
          <label className="block text-sm text-plm-fg mb-2">
            {t('settingsPages.export.defaultFormat')}
          </label>
          <div className="flex gap-2">
            {(['step', 'iges', 'stl'] as const).map((format) => (
              <button
                key={format}
                onClick={() => setSettings((prev) => ({ ...prev, default_export_format: format }))}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    settings.default_export_format === format
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                      : 'bg-plm-bg border border-plm-border/50 text-plm-fg-muted hover:bg-plm-bg-light/50'
                  }`}
              >
                <FileOutput size={14} />
                {format.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-plm-fg-muted">
            {t('settingsPages.export.defaultFormatHelp')}
          </p>
        </div>
      </div>

      {/* STL Export Options */}
      <div className="space-y-4 border-t border-plm-border/50 pt-6">
        <div className="flex items-center gap-2">
          <Box size={16} className="text-violet-400" />
          <h3 className="text-sm font-medium text-plm-fg">
            {t('settingsPages.export.stlOptions')}
          </h3>
        </div>

        {/* Resolution dropdown */}
        <div>
          <label className="block text-sm text-plm-fg mb-2">
            {t('settingsPages.export.resolutionQuality')}
          </label>
          <div className="flex gap-2">
            {(['coarse', 'fine', 'custom'] as const).map((res) => (
              <button
                key={res}
                onClick={() => setSettings((prev) => ({ ...prev, stl_resolution: res }))}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize
                  ${
                    settings.stl_resolution === res
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/50'
                      : 'bg-plm-bg border border-plm-border/50 text-plm-fg-muted hover:bg-plm-bg-light/50'
                  }`}
              >
                {t(`settingsPages.export.resolution.${res}`)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-plm-fg-muted">
            {settings.stl_resolution === 'coarse' &&
              t('settingsPages.export.resolution.coarseHelp')}
            {settings.stl_resolution === 'fine' && t('settingsPages.export.resolution.fineHelp')}
            {settings.stl_resolution === 'custom' &&
              t('settingsPages.export.resolution.customHelp')}
          </p>
        </div>

        {/* Custom resolution settings (only visible when custom is selected) */}
        {settings.stl_resolution === 'custom' && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-plm-bg-light/20 rounded-lg border border-plm-border/30">
            <div>
              <label className="block text-xs text-plm-fg-muted mb-1.5">
                {t('settingsPages.export.deviation')}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.001"
                max="10"
                value={settings.stl_custom_deviation ?? 0.1}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    stl_custom_deviation: parseFloat(e.target.value) || 0.1,
                  }))
                }
                className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-plm-fg text-sm
                  focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
              />
              <p className="mt-1 text-[10px] text-plm-fg-muted">
                {t('settingsPages.export.deviationHelp')}
              </p>
            </div>
            <div>
              <label className="block text-xs text-plm-fg-muted mb-1.5">
                {t('settingsPages.export.angleTolerance')}
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="45"
                value={settings.stl_custom_angle ?? 10}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    stl_custom_angle: parseFloat(e.target.value) || 10,
                  }))
                }
                className="w-full px-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-plm-fg text-sm
                  focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
              />
              <p className="mt-1 text-[10px] text-plm-fg-muted">
                {t('settingsPages.export.angleToleranceHelp')}
              </p>
            </div>
          </div>
        )}

        {/* Binary format toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.stl_binary_format ?? true}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, stl_binary_format: e.target.checked }))
            }
            className="w-4 h-4 rounded border-plm-border bg-plm-bg text-violet-500 
              focus:ring-violet-500/20 focus:ring-offset-0"
          />
          <div>
            <div className="text-sm text-plm-fg">{t('settingsPages.export.binaryFormat')}</div>
            <div className="text-xs text-plm-fg-muted">
              {t('settingsPages.export.binaryFormatHelp')}
            </div>
          </div>
        </label>
      </div>

      {/* Token Reference */}
      <div className="border-t border-plm-border/50 pt-6">
        <h3 className="text-sm font-medium text-plm-fg mb-4">
          {t('settingsPages.export.tokenReference')}
        </h3>
        <div className="bg-plm-bg-light/20 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-plm-border/30">
                <th className="text-left px-4 py-2 text-plm-fg-muted font-medium">
                  {t('settingsPages.export.token')}
                </th>
                <th className="text-left px-4 py-2 text-plm-fg-muted font-medium">
                  {t('settingsPages.export.tokenDescription')}
                </th>
                <th className="text-left px-4 py-2 text-plm-fg-muted font-medium">
                  {t('settingsPages.export.example')}
                </th>
              </tr>
            </thead>
            <tbody>
              {FILENAME_TOKENS.map(({ token, descriptionKey, example }) => (
                <tr key={token} className="border-b border-plm-border/20 last:border-0">
                  <td className="px-4 py-2 font-mono text-cyan-400 text-xs">{token}</td>
                  <td className="px-4 py-2 text-plm-fg-muted text-xs">
                    {t(`settingsPages.export.tokens.${descriptionKey}`)}
                  </td>
                  <td className="px-4 py-2 text-plm-fg text-xs">{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
