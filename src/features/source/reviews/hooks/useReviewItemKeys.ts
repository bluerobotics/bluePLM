/**
 * J / K (by default) move to the next / previous item of the open review: the registry's
 * `reviews.nextItem` / `reviews.previousItem`. Mounted by the detail pane for everyone viewing the
 * review (requester, administrator, a reviewer who already decided), not by the decision bar, which
 * only reviewers who still owe a decision see. Ignored while typing and while a modal is open.
 */

import { useShortcuts } from '@/lib/keybindings'

export function useReviewItemKeys(enabled: boolean, onNext: () => void, onPrevious: () => void): void {
  useShortcuts(
    'reviews',
    {
      'reviews.nextItem': () => onNext(),
      'reviews.previousItem': () => onPrevious(),
    },
    { enabled, blockedByModal: true },
  )
}
