/**
 * The bulk-selection controls above the findings list.
 *
 * They act on every selectable row the filter lets through - not on the rows currently drawn -
 * and the label says how many that is, in the unit the writer works in. A file write counts files
 * and a value write counts values, so "Select all 42" is never followed by a write of twelve.
 */

import { EyeOff } from 'lucide-react'

import { t } from '@/lib/i18n'

import type { SelectionSummary } from './vaultAuditSelection'

interface VaultAuditSelectionBarProps {
  summary: SelectionSummary
  /** Already translated: "files" or "values". */
  unit: string
  disabled: boolean
  onSelectAll: () => void
  onClear: () => void
  onInvert: () => void
  onClearHidden: () => void
}

const LINK_BUTTON =
  'text-[12px] text-ui-accent hover:underline disabled:opacity-40 disabled:no-underline'

export function VaultAuditSelectionBar({
  summary,
  unit,
  disabled,
  onSelectAll,
  onClear,
  onInvert,
  onClearHidden,
}: VaultAuditSelectionBarProps) {
  const { selectableUnits, selectedUnits, allSelected, hiddenSelectedUnits } = summary

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {selectableUnits > 0 && (
        <>
          <button
            type="button"
            onClick={onSelectAll}
            disabled={disabled || allSelected}
            className={LINK_BUTTON}
          >
            {t('vaultAudit.findings.selectAll', { count: selectableUnits, unit })}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled || selectedUnits === 0}
            className={LINK_BUTTON}
          >
            {t('vaultAudit.findings.clearSelection')}
          </button>
          <button type="button" onClick={onInvert} disabled={disabled} className={LINK_BUTTON}>
            {t('vaultAudit.findings.invert')}
          </button>
          <span className="text-[12px] text-ui-fg-secondary" aria-live="polite">
            {t('vaultAudit.findings.selectedOf', {
              selected: selectedUnits,
              total: selectableUnits,
            })}
          </span>
        </>
      )}

      {hiddenSelectedUnits > 0 && (
        <span className="flex items-center gap-1.5 text-[12px] text-ui-warning">
          <EyeOff size={12} className="flex-shrink-0" />
          {t('vaultAudit.findings.hiddenSelected', { count: hiddenSelectedUnits })}
          <button
            type="button"
            onClick={onClearHidden}
            disabled={disabled}
            className={LINK_BUTTON}
          >
            {t('vaultAudit.findings.clearHidden')}
          </button>
        </span>
      )}
    </div>
  )
}
