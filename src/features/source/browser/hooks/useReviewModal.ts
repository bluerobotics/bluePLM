import { useState } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface OrgUser {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
}

export interface UseReviewModalReturn {
  // Modal visibility
  showReviewModal: boolean
  setShowReviewModal: React.Dispatch<React.SetStateAction<boolean>>
  
  // File being reviewed
  reviewModalFile: LocalFile | null
  setReviewModalFile: React.Dispatch<React.SetStateAction<LocalFile | null>>
  
  // Organization users
  orgUsers: OrgUser[]
  setOrgUsers: React.Dispatch<React.SetStateAction<OrgUser[]>>
  loadingUsers: boolean
  setLoadingUsers: React.Dispatch<React.SetStateAction<boolean>>
  
  // Review form state
  selectedReviewers: string[]
  setSelectedReviewers: React.Dispatch<React.SetStateAction<string[]>>
  reviewMessage: string
  setReviewMessage: React.Dispatch<React.SetStateAction<string>>
  reviewDueDate: string
  setReviewDueDate: React.Dispatch<React.SetStateAction<string>>
  reviewPriority: 'low' | 'normal' | 'high' | 'urgent'
  setReviewPriority: React.Dispatch<React.SetStateAction<'low' | 'normal' | 'high' | 'urgent'>>
  isSubmittingReview: boolean
  setIsSubmittingReview: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Hook to manage review request modal state
 */
export function useReviewModal(): UseReviewModalReturn {
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewModalFile, setReviewModalFile] = useState<LocalFile | null>(null)
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([])
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([])
  const [reviewMessage, setReviewMessage] = useState('')
  const [reviewDueDate, setReviewDueDate] = useState<string>('')
  const [reviewPriority, setReviewPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal')
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)

  return {
    showReviewModal,
    setShowReviewModal,
    reviewModalFile,
    setReviewModalFile,
    orgUsers,
    setOrgUsers,
    loadingUsers,
    setLoadingUsers,
    selectedReviewers,
    setSelectedReviewers,
    reviewMessage,
    setReviewMessage,
    reviewDueDate,
    setReviewDueDate,
    reviewPriority,
    setReviewPriority,
    isSubmittingReview,
    setIsSubmittingReview
  }
}
