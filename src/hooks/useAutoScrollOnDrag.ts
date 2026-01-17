import { useEffect, useRef, type RefObject } from 'react'

/**
 * Options for the auto-scroll behavior during drag operations.
 */
export interface AutoScrollOptions {
  /** Distance in pixels from edge to start scrolling (default: 50) */
  edgeThreshold?: number
  /** Maximum scroll speed in pixels per frame (default: 15) */
  maxScrollSpeed?: number
}

/**
 * Hook that enables auto-scrolling when dragging near the top or bottom
 * edges of a scrollable container. This provides a smooth UX for drag-and-drop
 * operations in long lists (like file trees).
 * 
 * The scroll speed scales based on proximity to the edge - closer to the edge
 * means faster scrolling.
 * 
 * @param containerRef - Ref to the scrollable container element
 * @param options - Configuration for edge threshold and scroll speed
 * 
 * @example
 * ```tsx
 * const scrollRef = useRef<HTMLDivElement>(null)
 * useAutoScrollOnDrag(scrollRef, { edgeThreshold: 50, maxScrollSpeed: 15 })
 * ```
 */
export function useAutoScrollOnDrag(
  containerRef: RefObject<HTMLElement | null>,
  options?: AutoScrollOptions
): void {
  const { edgeThreshold = 50, maxScrollSpeed = 15 } = options ?? {}
  
  // Track animation frame and scroll direction
  const animationFrameRef = useRef<number | null>(null)
  const scrollDirectionRef = useRef<'up' | 'down' | null>(null)
  const scrollSpeedRef = useRef<number>(0)
  
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    /**
     * Animation loop that smoothly scrolls the container while
     * the cursor remains in the edge zone during a drag operation.
     */
    const scrollLoop = () => {
      if (!scrollDirectionRef.current || !containerRef.current) {
        animationFrameRef.current = null
        return
      }
      
      const direction = scrollDirectionRef.current
      const speed = scrollSpeedRef.current
      
      if (direction === 'up') {
        containerRef.current.scrollTop -= speed
      } else {
        containerRef.current.scrollTop += speed
      }
      
      // Continue the loop while actively scrolling
      animationFrameRef.current = requestAnimationFrame(scrollLoop)
    }
    
    /**
     * Start the scroll animation if not already running.
     */
    const startScrolling = (direction: 'up' | 'down', speed: number) => {
      scrollDirectionRef.current = direction
      scrollSpeedRef.current = speed
      
      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(scrollLoop)
      }
    }
    
    /**
     * Stop any active scroll animation.
     */
    const stopScrolling = () => {
      scrollDirectionRef.current = null
      scrollSpeedRef.current = 0
      
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
    
    /**
     * Handle dragover events to detect edge proximity and trigger scrolling.
     */
    const handleDragOver = (e: DragEvent) => {
      const rect = container.getBoundingClientRect()
      const mouseY = e.clientY
      
      // Distance from top/bottom edges
      const distFromTop = mouseY - rect.top
      const distFromBottom = rect.bottom - mouseY
      
      if (distFromTop < edgeThreshold && distFromTop >= 0) {
        // Near top edge - scroll up
        // Speed scales from maxScrollSpeed (at edge) to 1 (at threshold boundary)
        const proximity = 1 - (distFromTop / edgeThreshold)
        const speed = Math.max(1, Math.round(maxScrollSpeed * proximity))
        startScrolling('up', speed)
      } else if (distFromBottom < edgeThreshold && distFromBottom >= 0) {
        // Near bottom edge - scroll down
        const proximity = 1 - (distFromBottom / edgeThreshold)
        const speed = Math.max(1, Math.round(maxScrollSpeed * proximity))
        startScrolling('down', speed)
      } else {
        // Not in edge zone - stop scrolling
        stopScrolling()
      }
    }
    
    /**
     * Handle drag end/leave to clean up scrolling.
     */
    const handleDragEnd = () => {
      stopScrolling()
    }
    
    // Attach event listeners
    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('dragleave', handleDragEnd)
    container.addEventListener('drop', handleDragEnd)
    
    // Also listen on document for dragend (fires when drag operation ends anywhere)
    document.addEventListener('dragend', handleDragEnd)
    
    return () => {
      // Cleanup
      stopScrolling()
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('dragleave', handleDragEnd)
      container.removeEventListener('drop', handleDragEnd)
      document.removeEventListener('dragend', handleDragEnd)
    }
  }, [containerRef, edgeThreshold, maxScrollSpeed])
}
