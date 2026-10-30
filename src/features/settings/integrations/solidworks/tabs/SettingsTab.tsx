import { useEffect, useState } from 'react'
import { Image, ExternalLink, FolderOpen, FileInput, Loader2, Box } from 'lucide-react'

import { Badge, Button, Select, Switch, TextInput } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'
import { useTranslation } from '@/lib/i18n'
import type { CadPreviewMode } from '@/types/cadPreviewMode'

import { useSolidWorksSettings } from '../hooks'

export function SettingsTab() {
  const { t } = useTranslation()
  const [embeddedPreviewAvailable, setEmbeddedPreviewAvailable] = useState(false)
  const {
    cadPreviewMode,
    setCadPreviewMode,
    solidworksPath,
    setSolidworksPath,
    swComInstalls,
    solidworksProgId,
    handleSelectSolidworksProgId,
    hideSolidworksTempFiles,
    setHideSolidworksTempFiles,
    ignoreSolidworksTempFiles,
    setIgnoreSolidworksTempFiles,
    lockDrawingRevision,
    setLockDrawingRevision,
    lockDrawingItemNumber,
    setLockDrawingItemNumber,
    lockDrawingDescription,
    setLockDrawingDescription,
    // Model revision policy (org-wide)
    allowModelRevision,
    isSavingRevisionPolicy,
    handleToggleModelRevision,
    isAdmin,
  } = useSolidWorksSettings()

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    void api.isEDrawingsNativeAvailable()
      .then(setEmbeddedPreviewAvailable)
      .catch(() => setEmbeddedPreviewAvailable(false))
  }, [])

  const selectedInstall = swComInstalls.find((install) => install.progId === solidworksProgId)

  const previewOptions: {
    mode: CadPreviewMode
    icon: typeof Image
    label: string
    description: string
    disabled?: boolean
  }[] = [
    {
      mode: 'thumbnail',
      icon: Image,
      label: t('solidworksSettings.embeddedThumbnail'),
      description: t('solidworksSettings.embeddedThumbnailDescription'),
    },
    {
      mode: 'edrawings',
      icon: ExternalLink,
      label: t('solidworksSettings.externalEDrawings'),
      description: t('solidworksSettings.externalEDrawingsDescription'),
    },
    {
      mode: 'edrawings-embedded',
      icon: Box,
      label: t('solidworksSettings.embeddedEDrawings'),
      description: embeddedPreviewAvailable
        ? t('solidworksSettings.embeddedEDrawingsAvailable')
        : t('solidworksSettings.embeddedEDrawingsUnavailable'),
      disabled: !embeddedPreviewAvailable,
    },
  ]

  return (
    <SettingsPage>
      <SettingsSection title={t('solidworksSettings.previewMode')}>
        <SettingsGroup>
          <div role="radiogroup" aria-label={t('solidworksSettings.previewMode')}>
            {previewOptions.map((option, index) => {
              const Icon = option.icon
              const selected = cadPreviewMode === option.mode
              return (
                <button
                  key={option.mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCadPreviewMode(option.mode)}
                  disabled={option.disabled}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-plm-highlight/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${
                    index > 0 ? 'border-t border-plm-border' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                      selected ? 'border-plm-accent' : 'border-plm-border-light'
                    }`}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-plm-accent" />}
                  </span>
                  <Icon
                    size={16}
                    className={`flex-shrink-0 ${selected ? 'text-plm-accent' : 'text-plm-fg-muted'}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-plm-fg">
                      {option.label}
                    </span>
                    <span className="block text-[12px] text-plm-fg-muted">
                      {option.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Temporary Lock Files (~$)"
        description={
          <>
            SolidWorks creates temporary <code className="font-mono">~$filename.sldprt</code> lock
            files when files are open. These indicate a file is being edited and are automatically
            deleted when closed.
          </>
        }
      >
        <SettingsGroup>
          <SettingRow
            label="Hide from file browser"
            description="Don't show ~$ temp files in the file list"
            htmlFor="sw-hide-temp-files"
          >
            <Switch
              id="sw-hide-temp-files"
              checked={hideSolidworksTempFiles}
              onChange={setHideSolidworksTempFiles}
            />
          </SettingRow>
          <SettingRow
            label="Ignore from sync"
            description="Skip ~$ files during check-in and sync operations"
            htmlFor="sw-ignore-temp-files"
          >
            <Switch
              id="sw-ignore-temp-files"
              checked={ignoreSolidworksTempFiles}
              onChange={setIgnoreSolidworksTempFiles}
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title={
          <span className="flex items-center gap-2">
            <span>Part & Assembly Revisions</span>
            <Badge tone="accent">Org-wide</Badge>
          </span>
        }
        description="Part (.sldprt) and assembly (.sldasm) revisions are typically controlled at the configuration level, driven by drawings. When disabled, file-level revision editing and workflow auto-increment are blocked for these file types."
      >
        <SettingsGroup>
          <SettingRow
            label="Allow file-level revisions on parts & assemblies"
            description={
              <>
                When off, revisions are controlled from drawings only
                {!isAdmin && (
                  <span className="block">
                    This is an organization-wide setting. Only admins can change it.
                  </span>
                )}
              </>
            }
            htmlFor="sw-allow-model-revision"
          >
            {isSavingRevisionPolicy ? (
              <Loader2 size={16} className="animate-spin text-plm-accent" />
            ) : (
              <Switch
                id="sw-allow-model-revision"
                checked={allowModelRevision}
                onChange={handleToggleModelRevision}
                disabled={!isAdmin || isSavingRevisionPolicy}
                title={!isAdmin ? 'Only admins can change org-wide settings' : undefined}
              />
            )}
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Drawing Metadata"
        description={
          <>
            Drawing files (.slddrw) typically inherit their metadata from the model they
            reference. When locked, these fields are read-only and show a{' '}
            <FileInput size={12} className="mx-0.5 inline" /> indicator.
          </>
        }
      >
        <SettingsGroup>
          <SettingRow
            label="Lock drawing revision"
            description="Revision comes from the drawing's revision table"
            htmlFor="sw-lock-drawing-revision"
          >
            <Switch
              id="sw-lock-drawing-revision"
              checked={lockDrawingRevision}
              onChange={setLockDrawingRevision}
            />
          </SettingRow>
          <SettingRow
            label="Lock drawing item number"
            description="Item number inherited from referenced model"
            htmlFor="sw-lock-drawing-item-number"
          >
            <Switch
              id="sw-lock-drawing-item-number"
              checked={lockDrawingItemNumber}
              onChange={setLockDrawingItemNumber}
            />
          </SettingRow>
          <SettingRow
            label="Lock drawing description"
            description="Description inherited from referenced model"
            htmlFor="sw-lock-drawing-description"
          >
            <Switch
              id="sw-lock-drawing-description"
              checked={lockDrawingDescription}
              onChange={setLockDrawingDescription}
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      {/* Version selection - only meaningful with several releases installed */}
      {swComInstalls.length > 1 && (
        <SettingsSection
          title={t('solidworksVersion.settingTitle')}
          description={t('solidworksVersion.settingHint')}
        >
          <SettingsGroup>
            <SettingRow
              label={t('solidworksVersion.settingLabel')}
              htmlFor="sw-version"
              description={
                <>
                  {t('solidworksVersion.settingDescription')}
                  <span className="block truncate font-mono">
                    {selectedInstall
                      ? selectedInstall.exePath || selectedInstall.progId
                      : t('solidworksVersion.automaticDescription')}
                  </span>
                </>
              }
            >
              <Select
                id="sw-version"
                value={solidworksProgId ?? ''}
                onChange={(e) => handleSelectSolidworksProgId(e.target.value || null)}
                className="min-w-[200px]"
              >
                <option value="">{t('solidworksVersion.automatic')}</option>
                {swComInstalls.map((install) => (
                  <option key={install.progId} value={install.progId}>
                    SOLIDWORKS {install.year}
                  </option>
                ))}
              </Select>
            </SettingRow>
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection
        title="SolidWorks Installation Path"
        description="Only needed if SolidWorks is installed in a non-default location."
      >
        <div className="flex gap-2">
          <TextInput
            type="text"
            value={solidworksPath || ''}
            onChange={(e) => setSolidworksPath(e.target.value || null)}
            placeholder="C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS"
            className="flex-1 font-mono"
            aria-label="SolidWorks Installation Path"
          />
          <Button
            icon={<FolderOpen size={14} />}
            onClick={async () => {
              const result = await window.electronAPI?.selectFolder()
              if (result?.success && result.folderPath) {
                setSolidworksPath(result.folderPath)
              }
            }}
          >
            Browse
          </Button>
        </div>
      </SettingsSection>
    </SettingsPage>
  )
}
