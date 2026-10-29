import {
  Loader2,
  Hash,
  Save,
  Plus,
  X,
  AlertTriangle,
  RefreshCw,
  Info,
  FileBox,
  Layers,
  Search,
  SplitSquareHorizontal,
  EyeOff,
} from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { TranslationParams } from '@/lib/i18n'
import type { HighestSerialScanResult } from '@/lib/serialization'
import type { SerializationSettingsData } from './serializationSettingsModel'

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
    return (
      <div className="text-center py-12 text-plm-fg-muted">{t('settingsPages.noOrganization')}</div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-plm-accent" size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-plm-fg flex items-center gap-2">
          <Hash className="text-plm-accent" size={20} />
          {t('settingsPages.serialization.title')}
        </h2>
        <p className="text-sm text-plm-fg-muted mt-1">
          {t('settingsPages.serialization.description')}
        </p>
      </div>

      {/* Read-only notice for non-admins */}
      {!isAdmin && (
        <div className="p-3 bg-plm-highlight rounded-lg border border-plm-border text-sm text-plm-fg-muted">
          {t('settingsPages.serialization.readOnly')}
        </div>
      )}

      {/* Live Preview Card */}
      <div className="p-4 bg-gradient-to-br from-plm-accent/10 to-plm-accent/5 rounded-lg border border-plm-accent/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-plm-fg-muted uppercase tracking-wider mb-1">
              {t('settingsPages.serialization.nextPreview')}
            </div>
            <div className="text-2xl font-mono font-bold text-plm-accent">{livePreview}</div>
          </div>
          <button
            onClick={fetchPreview}
            disabled={loadingPreview}
            className="p-2 rounded-lg hover:bg-plm-highlight text-plm-fg-muted hover:text-plm-fg transition-colors"
            title={t('settingsPages.serialization.fetchPreview')}
          >
            {loadingPreview ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
          </button>
        </div>
        {previewNumber && (
          <div className="text-xs text-plm-fg-muted mt-2">
            {t('settingsPages.serialization.serverPreview')}{' '}
            <span className="font-mono">{previewNumber}</span>
          </div>
        )}
      </div>

      {/* Enable/Disable Toggle */}
      <div className="p-4 bg-plm-bg rounded-lg border border-plm-border">
        <label
          className={`flex items-center justify-between ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed'}`}
        >
          <div>
            <span className="text-sm font-medium text-plm-fg">
              {t('settingsPages.serialization.enable')}
            </span>
            <p className="text-xs text-plm-fg-muted mt-0.5">
              {t('settingsPages.serialization.enableHelp')}
            </p>
          </div>
          <button
            onClick={() => isAdmin && updateSetting('enabled', !settings.enabled)}
            disabled={!isAdmin}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.enabled ? 'bg-plm-accent' : 'bg-plm-border'
            } ${!isAdmin ? 'opacity-60' : ''}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                settings.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      </div>

      {/* File Types for Auto-Serialization */}
      <div
        className={`p-4 bg-plm-bg rounded-lg border border-plm-border ${!settings.enabled ? 'opacity-50' : ''}`}
      >
        <div className="mb-4">
          <h3 className="text-base font-medium text-plm-fg">
            {t('settingsPages.serialization.fileTypes')}
          </h3>
          <p className="text-xs text-plm-fg-muted mt-0.5">
            {t('settingsPages.serialization.fileTypesHelp')}
          </p>
        </div>

        {/* Common CAD extensions grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {COMMON_EXTENSIONS.map(({ ext, label, icon }) => {
            const isSelected = (settings.auto_apply_extensions || []).includes(ext)
            return (
              <button
                key={ext}
                onClick={() => isAdmin && settings.enabled && toggleExtension(ext)}
                disabled={!isAdmin || !settings.enabled}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-colors ${
                  isSelected
                    ? 'bg-plm-accent/20 border-plm-accent text-plm-fg'
                    : 'bg-plm-highlight border-plm-border text-plm-fg-muted hover:border-plm-accent/50'
                } ${!isAdmin || !settings.enabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {icon === 'part' && (
                  <FileBox
                    size={16}
                    className={isSelected ? 'text-plm-accent' : 'text-plm-fg-muted'}
                  />
                )}
                {icon === 'assembly' && (
                  <Layers
                    size={16}
                    className={isSelected ? 'text-amber-400' : 'text-plm-fg-muted'}
                  />
                )}
                {(icon === 'drawing' || icon === 'step') && (
                  <FileBox
                    size={16}
                    className={isSelected ? 'text-plm-accent' : 'text-plm-fg-muted'}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs">{ext}</div>
                  <div className="text-xs text-plm-fg-muted truncate">{label}</div>
                </div>
                {isSelected && <div className="w-2 h-2 rounded-full bg-plm-accent flex-shrink-0" />}
              </button>
            )
          })}
        </div>

        {/* Custom extension input */}
        <div className="flex items-center gap-2 pt-3 border-t border-plm-border">
          <span className="text-sm text-plm-fg-muted">
            {t('settingsPages.serialization.custom')}
          </span>
          <input
            type="text"
            value={customExtension}
            onChange={(e) => setCustomExtension(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomExtension()}
            placeholder=".xyz"
            disabled={!isAdmin || !settings.enabled}
            className="w-24 px-2 py-1 bg-plm-input border border-plm-border rounded text-sm text-plm-fg font-mono placeholder:text-plm-fg-muted/50 focus:outline-none focus:border-plm-accent disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            onClick={addCustomExtension}
            disabled={!isAdmin || !settings.enabled || !customExtension.trim()}
            className="px-2 py-1 text-sm bg-plm-highlight hover:bg-plm-highlight/80 text-plm-fg rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('settingsPages.serialization.add')}
          </button>

          {/* Show selected extensions not in common list */}
          <div className="flex-1 flex flex-wrap gap-1 ml-2">
            {(settings.auto_apply_extensions || [])
              .filter((ext) => !COMMON_EXTENSIONS.some((c) => c.ext === ext))
              .map((ext) => (
                <span
                  key={ext}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-plm-accent/20 text-plm-accent rounded text-xs font-mono"
                >
                  {ext}
                  {isAdmin && settings.enabled && (
                    <button onClick={() => toggleExtension(ext)} className="hover:text-plm-error">
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
          </div>
        </div>

        {/* Summary */}
        {(settings.auto_apply_extensions || []).length > 0 && (
          <div className="mt-3 text-xs text-plm-fg-muted">
            {t('settingsPages.serialization.enabledFor')}{' '}
            <span className="font-mono text-plm-fg">
              {(settings.auto_apply_extensions || []).join(', ')}
            </span>
          </div>
        )}
        {(settings.auto_apply_extensions || []).length === 0 && settings.enabled && (
          <div className="mt-3 text-xs text-plm-warning flex items-center gap-1">
            <AlertTriangle size={12} />
            {t('settingsPages.serialization.noFileTypes')}
          </div>
        )}
      </div>

      {/* Format Settings */}
      <div
        className={`p-4 bg-plm-bg rounded-lg border border-plm-border ${!settings.enabled ? 'opacity-50' : ''}`}
      >
        <h3 className="text-base font-medium text-plm-fg mb-4">
          {t('settingsPages.serialization.numberFormat')}
        </h3>

        <div className="grid grid-cols-2 gap-4">
          {/* Prefix */}
          <div>
            <label className="text-sm text-plm-fg-muted block mb-1">
              {t('settingsPages.serialization.prefix')}
            </label>
            <input
              type="text"
              value={settings.prefix}
              onChange={(e) => updateSetting('prefix', e.target.value)}
              placeholder="PN-"
              disabled={!isAdmin || !settings.enabled}
              className="w-full px-3 py-2 bg-plm-input border border-plm-border rounded text-sm text-plm-fg placeholder:text-plm-fg-muted/50 focus:outline-none focus:border-plm-accent disabled:opacity-60 disabled:cursor-not-allowed font-mono"
            />
            <p className="text-xs text-plm-fg-muted mt-1">
              {t('settingsPages.serialization.prefixHelp')}
            </p>
          </div>

          {/* Suffix */}
          <div>
            <label className="text-sm text-plm-fg-muted block mb-1">
              {t('settingsPages.serialization.suffix')}
            </label>
            <input
              type="text"
              value={settings.suffix}
              onChange={(e) => updateSetting('suffix', e.target.value)}
              placeholder="-A"
              disabled={!isAdmin || !settings.enabled}
              className="w-full px-3 py-2 bg-plm-input border border-plm-border rounded text-sm text-plm-fg placeholder:text-plm-fg-muted/50 focus:outline-none focus:border-plm-accent disabled:opacity-60 disabled:cursor-not-allowed font-mono"
            />
            <p className="text-xs text-plm-fg-muted mt-1">
              {t('settingsPages.serialization.suffixHelp')}
            </p>
          </div>

          {/* Letter Prefix */}
          <div>
            <label className="text-sm text-plm-fg-muted block mb-1">
              {t('settingsPages.serialization.letterPrefix')}
            </label>
            <input
              type="text"
              value={settings.letter_prefix}
              onChange={(e) => updateSetting('letter_prefix', e.target.value.toUpperCase())}
              placeholder="AB"
              maxLength={4}
              disabled={!isAdmin || !settings.enabled}
              className="w-full px-3 py-2 bg-plm-input border border-plm-border rounded text-sm text-plm-fg placeholder:text-plm-fg-muted/50 focus:outline-none focus:border-plm-accent disabled:opacity-60 disabled:cursor-not-allowed font-mono uppercase"
            />
            <p className="text-xs text-plm-fg-muted mt-1">
              {t('settingsPages.serialization.letterPrefixHelp')}
            </p>
          </div>

          {/* Number of Digits */}
          <div>
            <label className="text-sm text-plm-fg-muted block mb-1">
              {t('settingsPages.serialization.numberPadding')}
            </label>
            <select
              value={settings.padding_digits}
              onChange={(e) => updateSetting('padding_digits', parseInt(e.target.value))}
              disabled={!isAdmin || !settings.enabled}
              className="w-full px-3 py-2 bg-plm-input border border-plm-border rounded text-sm text-plm-fg focus:outline-none focus:border-plm-accent disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value={3}>
                {t('settingsPages.serialization.digitsOption', { digits: 3, sample: '001' })}
              </option>
              <option value={4}>
                {t('settingsPages.serialization.digitsOption', { digits: 4, sample: '0001' })}
              </option>
              <option value={5}>
                {t('settingsPages.serialization.digitsOption', { digits: 5, sample: '00001' })}
              </option>
              <option value={6}>
                {t('settingsPages.serialization.digitsOption', { digits: 6, sample: '000001' })}
              </option>
              <option value={7}>
                {t('settingsPages.serialization.digitsOption', { digits: 7, sample: '0000001' })}
              </option>
              <option value={8}>
                {t('settingsPages.serialization.digitsOption', { digits: 8, sample: '00000001' })}
              </option>
            </select>
            <p className="text-xs text-plm-fg-muted mt-1">
              {t('settingsPages.serialization.numberPaddingHelp')}
            </p>
          </div>
        </div>

        {/* Current Counter */}
        <div className="mt-4 pt-4 border-t border-plm-border">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm text-plm-fg-muted">
              {t('settingsPages.serialization.currentCounter')}
            </label>
            <div className="group relative">
              <Info size={14} className="text-plm-fg-muted/50" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-plm-bg-elevated border border-plm-border rounded text-xs text-plm-fg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {t('settingsPages.serialization.currentCounterHelp')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={settings.current_counter}
              onChange={(e) =>
                updateSetting('current_counter', Math.max(0, parseInt(e.target.value) || 0))
              }
              min="0"
              disabled={!isAdmin || !settings.enabled}
              className="w-32 px-3 py-2 bg-plm-input border border-plm-border rounded text-sm text-plm-fg focus:outline-none focus:border-plm-accent disabled:opacity-60 disabled:cursor-not-allowed font-mono"
            />
            <span className="text-sm text-plm-fg-muted">
              {t('settingsPages.serialization.nextNumber')}{' '}
              <span className="font-mono font-medium text-plm-fg">
                {settings.current_counter + 1}
              </span>
            </span>
          </div>
          {isAdmin && (
            <p className="text-xs text-plm-warning mt-2 flex items-center gap-1">
              <AlertTriangle size={12} />
              {t('settingsPages.serialization.counterWarning')}
            </p>
          )}

          {/* Detect Highest Serial Number */}
          {isAdmin && settings.enabled && (
            <div className="mt-4 p-3 bg-plm-highlight/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-plm-fg font-medium">
                    {t('settingsPages.serialization.detectHighest')}
                  </div>
                  <div className="text-xs text-plm-fg-muted mt-0.5">
                    {t('settingsPages.serialization.detectHighestHelp')}
                  </div>
                </div>
                <button
                  onClick={handleDetectHighest}
                  disabled={detecting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-plm-bg hover:bg-plm-bg-light border border-plm-border text-plm-fg rounded-lg transition-colors disabled:opacity-50"
                >
                  {detecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Search size={14} />
                  )}
                  {t('settingsPages.serialization.scanVault')}
                </button>
              </div>

              {detectedResult && (
                <div className="mt-3 p-2 bg-plm-bg rounded border border-plm-border">
                  <div className="text-xs text-plm-fg-muted">
                    {
                      t('settingsPages.serialization.scannedFiles', { count: '__COUNT__' }).split(
                        '__COUNT__',
                      )[0]
                    }
                    <span className="font-medium text-plm-fg">{detectedResult.totalScanned}</span>
                    {
                      t('settingsPages.serialization.scannedFiles', { count: '__COUNT__' }).split(
                        '__COUNT__',
                      )[1]
                    }
                  </div>
                  {detectedResult.skippedHidden > 0 && (
                    <div className="text-xs text-plm-fg-muted mt-1 flex items-center gap-1">
                      <EyeOff size={11} />
                      {t('hiddenFolders.scanSkipped', { count: detectedResult.skippedHidden })}
                    </div>
                  )}
                  {detectedResult.highestCounter > 0 ? (
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <div className="text-sm text-plm-fg">
                          {t('settingsPages.serialization.highestFound')}{' '}
                          <span className="font-mono font-medium text-plm-accent">
                            {detectedResult.highestPartNumber}
                          </span>
                        </div>
                        <div className="text-xs text-plm-fg-muted">
                          {t('settingsPages.serialization.counterValue', {
                            counter: detectedResult.highestCounter,
                          })}
                        </div>
                      </div>
                      <button
                        onClick={applyDetectedCounter}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-plm-accent hover:bg-plm-accent-hover text-white rounded transition-colors"
                      >
                        {t('settingsPages.serialization.apply')}
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-plm-fg-muted mt-1">
                      {t('settingsPages.serialization.noMatches')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tab Number Settings */}
      <div
        className={`p-4 bg-plm-bg rounded-lg border border-plm-border ${!settings.enabled ? 'opacity-50' : ''}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SplitSquareHorizontal size={18} className="text-plm-accent" />
            <div>
              <h3 className="text-base font-medium text-plm-fg">
                {t('settingsPages.serialization.tabNumbers')}
              </h3>
              <p className="text-xs text-plm-fg-muted mt-0.5">
                {t('settingsPages.serialization.tabNumbersHelp').split('-104')[0]}
                <span className="text-plm-accent">-104</span>
                {t('settingsPages.serialization.tabNumbersHelp').split('-104')[1]}
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              isAdmin && settings.enabled && updateSetting('tab_enabled', !settings.tab_enabled)
            }
            disabled={!isAdmin || !settings.enabled}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.tab_enabled ? 'bg-plm-accent' : 'bg-plm-border'
            } ${!isAdmin || !settings.enabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                settings.tab_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {settings.tab_enabled && (
          <div className="grid grid-cols-2 gap-4">
            {/* Tab Separator */}
            <div>
              <label className="text-sm text-plm-fg-muted block mb-1">
                {t('settingsPages.serialization.tabSeparator')}
              </label>
              <input
                type="text"
                value={settings.tab_separator}
                onChange={(e) => updateSetting('tab_separator', e.target.value)}
                placeholder="-"
                maxLength={3}
                disabled={!isAdmin || !settings.enabled}
                className="w-full px-3 py-2 bg-plm-input border border-plm-border rounded text-sm text-plm-fg placeholder:text-plm-fg-muted/50 focus:outline-none focus:border-plm-accent disabled:opacity-60 disabled:cursor-not-allowed font-mono"
              />
              <p className="text-xs text-plm-fg-muted mt-1">
                {t('settingsPages.serialization.tabSeparatorHelp')}
              </p>
            </div>

            {/* Tab Digits */}
            <div>
              <label className="text-sm text-plm-fg-muted block mb-1">
                {t('settingsPages.serialization.tabDigits')}
              </label>
              <select
                value={settings.tab_padding_digits}
                onChange={(e) => updateSetting('tab_padding_digits', parseInt(e.target.value))}
                disabled={!isAdmin || !settings.enabled}
                className="w-full px-3 py-2 bg-plm-input border border-plm-border rounded text-sm text-plm-fg focus:outline-none focus:border-plm-accent disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value={1}>
                  {t('settingsPages.serialization.tabDigitsOptionOne', {
                    digits: 1,
                    first: '1',
                    last: '9',
                  })}
                </option>
                <option value={2}>
                  {t('settingsPages.serialization.tabDigitsOption', {
                    digits: 2,
                    first: '01',
                    last: '99',
                  })}
                </option>
                <option value={3}>
                  {t('settingsPages.serialization.tabDigitsOption', {
                    digits: 3,
                    first: '001',
                    last: '999',
                  })}
                </option>
                <option value={4}>
                  {t('settingsPages.serialization.tabDigitsOption', {
                    digits: 4,
                    first: '0001',
                    last: '9999',
                  })}
                </option>
              </select>
              <p className="text-xs text-plm-fg-muted mt-1">
                {t('settingsPages.serialization.tabDigitsHelp')}
              </p>
            </div>

            {/* Auto-pad Numbers */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.auto_pad_numbers}
                  onChange={(e) => updateSetting('auto_pad_numbers', e.target.checked)}
                  disabled={!isAdmin || !settings.enabled}
                  className="rounded border-plm-border text-plm-accent focus:ring-plm-accent disabled:opacity-60"
                />
                <span className="text-sm text-plm-fg">
                  {t('settingsPages.serialization.autoPad')}
                </span>
              </label>
              <p className="text-xs text-plm-fg-muted mt-1 ml-6">
                {t('settingsPages.serialization.autoPadHelp')}
              </p>
            </div>

            {/* Tab Required */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.tab_required}
                  onChange={(e) => updateSetting('tab_required', e.target.checked)}
                  disabled={!isAdmin || !settings.enabled}
                  className="rounded border-plm-border text-plm-accent focus:ring-plm-accent disabled:opacity-60"
                />
                <span className="text-sm text-plm-fg">
                  {t('settingsPages.serialization.tabRequired')}
                </span>
              </label>
              <p className="text-xs text-plm-fg-muted mt-1 ml-6">
                {settings.tab_required
                  ? t('settingsPages.serialization.tabRequiredHelp')
                  : t('settingsPages.serialization.tabOptionalHelp')}
              </p>
            </div>
          </div>
        )}

        {/* Tab Character Settings */}
        {settings.tab_enabled && (
          <div className="mt-4 pt-4 border-t border-plm-border">
            <h4 className="text-sm font-medium text-plm-fg mb-3">
              {t('settingsPages.serialization.allowedCharacters')}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {/* Allow Numbers */}
              <div>
                <label
                  className={`flex items-center gap-2 ${isAdmin && settings.enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <input
                    type="checkbox"
                    checked={settings.tab_allow_numbers}
                    onChange={(e) => updateSetting('tab_allow_numbers', e.target.checked)}
                    disabled={!isAdmin || !settings.enabled}
                    className="rounded border-plm-border text-plm-accent focus:ring-plm-accent disabled:opacity-60"
                  />
                  <span className="text-sm text-plm-fg">
                    {t('settingsPages.serialization.allowNumbers')}
                  </span>
                </label>
              </div>

              {/* Allow Letters */}
              <div>
                <label
                  className={`flex items-center gap-2 ${isAdmin && settings.enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <input
                    type="checkbox"
                    checked={settings.tab_allow_letters}
                    onChange={(e) => updateSetting('tab_allow_letters', e.target.checked)}
                    disabled={!isAdmin || !settings.enabled}
                    className="rounded border-plm-border text-plm-accent focus:ring-plm-accent disabled:opacity-60"
                  />
                  <span className="text-sm text-plm-fg">
                    {t('settingsPages.serialization.allowLetters')}
                  </span>
                </label>
              </div>

              {/* Allow Special Characters */}
              <div>
                <label
                  className={`flex items-center gap-2 ${isAdmin && settings.enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <input
                    type="checkbox"
                    checked={settings.tab_allow_special}
                    onChange={(e) => updateSetting('tab_allow_special', e.target.checked)}
                    disabled={!isAdmin || !settings.enabled}
                    className="rounded border-plm-border text-plm-accent focus:ring-plm-accent disabled:opacity-60"
                  />
                  <span className="text-sm text-plm-fg">
                    {t('settingsPages.serialization.allowSpecial')}
                  </span>
                </label>
              </div>

              {/* Special Characters Input */}
              {settings.tab_allow_special && (
                <div>
                  <label className="text-sm text-plm-fg-muted block mb-1">
                    {t('settingsPages.serialization.allowedSpecial')}
                  </label>
                  <input
                    type="text"
                    value={settings.tab_special_chars}
                    onChange={(e) => updateSetting('tab_special_chars', e.target.value)}
                    placeholder="-_"
                    maxLength={10}
                    disabled={!isAdmin || !settings.enabled}
                    className="w-full px-3 py-2 bg-plm-input border border-plm-border rounded text-sm text-plm-fg placeholder:text-plm-fg-muted/50 focus:outline-none focus:border-plm-accent disabled:opacity-60 disabled:cursor-not-allowed font-mono"
                  />
                </div>
              )}
            </div>

            {/* Warning if no characters allowed */}
            {!settings.tab_allow_numbers &&
              !settings.tab_allow_letters &&
              !settings.tab_allow_special && (
                <div className="mt-3 text-xs text-plm-warning flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {t('settingsPages.serialization.noCharacters')}
                </div>
              )}
          </div>
        )}

        {settings.tab_enabled && (
          <div className="mt-4 p-3 bg-plm-highlight/50 rounded-lg space-y-2">
            <div>
              <div className="text-xs text-plm-fg-muted mb-1">
                {t('settingsPages.serialization.exampleWithTab')}
              </div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-plm-bg rounded font-mono text-plm-accent">
                  {basePreview}
                  {settings.tab_separator}
                  {'1'.padStart(settings.tab_padding_digits, '0')}
                  {settings.suffix}
                </code>
                <span className="text-xs text-plm-fg-muted">→</span>
                <code className="px-2 py-1 bg-plm-bg rounded font-mono text-plm-accent">
                  {basePreview}
                  {settings.tab_separator}
                  {'2'.padStart(settings.tab_padding_digits, '0')}
                  {settings.suffix}
                </code>
                <span className="text-xs text-plm-fg-muted">→</span>
                <code className="px-2 py-1 bg-plm-bg rounded font-mono text-plm-accent">
                  {basePreview}
                  {settings.tab_separator}
                  {'3'.padStart(settings.tab_padding_digits, '0')}
                  {settings.suffix}
                </code>
              </div>
            </div>
            {!settings.tab_required && (
              <div>
                <div className="text-xs text-plm-fg-muted mb-1">
                  {t('settingsPages.serialization.baseOnly')}
                </div>
                <code className="px-2 py-1 bg-plm-bg rounded font-mono text-plm-accent">
                  {basePreview}
                  {settings.suffix}
                </code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Keepout Zones */}
      <div
        className={`p-4 bg-plm-bg rounded-lg border border-plm-border ${!settings.enabled ? 'opacity-50' : ''}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-medium text-plm-fg">
              {t('settingsPages.serialization.keepoutZones')}
            </h3>
            <p className="text-xs text-plm-fg-muted mt-0.5">
              {t('settingsPages.serialization.keepoutZonesHelp')}
            </p>
          </div>
          {isAdmin && settings.enabled && (
            <button
              onClick={() => setShowKeepoutForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-plm-highlight hover:bg-plm-highlight/80 text-plm-fg rounded-lg transition-colors"
            >
              <Plus size={14} />
              {t('settingsPages.serialization.addZone')}
            </button>
          )}
        </div>

        {/* Add keepout zone form */}
        {showKeepoutForm && (
          <div className="p-3 bg-plm-highlight rounded-lg mb-4">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-plm-fg-muted block mb-1">
                  {t('settingsPages.serialization.start')}
                </label>
                <input
                  type="number"
                  value={newKeepout.start}
                  onChange={(e) => setNewKeepout((prev) => ({ ...prev, start: e.target.value }))}
                  placeholder="1000"
                  min="0"
                  className="w-full px-2 py-1.5 bg-plm-input border border-plm-border rounded text-sm text-plm-fg focus:outline-none focus:border-plm-accent font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-plm-fg-muted block mb-1">
                  {t('settingsPages.serialization.end')}
                </label>
                <input
                  type="number"
                  value={newKeepout.end}
                  onChange={(e) => setNewKeepout((prev) => ({ ...prev, end: e.target.value }))}
                  placeholder="1999"
                  min="0"
                  className="w-full px-2 py-1.5 bg-plm-input border border-plm-border rounded text-sm text-plm-fg focus:outline-none focus:border-plm-accent font-mono"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-plm-fg-muted block mb-1">
                  {t('settingsPages.serialization.zoneDescription')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKeepout.description}
                    onChange={(e) =>
                      setNewKeepout((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder={t('settingsPages.serialization.zonePlaceholder')}
                    className="flex-1 px-2 py-1.5 bg-plm-input border border-plm-border rounded text-sm text-plm-fg focus:outline-none focus:border-plm-accent"
                  />
                  <button
                    onClick={addKeepoutZone}
                    className="px-3 py-1.5 bg-plm-accent hover:bg-plm-accent-hover text-white rounded text-sm transition-colors"
                  >
                    {t('settingsPages.serialization.add')}
                  </button>
                  <button
                    onClick={() => {
                      setShowKeepoutForm(false)
                      setNewKeepout({ start: '', end: '', description: '' })
                    }}
                    className="px-2 py-1.5 text-plm-fg-muted hover:text-plm-fg transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Keepout zones list */}
        {settings.keepout_zones.length === 0 ? (
          <div className="text-center py-6 text-sm text-plm-fg-muted">
            {t('settingsPages.serialization.noKeepoutZones')}
          </div>
        ) : (
          <div className="space-y-2">
            {settings.keepout_zones.map((zone, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-plm-highlight rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="font-mono text-sm">
                    <span className="text-plm-warning">{zone.start.toLocaleString()}</span>
                    <span className="text-plm-fg-muted mx-2">→</span>
                    <span className="text-plm-warning">{zone.end_num.toLocaleString()}</span>
                  </div>
                  <span className="text-sm text-plm-fg-muted">{zone.description}</span>
                  <span className="text-xs text-plm-fg-muted/60">
                    {t('settingsPages.serialization.numberCount', {
                      count: (zone.end_num - zone.start + 1).toLocaleString(),
                    })}
                  </span>
                </div>
                {isAdmin && settings.enabled && (
                  <button
                    onClick={() => removeKeepoutZone(index)}
                    className="p-1.5 text-plm-fg-muted hover:text-plm-error transition-colors"
                    title={t('settingsPages.serialization.removeZone')}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Example Patterns */}
      <div className="p-4 bg-plm-highlight/50 rounded-lg border border-plm-border/50">
        <h4 className="text-sm font-medium text-plm-fg mb-3">
          {t('settingsPages.serialization.examplePatterns')}
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <code className="px-2 py-1 bg-plm-bg rounded font-mono text-plm-accent">PN-00001</code>
            <span className="text-plm-fg-muted">
              {t('settingsPages.serialization.examplePrefixDigits')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="px-2 py-1 bg-plm-bg rounded font-mono text-plm-accent">
              BR-AB00001
            </code>
            <span className="text-plm-fg-muted">
              {t('settingsPages.serialization.examplePrefixLetters')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="px-2 py-1 bg-plm-bg rounded font-mono text-plm-accent">100001</code>
            <span className="text-plm-fg-muted">
              {t('settingsPages.serialization.exampleNoPrefix')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="px-2 py-1 bg-plm-bg rounded font-mono text-plm-accent">
              PN-00001-REV
            </code>
            <span className="text-plm-fg-muted">
              {t('settingsPages.serialization.exampleSuffix')}
            </span>
          </div>
        </div>
      </div>

      {/* Save button - only shown for admins */}
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary flex items-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {t('settingsPages.saveSettings')}
          </button>
        </div>
      )}
    </div>
  )
}
