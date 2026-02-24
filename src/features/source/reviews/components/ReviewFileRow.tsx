/**
 * ReviewFileRow - A single review entry in the Reviews Dashboard.
 *
 * Displays: part number, revision, version, description, filename,
 * status badge, priority, due date, requester, and reviewer chips.
 *
 * Click opens the PDF preview. Right-click shows a context menu.
 * Action buttons (Approve, Kick Back, Remove) are visible on the right.
 */

import { useState, useCallback, useRef, useEffect, memo } from 'react'
import {
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  X,
  AlertTriangle,
  Trash2,
  FolderOpen,
  ExternalLink,
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import type { ReviewWithDetails, ReviewStatus } from '@/types/database'

// ============================================================================
// Types
// ============================================================================

interface ReviewFileRowProps {
  review: ReviewWithDetails
  /** Preview the file in the full-screen PDF viewer (click) */
  onPreview: (review: ReviewWithDetails) => void
  /** Navigate to the file in the explorer sidebar (context menu) */
  onNavigate: (filePath: string | undefined) => void
  /** Open the file externally (e.g., in SolidWorks) */
  onOpenExternal: (filePath: string | undefined) => void
  /** Respond to a review response (approve/reject) */
  onRespond: (reviewResponseId: string, status: 'approved' | 'rejected', comment?: string) => Promise<boolean>
  /** Cancel a review (requester only) */
  onCancel: (reviewId: string) => Promise<boolean>
  /** Whether this review row is currently active/selected */
  isActive?: boolean
}

// ============================================================================
// Subcomponents
// ============================================================================

/** Small avatar circle for reviewer chip display */
function AvatarChip({ user, status, size = 22 }: {
  user?: { email: string; full_name: string | null; avatar_url: string | null } | null
  status?: ReviewStatus
  size?: number
}) {
  if (!user) return null

  const initials = user.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase()

  const statusBorderColor =
    status === 'approved' ? 'ring-plm-success' :
    status === 'rejected' ? 'ring-plm-error' :
    'ring-plm-warning'

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.full_name || user.email}
        className={`rounded-full object-cover flex-shrink-0 ring-2 ${statusBorderColor}`}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        title={`${user.full_name || user.email} – ${status || 'pending'}`}
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
      className={`${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-medium flex-shrink-0 ring-2 ${statusBorderColor}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      title={`${user.full_name || user.email} – ${status || 'pending'}`}
    >
      {initials}
    </div>
  )
}

/** Overall status badge */
function StatusBadge({ status }: { status: ReviewStatus }) {
  const config: Record<ReviewStatus, { label: string; className: string; icon: React.ReactNode }> = {
    pending: {
      label: 'Pending',
      className: 'bg-plm-warning/15 text-plm-warning border-plm-warning/30',
      icon: <Clock size={10} />,
    },
    approved: {
      label: 'Approved',
      className: 'bg-plm-success/15 text-plm-success border-plm-success/30',
      icon: <CheckCircle2 size={10} />,
    },
    rejected: {
      label: 'Rejected',
      className: 'bg-plm-error/15 text-plm-error border-plm-error/30',
      icon: <XCircle size={10} />,
    },
    cancelled: {
      label: 'Cancelled',
      className: 'bg-plm-fg-muted/15 text-plm-fg-muted border-plm-fg-muted/30',
      icon: <X size={10} />,
    },
  }

  const c = config[status] || config.pending
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${c.className}`}>
      {c.icon}
      {c.label}
    </span>
  )
}

/** Priority indicator */
function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority || priority === 'normal') return null

  const config: Record<string, { label: string; className: string }> = {
    low: { label: 'LOW', className: 'bg-plm-fg-muted/20 text-plm-fg-muted' },
    high: { label: 'HIGH', className: 'bg-orange-500/20 text-orange-400' },
    urgent: { label: 'URGENT', className: 'bg-plm-error/20 text-plm-error' },
  }

  const c = config[priority]
  if (!c) return null

  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.className}`}>
      {c.label}
    </span>
  )
}

/** Due date display with overdue detection */
function DueDateBadge({ dueDate }: { dueDate?: string | null }) {
  if (!dueDate) return null

  const due = new Date(dueDate)
  const now = new Date()
  const isOverdue = due < now
  const isSoon = !isOverdue && due.getTime() - now.getTime() < 2 * 24 * 60 * 60 * 1000 // 2 days

  const className = isOverdue
    ? 'text-plm-error bg-plm-error/10'
    : isSoon
      ? 'text-plm-warning bg-plm-warning/10'
      : 'text-plm-fg-muted bg-plm-fg-muted/10'

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${className}`}>
      <Clock size={9} />
      {isOverdue && <AlertTriangle size={9} />}
      {due.toLocaleDateString()}
    </span>
  )
}

/** Format relative time */
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

// ============================================================================
// Main Component
// ============================================================================

export const ReviewFileRow = memo(function ReviewFileRow({
  review,
  onPreview,
  onNavigate,
  onOpenExternal,
  onRespond,
  onCancel,
  isActive,
}: ReviewFileRowProps) {
  const userId = usePDMStore(s => s.user?.id)

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return
    const handleClose = () => setContextMenu(null)
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null) }
    document.addEventListener('click', handleClose)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleClose)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  const handleClick = useCallback(() => {
    onPreview(review)
  }, [review, onPreview])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleOpenInBluePLM = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setContextMenu(null)
    onNavigate(review.file?.file_path)
  }, [review.file?.file_path, onNavigate])

  const handleOpenExternally = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setContextMenu(null)
    onOpenExternal(review.file?.file_path)
  }, [review.file?.file_path, onOpenExternal])

  const handleCancelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onCancel(review.id)
  }, [review.id, onCancel])

  const isRequester = userId === review.requested_by
  const isPending = review.status === 'pending'
  const responses = review.responses ?? []
  const approvedCount = responses.filter(r => r.status === 'approved').length
  const totalCount = responses.length

  // Find the current user's pending response (for approve/kick back actions)
  // Check both reviewer_id (direct column) and reviewer?.id (joined user object) as fallback
  const myPendingResponse = responses.find(
    r => (r.reviewer_id === userId || r.reviewer?.id === userId) && r.status === 'pending'
  )

  const handleApprove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (myPendingResponse) onRespond(myPendingResponse.id, 'approved')
  }, [myPendingResponse, onRespond])

  const handleKickBack = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (myPendingResponse) onRespond(myPendingResponse.id, 'rejected')
  }, [myPendingResponse, onRespond])

  // Border color based on status, with active highlight override
  const borderColor = isActive
    ? 'border-plm-accent bg-plm-accent/5'
    : review.status === 'approved' ? 'border-plm-success/30 hover:border-plm-success/50' :
      review.status === 'rejected' ? 'border-plm-error/30 hover:border-plm-error/50' :
      'border-plm-border hover:border-plm-accent/50'

  return (
    <div className={`bg-plm-bg-light border rounded-lg overflow-hidden transition-colors ${borderColor} relative`}>
      {/* Main area – click to preview, right-click for context menu */}
      <div
        className="p-2.5 cursor-pointer select-none"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title="Click to preview, right-click for more options"
      >
        <div className="flex items-start gap-2">
          {/* File info */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Part number | Rev | Version */}
            <div className="flex items-center gap-2">
              {review.file?.part_number && (
                <span className="text-[13px] font-bold text-plm-fg bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded flex-shrink-0">
                  {review.file.part_number}
                </span>
              )}
              {review.file?.revision && (
                <span className="text-[11px] font-bold bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded flex-shrink-0">
                  Rev {review.file.revision}
                </span>
              )}
              {review.file_version != null && (
                <span className="text-[11px] font-bold bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded flex-shrink-0">
                  v{review.file_version}
                </span>
              )}
            </div>

            {/* Row 2: Description */}
            {review.file?.description && (
              <p className="text-[11px] text-plm-fg mt-0.5 truncate">
                {review.file.description}
              </p>
            )}

            {/* Row 3: Filename */}
            <div className="flex items-center gap-1 mt-0.5">
              <FileText size={12} className="text-plm-fg-muted flex-shrink-0" />
              <span className="text-[11px] text-plm-fg-muted truncate">
                {review.file?.file_name || 'Unknown file'}
              </span>
            </div>

            {/* Status row: status badge, priority, due date */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <StatusBadge status={review.status as ReviewStatus} />
              <PriorityBadge priority={review.priority} />
              <DueDateBadge dueDate={review.due_date} />
            </div>

            {/* Requester + reviewer chips row */}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-plm-fg-muted">
                by {review.requester?.full_name || review.requester?.email?.split('@')[0] || 'Unknown'}
              </span>
              <span className="text-plm-fg-muted">·</span>
              <span className="text-[10px] text-plm-fg-muted">
                {formatRelativeTime(review.created_at ?? null)}
              </span>

              {/* Reviewer chips */}
              {totalCount > 0 && (
                <>
                  <span className="text-plm-fg-muted">·</span>
                  <div className="flex -space-x-1.5 items-center">
                    {responses.slice(0, 4).map(resp => (
                      <AvatarChip
                        key={resp.id}
                        user={resp.reviewer}
                        status={resp.status as ReviewStatus}
                        size={18}
                      />
                    ))}
                    {totalCount > 4 && (
                      <span className="text-[9px] text-plm-fg-muted ml-1">+{totalCount - 4}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-plm-fg-muted">
                    {approvedCount}/{totalCount}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Action buttons - right side */}
          {isPending && (
            <div className="flex flex-col gap-1.5 flex-shrink-0 ml-1">
              {myPendingResponse && (
                <>
                  <button
                    onClick={handleApprove}
                    className="px-3 py-1 text-[11px] font-medium text-plm-success bg-plm-success/15 hover:bg-plm-success/25 border border-plm-success/30 rounded transition-colors flex items-center gap-1"
                  >
                    <CheckCircle2 size={12} />
                    Approve
                  </button>
                  <button
                    onClick={handleKickBack}
                    className="px-3 py-1 text-[11px] font-medium text-plm-error bg-plm-error/15 hover:bg-plm-error/25 border border-plm-error/30 rounded transition-colors flex items-center gap-1"
                  >
                    <XCircle size={12} />
                    Kick Back
                  </button>
                </>
              )}
              {isRequester && (
                <button
                  onClick={handleCancelClick}
                  className="px-3 py-1 text-[11px] font-medium text-plm-fg-muted hover:text-plm-error bg-plm-fg-muted/10 hover:bg-plm-error/15 border border-plm-border rounded transition-colors flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[80] bg-plm-bg-light border border-plm-border rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleOpenInBluePLM}
            className="w-full px-3 py-1.5 text-xs text-plm-fg hover:bg-plm-accent/10 flex items-center gap-2 text-left transition-colors"
          >
            <FolderOpen size={14} className="text-plm-accent" />
            Open in BluePLM
          </button>
          <button
            onClick={handleOpenExternally}
            className="w-full px-3 py-1.5 text-xs text-plm-fg hover:bg-plm-accent/10 flex items-center gap-2 text-left transition-colors"
          >
            <ExternalLink size={14} className="text-plm-fg-muted" />
            Open Externally
          </button>
        </div>
      )}
    </div>
  )
})
