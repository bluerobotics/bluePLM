/**
 * Context menu group component with submenu
 * Groups related actions under a single menu item that expands on hover
 */
import { useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ContextSubmenu } from './ContextSubmenu'

interface ContextMenuGroupProps {
  label: string
  icon: LucideIcon
  iconColorClass?: string
  children: ReactNode
  /** Whether this group has any visible items. If false, the group won't render */
  hasItems?: boolean
  /** Minimum width for the submenu */
  minWidth?: number
}

export function ContextMenuGroup({ 
  label, 
  icon: Icon, 
  iconColorClass = '',
  children, 
  hasItems = true,
  minWidth = 180,
}: ContextMenuGroupProps) {
  const [showSubmenu, setShowSubmenu] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Don't render if no items
  if (!hasItems) {
    return null
  }

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setShowSubmenu(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setShowSubmenu(false)
    }, 150)
  }

  return (
    <div 
      className="context-menu-item relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => {
        e.stopPropagation()
        setShowSubmenu(!showSubmenu)
      }}
    >
      <Icon size={14} className={iconColorClass} />
      {label}
      <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
      
      {showSubmenu && (
        <ContextSubmenu
          minWidth={minWidth}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {children}
        </ContextSubmenu>
      )}
    </div>
  )
}
