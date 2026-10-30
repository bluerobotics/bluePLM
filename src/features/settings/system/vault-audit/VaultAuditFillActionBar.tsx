/**
 * The bar under the "empty in BluePLM, still in the file" category.
 *
 * Two steps on purpose. These values may be losses or may never have been BluePLM's, and only the
 * admin can say which, so the bar first shows exactly what would be written - file, field, value -
 * and writes only after a second, explicit click. The guarantee is stated above the button rather
 * than in a confirmation, because it is the reason a bulk write is reasonable to offer: a column
 * that gained a value since the scan is never overwritten, and no version is created.
 */

import { useState } from 'react'
import { AlertTriangle, Check, Eye, Loader2, Lock, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/core/ui'
import { t } from '@/lib/i18n'
import type { FillableMetadataField } from '@/lib/supabase/files/fillEmptyMetadata'
import type { VaultAuditFillOutcome } from '@/types/vaultAudit'

import type { UseVaultAuditFillResult } from './useVaultAuditFill'
import { fieldLabel } from './vaultAuditLabels'
import { VaultAuditNote } from './VaultAuditNote'

/** Rows listed in the preview; the count above it always covers the whole plan. */
const MAX_PREVIEW_ROWS = 50

interface VaultAuditFillActionBarProps {
  fill: UseVaultAuditFillResult
}

function Receipt({ outcome }: { outcome: VaultAuditFillOutcome }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[14px] text-ui-fg flex items-center gap-1.5">
        <Check size={14} className="text-ui-success flex-shrink-0" />
        {t('vaultAudit.fill.receiptFilled', { count: outcome.filled })}
      </p>
      {outcome.alreadySet > 0 && (
        <p className="text-[13px] text-ui-fg-secondary">
          {t('vaultAudit.fill.receiptAlreadySet', { count: outcome.alreadySet })}
        </p>
      )}
      {outcome.heldByOther > 0 && (
        <p className="text-[13px] text-ui-fg-secondary">
          {t('vaultAudit.fill.receiptHeld', { count: outcome.heldByOther })}
        </p>
      )}
      {(outcome.refused > 0 || outcome.failed > 0) && (
        <p className="text-[13px] text-ui-warning flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          {t('vaultAudit.fill.receiptRefused', {
            refused: outcome.refused,
            failed: outcome.failed,
          })}
        </p>
      )}
    </div>
  )
}

function Preview({ fill, onCancel }: { fill: UseVaultAuditFillResult; onCancel: () => void }) {
  const rows = fill.plan.requests.flatMap((request) =>
    (Object.entries(request.values) as Array<[FillableMetadataField, string]>).map(
      ([field, value]) => ({
        key: `${request.fileId}:${field}`,
        path: request.relativePath,
        field,
        value,
      }),
    ),
  )

  return (
    <div className="space-y-2 border-t border-ui-divider pt-3">
      <p className="text-[14px] text-ui-fg">
        {t('vaultAudit.fill.previewHeading', {
          values: fill.plan.valueCount,
          files: fill.plan.requests.length,
        })}
      </p>
      <ul className="max-h-60 overflow-y-auto text-[13px] font-mono space-y-0.5">
        {rows.slice(0, MAX_PREVIEW_ROWS).map((row) => (
          <li key={row.key} className="text-ui-fg-secondary break-words">
            {t('vaultAudit.fill.previewLine', {
              path: row.path,
              field: fieldLabel(row.field),
              value: row.value,
            })}
          </li>
        ))}
      </ul>
      {rows.length > MAX_PREVIEW_ROWS && (
        <p className="text-[13px] text-ui-fg-secondary">
          {t('vaultAudit.fill.previewMore', { count: rows.length - MAX_PREVIEW_ROWS })}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" onClick={onCancel} disabled={fill.applying}>
          {t('vaultAudit.fill.cancel')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void fill.apply().then(onCancel)}
          disabled={!fill.canApply}
        >
          {fill.applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {fill.applying
            ? t('vaultAudit.fill.applying')
            : t('vaultAudit.fill.apply', { count: fill.plan.valueCount })}
        </Button>
      </div>
    </div>
  )
}

export function VaultAuditFillActionBar({ fill }: VaultAuditFillActionBarProps) {
  const [previewing, setPreviewing] = useState(false)

  return (
    <div className="space-y-3">
      <VaultAuditNote
        icon={ShieldCheck}
        iconClassName="text-ui-success"
        label={t('vaultAudit.actions.guaranteeLabel')}
      >
        <p>{t('vaultAudit.fill.guarantee')}</p>
      </VaultAuditNote>

      {!fill.isAdmin && (
        <p className="text-[13px] text-ui-fg-secondary flex items-start gap-1.5">
          <Lock size={13} className="mt-0.5 flex-shrink-0" />
          {t('vaultAudit.fill.adminOnly')}
        </p>
      )}

      {fill.error && (
        <p className="text-[13px] text-ui-danger flex items-start gap-1.5">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          {fill.error}
        </p>
      )}

      {fill.outcome && <Receipt outcome={fill.outcome} />}

      {previewing && fill.plan.valueCount > 0 ? (
        <Preview fill={fill} onCancel={() => setPreviewing(false)} />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ui-fg-secondary">
            {fill.plan.valueCount === 0
              ? t('vaultAudit.fill.selectPrompt')
              : t('vaultAudit.fill.selectedSummary', {
                  values: fill.plan.valueCount,
                  files: fill.plan.requests.length,
                })}
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setPreviewing(true)}
            disabled={!fill.isAdmin || fill.applying || fill.plan.valueCount === 0}
          >
            <Eye size={12} />
            {t('vaultAudit.fill.review', { count: fill.plan.valueCount })}
          </Button>
        </div>
      )}
    </div>
  )
}
