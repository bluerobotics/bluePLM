import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Bell, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Send, 
  FileText,
  ChevronRight,
  Loader2,
  Check,
  X,
  Trash2,
  MailOpen,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  RotateCcw
} from 'lucide-react'
import { usePDMStore } from '../../stores/pdmStore'
import { 
  getNotifications, 
  getMyReviews,
  getPendingReviewsForUser,
  respondToReview,
  markNotificationsRead,
  markAllNotificationsRead,
  deleteNotification,
  cancelReview
} from '../../lib/supabase'
import type { Review, Notification, ReviewStatus } from '../../types/database'
import { buildFullPath } from '@/lib/utils/path'

type ViewTab = 'notifications' | 'pending' | 'my-reviews'

// Avatar component for user display
function UserAvatar({ user, size = 24 }: { user?: { email: string; full_name: string | null; avatar_url: string | null } | null; size?: number }) {
  if (!user) return null
  
  const initials = user.full_name 
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase()
  
  if (user.avatar_url) {
    return (
      <img 
        src={user.avatar_url} 
        alt={user.full_name || user.email}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    )
  }
  
  // Generate a consistent color based on email
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500', 
    'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'
  ]
  const colorIndex = user.email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  
  return (
    <div 
      className={`${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-medium flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={user.full_name || user.email}
    >
      {initials}
    </div>
  )
}

export function ReviewsView() {
  const { 
    user, 
    organization, 
    addToast, 
    unreadNotificationCount, 
    setUnreadNotificationCount,
    pendingReviewCount,
    setPendingReviewCount,
    vaultPath,
    connectedVaults,
    activeVaultId,
    setActiveView,
    setCurrentFolder,
    setSelectedFiles,
    files
  } = usePDMStore()
  
  
  // Get the vault path for a review (by vault_id or fall back to active vault)
  const getVaultPathForReview = useCallback((review: Review): string | null => {
    // First try to find the vault by vault_id
    if (review.vault_id && connectedVaults.length > 0) {
      const vault = connectedVaults.find(v => v.id === review.vault_id)
      if (vault?.localPath) return vault.localPath
    }
    // Fall back to active vault or legacy vaultPath
    if (activeVaultId && connectedVaults.length > 0) {
      const activeVault = connectedVaults.find(v => v.id === activeVaultId)
      if (activeVault?.localPath) return activeVault.localPath
    }
    return vaultPath
  }, [connectedVaults, activeVaultId, vaultPath])
  
  // Get full file path for a review
  const getFullFilePath = useCallback((review: Review): string | null => {
    if (!review.file?.file_path) return null
    const reviewVaultPath = getVaultPathForReview(review)
    if (!reviewVaultPath) return null
    return buildFullPath(reviewVaultPath, review.file.file_path)
  }, [getVaultPathForReview])
  
  // Open file handler
  const handleOpenFile = useCallback((review: Review) => {
    const fullPath = getFullFilePath(review)
    if (fullPath) {
      window.electronAPI?.openFile(fullPath)
    } else {
      addToast('error', 'Cannot open file: vault not connected')
    }
  }, [getFullFilePath, addToast])
  
  // Get full file path for a notification (similar to review but uses notification.file)
  const getNotificationFilePath = useCallback((notification: Notification): string | null => {
    if (!notification.file?.file_path) return null
    // Use active vault or legacy vaultPath
    let notifVaultPath: string | null = null
    if (activeVaultId && connectedVaults.length > 0) {
      const activeVault = connectedVaults.find(v => v.id === activeVaultId)
      if (activeVault?.localPath) notifVaultPath = activeVault.localPath
    }
    if (!notifVaultPath) notifVaultPath = vaultPath
    if (!notifVaultPath) return null
    return buildFullPath(notifVaultPath, notification.file.file_path)
  }, [connectedVaults, activeVaultId, vaultPath])
  
  // Open notification file handler
  const handleOpenNotificationFile = useCallback((notification: Notification) => {
    const fullPath = getNotificationFilePath(notification)
    if (fullPath) {
      window.electronAPI?.openFile(fullPath)
    } else {
      addToast('error', 'Cannot open file: vault not connected')
    }
  }, [getNotificationFilePath, addToast])
  
  // Navigate to file in file browser (single click)
  const handleNavigateToFile = useCallback((filePath: string | undefined) => {
    if (!filePath) {
      addToast('error', 'File path not available')
      return
    }
    
    // Get the parent folder path
    const pathParts = filePath.replace(/\\/g, '/').split('/')
    pathParts.pop() // Remove filename, we only need the parent folder
    const parentFolder = pathParts.join('/')
    
    // Find the full local path
    const fullPath = files.find(f => f.relativePath.replace(/\\/g, '/') === filePath)?.path
    
    // Navigate to explorer, set folder and select file
    setActiveView('explorer')
    setCurrentFolder(parentFolder)
    if (fullPath) {
      setSelectedFiles([fullPath])
    }
  }, [files, setActiveView, setCurrentFolder, setSelectedFiles, addToast])
  
  // Track double-click timing
  const lastClickTime = useRef<number>(0)
  const lastClickedId = useRef<string | null>(null)
  
  // Handle row click - single click navigates, double click opens
  const handleRowClick = useCallback((review: Review) => {
    const now = Date.now()
    const isDoubleClick = lastClickedId.current === review.id && (now - lastClickTime.current) < 300
    
    lastClickTime.current = now
    lastClickedId.current = review.id
    
    if (isDoubleClick) {
      // Double click - open the file
      handleOpenFile(review)
    } else {
      // Single click - navigate to file in browser
      handleNavigateToFile(review.file?.file_path)
    }
  }, [handleOpenFile, handleNavigateToFile])
  
  const [activeTab, setActiveTab] = useState<ViewTab>('notifications')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [pendingReviews, setPendingReviews] = useState<Review[]>([])
  const [myReviews, setMyReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [responseComment, setResponseComment] = useState('')
  const [expandedReview, setExpandedReview] = useState<string | null>(null)
  
  // Load data based on active tab
  const loadData = useCallback(async () => {
    if (!user?.id || !organization?.id) return
    
    setLoading(true)
    
    try {
      if (activeTab === 'notifications') {
        const { notifications: data } = await getNotifications(user.id, { limit: 50 })
        setNotifications(data)
        
        // Update unread count
        const unreadCount = data.filter(n => !n.read).length
        setUnreadNotificationCount(unreadCount)
      } else if (activeTab === 'pending') {
        const { reviews } = await getPendingReviewsForUser(user.id, organization.id)
        setPendingReviews(reviews)
        setPendingReviewCount(reviews.length)
      } else if (activeTab === 'my-reviews') {
        const { reviews } = await getMyReviews(user.id, organization.id, { asRequester: true, asReviewer: false })
        setMyReviews(reviews)
      }
    } catch (err) {
      console.error('Error loading reviews data:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id, organization?.id, activeTab, setUnreadNotificationCount, setPendingReviewCount])
  
  useEffect(() => {
    loadData()
  }, [loadData])
  
  // Handle responding to a review
  const handleRespond = async (reviewId: string, status: 'approved' | 'rejected') => {
    if (!user?.id) return
    
    setRespondingTo(reviewId)
    
    const { success, error } = await respondToReview(
      reviewId,
      user.id,
      status,
      responseComment || undefined
    )
    
    if (success) {
      addToast('success', `Review ${status}`)
      setResponseComment('')
      setExpandedReview(null)
      loadData()
    } else {
      addToast('error', error || 'Failed to respond to review')
    }
    
    setRespondingTo(null)
  }
  
  // Handle marking notification as read
  const handleMarkRead = async (notificationId: string) => {
    const { success } = await markNotificationsRead([notificationId])
    if (success) {
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true, read_at: new Date().toISOString() } : n)
      )
      setUnreadNotificationCount(Math.max(0, unreadNotificationCount - 1))
    }
  }
  
  // Handle marking all as read
  const handleMarkAllRead = async () => {
    if (!user?.id) return
    
    const { success, updated } = await markAllNotificationsRead(user.id)
    if (success) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: new Date().toISOString() })))
      setUnreadNotificationCount(0)
      if (updated > 0) {
        addToast('success', `Marked ${updated} notifications as read`)
      }
    }
  }
  
  // Handle deleting a notification
  const handleDeleteNotification = async (notificationId: string) => {
    const notification = notifications.find(n => n.id === notificationId)
    const { success } = await deleteNotification(notificationId)
    if (success) {
      setNotifications(prev => prev.filter(n => n.id !== notificationId))
      if (notification && !notification.read) {
        setUnreadNotificationCount(Math.max(0, unreadNotificationCount - 1))
      }
    }
  }
  
  // Handle cancelling a review
  const handleCancelReview = async (reviewId: string) => {
    if (!user?.id) return
    
    const { success, error } = await cancelReview(reviewId, user.id)
    if (success) {
      addToast('success', 'Review cancelled')
      loadData()
    } else {
      addToast('error', error || 'Failed to cancel review')
    }
  }
  
  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }
  
  // Get status color
  const getStatusColor = (status: ReviewStatus) => {
    switch (status) {
      case 'approved': return 'text-plm-success'
      case 'rejected': return 'text-plm-error'
      case 'cancelled': return 'text-plm-fg-muted'
      default: return 'text-plm-warning'
    }
  }
  
  // Get status icon
  const getStatusIcon = (status: ReviewStatus) => {
    switch (status) {
      case 'approved': return <CheckCircle2 size={14} className="text-plm-success" />
      case 'rejected': return <XCircle size={14} className="text-plm-error" />
      case 'cancelled': return <X size={14} className="text-plm-fg-muted" />
      default: return <Clock size={14} className="text-plm-warning" />
    }
  }
  
  // Get notification icon
  if (!user) {
    return (
      <div className="p-4 text-center text-plm-fg-muted">
        <Bell size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">Sign in to view reviews and notifications</p>
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-plm-border">
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
            activeTab === 'notifications'
              ? 'text-plm-accent border-b-2 border-plm-accent -mb-px'
              : 'text-plm-fg-muted hover:text-plm-fg'
          }`}
        >
          <Bell size={12} className="inline mr-1" />
          Notifications
          {unreadNotificationCount > 0 && (
            <span className="absolute top-1 right-2 w-4 h-4 bg-plm-accent text-white text-[10px] rounded-full flex items-center justify-center">
              {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
            activeTab === 'pending'
              ? 'text-plm-accent border-b-2 border-plm-accent -mb-px'
              : 'text-plm-fg-muted hover:text-plm-fg'
          }`}
        >
          <Clock size={12} className="inline mr-1" />
          Pending
          {pendingReviewCount > 0 && (
            <span className="absolute top-1 right-2 w-4 h-4 bg-plm-warning text-white text-[10px] rounded-full flex items-center justify-center">
              {pendingReviewCount > 9 ? '9+' : pendingReviewCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('my-reviews')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'my-reviews'
              ? 'text-plm-accent border-b-2 border-plm-accent -mb-px'
              : 'text-plm-fg-muted hover:text-plm-fg'
          }`}
        >
          <Send size={12} className="inline mr-1" />
          My Requests
        </button>
      </div>
      
      {/* Actions bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-plm-border bg-plm-bg-light/50">
        <button
          onClick={loadData}
          disabled={loading}
          className="text-xs text-plm-fg-muted hover:text-plm-fg flex items-center gap-1"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        
        {activeTab === 'notifications' && unreadNotificationCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-plm-accent hover:text-plm-accent/80 flex items-center gap-1"
          >
            <MailOpen size={12} />
            Mark all read
          </button>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={24} className="animate-spin text-plm-accent" />
          </div>
        ) : activeTab === 'notifications' ? (
          // Notifications list - with special handling for review requests
          notifications.length === 0 ? (
            <div className="p-6 text-center text-plm-fg-muted">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-plm-accent/10 flex items-center justify-center">
                <Bell size={32} className="text-plm-accent" />
              </div>
              <p className="text-sm font-medium text-plm-fg">No notifications</p>
              <p className="text-xs mt-1 text-plm-fg-muted">You're all caught up!</p>
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {notifications.map(notification => {
                const isReviewRequest = notification.type === 'review_request'
                const hasFile = !!notification.file
                
                // For review requests, show card-style with approve/reject
                if (isReviewRequest && notification.review_id) {
                  return (
                    <div
                      key={notification.id}
                      className={`bg-plm-bg-light border rounded-lg overflow-hidden transition-colors ${
                        !notification.read ? 'border-plm-accent/50' : 'border-plm-border hover:border-plm-accent/30'
                      }`}
                    >
                      {/* Clickable card area */}
                      <div 
                        className="p-3 cursor-pointer"
                        onClick={() => {
                          if (notification.file?.file_path) {
                            handleNavigateToFile(notification.file.file_path)
                          }
                        }}
                        onDoubleClick={() => handleOpenNotificationFile(notification)}
                        title="Click to view in browser, double-click to open file"
                      >
                        {/* Header with avatar */}
                        <div className="flex items-start gap-3">
                          <UserAvatar user={notification.from_user} size={36} />
                          <div className="flex-1 min-w-0">
                            {/* From user */}
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-plm-fg">
                                {notification.from_user?.full_name || notification.from_user?.email?.split('@')[0] || 'Someone'}
                              </span>
                              {!notification.read && (
                                <span className="w-2 h-2 bg-plm-accent rounded-full flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-plm-fg-muted">requested your review</p>
                            
                            {/* File info */}
                            {hasFile && (
                              <div className="flex items-center gap-2 mt-2 p-2 bg-plm-bg rounded">
                                <FileText size={16} className="text-plm-accent flex-shrink-0" />
                                <span className="text-sm font-medium text-plm-fg truncate">
                                  {notification.file?.file_name}
                                </span>
                              </div>
                            )}
                            
                            {/* Message */}
                            {notification.message && (
                              <p className="text-xs text-plm-fg-dim mt-2 line-clamp-2">
                                "{notification.message}"
                              </p>
                            )}
                            
                            {/* Time */}
                            <p className="text-[10px] text-plm-fg-muted mt-2">
                              {formatRelativeTime(notification.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center border-t border-plm-border bg-plm-bg/50">
                        <button
                          onClick={async () => {
                            if (notification.review_id) {
                              await respondToReview(notification.review_id, user!.id, 'approved')
                              handleMarkRead(notification.id)
                              addToast('success', 'Review approved')
                              loadData()
                            }
                          }}
                          className="flex-1 px-3 py-2.5 text-xs font-medium text-plm-success hover:bg-plm-success/10 flex items-center justify-center gap-1.5 transition-colors border-r border-plm-border"
                        >
                          <ThumbsUp size={14} />
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setExpandedReview(expandedReview === notification.id ? null : notification.id)
                          }}
                          className="flex-1 px-3 py-2.5 text-xs font-medium text-plm-warning hover:bg-plm-warning/10 flex items-center justify-center gap-1.5 transition-colors border-r border-plm-border"
                        >
                          <RotateCcw size={14} />
                          Request Changes
                        </button>
                        <button
                          onClick={async () => {
                            if (notification.review_id) {
                              await respondToReview(notification.review_id, user!.id, 'rejected')
                              handleMarkRead(notification.id)
                              addToast('info', 'Review rejected')
                              loadData()
                            }
                          }}
                          className="flex-1 px-3 py-2.5 text-xs font-medium text-plm-error hover:bg-plm-error/10 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <ThumbsDown size={14} />
                          Reject
                        </button>
                      </div>
                      
                      {/* Expanded comment form */}
                      {expandedReview === notification.id && (
                        <div className="p-3 border-t border-plm-border bg-plm-bg">
                          <textarea
                            placeholder="Add feedback or reason for changes..."
                            value={responseComment}
                            onChange={(e) => setResponseComment(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-plm-bg-light border border-plm-border rounded-lg resize-none focus:outline-none focus:border-plm-accent"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={() => {
                                setExpandedReview(null)
                                setResponseComment('')
                              }}
                              className="px-3 py-1.5 text-xs text-plm-fg-muted hover:text-plm-fg"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={async () => {
                                if (notification.review_id) {
                                  await respondToReview(notification.review_id, user!.id, 'rejected', responseComment)
                                  handleMarkRead(notification.id)
                                  addToast('info', 'Feedback sent')
                                  setExpandedReview(null)
                                  setResponseComment('')
                                  loadData()
                                }
                              }}
                              disabled={!responseComment.trim()}
                              className="px-4 py-1.5 text-xs font-medium bg-plm-warning text-white rounded hover:bg-plm-warning/90 disabled:opacity-50"
                            >
                              Send Feedback
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }
                
                // Regular notifications (non-review)
                return (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-lg transition-colors group ${
                      !notification.read ? 'bg-plm-accent/5 border border-plm-accent/20' : 'bg-plm-bg-light border border-plm-border hover:border-plm-accent/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <UserAvatar user={notification.from_user} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium truncate ${!notification.read ? 'text-plm-fg' : 'text-plm-fg-dim'}`}>
                            {notification.title}
                          </span>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-plm-accent rounded-full flex-shrink-0" />
                          )}
                        </div>
                        {notification.message && (
                          <p className="text-xs text-plm-fg-muted mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                        {hasFile && (
                          <div 
                            className="flex items-center gap-1 mt-1.5 p-1.5 bg-plm-bg rounded cursor-pointer hover:bg-plm-highlight"
                            onClick={() => handleNavigateToFile(notification.file?.file_path)}
                            onDoubleClick={() => handleOpenNotificationFile(notification)}
                          >
                            <FileText size={12} className="text-plm-accent" />
                            <span className="text-[11px] text-plm-fg truncate">
                              {notification.file?.file_name}
                            </span>
                          </div>
                        )}
                        <p className="text-[10px] text-plm-fg-muted mt-1.5">
                          {formatRelativeTime(notification.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!notification.read && (
                          <button
                            onClick={() => handleMarkRead(notification.id)}
                            className="p-1.5 text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight rounded"
                            title="Mark as read"
                          >
                            <Check size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteNotification(notification.id)}
                          className="p-1.5 text-plm-fg-muted hover:text-plm-error hover:bg-plm-highlight rounded"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : activeTab === 'pending' ? (
          // Pending reviews (need response)
          pendingReviews.length === 0 ? (
            <div className="p-6 text-center text-plm-fg-muted">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-plm-success/10 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-plm-success" />
              </div>
              <p className="text-sm font-medium text-plm-fg">All caught up!</p>
              <p className="text-xs mt-1 text-plm-fg-muted">No reviews waiting for your response</p>
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {pendingReviews.map(review => (
                <div 
                  key={review.id} 
                  className="bg-plm-bg-light border border-plm-border rounded-lg overflow-hidden hover:border-plm-accent/50 transition-colors"
                >
                  {/* Clickable review card */}
                  <div 
                    className="p-3 cursor-pointer"
                    onClick={() => handleRowClick(review)}
                    title="Click to view in browser, double-click to open file"
                  >
                    {/* Header with avatar and file info */}
                    <div className="flex items-start gap-3">
                      <UserAvatar user={review.requester} size={32} />
                      <div className="flex-1 min-w-0">
                        {/* File name */}
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-plm-accent flex-shrink-0" />
                          <span className="text-sm font-medium text-plm-fg truncate">
                            {review.file?.file_name || 'Unknown file'}
                          </span>
                        </div>
                        
                        {/* Review title if present */}
                        {review.title && (
                          <p className="text-xs text-plm-fg-dim mt-1 truncate">{review.title}</p>
                        )}
                        
                        {/* Requester and metadata */}
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-plm-fg-muted">
                          <span className="font-medium text-plm-fg-dim">
                            {review.requester?.full_name || review.requester?.email?.split('@')[0]}
                          </span>
                          <span>•</span>
                          <span>v{review.file_version}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(review.created_at)}</span>
                        </div>
                      </div>
                      
                      {/* Priority/Due badges */}
                      <div className="flex flex-col items-end gap-1">
                        {review.priority && review.priority !== 'normal' && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            review.priority === 'urgent' ? 'bg-plm-error text-white' :
                            review.priority === 'high' ? 'bg-plm-warning text-white' :
                            'bg-plm-fg-muted/20 text-plm-fg-muted'
                          }`}>
                            {review.priority.toUpperCase()}
                          </span>
                        )}
                        {review.due_date && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            new Date(review.due_date) < new Date() ? 'bg-plm-error text-white' :
                            new Date(review.due_date) < new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) ? 'bg-plm-warning/20 text-plm-warning' :
                            'bg-plm-fg-muted/20 text-plm-fg-muted'
                          }`}>
                            <Clock size={10} />
                            {new Date(review.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Message preview */}
                    {review.message && (
                      <div className="mt-2 p-2 bg-plm-bg rounded text-xs text-plm-fg-dim line-clamp-2">
                        "{review.message}"
                      </div>
                    )}
                  </div>
                  
                  {/* Action buttons - always visible at bottom */}
                  <div className="flex items-center border-t border-plm-border bg-plm-bg/50">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRespond(review.id, 'approved')
                      }}
                      disabled={respondingTo === review.id}
                      className="flex-1 px-3 py-2.5 text-xs font-medium text-plm-success hover:bg-plm-success/10 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors border-r border-plm-border"
                    >
                      {respondingTo === review.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ThumbsUp size={14} />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedReview(expandedReview === review.id ? null : review.id)
                      }}
                      className="flex-1 px-3 py-2.5 text-xs font-medium text-plm-warning hover:bg-plm-warning/10 flex items-center justify-center gap-1.5 transition-colors border-r border-plm-border"
                    >
                      <RotateCcw size={14} />
                      Request Changes
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRespond(review.id, 'rejected')
                      }}
                      disabled={respondingTo === review.id}
                      className="flex-1 px-3 py-2.5 text-xs font-medium text-plm-error hover:bg-plm-error/10 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {respondingTo === review.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ThumbsDown size={14} />
                      )}
                      Reject
                    </button>
                  </div>
                  
                  {/* Expanded comment form */}
                  {expandedReview === review.id && (
                    <div className="p-3 border-t border-plm-border bg-plm-bg">
                      <textarea
                        placeholder="Add feedback or reason for changes..."
                        value={responseComment}
                        onChange={(e) => setResponseComment(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-plm-bg-light border border-plm-border rounded-lg resize-none focus:outline-none focus:border-plm-accent"
                        rows={3}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={() => {
                            setExpandedReview(null)
                            setResponseComment('')
                          }}
                          className="px-3 py-1.5 text-xs text-plm-fg-muted hover:text-plm-fg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleRespond(review.id, 'rejected')}
                          disabled={respondingTo === review.id || !responseComment.trim()}
                          className="px-4 py-1.5 text-xs font-medium bg-plm-warning text-white rounded hover:bg-plm-warning/90 disabled:opacity-50"
                        >
                          Send Feedback
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          // My reviews (reviews I requested)
          myReviews.length === 0 ? (
            <div className="p-6 text-center text-plm-fg-muted">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-plm-accent/10 flex items-center justify-center">
                <Send size={32} className="text-plm-accent" />
              </div>
              <p className="text-sm font-medium text-plm-fg">No review requests</p>
              <p className="text-xs mt-1 text-plm-fg-muted">Right-click a file to request a review</p>
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {myReviews.map(review => (
                <div 
                  key={review.id} 
                  className={`bg-plm-bg-light border rounded-lg overflow-hidden transition-colors ${
                    review.status === 'approved' ? 'border-plm-success/30' :
                    review.status === 'rejected' ? 'border-plm-error/30' :
                    'border-plm-border hover:border-plm-accent/50'
                  }`}
                >
                  {/* Clickable review card */}
                  <div 
                    className="p-3 cursor-pointer"
                    onClick={() => handleRowClick(review)}
                    title="Click to view in browser, double-click to open file"
                  >
                    {/* Header with file info and status */}
                    <div className="flex items-start gap-3">
                      {/* Status indicator */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        review.status === 'approved' ? 'bg-plm-success/20' :
                        review.status === 'rejected' ? 'bg-plm-error/20' :
                        review.status === 'cancelled' ? 'bg-plm-fg-muted/20' :
                        'bg-plm-warning/20'
                      }`}>
                        {review.status === 'approved' ? <CheckCircle2 size={20} className="text-plm-success" /> :
                         review.status === 'rejected' ? <XCircle size={20} className="text-plm-error" /> :
                         review.status === 'cancelled' ? <X size={20} className="text-plm-fg-muted" /> :
                         <Clock size={20} className="text-plm-warning" />}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {/* File name */}
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-plm-accent flex-shrink-0" />
                          <span className="text-sm font-medium text-plm-fg truncate">
                            {review.file?.file_name || 'Unknown file'}
                          </span>
                        </div>
                        
                        {/* Review title if present */}
                        {review.title && (
                          <p className="text-xs text-plm-fg-dim mt-1 truncate">{review.title}</p>
                        )}
                        
                        {/* Status and metadata */}
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-plm-fg-muted">
                          <span className={`font-semibold ${getStatusColor(review.status)}`}>
                            {review.status.charAt(0).toUpperCase() + review.status.slice(1)}
                          </span>
                          <span>•</span>
                          <span>v{review.file_version}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(review.created_at)}</span>
                        </div>
                      </div>
                      
                      {/* Expand indicator */}
                      <ChevronRight 
                        size={16} 
                        className={`text-plm-fg-muted transition-transform flex-shrink-0 ${
                          expandedReview === review.id ? 'rotate-90' : ''
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedReview(expandedReview === review.id ? null : review.id)
                        }}
                      />
                    </div>
                    
                    {/* Reviewers summary */}
                    {review.responses && review.responses.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {review.responses.slice(0, 3).map(response => (
                            <div key={response.id} className="relative">
                              <UserAvatar user={response.reviewer} size={24} />
                              {response.status !== 'pending' && (
                                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-plm-bg-light flex items-center justify-center ${
                                  response.status === 'approved' ? 'bg-plm-success' : 'bg-plm-error'
                                }`}>
                                  {response.status === 'approved' ? 
                                    <Check size={8} className="text-white" /> : 
                                    <X size={8} className="text-white" />
                                  }
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <span className="text-[10px] text-plm-fg-muted">
                          {review.responses.filter(r => r.status === 'approved').length}/{review.responses.length} approved
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Expanded details */}
                  {expandedReview === review.id && (
                    <div className="p-3 border-t border-plm-border bg-plm-bg space-y-3">
                      {review.message && (
                        <div className="p-2 bg-plm-bg-light rounded text-xs text-plm-fg-dim">
                          "{review.message}"
                        </div>
                      )}
                      
                      {/* Detailed reviewers list */}
                      <div className="space-y-2">
                        <p className="text-[10px] text-plm-fg-muted uppercase tracking-wide font-medium">Reviewers</p>
                        {review.responses?.map(response => (
                          <div 
                            key={response.id}
                            className="flex items-center gap-2 p-2 bg-plm-bg-light rounded"
                          >
                            <UserAvatar user={response.reviewer} size={28} />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium text-plm-fg truncate block">
                                {response.reviewer?.full_name || response.reviewer?.email}
                              </span>
                              {response.comment && (
                                <p className="text-[10px] text-plm-fg-muted truncate">"{response.comment}"</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(response.status)}
                              {response.responded_at && (
                                <span className="text-[10px] text-plm-fg-muted">
                                  {formatRelativeTime(response.responded_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Cancel button for pending reviews */}
                      {review.status === 'pending' && (
                        <button
                          onClick={() => handleCancelReview(review.id)}
                          className="w-full px-3 py-2 text-xs font-medium text-plm-error hover:bg-plm-error/10 rounded flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Trash2 size={14} />
                          Cancel Review Request
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

