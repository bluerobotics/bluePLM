/**
 * useReviewsDashboard - Hook for managing Reviews Dashboard state and data.
 *
 * Fetches reviews using existing Supabase query functions, manages filter state
 * (my reviews vs all, status filter, search), auto-refreshes on a 60-second
 * interval, and computes aggregate stats (pending/approved/rejected/overdue).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { getMyReviews, getPendingReviewsForUser, respondToReview, cancelReview } from '@/lib/supabase'
import { log } from '@/lib/logger'
import type { ReviewWithDetails, ReviewStatus } from '@/types/database'

// ============================================================================
// Types
// ============================================================================

/** Filter mode: show reviews assigned to the current user or all reviews in the org */
export type ReviewScope = 'mine' | 'all'

/** Status filter options */
export type StatusFilter = 'all' | ReviewStatus

/** Computed statistics for the dashboard header */
export interface ReviewStats {
  pending: number
  approved: number
  rejected: number
  overdue: number
  total: number
}

/** Return value of the hook */
export interface UseReviewsDashboardReturn {
  // Data
  reviews: ReviewWithDetails[]
  filteredReviews: ReviewWithDetails[]
  stats: ReviewStats
  isLoading: boolean
  error: string | null

  // Filters
  scope: ReviewScope
  setScope: (scope: ReviewScope) => void
  statusFilter: StatusFilter
  setStatusFilter: (filter: StatusFilter) => void
  searchQuery: string
  setSearchQuery: (query: string) => void

  // Actions
  refresh: () => Promise<void>
  handleRespond: (reviewResponseId: string, status: 'approved' | 'rejected', comment?: string) => Promise<boolean>
  handleCancel: (reviewId: string) => Promise<boolean>

  // Navigation
  /** Preview a review file in the full-screen PDF viewer (double-click) */
  previewFile: (review: ReviewWithDetails) => void
  /** Navigate to the file in the Explorer sidebar (context menu "Open in BluePLM") */
  navigateToFile: (filePath: string | undefined) => void
  openFileExternally: (filePath: string | undefined) => void
}

// ============================================================================
// Constants
// ============================================================================

/** Auto-refresh interval in milliseconds */
const REFRESH_INTERVAL_MS = 60_000

// ============================================================================
// Hook
// ============================================================================

export function useReviewsDashboard(): UseReviewsDashboardReturn {
  // ---------------------------------------------------------------------------
  // Store selectors (fine-grained to avoid unnecessary re-renders)
  // ---------------------------------------------------------------------------
  const user = usePDMStore(s => s.user)
  const organization = usePDMStore(s => s.organization)
  const addToast = usePDMStore(s => s.addToast)
  const setActiveView = usePDMStore(s => s.setActiveView)
  const setCurrentFolder = usePDMStore(s => s.setCurrentFolder)
  const setSelectedFiles = usePDMStore(s => s.setSelectedFiles)
  const setReviewPreviewFile = usePDMStore(s => s.setReviewPreviewFile)
  const files = usePDMStore(s => s.files)
  const connectedVaults = usePDMStore(s => s.connectedVaults)
  const activeVaultId = usePDMStore(s => s.activeVaultId)
  const vaultPath = usePDMStore(s => s.vaultPath)

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------
  const [reviews, setReviews] = useState<ReviewWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<ReviewScope>('mine')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Ref to track the interval so we can clean it up
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  const fetchReviews = useCallback(async () => {
    if (!user?.id) return

    try {
      setError(null)

      // Fetch both sets in parallel for the "mine" view:
      // - Reviews I requested (requester)
      // - Reviews I need to respond to (reviewer)
      const [requesterResult, reviewerResult] = await Promise.all([
        getMyReviews(user.id, organization?.id ?? undefined),
        getPendingReviewsForUser(user.id, organization?.id ?? undefined),
      ])

      if (requesterResult.error) {
        log.warn('[ReviewsDashboard]', 'Error fetching requester reviews', { error: requesterResult.error })
      }
      if (reviewerResult.error) {
        log.warn('[ReviewsDashboard]', 'Error fetching reviewer reviews', { error: reviewerResult.error })
      }

      // Merge, de-duplicate by review ID
      const allReviews = [...(requesterResult.reviews ?? []), ...(reviewerResult.reviews ?? [])]
      const uniqueMap = new Map<string, ReviewWithDetails>()
      for (const review of allReviews) {
        // reviewer reviews come as nested { review: { ... } }, normalize
        const normalized = normalizeReview(review)
        if (normalized?.id && !uniqueMap.has(normalized.id)) {
          uniqueMap.set(normalized.id, normalized)
        }
      }

      const merged = Array.from(uniqueMap.values())
      // Sort by created_at descending
      merged.sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0
        return bDate - aDate
      })

      setReviews(merged)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load reviews'
      setError(message)
      log.error('[ReviewsDashboard]', 'Unexpected error fetching reviews', { error: err })
    }
  }, [user?.id, organization?.id])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    await fetchReviews()
    setIsLoading(false)
  }, [fetchReviews])

  // Initial load
  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-refresh interval
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      // Silent refresh (no loading state)
      fetchReviews()
    }, REFRESH_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchReviews])

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  const filteredReviews = useMemo(() => {
    let result = reviews

    // Scope filter: "mine" = reviews where the current user is a reviewer
    if (scope === 'mine' && user?.id) {
      result = result.filter(r =>
        r.responses?.some(resp => resp.reviewer?.email === user.email || (resp as Record<string, unknown>).reviewer_id === user.id)
        || r.requested_by === user.id
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(r => r.status === statusFilter)
    }

    // Search filter (file name)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(r =>
        r.file?.file_name?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.requester?.full_name?.toLowerCase().includes(q) ||
        r.requester?.email?.toLowerCase().includes(q)
      )
    }

    return result
  }, [reviews, scope, statusFilter, searchQuery, user?.id, user?.email])

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------
  const stats = useMemo<ReviewStats>(() => {
    const now = new Date()
    let pending = 0
    let approved = 0
    let rejected = 0
    let overdue = 0

    for (const review of filteredReviews) {
      switch (review.status) {
        case 'pending':
          pending++
          if (review.due_date && new Date(review.due_date) < now) {
            overdue++
          }
          break
        case 'approved':
          approved++
          break
        case 'rejected':
          rejected++
          break
      }
    }

    return { pending, approved, rejected, overdue, total: filteredReviews.length }
  }, [filteredReviews])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleRespond = useCallback(async (
    reviewResponseId: string,
    status: 'approved' | 'rejected',
    comment?: string,
  ): Promise<boolean> => {
    if (!user?.id) return false

    const { success, error: err } = await respondToReview(reviewResponseId, user.id, status, comment)
    if (success) {
      addToast('success', `Review ${status}`)
      await fetchReviews()
      return true
    } else {
      addToast('error', err || `Failed to ${status === 'approved' ? 'approve' : 'reject'} review`)
      return false
    }
  }, [user?.id, addToast, fetchReviews])

  const handleCancel = useCallback(async (reviewId: string): Promise<boolean> => {
    if (!user?.id) return false

    const { success, error: err } = await cancelReview(reviewId, user.id)
    if (success) {
      addToast('success', 'Review cancelled')
      await fetchReviews()
      return true
    } else {
      addToast('error', err || 'Failed to cancel review')
      return false
    }
  }, [user?.id, addToast, fetchReviews])

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  const getActiveVaultPath = useCallback((): string | null => {
    if (activeVaultId && connectedVaults.length > 0) {
      const vault = connectedVaults.find(v => v.id === activeVaultId)
      if (vault?.localPath) return vault.localPath
    }
    return vaultPath
  }, [connectedVaults, activeVaultId, vaultPath])

  const previewFile = useCallback((review: ReviewWithDetails) => {
    const filePath = review.file?.file_path
    if (!filePath) {
      addToast('error', 'File path not available')
      return
    }

    // Resolve the full local filesystem path
    const basePath = getActiveVaultPath()
    if (!basePath) {
      addToast('error', 'Cannot preview file: vault not connected')
      return
    }

    const sep = basePath.includes('\\') ? '\\' : '/'
    const fullPath = basePath + sep + filePath.replace(/\//g, sep)

    // Try to find the database file ID from the local files array
    const normalizedPath = filePath.replace(/\\/g, '/')
    const localFile = files.find(f => f.relativePath.replace(/\\/g, '/') === normalizedPath)
    const fileId = localFile?.pdmData?.id ?? review.file_id ?? null

    setReviewPreviewFile({
      filePath: fullPath,
      fileId,
      fileName: review.file?.file_name ?? filePath.split('/').pop() ?? 'Unknown',
      fileVersion: review.file_version ?? null,
      reviewId: review.id,
    })
  }, [files, addToast, getActiveVaultPath, setReviewPreviewFile])

  const navigateToFile = useCallback((filePath: string | undefined) => {
    if (!filePath) {
      addToast('error', 'File path not available')
      return
    }

    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/')
    const parts = normalizedPath.split('/')
    parts.pop()
    const parentFolder = parts.join('/')

    // Find the full local path
    const fullPath = files.find(f => f.relativePath.replace(/\\/g, '/') === normalizedPath)?.path

    setActiveView('explorer')
    setCurrentFolder(parentFolder)
    if (fullPath) {
      setSelectedFiles([fullPath])
    }
  }, [files, setActiveView, setCurrentFolder, setSelectedFiles, addToast])

  const openFileExternally = useCallback((filePath: string | undefined) => {
    if (!filePath) {
      addToast('error', 'File path not available')
      return
    }

    const basePath = getActiveVaultPath()
    if (!basePath) {
      addToast('error', 'Cannot open file: vault not connected')
      return
    }

    // Build full path
    const sep = basePath.includes('\\') ? '\\' : '/'
    const fullPath = basePath + sep + filePath.replace(/\//g, sep)
    window.electronAPI?.openFile(fullPath)
  }, [addToast, getActiveVaultPath])

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------
  return {
    reviews,
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
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Normalize a review object from potentially different query shapes.
 *
 * `getPendingReviewsForUser` returns a nested shape:
 *   { id, status, review: { id, title, ... file, requester } }
 *
 * `getMyReviews` returns a flat shape:
 *   { id, title, ... file, requester, responses }
 *
 * This function normalizes both to a flat `ReviewWithDetails`.
 */
function normalizeReview(raw: Record<string, unknown>): ReviewWithDetails | null {
  // Already a flat review
  if (raw.requested_by && raw.file) {
    return raw as unknown as ReviewWithDetails
  }

  // Nested shape from getPendingReviewsForUser
  if (raw.review && typeof raw.review === 'object') {
    const nested = raw.review as Record<string, unknown>
    return {
      ...nested,
      // Preserve the response-level status as a convenience field
    } as unknown as ReviewWithDetails
  }

  return null
}
