import { AlertTriangle, Trash2 } from 'lucide-react'

import { Button } from '@/components/core/ui'

import type { OrgAddress } from './types'

interface DeleteAddressDialogProps {
  address: OrgAddress
  deleting: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Confirms deleting an address. */
export function DeleteAddressDialog({
  address,
  deleting,
  onConfirm,
  onCancel,
}: DeleteAddressDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-md rounded-lg border border-plm-border bg-plm-bg-light p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="rounded-full bg-plm-error/15 p-2">
            <AlertTriangle className="h-4 w-4 text-plm-error" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-plm-fg">Delete Address?</h3>
            <p className="mt-0.5 text-[12px] text-plm-fg-muted">
              "{address.label}" ({address.address_type})
            </p>
          </div>
        </div>

        <p className="mb-4 text-[13px] text-plm-fg-muted">
          This will permanently delete this address. This action cannot be undone.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deleting}
            icon={<Trash2 size={14} />}
            onClick={onConfirm}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
