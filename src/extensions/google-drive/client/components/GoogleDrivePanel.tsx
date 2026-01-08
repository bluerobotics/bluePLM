/**
 * Google Drive Panel Component
 * 
 * Displays Google Drive files and provides browsing functionality.
 * All operations go through the ExtensionClientAPI.
 * 
 * @module extensions/google-drive/client/components/GoogleDrivePanel
 */

import { useState, useEffect, useCallback } from 'react'
import { 
  HardDrive, 
  Folder, 
  FileText,
  FileSpreadsheet,
  File,
  ChevronRight,
  LogOut,
  RefreshCw,
  Star,
  Clock,
  Trash2,
  Users,
  Loader2,
  Home,
  ArrowLeft,
  Grid,
  List,
  Search,
  X,
  Presentation,
  LogIn
} from 'lucide-react'
import type { ExtensionClientAPI } from '@/lib/extensions/api/types'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
  starred?: boolean
  webViewLink?: string
  shared?: boolean
  owners?: { displayName: string; emailAddress: string }[]
}

interface BreadcrumbItem {
  id: string
  name: string
}

type ViewMode = 'grid' | 'list'
type SpecialView = 'starred' | 'recent' | 'shared' | 'trash' | null

interface GoogleDrivePanelProps {
  api: ExtensionClientAPI
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Google Drive file browser panel.
 * 
 * This component provides a full file browser experience for Google Drive,
 * rendered within the Extension Host sandbox.
 */
export function GoogleDrivePanel({ api }: GoogleDrivePanelProps) {
  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [userInfo, setUserInfo] = useState<{ email: string; name: string } | null>(null)

  // Navigation state
  const [currentFolderId, setCurrentFolderId] = useState('root')
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: 'root', name: 'My Drive' }])
  const [files, setFiles] = useState<GoogleDriveFile[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [specialView, setSpecialView] = useState<SpecialView>(null)

  // ─────────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────────

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus()
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // Auth Functions
  // ─────────────────────────────────────────────────────────────────────────────

  const checkAuthStatus = async () => {
    setIsLoading(true)
    try {
      const connected = await api.storage.get<boolean>('connected')
      const email = await api.storage.get<string>('userEmail')
      const name = await api.storage.get<string>('userName')

      if (connected) {
        setIsAuthenticated(true)
        setUserInfo({ email: email || '', name: name || '' })
        await loadFiles('root')
      }
    } catch (err) {
      console.error('Error checking auth status:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignIn = async () => {
    setIsAuthenticating(true)
    try {
      await api.commands.executeCommand('google-drive.connect')
      // The connect command will update the storage, so we check status after a delay
      setTimeout(checkAuthStatus, 2000)
    } catch (err) {
      api.ui.showToast('Failed to connect to Google Drive', 'error')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await api.commands.executeCommand('google-drive.disconnect')
      setIsAuthenticated(false)
      setUserInfo(null)
      setFiles([])
    } catch (err) {
      api.ui.showToast('Failed to disconnect', 'error')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // File Loading
  // ─────────────────────────────────────────────────────────────────────────────

  const loadFiles = useCallback(async (folderId: string, special?: SpecialView) => {
    setIsLoading(true)
    setSpecialView(special || null)

    try {
      // Request files from server handler
      const response = await api.callOrgApi<{
        files: GoogleDriveFile[]
      }>(`/extensions/blueplm.google-drive/files?folderId=${folderId}&special=${special || ''}`)

      if (response.ok) {
        setFiles(response.data.files || [])
        setCurrentFolderId(folderId)

        // Update breadcrumbs
        if (!special) {
          if (folderId === 'root') {
            setBreadcrumbs([{ id: 'root', name: 'My Drive' }])
          }
        } else {
          const specialNames: Record<string, string> = {
            starred: 'Starred',
            recent: 'Recent',
            shared: 'Shared with me',
            trash: 'Trash'
          }
          setBreadcrumbs([{ id: special, name: specialNames[special] }])
        }
      }
    } catch (err) {
      console.error('Error loading files:', err)
      api.ui.showToast('Failed to load files', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [api])

  const handleRefresh = () => {
    loadFiles(currentFolderId, specialView)
  }

  const handleSync = async () => {
    await api.commands.executeCommand('google-drive.sync')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────────────────────

  const navigateToFolder = async (folderId: string, folderName: string) => {
    if (folderId === 'root') {
      setBreadcrumbs([{ id: 'root', name: 'My Drive' }])
    } else {
      const existingIndex = breadcrumbs.findIndex(b => b.id === folderId)
      if (existingIndex >= 0) {
        setBreadcrumbs(breadcrumbs.slice(0, existingIndex + 1))
      } else {
        setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }])
      }
    }
    setSpecialView(null)
    await loadFiles(folderId)
  }

  const handleFileClick = (file: GoogleDriveFile, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const newSelected = new Set(selectedFiles)
      if (newSelected.has(file.id)) {
        newSelected.delete(file.id)
      } else {
        newSelected.add(file.id)
      }
      setSelectedFiles(newSelected)
    } else if (file.mimeType === 'application/vnd.google-apps.folder') {
      navigateToFolder(file.id, file.name)
    } else {
      setSelectedFiles(new Set([file.id]))
    }
  }

  const handleFileDoubleClick = (file: GoogleDriveFile) => {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      navigateToFolder(file.id, file.name)
    } else if (file.webViewLink) {
      // Open in browser
      window.open(file.webViewLink, '_blank')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const getFileIcon = (mimeType: string, size = 24) => {
    const iconClass = 'flex-shrink-0'

    if (mimeType === 'application/vnd.google-apps.folder') {
      return <Folder size={size} className={`${iconClass} text-yellow-500`} />
    }
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      return <FileSpreadsheet size={size} className={`${iconClass} text-green-500`} />
    }
    if (mimeType === 'application/vnd.google-apps.document') {
      return <FileText size={size} className={`${iconClass} text-blue-500`} />
    }
    if (mimeType === 'application/vnd.google-apps.presentation') {
      return <Presentation size={size} className={`${iconClass} text-orange-500`} />
    }
    return <File size={size} className={`${iconClass} text-gray-400`} />
  }

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatFileSize = (bytes: string | undefined) => {
    if (!bytes) return '-'
    const size = parseInt(bytes)
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  // Filter files by search query
  const filteredFiles = files.filter(
    f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Loading
  // ─────────────────────────────────────────────────────────────────────────────

  if (isLoading && !isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-plm-bg p-8">
        <Loader2 size={32} className="animate-spin text-plm-accent mb-4" />
        <p className="text-sm text-plm-fg-muted">Loading Google Drive...</p>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Sign In
  // ─────────────────────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-plm-bg p-8">
        <div className="max-w-lg text-center">
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-500 via-green-500 to-yellow-500 rounded-2xl flex items-center justify-center shadow-xl">
            <HardDrive size={48} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-plm-fg mb-3">Connect to Google Drive</h2>
          <p className="text-plm-fg-muted mb-6">
            Access and manage your Google Drive files, spreadsheets, and documents directly from BluePLM.
          </p>

          <button
            onClick={handleSignIn}
            disabled={isAuthenticating}
            className="inline-flex items-center gap-3 px-6 py-3 bg-white text-gray-800 rounded-lg hover:bg-gray-100 transition-colors shadow-lg disabled:opacity-50 font-medium"
          >
            {isAuthenticating ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <LogIn size={20} />
            )}
            {isAuthenticating ? 'Connecting...' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: File Browser
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col bg-plm-bg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-plm-border bg-plm-sidebar">
        {/* Back button */}
        <button
          onClick={() => {
            if (breadcrumbs.length > 1) {
              const parent = breadcrumbs[breadcrumbs.length - 2]
              setBreadcrumbs(breadcrumbs.slice(0, -1))
              loadFiles(parent.id)
            }
          }}
          disabled={breadcrumbs.length <= 1 || isLoading}
          className="p-1.5 hover:bg-plm-highlight rounded transition-colors disabled:opacity-30"
          title="Go back"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 flex-1 min-w-0 text-sm">
          {breadcrumbs.map((crumb, idx) => (
            <div key={crumb.id} className="flex items-center">
              {idx > 0 && <ChevronRight size={14} className="text-plm-fg-muted mx-1" />}
              <button
                onClick={() => {
                  if (idx < breadcrumbs.length - 1) {
                    setBreadcrumbs(breadcrumbs.slice(0, idx + 1))
                    loadFiles(crumb.id)
                  }
                }}
                className={`hover:bg-plm-highlight px-1.5 py-0.5 rounded truncate max-w-[150px] ${
                  idx === breadcrumbs.length - 1 ? 'text-plm-fg font-medium' : 'text-plm-fg-muted'
                }`}
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-48 pl-8 pr-8 py-1.5 text-sm bg-plm-bg border border-plm-border rounded focus:outline-none focus:border-plm-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-plm-fg-muted hover:text-plm-fg"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center border border-plm-border rounded">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 ${viewMode === 'grid' ? 'bg-plm-highlight text-plm-accent' : 'text-plm-fg-muted hover:text-plm-fg'}`}
            title="Grid view"
          >
            <Grid size={16} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 ${viewMode === 'list' ? 'bg-plm-highlight text-plm-accent' : 'text-plm-fg-muted hover:text-plm-fg'}`}
            title="List view"
          >
            <List size={16} />
          </button>
        </div>

        {/* Actions */}
        <button
          onClick={handleSync}
          className="p-1.5 hover:bg-plm-highlight rounded transition-colors"
          title="Sync"
        >
          <RefreshCw size={18} />
        </button>

        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-1.5 hover:bg-plm-highlight rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {/* User info */}
        <div className="flex items-center gap-2 pl-2 border-l border-plm-border">
          <div className="w-7 h-7 rounded-full bg-plm-accent flex items-center justify-center text-white text-xs">
            {userInfo?.name?.[0] || 'U'}
          </div>
          <button
            onClick={handleSignOut}
            className="p-1.5 hover:bg-plm-highlight rounded transition-colors text-plm-fg-muted"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Quick access bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-plm-border bg-plm-sidebar/50 overflow-x-auto">
        <button
          onClick={() => { setSpecialView(null); loadFiles('root') }}
          className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-full transition-colors whitespace-nowrap ${
            !specialView && currentFolderId === 'root' ? 'bg-plm-accent text-white' : 'bg-plm-highlight hover:bg-plm-highlight/80 text-plm-fg'
          }`}
        >
          <Home size={14} />
          My Drive
        </button>

        <div className="w-px h-5 bg-plm-border mx-1" />

        <button
          onClick={() => loadFiles('root', 'starred')}
          className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-full transition-colors whitespace-nowrap ${
            specialView === 'starred' ? 'bg-plm-accent text-white' : 'bg-plm-highlight hover:bg-plm-highlight/80 text-plm-fg'
          }`}
        >
          <Star size={14} />
          Starred
        </button>
        <button
          onClick={() => loadFiles('root', 'recent')}
          className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-full transition-colors whitespace-nowrap ${
            specialView === 'recent' ? 'bg-plm-accent text-white' : 'bg-plm-highlight hover:bg-plm-highlight/80 text-plm-fg'
          }`}
        >
          <Clock size={14} />
          Recent
        </button>
        <button
          onClick={() => loadFiles('root', 'shared')}
          className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-full transition-colors whitespace-nowrap ${
            specialView === 'shared' ? 'bg-plm-accent text-white' : 'bg-plm-highlight hover:bg-plm-highlight/80 text-plm-fg'
          }`}
        >
          <Users size={14} />
          Shared with me
        </button>
        <button
          onClick={() => loadFiles('root', 'trash')}
          className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-full transition-colors whitespace-nowrap ${
            specialView === 'trash' ? 'bg-plm-accent text-white' : 'bg-plm-highlight hover:bg-plm-highlight/80 text-plm-fg'
          }`}
        >
          <Trash2 size={14} />
          Trash
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={32} className="animate-spin text-plm-accent" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-plm-fg-muted">
            <Folder size={64} className="mb-4 opacity-30" />
            <p className="text-lg">{searchQuery ? 'No files match your search' : 'This folder is empty'}</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
            {filteredFiles.map(file => (
              <div
                key={file.id}
                onClick={(e) => handleFileClick(file, e)}
                onDoubleClick={() => handleFileDoubleClick(file)}
                className={`group relative flex flex-col items-center p-4 rounded-lg border transition-all cursor-pointer ${
                  selectedFiles.has(file.id)
                    ? 'border-plm-accent bg-plm-accent/10'
                    : 'border-transparent hover:border-plm-border hover:bg-plm-highlight'
                }`}
              >
                {file.starred && (
                  <Star size={12} className="absolute top-2 right-2 text-yellow-500 fill-yellow-500" />
                )}

                <div className="w-16 h-16 flex items-center justify-center mb-2">
                  {getFileIcon(file.mimeType, 48)}
                </div>

                <span className="text-sm text-center truncate w-full" title={file.name}>
                  {file.name}
                </span>

                {file.shared && (
                  <Users size={12} className="absolute bottom-2 right-2 text-plm-fg-muted" />
                )}
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="border border-plm-border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 px-4 py-2 bg-plm-sidebar border-b border-plm-border text-xs font-medium text-plm-fg-muted">
              <div className="flex-1 min-w-0">Name</div>
              <div className="w-24">Owner</div>
              <div className="w-28">Modified</div>
              <div className="w-20 text-right">Size</div>
            </div>

            {/* Rows */}
            {filteredFiles.map(file => (
              <div
                key={file.id}
                onClick={(e) => handleFileClick(file, e)}
                onDoubleClick={() => handleFileDoubleClick(file)}
                className={`flex items-center gap-4 px-4 py-2 border-b border-plm-border last:border-b-0 transition-colors cursor-pointer ${
                  selectedFiles.has(file.id)
                    ? 'bg-plm-accent/10'
                    : 'hover:bg-plm-highlight'
                }`}
              >
                {/* Name */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {getFileIcon(file.mimeType, 20)}
                  <span className="text-sm truncate" title={file.name}>{file.name}</span>
                  {file.starred && <Star size={12} className="text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                  {file.shared && <Users size={12} className="text-plm-fg-muted flex-shrink-0" />}
                </div>

                {/* Owner */}
                <div className="w-24 text-xs text-plm-fg-muted truncate">
                  {file.owners?.[0]?.displayName || '-'}
                </div>

                {/* Modified */}
                <div className="w-28 text-xs text-plm-fg-muted">
                  {formatDate(file.modifiedTime)}
                </div>

                {/* Size */}
                <div className="w-20 text-xs text-plm-fg-muted text-right">
                  {file.mimeType === 'application/vnd.google-apps.folder' ? '-' : formatFileSize(file.size)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default GoogleDrivePanel
