import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button, Switch, TextInput } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'
import { initAnalytics, isAnalyticsEnabled } from '@/lib/analytics'
import { useTranslation } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { hasDesktop } from '@/lib/platform'
import { usePDMStore } from '@/stores/pdmStore'

/**
 * General preferences: application updates, sync, privacy, file extensions and ignore patterns.
 * Every section here only touches the local machine, so the web build shows none of them.
 */
export function PreferencesSettings() {
  const { t } = useTranslation()
  const desktop = hasDesktop()
  const {
    user,
    activeVaultId,
    lowercaseExtensions,
    setLowercaseExtensions,
    ignorePatterns,
    addIgnorePattern,
    removeIgnorePattern,
    autoDownloadCloudFiles,
    setAutoDownloadCloudFiles,
    autoDownloadUpdates,
    setAutoDownloadUpdates,
    autoDownloadSizeLimit,
    setAutoDownloadSizeLimit,
    autoDownloadExcludedFiles,
    clearAutoDownloadExclusions,
    logSharingEnabled,
    setLogSharingEnabled,
  } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      activeVaultId: s.activeVaultId,
      lowercaseExtensions: s.lowercaseExtensions,
      setLowercaseExtensions: s.setLowercaseExtensions,
      ignorePatterns: s.ignorePatterns,
      addIgnorePattern: s.addIgnorePattern,
      removeIgnorePattern: s.removeIgnorePattern,
      autoDownloadCloudFiles: s.autoDownloadCloudFiles,
      setAutoDownloadCloudFiles: s.setAutoDownloadCloudFiles,
      autoDownloadUpdates: s.autoDownloadUpdates,
      setAutoDownloadUpdates: s.setAutoDownloadUpdates,
      autoDownloadSizeLimit: s.autoDownloadSizeLimit,
      setAutoDownloadSizeLimit: s.setAutoDownloadSizeLimit,
      autoDownloadExcludedFiles: s.autoDownloadExcludedFiles,
      clearAutoDownloadExclusions: s.clearAutoDownloadExclusions,
      logSharingEnabled: s.logSharingEnabled,
      setLogSharingEnabled: s.setLogSharingEnabled,
    })),
  )

  const [appVersion, setAppVersion] = useState<string>('')
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateCheckResult, setUpdateCheckResult] = useState<'none' | 'available' | 'error' | null>(
    null,
  )
  const [newIgnorePattern, setNewIgnorePattern] = useState('')

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getVersion().then(setAppVersion)
    }
  }, [])

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
      log.error('[Preferences]', 'Update check error', { error: error })
      setUpdateCheckResult('error')
    } finally {
      setIsCheckingUpdate(false)
      setTimeout(() => setUpdateCheckResult(null), 5000)
    }
  }

  const handleUsageStatisticsChange = async (newValue: boolean) => {
    setLogSharingEnabled(newValue)
    // Notify main process of the change
    await window.electronAPI?.setAnalyticsEnabled(newValue)
    // If enabling, try to initialize analytics in renderer
    if (newValue) {
      initAnalytics(true)
    }
  }

  const handleAddIgnorePattern = () => {
    if (!newIgnorePattern.trim() || !activeVaultId) return
    addIgnorePattern(activeVaultId, newIgnorePattern.trim())
    setNewIgnorePattern('')
  }

  const currentVaultPatterns = activeVaultId ? ignorePatterns[activeVaultId] || [] : []
  const excludedCount = activeVaultId ? autoDownloadExcludedFiles[activeVaultId]?.length || 0 : 0

  if (!user) {
    return <div className="py-12 text-center text-[14px] text-ui-fg-secondary">Not signed in</div>
  }

  if (!desktop) {
    return (
      <div className="py-12 text-center text-[14px] text-ui-fg-secondary">
        These preferences apply to the desktop app only.
      </div>
    )
  }

  const analyticsActive = logSharingEnabled && isAnalyticsEnabled()

  return (
    <SettingsPage>
      <SettingsSection title={t('preferences.applicationUpdates')}>
        <SettingsGroup>
          <SettingRow
            label={`BluePLM ${appVersion || '...'}`}
            description={
              updateCheckResult === 'none'
                ? t('preferences.youHaveLatest')
                : updateCheckResult === 'available'
                  ? t('preferences.updateAvailable')
                  : updateCheckResult === 'error'
                    ? t('preferences.couldNotCheck')
                    : isCheckingUpdate
                      ? undefined
                      : t('preferences.checkForNewVersions')
            }
          >
            <Button
              variant={updateCheckResult === 'available' ? 'primary' : 'secondary'}
              onClick={handleCheckForUpdates}
              loading={isCheckingUpdate}
            >
              {isCheckingUpdate
                ? t('preferences.checking')
                : updateCheckResult === 'none'
                  ? t('preferences.upToDate')
                  : updateCheckResult === 'available'
                    ? t('preferences.available')
                    : t('preferences.checkForUpdates')}
            </Button>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t('preferences.syncSettings')}>
        <SettingsGroup>
          <SettingRow
            label={t('preferences.autoDownloadCloudFiles')}
            description={t('preferences.autoDownloadCloudFilesDesc')}
            htmlFor="settings-auto-download-cloud"
          >
            <Switch
              id="settings-auto-download-cloud"
              checked={autoDownloadCloudFiles}
              onChange={setAutoDownloadCloudFiles}
            />
          </SettingRow>
          <SettingRow
            label={t('preferences.autoDownloadUpdates')}
            description={t('preferences.autoDownloadUpdatesDesc')}
            htmlFor="settings-auto-download-updates"
          >
            <Switch
              id="settings-auto-download-updates"
              checked={autoDownloadUpdates}
              onChange={setAutoDownloadUpdates}
            />
          </SettingRow>
          {(autoDownloadCloudFiles || autoDownloadUpdates) && (
            <SettingRow
              label={t('preferences.autoDownloadSizeLimit')}
              description={t('preferences.autoDownloadSizeLimitDesc')}
              htmlFor="settings-skip-large-files"
            >
              {autoDownloadSizeLimit > 0 && (
                <label className="flex items-center gap-2 text-[13px] text-ui-fg-secondary">
                  {t('preferences.maxFileSize')}
                  <TextInput
                    type="number"
                    size="sm"
                    value={autoDownloadSizeLimit}
                    onChange={(e) =>
                      setAutoDownloadSizeLimit(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    min={1}
                    className="w-20"
                  />
                  MB
                </label>
              )}
              <Switch
                id="settings-skip-large-files"
                checked={autoDownloadSizeLimit > 0}
                onChange={(on) => setAutoDownloadSizeLimit(on ? 1024 : 0)}
              />
            </SettingRow>
          )}
          {activeVaultId && excludedCount > 0 && (
            <SettingRow
              label={t('preferences.excludedFiles')}
              description={t('preferences.excludedFilesDesc').replace(
                '{{count}}',
                String(excludedCount),
              )}
            >
              <Button size="sm" onClick={() => clearAutoDownloadExclusions(activeVaultId)}>
                {t('preferences.clearExcludedFiles')}
              </Button>
            </SettingRow>
          )}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Privacy"
        description="We collect error reports, crash data, and basic performance metrics. No file contents, personal data, or design information is ever transmitted."
      >
        <SettingsGroup>
          <SettingRow
            label="Usage Statistics"
            description="Send anonymous error reports and performance data to help improve BluePLM"
            htmlFor="settings-usage-statistics"
          >
            <Switch
              id="settings-usage-statistics"
              checked={logSharingEnabled}
              onChange={handleUsageStatisticsChange}
            />
          </SettingRow>
          <div className="flex items-center gap-2 py-3 text-[13px] text-ui-fg-secondary">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                analyticsActive ? 'bg-ui-success' : 'bg-ui-fg-tertiary'
              }`}
            />
            {analyticsActive
              ? 'Analytics active — errors and performance data are being reported'
              : logSharingEnabled
                ? 'Analytics enabled — will activate on next app restart'
                : 'Analytics disabled — no data is sent to our servers'}
          </div>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t('preferences.fileExtensions')}>
        <SettingsGroup>
          <SettingRow
            label={t('preferences.lowercaseExtensions')}
            description={t('preferences.lowercaseExtensionsDesc')}
            htmlFor="settings-lowercase-extensions"
          >
            <Switch
              id="settings-lowercase-extensions"
              checked={lowercaseExtensions}
              onChange={setLowercaseExtensions}
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title={t('preferences.ignorePatterns')}
        description={
          activeVaultId ? (
            t('preferences.ignorePatternsDesc')
          ) : (
            <>
              {t('preferences.ignorePatternsDesc')} {t('preferences.connectVaultForPatterns')}
            </>
          )
        }
      >
        <SettingsGroup>
          <div className="flex gap-2 py-3">
            <TextInput
              value={newIgnorePattern}
              onChange={(e) => setNewIgnorePattern(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddIgnorePattern()
              }}
              placeholder={t('preferences.ignorePlaceholder')}
              aria-label={t('preferences.ignorePatterns')}
              className="flex-1 font-mono"
              disabled={!activeVaultId}
            />
            <Button
              onClick={handleAddIgnorePattern}
              disabled={!newIgnorePattern.trim() || !activeVaultId}
            >
              {t('common.add')}
            </Button>
          </div>
          {currentVaultPatterns.map((pattern, index) => (
            <div key={index} className="group flex items-center gap-2 py-2">
              <code className="flex-1 truncate font-mono text-[13px] text-ui-fg">{pattern}</code>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${pattern}`}
                title={`Remove ${pattern}`}
                icon={<X size={12} />}
                onClick={() => activeVaultId && removeIgnorePattern(activeVaultId, pattern)}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              />
            </div>
          ))}
          {activeVaultId && currentVaultPatterns.length === 0 && (
            <div className="py-3 text-[14px] text-ui-fg-secondary">
              {t('preferences.noIgnorePatterns')}
            </div>
          )}
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}
