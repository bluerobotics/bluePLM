import { useEffect } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { getUnreadNotificationCount, getPendingReviewsForUser } from '@/lib/supabase'
import { log } from '@/lib/logger'

/**
 * Hook to load and periodically refresh notification counts
 */
export function useNotificationCounts() {
  // Selective selectors: only re-render when specific values change
  const user = usePDMStore(s => s.user)
  const organization = usePDMStore(s => s.organization)
  const unreadNotificationCount = usePDMStore(s => s.unreadNotificationCount)
  const pendingReviewCount = usePDMStore(s => s.pendingReviewCount)
  const setUnreadNotificationCount = usePDMStore(s => s.setUnreadNotificationCount)
  const setPendingReviewCount = usePDMStore(s => s.setPendingReviewCount)

  // Load notification counts on mount and periodically
  useEffect(() => {
    if (!user?.id || !organization?.id) return
    
    const loadCounts = async () => {
      try {
        const { count } = await getUnreadNotificationCount(user.id)
        setUnreadNotificationCount(count)
        
        const { reviews } = await getPendingReviewsForUser(user.id, organization.id)
        setPendingReviewCount(reviews.length)
      } catch (err) {
        log.error('[Notifications]', 'Error loading notification counts:', { error: err })
      }
    }
    
    loadCounts()
    
    // Refresh every 60 seconds
    const interval = setInterval(loadCounts, 60000)
    return () => clearInterval(interval)
  }, [user?.id, organization?.id, setUnreadNotificationCount, setPendingReviewCount])

  const totalBadge = unreadNotificationCount + pendingReviewCount

  return { unreadNotificationCount, pendingReviewCount, totalBadge }
}
