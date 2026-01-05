import { useState, useCallback } from 'react'

export interface UseInlineActionHoverReturn {
  isDownloadHovered: boolean
  setIsDownloadHovered: (hovered: boolean) => void
  isUploadHovered: boolean
  setIsUploadHovered: (hovered: boolean) => void
  isCheckoutHovered: boolean
  setIsCheckoutHovered: (hovered: boolean) => void
  isCheckinHovered: boolean
  setIsCheckinHovered: (hovered: boolean) => void
  isUpdateHovered: boolean
  setIsUpdateHovered: (hovered: boolean) => void
  
  // Reset all hover states
  resetHoverStates: () => void
}

/**
 * Hook for managing hover states for inline action buttons.
 * Used to coordinate multi-select highlighting when hovering over action buttons.
 */
export function useInlineActionHover(): UseInlineActionHoverReturn {
  const [isDownloadHovered, setIsDownloadHovered] = useState(false)
  const [isUploadHovered, setIsUploadHovered] = useState(false)
  const [isCheckoutHovered, setIsCheckoutHovered] = useState(false)
  const [isCheckinHovered, setIsCheckinHovered] = useState(false)
  const [isUpdateHovered, setIsUpdateHovered] = useState(false)
  
  const resetHoverStates = useCallback(() => {
    setIsDownloadHovered(false)
    setIsUploadHovered(false)
    setIsCheckoutHovered(false)
    setIsCheckinHovered(false)
    setIsUpdateHovered(false)
  }, [])
  
  return {
    isDownloadHovered,
    setIsDownloadHovered,
    isUploadHovered,
    setIsUploadHovered,
    isCheckoutHovered,
    setIsCheckoutHovered,
    isCheckinHovered,
    setIsCheckinHovered,
    isUpdateHovered,
    setIsUpdateHovered,
    resetHoverStates,
  }
}
