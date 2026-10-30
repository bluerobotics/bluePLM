import { AlertTriangle, Check, FileUp, Info, Loader2 } from 'lucide-react'

import { Button } from '@/components/core/ui'
import { t } from '@/lib/i18n'

import type { UseVaultAuditConflictResult } from './useVaultAuditConflict'
import type { UseVaultAuditPushResult } from './useVaultAuditPush'
import { VaultAuditNote } from './VaultAuditNote'

interface VaultAuditConflictActionBarProps {
  conflict: UseVaultAuditConflictResult
  push: UseVaultAuditPushResult
}

/**
 * The two writes a conflict can mean, kept side by side so the final click repeats the choice.
 *
 * The document side is still per file, while the database side is per finding. That difference is
 * shown in the two counts instead of making a row button look like it has a narrower effect than
 * the writer actually has.
 */
export function VaultAuditConflictActionBar({ conflict, push }: VaultAuditConflictActionBarProps) {
  const busy = conflict.applying || push.running
  const selectedFiles = push.eligibility.selected

  return (
    <div className="space-y-3">
      <VaultAuditNote icon={Info} label={t('vaultAudit.actions.conflictLabel')}>
        <p>{t('vaultAudit.conflict.instruction')}</p>
        <p>{t('vaultAudit.conflict.bluePlmNote')}</p>
      </VaultAuditNote>

      {conflict.error && (
        <p className="text-[13px] text-ui-danger flex items-start gap-1.5">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          {conflict.error}
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ui-fg-secondary">
            {conflict.selectedCount === 0
              ? t('vaultAudit.conflict.fileSelectPrompt')
              : t('vaultAudit.conflict.fileSelectedSummary', {
                  values: conflict.selectedCount,
                })}
          </p>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={() => void conflict.apply()}
            disabled={busy || !conflict.canApply}
          >
            {conflict.applying ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Check size={12} />
            )}
            {conflict.applying
              ? t('vaultAudit.conflict.applying')
              : t('vaultAudit.conflict.applyFile', { count: conflict.selectedCount })}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ui-fg-secondary">
            {selectedFiles === 0
              ? t('vaultAudit.conflict.bluePlmSelectPrompt')
              : t('vaultAudit.conflict.bluePlmSelectedSummary', { files: selectedFiles })}
          </p>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={() => void push.run()}
            disabled={busy || !push.canRun}
          >
            {push.running ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />}
            {push.running
              ? t('vaultAudit.push.running')
              : t('vaultAudit.conflict.applyBluePlm', { files: push.eligibility.eligible.length })}
          </Button>
        </div>
      </div>
    </div>
  )
}
