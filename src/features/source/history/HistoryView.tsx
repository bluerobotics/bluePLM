import { useCallback, useEffect, useState } from 'react'
import { FileText, User, Clock, ArrowUp, ArrowDown, Trash2, Edit, RefreshCw, FolderPlus, MoveRight, X, FolderOpen, RotateCcw, ExternalLink } from 'lucide-react'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
import { getRecentActivity } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'

interface ActivityEntry {
  id: string
  action: 'checkout' | 'checkin' | 'create' | 'delete' | 'restore' | 'state_change' | 'revision_change' | 'rename' | 'move'
  user_email: string
  details: Record<string, unknown>
  created_at: string
  file?: {
    file_name: string
    file_path: string
  } | null
}

const ACTION_INFO: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  checkout: { icon: <ArrowDown size={14} />, label: 'Checked out', color: 'text-plm-error' },
  checkin: { icon: <ArrowUp size={14} />, label: 'Checked in', color: 'text-plm-success' },
  create: { icon: <FolderPlus size={14} />, label: 'Created', color: 'text-plm-accent' },
  delete: { icon: <Trash2 size={14} />, label: 'Moved to trash', color: 'text-plm-warning' },
  restore: { icon: <RotateCcw size={14} />, label: 'Restored', color: 'text-plm-success' },
  state_change: { icon: <RefreshCw size={14} />, label: 'State changed', color: 'text-plm-warning' },
  revision_change: { icon: <Edit size={14} />, label: 'Revision changed', color: 'text-plm-info' },
  rename: { icon: <Edit size={14} />, label: 'Renamed', color: 'text-plm-fg-dim' },
  move: { icon: <MoveRight size={14} />, label: 'Moved', color: 'text-plm-fg-dim' },
}

export function HistoryView() {
  const { 
    organization, 
    isVaultConnected, 
    historyFolderFilter, 
    setHistoryFolderFilter,
    files,
    setCurrentFolder,
    setSelectedFiles,
    addToast
  } = usePDMStore()
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  // Navigate to file in file browser (click on history item)
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
    
    // Navigate to folder and select file in file browser pane
    setCurrentFolder(parentFolder)
    if (fullPath) {
      setSelectedFiles([fullPath])
    }
  }, [files, setCurrentFolder, setSelectedFiles, addToast])

  // Load vault-wide activity
  useEffect(() => {
    const loadActivity = async () => {
      if (!isVaultConnected || !organization) {
        setActivity([])
        return
      }
      
      setIsLoading(true)
      
      try {
        const { activity: recentActivity, error } = await getRecentActivity(organization.id, 100)
        if (!error && recentActivity) {
          setActivity(recentActivity as ActivityEntry[])
        }
      } catch (err) {
        log.error('[History]', 'Failed to load activity', { error: err })
      } finally {
        setIsLoading(false)
      }
    }

    loadActivity()
    
    // Refresh every 30 seconds
    const interval = setInterval(loadActivity, 30000)
    return () => clearInterval(interval)
  }, [isVaultConnected, organization])
  
  // Filter activity by folder if filter is set
  const filteredActivity = historyFolderFilter
    ? activity.filter(entry => {
        if (!entry.file?.file_path) return false
        // Check if file path starts with the filter path
        return entry.file.file_path.startsWith(historyFolderFilter + '/') || 
               entry.file.file_path === historyFolderFilter
      })
    : activity

  if (!isVaultConnected) {
    return (
      <div className="p-4 text-sm text-plm-fg-muted text-center">
        Open a vault to view activity
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="p-4 text-sm text-plm-fg-muted text-center">
        Sign in to view vault activity
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="text-xs text-plm-fg-muted uppercase tracking-wide mb-3">
        {historyFolderFilter ? 'Folder History' : 'Vault Activity'}
      </div>
      
      {/* Folder filter indicator */}
      {historyFolderFilter && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-plm-bg-light rounded border border-plm-border">
          <FolderOpen size={14} className="text-plm-accent flex-shrink-0" />
          <span className="text-sm truncate flex-1" title={historyFolderFilter}>
            {historyFolderFilter.split('/').pop() || historyFolderFilter}
          </span>
          <button
            onClick={() => setHistoryFolderFilter(null)}
            className="p-0.5 hover:bg-plm-bg rounded text-plm-fg-muted hover:text-plm-fg"
            title="Clear filter"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {isLoading && filteredActivity.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <div className="spinner" />
        </div>
      ) : filteredActivity.length === 0 ? (
        <div className="text-sm text-plm-fg-muted py-4 text-center">
          {historyFolderFilter ? 'No activity in this folder' : 'No recent activity'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredActivity.map((entry) => {
            const actionInfo = ACTION_INFO[entry.action] || { 
              icon: <FileText size={14} />, 
              label: entry.action, 
              color: 'text-plm-fg-muted' 
            }
            
            const filePath = entry.file?.file_path
            const canNavigate = !!filePath
            
            return (
              <div
                key={entry.id}
                onClick={() => canNavigate && handleNavigateToFile(filePath)}
                className={`group p-2 bg-plm-bg-light rounded border border-plm-border hover:border-plm-border-light transition-colors ${canNavigate ? 'cursor-pointer hover:bg-plm-bg-hover' : ''}`}
                title={canNavigate ? `Click to reveal in Explorer: ${filePath}` : undefined}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 ${actionInfo.color}`}>
                    {actionInfo.icon}
                  </span>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="text-sm flex items-center gap-1">
                      <span className={`${actionInfo.color} whitespace-nowrap flex-shrink-0`}>{actionInfo.label}</span>
                      {entry.file ? (
                        <span className="text-plm-fg truncate">
                          {entry.file.file_name}
                        </span>
                      ) : (entry.details as any)?.file_name ? (
                        <span className="text-plm-fg truncate">
                          {(entry.details as any).file_name}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-plm-fg-muted mt-1">
                      <span className="flex items-center gap-1">
                        <User size={10} />
                        {entry.user_email.split('@')[0]}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                      </span>
                      {canNavigate && (
                        <span className="flex items-center gap-1 text-plm-accent opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink size={10} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
