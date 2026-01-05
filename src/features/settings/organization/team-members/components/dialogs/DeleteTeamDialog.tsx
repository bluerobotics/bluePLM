/**
 * DeleteTeamDialog - Confirm team deletion
 * 
 * Shows a confirmation dialog before deleting a team,
 * warning about the number of members affected.
 * 
 * @module team-members/DeleteTeamDialog
 */

import type { TeamWithDetails } from '../../types'

export interface DeleteTeamDialogProps {
  team: TeamWithDetails
  onConfirm: () => Promise<void>
  onClose: () => void
  isDeleting: boolean
}

export function DeleteTeamDialog({
  team,
  onConfirm,
  onClose,
  isDeleting
}: DeleteTeamDialogProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-plm-bg-light border border-plm-border rounded-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-plm-fg mb-4">Delete Team</h3>
        <p className="text-base text-plm-fg-muted mb-4">
          Are you sure you want to delete <strong>{team.name}</strong>? This will remove all {team.member_count} members from the team and delete all associated permissions.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="btn bg-plm-error text-white hover:bg-plm-error/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete Team'}
          </button>
        </div>
      </div>
    </div>
  )
}
