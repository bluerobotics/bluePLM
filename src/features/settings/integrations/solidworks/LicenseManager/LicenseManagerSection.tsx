import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button, Callout } from '@/components/core/ui'
import { SettingsGroup, SettingsSection } from '@/features/settings/components/ui'
import { usePDMStore } from '@/stores/pdmStore'

import { useLicenseManager } from './useLicenseManager'
import { LicenseTable } from './LicenseTable'
import { AddLicenseModal } from './AddLicenseModal'
import { EditLicenseModal } from './EditLicenseModal'
import { AssignLicenseModal } from './AssignLicenseModal'
import type { LicenseWithAssignment } from './types'

export function LicenseManagerSection() {
  const { getEffectiveRole, user } = usePDMStore(
    useShallow((s) => ({
      getEffectiveRole: s.getEffectiveRole,
      user: s.user,
    })),
  )
  const isAdmin = getEffectiveRole() === 'admin'

  const {
    licenses,
    orgUsers,
    isLoading,
    error,
    addLicense,
    updateLicense,
    deleteLicense,
    assignLicense,
    unassignLicense,
    unassignPendingLicense,
  } = useLicenseManager()

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingLicense, setEditingLicense] = useState<LicenseWithAssignment | null>(null)
  const [assigningLicense, setAssigningLicense] = useState<LicenseWithAssignment | null>(null)

  // Filter licenses for non-admins: only show assigned to them
  const visibleLicenses = isAdmin
    ? licenses
    : licenses.filter((l) => l.assignment?.user_id === user?.id)

  // Check if section should be visible (admin or has assigned licenses)
  const shouldShow = isAdmin || visibleLicenses.length > 0

  if (!shouldShow) {
    return null
  }

  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          <span>SOLIDWORKS Licenses</span>
          {isAdmin && <Badge>Organization-wide</Badge>}
        </span>
      }
      description={
        isAdmin
          ? 'Track and assign SOLIDWORKS license keys for your organization.'
          : 'Your assigned SOLIDWORKS licenses.'
      }
      actions={
        isAdmin ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => setShowAddModal(true)}
            icon={<Plus size={14} />}
          >
            Add License
          </Button>
        ) : undefined
      }
    >
      <Callout tone="info">
        All license activations and deactivations must be done through the SOLIDWORKS License
        Manager (Start Menu → SOLIDWORKS Tools). This list is for tracking and assignment only.
      </Callout>

      {error && !isLoading && <Callout tone="error">{error}</Callout>}

      {!error && (
        <SettingsGroup>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[14px] text-ui-fg-secondary">
              <Loader2 size={16} className="animate-spin" />
              Loading licenses...
            </div>
          ) : visibleLicenses.length === 0 ? (
            <div className="px-4 py-3 text-[14px] text-ui-fg-secondary">
              {isAdmin
                ? 'No licenses added yet. Click "Add License" to get started.'
                : 'No licenses assigned to you.'}
            </div>
          ) : (
            <LicenseTable
              licenses={visibleLicenses}
              isAdmin={isAdmin}
              onDelete={deleteLicense}
              onAssign={(license) => setAssigningLicense(license)}
              onUnassign={async (license) => {
                if (license.assignment) {
                  await unassignLicense(license.assignment.id)
                }
              }}
              onUnassignPending={async (license) => {
                if (license.pendingAssignment) {
                  await unassignPendingLicense(
                    license.pendingAssignment.pending_member_id,
                    license.id,
                  )
                }
              }}
              onEdit={(license) => setEditingLicense(license)}
            />
          )}
        </SettingsGroup>
      )}

      {/* Add License Modal */}
      {showAddModal && (
        <AddLicenseModal
          users={orgUsers}
          onClose={() => setShowAddModal(false)}
          onSave={async (data, assignToUserId, isPending) => {
            const result = await addLicense(data)
            if (result.success) {
              // If a user was selected and we got the license ID, assign immediately
              if (assignToUserId && result.licenseId) {
                await assignLicense(result.licenseId, assignToUserId, isPending)
              }
              setShowAddModal(false)
            }
            return result
          }}
        />
      )}

      {/* Edit License Modal */}
      {editingLicense && (
        <EditLicenseModal
          license={editingLicense}
          onClose={() => setEditingLicense(null)}
          onSave={async (updates) => {
            const result = await updateLicense(editingLicense.id, updates)
            return result
          }}
        />
      )}

      {/* Assign License Modal */}
      {assigningLicense && (
        <AssignLicenseModal
          license={assigningLicense}
          users={orgUsers}
          onClose={() => setAssigningLicense(null)}
          onAssign={async (userId: string, isPending: boolean) => {
            const result = await assignLicense(assigningLicense.id, userId, isPending)
            if (result.success) {
              setAssigningLicense(null)
            }
            return result
          }}
        />
      )}
    </SettingsSection>
  )
}
