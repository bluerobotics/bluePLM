/**
 * File Status column cell renderer
 */
import { ArrowDown, Cloud, HardDrive, Loader2, Monitor } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { useFilePaneContext, useFilePaneHandlers } from '../../../context'
import type { CellRendererBaseProps } from './types'

// Map operation types to display labels for status column
const OPERATION_LABELS: Record<string, string> = {
  checkout: 'Checking out...',
  checkin: 'Checking in...',
  download: 'Downloading...',
  upload: 'Uploading...',
  sync: 'Syncing...',
  delete: 'Deleting...'
}

export function FileStatusCell({ file }: CellRendererBaseProps): React.ReactNode {
  const { user, currentMachineId } = useFilePaneContext()
  const { getProcessingOperation } = useFilePaneHandlers()
  
  if (file.isDirectory) return ''
  
  // Get operation type for this file (if any operation is in progress)
  const operationType = getProcessingOperation(file.relativePath, false)
  
  // Priority (highest to lowest):
  // 0. PROCESSING - always show spinner first (prevents flickering)
  // 1. Update files (outdated) - needs update from server
  // 2. Cloud files (cloud only, not downloaded)
  // 3. Avatar checkout (checked out by someone)
  // 4. Green cloud (synced/checked in)
  // 5. Local files (not synced) - lowest priority
  
  // 0. HIGHEST: Processing state - show spinner immediately
  if (operationType) {
    const label = OPERATION_LABELS[operationType] || 'Processing...'
    return (
      <span className="flex items-center gap-1 text-plm-fg-muted" title={label}>
        <Loader2 size={12} className="animate-spin flex-shrink-0" />
        {label}
      </span>
    )
  }
  
  // 1. Update files (outdated - server has newer version)
  if (file.diffStatus === 'outdated') {
    return (
      <span className="flex items-center gap-1 text-purple-400" title="Server has a newer version - update available">
        <ArrowDown size={12} className="flex-shrink-0" />
        Update
      </span>
    )
  }
  
  // 2. Cloud files (exists on server, not downloaded locally)
  if (file.diffStatus === 'cloud') {
    return (
      <span className="flex items-center gap-1 text-plm-info" title="Cloud file - download to work on it">
        <Cloud size={12} className="flex-shrink-0" />
        Cloud
      </span>
    )
  }
  
  // 3. Avatar checkout (checked out by someone)
  if (file.pdmData?.checked_out_by) {
    const isMe = user?.id === file.pdmData.checked_out_by
    const checkoutUser = file.pdmData.checked_out_user
    const checkoutAvatarUrl = isMe ? user?.avatar_url : checkoutUser?.avatar_url
    const checkoutName = isMe ? 'You' : (checkoutUser?.full_name || checkoutUser?.email?.split('@')[0] || 'Someone')
    
    // Check if checked out on different machine (only for current user)
    const checkoutMachineId = file.pdmData.checked_out_by_machine_id
    const checkoutMachineName = file.pdmData.checked_out_by_machine_name
    const isDifferentMachine = isMe && checkoutMachineId && currentMachineId && checkoutMachineId !== currentMachineId
    
    return (
      <span 
        className={`flex items-center gap-1 ${isMe ? 'text-plm-warning' : 'text-plm-error'}`} 
        title={isDifferentMachine ? `Checked out by ${checkoutName} on ${checkoutMachineName || 'another computer'} (different computer)` : `Checked out by ${checkoutName}`}
      >
        <div className="relative w-5 h-5 flex-shrink-0">
          {checkoutAvatarUrl ? (
            <img 
              src={checkoutAvatarUrl} 
              alt={checkoutName}
              className="w-5 h-5 rounded-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                target.nextElementSibling?.classList.remove('hidden')
              }}
            />
          ) : null}
          <div className={`w-5 h-5 rounded-full ${isMe ? 'bg-plm-warning/30' : 'bg-plm-error/30'} flex items-center justify-center text-[9px] font-medium absolute inset-0 ${checkoutAvatarUrl ? 'hidden' : ''}`}>
            {getInitials(checkoutName)}
          </div>
          {isDifferentMachine && (
            <div 
              className="absolute -bottom-0.5 -right-0.5 bg-plm-warning rounded-full p-0.5"
              style={{ width: 8, height: 8 }}
              title={`Checked out on ${checkoutMachineName || 'another computer'}`}
            >
              <Monitor 
                size={6} 
                className="text-plm-bg w-full h-full" 
              />
            </div>
          )}
        </div>
        Checked Out
      </span>
    )
  }
  
  // 4. Green cloud (synced/checked in - has pdmData, no checkout)
  if (file.pdmData) {
    return (
      <span className="flex items-center gap-1 text-plm-success" title="Synced and checked in">
        <Cloud size={12} className="flex-shrink-0" />
        Checked In
      </span>
    )
  }
  
  // 5. LOWEST: Local files (not synced - no pdmData)
  return (
    <span className="flex items-center gap-1 text-plm-fg-muted" title="Local file - not yet synced to cloud">
      <HardDrive size={12} className="flex-shrink-0" />
      Local
    </span>
  )
}
