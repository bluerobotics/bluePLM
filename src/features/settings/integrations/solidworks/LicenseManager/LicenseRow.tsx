import { useState } from 'react'
import { UserPlus, UserMinus, Trash2, Edit2, Check, Copy, Clock } from 'lucide-react'

import { Badge, Button } from '@/components/core/ui'
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
  onEdit,
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
    <tr className="group border-b border-plm-border last:border-0 hover:bg-plm-highlight/40">
      {/* License Name (nickname or fallback) */}
      <td className="py-2.5 pl-4 pr-4">
        <span className="text-plm-fg font-medium">{getDisplayName()}</span>
      </td>

      {/* Serial Number (formatted with spaces, with copy button) */}
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-2">
          <code className="text-[12px] font-mono text-plm-fg-muted tracking-wider">
            {formatSerialForDisplay(license.serial_number)}
          </code>
          <button
            onClick={handleCopySerial}
            className={`p-1 rounded transition-colors ${
              copied
                ? 'text-plm-success'
                : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight'
            }`}
            title={copied ? 'Copied!' : 'Copy serial number'}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </td>

      {/* Type */}
      <td className="py-2.5 pr-4 text-plm-fg-muted capitalize">
        {license.license_type || 'standalone'}
        {license.license_type === 'network' && license.seats && (
          <span className="text-plm-fg-dim ml-1">({license.seats} seats)</span>
        )}
      </td>

      {/* Assigned To */}
      <td className="py-2.5 pr-4">
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
              <div className="text-plm-fg text-sm truncate">
                {assignedUser.full_name || assignedUser.email}
              </div>
              {assignedUser.full_name && (
                <div className="text-xs text-plm-fg-dim truncate">{assignedUser.email}</div>
              )}
            </div>
          </div>
        ) : isPendingAssignment && pendingUser ? (
          <div className="flex items-center gap-2">
            {/* Avatar placeholder for pending user */}
            <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-plm-warning/15">
              <div className="w-full h-full flex items-center justify-center text-xs font-medium text-plm-warning">
                {getInitials(pendingUser.full_name || pendingUser.email)}
              </div>
            </div>
            {/* Name/Email with pending badge */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-plm-fg text-sm truncate">
                  {pendingUser.full_name || pendingUser.email}
                </span>
                <Badge tone="warning" icon={<Clock size={10} />}>
                  Pending
                </Badge>
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
      <td className="py-2.5 pr-4 text-right">
        {isAdmin && (
          <div className="flex items-center justify-end gap-0.5">
            {/* Assign/Unassign button */}
            {!isAssigned && !isPendingAssignment ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onAssign}
                title="Assign to user"
                aria-label="Assign to user"
                icon={<UserPlus size={14} />}
              />
            ) : isAssigned ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleUnassign}
                loading={isUnassigning}
                title="Unassign from user"
                aria-label="Unassign from user"
                icon={<UserMinus size={14} />}
              />
            ) : isPendingAssignment ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleUnassignPending}
                loading={isUnassigning}
                title="Remove pending assignment"
                aria-label="Remove pending assignment"
                icon={<UserMinus size={14} />}
              />
            ) : null}

            {/* Edit button - opens modal */}
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              title="Edit license"
              aria-label="Edit license"
              icon={<Edit2 size={14} />}
            />

            {/* Delete button */}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              loading={isDeleting}
              title="Delete license"
              aria-label="Delete license"
              className="hover:text-plm-error"
              icon={<Trash2 size={14} />}
            />
          </div>
        )}
      </td>
    </tr>
  )
}
