import type { ReactNode } from 'react'
import { AlertTriangle, Send } from 'lucide-react'

import { Button } from '@/components/core/ui'
import type { FileMetadataColumn } from '@/types/database'

interface DialogShellProps {
  icon: ReactNode
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

function DialogShell({ icon, title, onClose, children, footer }: DialogShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-md rounded-xl border border-ui-border bg-ui-bg p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          {icon}
          <h3 className="text-[16px] font-semibold text-ui-fg">{title}</h3>
        </div>
        {children}
        <div className="flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  )
}

interface MetadataColumnDialogsProps {
  deletingColumn: FileMetadataColumn | null
  isDeleting: boolean
  onCancelDelete: () => void
  onConfirmDelete: () => void
  showPushConfirm: boolean
  onCancelPush: () => void
  onConfirmPush: () => void
}

/** The delete-column and push-to-all-users confirmations of the File Metadata page. */
export function MetadataColumnDialogs({
  deletingColumn,
  isDeleting,
  onCancelDelete,
  onConfirmDelete,
  showPushConfirm,
  onCancelPush,
  onConfirmPush,
}: MetadataColumnDialogsProps) {
  return (
    <>
      {deletingColumn && (
        <DialogShell
          icon={
            <div className="rounded-full bg-ui-danger/15 p-2 text-ui-danger">
              <AlertTriangle size={20} />
            </div>
          }
          title="Delete Column"
          onClose={onCancelDelete}
          footer={
            <>
              <Button variant="ghost" onClick={onCancelDelete}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Column'}
              </Button>
            </>
          }
        >
          <p className="mb-3 text-[14px] text-ui-fg-secondary">
            Are you sure you want to delete the column <strong>"{deletingColumn.label}"</strong>?
          </p>
          <p className="mb-4 text-[13px] text-ui-fg">
            This will remove the column from the file browser. Existing file metadata using this
            column will remain in storage but won't be displayed.
          </p>
        </DialogShell>
      )}

      {showPushConfirm && (
        <DialogShell
          icon={
            <div className="rounded-full bg-ui-warning/15 p-2 text-ui-warning">
              <Send size={20} />
            </div>
          }
          title="Push to All Users"
          onClose={onCancelPush}
          footer={
            <>
              <Button variant="ghost" onClick={onCancelPush}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmPush}>
                Push to All Users
              </Button>
            </>
          }
        >
          <p className="mb-3 text-[14px] text-ui-fg-secondary">
            This will override <strong>every user's</strong> column layout with your current
            configuration.
          </p>
          <p className="mb-4 text-[13px] text-ui-fg">
            All connected users will receive the update immediately. Users who are offline will
            receive it when they next open the app.
          </p>
        </DialogShell>
      )}
    </>
  )
}
