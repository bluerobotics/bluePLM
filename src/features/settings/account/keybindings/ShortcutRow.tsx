import { useEffect, useRef } from 'react'
import { Plus, RotateCcw, TriangleAlert, X } from 'lucide-react'

import { Button } from '@/components/core/ui'
import { useTranslation } from '@/lib/i18n'
import {
  formatCombo,
  getShortcutAction,
  type ShortcutAction,
  type ShortcutConflict,
  type ShortcutPlatform,
} from '@/lib/keybindings'

import { HeldModifiers, Keycaps } from './Keycaps'
import { useKeyCapture } from './useKeyCapture'

/** Which key of the row is being captured: an existing one by index, or a new alternate. */
export type CaptureSlot = number | 'new'

export interface PendingConflict {
  slot: CaptureSlot
  combo: string
  conflicts: ShortcutConflict[]
}

interface ShortcutRowProps {
  action: ShortcutAction
  combos: readonly string[]
  modified: boolean
  /** Keys this action already shares with another action where both apply. */
  existingConflicts: ShortcutConflict[]
  platform: ShortcutPlatform
  capturing: CaptureSlot | null
  pending: PendingConflict | null
  /** A short note under the row (the pressed keys were already this action's). */
  notice: string | null
  onStartCapture: (slot: CaptureSlot) => void
  onCaptured: (slot: CaptureSlot, combo: string) => void
  onCancelCapture: () => void
  onRemove: (index: number) => void
  onReset: () => void
  onResolvePending: (choice: 'reassign' | 'keepBoth' | 'cancel') => void
}

/** The name of the action a conflict points at, with where it works. */
function useConflictText() {
  const { t } = useTranslation()
  return (conflict: ShortcutConflict) => {
    const other = getShortcutAction(conflict.actionId)
    return {
      action: t(`shortcuts.action.${conflict.actionId}`),
      scope: other ? t(`shortcuts.scope.${other.scope}`) : '',
    }
  }
}

/** The field that listens for the new keys, in place of the key being changed. */
function CaptureField({
  platform,
  onCaptured,
  onCancel,
}: {
  platform: ShortcutPlatform
  onCaptured: (combo: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const held = useKeyCapture(true, onCaptured, onCancel)

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="textbox"
      aria-label={t('shortcuts.pressKeys')}
      onBlur={onCancel}
      className="inline-flex h-7 min-w-[132px] items-center gap-2 rounded-lg border border-ui-accent/70 bg-ui-field px-2.5 text-[13px] text-ui-fg-secondary outline-none ring-2 ring-ui-accent/25"
    >
      {held.length > 0 ? <HeldModifiers held={held} platform={platform} /> : t('shortcuts.pressKeys')}
      <span className="ml-auto text-[12px] text-ui-fg-tertiary">{t('shortcuts.captureHint')}</span>
    </div>
  )
}

/**
 * One shortcut: its name and what it does on the left, its keys as keycaps on the right. Click a
 * key to change it, + to add an alternate, × to remove one. A key that another action already uses
 * where this one works asks before it is saved.
 */
export function ShortcutRow({
  action,
  combos,
  modified,
  existingConflicts,
  platform,
  capturing,
  pending,
  notice,
  onStartCapture,
  onCaptured,
  onCancelCapture,
  onRemove,
  onReset,
  onResolvePending,
}: ShortcutRowProps) {
  const { t } = useTranslation()
  const conflictText = useConflictText()
  const label = t(`shortcuts.action.${action.id}`)
  const keysText = (combo: string) => formatCombo(combo, platform)

  const capture = (slot: CaptureSlot) => (
    <CaptureField
      key={`capture-${slot}`}
      platform={platform}
      onCaptured={(combo) => onCaptured(slot, combo)}
      onCancel={onCancelCapture}
    />
  )

  return (
    <div data-setting-row="" data-shortcut-row={action.id} className="py-4">
      <div className="flex items-center justify-between gap-x-12 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] leading-5 text-ui-fg">{label}</span>
            {modified && (
              <span className="text-[12px] leading-5 text-ui-fg-tertiary">{t('shortcuts.modified')}</span>
            )}
          </div>
          <div className="mt-1 text-[14px] leading-[1.4] text-ui-fg-secondary">
            {t(`shortcuts.help.${action.id}`)}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
          {combos.map((combo, index) =>
            capturing === index ? (
              capture(index)
            ) : (
              <span key={combo} className="group/key inline-flex items-center">
                <button
                  type="button"
                  onClick={() => onStartCapture(index)}
                  title={t('shortcuts.changeKey', { keys: keysText(combo) })}
                  aria-label={t('shortcuts.changeKey', { keys: keysText(combo) })}
                  className="rounded-lg p-0.5 outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-accent/50"
                >
                  <Keycaps combo={combo} platform={platform} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  title={t('shortcuts.removeKey', { keys: keysText(combo) })}
                  aria-label={t('shortcuts.removeKey', { keys: keysText(combo) })}
                  className="ml-0.5 rounded p-0.5 text-ui-fg-tertiary opacity-0 outline-none transition-opacity hover:text-ui-fg focus-visible:opacity-100 group-hover/key:opacity-100"
                >
                  <X size={12} />
                </button>
              </span>
            ),
          )}
          {combos.length === 0 && capturing === null && (
            <span className="text-[13px] text-ui-fg-tertiary">{t('shortcuts.notSet')}</span>
          )}
          {capturing === 'new' ? (
            capture('new')
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => onStartCapture('new')}
              title={t('shortcuts.addKey')}
              aria-label={t('shortcuts.addKey')}
              className="!px-1.5"
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={onReset}
            disabled={!modified}
            title={t('shortcuts.resetAction', { action: label })}
            aria-label={t('shortcuts.resetAction', { action: label })}
            className={`!px-1.5 ${modified ? '' : 'invisible'}`}
          />
        </div>
      </div>

      {pending && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ui-fg-secondary">
          <TriangleAlert size={14} className="flex-shrink-0 text-ui-warning" aria-hidden />
          <span className="min-w-0 flex-1">
            {pending.conflicts.map((conflict) => {
              const other = getShortcutAction(conflict.actionId)
              const key =
                other?.scope === 'global' && action.scope !== 'global'
                  ? 'shortcuts.conflictScopeWins'
                  : 'shortcuts.conflict'
              return (
                <span key={conflict.actionId} className="block">
                  {t(key, { keys: keysText(pending.combo), ...conflictText(conflict) })}
                </span>
              )
            })}
          </span>
          <span className="flex items-center gap-1.5">
            <Button size="sm" variant="primary" onClick={() => onResolvePending('reassign')}>
              {t('shortcuts.reassign')}
            </Button>
            <Button size="sm" onClick={() => onResolvePending('keepBoth')}>
              {t('shortcuts.keepBoth')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onResolvePending('cancel')}>
              {t('shortcuts.cancel')}
            </Button>
          </span>
        </div>
      )}

      {!pending && notice && (
        <div className="mt-2 text-[13px] text-ui-fg-secondary">{notice}</div>
      )}

      {!pending && existingConflicts.length > 0 && (
        <div className="mt-2 flex items-start gap-2 text-[13px] text-ui-fg-secondary">
          <TriangleAlert size={14} className="mt-0.5 flex-shrink-0 text-ui-warning" aria-hidden />
          <span>
            {existingConflicts.map((conflict) => (
              <span key={`${conflict.actionId}-${conflict.combo}`} className="block">
                {t('shortcuts.sharesKeys', { keys: keysText(conflict.combo), ...conflictText(conflict) })}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  )
}
