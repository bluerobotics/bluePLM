import { RotateCcw } from 'lucide-react'

import { Button, Callout } from '@/components/core/ui'

interface RestoreActionBarProps {
  selectedSnapshot: string
  isRestoring: boolean
  onRestore: () => void
  onCancel: () => void
}

/**
 * Confirmation bar shown when a snapshot is selected for restoration.
 */
export function RestoreActionBar({
  selectedSnapshot,
  isRestoring,
  onRestore,
  onCancel,
}: RestoreActionBarProps) {
  return (
    <Callout
      tone="warning"
      title={`Ready to restore snapshot ${selectedSnapshot.substring(0, 8)}`}
      action={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onCancel} disabled={isRestoring}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={onRestore}
            loading={isRestoring}
            icon={<RotateCcw size={12} />}
          >
            {isRestoring ? 'Restoring...' : 'Restore Now'}
          </Button>
        </div>
      }
    >
      This will overwrite current files with the backed-up versions.
    </Callout>
  )
}
