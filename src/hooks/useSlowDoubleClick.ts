/**
 * useSlowDoubleClick - Windows Explorer-style slow double-click to rename
 * 
 * This hook implements the familiar Windows Explorer behavior where:
 * 1. First click selects the item
 * 2. Second click (after a short delay, but not a fast double-click) enters rename mode
 * 
 * The timing window is configurable but defaults to 400-1500ms, matching Windows behavior.
 * 
 * @example
 * const { handleSlowDoubleClick, resetSlowDoubleClick } = useSlowDoubleClick({
 *   onRename: (file) => {
 *     setRenamingFile(file)
 *     setRenameValue(file.name)
 *   },
 *   canRename: (file) => !file.pdmData || file.pdmData.checked_out_by === userId
 * })
 * 
 * // In click handler:
 * handleSlowDoubleClick(file)
 * 
 * // In double-click handler (to prevent rename on fast double-click):
 * resetSlowDoubleClick()
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

// Timing constants for slow double-click detection (ms)
export const SLOW_DOUBLE_CLICK_MIN_MS = 400  // Minimum time between clicks
export const SLOW_DOUBLE_CLICK_MAX_MS = 1500 // Maximum time between clicks

export interface UseSlowDoubleClickOptions {
  /** Callback when slow double-click triggers rename */
  onRename: (file: LocalFile) => void
  /** Callback when slow double-click detected but file can't be renamed (e.g., highlight name for copying) */
  onHighlight?: (file: LocalFile) => void
  /** Check if file can be renamed (e.g., not locked by another user) */
  canRename?: (file: LocalFile) => boolean
  /** Minimum time between clicks in ms (default: 400) */
  minDelay?: number
  /** Maximum time between clicks in ms (default: 1500) */
  maxDelay?: number
  /** Allow renaming directories (default: true) */
  allowDirectories?: boolean
}

export interface UseSlowDoubleClickReturn {
  /** Call on single click to track timing and path */
  handleSlowDoubleClick: (file: LocalFile) => void
  /** Call on double-click to reset state and prevent rename */
  resetSlowDoubleClick: () => void
  /** Current path being tracked (for comparison) */
  lastClickPath: string | null
}

/**
 * Hook to detect Windows Explorer-style slow double-click for renaming
 */
export function useSlowDoubleClick({
  onRename,
  onHighlight,
  canRename,
  minDelay = SLOW_DOUBLE_CLICK_MIN_MS,
  maxDelay = SLOW_DOUBLE_CLICK_MAX_MS,
  allowDirectories = true
}: UseSlowDoubleClickOptions): UseSlowDoubleClickReturn {
  const [lastClickTime, setLastClickTime] = useState<number>(0)
  const [lastClickPath, setLastClickPath] = useState<string | null>(null)
  
  // Use ref for timeout to clean up properly
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleSlowDoubleClick = useCallback((file: LocalFile) => {
    // Don't allow rename on directories unless explicitly enabled
    if (file.isDirectory && !allowDirectories) {
      setLastClickTime(Date.now())
      setLastClickPath(file.relativePath)
      return
    }
    
    const now = Date.now()
    const timeDiff = now - lastClickTime
    const isSameFile = lastClickPath === file.relativePath
    
    // Check if file can be renamed
    const fileCanRename = canRename ? canRename(file) : true
    
    // Detect slow double-click: same file, within timing window
    if (isSameFile && timeDiff >= minDelay && timeDiff <= maxDelay) {
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      
      if (fileCanRename) {
        // Trigger rename
        onRename(file)
      } else if (onHighlight) {
        // Can't rename - highlight name for copying instead
        onHighlight(file)
      }
      
      // Reset state
      setLastClickTime(0)
      setLastClickPath(null)
    } else {
      // First click or timing didn't match - record this click
      setLastClickTime(now)
      setLastClickPath(file.relativePath)
      
      // Auto-reset after maxDelay to prevent stale state
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        setLastClickTime(0)
        setLastClickPath(null)
        timeoutRef.current = null
      }, maxDelay + 100) // Small buffer
    }
  }, [lastClickTime, lastClickPath, onRename, onHighlight, canRename, minDelay, maxDelay, allowDirectories])

  const resetSlowDoubleClick = useCallback(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    setLastClickTime(0)
    setLastClickPath(null)
  }, [])

  return {
    handleSlowDoubleClick,
    resetSlowDoubleClick,
    lastClickPath
  }
}
