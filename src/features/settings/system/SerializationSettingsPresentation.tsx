import type { Dispatch, SetStateAction } from 'react'
import {
  AlertTriangle,
  EyeOff,
  FileBox,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react'

import { Button, Callout, FIELD_CLASS, Select, Switch } from '@/components/core/ui'
import type { TranslationParams } from '@/lib/i18n'
import type { HighestSerialScanResult } from '@/lib/serialization'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'
import type { SerializationSettingsData } from './serializationSettingsModel'

// The controls the presentation test reads (fields and action buttons) stay native elements with
// the primitives' classes: the test walks the returned element tree without rendering components.
const INPUT = `${FIELD_CLASS} h-8 px-2.5`
const BUTTON = {
  base: 'inline-flex flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border h-7 px-2.5 text-[12px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-plm-accent/60 disabled:cursor-not-allowed disabled:opacity-50',
  primary: 'border-transparent bg-plm-accent text-white shadow-sm hover:bg-plm-accent-hover',
  secondary:
    'border-plm-border bg-plm-bg-light text-plm-fg hover:border-plm-border-light hover:bg-plm-highlight',
  ghost:
    'border-transparent bg-transparent text-plm-fg-dim hover:bg-plm-highlight hover:text-plm-fg',
} as const
const CODE = 'rounded bg-plm-bg px-2 py-1 font-mono text-[12px] text-plm-accent'

const EXAMPLE_PATTERNS = [
  { code: 'PN-00001', note: 'Prefix: "PN-", 5 digits' },
  { code: 'BR-AB00001', note: 'Prefix: "BR-", Letters: "AB"' },
  { code: '100001', note: 'No prefix, 6 digits' },
  { code: 'PN-00001-REV', note: 'With suffix: "-REV"' },
]

export interface SerializationSettingsBindings {
  organization: boolean
  loading: boolean
  isAdmin: boolean
  settings: SerializationSettingsData
  livePreview: string
  loadingPreview: boolean
  fetchPreview(): Promise<void>
  previewNumber: string | null
  updateSetting<K extends keyof SerializationSettingsData>(
    key: K,
    value: SerializationSettingsData[K],
  ): void
  detecting: boolean
  handleDetectHighest(): Promise<void>
  detectedResult: HighestSerialScanResult | null
  applyDetectedCounter(): void
  basePreview: string
  newKeepout: { start: string; end: string; description: string }
  setNewKeepout: Dispatch<SetStateAction<{ start: string; end: string; description: string }>>
  showKeepoutForm: boolean
  setShowKeepoutForm: Dispatch<SetStateAction<boolean>>
  addKeepoutZone(): void
  removeKeepoutZone(index: number): void
  customExtension: string
  setCustomExtension: Dispatch<SetStateAction<string>>
  toggleExtension(extension: string): void
  addCustomExtension(): void
  t(key: string, fallbackOrParams?: string | TranslationParams): string
  saving: boolean
  handleSave(): Promise<void>
}

// Common CAD file extensions for quick selection
const COMMON_EXTENSIONS = [
  { ext: '.sldprt', label: 'SolidWorks Part', icon: 'part' },
  { ext: '.sldasm', label: 'SolidWorks Assembly', icon: 'assembly' },
  { ext: '.slddrw', label: 'SolidWorks Drawing', icon: 'drawing' },
  { ext: '.step', label: 'STEP', icon: 'step' },
  { ext: '.stp', label: 'STP', icon: 'step' },
  { ext: '.iges', label: 'IGES', icon: 'step' },
  { ext: '.igs', label: 'IGS', icon: 'step' },
  { ext: '.prt', label: 'Creo/NX Part', icon: 'part' },
  { ext: '.asm', label: 'Creo Assembly', icon: 'assembly' },
  { ext: '.ipt', label: 'Inventor Part', icon: 'part' },
  { ext: '.iam', label: 'Inventor Assembly', icon: 'assembly' },
  { ext: '.catpart', label: 'CATIA Part', icon: 'part' },
  { ext: '.catproduct', label: 'CATIA Assembly', icon: 'assembly' },
]

export function SerializationSettingsPresentation({
  bindings,
}: {
  bindings: SerializationSettingsBindings
}) {
  const {
    organization,
    loading,
    isAdmin,
    settings,
    livePreview,
    loadingPreview,
    fetchPreview,
    previewNumber,
    updateSetting,
    detecting,
    handleDetectHighest,
    detectedResult,
    applyDetectedCounter,
    basePreview,
    newKeepout,
    setNewKeepout,
    showKeepoutForm,
    setShowKeepoutForm,
    addKeepoutZone,
    removeKeepoutZone,
    customExtension,
    setCustomExtension,
    toggleExtension,
    addCustomExtension,
    t,
    saving,
    handleSave,
  } = bindings

  if (!organization) {
    return <div className="text-center py-12 text-plm-fg-muted">No organization connected</div>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-plm-accent" size={24} />
      </div>
    )
  }

  const locked = !isAdmin || !settings.enabled
  const dimmed = !settings.enabled ? 'opacity-50' : ''

  return (
    <SettingsPage>
      {!isAdmin && (
        <Callout>
          Only administrators can modify serialization settings. You are viewing in read-only mode.
        </Callout>
      )}

      <SettingsSection
        title="Serial Number Settings"
        description="Configure how sequential item/part numbers are generated for your organization."
      >
        <SettingsGroup>
          <SettingRow
            label="Next Serial Number Preview"
            description={
              previewNumber ? (
                <>
                  Server preview: <span className="font-mono">{previewNumber}</span>
                </>
              ) : undefined
            }
          >
            <span className="font-mono text-[18px] font-semibold text-plm-accent">
              {livePreview}
            </span>
            <button
              type="button"
              onClick={fetchPreview}
              disabled={loadingPreview}
              className={`${BUTTON.base} ${BUTTON.ghost} !px-1.5`}
              title="Fetch from server"
              aria-label="Fetch from server"
            >
              {loadingPreview ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
          </SettingRow>
          <SettingRow
            label="Enable Auto-Serialization"
            description="Automatically generate sequential part numbers for new files"
          >
            <Switch
              checked={settings.enabled}
              onChange={() => isAdmin && updateSetting('enabled', !settings.enabled)}
              disabled={!isAdmin}
              aria-label="Enable Auto-Serialization"
            />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Auto-Apply File Types"
        description="Select which file types should automatically receive a serial number when created"
      >
        <SettingsGroup className={dimmed}>
          <div className="grid grid-cols-3 gap-2 p-4">
            {COMMON_EXTENSIONS.map(({ ext, label, icon }) => {
              const isSelected = (settings.auto_apply_extensions || []).includes(ext)
              return (
                <button
                  type="button"
                  key={ext}
                  onClick={() => isAdmin && settings.enabled && toggleExtension(ext)}
                  disabled={locked}
                  aria-pressed={isSelected}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'border-plm-accent bg-plm-accent/10 text-plm-fg'
                      : 'border-plm-border bg-plm-bg text-plm-fg-muted hover:border-plm-accent/50'
                  } ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  {icon === 'assembly' ? (
                    <Layers
                      size={16}
                      className={isSelected ? 'text-amber-400' : 'text-plm-fg-muted'}
                    />
                  ) : (
                    <FileBox
                      size={16}
                      className={isSelected ? 'text-plm-accent' : 'text-plm-fg-muted'}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[12px]">{ext}</div>
                    <div className="truncate text-[12px] text-plm-fg-muted">{label}</div>
                  </div>
                  {isSelected && (
                    <div className="h-2 w-2 flex-shrink-0 rounded-full bg-plm-accent" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="text-[12px] text-plm-fg-muted">Custom:</span>
            <input
              type="text"
              value={customExtension}
              onChange={(e) => setCustomExtension(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomExtension()}
              placeholder=".xyz"
              disabled={locked}
              className={`${INPUT} !w-24 font-mono`}
            />
            <button
              type="button"
              onClick={addCustomExtension}
              disabled={locked || !customExtension.trim()}
              className={`${BUTTON.base} ${BUTTON.secondary}`}
            >
              Add
            </button>
            <div className="ml-2 flex flex-1 flex-wrap gap-1">
              {(settings.auto_apply_extensions || [])
                .filter((ext) => !COMMON_EXTENSIONS.some((c) => c.ext === ext))
                .map((ext) => (
                  <span
                    key={ext}
                    className="inline-flex items-center gap-1 rounded bg-plm-accent/15 px-2 py-0.5 font-mono text-[12px] text-plm-accent"
                  >
                    {ext}
                    {isAdmin && settings.enabled && (
                      <button
                        type="button"
                        onClick={() => toggleExtension(ext)}
                        className="hover:text-plm-error"
                        aria-label={`Remove ${ext}`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                ))}
            </div>
          </div>

          {(settings.auto_apply_extensions || []).length > 0 && (
            <div className="px-4 py-3 text-[12px] text-plm-fg-muted">
              Auto-serialization enabled for:{' '}
              <span className="font-mono text-plm-fg">
                {(settings.auto_apply_extensions || []).join(', ')}
              </span>
            </div>
          )}
          {(settings.auto_apply_extensions || []).length === 0 && settings.enabled && (
            <div className="flex items-center gap-1.5 px-4 py-3 text-[12px] text-plm-warning">
              <AlertTriangle size={12} />
              No file types selected. Auto-serialization won't apply to any files.
            </div>
          )}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Number Format">
        <SettingsGroup className={dimmed}>
          <SettingRow label="Prefix" htmlFor="serial-prefix" description="Text before the number">
            <input
              id="serial-prefix"
              type="text"
              value={settings.prefix}
              onChange={(e) => updateSetting('prefix', e.target.value)}
              placeholder="PN-"
              disabled={locked}
              className={`${INPUT} !w-40 font-mono`}
            />
          </SettingRow>
          <SettingRow label="Suffix" htmlFor="serial-suffix" description="Text after the number">
            <input
              id="serial-suffix"
              type="text"
              value={settings.suffix}
              onChange={(e) => updateSetting('suffix', e.target.value)}
              placeholder="-A"
              disabled={locked}
              className={`${INPUT} !w-40 font-mono`}
            />
          </SettingRow>
          <SettingRow
            label="Letter Prefix"
            htmlFor="serial-letter-prefix"
            description="Letters between prefix and number (e.g., AB in PN-AB00001)"
          >
            <input
              id="serial-letter-prefix"
              type="text"
              value={settings.letter_prefix}
              onChange={(e) => updateSetting('letter_prefix', e.target.value.toUpperCase())}
              placeholder="AB"
              maxLength={4}
              disabled={locked}
              className={`${INPUT} !w-40 font-mono uppercase`}
            />
          </SettingRow>
          <SettingRow
            label="Number Padding"
            htmlFor="serial-padding"
            description="Zero-padding for the numeric part"
          >
            <Select
              id="serial-padding"
              value={settings.padding_digits}
              onChange={(e) => updateSetting('padding_digits', parseInt(e.target.value))}
              disabled={locked}
              className="w-40"
            >
              <option value={3}>3 digits (001)</option>
              <option value={4}>4 digits (0001)</option>
              <option value={5}>5 digits (00001)</option>
              <option value={6}>6 digits (000001)</option>
              <option value={7}>7 digits (0000001)</option>
              <option value={8}>8 digits (00000001)</option>
            </Select>
          </SettingRow>
          <SettingRow
            label="Current Counter Value"
            htmlFor="serial-counter"
            description={
              <>
                The next number generated will be this value + 1. Next number will be:{' '}
                <span className="font-mono font-medium text-plm-fg">
                  {settings.current_counter + 1}
                </span>
              </>
            }
          >
            <input
              id="serial-counter"
              type="number"
              value={settings.current_counter}
              onChange={(e) =>
                updateSetting('current_counter', Math.max(0, parseInt(e.target.value) || 0))
              }
              min="0"
              disabled={locked}
              className={`${INPUT} !w-32 font-mono`}
            />
          </SettingRow>
          {isAdmin && (
            <div className="flex items-center gap-1.5 px-4 py-2.5 text-[12px] text-plm-warning">
              <AlertTriangle size={12} />
              Changing this value can cause duplicate or skipped numbers. Use with caution.
            </div>
          )}

          {isAdmin && settings.enabled && (
            <SettingRow
              label="Detect Highest Used Number"
              description="Scan vault files to find the highest serial number in use"
            >
              <button
                type="button"
                onClick={handleDetectHighest}
                disabled={detecting}
                className={`${BUTTON.base} ${BUTTON.secondary}`}
              >
                {detecting ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                Scan Vault
              </button>
            </SettingRow>
          )}
          {isAdmin && settings.enabled && detectedResult && (
            <div className="px-4 py-3">
              <div className="text-[12px] text-plm-fg-muted">
                Scanned{' '}
                <span className="font-medium text-plm-fg">{detectedResult.totalScanned}</span> files
              </div>
              {detectedResult.skippedHidden > 0 && (
                <div className="mt-1 flex items-center gap-1 text-[12px] text-plm-fg-muted">
                  <EyeOff size={11} />
                  {t('hiddenFolders.scanSkipped', { count: detectedResult.skippedHidden })}
                </div>
              )}
              {detectedResult.highestCounter > 0 ? (
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <div className="text-[13px] text-plm-fg">
                      Highest found:{' '}
                      <span className="font-mono font-medium text-plm-accent">
                        {detectedResult.highestPartNumber}
                      </span>
                    </div>
                    <div className="text-[12px] text-plm-fg-muted">
                      Counter value: {detectedResult.highestCounter}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={applyDetectedCounter}
                    className={`${BUTTON.base} ${BUTTON.primary}`}
                  >
                    Apply
                  </button>
                </div>
              ) : (
                <div className="mt-1 text-[13px] text-plm-fg-muted">
                  No matching serial numbers found
                </div>
              )}
            </div>
          )}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Tab Numbers"
        description={
          <>
            Add variant suffixes to base numbers (e.g., BR101101
            <span className="text-plm-accent">-104</span>)
          </>
        }
        actions={
          <Switch
            checked={settings.tab_enabled}
            onChange={() =>
              isAdmin && settings.enabled && updateSetting('tab_enabled', !settings.tab_enabled)
            }
            disabled={locked}
            aria-label="Tab Numbers"
          />
        }
      >
        {settings.tab_enabled && (
          <SettingsGroup className={dimmed}>
            <SettingRow
              label="Tab Separator"
              htmlFor="serial-tab-separator"
              description={'Character(s) between base and tab (e.g., "-")'}
            >
              <input
                id="serial-tab-separator"
                type="text"
                value={settings.tab_separator}
                onChange={(e) => updateSetting('tab_separator', e.target.value)}
                placeholder="-"
                maxLength={3}
                disabled={locked}
                className={`${INPUT} !w-24 font-mono`}
              />
            </SettingRow>
            <SettingRow
              label="Tab Digits"
              htmlFor="serial-tab-digits"
              description="Zero-padding for the tab number"
            >
              <Select
                id="serial-tab-digits"
                value={settings.tab_padding_digits}
                onChange={(e) => updateSetting('tab_padding_digits', parseInt(e.target.value))}
                disabled={locked}
                className="w-40"
              >
                <option value={1}>1 digit (1-9)</option>
                <option value={2}>2 digits (01-99)</option>
                <option value={3}>3 digits (001-999)</option>
                <option value={4}>4 digits (0001-9999)</option>
              </Select>
            </SettingRow>
            <SettingRow label="Auto-pad with zeros" description={'"1" → "001" on blur'}>
              <Switch
                checked={settings.auto_pad_numbers}
                onChange={(checked) => updateSetting('auto_pad_numbers', checked)}
                disabled={locked}
                aria-label="Auto-pad with zeros"
              />
            </SettingRow>
            <SettingRow
              label="Tab required"
              description={settings.tab_required ? 'Tab must be specified' : 'Tab is optional'}
            >
              <Switch
                checked={settings.tab_required}
                onChange={(checked) => updateSetting('tab_required', checked)}
                disabled={locked}
                aria-label="Tab required"
              />
            </SettingRow>
            <div className="space-y-2 px-4 py-3">
              <div>
                <div className="mb-1 text-[12px] text-plm-fg-muted">Example with tab:</div>
                <div className="flex flex-wrap items-center gap-2">
                  {['1', '2', '3'].map((tab, index) => (
                    <span key={tab} className="flex items-center gap-2">
                      {index > 0 && <span className="text-[12px] text-plm-fg-muted">→</span>}
                      <code className={CODE}>
                        {basePreview}
                        {settings.tab_separator}
                        {tab.padStart(settings.tab_padding_digits, '0')}
                        {settings.suffix}
                      </code>
                    </span>
                  ))}
                </div>
              </div>
              {!settings.tab_required && (
                <div>
                  <div className="mb-1 text-[12px] text-plm-fg-muted">Base only (no tab):</div>
                  <code className={CODE}>
                    {basePreview}
                    {settings.suffix}
                  </code>
                </div>
              )}
            </div>
          </SettingsGroup>
        )}
      </SettingsSection>

      {settings.tab_enabled && (
        <SettingsSection title="Allowed Characters">
          <SettingsGroup className={dimmed}>
            <SettingRow label="Allow numbers (0-9)">
              <Switch
                checked={settings.tab_allow_numbers}
                onChange={(checked) => updateSetting('tab_allow_numbers', checked)}
                disabled={locked}
                aria-label="Allow numbers (0-9)"
              />
            </SettingRow>
            <SettingRow label="Allow letters (A-Z)">
              <Switch
                checked={settings.tab_allow_letters}
                onChange={(checked) => updateSetting('tab_allow_letters', checked)}
                disabled={locked}
                aria-label="Allow letters (A-Z)"
              />
            </SettingRow>
            <SettingRow label="Allow special characters">
              <Switch
                checked={settings.tab_allow_special}
                onChange={(checked) => updateSetting('tab_allow_special', checked)}
                disabled={locked}
                aria-label="Allow special characters"
              />
            </SettingRow>
            {settings.tab_allow_special && (
              <SettingRow label="Allowed special characters" htmlFor="serial-tab-special">
                <input
                  id="serial-tab-special"
                  type="text"
                  value={settings.tab_special_chars}
                  onChange={(e) => updateSetting('tab_special_chars', e.target.value)}
                  placeholder="-_"
                  maxLength={10}
                  disabled={locked}
                  className={`${INPUT} !w-32 font-mono`}
                />
              </SettingRow>
            )}
            {!settings.tab_allow_numbers &&
              !settings.tab_allow_letters &&
              !settings.tab_allow_special && (
                <div className="flex items-center gap-1.5 px-4 py-2.5 text-[12px] text-plm-warning">
                  <AlertTriangle size={12} />
                  No characters allowed. Tab input will be disabled.
                </div>
              )}
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection
        title="Keepout Zones"
        description="Reserved number ranges that will be skipped during auto-generation"
        actions={
          isAdmin &&
          settings.enabled && (
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowKeepoutForm(true)}>
              Add Zone
            </Button>
          )
        }
      >
        <SettingsGroup className={dimmed}>
          {showKeepoutForm && (
            <div className="grid grid-cols-4 gap-3 px-4 py-3">
              <div>
                <label className="mb-1 block text-[12px] text-plm-fg-muted">Start</label>
                <input
                  type="number"
                  value={newKeepout.start}
                  onChange={(e) => setNewKeepout((prev) => ({ ...prev, start: e.target.value }))}
                  placeholder="1000"
                  min="0"
                  className={`${INPUT} font-mono`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-plm-fg-muted">End</label>
                <input
                  type="number"
                  value={newKeepout.end}
                  onChange={(e) => setNewKeepout((prev) => ({ ...prev, end: e.target.value }))}
                  placeholder="1999"
                  min="0"
                  className={`${INPUT} font-mono`}
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-[12px] text-plm-fg-muted">Description</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKeepout.description}
                    onChange={(e) =>
                      setNewKeepout((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Legacy part numbers"
                    className={`${INPUT} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={addKeepoutZone}
                    className={`${BUTTON.base} ${BUTTON.primary} !h-8`}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowKeepoutForm(false)
                      setNewKeepout({ start: '', end: '', description: '' })
                    }}
                    className={`${BUTTON.base} ${BUTTON.ghost} !h-8 !px-2`}
                    aria-label="Cancel"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {settings.keepout_zones.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-plm-fg-muted">
              No keepout zones defined. All numbers will be available for assignment.
            </div>
          ) : (
            settings.keepout_zones.map((zone, index) => (
              <div key={index} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="font-mono text-[13px]">
                    <span className="text-plm-warning">{zone.start.toLocaleString()}</span>
                    <span className="mx-2 text-plm-fg-muted">→</span>
                    <span className="text-plm-warning">{zone.end_num.toLocaleString()}</span>
                  </div>
                  <span className="truncate text-[13px] text-plm-fg-muted">{zone.description}</span>
                  <span className="text-[12px] text-plm-fg-muted">
                    ({(zone.end_num - zone.start + 1).toLocaleString()} numbers)
                  </span>
                </div>
                {isAdmin && settings.enabled && (
                  <button
                    type="button"
                    onClick={() => removeKeepoutZone(index)}
                    className={`${BUTTON.base} ${BUTTON.ghost} !px-1.5 hover:!text-plm-error`}
                    title="Remove zone"
                    aria-label="Remove zone"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Example Patterns">
        <SettingsGroup>
          <div className="grid grid-cols-2 gap-3 p-4 text-[13px]">
            {EXAMPLE_PATTERNS.map(({ code, note }) => (
              <div key={code} className="flex items-center gap-2">
                <code className={CODE}>{code}</code>
                <span className="text-plm-fg-muted">{note}</span>
              </div>
            ))}
          </div>
        </SettingsGroup>
      </SettingsSection>

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`${BUTTON.base} ${BUTTON.primary} !h-8 !px-3.5 !text-[13px]`}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Settings
          </button>
        </div>
      )}
    </SettingsPage>
  )
}
