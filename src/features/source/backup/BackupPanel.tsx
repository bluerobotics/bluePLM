import { useCallback, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw, Shield } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useShallow } from 'zustand/react/shallow'
import { t } from '@/lib/i18n'
import { isServerRun, setRunLocation } from '@/lib/backup'

// Hooks
import { useBackupStatus } from './hooks/useBackupStatus'
import { useBackupConfig } from './hooks/useBackupConfig'
import { useBackupOperations } from './hooks/useBackupOperations'
import { useServerBackupRuns } from './hooks/useServerBackupRuns'

// Components
import { BackupOverview } from './BackupOverview'
import { RunLocationPicker } from './RunLocationPicker'
import { ServerBackupSection } from './ServerBackupSection'
import { DamagedFilesSection } from './DamagedFilesSection'
import { DesktopBackupSection } from './DesktopBackupSection'
import { BackupHistory } from './BackupHistory'
import { RestoreActionBar } from './RestoreActionBar'
import { DeleteSnapshotDialog } from './DeleteSnapshotDialog'
import { BackupConfigForm } from './BackupConfigForm'
import { BackupStatusViewer } from './BackupStatusViewer'

// Types
import type { BackupPanelProps, BackupStatus } from './types'

/**
 * Settings > Backup.
 *
 * Top to bottom: whether backups are healthy (overview), who runs them (one click for admins),
 * that runner's controls (server worker, or the designated computer), restore points, and the
 * bucket / retention / schedule settings.
 *
 * State: backup_config is the one source of truth, held by useBackupStatus and re-read after
 * every action, on realtime events and every 30 s, so a change shows without a manual refresh.
 * The restic snapshot list is slow and rate limited and loads separately.
 */
export function BackupPanel({ isAdmin }: BackupPanelProps) {
  const { organization, user, addToast, activeVaultId, connectedVaults, vaultPath } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      user: s.user,
      addToast: s.addToast,
      activeVaultId: s.activeVaultId,
      connectedVaults: s.connectedVaults,
      vaultPath: s.vaultPath,
    })),
  )
  const orgId = organization?.id
  const currentVaultId = activeVaultId || connectedVaults[0]?.id

  const [showConfig, setShowConfig] = useState(false)
  const [savingRunLocation, setSavingRunLocation] = useState(false)

  const statusHook = useBackupStatus(orgId, addToast)
  const {
    config,
    isConfigured,
    isLoadingConfig,
    snapshots,
    lastSnapshot,
    totalSnapshots,
    isLoadingSnapshots,
    snapshotError,
    isBackoffActive,
    backoffRemainingSeconds,
    isThisDesignated,
    isDesignatedOnline,
    isRefreshing,
    refresh,
    refreshSnapshots,
    reloadConfig,
  } = statusHook

  const serverRun = isServerRun(config)
  const pending =
    !!config?.backup_requested_at || !!config?.verify_requested_at || !!config?.backup_started_at
  const serverRuns = useServerBackupRuns(orgId, isConfigured && serverRun, pending)
  const reloadRuns = serverRuns.reload

  // After any change: the configuration first (cheap, what the buttons depend on), then the rest.
  const reloadAll = useCallback(async () => {
    await reloadConfig()
    await Promise.all([refreshSnapshots(), serverRun ? reloadRuns() : Promise.resolve()])
  }, [reloadConfig, refreshSnapshots, serverRun, reloadRuns])

  const status: BackupStatus | null = isLoadingConfig
    ? null
    : {
        isConfigured,
        config,
        snapshots,
        lastSnapshot,
        totalSnapshots,
        isLoading: isLoadingSnapshots,
        error: snapshotError,
      }

  const configHook = useBackupConfig(config, orgId, user?.id, addToast, reloadAll)
  const operations = useBackupOperations(
    config,
    orgId,
    user?.id,
    user?.email,
    vaultPath,
    currentVaultId,
    connectedVaults,
    isThisDesignated,
    isDesignatedOnline,
    addToast,
    reloadAll,
  )

  const handleVaultToggle = (vaultId: string, checked: boolean) => {
    operations.setSelectedVaultIds((prev) =>
      checked ? [...prev, vaultId] : prev.filter((id) => id !== vaultId),
    )
  }

  const handleRunLocation = async (location: 'desktop' | 'server') => {
    if (!orgId) return
    setSavingRunLocation(true)
    try {
      const result = await setRunLocation(orgId, location)
      if (result.success) {
        addToast(
          'success',
          location === 'server' ? t('backupPanel.nowServer') : t('backupPanel.nowDesktop'),
        )
        await reloadAll()
      } else {
        addToast('error', t('serverBackup.requestFailed', { error: result.error ?? '' }))
      }
    } finally {
      setSavingRunLocation(false)
    }
  }

  if (isLoadingConfig) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-plm-fg-muted" />
      </div>
    )
  }

  const lastBackupAt = serverRun
    ? (serverRuns.lastGood?.started_at ?? null)
    : (lastSnapshot?.time ?? null)

  const restorePoints = (
    <>
      {isBackoffActive && backoffRemainingSeconds > 0 && (
        <div className="flex items-center gap-2 p-2 rounded border bg-amber-500/10 border-amber-500/30 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          {t('backupPanel.rateLimited', { seconds: backoffRemainingSeconds })}
        </div>
      )}
      <BackupHistory
        status={status}
        isAdmin={isAdmin}
        selectedSnapshot={operations.selectedSnapshot}
        onSelectSnapshot={operations.setSelectedSnapshot}
        deletingSnapshotIds={operations.deletingSnapshotIds}
        onRequestDelete={operations.setDeleteConfirmTarget}
        historyVaultFilter={operations.historyVaultFilter}
        onHistoryVaultFilterChange={operations.setHistoryVaultFilter}
        isRestoring={operations.isRestoring}
        isLoadingSnapshots={isLoadingSnapshots}
      />
      {operations.selectedSnapshot && (
        <RestoreActionBar
          selectedSnapshot={operations.selectedSnapshot}
          isRestoring={operations.isRestoring}
          onRestore={operations.handleRestore}
          onCancel={() => operations.setSelectedSnapshot(null)}
        />
      )}
    </>
  )

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-plm-accent" />
          <h3 className="font-semibold">{t('backupPanel.title')}</h3>
        </div>
        <button
          onClick={refresh}
          disabled={isRefreshing || isBackoffActive}
          className="p-1.5 rounded transition-colors hover:bg-plm-bg-secondary text-plm-fg-muted hover:text-plm-fg disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('backupPanel.refresh')}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <BackupOverview
        config={config}
        isConfigured={isConfigured}
        isAdmin={isAdmin}
        lastBackupAt={lastBackupAt}
        isDesignatedOnline={isDesignatedOnline}
        isThisDesignated={isThisDesignated}
        isRunning={!!config?.backup_started_at}
        onOpenSettings={() => setShowConfig(true)}
      />

      {/* Who runs backups, and that runner's controls */}
      {isConfigured && config && orgId && (
        <section className="space-y-3">
          <RunLocationPicker
            value={serverRun ? 'server' : 'desktop'}
            isAdmin={isAdmin}
            saving={savingRunLocation}
            onChange={(location) => void handleRunLocation(location)}
          />
          {serverRun ? (
            <ServerBackupSection
              config={config}
              orgId={orgId}
              userEmail={user?.email ?? ''}
              isAdmin={isAdmin}
              runs={serverRuns.runs}
              runsLoaded={serverRuns.loaded}
              lastTest={serverRuns.lastTest}
              onChanged={reloadAll}
            />
          ) : (
            <DesktopBackupSection
              config={config}
              isThisDesignated={isThisDesignated}
              isDesignatedOnline={isDesignatedOnline}
              isAdmin={isAdmin}
              connectedVaults={connectedVaults}
              selectedVaultIds={operations.selectedVaultIds}
              onVaultToggle={handleVaultToggle}
              isRunningBackup={operations.isRunningBackup}
              backupProgress={operations.backupProgress}
              onRunBackup={operations.handleRunBackup}
              onDesignateThisMachine={operations.handleDesignateThisMachine}
              onClearDesignatedMachine={operations.handleClearDesignatedMachine}
            />
          )}
          <BackupStatusViewer
            isRunningBackup={operations.isRunningBackup}
            isRestoring={operations.isRestoring}
          />
        </section>
      )}

      {/* Damaged or missing vault content the server backup found (schema 503), admins only */}
      {isConfigured && isAdmin && serverRun && <DamagedFilesSection />}

      {/* Restore points (restic snapshots made by the designated computer). With server-run
          backups they are older history, folded away and loaded only when opened. */}
      {isConfigured && !serverRun && <section className="space-y-2">{restorePoints}</section>}
      {isConfigured && serverRun && (
        <details
          className="space-y-2"
          onToggle={(e) => {
            if ((e.currentTarget as HTMLDetailsElement).open && snapshots.length === 0)
              void refreshSnapshots()
          }}
        >
          <summary className="text-sm cursor-pointer select-none text-plm-fg-muted">
            {t('backupPanel.desktopSnapshots')}
          </summary>
          <p className="text-xs text-plm-fg-muted">{t('backupPanel.restoreHintServer')}</p>
          {restorePoints}
        </details>
      )}

      {/* Bucket, credentials, retention and schedule (admins) */}
      {isAdmin && (
        <BackupConfigForm
          showConfig={showConfig}
          onToggleConfig={() => setShowConfig(!showConfig)}
          provider={configHook.provider}
          onProviderChange={configHook.setProvider}
          bucket={configHook.bucket}
          onBucketChange={configHook.setBucket}
          region={configHook.region}
          onRegionChange={configHook.setRegion}
          endpoint={configHook.endpoint}
          onEndpointChange={configHook.setEndpoint}
          accessKey={configHook.accessKey}
          onAccessKeyChange={configHook.setAccessKey}
          secretKey={configHook.secretKey}
          onSecretKeyChange={configHook.setSecretKey}
          resticPassword={configHook.resticPassword}
          onResticPasswordChange={configHook.setResticPassword}
          showSecretKey={configHook.showSecretKey}
          onShowSecretKeyChange={configHook.setShowSecretKey}
          showResticPassword={configHook.showResticPassword}
          onShowResticPasswordChange={configHook.setShowResticPassword}
          retentionDaily={configHook.retentionDaily}
          onRetentionDailyChange={configHook.setRetentionDaily}
          retentionWeekly={configHook.retentionWeekly}
          onRetentionWeeklyChange={configHook.setRetentionWeekly}
          retentionMonthly={configHook.retentionMonthly}
          onRetentionMonthlyChange={configHook.setRetentionMonthly}
          retentionYearly={configHook.retentionYearly}
          onRetentionYearlyChange={configHook.setRetentionYearly}
          totalRetentionPoints={configHook.totalRetentionPoints}
          scheduleEnabled={configHook.scheduleEnabled}
          onScheduleEnabledChange={configHook.setScheduleEnabled}
          scheduleHour={configHook.scheduleHour}
          scheduleMinute={configHook.scheduleMinute}
          onScheduleTimeChange={(h, m) => {
            configHook.setScheduleHour(h)
            configHook.setScheduleMinute(m)
          }}
          scheduleTimezone={configHook.scheduleTimezone}
          onScheduleTimezoneChange={configHook.setScheduleTimezone}
          isSaving={configHook.isSaving}
          onSave={configHook.handleSave}
          onExport={configHook.exportConfig}
          onImport={configHook.importConfig}
        />
      )}

      {operations.deleteConfirmTarget && (
        <DeleteSnapshotDialog
          target={operations.deleteConfirmTarget}
          onConfirm={operations.handleDeleteSnapshot}
          onCancel={() => operations.setDeleteConfirmTarget(null)}
        />
      )}
    </div>
  )
}
