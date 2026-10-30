import type { ReactNode } from 'react'

import { Button } from '@/components/core/ui'

interface OdooConfirmDialogProps {
  title: string
  confirmLabel: string
  busyLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  children: ReactNode
}

/** A destructive confirmation (delete a connection, disconnect Odoo). */
export function OdooConfirmDialog({
  title,
  confirmLabel,
  busyLabel,
  busy,
  onConfirm,
  onCancel,
  children,
}: OdooConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-semibold text-plm-fg mb-3">{title}</h3>
        <p className="text-[13px] text-plm-fg-muted mb-5">{children}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
