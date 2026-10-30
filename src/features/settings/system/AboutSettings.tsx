import { useState, useEffect } from 'react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { readClientMinVersion } from '@/features/dbUpgrade/readDbState'
import { compareAppVersions } from '@/features/dbUpgrade/gateDecision'

/**
 * The oldest release this page offers to install: the database's client_min_version(), and never
 * a 4.x build, which cannot read a 5.0 database at all.
 */
const FLOOR_WITHOUT_DATABASE_ANSWER = '5.0.0'

import { Badge, Button } from '@/components/core/ui'
import { useTranslation } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'

interface GitHubRelease {
  tag_name: string
  name: string
  published_at: string
  html_url: string
  prerelease: boolean
  body: string
}

export function AboutSettings() {
  const { t } = useTranslation()
  const { addToast } = usePDMStore(useShallow((s) => ({ addToast: s.addToast })))
  const [appVersion, setAppVersion] = useState<string>('')
  const [platform, setPlatform] = useState<string>('win32')
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [updateCheckResult, setUpdateCheckResult] = useState<'none' | 'available' | 'error' | null>(
    null,
  )

  // Version selector state
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [isLoadingReleases, setIsLoadingReleases] = useState(false)
  const [releasesError, setReleasesError] = useState<string | null>(null)
  const [fetchingRelease, setFetchingRelease] = useState<string | null>(null)

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getVersion().then(setAppVersion)
      window.electronAPI.getPlatform().then(setPlatform)
    }
    // Fetch releases on mount
    fetchReleases()
  }, [])

  const fetchReleases = async () => {
    setIsLoadingReleases(true)
    setReleasesError(null)

    try {
      const response = await fetch(
        'https://api.github.com/repos/bluerobotics/bluePLM/releases?per_page=20',
      )
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }
      const data: GitHubRelease[] = await response.json()
      const floor = (await readClientMinVersion()) ?? FLOOR_WITHOUT_DATABASE_ANSWER
      setReleases(
        data.filter(
          (release) => compareAppVersions(release.tag_name.replace(/^v/, ''), floor) >= 0,
        ),
      )
    } catch (error) {
      log.error('[About]', 'Failed to fetch releases', { error: error })
      setReleasesError(error instanceof Error ? error.message : 'Failed to fetch releases')
    } finally {
      setIsLoadingReleases(false)
    }
  }

  const handleInstallVersion = async (release: GitHubRelease) => {
    log.info('[About]', 'Installing version', { version: release.tag_name })

    const {
      setUpdateAvailable,
      setShowUpdateModal,
      setUpdateDownloading,
      setUpdateDownloaded,
      setInstallerPath,
    } = usePDMStore.getState()

    // Determine the correct asset for this platform
    const platformExtensions: Record<string, string[]> = {
      win32: ['.exe'],
      darwin: ['.dmg', '.zip'],
      linux: ['.AppImage', '.deb'],
    }

    const extensions = platformExtensions[platform] || ['.exe']

    // Set loading state
    setFetchingRelease(release.tag_name)

    // Fetch release assets with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(
        `https://api.github.com/repos/bluerobotics/bluePLM/releases/tags/${release.tag_name}`,
        { signal: controller.signal },
      )
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to fetch release: ${response.status}`)
      }

      const releaseData = await response.json()
      const assets = releaseData.assets || []

      // Find the appropriate asset for this platform
      let downloadUrl: string | null = null
      for (const ext of extensions) {
        const asset = assets.find((a: { name: string; browser_download_url: string }) =>
          a.name.toLowerCase().endsWith(ext.toLowerCase()),
        )
        if (asset) {
          downloadUrl = asset.browser_download_url
          break
        }
      }

      if (!downloadUrl) {
        // Fallback: open release page
        addToast('warning', `No installer found for ${platformDisplay}. Opening release page...`)
        window.electronAPI?.openFile(release.html_url)
        return
      }

      // Determine if this is a rollback or upgrade
      const relation = getVersionRelation(release.tag_name)

      // Reset update state
      setUpdateDownloading(false)
      setUpdateDownloaded(false)
      setInstallerPath(null)

      // Set up the update modal with the selected version
      setUpdateAvailable({
        version: release.tag_name.replace(/^v/, ''),
        releaseDate: release.published_at,
        releaseNotes: relation === 'older' ? 'rollback' : undefined,
        downloadUrl,
        isManualVersion: true,
      })

      // Show the update modal
      setShowUpdateModal(true)
    } catch (error) {
      clearTimeout(timeoutId)
      const isTimeout = error instanceof Error && error.name === 'AbortError'
      const message = isTimeout
        ? 'Request timed out. Please try again.'
        : `Failed to get download URL: ${error instanceof Error ? error.message : String(error)}`
      log.error('[About]', 'Failed to get release assets', { error: error, isTimeout })
      addToast('error', message)
    } finally {
      setFetchingRelease(null)
    }
  }

  // Compare versions: returns -1 if a < b, 0 if equal, 1 if a > b
  const compareVersions = (a: string, b: string): number => {
    const parseVersion = (v: string) =>
      v
        .replace(/^v/, '')
        .split('.')
        .map((n) => parseInt(n, 10) || 0)
    const aParts = parseVersion(a)
    const bParts = parseVersion(b)

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0
      const bPart = bParts[i] || 0
      if (aPart < bPart) return -1
      if (aPart > bPart) return 1
    }
    return 0
  }

  const getVersionRelation = (releaseVersion: string): 'current' | 'newer' | 'older' => {
    const cleanRelease = releaseVersion.replace(/^v/, '')
    const cleanCurrent = appVersion.replace(/^v/, '')
    const cmp = compareVersions(cleanRelease, cleanCurrent)
    if (cmp === 0) return 'current'
    if (cmp > 0) return 'newer'
    return 'older'
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
      log.error('[About]', 'Update check error', { error: error })
      setUpdateCheckResult('error')
    } finally {
      setIsCheckingUpdate(false)
      setTimeout(() => setUpdateCheckResult(null), 5000)
    }
  }

  const platformDisplay =
    {
      win32: 'Windows',
      darwin: 'macOS',
      linux: 'Linux',
    }[platform] || platform

  const openExternal = (url: string) => {
    window.electronAPI?.openFile(url)
  }

  return (
    <SettingsPage>
      <SettingsSection
        title="BluePLM"
        description="Check in/out CAD files, track revisions, manage engineering changes, control release workflows, and collaborate with your team, all in one place."
      >
        <SettingsGroup>
          <SettingRow
            label={`Version ${appVersion || '...'} · Platform: ${platformDisplay}`}
            badge={
              updateCheckResult === 'none' ? (
                <Badge tone="success">{t('preferences.upToDate')}</Badge>
              ) : updateCheckResult === 'available' ? (
                <Badge tone="info">{t('preferences.available')}</Badge>
              ) : undefined
            }
            description={
              updateCheckResult === 'available'
                ? t('preferences.updateAvailable')
                : updateCheckResult === 'none'
                  ? t('preferences.youHaveLatest')
                  : undefined
            }
          >
            <Button onClick={handleCheckForUpdates} loading={isCheckingUpdate}>
              {isCheckingUpdate ? t('preferences.checking') : t('preferences.checkForUpdates')}
            </Button>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Version History"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchReleases}
            disabled={isLoadingReleases}
            title="Refresh"
            aria-label="Refresh"
            icon={<RefreshCw size={14} className={isLoadingReleases ? 'animate-spin' : ''} />}
          />
        }
      >
        <SettingsGroup>
          {isLoadingReleases ? (
            <div className="flex items-center gap-2 py-3 text-[14px] text-ui-fg-secondary">
              <Loader2 size={14} className="animate-spin" />
              Loading releases...
            </div>
          ) : releasesError ? (
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-[14px] text-ui-danger">{releasesError}</span>
              <Button size="sm" onClick={fetchReleases}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="max-h-72 divide-y divide-ui-divider overflow-y-auto">
              {releases.map((release) => {
                const relation = getVersionRelation(release.tag_name)
                const isCurrent = relation === 'current'
                const isNewer = relation === 'newer'

                return (
                  <div
                    key={release.tag_name}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] text-ui-fg">{release.tag_name}</span>
                          {release.prerelease && <Badge tone="warning">Pre</Badge>}
                          {isCurrent && <Badge>Current</Badge>}
                        </div>
                        <div className="text-[13px] text-ui-fg-secondary">
                          {new Date(release.published_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>

                    {!isCurrent && (
                      <Button
                        size="sm"
                        variant={isNewer ? 'secondary' : 'ghost'}
                        onClick={() => handleInstallVersion(release)}
                        loading={fetchingRelease === release.tag_name}
                      >
                        {isNewer ? 'Upgrade' : 'Rollback'}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Links">
        <SettingsGroup>
          <SettingRow label="GitHub Repository" description="View source code and contribute">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openExternal('https://github.com/bluerobotics/bluePLM')}
            >
              Open
              <ExternalLink size={12} />
            </Button>
          </SettingRow>
          <SettingRow label="Report Issues" description="Found a bug? Let us know!">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openExternal('https://github.com/bluerobotics/bluePLM/issues')}
            >
              Open
              <ExternalLink size={12} />
            </Button>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <p className="text-[13px] text-ui-fg-secondary">
        Made by Blue Robotics and contributors worldwide.
      </p>
    </SettingsPage>
  )
}
