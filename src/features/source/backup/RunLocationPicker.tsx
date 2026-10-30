import { CheckCircle2, Cloud, Loader2, Monitor } from 'lucide-react'
import { t } from '@/lib/i18n'

type RunLocation = 'desktop' | 'server'

interface RunLocationPickerProps {
  value: RunLocation
  isAdmin: boolean
  saving: boolean
  onChange: (location: RunLocation) => void
}

const OPTIONS: Array<{ value: RunLocation; icon: typeof Cloud; label: string; hint: string }> = [
  {
    value: 'server',
    icon: Cloud,
    label: 'serverBackup.runLocationServer',
    hint: 'serverBackup.runLocationServerHint',
  },
  {
    value: 'desktop',
    icon: Monitor,
    label: 'serverBackup.runLocationDesktop',
    hint: 'serverBackup.runLocationDesktopHint',
  },
]

/**
 * Who runs the organization's backups. One click switches (admins), saved on its own, so the
 * choice no longer hides inside the collapsed settings form behind a Save button.
 */
export function RunLocationPicker({ value, isAdmin, saving, onChange }: RunLocationPickerProps) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium flex items-center gap-2">
        {t('serverBackup.runLocationLabel')}
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-plm-fg-muted" />}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">
        {OPTIONS.map((option) => {
          const selected = value === option.value
          const Icon = option.icon
          return (
            <button
              key={option.value}
              role="radio"
              aria-checked={selected}
              // Not `disabled` when selected: buttons are dimmed when disabled, which made the
              // chosen option look like the unavailable one.
              aria-disabled={!isAdmin || saving}
              onClick={() => {
                if (isAdmin && !saving && !selected) onChange(option.value)
              }}
              className={`text-left p-3 rounded-lg border-2 transition-colors ${
                selected
                  ? 'border-plm-accent bg-plm-accent/10'
                  : `border-plm-border bg-plm-bg-secondary ${isAdmin && !saving ? 'hover:border-plm-fg-muted' : ''}`
              } ${selected || !isAdmin ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Icon className={`w-4 h-4 ${selected ? 'text-plm-accent' : 'text-plm-fg-muted'}`} />
                <span className={selected ? '' : 'text-plm-fg-muted'}>{t(option.label)}</span>
                {selected && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-plm-accent">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('backupPanel.selected')}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-plm-fg-muted">{t(option.hint)}</div>
            </button>
          )
        })}
      </div>
      {!isAdmin && <p className="text-xs text-plm-fg-muted">{t('backupPanel.adminChooses')}</p>}
    </div>
  )
}
