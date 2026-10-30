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
  onEdit,
}: LicenseTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-ui-divider text-left text-[13px]">
            <th className="py-2 pl-4 pr-4 font-medium text-ui-fg-secondary">License</th>
            <th className="py-2 pr-4 font-medium text-ui-fg-secondary">Serial Number</th>
            <th className="py-2 pr-4 font-medium text-ui-fg-secondary">Type</th>
            <th className="py-2 pr-4 font-medium text-ui-fg-secondary">Assigned To</th>
            {isAdmin && <th className="py-2 pr-4 font-medium text-ui-fg-secondary text-right">Actions</th>}
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
