import { t } from '@/lib/i18n'
import { AlertTriangle, CircleDot, X } from 'lucide-react'

import { SYMBOL_FONT } from './inspectionColumns'
import { rowSummary, type BalloonRequestPlan } from './drawingCharacteristicsFlow'

interface BalloonConfirmDialogProps {
  plan: BalloonRequestPlan
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirms writing BluePLM balloons into the drawing. Names the rows whose annotation is gone
 * (they get no balloon), says that balloons BluePLM did not place stay, and that the
 * drawing is saved and then needs a check-in.
 */
export function BalloonConfirmDialog({ plan, onConfirm, onCancel }: BalloonConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('source.inspection.balloonConfirmTitle')}
        className="bg-plm-bg-light border border-plm-border rounded-lg shadow-2xl w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-4 border-b border-plm-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-plm-info/20 flex items-center justify-center">
              <CircleDot size={20} className="text-plm-info" />
            </div>
            <h3 className="text-lg font-semibold text-plm-fg">
              {t('source.inspection.balloonConfirmTitle')}
            </h3>
          </div>
          <button onClick={onCancel} className="btn btn-ghost p-1" aria-label={t('common.cancel')}>
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-auto text-sm">
          <p className="text-plm-fg">
            {t('source.inspection.balloonConfirmBody', { count: plan.balloons.length })}
          </p>
          <p className="text-plm-fg-muted">{t('source.inspection.balloonConfirmOtherBalloons')}</p>
          {plan.unkeyed > 0 && (
            <p className="text-plm-fg-muted">
              {t('source.inspection.balloonConfirmUnkeyed', { count: plan.unkeyed })}
            </p>
          )}
          {plan.stale.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-start gap-2 text-plm-warning">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{t('source.inspection.balloonConfirmStale', { count: plan.stale.length })}</span>
              </div>
              <div className="bg-plm-bg rounded border border-plm-border divide-y divide-plm-border max-h-40 overflow-auto text-xs">
                {plan.stale.map((row) => (
                  <div key={row.id} className="flex items-center gap-2 px-2 py-1">
                    <span className="w-10 shrink-0 font-medium text-plm-fg">
                      {row.balloon_number}
                    </span>
                    <span className="flex-1 truncate text-plm-fg" style={{ fontFamily: SYMBOL_FONT }}>
                      {rowSummary(row) || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-plm-fg-muted">{t('source.inspection.balloonConfirmSave')}</p>
        </div>

        <div className="p-4 border-t border-plm-border flex justify-end gap-2">
          <button onClick={onCancel} className="btn btn-ghost">
            {t('common.cancel')}
          </button>
          <button onClick={onConfirm} className="btn btn-primary">
            {t('source.inspection.balloonConfirmApply')}
          </button>
        </div>
      </div>
    </div>
  )
}
