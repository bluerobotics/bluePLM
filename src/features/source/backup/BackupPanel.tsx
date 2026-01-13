import { useState, useMemo } from 'react'
import { Shield, RefreshCw, Loader2 } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'

// Hooks
import { useBackupStatus } from './hooks/useBackupStatus'
import { useBackupConfig } from './hooks/useBackupConfig'
import { useBackupOperations } from './hooks/useBackupOperations'

// Components
import { BackupStatusCard } from './BackupStatusCard'
import { BackupScheduleInfo } from './BackupScheduleInfo'
import { BackupSourceSection } from './BackupSourceSection'
import { BackupHistory } from './BackupHistory'
import { RestoreActionBar } from './RestoreActionBar'
import { DeleteSnapshotDialog } from './DeleteSnapshotDialog'
import { BackupConfigForm } from './BackupConfigForm'
import { BackupStatusViewer } from './BackupStatusViewer'

// Types
import type { BackupPanelProps, BackupStatus } from './types'

/**
 * Main BackupPanel component - orchestrates all backup functionality.
 * Manages backup configuration, status, history, and restore operations.
 * 
 * Loads in two phases for better UX:
 * 1. Config loads first (fast) - page renders immediately
 * 2. Snapshots load in background (slow) - history section updates when ready
 */
export function BackupPanel({ isAdmin }: BackupPanelProps) {
  const { organization, user, addToast, activeVaultId, connectedVaults, vaultPath } = usePDMStore()
  const currentVaultId = activeVaultId || connectedVaults[0]?.id
  
  // Config section visibility
  const [showConfig, setShowConfig] = useState(false)
  
  // Load backup status (now loads config first, then snapshots in background)
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
    cacheAgeSeconds,
    isUsingCachedData,
    isThisDesignated,
    isDesignatedOnline,
    isRefreshing,
    refresh,
    refreshSnapshots
  } = useBackupStatus(organization?.id, addToast)
  
  // Construct a BackupStatus object for child components that expect it
  // This maintains backward compatibility with existing components
  const status: BackupStatus | null = useMemo(() => {
    if (isLoadingConfig) return null
    
    return {
      isConfigured,
      config,
      snapshots,
      lastSnapshot,
      totalSnapshots,
      isLoading: isLoadingSnapshots,
      error: snapshotError
    }
  }, [isLoadingConfig, isConfigured, config, snapshots, lastSnapshot, totalSnapshots, isLoadingSnapshots, snapshotError])
  
  // Config form state
  const configHook = useBackupConfig(
    config,
    organization?.id,
    user?.id,
    addToast,
    refreshSnapshots
  )
  
  // Operations (backup, restore, delete, designate)
  const operations = useBackupOperations(
    config,
    organization?.id,
    user?.id,
    user?.email,
    vaultPath,
    currentVaultId,
    connectedVaults,
    isThisDesignated,
    isDesignatedOnline,
    addToast,
    refreshSnapshots
  )
  
  // Handle vault toggle for selection
  const handleVaultToggle = (vaultId: string, checked: boolean) => {
    if (checked) {
      operations.setSelectedVaultIds(prev => [...prev, vaultId])
    } else {
      operations.setSelectedVaultIds(prev => prev.filter(id => id !== vaultId))
    }
  }

  // Only show loading spinner while config is loading (fast ~100ms)
  // Snapshots load in background - BackupHistory will show its own spinner
  if (isLoadingConfig) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-plm-fg-muted" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-plm-accent" />
          <h3 className="font-semibold">Backup & Restore</h3>
        </div>
        <button
          onClick={refresh}
          disabled={isRefreshing || isBackoffActive}
          className={`p-1.5 rounded transition-colors ${
            isBackoffActive 
              ? 'text-plm-fg-muted/50 cursor-not-allowed' 
              : 'hover:bg-plm-bg-secondary text-plm-fg-muted hover:text-plm-fg'
          }`}
          title={isBackoffActive 
            ? `Rate limited - retry in ${backoffRemainingSeconds}s` 
            : 'Refresh from backup server'
          }
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      {/* Status Overview */}
      <div className="space-y-4">
        {/* Configuration Status */}
        <BackupStatusCard 
          status={status} 
          isLoadingSnapshots={isLoadingSnapshots}
          isBackoffActive={isBackoffActive}
          backoffRemainingSeconds={backoffRemainingSeconds}
          cacheAgeSeconds={cacheAgeSeconds}
          isUsingCachedData={isUsingCachedData}
        />
        
        {/* Backup Schedule Info */}
        {status?.isConfigured && (
          <BackupScheduleInfo status={status} />
        )}
        
        {/* Backup Source Section */}
        {status?.isConfigured && (
          <BackupSourceSection
            status={status}
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
        
        {/* Backup/Restore Status Viewer */}
        {status?.isConfigured && (
          <BackupStatusViewer
            isRunningBackup={operations.isRunningBackup}
            isRestoring={operations.isRestoring}
          />
        )}
      </div>
      
      {/* Snapshot History - now shows its own loading state */}
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
      
      {/* Restore Action Bar */}
      {operations.selectedSnapshot && (
        <RestoreActionBar
          selectedSnapshot={operations.selectedSnapshot}
          isRestoring={operations.isRestoring}
          onRestore={operations.handleRestore}
          onCancel={() => operations.setSelectedSnapshot(null)}
        />
      )}
      
      {/* Admin Configuration Section */}
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
      
      {/* Delete Confirmation Modal */}
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
