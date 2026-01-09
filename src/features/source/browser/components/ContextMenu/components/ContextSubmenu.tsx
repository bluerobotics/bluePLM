/**
 * Context menu submenu with viewport-aware positioning
 * Automatically adjusts position to stay within screen bounds
 */
import { useRef, useLayoutEffect, useState, type ReactNode, type MouseEventHandler } from 'react'

interface ContextSubmenuProps {
  children: ReactNode
  className?: string
  minWidth?: number
  onMouseEnter?: MouseEventHandler<HTMLDivElement>
  onMouseLeave?: MouseEventHandler<HTMLDivElement>
}

export function ContextSubmenu({ 
  children, 
  className = '',
  minWidth = 160,
  onMouseEnter,
  onMouseLeave
}: ContextSubmenuProps) {
  const submenuRef = useRef<HTMLDivElement>(null)
  const [verticalOffset, setVerticalOffset] = useState(-4) // Default marginTop

  useLayoutEffect(() => {
    if (!submenuRef.current) return

    const submenu = submenuRef.current
    const rect = submenu.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const padding = 16 // Minimum distance from viewport edges

    // Calculate how much the submenu overflows below the viewport
    const bottomOverflow = rect.bottom - (viewportHeight - padding)
    
    if (bottomOverflow > 0) {
      // Shift submenu up to fit within viewport
      // But don't shift so far that the top goes above the viewport
      const maxShift = rect.top - padding
      const actualShift = Math.min(bottomOverflow, maxShift)
      setVerticalOffset(-4 - actualShift)
    }
  }, [])

  return (
    <div 
      ref={submenuRef}
      className={`absolute left-full top-0 ml-1 bg-plm-bg-lighter border border-plm-border rounded-md py-1 shadow-lg z-[100] ${className}`}
      style={{ 
        marginTop: verticalOffset,
        minWidth
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  )
}
