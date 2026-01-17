/**
 * NotifiableCheckoutAvatar - Interactive avatar for checked-out files/folders
 * 
 * Shows the checkout user's avatar with hover effects:
 * - On hover, the entire avatar animates into a red bell notification icon
 * - Click triggers notification send
 * - For folders, can send to multiple users at once
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { Bell, Lock, Loader2 } from 'lucide-react'
import { getInitials, getAvatarColor } from '@/lib/utils'
import { requestCheckout } from '@/lib/supabase/notifications'
import { usePDMStore } from '@/stores/pdmStore'
import { log } from '@/lib/logger'

export interface NotifiableCheckoutAvatarProps {
  /** User who has the file checked out */
  user: {
    id: string
    email?: string
    full_name?: string | null
    avatar_url?: string | null
  }
  /** File ID (from PDM data) - optional for folders */
  fileId?: string
  /** File name for notification */
  fileName: string
  /** Avatar size in pixels */
  size?: number
  /** Font size for initials (optional, derived from size if not provided) */
  fontSize?: number
  /** Whether to show the lock/bell badge (deprecated - avatar transforms on hover) */
  showBadge?: boolean
  /** Additional class names */
  className?: string
  /** Optional: use urgent priority for the notification */
  urgent?: boolean
  /** For folder mode: array of file IDs to notify about */
  folderFileIds?: string[]
  /** Whether this is a folder checkout (alternative to folderFileIds) */
  isFolder?: boolean
  /** Number of files checked out (alternative to folderFileIds.length) */
  fileCount?: number
}

export function NotifiableCheckoutAvatar({
  user,
  fileId,
  fileName,
  size = 20,
  fontSize,
  showBadge: _showBadge = true,
  className = '',
  urgent = false,
  folderFileIds,
  isFolder: isFolderProp,
  fileCount: fileCountProp
}: NotifiableCheckoutAvatarProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Safety cleanup: reset hover state when component unmounts or element loses hover
  // This fixes "sticky" hover states in virtualized lists where mouseLeave may not fire
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    
    // Check actual hover state periodically when we think we're hovered
    // This catches cases where mouseLeave didn't fire (e.g., fast scrolling, virtualization)
    if (!isHovered) return
    
    const checkHoverState = () => {
      if (element && !element.matches(':hover')) {
        setIsHovered(false)
      }
    }
    
    // Check immediately and set up interval
    const timerId = setInterval(checkHoverState, 100)
    
    return () => clearInterval(timerId)
  }, [isHovered])
  
  const { user: currentUser, organization, addToast } = usePDMStore()
  
  const displayName = user.full_name || user.email?.split('@')[0] || 'User'
  const initials = getInitials(displayName)
  const calculatedFontSize = fontSize ?? size * 0.45
  const avatarColors = getAvatarColor(user.email || user.full_name)
  
  // Determine if this is a folder with multiple files
  // Support both folderFileIds array and isFolder + fileCount props
  const isFolder = isFolderProp ?? (folderFileIds && folderFileIds.length > 0)
  const fileCount = fileCountProp ?? folderFileIds?.length ?? 1
  
  // Handle click to send notification
  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    if (!currentUser?.id || !organization?.id) {
      addToast('error', 'You must be signed in to send notifications')
      return
    }
    
    if (currentUser.id === user.id) {
      addToast('info', isFolder ? 'These files are checked out by you' : 'This file is checked out by you')
      return
    }
    
    setIsSending(true)
    
    try {
      // For folders, we send one notification about the folder
      // For files, we send about the specific file
      const targetFileId = isFolder ? folderFileIds![0] : fileId
      const notificationMessage = isFolder 
        ? `Urgent: Please check in ${fileCount} files in ${fileName}`
        : (urgent ? 'Urgent: Please check in this file' : undefined)
      
      if (!targetFileId) {
        addToast('error', 'No file ID available for notification')
        setIsSending(false)
        return
      }
      
      const { success, error } = await requestCheckout(
        organization.id,
        targetFileId,
        isFolder ? `${fileName} (${fileCount} files)` : fileName,
        currentUser.id,
        user.id,
        notificationMessage
      )
      
      if (success) {
        addToast('success', `Notification sent to ${displayName}`)
        log.info('[NotifiableCheckoutAvatar]', 'Check-in request sent', { 
          toUser: user.id, 
          file: fileName,
          isFolder,
          fileCount,
          urgent 
        })
      } else {
        addToast('error', error || 'Failed to send notification')
        log.error('[NotifiableCheckoutAvatar]', 'Failed to send check-in request', { error })
      }
    } catch (err) {
      addToast('error', 'Failed to send notification')
      log.error('[NotifiableCheckoutAvatar]', 'Error sending check-in request', { error: err })
    } finally {
      setIsSending(false)
    }
  }, [currentUser, organization, user, fileId, fileName, displayName, urgent, isFolder, folderFileIds, fileCount, addToast])
  
  const tooltipText = isHovered 
    ? (isFolder ? `Click to notify ${displayName} to check in ${fileCount} files` : `Click to notify ${displayName} to check in`)
    : (isFolder ? `${displayName} has ${fileCount} files checked out` : `Checked out by ${displayName}`)
  
  // Don't make own avatar clickable
  const isOwnFile = currentUser?.id === user.id
  const showHoverState = isHovered && !isOwnFile
  
  // Use pointer events for more reliable hover detection
  // Also verify actual hover state on enter to handle edge cases
  const handlePointerEnter = useCallback(() => {
    if (!isOwnFile && containerRef.current?.matches(':hover')) {
      setIsHovered(true)
    }
  }, [isOwnFile])
  
  const handlePointerLeave = useCallback(() => {
    setIsHovered(false)
  }, [])
  
  return (
    <div
      ref={containerRef}
      className={`relative flex-shrink-0 ${!isOwnFile ? 'cursor-pointer group' : ''} ${className}`}
      style={{ width: size, height: size }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={!isOwnFile ? handleClick : undefined}
      title={tooltipText}
    >
      {/* Avatar container with transform animation */}
      <div 
        className={`
          w-full h-full rounded-full overflow-hidden 
          transition-all duration-300 ease-out
          ${showHoverState ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}
        `}
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={displayName}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.nextElementSibling?.classList.remove('hidden')
            }}
          />
        ) : null}
        <div
          className={`w-full h-full rounded-full ${avatarColors.bg} ${avatarColors.text} flex items-center justify-center font-medium ${
            user.avatar_url ? 'hidden' : ''
          }`}
          style={{ fontSize: calculatedFontSize }}
        >
          {initials}
        </div>
      </div>
      
      {/* Red notification bell that appears on hover */}
      <div
        className={`
          absolute inset-0 rounded-full 
          bg-gradient-to-br from-red-500 to-red-600
          flex items-center justify-center
          transition-all duration-300 ease-out
          ${showHoverState ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
          ${showHoverState ? 'animate-pulse' : ''}
          shadow-lg shadow-red-500/50
        `}
      >
        {isSending ? (
          <Loader2 
            size={size * 0.55} 
            className="text-white animate-spin"
          />
        ) : (
          <Bell 
            size={size * 0.55} 
            className="text-white"
            fill="white"
          />
        )}
      </div>
      
      {/* File count badge for folders OR lock icon for single files when not hovered */}
      {!showHoverState && (
        <div
          className={`absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center ${
            isFolder ? 'bg-orange-500 text-white' : 'bg-orange-400'
          }`}
          style={{ 
            width: isFolder && fileCount > 1 ? size * 0.55 : size * 0.45, 
            height: isFolder && fileCount > 1 ? size * 0.55 : size * 0.45,
            minWidth: isFolder && fileCount > 1 ? 14 : 10,
            minHeight: isFolder && fileCount > 1 ? 14 : 10
          }}
        >
          {isFolder && fileCount > 1 ? (
            <span className="text-[8px] font-bold">{fileCount > 99 ? '99+' : fileCount}</span>
          ) : (
            <Lock 
              size={size * 0.3} 
              className="text-white"
              style={{ minWidth: 7, minHeight: 7 }}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default NotifiableCheckoutAvatar
