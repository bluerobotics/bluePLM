/**
 * ReviewerResponseList - Read-only list of individual reviewer responses.
 *
 * Shows each reviewer's avatar, name, status, comment, and timestamp.
 * Action buttons (Approve / Kick Back) are rendered on the parent
 * ReviewFileRow, not inside this list.
 */

import { MessageSquare } from 'lucide-react'
import type { ReviewResponse } from '@/types/database'
import type { ReviewStatus } from '@/types/database'

// ============================================================================
// Types
// ============================================================================

interface ReviewerInfo {
  id?: string
  email: string
  full_name: string | null
  avatar_url: string | null
}

interface ResponseWithReviewer extends ReviewResponse {
  reviewer?: ReviewerInfo
}

interface ReviewerResponseListProps {
  /** Individual review responses with reviewer info */
  responses: ResponseWithReviewer[]
}

// ============================================================================
// Subcomponents
// ============================================================================

/** Avatar component matching existing pattern in the codebase */
function ReviewerAvatar({ user, size = 28 }: { user?: ReviewerInfo | null; size?: number }) {
  if (!user) return null

  const initials = user.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase()

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.full_name || user.email}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    )
  }

  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500',
    'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
  ]
  const colorIndex = user.email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length

  return (
    <div
      className={`${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-medium flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={user.full_name || user.email}
    >
      {initials}
    </div>
  )
}

/** Format a timestamp into a relative time string */
function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

/** Status badge label and class */
function getStatusBadge(status: ReviewStatus): { label: string; className: string } {
  switch (status) {
    case 'approved':
      return { label: 'Approved', className: 'text-plm-success bg-plm-success/10' }
    case 'rejected':
      return { label: 'Rejected', className: 'text-plm-error bg-plm-error/10' }
    case 'cancelled':
      return { label: 'Cancelled', className: 'text-plm-fg-muted bg-plm-fg-muted/10' }
    default:
      return { label: 'Pending', className: 'text-plm-warning bg-plm-warning/10' }
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function ReviewerResponseList({ responses }: ReviewerResponseListProps) {
  if (!responses || responses.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-plm-fg-muted text-center">
        No reviewers assigned
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-plm-fg-muted uppercase tracking-wide font-medium px-1">
        Reviewers ({responses.length})
      </p>

      {responses.map(response => {
        const badge = getStatusBadge(response.status as ReviewStatus)

        return (
          <div key={response.id} className="bg-plm-bg-light rounded-lg border border-plm-border">
            <div className="flex items-center gap-2 p-2">
              <ReviewerAvatar user={response.reviewer} size={28} />

              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-plm-fg truncate block">
                  {response.reviewer?.full_name || response.reviewer?.email || 'Unknown'}
                </span>
                {response.comment && (
                  <p className="text-[10px] text-plm-fg-muted truncate flex items-center gap-1">
                    <MessageSquare size={9} className="flex-shrink-0" />
                    {response.comment}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}>
                  {badge.label}
                </span>
                {response.responded_at && (
                  <span className="text-[10px] text-plm-fg-muted whitespace-nowrap">
                    {formatRelativeTime(response.responded_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
