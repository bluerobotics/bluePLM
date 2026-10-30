/**
 * DeleteTeamDialog - Confirm team deletion
 *
 * Shows a confirmation dialog before deleting a team,
 * warning about the number of members affected.
 *
 * @module team-members/DeleteTeamDialog
 */

import { Button } from '@/components/core/ui'
import type { TeamWithDetails } from '../../types'

export interface DeleteTeamDialogProps {
  team: TeamWithDetails
  onConfirm: () => Promise<void>
  onClose: () => void
  isDeleting: boolean
}

export function DeleteTeamDialog({ team, onConfirm, onClose, isDeleting }: DeleteTeamDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-ui-field border border-ui-divider rounded-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-ui-fg mb-4">Delete Team</h3>
        <p className="text-[14px] text-ui-fg-secondary mb-4">
          Are you sure you want to delete <strong>{team.name}</strong>? This will remove all{' '}
          {team.member_count} members from the team and delete all associated permissions.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete Team'}
          </Button>
        </div>
      </div>
    </div>
  )
}
