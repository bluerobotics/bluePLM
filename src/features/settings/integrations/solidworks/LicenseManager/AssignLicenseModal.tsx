import { useState } from 'react'
import { X, Loader2, UserPlus, Search, Clock } from 'lucide-react'
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
  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase()
    return (
      user.email.toLowerCase().includes(query) ||
      (user.full_name?.toLowerCase().includes(query) ?? false)
    )
  })
  
  // Separate active and pending users
  const activeUsers = filteredUsers.filter(u => !u.is_pending)
  const pendingUsers = filteredUsers.filter(u => u.is_pending)
  
  const handleAssign = async () => {
    if (!selectedUserId) {
      setError('Please select a user')
      return
    }
    
    const user = users.find(u => u.id === selectedUserId)
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
  
  const selectedUser = users.find(u => u.id === selectedUserId)
  
  const renderUserRow = (user: OrgUser) => (
    <button
      key={user.id}
      onClick={() => setSelectedUserId(user.id)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        selectedUserId === user.id
          ? 'bg-plm-accent/10 border-l-2 border-plm-accent'
          : 'hover:bg-plm-bg border-l-2 border-transparent'
      }`}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-plm-bg-secondary">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.full_name || user.email}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm font-medium text-plm-fg">
            {getInitials(user.full_name || user.email)}
          </div>
        )}
      </div>
      
      {/* Name and email */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-plm-fg truncate">
            {user.full_name || user.email}
          </span>
          {user.is_pending && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
              <Clock size={10} />
              Pending
            </span>
          )}
        </div>
        {user.full_name && (
          <div className="text-xs text-plm-fg-muted truncate">
            {user.email}
          </div>
        )}
        {user.is_pending && (
          <div className="text-xs text-plm-fg-dim italic">
            Will be assigned when they sign up
          </div>
        )}
      </div>
    </button>
  )
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-plm-bg-secondary border border-plm-border rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-plm-border">
          <div className="flex items-center gap-3">
            <UserPlus size={20} className="text-plm-accent" />
            <h2 className="text-lg font-semibold text-plm-fg">Assign License</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-plm-fg-muted hover:text-plm-fg rounded-lg hover:bg-plm-bg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-4">
          {/* License info */}
          <div className="p-3 bg-plm-bg rounded-lg border border-plm-border">
            <div className="text-sm text-plm-fg-muted">License</div>
            <div className="text-plm-fg font-medium">
              {license.nickname || license.product_name || 'SOLIDWORKS License'}
            </div>
            <code className="text-xs text-plm-fg-dim font-mono mt-1 block">
              {formatSerialForDisplay(license.serial_number)}
            </code>
          </div>
          
          {/* Current assignment warning */}
          {license.assignment && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
              This license is currently assigned to{' '}
              <strong>{license.assignment.user?.full_name || license.assignment.user?.email}</strong>.
              Assigning to a new user will remove the current assignment.
            </div>
          )}
          
          {/* User search */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-plm-fg">
              Select User
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-plm-fg-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-10 pr-3 py-2 bg-plm-bg border border-plm-border rounded-lg text-sm text-plm-fg placeholder-plm-fg-dim focus:outline-none focus:border-plm-accent"
              />
            </div>
          </div>
          
          {/* User list */}
          <div className="border border-plm-border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-sm text-plm-fg-muted">
                {searchQuery ? 'No users found matching your search' : 'No users in organization'}
              </div>
            ) : (
              <>
                {/* Active users section */}
                {activeUsers.length > 0 && (
                  <>
                    {pendingUsers.length > 0 && (
                      <div className="px-4 py-2 text-xs font-medium text-plm-fg-muted uppercase tracking-wide bg-plm-bg-secondary/50 border-b border-plm-border">
                        Active Members
                      </div>
                    )}
                    {activeUsers.map(renderUserRow)}
                  </>
                )}
                
                {/* Pending users section */}
                {pendingUsers.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-xs font-medium text-plm-fg-muted uppercase tracking-wide bg-plm-bg-secondary/50 border-b border-plm-border flex items-center gap-2">
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
            <div className="p-3 bg-plm-accent/10 border border-plm-accent/30 rounded-lg flex items-center gap-3">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-plm-bg-secondary">
                {selectedUser.avatar_url ? (
                  <img
                    src={selectedUser.avatar_url}
                    alt={selectedUser.full_name || selectedUser.email}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-medium text-plm-accent">
                    {getInitials(selectedUser.full_name || selectedUser.email)}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-plm-accent mb-0.5">Selected</div>
                <div className="text-sm text-plm-fg font-medium flex items-center gap-2">
                  {selectedUser.full_name || selectedUser.email}
                  {selectedUser.is_pending && (
                    <span className="text-xs text-yellow-400">(Pending)</span>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-plm-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedUserId || isAssigning}
            className="flex items-center gap-2 px-4 py-2 bg-plm-accent text-white rounded-lg hover:bg-plm-accent/80 transition-colors disabled:opacity-50"
          >
            {isAssigning && <Loader2 size={16} className="animate-spin" />}
            Assign License
          </button>
        </div>
      </div>
    </div>
  )
}
