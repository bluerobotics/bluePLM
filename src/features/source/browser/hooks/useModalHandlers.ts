/**
 * useModalHandlers - Collaboration modal handlers hook
 * 
 * Provides handlers for all collaboration-related modals:
 * - Review request: Request file review from team members
 * - Checkout request: Request access to file checked out by others
 * - Mention/notify: Send notifications about files to team members
 * - Watch: Toggle file watch for change notifications
 * - Share: Generate and copy shareable links
 * - ECO: Add files to Engineering Change Orders
 * 
 * Key exports:
 * - handleOpenReviewModal, handleSubmitReviewRequest
 * - handleOpenCheckoutRequestModal, handleSubmitCheckoutRequest
 * - handleOpenMentionModal, handleSubmitMention
 * - handleToggleWatch, handleQuickShareLink
 * - handleOpenECOModal, handleAddToECO
 * 
 * @example
 * const {
 *   handleOpenReviewModal,
 *   handleSubmitReviewRequest,
 *   handleToggleWatch
 * } = useModalHandlers({
 *   user, organization, activeVaultId, ...modalStateSetters
 * })
 */
import { useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import type { ContextMenuState } from './useContextMenuState'
import type { OrgUser } from './useReviewModal'
import { 
  getOrgUsers,
  createReviewRequest,
  watchFile,
  unwatchFile,
  createShareLink,
  getActiveECOs as fetchActiveECOs,
  addFileToECO
} from '@/lib/supabase'
import { copyToClipboard } from '@/lib/clipboard'
import { usePDMStore } from '@/stores/pdmStore'

export interface ModalHandlersDeps {
  // User and org
  user: { id: string } | null
  organization: { id: string } | null
  activeVaultId: string | null | undefined
  
  // Review modal state
  setShowReviewModal: (show: boolean) => void
  setReviewModalFile: (file: LocalFile | null) => void
  setOrgUsers: (users: OrgUser[]) => void
  setLoadingUsers: (loading: boolean) => void
  selectedReviewers: string[]
  setSelectedReviewers: (reviewers: string[]) => void
  reviewMessage: string
  setReviewMessage: (message: string) => void
  reviewDueDate: string
  setReviewDueDate: (date: string) => void
  reviewPriority: 'low' | 'normal' | 'high' | 'urgent'
  setReviewPriority: (priority: 'low' | 'normal' | 'high' | 'urgent') => void
  setIsSubmittingReview: (submitting: boolean) => void
  reviewModalFile: LocalFile | null
  
  // Checkout request modal state
  setShowCheckoutRequestModal: (show: boolean) => void
  setCheckoutRequestFile: (file: LocalFile | null) => void
  checkoutRequestFile: LocalFile | null
  checkoutRequestMessage: string
  setCheckoutRequestMessage: (message: string) => void
  setIsSubmittingCheckoutRequest: (submitting: boolean) => void
  
  // Mention modal state
  setShowMentionModal: (show: boolean) => void
  setMentionFile: (file: LocalFile | null) => void
  mentionFile: LocalFile | null
  selectedMentionUsers: string[]
  setSelectedMentionUsers: (users: string[]) => void
  mentionMessage: string
  setMentionMessage: (message: string) => void
  setIsSubmittingMention: (submitting: boolean) => void
  
  // Watch file state
  watchingFiles: Set<string>
  setWatchingFiles: React.Dispatch<React.SetStateAction<Set<string>>>
  setIsTogglingWatch: (toggling: boolean) => void
  
  // Share modal state
  setShowShareModal: (show: boolean) => void
  setShareFile: (file: LocalFile | null) => void
  setIsCreatingShareLink: (creating: boolean) => void
  generatedShareLink: string | null
  setGeneratedShareLink: (link: string | null) => void
  setCopiedLink: (copied: boolean) => void
  
  // ECO modal state (ECO list comes from store)
  setShowECOModal: (show: boolean) => void
  setEcoFile: (file: LocalFile | null) => void
  ecoFile: LocalFile | null
  selectedECO: string | null
  setSelectedECO: (eco: string | null) => void
  ecoNotes: string
  setEcoNotes: (notes: string) => void
  setIsAddingToECO: (adding: boolean) => void
  
  // Context menu
  setContextMenu: (state: ContextMenuState | null) => void
  
  // Toast
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void
}

export interface UseModalHandlersReturn {
  handleOpenReviewModal: (file: LocalFile) => Promise<void>
  handleToggleReviewer: (userId: string) => void
  handleSubmitReviewRequest: () => Promise<void>
  handleOpenCheckoutRequestModal: (file: LocalFile) => void
  handleSubmitCheckoutRequest: () => Promise<void>
  handleOpenMentionModal: (file: LocalFile) => Promise<void>
  handleToggleMentionUser: (userId: string) => void
  handleSubmitMention: () => Promise<void>
  handleToggleWatch: (file: LocalFile) => Promise<void>
  handleQuickShareLink: (file: LocalFile) => Promise<void>
  handleCopyShareLink: () => Promise<void>
  handleOpenECOModal: (file: LocalFile) => Promise<void>
  handleAddToECO: () => Promise<void>
}

/**
 * Hook for managing modal-related handlers (review, checkout request, mention, share, ECO).
 */
export function useModalHandlers(deps: ModalHandlersDeps): UseModalHandlersReturn {
  // Get ECO state from store
  const {
    ecosLoaded,
    getActiveECOs: getActiveECOsFromStore,
    setECOs,
    setECOsLoading
  } = usePDMStore()
  
  const {
    user,
    organization,
    activeVaultId,
    setShowReviewModal,
    setReviewModalFile,
    setOrgUsers,
    setLoadingUsers,
    selectedReviewers,
    setSelectedReviewers,
    reviewMessage,
    setReviewMessage,
    reviewDueDate,
    setReviewDueDate,
    reviewPriority,
    setReviewPriority,
    setIsSubmittingReview,
    reviewModalFile,
    setShowCheckoutRequestModal,
    setCheckoutRequestFile,
    checkoutRequestFile,
    checkoutRequestMessage,
    setCheckoutRequestMessage,
    setIsSubmittingCheckoutRequest,
    setShowMentionModal,
    setMentionFile,
    mentionFile,
    selectedMentionUsers,
    setSelectedMentionUsers,
    mentionMessage,
    setMentionMessage,
    setIsSubmittingMention,
    watchingFiles,
    setWatchingFiles,
    setIsTogglingWatch,
    setShowShareModal,
    setShareFile,
    setIsCreatingShareLink,
    generatedShareLink,
    setGeneratedShareLink,
    setCopiedLink,
    setShowECOModal,
    setEcoFile,
    ecoFile,
    selectedECO,
    setSelectedECO,
    ecoNotes,
    setEcoNotes,
    setIsAddingToECO,
    setContextMenu,
    addToast,
  } = deps

  // === Review Modal Handlers ===
  
  const handleOpenReviewModal = useCallback(async (file: LocalFile) => {
    if (!organization?.id) {
      addToast('error', 'No organization connected')
      return
    }
    
    setReviewModalFile(file)
    setShowReviewModal(true)
    setContextMenu(null)
    setLoadingUsers(true)
    
    const { users } = await getOrgUsers(organization.id)
    setOrgUsers(users)
    setLoadingUsers(false)
  }, [organization?.id, setReviewModalFile, setShowReviewModal, setContextMenu, setLoadingUsers, setOrgUsers, addToast])

  const handleToggleReviewer = useCallback((userId: string) => {
    setSelectedReviewers(
      selectedReviewers.includes(userId) 
        ? selectedReviewers.filter(id => id !== userId) 
        : [...selectedReviewers, userId]
    )
  }, [selectedReviewers, setSelectedReviewers])

  const handleSubmitReviewRequest = useCallback(async () => {
    if (!user?.id || !organization?.id || !reviewModalFile?.pdmData?.id) {
      addToast('error', 'Missing required information')
      return
    }
    
    if (selectedReviewers.length === 0) {
      addToast('warning', 'Please select at least one reviewer')
      return
    }
    
    setIsSubmittingReview(true)
    
    const { error } = await createReviewRequest(
      organization.id,
      reviewModalFile.pdmData.id,
      activeVaultId ?? null,
      user.id,
      selectedReviewers,
      reviewModalFile.pdmData.version || 1,
      undefined,
      reviewMessage || undefined,
      reviewDueDate || undefined,
      reviewPriority
    )
    
    if (error) {
      addToast('error', `Failed to create review request: ${error}`)
    } else {
      addToast('success', `Review request sent to ${selectedReviewers.length} reviewer${selectedReviewers.length > 1 ? 's' : ''}`)
      setShowReviewModal(false)
      setSelectedReviewers([])
      setReviewMessage('')
      setReviewDueDate('')
      setReviewPriority('normal')
    }
    
    setIsSubmittingReview(false)
  }, [user?.id, organization?.id, reviewModalFile, selectedReviewers, activeVaultId, reviewMessage, reviewDueDate, reviewPriority, setIsSubmittingReview, setShowReviewModal, setSelectedReviewers, setReviewMessage, setReviewDueDate, setReviewPriority, addToast])

  // === Checkout Request Modal Handlers ===
  
  const handleOpenCheckoutRequestModal = useCallback((file: LocalFile) => {
    setCheckoutRequestFile(file)
    setShowCheckoutRequestModal(true)
    setContextMenu(null)
  }, [setCheckoutRequestFile, setShowCheckoutRequestModal, setContextMenu])

  const handleSubmitCheckoutRequest = useCallback(async () => {
    if (!user?.id || !organization?.id || !checkoutRequestFile?.pdmData?.id || !checkoutRequestFile?.pdmData?.checked_out_by) {
      addToast('error', 'Missing required information')
      return
    }
    
    setIsSubmittingCheckoutRequest(true)
    
    addToast('info', 'Checkout request noted')
    setShowCheckoutRequestModal(false)
    setCheckoutRequestMessage('')
    
    setIsSubmittingCheckoutRequest(false)
  }, [user?.id, organization?.id, checkoutRequestFile, checkoutRequestMessage, setIsSubmittingCheckoutRequest, setShowCheckoutRequestModal, setCheckoutRequestMessage, addToast])

  // === Mention Modal Handlers ===
  
  const handleOpenMentionModal = useCallback(async (file: LocalFile) => {
    if (!organization?.id) {
      addToast('error', 'No organization connected')
      return
    }
    
    setMentionFile(file)
    setShowMentionModal(true)
    setContextMenu(null)
    setLoadingUsers(true)
    
    const { users } = await getOrgUsers(organization.id)
    setOrgUsers(users.filter((u: { id: string }) => u.id !== user?.id))
    setLoadingUsers(false)
  }, [organization?.id, user?.id, setMentionFile, setShowMentionModal, setContextMenu, setLoadingUsers, setOrgUsers, addToast])

  const handleToggleMentionUser = useCallback((userId: string) => {
    setSelectedMentionUsers(
      selectedMentionUsers.includes(userId) 
        ? selectedMentionUsers.filter(id => id !== userId) 
        : [...selectedMentionUsers, userId]
    )
  }, [selectedMentionUsers, setSelectedMentionUsers])

  const handleSubmitMention = useCallback(async () => {
    if (!user?.id || !organization?.id || !mentionFile?.pdmData?.id) {
      addToast('error', 'Missing required information')
      return
    }
    
    if (selectedMentionUsers.length === 0) {
      addToast('warning', 'Please select at least one person to notify')
      return
    }
    
    setIsSubmittingMention(true)
    
    addToast('info', `Mention noted for ${selectedMentionUsers.length} user${selectedMentionUsers.length > 1 ? 's' : ''}`)
    setShowMentionModal(false)
    setSelectedMentionUsers([])
    setMentionMessage('')
    
    setIsSubmittingMention(false)
  }, [user?.id, organization?.id, mentionFile, selectedMentionUsers, mentionMessage, setIsSubmittingMention, setShowMentionModal, setSelectedMentionUsers, setMentionMessage, addToast])

  // === Watch File Handler ===
  
  const handleToggleWatch = useCallback(async (file: LocalFile) => {
    if (!user?.id || !organization?.id || !file.pdmData?.id) return
    
    setIsTogglingWatch(true)
    const fileId = file.pdmData.id
    const isCurrentlyWatching = watchingFiles.has(fileId)
    
    if (isCurrentlyWatching) {
      const { success, error } = await unwatchFile(fileId, user.id)
      if (success) {
        setWatchingFiles(prev => { const next = new Set(prev); next.delete(fileId); return next })
        addToast('info', `Stopped watching ${file.name}`)
      } else {
        addToast('error', error || 'Failed to unwatch file')
      }
    } else {
      const { success, error } = await watchFile(organization.id, fileId, user.id)
      if (success) {
        setWatchingFiles(prev => new Set(prev).add(fileId))
        addToast('success', `Now watching ${file.name}`)
      } else {
        addToast('error', error || 'Failed to watch file')
      }
    }
    
    setIsTogglingWatch(false)
    setContextMenu(null)
  }, [user?.id, organization?.id, watchingFiles, setIsTogglingWatch, setWatchingFiles, setContextMenu, addToast])

  // === Share Link Handlers ===
  
  const handleQuickShareLink = useCallback(async (file: LocalFile) => {
    if (!user?.id || !organization?.id || !file.pdmData?.id) {
      addToast('error', 'File must be synced to create a share link')
      return
    }
    
    setIsCreatingShareLink(true)
    setContextMenu(null)
    
    const { link, error } = await createShareLink(
      organization.id,
      file.pdmData.id,
      user.id,
      { expiresInDays: 7 } // Default 7 days
    )
    
    if (error) {
      addToast('error', error)
    } else if (link) {
      const result = await copyToClipboard(link.downloadUrl)
      if (result.success) {
        addToast('success', 'Share link copied! (expires in 7 days)')
      } else {
        // If clipboard fails, show the link in a prompt
        setGeneratedShareLink(link.downloadUrl)
        setShareFile(file)
        setShowShareModal(true)
      }
    }
    
    setIsCreatingShareLink(false)
  }, [user?.id, organization?.id, setIsCreatingShareLink, setContextMenu, setGeneratedShareLink, setShareFile, setShowShareModal, addToast])

  const handleCopyShareLink = useCallback(async () => {
    if (!generatedShareLink) return
    
    const result = await copyToClipboard(generatedShareLink)
    if (result.success) {
      setCopiedLink(true)
      addToast('success', 'Link copied to clipboard!')
      setTimeout(() => setCopiedLink(false), 2000)
    } else {
      addToast('error', 'Failed to copy link')
    }
  }, [generatedShareLink, setCopiedLink, addToast])

  // === ECO Modal Handlers ===
  
  const handleOpenECOModal = useCallback(async (file: LocalFile) => {
    if (!organization?.id) {
      addToast('error', 'No organization connected')
      return
    }
    
    setEcoFile(file)
    setShowECOModal(true)
    setContextMenu(null)
    
    // Only fetch if not already loaded in store
    if (!ecosLoaded) {
      setECOsLoading(true)
      const { ecos } = await fetchActiveECOs(organization.id)
      // Map to full ECO type for store
      setECOs(ecos.map(eco => ({
        ...eco,
        description: eco.description ?? null,
        status: eco.status ?? null,
        created_at: eco.created_at ?? null,
      })))
      setECOsLoading(false)
    }
  }, [organization?.id, setEcoFile, setShowECOModal, setContextMenu, ecosLoaded, setECOsLoading, setECOs, getActiveECOsFromStore, addToast])

  const handleAddToECO = useCallback(async () => {
    if (!user?.id || !selectedECO || !ecoFile?.pdmData?.id) {
      addToast('warning', 'Please select an ECO')
      return
    }
    
    setIsAddingToECO(true)
    
    const { success, error } = await addFileToECO(
      ecoFile.pdmData.id,
      selectedECO,
      user.id,
      ecoNotes || undefined
    )
    
    if (success) {
      // Use store's active ECOs for finding the selected ECO
      const storeActiveECOs = getActiveECOsFromStore()
      const eco = storeActiveECOs.find(e => e.id === selectedECO)
      addToast('success', `Added to ${eco?.eco_number || 'ECO'}`)
      setShowECOModal(false)
      setSelectedECO(null)
      setEcoNotes('')
    } else {
      addToast('error', error || 'Failed to add to ECO')
    }
    
    setIsAddingToECO(false)
  }, [user?.id, selectedECO, ecoFile, ecoNotes, getActiveECOsFromStore, setIsAddingToECO, setShowECOModal, setSelectedECO, setEcoNotes, addToast])

  return {
    handleOpenReviewModal,
    handleToggleReviewer,
    handleSubmitReviewRequest,
    handleOpenCheckoutRequestModal,
    handleSubmitCheckoutRequest,
    handleOpenMentionModal,
    handleToggleMentionUser,
    handleSubmitMention,
    handleToggleWatch,
    handleQuickShareLink,
    handleCopyShareLink,
    handleOpenECOModal,
    handleAddToECO,
  }
}
