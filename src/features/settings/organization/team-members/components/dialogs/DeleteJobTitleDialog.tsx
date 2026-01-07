/**
 * DeleteJobTitleDialog - Confirm job title deletion
 * 
 * Shows a confirmation dialog before deleting a job title,
 * warning that users with this title will have it removed.
 * 
 * @module team-members/DeleteJobTitleDialog
 */

export interface DeleteJobTitleDialogProps {
  title: { id: string; name: string }
  onConfirm: () => Promise<void>
  onClose: () => void
  isDeleting: boolean
}

export function DeleteJobTitleDialog({
  title,
  onConfirm,
  onClose,
  isDeleting
}: DeleteJobTitleDialogProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-plm-fg mb-4">Delete Job Title</h3>
        <p className="text-base text-plm-fg-muted mb-4">
          Are you sure you want to delete <strong>{title.name}</strong>? Users with this title will have it removed.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost" disabled={isDeleting}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="btn bg-plm-error text-white hover:bg-plm-error/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete Title'}
          </button>
        </div>
      </div>
    </div>
  )
}
