// Reviews: `/reviews` is the queue, `/reviews/<reviewId>` one review.
import type { SectionProps } from '@web/shell/ui'
import { NotFound } from '@web/shell/ui'
import { ReviewDetailPage } from './ReviewDetailPage'
import { ReviewQueuePage } from './ReviewQueuePage'

export function ReviewsSection({ segments, query }: SectionProps) {
  if (segments.length === 0) return <ReviewQueuePage query={query} />
  if (segments.length === 1 && segments[0]) return <ReviewDetailPage key={segments[0]} reviewId={segments[0]} />
  return <NotFound />
}
