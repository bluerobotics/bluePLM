/**
 * ReviewsDashboard - Source Files group sidebar view for tracking file reviews.
 *
 * Provides a comprehensive dashboard showing files out for review with:
 * - Filter bar: "My Reviews" / "All Reviews" toggle, status filter, search
 * - Stats row: Pending, Approved, Rejected, Overdue counts
 * - File list with expandable reviewer details and action buttons
 * - Empty and loading states
 *
 * This is a NEW view under Source Files, distinct from the existing
 * `ReviewsView` in change-control (which has Notifications/Pending/My Requests tabs).
 */

import { useCallback } from 'react'
import {
  RefreshCw,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Loader2,
  Inbox,
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useReviewsDashboard } from './hooks/useReviewsDashboard'
import { ReviewFileRow } from './components/ReviewFileRow'
import type { StatusFilter, ReviewScope } from './hooks/useReviewsDashboard'

// ============================================================================
// Subcomponents
// ============================================================================

/** Stat card for the stats row */
function StatCard({ label, count, icon, color }: {
  label: string
  count: number
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md bg-plm-bg-light border border-plm-border`}>
      <span className={color}>{icon}</span>
      <div className="text-left">
        <span className="text-xs font-semibold text-plm-fg leading-none">{count}</span>
        <span className="text-[9px] text-plm-fg-muted ml-1">{label}</span>
      </div>
    </div>
  )
}

/** Scope toggle button pair */
function ScopeToggle({ scope, onScopeChange }: {
  scope: ReviewScope
  onScopeChange: (scope: ReviewScope) => void
}) {
  return (
    <div className="flex rounded-md border border-plm-border overflow-hidden">
      <button
        onClick={() => onScopeChange('mine')}
        className={`px-2 py-1 text-[10px] font-medium transition-colors ${
          scope === 'mine'
            ? 'bg-plm-accent text-white'
            : 'bg-plm-bg-light text-plm-fg-muted hover:text-plm-fg'
        }`}
      >
        My Reviews
      </button>
      <button
        onClick={() => onScopeChange('all')}
        className={`px-2 py-1 text-[10px] font-medium transition-colors border-l border-plm-border ${
          scope === 'all'
            ? 'bg-plm-accent text-white'
            : 'bg-plm-bg-light text-plm-fg-muted hover:text-plm-fg'
        }`}
      >
        All Reviews
      </button>
    </div>
  )
}

/** Status filter pills */
function StatusFilterPills({ current, onChange }: {
  current: StatusFilter
  onChange: (filter: StatusFilter) => void
}) {
  const filters: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ]

  return (
    <div className="flex gap-1">
      {filters.map(f => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${
            current === f.value
              ? 'bg-plm-accent/20 text-plm-accent border border-plm-accent/40'
              : 'bg-plm-bg-light text-plm-fg-muted hover:text-plm-fg border border-plm-border'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

/** Empty state */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-plm-accent/10 flex items-center justify-center mb-3">
        {hasFilters ? (
          <Search size={24} className="text-plm-accent" />
        ) : (
          <Inbox size={24} className="text-plm-accent" />
        )}
      </div>
      <p className="text-sm font-medium text-plm-fg">
        {hasFilters ? 'No matching reviews' : 'No reviews found'}
      </p>
      <p className="text-xs text-plm-fg-muted mt-1">
        {hasFilters
          ? 'Try adjusting your filters or search query'
          : 'Right-click a file in the Explorer to request a review'}
      </p>
    </div>
  )
}

/** Loading skeleton */
function LoadingSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 size={24} className="animate-spin text-plm-accent" />
      <p className="text-xs text-plm-fg-muted mt-2">Loading reviews...</p>
    </div>
  )
}

/** Error state */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-plm-error/10 flex items-center justify-center mb-3">
        <AlertTriangle size={24} className="text-plm-error" />
      </div>
      <p className="text-sm font-medium text-plm-fg">Failed to load reviews</p>
      <p className="text-xs text-plm-fg-muted mt-1 max-w-[200px]">{message}</p>
      <button
        onClick={onRetry}
        className="mt-3 px-3 py-1.5 text-xs font-medium text-plm-accent hover:text-plm-accent/80 flex items-center gap-1"
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  )
}

/** Not authenticated state */
function NotAuthenticatedState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-plm-fg-muted/10 flex items-center justify-center mb-3">
        <MessageSquare size={24} className="text-plm-fg-muted" />
      </div>
      <p className="text-sm font-medium text-plm-fg">Sign in to view reviews</p>
      <p className="text-xs text-plm-fg-muted mt-1">
        Connect to your organization to see file review status
      </p>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ReviewsDashboard() {
  const user = usePDMStore(s => s.user)
  const activeReviewId = usePDMStore(s => s.reviewPreviewFile?.reviewId ?? null)

  const {
    filteredReviews,
    stats,
    isLoading,
    error,
    scope,
    setScope,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    refresh,
    handleRespond,
    handleCancel,
    previewFile,
    navigateToFile,
    openFileExternally,
  } = useReviewsDashboard()

  // Whether any filter is actively reducing results
  const hasActiveFilters = statusFilter !== 'all' || searchQuery.trim() !== ''

  const handleRefresh = useCallback(() => {
    refresh()
  }, [refresh])

  if (!user) {
    return <NotAuthenticatedState />
  }

  return (
    <div className="flex flex-col h-full text-left">
      {/* ------------------------------------------------------------------ */}
      {/* Filter bar */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-3 py-2 space-y-2 border-b border-plm-border bg-plm-sidebar">
        {/* Top row: scope toggle + refresh */}
        <div className="flex items-center justify-between gap-2">
          <ScopeToggle scope={scope} onScopeChange={setScope} />
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1.5 text-plm-fg-muted hover:text-plm-fg rounded transition-colors"
            title="Refresh reviews"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Status filter pills */}
        <StatusFilterPills current={statusFilter} onChange={setStatusFilter} />

        {/* Search box */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-plm-fg-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by file name, title, or user..."
            className="w-full pl-6 pr-2 py-1.5 text-xs bg-plm-bg-light border border-plm-border rounded focus:outline-none focus:border-plm-accent placeholder:text-plm-fg-muted/60"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Stats row */}
      {/* ------------------------------------------------------------------ */}
      {!isLoading && !error && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-plm-border overflow-x-auto">
          <StatCard
            label="Pending"
            count={stats.pending}
            icon={<Clock size={12} />}
            color="text-plm-warning"
          />
          <StatCard
            label="Approved"
            count={stats.approved}
            icon={<CheckCircle2 size={12} />}
            color="text-plm-success"
          />
          <StatCard
            label="Rejected"
            count={stats.rejected}
            icon={<XCircle size={12} />}
            color="text-plm-error"
          />
          {stats.overdue > 0 && (
            <StatCard
              label="Overdue"
              count={stats.overdue}
              icon={<AlertTriangle size={12} />}
              color="text-plm-error"
            />
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Review list */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={handleRefresh} />
        ) : filteredReviews.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} />
        ) : (
          <div className="space-y-1.5 p-2">
            {filteredReviews.map(review => (
              <ReviewFileRow
                key={review.id}
                review={review}
                onPreview={previewFile}
                onNavigate={navigateToFile}
                onOpenExternal={openFileExternally}
                onRespond={handleRespond}
                onCancel={handleCancel}
                isActive={review.id === activeReviewId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
