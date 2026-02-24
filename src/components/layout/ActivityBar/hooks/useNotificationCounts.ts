import { useEffect } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { getPendingReviewsForUser } from '@/lib/supabase'
import { log } from '@/lib/logger'

/**
 * Hook to load and periodically refresh pending review counts for the badge
 */
export function useNotificationCounts() {
  const user = usePDMStore(s => s.user)
  const organization = usePDMStore(s => s.organization)
  const pendingReviewCount = usePDMStore(s => s.pendingReviewCount)
  const setPendingReviewCount = usePDMStore(s => s.setPendingReviewCount)

  useEffect(() => {
    if (!user?.id || !organization?.id) return
    
    const loadCounts = async () => {
      try {
        const { reviews } = await getPendingReviewsForUser(user.id, organization.id)
        setPendingReviewCount(reviews.length)
      } catch (err) {
        log.error('[Reviews]', 'Error loading review counts:', { error: err })
      }
    }
    
    loadCounts()
    
    const interval = setInterval(loadCounts, 60000)
    return () => clearInterval(interval)
  }, [user?.id, organization?.id, setPendingReviewCount])

  return { pendingReviewCount, totalBadge: pendingReviewCount }
}
