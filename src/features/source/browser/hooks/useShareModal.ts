import { useState } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface UseShareModalReturn {
  // Modal visibility
  showShareModal: boolean
  setShowShareModal: (show: boolean) => void
  
  // File being shared
  shareFile: LocalFile | null
  setShareFile: (file: LocalFile | null) => void
  
  // Form state
  shareExpiresInDays: number | null
  setShareExpiresInDays: (days: number | null) => void
  shareMaxDownloads: number | null
  setShareMaxDownloads: (max: number | null) => void
  shareRequireAuth: boolean
  setShareRequireAuth: (require: boolean) => void
  
  // Generated link state
  generatedShareLink: string | null
  setGeneratedShareLink: (link: string | null) => void
  isCreatingShareLink: boolean
  setIsCreatingShareLink: (creating: boolean) => void
  copiedLink: boolean
  setCopiedLink: (copied: boolean) => void
}

/**
 * Hook to manage share link modal state
 */
export function useShareModal(): UseShareModalReturn {
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareFile, setShareFile] = useState<LocalFile | null>(null)
  const [shareExpiresInDays, setShareExpiresInDays] = useState<number | null>(7)
  const [shareMaxDownloads, setShareMaxDownloads] = useState<number | null>(null)
  const [shareRequireAuth, setShareRequireAuth] = useState(false)
  const [generatedShareLink, setGeneratedShareLink] = useState<string | null>(null)
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  return {
    showShareModal,
    setShowShareModal,
    shareFile,
    setShareFile,
    shareExpiresInDays,
    setShareExpiresInDays,
    shareMaxDownloads,
    setShareMaxDownloads,
    shareRequireAuth,
    setShareRequireAuth,
    generatedShareLink,
    setGeneratedShareLink,
    isCreatingShareLink,
    setIsCreatingShareLink,
    copiedLink,
    setCopiedLink
  }
}
