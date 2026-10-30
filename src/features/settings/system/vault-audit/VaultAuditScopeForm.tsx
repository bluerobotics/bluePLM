import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Play, X } from 'lucide-react'

import { Button, FIELD_CLASS } from '@/components/core/ui'
import { t } from '@/lib/i18n'
import type { VaultAuditScope, VaultAuditScopeKind } from '@/types/vaultAudit'

interface VaultAuditScopeFormProps {
  scope: VaultAuditScope
  onScopeChange: (scope: VaultAuditScope) => void
  isRunning: boolean
  /** A vault is connected. False shows the "connect a vault" hint next to the button. */
  canScan: boolean
  /**
   * Something other than a missing vault prevents a run - today, a SolidWorks service too old to
   * answer the audit's read command. The reason is stated above the form, so the button only has
   * to stop being clickable.
   */
  blocked: boolean
  cancelRequested: boolean
  hasResult: boolean
  onStart: () => void
  onCancel: () => void
}

interface ScopeOption {
  kind: VaultAuditScopeKind
  label: string
  hint: string
}

function scopeOptions(): ScopeOption[] {
  return [
    {
      kind: 'configuration-recorded',
      label: t('vaultAudit.scope.configurationRecorded'),
      hint: t('vaultAudit.scope.configurationRecordedHint'),
    },
    {
      kind: 'folder',
      label: t('vaultAudit.scope.folder'),
      hint: t('vaultAudit.scope.folderHint'),
    },
    {
      kind: 'whole-vault',
      label: t('vaultAudit.scope.wholeVault'),
      hint: t('vaultAudit.scope.wholeVaultHint'),
    },
  ]
}

export function VaultAuditScopeForm({
  scope,
  onScopeChange,
  isRunning,
  canScan,
  blocked,
  cancelRequested,
  hasResult,
  onStart,
  onCancel,
}: VaultAuditScopeFormProps) {
  // Once there is a result the list is what matters, so the three options fold into one line
  // naming the scope, and open again on request.
  const [expanded, setExpanded] = useState(false)
  const showOptions = !hasResult || expanded
  const options = scopeOptions()
  const current = options.find((option) => option.kind === scope.kind)
  const Chevron = showOptions ? ChevronDown : ChevronRight

  return (
    <div className="space-y-3">
      {hasResult && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={showOptions}
          className="flex items-center gap-1.5 text-[14px] text-ui-fg-secondary hover:text-ui-fg"
        >
          <Chevron size={14} />
          {t('vaultAudit.scope.current', {
            scope:
              scope.kind === 'folder' && scope.folderPath
                ? `${current?.label ?? ''}: ${scope.folderPath}`
                : (current?.label ?? ''),
          })}
        </button>
      )}

      <fieldset
        disabled={isRunning}
        className={`grid gap-2 lg:grid-cols-3 ${showOptions ? '' : 'hidden'}`}
      >
        <legend className="mb-2 text-[14px] font-medium text-ui-fg">
          {t('vaultAudit.scope.legend')}
        </legend>

        {options.map((option) => (
          <label
            key={option.kind}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
              scope.kind === option.kind
                ? 'border-ui-accent/60 bg-ui-accent/5'
                : 'border-ui-divider bg-ui-field/60 hover:bg-ui-hover/40'
            } ${isRunning ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              type="radio"
              name="vault-audit-scope"
              className="mt-1 accent-ui-accent"
              checked={scope.kind === option.kind}
              onChange={() => onScopeChange({ ...scope, kind: option.kind })}
            />
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-ui-fg">{option.label}</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ui-fg-secondary">{option.hint}</p>
              {option.kind === 'folder' && scope.kind === 'folder' && (
                <input
                  type="text"
                  value={scope.folderPath}
                  placeholder={t('vaultAudit.scope.folderPlaceholder')}
                  onChange={(event) =>
                    onScopeChange({ kind: 'folder', folderPath: event.target.value })
                  }
                  className={`${FIELD_CLASS} mt-2 h-7 px-2 font-mono`}
                />
              )}
            </div>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-2">
        {isRunning ? (
          <Button icon={<X size={14} />} onClick={onCancel} disabled={cancelRequested}>
            {cancelRequested ? t('vaultAudit.cancelling') : t('vaultAudit.cancel')}
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={<Play size={14} />}
            onClick={onStart}
            disabled={!canScan || blocked}
          >
            {hasResult ? t('vaultAudit.rescan') : t('vaultAudit.scan')}
          </Button>
        )}

        {isRunning && <Loader2 size={14} className="animate-spin text-ui-fg-secondary" />}
        {!canScan && (
          <span className="text-[13px] text-ui-fg-secondary">{t('vaultAudit.noVault')}</span>
        )}
      </div>
    </div>
  )
}
