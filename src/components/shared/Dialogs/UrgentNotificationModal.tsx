/**
 * UrgentNotificationModal - Modal that appears for urgent priority notifications
 * 
 * This modal is triggered when a notification with priority 'urgent' arrives.
 * It demands user attention and provides action buttons.
 */
import { memo, useCallback } from 'react'
import { AlertTriangle, Bell, FileText, X, ExternalLink, Check } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { markNotificationsRead } from '@/lib/supabase/notifications'
import { buildFullPath } from '@/lib/utils/path'
import type { NotificationWithDetails } from '@/types/database'

export interface UrgentNotificationModalProps {
  notification: NotificationWithDetails
  onClose: () => void
  onAcknowledge?: () => void
}

/**
 * Format relative time from a date string
 */
function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'unknown'
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

/**
 * Avatar component for the sender
 */
function SenderAvatar({ user, size = 48 }: { 
  user?: { email: string; full_name: string | null; avatar_url: string | null } | null
  size?: number 
}) {
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
      className={`${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={user.full_name || user.email}
    >
      {initials}
    </div>
  )
}

export const UrgentNotificationModal = memo(function UrgentNotificationModal({
  notification,
  onClose,
  onAcknowledge
}: UrgentNotificationModalProps) {
  const { 
    vaultPath, 
    connectedVaults, 
    activeVaultId, 
    setActiveView, 
    setCurrentFolder, 
    setSelectedFiles, 
    files,
    addToast,
    markNotificationRead: storeMarkNotificationRead
  } = usePDMStore()
  
  const senderName = notification.from_user?.full_name || 
    notification.from_user?.email?.split('@')[0] || 
    'Someone'
  
  // Handle acknowledging the notification
  const handleAcknowledge = useCallback(async () => {
    // Mark as read in database
    const { success } = await markNotificationsRead([notification.id])
    if (success) {
      storeMarkNotificationRead(notification.id)
    }
    
    onAcknowledge?.()
    onClose()
  }, [notification.id, storeMarkNotificationRead, onAcknowledge, onClose])
  
  // Navigate to the file in file browser
  const handleGoToFile = useCallback(() => {
    if (!notification.file?.file_path) {
      addToast('error', 'File path not available')
      return
    }
    
    const filePath = notification.file.file_path.replace(/\\/g, '/')
    const pathParts = filePath.split('/')
    pathParts.pop()
    const parentFolder = pathParts.join('/')
    
    // Find full path from files list
    const fullPath = files.find(f => f.relativePath.replace(/\\/g, '/') === filePath)?.path
    
    setActiveView('explorer')
    setCurrentFolder(parentFolder)
    if (fullPath) {
      setSelectedFiles([fullPath])
    }
    
    handleAcknowledge()
  }, [notification.file, files, setActiveView, setCurrentFolder, setSelectedFiles, addToast, handleAcknowledge])
  
  // Open the file directly
  const handleOpenFile = useCallback(() => {
    if (!notification.file?.file_path) return
    
    let notifVaultPath: string | null = null
    if (activeVaultId && connectedVaults.length > 0) {
      const activeVault = connectedVaults.find(v => v.id === activeVaultId)
      if (activeVault?.localPath) notifVaultPath = activeVault.localPath
    }
    if (!notifVaultPath) notifVaultPath = vaultPath
    if (!notifVaultPath) {
      addToast('error', 'Cannot open file: vault not connected')
      return
    }
    
    const fullPath = buildFullPath(notifVaultPath, notification.file.file_path)
    window.electronAPI?.openFile(fullPath)
    
    handleAcknowledge()
  }, [notification.file, connectedVaults, activeVaultId, vaultPath, addToast, handleAcknowledge])
  
  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-plm-bg-light border-2 border-red-500/50 rounded-xl p-0 max-w-md w-full mx-4 shadow-2xl shadow-red-500/20 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 px-6 py-4 rounded-t-xl border-b border-red-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/30 flex items-center justify-center animate-pulse">
              <AlertTriangle size={24} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-plm-fg">Urgent Notification</h3>
              <p className="text-xs text-plm-fg-muted">{formatRelativeTime(notification.created_at)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-plm-fg-muted hover:text-plm-fg rounded-lg hover:bg-plm-highlight transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Sender */}
          <div className="flex items-center gap-4">
            <SenderAvatar user={notification.from_user} size={48} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-plm-fg">{senderName}</span>
                <Bell size={14} className="text-red-400" />
              </div>
              <p className="text-sm text-plm-fg-muted truncate">
                {notification.from_user?.email}
              </p>
            </div>
          </div>
          
          {/* Notification content */}
          <div className="bg-plm-bg rounded-lg p-4 border border-plm-border">
            <h4 className="font-medium text-plm-fg mb-2">{notification.title}</h4>
            {notification.message && (
              <p className="text-sm text-plm-fg-muted">{notification.message}</p>
            )}
          </div>
          
          {/* File link (if applicable) */}
          {notification.file && (
            <div 
              className="flex items-center gap-3 p-3 bg-plm-bg rounded-lg border border-plm-border cursor-pointer hover:bg-plm-highlight transition-colors"
              onClick={handleGoToFile}
            >
              <FileText size={20} className="text-plm-accent flex-shrink-0" />
              <span className="text-sm text-plm-fg truncate flex-1">
                {notification.file.file_name}
              </span>
              <ExternalLink size={14} className="text-plm-fg-muted" />
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="px-6 py-4 border-t border-plm-border flex items-center justify-end gap-3">
          {notification.file && (
            <button
              onClick={handleOpenFile}
              className="px-4 py-2 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors"
            >
              Open File
            </button>
          )}
          <button
            onClick={handleAcknowledge}
            className="px-6 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Check size={16} />
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  )
})

export default UrgentNotificationModal
