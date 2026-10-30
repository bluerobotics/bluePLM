import { Check, ExternalLink, FolderOpen } from 'lucide-react'

import { Badge, Button, Callout, Switch, TextInput } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'

import { useSolidWorksSettings } from '../hooks'

export function TemplatesTab() {
  const {
    isAdmin,
    vaultPath,
    addToast,
    orgTemplates,
    templateDocuments,
    setTemplateDocuments,
    templateSheetFormats,
    setTemplateSheetFormats,
    templateBom,
    setTemplateBom,
    templateCustomProperty,
    setTemplateCustomProperty,
    promptForTemplate,
    setPromptForTemplate,
    isSavingTemplates,
    isPushingTemplates,
    isApplyingTemplates,
    installedSwVersions,
    hasUnsavedTemplates,
    handleSaveTemplates,
    handlePushTemplates,
    handleApplyTemplates,
  } = useSolidWorksSettings()

  const handleBrowseForFolder = async (setter: (value: string) => void) => {
    const result = await window.electronAPI?.selectFolder()
    if (result?.success && result.folderPath && vaultPath) {
      // Convert to relative path if within vault
      const normalizedVault = vaultPath.replace(/\\/g, '/').toLowerCase()
      const normalizedFolder = result.folderPath.replace(/\\/g, '/').toLowerCase()
      if (normalizedFolder.startsWith(normalizedVault)) {
        const relative = result.folderPath.substring(vaultPath.length + 1)
        setter(relative)
      } else {
        addToast('warning', 'Please select a folder within the vault')
      }
    }
  }

  const folderRows: {
    label: string
    description: string
    placeholder: string
    value: string
    setter: (value: string) => void
  }[] = [
    {
      label: 'Document Templates',
      description: 'Part, assembly, and drawing templates for new documents',
      placeholder: '_templates/Documents',
      value: templateDocuments,
      setter: setTemplateDocuments,
    },
    {
      label: 'Sheet Formats',
      description: 'Drawing title blocks, borders, and sheet formats',
      placeholder: '_templates/SheetFormats',
      value: templateSheetFormats,
      setter: setTemplateSheetFormats,
    },
    {
      label: 'BOM Templates',
      description: 'Bill of materials table templates',
      placeholder: '_templates/BOM',
      value: templateBom,
      setter: setTemplateBom,
    },
    {
      label: 'Custom Property Files',
      description: 'Custom property tab builder templates',
      placeholder: '_templates/CustomProperties',
      value: templateCustomProperty,
      setter: setTemplateCustomProperty,
    },
  ]

  const nothingToApply =
    !templateDocuments &&
    !templateSheetFormats &&
    !templateBom &&
    !templateCustomProperty &&
    !promptForTemplate

  return (
    <SettingsPage>
      <SettingsSection
        title={
          <span className="flex items-center gap-2">
            <span>Template Folders</span>
            {isAdmin && <Badge>Organization-wide</Badge>}
          </span>
        }
        description={
          <>
            Configure SOLIDWORKS template folder locations within the vault. When applied,
            SOLIDWORKS will use these folders for new documents.
            {installedSwVersions.length > 0 ? (
              <span className="block">
                Detected SOLIDWORKS versions:{' '}
                <span className="text-plm-fg">{installedSwVersions.join(', ')}</span>
              </span>
            ) : (
              <span className="block text-plm-warning">
                No SOLIDWORKS 2020+ installations detected on this computer
              </span>
            )}
          </>
        }
        actions={
          isAdmin ? (
            <>
              {hasUnsavedTemplates && <Badge tone="warning">Unsaved changes</Badge>}
              <Button
                size="sm"
                onClick={handleSaveTemplates}
                disabled={!hasUnsavedTemplates}
                loading={isSavingTemplates}
                icon={<Check size={14} />}
              >
                Save Org Defaults
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handlePushTemplates}
                disabled={
                  !hasUnsavedTemplates &&
                  !orgTemplates?.documentTemplates &&
                  !orgTemplates?.sheetFormats &&
                  !orgTemplates?.bomTemplates &&
                  !orgTemplates?.customPropertyFolders
                }
                loading={isPushingTemplates}
                icon={<ExternalLink size={14} />}
              >
                Push to All Users
              </Button>
            </>
          ) : undefined
        }
      >
        <SettingsGroup>
          {folderRows.map((row) => {
            const id = `sw-template-${row.label.toLowerCase().replace(/\s+/g, '-')}`
            return (
              <SettingRow
                key={row.label}
                label={row.label}
                description={row.description}
                htmlFor={id}
                stacked
              >
                <div className="flex gap-2">
                  <TextInput
                    id={id}
                    type="text"
                    value={row.value}
                    onChange={(e) => row.setter(e.target.value)}
                    placeholder={row.placeholder}
                    disabled={!isAdmin}
                    className="flex-1 font-mono"
                  />
                  {isAdmin && (
                    <Button
                      icon={<FolderOpen size={14} />}
                      onClick={() => handleBrowseForFolder(row.setter)}
                    >
                      Browse
                    </Button>
                  )}
                </div>
              </SettingRow>
            )
          })}

          <SettingRow
            label="Prompt user to select document template"
            description="When enabled, SOLIDWORKS will show the template picker dialog when creating new documents"
            htmlFor="sw-prompt-template"
          >
            <Switch
              id="sw-prompt-template"
              checked={promptForTemplate}
              onChange={(next) => isAdmin && setPromptForTemplate(next)}
              disabled={!isAdmin}
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection>
        <SettingsGroup>
          {/* User Actions (Apply to local SOLIDWORKS) */}
          <SettingRow
            label="Apply to SOLIDWORKS"
            description={
              orgTemplates?.lastPushedAt ? (
                <>
                  Set these folders in your local SOLIDWORKS installation
                  <span className="block">
                    Last pushed: {new Date(orgTemplates.lastPushedAt).toLocaleString()}
                  </span>
                </>
              ) : (
                'Set these folders in your local SOLIDWORKS installation'
              )
            }
          >
            <Button
              variant="primary"
              onClick={handleApplyTemplates}
              disabled={nothingToApply}
              loading={isApplyingTemplates}
              icon={<Check size={14} />}
            >
              {isApplyingTemplates ? 'Applying...' : 'Apply to SOLIDWORKS'}
            </Button>
          </SettingRow>
        </SettingsGroup>

        {!vaultPath && (
          <Callout tone="warning">Select a vault to apply template settings</Callout>
        )}
      </SettingsSection>
    </SettingsPage>
  )
}
