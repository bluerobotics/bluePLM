/**
 * TreeHoverContext - Ref-based hover state management for file tree action buttons
 * 
 * PERFORMANCE: This context uses refs instead of useState to prevent re-renders.
 * When any button is hovered, only that button's component updates - not all consumers.
 * 
 * The context value is STABLE (never changes reference) because:
 * 1. Hover states are stored in refs (reading doesn't trigger re-renders)
 * 2. Setter functions are memoized with empty dependencies
 * 3. The useMemo for contextValue has no changing dependencies
 * 
 * Components that need the hover state can read from refs. The value will be
 * current when the component renders (e.g., when virtualized rows scroll into view).
 */
import { createContext, useContext, useRef, useCallback, useMemo, type ReactNode, type MutableRefObject } from 'react'

/** Context value with refs and stable setters */
export interface TreeHoverContextValue {
  // Refs for current state (reading doesn't cause re-render)
  downloadHoveredRef: MutableRefObject<boolean>
  uploadHoveredRef: MutableRefObject<boolean>
  checkoutHoveredRef: MutableRefObject<boolean>
  checkinHoveredRef: MutableRefObject<boolean>
  updateHoveredRef: MutableRefObject<boolean>
  
  // Stable setters that update refs (never change reference)
  setIsDownloadHovered: (value: boolean) => void
  setIsUploadHovered: (value: boolean) => void
  setIsCheckoutHovered: (value: boolean) => void
  setIsCheckinHovered: (value: boolean) => void
  setIsUpdateHovered: (value: boolean) => void
}

// Legacy interface for backwards compatibility (will be removed by Agent 2)
export interface TreeHoverState {
  isDownloadHovered: boolean
  isUploadHovered: boolean
  isCheckoutHovered: boolean
  isCheckinHovered: boolean
  isUpdateHovered: boolean
}

export interface TreeHoverSetters {
  setIsDownloadHovered: (value: boolean) => void
  setIsUploadHovered: (value: boolean) => void
  setIsCheckoutHovered: (value: boolean) => void
  setIsCheckinHovered: (value: boolean) => void
  setIsUpdateHovered: (value: boolean) => void
}

/**
 * Context for tree hover state.
 * Undefined default ensures useTreeHover() throws if used outside provider.
 */
const TreeHoverContext = createContext<TreeHoverContextValue | undefined>(undefined)

interface TreeHoverProviderProps {
  children: ReactNode
}

/**
 * Provider component that manages hover state for file tree action buttons.
 * Uses refs to prevent re-renders when hover state changes.
 */
export function TreeHoverProvider({ children }: TreeHoverProviderProps) {
  // Hover states stored in refs - reading doesn't cause re-renders
  const downloadHoveredRef = useRef(false)
  const uploadHoveredRef = useRef(false)
  const checkoutHoveredRef = useRef(false)
  const checkinHoveredRef = useRef(false)
  const updateHoveredRef = useRef(false)

  // Stable setters - never change reference (empty deps)
  const setIsDownloadHovered = useCallback((value: boolean) => {
    downloadHoveredRef.current = value
  }, [])
  
  const setIsUploadHovered = useCallback((value: boolean) => {
    uploadHoveredRef.current = value
  }, [])
  
  const setIsCheckoutHovered = useCallback((value: boolean) => {
    checkoutHoveredRef.current = value
  }, [])
  
  const setIsCheckinHovered = useCallback((value: boolean) => {
    checkinHoveredRef.current = value
  }, [])
  
  const setIsUpdateHovered = useCallback((value: boolean) => {
    updateHoveredRef.current = value
  }, [])

  // Context value is STABLE - never changes reference
  // This is the key performance optimization: consumers don't re-render
  // when hover state changes because the context value reference is stable
  const contextValue = useMemo<TreeHoverContextValue>(() => ({
    // Refs for reading (stable references)
    downloadHoveredRef,
    uploadHoveredRef,
    checkoutHoveredRef,
    checkinHoveredRef,
    updateHoveredRef,
    // Stable setters
    setIsDownloadHovered,
    setIsUploadHovered,
    setIsCheckoutHovered,
    setIsCheckinHovered,
    setIsUpdateHovered
  }), [
    setIsDownloadHovered,
    setIsUploadHovered,
    setIsCheckoutHovered,
    setIsCheckinHovered,
    setIsUpdateHovered
  ])

  return (
    <TreeHoverContext.Provider value={contextValue}>
      {children}
    </TreeHoverContext.Provider>
  )
}

/**
 * Hook to consume tree hover state.
 * Must be used within a TreeHoverProvider.
 * 
 * PERFORMANCE: This hook returns refs and stable setters.
 * Reading from refs (e.g., downloadHoveredRef.current) does NOT cause re-renders.
 * The component will only see updated values when it re-renders for other reasons.
 * 
 * @returns The hover refs and stable setters
 * @throws Error if used outside of TreeHoverProvider
 */
export function useTreeHover(): TreeHoverContextValue {
  const context = useContext(TreeHoverContext)
  
  if (context === undefined) {
    throw new Error('useTreeHover must be used within a TreeHoverProvider')
  }
  
  return context
}
