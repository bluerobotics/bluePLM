import type { Virtualizer } from '@tanstack/react-virtual'

/**
 * Same rule as `scrollToTopIfHidden`, but judged against the row's real on-screen
 * position instead of the virtualizer's arithmetic. List rows are not measured, and a
 * table row renders slightly taller than its estimate, so offsets computed for rows
 * far from the first rendered one drift by a pixel or more per row: a row can look
 * visible to the virtualizer while its bottom is clipped by the viewport.
 *
 * Returns false if the row is not in the DOM yet (the caller should retry).
 */
export function alignRowToTopIfHidden(
  scrollElement: HTMLElement,
  row: HTMLElement | null,
  topInsetPx = 0,
): boolean {
  if (!row) return false

  const containerRect = scrollElement.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  const viewportTop = containerRect.top + scrollElement.clientTop + topInsetPx
  const viewportBottom = containerRect.top + scrollElement.clientTop + scrollElement.clientHeight

  if (rowRect.top >= viewportTop && rowRect.bottom <= viewportBottom) return true

  scrollElement.scrollTop += rowRect.top - viewportTop
  return true
}

/**
 * Bring a virtualized row into view the way a file explorer does for type-ahead:
 * a row that is already fully visible stays put (no scroll at all), a hidden or
 * partly clipped row is scrolled to the top of the viewport.
 *
 * `topInsetPx` is the height of anything that sits in flow above the virtualized
 * rows inside the scroll container (the list's sticky column header). The
 * virtualizer's offset 0 starts below it, so the visible span in row coordinates
 * is `[scrollTop, scrollTop + clientHeight - topInsetPx]`, and aligning a row's
 * start with `scrollTop` lands it directly under the sticky header.
 */
export function scrollToTopIfHidden<TScrollElement extends HTMLElement>(
  virtualizer: Virtualizer<TScrollElement, Element>,
  index: number,
  topInsetPx = 0,
): void {
  const scrollElement = virtualizer.scrollElement
  const item = virtualizer.measurementsCache[index]

  if (scrollElement && item) {
    const visibleStart = scrollElement.scrollTop
    const visibleEnd = visibleStart + scrollElement.clientHeight - topInsetPx
    if (item.start >= visibleStart && item.end <= visibleEnd) return
  }

  virtualizer.scrollToIndex(index, { align: 'start' })
}
