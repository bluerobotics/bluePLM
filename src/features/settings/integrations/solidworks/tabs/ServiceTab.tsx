import { useMemo, useState } from 'react'
import { Play, Square, RefreshCw, ChevronDown, Check, X } from 'lucide-react'

import { Badge, Button, Callout, Switch, type BadgeTone } from '@/components/core/ui'
import { SwServiceVersionNotice } from '@/components/shared'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'
import { executeCommand } from '@/lib/commands'
import { checkSwServiceCompatibility, EXPECTED_SW_SERVICE_VERSION } from '@/lib/swServiceVersion'

import { useSolidWorksSettings } from '../hooks'

export function ServiceTab() {
  const {
    status,
    isStarting,
    isStopping,
    startService,
    stopService,
    hasError,
    autoStartSolidworksService,
    setAutoStartSolidworksService,
    solidworksServiceVerboseLogging,
    setSolidworksServiceVerboseLogging,
    isAdmin,
    prewarmSolidworks,
    isSavingPrewarm,
    handleTogglePrewarm,
    overallStatus,
    overallStatusConfig,
    syncedSwFiles,
    isSyncingMetadata,
    setIsSyncingMetadata,
    lastMetadataSyncResult,
    setLastMetadataSyncResult,
    addToast,
  } = useSolidWorksSettings()

  // Check service version compatibility
  const versionCheck = useMemo(() => {
    if (!status.running) return null
    return checkSwServiceCompatibility(status.version || null)
  }, [status.running, status.version])

  // Filter to only files checked out by current user
  const { user } = useSolidWorksSettings()
  const checkedOutSwFiles = syncedSwFiles.filter((f) => f.pdmData?.checked_out_by === user?.id)

  const handleSyncAllVaultMetadata = async () => {
    if (!status.running) {
      addToast('error', 'SolidWorks service must be running to sync metadata')
      return
    }

    if (checkedOutSwFiles.length === 0) {
      addToast(
        'info',
        'No SolidWorks files checked out by you. Check out files first to sync metadata.',
      )
      return
    }

    setIsSyncingMetadata(true)
    setLastMetadataSyncResult(null)

    try {
      const result = await executeCommand('sync-metadata', { files: checkedOutSwFiles })

      // Parse result to show stats
      // Result message is like "Sync complete: 2 drawings updated, 3 parts/assemblies synced"
      const drawingsMatch = result.message?.match(/(\d+) drawing/)
      const partsMatch = result.message?.match(/(\d+) part/)
      const pulled = drawingsMatch ? parseInt(drawingsMatch[1]) : 0
      const pushed = partsMatch ? parseInt(partsMatch[1]) : 0

      setLastMetadataSyncResult({
        updated: pulled + pushed,
        unchanged: result.succeeded - (pulled + pushed),
        failed: result.failed,
      })

      if (result.failed > 0) {
        addToast(
          'warning',
          `Synced ${result.succeeded}/${result.total} files. ${result.failed} failed.`,
        )
      } else if (pulled > 0 || pushed > 0) {
        addToast(
          'success',
          `Metadata synced! ${pulled} drawings updated, ${pushed} parts/assemblies synced.`,
        )
      } else {
        addToast('info', 'No metadata changes to sync')
      }
    } catch (error) {
      addToast(
        'error',
        `Metadata sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    } finally {
      setIsSyncingMetadata(false)
    }
  }

  const statusTone: BadgeTone =
    overallStatus === 'online'
      ? 'success'
      : overallStatus === 'partial'
        ? 'warning'
        : overallStatus === 'offline'
          ? 'error'
          : 'neutral'

  const swApiTone: BadgeTone =
    status.running && status.swInstalled
      ? 'success'
      : status.running && !status.swInstalled
        ? 'warning'
        : hasError
          ? 'error'
          : 'neutral'

  const dmApiTone: BadgeTone =
    status.running && status.dmApiAvailable
      ? 'success'
      : status.running && !status.dmApiAvailable
        ? 'error'
        : 'neutral'

  const versionTone: BadgeTone = !status.running
    ? 'neutral'
    : versionCheck?.status === 'incompatible'
      ? 'error'
      : versionCheck?.status === 'outdated' || versionCheck?.status === 'unknown'
        ? 'warning'
        : 'success'

  const syncDisabledReason = !status.running
    ? 'Start the SolidWorks service first'
    : checkedOutSwFiles.length === 0
      ? 'Check out files first'
      : undefined

  return (
    <SettingsPage>
      <SettingsSection title="SolidWorks Service">
        <SettingsGroup>
          {/* Overall integration status + start/stop */}
          <SettingRow
            label={
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${overallStatusConfig[overallStatus].color}`}
                  aria-hidden
                />
                {overallStatusConfig[overallStatus].label}
              </span>
            }
            badge={<Badge tone={statusTone}>{status.running ? 'Running' : 'Stopped'}</Badge>}
            description={overallStatusConfig[overallStatus].description}
          >
            {status.running ? (
              <Button
                variant="danger-subtle"
                onClick={stopService}
                loading={isStopping}
                icon={<Square size={14} />}
              >
                {isStopping ? 'Stopping...' : 'Stop Service'}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={startService}
                loading={isStarting}
                icon={<Play size={14} />}
              >
                {isStarting ? 'Starting...' : 'Start Service'}
              </Button>
            )}
          </SettingRow>

          <SettingRow label="SolidWorks API">
            <Badge tone={swApiTone}>
              {status.running
                ? status.swInstalled
                  ? 'Connected'
                  : 'Not Installed'
                : hasError
                  ? 'Error'
                  : 'Stopped'}
            </Badge>
          </SettingRow>

          <SettingRow label="Document Manager API">
            {status.running && !status.dmApiAvailable && status.dmApiError && (
              <span className="text-[12px] text-plm-error" title={status.dmApiError}>
                (No license key)
              </span>
            )}
            <Badge tone={dmApiTone}>
              {status.running ? (status.dmApiAvailable ? 'Connected' : 'Not Available') : 'Stopped'}
            </Badge>
          </SettingRow>

          <SettingRow
            label="Service Version"
            description={
              status.running ? `Expected: v${EXPECTED_SW_SERVICE_VERSION}` : undefined
            }
          >
            <Badge tone={versionTone}>
              {status.running ? status.version || 'Unknown' : 'Stopped'}
            </Badge>
          </SettingRow>
        </SettingsGroup>

        {/* Version Mismatch Warning */}
        {versionCheck && <SwServiceVersionNotice check={versionCheck} />}

        <Callout tone="info">
          The SolidWorks service enables BOM extraction, property reading, and file export
          features.
          {status.swInstalled
            ? ' Full functionality available with your SolidWorks installation.'
            : ' Basic features work with just a Document Manager license key. Install SolidWorks for full export capabilities.'}
        </Callout>
      </SettingsSection>

      <SettingsSection title="Service options">
        <SettingsGroup>
          <SettingRow
            label="Auto-start on app launch"
            description="Automatically start the service when BluePLM opens"
            htmlFor="sw-auto-start"
          >
            <Switch
              id="sw-auto-start"
              checked={autoStartSolidworksService}
              onChange={setAutoStartSolidworksService}
            />
          </SettingRow>

          {/* Background warmup toggle (org-wide, admin only) */}
          <SettingRow
            label="Keep SolidWorks warm in background"
            badge={<Badge>Organization-wide</Badge>}
            htmlFor="sw-prewarm"
            description={
              <>
                Pre-launches a hidden SolidWorks instance so the first property edit is instant
                instead of a ~40s cold-start. No window is shown.
                {!isAdmin && ' Only admins can change this.'}
              </>
            }
          >
            <Switch
              id="sw-prewarm"
              checked={prewarmSolidworks}
              onChange={handleTogglePrewarm}
              disabled={!isAdmin || isSavingPrewarm}
            />
          </SettingRow>

          <SettingRow
            label="Verbose service logging"
            description="Enable detailed diagnostic output (requires service restart)"
            htmlFor="sw-verbose-logging"
          >
            <Switch
              id="sw-verbose-logging"
              checked={solidworksServiceVerboseLogging}
              onChange={setSolidworksServiceVerboseLogging}
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      {/* Feature Capabilities */}
      <CapabilitiesSection
        dmApiAvailable={!!(status.running && status.dmApiAvailable)}
        swInstalled={!!(status.running && status.swInstalled)}
        isServiceRunning={status.running}
      />

      <SettingsSection
        title="Vault Metadata Sync"
        description="Sync metadata between BluePLM and SolidWorks files. For drawings, reads metadata from the file. For parts and assemblies, writes BluePLM metadata into the file. Only works on files you have checked out."
      >
        <SettingsGroup>
          <SettingRow
            label={
              checkedOutSwFiles.length > 0
                ? `${checkedOutSwFiles.length} SolidWorks file${checkedOutSwFiles.length > 1 ? 's' : ''} checked out by you`
                : syncedSwFiles.length > 0
                  ? `${syncedSwFiles.length} file${syncedSwFiles.length > 1 ? 's' : ''} in vault (check out to sync)`
                  : 'No SolidWorks files found'
            }
            description="Sync only works on files you have checked out for editing"
          >
            <Button
              variant="primary"
              onClick={handleSyncAllVaultMetadata}
              disabled={!status.running || checkedOutSwFiles.length === 0}
              loading={isSyncingMetadata}
              icon={<RefreshCw size={14} />}
              title={syncDisabledReason}
            >
              {isSyncingMetadata ? 'Syncing...' : 'Sync Checked Out Files'}
            </Button>
          </SettingRow>

          {lastMetadataSyncResult && (
            <div className="flex items-center gap-4 px-4 py-3 text-[12px]">
              <span className="text-plm-fg-muted">Last sync:</span>
              {lastMetadataSyncResult.updated > 0 && (
                <span className="text-plm-success">{lastMetadataSyncResult.updated} updated</span>
              )}
              {lastMetadataSyncResult.unchanged > 0 && (
                <span className="text-plm-fg-dim">
                  {lastMetadataSyncResult.unchanged} unchanged
                </span>
              )}
              {lastMetadataSyncResult.failed > 0 && (
                <span className="text-plm-error">{lastMetadataSyncResult.failed} failed</span>
              )}
            </div>
          )}
        </SettingsGroup>

        {!status.running && (
          <Callout tone="warning">Start the SolidWorks service to enable metadata sync</Callout>
        )}
        {status.running && checkedOutSwFiles.length === 0 && syncedSwFiles.length > 0 && (
          <Callout tone="info">Check out SolidWorks files to sync their metadata</Callout>
        )}
      </SettingsSection>
    </SettingsPage>
  )
}

/**
 * Collapsible section showing which features are available based on current setup
 */
function CapabilitiesSection({
  dmApiAvailable,
  swInstalled,
  isServiceRunning,
}: {
  dmApiAvailable: boolean
  swInstalled: boolean
  isServiceRunning: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <SettingsSection
      title="Feature Availability"
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          icon={
            <ChevronDown
              size={14}
              className={`transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
            />
          }
        >
          {isExpanded ? 'Hide' : 'Show'}
        </Button>
      }
    >
      {isExpanded && (
        <SettingsGroup>
          {!isServiceRunning ? (
            <div className="px-4 py-3 text-[13px] text-plm-fg-muted">
              Start the service to see available features.
            </div>
          ) : (
            <>
              <CapabilityGroup
                title="Document Manager API"
                requirement="(No SolidWorks required)"
                available={dmApiAvailable}
                missingTone="error"
                features={[
                  'Read file properties',
                  'Extract BOM from assemblies',
                  'Get configurations list',
                  'Read external references',
                  'Extract preview images',
                  'Write custom properties',
                ]}
                missingHint="Configure a Document Manager license key in the Settings tab to enable these features."
              />
              <CapabilityGroup
                title="Full SolidWorks API"
                requirement="(Requires SolidWorks installation)"
                available={swInstalled}
                missingTone="warning"
                features={[
                  'Export to PDF',
                  'Export to STEP/STL/IGES/DXF',
                  'Get mass properties',
                  'Create from template',
                  'Pack and Go',
                  'Live document sync',
                ]}
                missingHint="Install SolidWorks on this computer to enable export and advanced features."
              />
            </>
          )}
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}

function CapabilityGroup({
  title,
  requirement,
  available,
  missingTone,
  features,
  missingHint,
}: {
  title: string
  requirement: string
  available: boolean
  missingTone: 'error' | 'warning'
  features: string[]
  missingHint: string
}) {
  const dot = available
    ? 'bg-plm-success'
    : missingTone === 'error'
      ? 'bg-plm-error'
      : 'bg-plm-warning'
  return (
    <div className="px-4 py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        <span className="text-[13px] font-medium text-plm-fg">{title}</span>
        <span className="text-[12px] text-plm-fg-dim">{requirement}</span>
      </div>
      <ul className="ml-4 space-y-1 text-[12px] text-plm-fg-muted">
        {features.map((feature) => (
          <li
            key={feature}
            className={`flex items-center gap-2 ${available ? '' : 'opacity-50'}`}
          >
            {available ? (
              <Check size={14} className="flex-shrink-0 text-plm-success" />
            ) : (
              <X size={14} className="flex-shrink-0 text-plm-error" />
            )}
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {!available && <p className="ml-4 mt-2 text-[12px] text-plm-warning">{missingHint}</p>}
    </div>
  )
}
