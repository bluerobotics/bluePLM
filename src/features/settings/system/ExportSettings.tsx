import { useState, useEffect, useMemo } from 'react'
import { Building2, Eye, Loader2, RotateCcw, User } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import {
  Button,
  SegmentedControl,
  Switch,
  TextInput,
  type SegmentedOption,
} from '@/components/core/ui'
import { useTranslation } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { hasDesktop } from '@/lib/platform'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import { ExportSettings as ExportSettingsType, DEFAULT_EXPORT_SETTINGS } from '@/types/pdm'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'
import { QuickExportFolderRow } from './QuickExportFolderRow'

// LocalStorage key for user preferences
const USER_EXPORT_SETTINGS_KEY = 'blueplm_export_settings'

// Available tokens for filename patterns
const FILENAME_TOKENS = [
  {
    token: '{filename}',
    label: 'File name',
    description: 'Original file name without extension',
    example: 'Part1',
  },
  {
    token: '{config}',
    label: 'Configuration',
    description: 'SolidWorks configuration name',
    example: 'Default',
  },
  {
    token: '{partNumber}',
    label: 'Part Number',
    description: 'Part/Item number from properties',
    example: 'BR-101011-394',
  },
  {
    token: '{number}',
    label: 'Number (alt)',
    description: 'Same as {partNumber}',
    example: 'BR-101011-394',
  },
  {
    token: '{tab}',
    label: 'Tab Number',
    description: 'Configuration tab number suffix',
    example: '394',
  },
  { token: '{tabNumber}', label: 'Tab (alt)', description: 'Same as {tab}', example: '394' },
  { token: '{revision}', label: 'Revision', description: 'Revision from properties', example: 'A' },
  { token: '{rev}', label: 'Rev (alt)', description: 'Same as {revision}', example: 'A' },
  {
    token: '{description}',
    label: 'Description',
    description: 'Description from properties',
    example: 'Thruster Housing',
  },
  {
    token: '{desc}',
    label: 'Desc (alt)',
    description: 'Same as {description}',
    example: 'Thruster Housing',
  },
  {
    token: '{date}',
    label: 'Date',
    description: 'Current date (YYYY-MM-DD)',
    example: '2026-01-01',
  },
  { token: '{time}', label: 'Time', description: 'Current time (HH-MM-SS)', example: '14-30-00' },
  {
    token: '{datetime}',
    label: 'Date & Time',
    description: 'Current date and time',
    example: '2026-01-01_14-30-00',
  },
]

// Preset patterns for quick selection
const PRESET_PATTERNS = [
  { pattern: '{filename}_{config}', label: 'File + Config', description: 'Part1_Default.step' },
  { pattern: '{partNumber}', label: 'Part Number Only', description: 'BR-101011-394.step' },
  {
    pattern: '{partNumber}_Rev{rev}',
    label: 'Part + Revision',
    description: 'BR-101011-394_RevA.step',
  },
  { pattern: '{partNumber}-{tab}', label: 'Part + Tab', description: 'BR-101011-394.step' },
  {
    pattern: '{partNumber}-{tab}_Rev{rev}',
    label: 'Part + Tab + Rev',
    description: 'BR-101011-394_RevA.step',
  },
  {
    pattern: '{partNumber}_{config}',
    label: 'Part + Config',
    description: 'BR-101011-394_Default.step',
  },
  {
    pattern: '{partNumber}_{config}_Rev{rev}',
    label: 'Part + Config + Rev',
    description: 'BR-101011-394_Default_RevA.step',
  },
  { pattern: '{filename}_{date}', label: 'File + Date', description: 'Part1_2026-01-01.step' },
]

// '' stands for a stored setting that has no value yet: no segment is selected.
type ExportFormatChoice = NonNullable<ExportSettingsType['default_export_format']> | ''
type StlResolutionChoice = NonNullable<ExportSettingsType['stl_resolution']> | ''

const EXPORT_FORMAT_OPTIONS: SegmentedOption<ExportFormatChoice>[] = [
  { value: 'step', label: 'STEP' },
  { value: 'iges', label: 'IGES' },
  { value: 'stl', label: 'STL' },
]

const STL_RESOLUTION_OPTIONS: SegmentedOption<StlResolutionChoice>[] = [
  { value: 'coarse', label: 'Coarse' },
  { value: 'fine', label: 'Fine' },
  { value: 'custom', label: 'Custom' },
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
  const { organization, addToast, getEffectiveRole, updateOrganization } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
      updateOrganization: s.updateOrganization,
    })),
  )
  const isAdmin = getEffectiveRole() === 'admin'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<ExportSettingsType>(DEFAULT_EXPORT_SETTINGS)
  const [hasUserOverride, setHasUserOverride] = useState(false)

  // Load settings - user override takes priority over org default
  useEffect(() => {
    if (!organization) return

    const userSettings = getUserExportSettings()
    if (userSettings) {
      setSettings(userSettings)
      setHasUserOverride(true)
    } else {
      const orgSettings = (organization.settings as any)?.export_settings // TODO: type this
      if (orgSettings) {
        setSettings({ ...DEFAULT_EXPORT_SETTINGS, ...orgSettings })
      } else {
        setSettings(DEFAULT_EXPORT_SETTINGS)
      }
      setHasUserOverride(false)
    }
    setLoading(false)
  }, [organization])

  // Get org default for comparison
  const orgDefault = useMemo(() => {
    const orgSettings = (organization?.settings as any)?.export_settings // TODO: type this
    return orgSettings ? { ...DEFAULT_EXPORT_SETTINGS, ...orgSettings } : DEFAULT_EXPORT_SETTINGS
  }, [organization?.settings])

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
    addToast('success', 'Saved as your personal preference')
  }

  // Reset to org default
  const handleResetToOrgDefault = () => {
    clearUserExportSettings()
    setSettings(orgDefault)
    setHasUserOverride(false)
    addToast('info', 'Reset to organization default')
  }

  // Save as org default (admin only)
  const handleSaveOrgDefault = async () => {
    if (!organization?.id || !isAdmin) return

    setSaving(true)
    try {
      // Get current settings and merge
      const currentSettings = organization.settings || {}
      const newSettings = {
        ...currentSettings,
        export_settings: settings,
      }

      const { error } = await (supabase.from('organization') as any) // TODO: type this
        .update({ settings: newSettings })
        .eq('id', organization.id)
        .select()

      if (error) {
        log.error('[ExportSettings]', 'Supabase error', { error })
        throw error
      }

      // Update local state
      updateOrganization({ settings: newSettings } as any) // TODO: type this
      addToast('success', 'Organization default saved')
    } catch (error) {
      log.error('[ExportSettings]', 'Failed to save org export settings', { error: error })
      addToast(
        'error',
        `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      <div className="py-12 text-center text-[14px] text-ui-fg-secondary">
        No organization selected
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-[14px] text-ui-fg-secondary">
        <Loader2 className="animate-spin" size={16} />
        <span>Loading export settings...</span>
      </div>
    )
  }

  return (
    <SettingsPage>
      <SettingsSection
        title="Export Settings"
        description={
          hasUserOverride
            ? 'Configure how exported files are named. Using your personal preference.'
            : 'Configure how exported files are named. Using the organization default.'
        }
        actions={
          <>
            {hasUserOverride && (
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw size={14} />}
                onClick={handleResetToOrgDefault}
                title="Reset to organization default"
              >
                Reset to Default
              </Button>
            )}
            {isAdmin && (
              <Button
                size="sm"
                icon={<Building2 size={14} />}
                loading={saving}
                onClick={handleSaveOrgDefault}
                title="Set as organization-wide default"
              >
                Save as Org Default
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              icon={<User size={14} />}
              onClick={handleSaveUserPreference}
            >
              Save for Me
            </Button>
          </>
        }
      >
        <SettingsGroup>
          <SettingRow
            label="Filename Pattern"
            htmlFor="export-filename-pattern"
            description={
              <>
                Use tokens like {'{partNumber}'}, {'{config}'}, {'{rev}'} to build dynamic filenames
              </>
            }
            stacked
          >
            <TextInput
              id="export-filename-pattern"
              value={settings.filename_pattern}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, filename_pattern: e.target.value }))
              }
              placeholder="{filename}_{config}"
              className="font-mono"
            />
            <div className="mt-2 flex items-center gap-2 text-[13px] text-ui-fg-secondary">
              <Eye size={14} />
              <span>Preview</span>
              <span className="truncate font-mono text-ui-fg">{livePreview}</span>
            </div>
          </SettingRow>

          <SettingRow label="Quick Presets" stacked>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_PATTERNS.map((preset) => (
                <button
                  type="button"
                  key={preset.pattern}
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, filename_pattern: preset.pattern }))
                  }
                  aria-pressed={settings.filename_pattern === preset.pattern}
                  className={`h-7 rounded-lg border px-2.5 text-[13px] text-ui-fg transition-colors ${
                    settings.filename_pattern === preset.pattern
                      ? 'border-ui-selected-border bg-ui-selected'
                      : 'border-ui-field-border bg-ui-field hover:bg-ui-hover'
                  }`}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Available Tokens (click to insert)" stacked>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
              {FILENAME_TOKENS.map(({ token, label, description, example }) => (
                <button
                  type="button"
                  key={token}
                  onClick={() => insertToken(token)}
                  className="flex flex-col items-start rounded-lg border border-ui-field-border bg-ui-field px-2.5 py-1.5 text-left transition-colors hover:bg-ui-hover"
                  title={`${description} (e.g., ${example})`}
                >
                  <span className="font-mono text-[13px] text-ui-fg">{token}</span>
                  <span className="w-full truncate text-[12px] text-ui-fg-secondary">{label}</span>
                </button>
              ))}
            </div>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Additional Options">
        <SettingsGroup>
          <SettingRow
            label="Include configuration name for single-config exports"
            description="When exporting a single configuration, add config name to filename"
          >
            <Switch
              checked={settings.include_config_in_filename}
              onChange={(checked) =>
                setSettings((prev) => ({ ...prev, include_config_in_filename: checked }))
              }
              aria-label="Include configuration name for single-config exports"
            />
          </SettingRow>
          <SettingRow
            label="Default Export Format"
            description="Default format when exporting from file browser context menu"
          >
            <SegmentedControl<ExportFormatChoice>
              value={settings.default_export_format ?? ''}
              onChange={(format) => {
                if (!format) return
                const next = format
                setSettings((prev) => ({ ...prev, default_export_format: next }))
              }}
              options={EXPORT_FORMAT_OPTIONS}
              aria-label="Default Export Format"
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="STL Export Options">
        <SettingsGroup>
          <SettingRow
            label="Resolution Quality"
            description={
              <>
                {settings.stl_resolution === 'coarse' &&
                  'Larger triangles, smaller file size. Good for visualization.'}
                {settings.stl_resolution === 'fine' &&
                  'Smaller triangles, better accuracy. Recommended for 3D printing.'}
                {settings.stl_resolution === 'custom' &&
                  'Specify custom deviation and angle tolerances.'}
              </>
            }
          >
            <SegmentedControl<StlResolutionChoice>
              value={settings.stl_resolution ?? ''}
              onChange={(res) => {
                if (!res) return
                const next = res
                setSettings((prev) => ({ ...prev, stl_resolution: next }))
              }}
              options={STL_RESOLUTION_OPTIONS}
              aria-label="Resolution Quality"
            />
          </SettingRow>

          {settings.stl_resolution === 'custom' && (
            <SettingRow
              label="Deviation (mm)"
              htmlFor="export-stl-deviation"
              description="Max distance between mesh and actual surface"
            >
              <TextInput
                id="export-stl-deviation"
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
                className="!w-28"
              />
            </SettingRow>
          )}
          {settings.stl_resolution === 'custom' && (
            <SettingRow
              label="Angle Tolerance (degrees)"
              htmlFor="export-stl-angle"
              description="Angular resolution for curved surfaces"
            >
              <TextInput
                id="export-stl-angle"
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
                className="!w-28"
              />
            </SettingRow>
          )}

          <SettingRow
            label="Binary STL format"
            description="Binary files are smaller and faster to write. Disable for ASCII format (human-readable)."
          >
            <Switch
              checked={settings.stl_binary_format ?? true}
              onChange={(checked) =>
                setSettings((prev) => ({ ...prev, stl_binary_format: checked }))
              }
              aria-label="Binary STL format"
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      {hasDesktop() && (
        <SettingsSection
          title={t('contextMenu.quickExport.sectionTitle')}
          description={t('contextMenu.quickExport.sectionDescription')}
        >
          <SettingsGroup>
            <QuickExportFolderRow />
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection title="Token Reference">
        <SettingsGroup>
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-ui-divider">
                <th className="pb-2 pr-4 pt-3 text-left text-[13px] font-normal text-ui-fg-secondary">
                  Token
                </th>
                <th className="pb-2 pr-4 pt-3 text-left text-[13px] font-normal text-ui-fg-secondary">
                  Description
                </th>
                <th className="pb-2 pt-3 text-left text-[13px] font-normal text-ui-fg-secondary">
                  Example
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ui-divider">
              {FILENAME_TOKENS.map(({ token, description, example }) => (
                <tr key={token}>
                  <td className="py-3 pr-4 font-mono text-ui-fg">{token}</td>
                  <td className="py-3 pr-4 text-ui-fg-secondary">{description}</td>
                  <td className="py-3 text-ui-fg">{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}
