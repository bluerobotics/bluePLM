import { ChevronRight } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePDMStore, type SidebarView } from '@/stores/pdmStore'
import { logNavigation } from '@/lib/userActionLogger'
import type { ModuleDefinition, ModuleId } from '@/types/modules'
import { CascadingSidebar } from './CascadingSidebar'

// Context to share expanded state
export const ExpandedContext = createContext(false)

// Context to share sidebar rect for cascading panels
export const SidebarRectContext = createContext<DOMRect | null>(null)

// Standardized hover timing constants (in ms)
export const HOVER_OPEN_DELAY = 80   // Quick open, but prevents accidental triggers
export const HOVER_CLOSE_DELAY = 200 // Consistent close delay across all components

export interface ActivityItemProps {
  icon: React.ReactNode
  view: SidebarView
  title: string
  badge?: number
  hasChildren?: boolean
  children?: ModuleDefinition[]
  depth?: number
  onHoverWithChildren?: (moduleId: ModuleId | null, rect: DOMRect | null) => void
  isComingSoon?: boolean
  inDevBadge?: boolean
}

export function ActivityItem({ icon, view, title, badge, hasChildren, children, depth = 0, onHoverWithChildren, isComingSoon = false, inDevBadge = false }: ActivityItemProps) {
  // Selective selectors: only re-render when specific values change
  const activeView = usePDMStore(s => s.activeView)
  const setActiveView = usePDMStore(s => s.setActiveView)
  const activityBarMode = usePDMStore(s => s.activityBarMode)
  const isExpanded = useContext(ExpandedContext)
  const sidebarRect = useContext(SidebarRectContext)
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const [showSubmenu, setShowSubmenu] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const isActive = activeView === view && !isComingSoon
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Show chevron in collapsed mode only (not in hover mode) - not for coming soon items
  const showCollapsedChevron = !isExpanded && activityBarMode === 'collapsed' && hasChildren && children && children.length > 0 && !isComingSoon

  const handleMouseEnter = () => {
    if (!isExpanded && (!hasChildren || isComingSoon)) {
      // Calculate tooltip position based on button rect
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) {
        setTooltipPos({
          top: rect.top + rect.height / 2,
          left: rect.right + 12, // 12px gap from button edge
        })
      }
      setShowTooltip(true)
    }
    
    if (hasChildren && children && children.length > 0 && !isComingSoon) {
      // Clear any pending close timeout
      if (submenuTimeoutRef.current) {
        clearTimeout(submenuTimeoutRef.current)
        submenuTimeoutRef.current = null
      }
      // Delay showing submenu slightly to prevent accidental triggers
      hoverTimeoutRef.current = setTimeout(() => {
        setShowSubmenu(true)
        onHoverWithChildren?.(view as ModuleId, buttonRef.current?.getBoundingClientRect() || null)
      }, HOVER_OPEN_DELAY)
    }
  }

  const handleMouseLeave = () => {
    setShowTooltip(false)
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    // Don't close submenu immediately - give time to move to submenu
    submenuTimeoutRef.current = setTimeout(() => {
      setShowSubmenu(false)
      onHoverWithChildren?.(null, null)
    }, HOVER_CLOSE_DELAY)
  }

  // Close submenu immediately when sidebar collapses to prevent icon drift
  useEffect(() => {
    if (!isExpanded) {
      if (submenuTimeoutRef.current) {
        clearTimeout(submenuTimeoutRef.current)
        submenuTimeoutRef.current = null
      }
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
      setShowSubmenu(false)
      setShowTooltip(false)
    }
  }, [isExpanded])

  return (
    <div className="py-1 px-[6px]">
      <button
        ref={buttonRef}
        onClick={() => {
          if (isComingSoon) return // Don't navigate for coming soon items
          // If has children, clicking still navigates to the main view
          logNavigation(view, { title })
          setActiveView(view)
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`relative h-11 w-full flex items-center gap-3 px-[9px] rounded-lg transition-colors ${
          isComingSoon
            ? 'opacity-40 cursor-not-allowed'
            : isActive
            ? 'text-plm-accent bg-plm-highlight'
            : 'text-plm-fg-dim hover:text-plm-fg hover:bg-plm-highlight'
        }`}
        title={isComingSoon ? 'In Development' : undefined}
      >
        <div className="relative w-[22px] h-[22px] flex items-center justify-center flex-shrink-0 overflow-visible">
          {icon}
          {badge !== undefined && badge > 0 && (
            <div className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center bg-plm-error rounded-full shadow-sm z-10">
              <span className="text-[10px] font-bold text-white px-1">
                {badge > 99 ? '99+' : badge}
              </span>
            </div>
          )}
        </div>
        {/* Small chevron for collapsed mode (not hover mode) */}
        {showCollapsedChevron && (
          <ChevronRight 
            size={12} 
            className="absolute -right-0.5 text-plm-fg-dim"
          />
        )}
        {isExpanded && (
          <>
            <span className={`text-[15px] font-medium whitespace-nowrap overflow-hidden flex-1 text-left ${isComingSoon ? 'italic' : ''}`}>
              {title}
              {inDevBadge && <span className="text-[9px] ml-1.5 not-italic px-1 py-0.5 rounded bg-plm-warning/20 text-plm-warning">In Dev</span>}
            </span>
            {/* Chevron for items with children - not for coming soon items */}
            {hasChildren && children && children.length > 0 && !isComingSoon && (
              <ChevronRight 
                size={14} 
                className={`flex-shrink-0 text-plm-fg-dim transition-transform duration-200 ${showSubmenu ? 'translate-x-0.5' : ''}`}
              />
            )}
          </>
        )}
      </button>
      
      {/* Cascading Sidebar Panel - rendered via portal to escape overflow constraints */}
      {showSubmenu && hasChildren && children && children.length > 0 && sidebarRect &&
        createPortal(
          <CascadingSidebar
            parentRect={sidebarRect}
            itemRect={buttonRef.current?.getBoundingClientRect()}
            children={children}
            depth={depth + 1}
            onMouseEnter={() => {
              // Clear any pending close timeout when entering submenu
              if (submenuTimeoutRef.current) {
                clearTimeout(submenuTimeoutRef.current)
                submenuTimeoutRef.current = null
              }
              setShowSubmenu(true)
            }}
            onMouseLeave={() => {
              // Delay close to allow moving back to parent
              submenuTimeoutRef.current = setTimeout(() => {
                setShowSubmenu(false)
              }, HOVER_CLOSE_DELAY)
            }}
          />,
          document.body
        )
      }

      {/* Tooltip for collapsed state - rendered via portal to escape overflow constraints */}
      {showTooltip && !isExpanded && (!hasChildren || isComingSoon) &&
        createPortal(
          <div 
            className="fixed z-50 pointer-events-none"
            style={{ 
              top: tooltipPos.top, 
              left: tooltipPos.left,
              transform: 'translateY(-50%)', // Vertically center on the button
            }}
          >
            <div className="px-2.5 py-1.5 bg-plm-fg text-plm-bg text-sm font-medium rounded whitespace-nowrap shadow-lg">
              {isComingSoon ? `${title} - In Development` : title}
            </div>
          </div>,
          document.body
        )
      }
    </div>
  )
}
