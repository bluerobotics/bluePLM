import { useShallow } from 'zustand/react/shallow'

import { Switch, TextInput } from '@/components/core/ui'
import { executeCommand } from '@/lib/commands'
import { useTranslation } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'

import { SettingRow, SettingsGroup, SettingsSection } from '../components/ui'

interface MegabyteFieldProps {
  id: string
  value: number
  onChange: (value: number) => void
}

/** A whole-megabyte size, at least 1. */
function MegabyteField({ id, value, onChange }: MegabyteFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <TextInput
        id={id}
        type="number"
        size="sm"
        value={value}
        onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1))}
        min={1}
        className="!w-24"
      />
      <span className="text-[13px] text-ui-fg-secondary">MB</span>
    </div>
  )
}

/** The "Auto-Download Settings" section, shown once a vault is connected. */
export function VaultAutoDownloadSettings() {
  const { t } = useTranslation()
  const {
    addToast,
    autoDownloadCloudFiles,
    setAutoDownloadCloudFiles,
    autoDownloadUpdates,
    setAutoDownloadUpdates,
    autoDownloadSizeLimit,
    setAutoDownloadSizeLimit,
    autoDiscardOrphanedFiles,
    setAutoDiscardOrphanedFiles,
  } = usePDMStore(
    useShallow((s) => ({
      addToast: s.addToast,
      autoDownloadCloudFiles: s.autoDownloadCloudFiles,
      setAutoDownloadCloudFiles: s.setAutoDownloadCloudFiles,
      autoDownloadUpdates: s.autoDownloadUpdates,
      setAutoDownloadUpdates: s.setAutoDownloadUpdates,
      autoDownloadSizeLimit: s.autoDownloadSizeLimit,
      setAutoDownloadSizeLimit: s.setAutoDownloadSizeLimit,
      autoDiscardOrphanedFiles: s.autoDiscardOrphanedFiles,
      setAutoDiscardOrphanedFiles: s.setAutoDiscardOrphanedFiles,
    })),
  )

  const toggleAutoDiscard = async () => {
    const enablingNow = !autoDiscardOrphanedFiles
    setAutoDiscardOrphanedFiles(enablingNow)

    // When toggling ON, immediately discard any already-orphaned files
    if (enablingNow) {
      const orphanedFiles = usePDMStore
        .getState()
        .files.filter((f) => !f.isDirectory && f.diffStatus === 'deleted_remote')
      if (orphanedFiles.length > 0) {
        try {
          const result = await executeCommand('discard-orphaned', {
            files: orphanedFiles,
          })
          if (result.succeeded > 0) {
            addToast(
              'info',
              t(
                result.succeeded > 1
                  ? 'vaultOperations.autoDiscardMany'
                  : 'vaultOperations.autoDiscardOne',
                { count: result.succeeded },
              ),
            )
          }
        } catch (error) {
          log.error('[AutoDiscard]', 'Failed to discard existing orphaned files', {
            error: error,
          })
        }
      }
    }
  }

  return (
    <SettingsSection title="Auto-Download Settings">
      <SettingsGroup>
        <SettingRow
          label="Auto-download cloud files"
          description="Automatically download files that exist on the server but not on your computer"
        >
          <Switch
            checked={autoDownloadCloudFiles}
            onChange={() => setAutoDownloadCloudFiles(!autoDownloadCloudFiles)}
            aria-label="Auto-download cloud files"
          />
        </SettingRow>
        <SettingRow
          label="Auto-download file updates"
          description="Automatically download newer versions when files are updated on the server"
        >
          <Switch
            checked={autoDownloadUpdates}
            onChange={() => setAutoDownloadUpdates(!autoDownloadUpdates)}
            aria-label="Auto-download file updates"
          />
        </SettingRow>
        {(autoDownloadCloudFiles || autoDownloadUpdates) && (
          <SettingRow
            label="Skip large files"
            description="Avoid auto-downloading files larger than a specified size"
          >
            <Switch
              checked={autoDownloadSizeLimit > 0}
              onChange={() => setAutoDownloadSizeLimit(autoDownloadSizeLimit > 0 ? 0 : 1024)}
              aria-label="Skip large files"
            />
          </SettingRow>
        )}
        {(autoDownloadCloudFiles || autoDownloadUpdates) && autoDownloadSizeLimit > 0 && (
          <SettingRow label="Max file size" htmlFor="vault-auto-download-size-limit">
            <MegabyteField
              id="vault-auto-download-size-limit"
              value={autoDownloadSizeLimit}
              onChange={setAutoDownloadSizeLimit}
            />
          </SettingRow>
        )}
        <SettingRow
          label="Auto-discard orphaned files"
          description="Automatically remove local files that no longer exist on the server"
        >
          <Switch
            checked={autoDiscardOrphanedFiles}
            onChange={() => {
              void toggleAutoDiscard()
            }}
            aria-label="Auto-discard orphaned files"
          />
        </SettingRow>
      </SettingsGroup>
    </SettingsSection>
  )
}

/** The "Upload Warnings" section, shown once a vault is connected. */
export function VaultUploadWarnings() {
  const {
    uploadSizeWarningEnabled,
    setUploadSizeWarningEnabled,
    uploadSizeWarningThreshold,
    setUploadSizeWarningThreshold,
  } = usePDMStore(
    useShallow((s) => ({
      uploadSizeWarningEnabled: s.uploadSizeWarningEnabled,
      setUploadSizeWarningEnabled: s.setUploadSizeWarningEnabled,
      uploadSizeWarningThreshold: s.uploadSizeWarningThreshold,
      setUploadSizeWarningThreshold: s.setUploadSizeWarningThreshold,
    })),
  )

  return (
    <SettingsSection title="Upload Warnings">
      <SettingsGroup>
        <SettingRow
          label="Warn on large file uploads"
          description="Show a warning before uploading files larger than your threshold"
        >
          <Switch
            checked={uploadSizeWarningEnabled}
            onChange={() => setUploadSizeWarningEnabled(!uploadSizeWarningEnabled)}
            aria-label="Warn on large file uploads"
          />
        </SettingRow>
        {uploadSizeWarningEnabled && (
          <SettingRow label="Warn when file size exceeds" htmlFor="vault-upload-warning-threshold">
            <MegabyteField
              id="vault-upload-warning-threshold"
              value={uploadSizeWarningThreshold}
              onChange={setUploadSizeWarningThreshold}
            />
          </SettingRow>
        )}
      </SettingsGroup>
    </SettingsSection>
  )
}
