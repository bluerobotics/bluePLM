/**
 * An explanation that is there when wanted and out of the way when not.
 *
 * The action bars used to open with one or two paragraphs of guarantees and caveats. They are
 * worth reading once, and they pushed the button - the thing a person scrolling a long list is
 * looking for - off the screen every time. The sentences are unchanged; they sit behind a toggle.
 * Anything that is a result or a warning about the current selection stays out in the open.
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'

import { t } from '@/lib/i18n'

interface VaultAuditNoteProps {
  icon: LucideIcon
  iconClassName?: string
  /** Short label shown on the toggle, so the closed note still says what it is about. */
  label: string
  children: ReactNode
}

export function VaultAuditNote({
  icon: Icon,
  iconClassName = 'text-ui-fg-secondary',
  label,
  children,
}: VaultAuditNoteProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-md border border-ui-divider bg-ui-field">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ui-fg-secondary hover:text-ui-fg transition-colors"
      >
        <Icon size={13} className={`flex-shrink-0 ${iconClassName}`} />
        <span className="flex-1">{label}</span>
        <span className="flex items-center gap-0.5">
          {open ? t('vaultAudit.actions.hideDetails') : t('vaultAudit.actions.showDetails')}
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>
      {open && <div className="px-3 pb-2 text-[12px] text-ui-fg-secondary space-y-2">{children}</div>}
    </div>
  )
}
