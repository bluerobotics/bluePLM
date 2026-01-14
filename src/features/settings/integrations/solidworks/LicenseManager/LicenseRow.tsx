import { useState } from 'react'
import { 
  UserPlus, 
  UserMinus, 
  Trash2, 
  Loader2,
  Edit2,
  Check,
  Copy,
  Clock
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import type { LicenseWithAssignment } from './types'

interface LicenseRowProps {
  license: LicenseWithAssignment
  isAdmin: boolean
  onDelete: () => Promise<{ success: boolean }>
  onAssign: () => void
  onUnassign: () => Promise<void>
  onUnassignPending: () => Promise<void>
  onEdit: () => void
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

export function LicenseRow({
  license,
  isAdmin,
  onDelete,
  onAssign,
  onUnassign,
  onUnassignPending,
  onEdit
}: LicenseRowProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUnassigning, setIsUnassigning] = useState(false)
  const [copied, setCopied] = useState(false)
  
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this license?')) return
    setIsDeleting(true)
    await onDelete()
    setIsDeleting(false)
  }
  
  const handleUnassign = async () => {
    if (!confirm('Unassign this license from the user?')) return
    setIsUnassigning(true)
    await onUnassign()
    setIsUnassigning(false)
  }
  
  const handleUnassignPending = async () => {
    if (!confirm('Remove this pending assignment?')) return
    setIsUnassigning(true)
    await onUnassignPending()
    setIsUnassigning(false)
  }
  
  const handleCopySerial = async () => {
    try {
      await navigator.clipboard.writeText(license.serial_number)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = license.serial_number
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  
  const assignedUser = license.assignment?.user
  const pendingUser = license.pendingAssignment
  const isAssigned = !!assignedUser
  const isPendingAssignment = !!pendingUser && !isAssigned
  
  // Get display name for the license (fallback chain: nickname -> product -> truncated serial)
  const getDisplayName = () => {
    if (license.nickname) return license.nickname
    if (license.product_name) return license.product_name
    return `License ...${license.serial_number.slice(-8)}`
  }
  
  return (
    <tr className="border-b border-plm-border/50 hover:bg-plm-bg-secondary/30 group">
      {/* License Name (nickname or fallback) */}
      <td className="py-3 pr-4">
        <span className="text-plm-fg font-medium">
          {getDisplayName()}
        </span>
      </td>
      
      {/* Serial Number (formatted with spaces, with copy button) */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-plm-fg-muted bg-plm-bg-secondary px-2 py-1 rounded tracking-wider">
            {formatSerialForDisplay(license.serial_number)}
          </code>
          <button
            onClick={handleCopySerial}
            className={`p-1 rounded transition-colors ${
              copied 
                ? 'text-green-400' 
                : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-secondary'
            }`}
            title={copied ? 'Copied!' : 'Copy serial number'}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </td>
      
      {/* Type */}
      <td className="py-3 pr-4 text-plm-fg-muted capitalize">
        {license.license_type || 'standalone'}
        {license.license_type === 'network' && license.seats && (
          <span className="text-plm-fg-dim ml-1">({license.seats} seats)</span>
        )}
      </td>
      
      {/* Assigned To */}
      <td className="py-3 pr-4">
        {assignedUser ? (
          <div className="flex items-center gap-2">
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-plm-bg-secondary">
              {assignedUser.avatar_url ? (
                <img
                  src={assignedUser.avatar_url}
                  alt={assignedUser.full_name || assignedUser.email}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-medium text-plm-accent bg-plm-accent/20">
                  {getInitials(assignedUser.full_name || assignedUser.email)}
                </div>
              )}
            </div>
            {/* Name/Email */}
            <div className="min-w-0">
              <div className="text-plm-fg text-sm truncate">{assignedUser.full_name || assignedUser.email}</div>
              {assignedUser.full_name && (
                <div className="text-xs text-plm-fg-dim truncate">{assignedUser.email}</div>
              )}
            </div>
          </div>
        ) : isPendingAssignment && pendingUser ? (
          <div className="flex items-center gap-2">
            {/* Avatar placeholder for pending user */}
            <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-yellow-500/20 border border-yellow-500/30">
              <div className="w-full h-full flex items-center justify-center text-xs font-medium text-yellow-400">
                {getInitials(pendingUser.full_name || pendingUser.email)}
              </div>
            </div>
            {/* Name/Email with pending badge */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-plm-fg text-sm truncate">{pendingUser.full_name || pendingUser.email}</span>
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] rounded flex-shrink-0">
                  <Clock size={10} />
                  Pending
                </span>
              </div>
              {pendingUser.full_name && (
                <div className="text-xs text-plm-fg-dim truncate">{pendingUser.email}</div>
              )}
            </div>
          </div>
        ) : (
          <span className="text-plm-fg-dim">—</span>
        )}
      </td>
      
      {/* Actions - Admin only */}
      <td className="py-3 text-right">
        {isAdmin && (
          <div className="flex items-center justify-end gap-1">
            {/* Assign/Unassign button */}
            {!isAssigned && !isPendingAssignment ? (
              <button
                onClick={onAssign}
                className="p-2 text-plm-fg-muted hover:text-plm-accent hover:bg-plm-bg-secondary rounded-lg transition-colors"
                title="Assign to user"
              >
                <UserPlus size={16} />
              </button>
            ) : isAssigned ? (
              <button
                onClick={handleUnassign}
                disabled={isUnassigning}
                className="p-2 text-plm-fg-muted hover:text-yellow-400 hover:bg-plm-bg-secondary rounded-lg transition-colors disabled:opacity-50"
                title="Unassign from user"
              >
                {isUnassigning ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <UserMinus size={16} />
                )}
              </button>
            ) : isPendingAssignment ? (
              <button
                onClick={handleUnassignPending}
                disabled={isUnassigning}
                className="p-2 text-plm-fg-muted hover:text-yellow-400 hover:bg-plm-bg-secondary rounded-lg transition-colors disabled:opacity-50"
                title="Remove pending assignment"
              >
                {isUnassigning ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <UserMinus size={16} />
                )}
              </button>
            ) : null}
            
            {/* Edit button - opens modal */}
            <button
              onClick={onEdit}
              className="p-2 text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-secondary rounded-lg transition-colors"
              title="Edit license"
            >
              <Edit2 size={16} />
            </button>
            
            {/* Delete button */}
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-2 text-plm-fg-muted hover:text-red-400 hover:bg-plm-bg-secondary rounded-lg transition-colors disabled:opacity-50"
              title="Delete license"
            >
              {isDeleting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}
