import { LicenseRow } from './LicenseRow'
import type { LicenseWithAssignment } from './types'

interface LicenseTableProps {
  licenses: LicenseWithAssignment[]
  isAdmin: boolean
  onDelete: (licenseId: string) => Promise<{ success: boolean }>
  onAssign: (license: LicenseWithAssignment) => void
  onUnassign: (license: LicenseWithAssignment) => Promise<void>
  onUnassignPending: (license: LicenseWithAssignment) => Promise<void>
  onEdit: (license: LicenseWithAssignment) => void
}

export function LicenseTable({
  licenses,
  isAdmin,
  onDelete,
  onAssign,
  onUnassign,
  onUnassignPending,
  onEdit
}: LicenseTableProps) {
  return (
    <div className="overflow-x-auto min-h-[200px]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-plm-border text-left">
            <th className="pb-3 font-medium text-plm-fg-muted">License</th>
            <th className="pb-3 font-medium text-plm-fg-muted">Serial Number</th>
            <th className="pb-3 font-medium text-plm-fg-muted">Type</th>
            <th className="pb-3 font-medium text-plm-fg-muted">Assigned To</th>
            {isAdmin && (
              <th className="pb-3 font-medium text-plm-fg-muted text-right">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {licenses.map((license) => (
            <LicenseRow
              key={license.id}
              license={license}
              isAdmin={isAdmin}
              onDelete={() => onDelete(license.id)}
              onAssign={() => onAssign(license)}
              onUnassign={() => onUnassign(license)}
              onUnassignPending={() => onUnassignPending(license)}
              onEdit={() => onEdit(license)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
