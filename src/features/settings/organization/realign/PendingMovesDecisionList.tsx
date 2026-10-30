// src/features/settings/organization/realign/PendingMovesDecisionList.tsx
import { ArrowRight } from 'lucide-react'

import { t } from '@/lib/i18n'
import type { AlignmentItem, PendingMoveAction } from '@/types/realign'

import { countPendingMoveActions, pluralSuffix } from './RealignDialog.utils'

function hasFileId(item: AlignmentItem): item is AlignmentItem & { fileId: string } {
  return item.fileId !== null
}

const LIST_MAX_HEIGHT_CLASS = 'max-h-64'

interface PendingMovesDecisionListProps {
  items: AlignmentItem[]
  actions: Record<string, PendingMoveAction>
  disabled: boolean
  onActionChange: (fileId: string, action: PendingMoveAction) => void
  onSetAll: (action: PendingMoveAction) => void
}

export function PendingMovesDecisionList({
  items,
  actions,
  disabled,
  onActionChange,
  onSetAll,
}: PendingMovesDecisionListProps) {
  const decidable = items.filter(hasFileId)
  const { adopt, reconcile } = countPendingMoveActions(actions)

  if (decidable.length === 0) return null

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[12px] text-ui-fg-secondary">{t('realign.pendingMove.keepLocalNote')}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSetAll('adopt')}
          disabled={disabled}
          className="btn btn-ghost text-[12px] disabled:opacity-50"
        >
          {t('realign.pendingMove.keepServerAll')}
        </button>
        <button
          type="button"
          onClick={() => onSetAll('reconcile')}
          disabled={disabled}
          className="btn btn-ghost text-[12px] disabled:opacity-50"
        >
          {t('realign.pendingMove.keepLocalAll')}
        </button>
      </div>

      <div
        className={`bg-ui-field rounded border border-ui-divider p-2 overflow-y-auto ${LIST_MAX_HEIGHT_CLASS}`}
      >
        {decidable.map((item) => {
          const fileId = item.fileId
          const selected = actions[fileId] ?? 'adopt'
          const serverPath = item.serverRelativePath ?? item.relativePath
          const localPath = item.movedToRelativePath ?? item.relativePath

          return (
            <div
              key={item.id}
              className="py-2 border-b border-ui-divider last:border-b-0 space-y-1.5"
            >
              <div className="text-[13px] text-ui-fg truncate">{item.fileName}</div>
              <div className="flex items-center gap-2 font-mono text-[12px] text-ui-fg">
                <span className="truncate" title={serverPath}>
                  {serverPath}
                </span>
                <ArrowRight size={10} className="shrink-0 text-ui-fg-secondary" />
                <span className="truncate text-ui-fg" title={localPath}>
                  {localPath}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 text-[12px]">
                <ActionRadio
                  fileId={fileId}
                  action="adopt"
                  selected={selected}
                  disabled={disabled}
                  label={t('realign.pendingMove.keepServer')}
                  onChange={onActionChange}
                />
                <ActionRadio
                  fileId={fileId}
                  action="reconcile"
                  selected={selected}
                  disabled={disabled}
                  label={t('realign.pendingMove.keepLocal')}
                  onChange={onActionChange}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-[12px] text-ui-fg-secondary">
        {t(`realign.pendingMove.adoptSummary${pluralSuffix(adopt)}`, { count: adopt })}
        {' · '}
        {t(`realign.pendingMove.reconcileSummary${pluralSuffix(reconcile)}`, {
          count: reconcile,
        })}
      </div>
    </div>
  )
}

interface ActionRadioProps {
  fileId: string
  action: PendingMoveAction
  selected: PendingMoveAction
  disabled: boolean
  label: string
  onChange: (fileId: string, action: PendingMoveAction) => void
}

function ActionRadio({ fileId, action, selected, disabled, label, onChange }: ActionRadioProps) {
  return (
    <label className="flex items-center gap-1.5 text-ui-fg cursor-pointer">
      <input
        type="radio"
        name={`pending-move-${fileId}`}
        checked={selected === action}
        onChange={() => onChange(fileId, action)}
        disabled={disabled}
        className="accent-ui-accent"
      />
      <span>{label}</span>
    </label>
  )
}
