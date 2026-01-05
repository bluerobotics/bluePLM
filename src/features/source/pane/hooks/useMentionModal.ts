import { useState } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface UseMentionModalReturn {
  // Modal visibility
  showMentionModal: boolean
  setShowMentionModal: React.Dispatch<React.SetStateAction<boolean>>
  
  // File being mentioned
  mentionFile: LocalFile | null
  setMentionFile: React.Dispatch<React.SetStateAction<LocalFile | null>>
  
  // Form state
  selectedMentionUsers: string[]
  setSelectedMentionUsers: React.Dispatch<React.SetStateAction<string[]>>
  mentionMessage: string
  setMentionMessage: React.Dispatch<React.SetStateAction<string>>
  isSubmittingMention: boolean
  setIsSubmittingMention: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Hook to manage mention/notify modal state
 */
export function useMentionModal(): UseMentionModalReturn {
  const [showMentionModal, setShowMentionModal] = useState(false)
  const [mentionFile, setMentionFile] = useState<LocalFile | null>(null)
  const [selectedMentionUsers, setSelectedMentionUsers] = useState<string[]>([])
  const [mentionMessage, setMentionMessage] = useState('')
  const [isSubmittingMention, setIsSubmittingMention] = useState(false)

  return {
    showMentionModal,
    setShowMentionModal,
    mentionFile,
    setMentionFile,
    selectedMentionUsers,
    setSelectedMentionUsers,
    mentionMessage,
    setMentionMessage,
    isSubmittingMention,
    setIsSubmittingMention
  }
}
