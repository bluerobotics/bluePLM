// The number for the Reviews nav badge: package items this user owes plus gate reviews waiting on
// them (`get_review_badge_count`). Refreshed on mount, every minute, when the tab regains focus,
// and whenever a review page records a decision (`refreshReviewBadgeCount`).
import { useEffect, useState } from 'react'
import { getReviewBadgeCount } from '@/lib/supabase/reviews'

const REFRESH_MS = 60_000
const listeners = new Set<() => void>()

/** Ask every mounted badge to re-read its count (after a decision, resubmit or cancel). */
export function refreshReviewBadgeCount(): void {
  listeners.forEach((listener) => listener())
}

/** The count, or null until the first read succeeds. A failed read keeps the last value. */
export function useReviewBadgeCount(enabled = true): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    let inFlight = false
    const load = () => {
      if (inFlight) return
      inFlight = true
      getReviewBadgeCount()
        .then((value) => {
          if (active) setCount(value)
        })
        .catch(() => {
          // Keep the last count; the next tick retries.
        })
        .finally(() => {
          inFlight = false
        })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    load()
    const timer = window.setInterval(onVisible, REFRESH_MS)
    listeners.add(load)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      listeners.delete(load)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])

  return count
}
