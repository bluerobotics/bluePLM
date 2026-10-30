import { useState } from 'react'
import { X, UserPlus, Search, Clock } from 'lucide-react'

import { Button } from '@/components/core/ui'
import { getInitials } from '@/lib/utils'
import type { LicenseWithAssignment, OrgUser } from './types'

interface AssignLicenseModalProps {
  license: LicenseWithAssignment
  users: OrgUser[]
  onClose: () => void
  onAssign: (userId: string, isPending: boolean) => Promise<{ success: boolean; error?: string }>
}

/**
 * Formats a serial number with spaces every 4 characters for display.
 */
function formatSerialForDisplay(serial: string): string {
  const clean = serial.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const parts: string[] = []
  for (let i = 0; i < clean.length; i += 4) {
    parts.push(clean.slice(i, i + 4))
  }
  return parts.join(' ')
}

export function AssignLicenseModal({ license, users, onClose, onAssign }: AssignLicenseModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter users by search query
  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase()
    return (
      user.email.toLowerCase().includes(query) ||
      (user.full_name?.toLowerCase().includes(query) ?? false)
    )
  })

  // Separate active and pending users
  const activeUsers = filteredUsers.filter((u) => !u.is_pending)
  const pendingUsers = filteredUsers.filter((u) => u.is_pending)

  const handleAssign = async () => {
    if (!selectedUserId) {
      setError('Please select a user')
      return
    }

    const user = users.find((u) => u.id === selectedUserId)
    if (!user) {
      setError('User not found')
      return
    }

    setError(null)
    setIsAssigning(true)

    const result = await onAssign(selectedUserId, user.is_pending)

    setIsAssigning(false)

    if (!result.success) {
      setError(result.error || 'Failed to assign license')
    }
  }

  const selectedUser = users.find((u) => u.id === selectedUserId)

  const renderUserRow = (user: OrgUser) => (
    <button
      key={user.id}
      onClick={() => setSelectedUserId(user.id)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        selectedUserId === user.id
          ? 'bg-ui-accent/10 border-l-2 border-ui-accent'
          : 'hover:bg-ui-bg border-l-2 border-transparent'
      }`}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-ui-field">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.full_name || user.email}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[13px] font-medium text-ui-fg">
            {getInitials(user.full_name || user.email)}
          </div>
        )}
      </div>

      {/* Name and email */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ui-fg truncate">{user.full_name || user.email}</span>
          {user.is_pending && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[12px] rounded">
              <Clock size={10} />
              Pending
            </span>
          )}
        </div>
        {user.full_name && <div className="text-[12px] text-ui-fg-secondary truncate">{user.email}</div>}
        {user.is_pending && (
          <div className="text-[12px] text-ui-fg italic">Will be assigned when they sign up</div>
        )}
      </div>
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-ui-field border border-ui-divider rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ui-divider">
          <div className="flex items-center gap-3">
            <UserPlus size={20} className="text-ui-accent" />
            <h2 className="text-lg font-semibold text-ui-fg">Assign License</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ui-fg-secondary hover:text-ui-fg rounded-lg hover:bg-ui-bg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* License info */}
          <div className="p-3 bg-ui-bg rounded-lg border border-ui-divider">
            <div className="text-[13px] text-ui-fg-secondary">License</div>
            <div className="text-ui-fg font-medium">
              {license.nickname || license.product_name || 'SOLIDWORKS License'}
            </div>
            <code className="text-[12px] text-ui-fg font-mono mt-1 block">
              {formatSerialForDisplay(license.serial_number)}
            </code>
          </div>

          {/* Current assignment warning */}
          {license.assignment && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[13px] text-yellow-400">
              This license is currently assigned to{' '}
              <strong>
                {license.assignment.user?.full_name || license.assignment.user?.email}
              </strong>
              . Assigning to a new user will remove the current assignment.
            </div>
          )}

          {/* User search */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-ui-fg">Select User</label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-secondary"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-10 pr-3 py-2 bg-ui-bg border border-ui-divider rounded-lg text-[13px] text-ui-fg placeholder-ui-fg focus:outline-none focus:border-ui-accent"
              />
            </div>
          </div>

          {/* User list */}
          <div className="border border-ui-divider rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-[13px] text-ui-fg-secondary">
                {searchQuery ? 'No users found matching your search' : 'No users in organization'}
              </div>
            ) : (
              <>
                {/* Active users section */}
                {activeUsers.length > 0 && (
                  <>
                    {pendingUsers.length > 0 && (
                      <div className="px-4 py-2 text-[12px] font-medium text-ui-fg-secondary uppercase tracking-wide bg-ui-field/50 border-b border-ui-divider">
                        Active Members
                      </div>
                    )}
                    {activeUsers.map(renderUserRow)}
                  </>
                )}

                {/* Pending users section */}
                {pendingUsers.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-[12px] font-medium text-ui-fg-secondary uppercase tracking-wide bg-ui-field/50 border-b border-ui-divider flex items-center gap-2">
                      <Clock size={12} />
                      Pending Invites
                    </div>
                    {pendingUsers.map(renderUserRow)}
                  </>
                )}
              </>
            )}
          </div>

          {/* Selected user preview */}
          {selectedUser && (
            <div className="p-3 bg-ui-accent/10 border border-ui-accent/30 rounded-lg flex items-center gap-3">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-ui-field">
                {selectedUser.avatar_url ? (
                  <img
                    src={selectedUser.avatar_url}
                    alt={selectedUser.full_name || selectedUser.email}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[13px] font-medium text-ui-accent">
                    {getInitials(selectedUser.full_name || selectedUser.email)}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[12px] text-ui-accent mb-0.5">Selected</div>
                <div className="text-[13px] text-ui-fg font-medium flex items-center gap-2">
                  {selectedUser.full_name || selectedUser.email}
                  {selectedUser.is_pending && (
                    <span className="text-[12px] text-yellow-400">(Pending)</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[13px]">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ui-divider">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleAssign}
            disabled={!selectedUserId}
            loading={isAssigning}
          >
            Assign License
          </Button>
        </div>
      </div>
    </div>
  )
}
