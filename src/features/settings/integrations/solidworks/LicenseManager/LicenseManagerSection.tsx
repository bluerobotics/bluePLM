import { useState } from 'react'
import { Key, Plus, Loader2, AlertCircle, Info } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useLicenseManager } from './useLicenseManager'
import { LicenseTable } from './LicenseTable'
import { AddLicenseModal } from './AddLicenseModal'
import { EditLicenseModal } from './EditLicenseModal'
import { AssignLicenseModal } from './AssignLicenseModal'
import type { LicenseWithAssignment } from './types'

export function LicenseManagerSection() {
  const { getEffectiveRole, user } = usePDMStore()
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
    unassignPendingLicense
  } = useLicenseManager()
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingLicense, setEditingLicense] = useState<LicenseWithAssignment | null>(null)
  const [assigningLicense, setAssigningLicense] = useState<LicenseWithAssignment | null>(null)
  
  // Filter licenses for non-admins: only show assigned to them
  const visibleLicenses = isAdmin 
    ? licenses 
    : licenses.filter(l => l.assignment?.user_id === user?.id)
  
  // Check if section should be visible (admin or has assigned licenses)
  const shouldShow = isAdmin || visibleLicenses.length > 0
  
  if (!shouldShow) {
    return null
  }
  
  return (
    <div className="space-y-3">
      <label className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
        SOLIDWORKS Licenses {isAdmin ? '(Organization-wide)' : ''}
      </label>
      
      <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4 min-h-[300px]">
        {/* Header with description and buttons */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Key size={20} className="text-plm-fg-muted mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-plm-fg-muted">
                {isAdmin 
                  ? 'Track and assign SOLIDWORKS license keys for your organization.'
                  : 'Your assigned SOLIDWORKS licenses.'
                }
              </p>
            </div>
          </div>
          
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-plm-accent text-white rounded-lg hover:bg-plm-accent/80 transition-colors flex-shrink-0"
            >
              <Plus size={16} />
              Add License
            </button>
          )}
        </div>
        
        {/* Info note about activation */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-plm-bg-secondary/50 border border-plm-border text-sm">
          <Info size={16} className="text-plm-fg-muted mt-0.5 flex-shrink-0" />
          <p className="text-plm-fg-muted">
            All license activations and deactivations must be done through the SOLIDWORKS License Manager (Start Menu → SOLIDWORKS Tools). This list is for tracking and assignment only.
          </p>
        </div>
        
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-plm-fg-muted">
            <Loader2 size={24} className="animate-spin mr-2" />
            Loading licenses...
          </div>
        )}
        
        {/* Error state */}
        {error && !isLoading && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        )}
        
        {/* Empty state */}
        {!isLoading && !error && visibleLicenses.length === 0 && (
          <div className="text-center py-8">
            <Key size={32} className="mx-auto mb-3 text-plm-fg-dim" />
            <p className="text-sm text-plm-fg-muted">
              {isAdmin 
                ? 'No licenses added yet. Click "Add License" to get started.'
                : 'No licenses assigned to you.'
              }
            </p>
          </div>
        )}
        
        {/* License table */}
        {!isLoading && !error && visibleLicenses.length > 0 && (
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
                  license.id
                )
              }
            }}
            onEdit={(license) => setEditingLicense(license)}
          />
        )}
      </div>
      
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
    </div>
  )
}
