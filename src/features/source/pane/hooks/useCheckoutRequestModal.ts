import { useState } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface UseCheckoutRequestModalReturn {
  // Modal visibility
  showCheckoutRequestModal: boolean
  setShowCheckoutRequestModal: (show: boolean) => void
  
  // File being requested
  checkoutRequestFile: LocalFile | null
  setCheckoutRequestFile: (file: LocalFile | null) => void
  
  // Form state
  checkoutRequestMessage: string
  setCheckoutRequestMessage: (message: string) => void
  isSubmittingCheckoutRequest: boolean
  setIsSubmittingCheckoutRequest: (submitting: boolean) => void
}

/**
 * Hook to manage checkout request modal state
 */
export function useCheckoutRequestModal(): UseCheckoutRequestModalReturn {
  const [showCheckoutRequestModal, setShowCheckoutRequestModal] = useState(false)
  const [checkoutRequestFile, setCheckoutRequestFile] = useState<LocalFile | null>(null)
  const [checkoutRequestMessage, setCheckoutRequestMessage] = useState('')
  const [isSubmittingCheckoutRequest, setIsSubmittingCheckoutRequest] = useState(false)

  return {
    showCheckoutRequestModal,
    setShowCheckoutRequestModal,
    checkoutRequestFile,
    setCheckoutRequestFile,
    checkoutRequestMessage,
    setCheckoutRequestMessage,
    isSubmittingCheckoutRequest,
    setIsSubmittingCheckoutRequest
  }
}
