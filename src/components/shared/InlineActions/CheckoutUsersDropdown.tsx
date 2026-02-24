/**
 * CheckoutUsersDropdown - Displays checkout users with overflow dropdown
 * 
 * Shows up to N avatars, with a "+X" button that opens a dropdown
 * to view and notify all users who have files checked out.
 */
import React, { useState, useRef, useEffect } from 'react'
import { Bell, Loader2, Users, Lock } from 'lucide-react'
import { getInitials, getAvatarColor } from '@/lib/utils'
import { usePDMStore } from '@/stores/pdmStore'
import { log } from '@/lib/logger'

export interface CheckoutUser {
  id: string
  name: string
  email?: string
  avatar_url?: string
  isMe: boolean
  count?: number
  /** For folders: list of file IDs this user has checked out (for notifications) */
  fileIds?: string[]
}

export interface CheckoutUsersDropdownProps {
  /** All users with checkouts */
  users: CheckoutUser[]
  /** Maximum avatars to show before overflow */
  maxShow?: number
  /** Avatar size in pixels */
  avatarSize?: number
  /** Folder/file ID for notifications */
  entityId?: string
  /** Folder/file name for notifications */
  entityName?: string
  /** Whether this is for a folder (vs single file) */
  isFolder?: boolean
}

export function CheckoutUsersDropdown({
  users,
  maxShow = 2,
  avatarSize = 20,
  entityId,
  entityName,
  isFolder = false
}: CheckoutUsersDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [sendingTo, setSendingTo] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const { user: currentUser, organization, addToast } = usePDMStore()
  
  // Filter to only other users (not me)
  const otherUsers = users.filter(u => !u.isMe)
  
  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])
  
  // Handle sending notification to a user
  const handleNotify = async (targetUser: CheckoutUser, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    // Use per-user fileId if available, otherwise fall back to entityId
    const notificationTargetId = targetUser.fileIds?.[0] || entityId
    
    if (!currentUser?.id || !organization?.id || !notificationTargetId) {
      addToast('error', 'Unable to send notification')
      return
    }
    
    setSendingTo(targetUser.id)
    
    try {
      addToast('info', `Check-in request noted for ${targetUser.name}`)
      log.info('[CheckoutUsersDropdown]', 'Check-in request (notifications disabled)', { 
        toUser: targetUser.id, 
        entity: entityName,
        isFolder,
        fileId: notificationTargetId
      })
    } catch (err) {
      log.error('[CheckoutUsersDropdown]', 'Error in notification handler', { error: err })
    } finally {
      setSendingTo(null)
    }
  }
  
  if (otherUsers.length === 0) return null
  
  const visibleUsers = otherUsers.slice(0, maxShow)
  const overflowUsers = otherUsers.slice(maxShow)
  const hasOverflow = overflowUsers.length > 0
  
  const fontSize = avatarSize * 0.45
  
  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      {/* Visible avatars - clickable for notification */}
      <div className="flex -space-x-1">
        {visibleUsers.map((u) => {
          // Check if this specific user can receive notifications
          // Either via their own fileIds or via the shared entityId
          const canNotify = !!(u.fileIds?.length || entityId)
          const fileCount = u.count || u.fileIds?.length || 1
          const showFileCount = isFolder && fileCount > 1
          return (
            <div 
              key={u.id} 
              className="relative flex-shrink-0 group/avatar" 
              style={{ width: avatarSize, height: avatarSize }}
            >
              <button
                className={`relative w-full h-full rounded-full overflow-hidden transition-all duration-200 hover:z-10 ${
                  canNotify ? 'cursor-pointer hover:ring-2 hover:ring-red-400' : 'cursor-default'
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  if (canNotify && !sendingTo) handleNotify(u, e)
                }}
                title={canNotify 
                  ? `Click to notify ${u.name} to check in${showFileCount ? ` (${fileCount} files)` : ''}`
                  : `Checked out by ${u.name}${showFileCount ? ` (${fileCount} files)` : ''}`
                }
              >
                {sendingTo === u.id ? (
                  <div className="w-full h-full bg-red-500 flex items-center justify-center">
                    <Loader2 size={avatarSize * 0.6} className="text-white animate-spin" />
                  </div>
                ) : (
                  <>
                    {(() => {
                      const avatarColors = getAvatarColor(u.email || u.name)
                      return (
                        <>
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt={u.name}
                              className="w-full h-full object-cover group-hover/avatar:brightness-110"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.style.display = 'none'
                                target.nextElementSibling?.classList.remove('hidden')
                              }}
                            />
                          ) : null}
                          <div 
                            className={`w-full h-full rounded-full ${avatarColors.bg} ${avatarColors.text} flex items-center justify-center font-medium ${u.avatar_url ? 'hidden' : ''}`}
                            style={{ fontSize }}
                          >
                            {getInitials(u.name)}
                          </div>
                        </>
                      )
                    })()}
                    {/* Bell overlay on hover (replaces lock badge) */}
                    {canNotify && (
                      <div className="absolute inset-0 bg-red-500 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity rounded-full">
                        <Bell size={avatarSize * 0.5} className="text-white" />
                      </div>
                    )}
                  </>
                )}
              </button>
              {/* Lock badge with optional file count - hides on hover when bell appears */}
              {sendingTo !== u.id && (
                <div
                  className={`absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center transition-opacity ${
                    canNotify ? 'group-hover/avatar:opacity-0' : ''
                  } ${showFileCount ? 'bg-orange-500 text-white' : 'bg-orange-400'}`}
                  style={{ 
                    width: showFileCount ? avatarSize * 0.55 : avatarSize * 0.45, 
                    height: showFileCount ? avatarSize * 0.55 : avatarSize * 0.45,
                    minWidth: showFileCount ? 14 : 10,
                    minHeight: showFileCount ? 14 : 10
                  }}
                >
                  {showFileCount ? (
                    <span className="text-[8px] font-bold">{fileCount > 99 ? '99+' : fileCount}</span>
                  ) : (
                    <Lock 
                      size={avatarSize * 0.3} 
                      className="text-white"
                      style={{ minWidth: 7, minHeight: 7 }}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
        
        {/* Overflow indicator - opens dropdown */}
        {hasOverflow && (
          <button
            className={`rounded-full bg-plm-bg-light flex items-center justify-center text-plm-fg-muted font-medium flex-shrink-0 cursor-pointer hover:bg-plm-accent/30 hover:text-plm-accent transition-colors ${isOpen ? 'ring-2 ring-plm-accent' : ''}`}
            style={{ width: avatarSize, height: avatarSize, fontSize: fontSize * 0.9 }}
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(!isOpen)
            }}
            title={`${overflowUsers.length} more user${overflowUsers.length > 1 ? 's' : ''} - click to see all`}
          >
            +{overflowUsers.length}
          </button>
        )}
      </div>
      
      {/* Dropdown menu - positioned to right edge to avoid overflow */}
      {isOpen && (
        <div 
          className="absolute top-full right-0 mt-1 bg-plm-bg border border-plm-border rounded-lg shadow-lg z-[100] min-w-[200px] max-w-[280px] py-1"
          style={{ 
            // Ensure dropdown doesn't go off screen
            maxHeight: 'calc(100vh - 200px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-plm-border flex items-center gap-2">
            <Users size={14} className="text-plm-fg-muted" />
            <span className="text-xs font-medium text-plm-fg-muted">
              {otherUsers.length} user{otherUsers.length > 1 ? 's' : ''} with checkouts
            </span>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {otherUsers.map((u) => {
              // Check if this specific user can receive notifications
              const canNotify = !!(u.fileIds?.length || entityId)
              return (
                <button
                  key={u.id}
                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-plm-highlight/50 transition-colors text-left group/item ${
                    canNotify ? 'cursor-pointer' : 'cursor-default'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    if (canNotify && !sendingTo) handleNotify(u, e)
                  }}
                  title={canNotify ? `Notify ${u.name} to check in` : u.name}
                >
                  {/* Avatar */}
                  <div className="relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                    {(() => {
                      const avatarColors = getAvatarColor(u.email || u.name)
                      return u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={`w-full h-full ${avatarColors.bg} ${avatarColors.text} flex items-center justify-center text-[10px] font-medium`}>
                          {getInitials(u.name)}
                        </div>
                      )
                    })()}
                  </div>
                  
                  {/* Name and count */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-plm-fg truncate">{u.name}</div>
                    {u.count && u.count > 1 && (
                      <div className="text-[10px] text-plm-fg-muted">{u.count} files</div>
                    )}
                  </div>
                  
                  {/* Notify button */}
                  {canNotify && (
                    <div className="flex-shrink-0">
                      {sendingTo === u.id ? (
                        <Loader2 size={16} className="text-plm-accent animate-spin" />
                      ) : (
                        <div className="p-1 rounded bg-red-500/20 text-red-400 opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <Bell size={14} />
                        </div>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
