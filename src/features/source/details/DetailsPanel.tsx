import { useState, useEffect, useCallback, useMemo } from 'react'
import { log } from '@/lib/logger'
import { usePDMStore, LocalFile, DetailsPanelTab } from '@/stores/pdmStore'
import { thumbnailCache } from '@/lib/thumbnailCache'
import { getFileIconType } from '@/lib/utils'
import { formatFileSize } from '@/lib/utils'
import { DraggableTab, TabDropZone, PanelLocation } from '@/components/shared/DraggableTab'
import { format } from 'date-fns'
import { getNextSerialNumber } from '@/lib/serialization'
import { ContainsTab, WhereUsedTab, SWPropertiesTab } from '@/features/integrations/solidworks'
import { SWDatacardPanel } from '@/features/integrations/solidworks'
import { VendorsTab } from './VendorsTab'
import { PdfAnnotationViewer } from './components/PdfAnnotationViewer'
import type { AnnotationOverlay } from './components/PdfAnnotationViewer'
import { CommentSidebar } from './components/CommentSidebar'
import { 
  FileBox, 
  Layers, 
  FileText, 
  File,
  Clock,
  User,
  Tag,
  Hash,
  Info,
  Cloud,
  Loader2,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  FileCode,
  Cpu,
  FileType,
  FilePen,
  ExternalLink,
  Download,
  Eye,
  FolderOpen,
  Pencil,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sparkles
} from 'lucide-react'

// Component to load OS icon for files
function DetailsPanelIcon({ file, size = 32 }: { file: LocalFile; size?: number }) {
  const [icon, setIcon] = useState<string | null>(null)
  
  useEffect(() => {
    if (file.isDirectory || !file.path) {
      setIcon(null)
      return
    }
    
    let cancelled = false
    
    const loadIcon = async () => {
      try {
        // Use global thumbnail cache to avoid repeated IPC calls
        const data = await thumbnailCache.get(file.path)
        if (!cancelled && data) {
          setIcon(data)
        }
      } catch {
        // Silently fail
      }
    }
    
    loadIcon()
    return () => { cancelled = true }
  }, [file.path, file.isDirectory])
  
  if (icon) {
    return (
      <img 
        src={icon} 
        alt=""
        className="flex-shrink-0 rounded"
        style={{ width: size, height: size }}
        onError={() => setIcon(null)}
      />
    )
  }
  
  // Fallback to React icons
  const iconType = getFileIconType(file.extension)
  switch (iconType) {
    case 'part':
      return <FileBox size={size} className="text-plm-accent" />
    case 'assembly':
      return <Layers size={size} className="text-amber-400" />
    case 'drawing':
      return <FilePen size={size} className="text-sky-300" />
    case 'step':
      return <FileBox size={size} className="text-orange-400" />
    case 'pdf':
      return <FileType size={size} className="text-red-400" />
    case 'image':
      return <FileImage size={size} className="text-purple-400" />
    case 'spreadsheet':
      return <FileSpreadsheet size={size} className="text-green-400" />
    case 'archive':
      return <FileArchive size={size} className="text-yellow-500" />
    case 'schematic':
      return <Cpu size={size} className="text-red-400" />
    case 'library':
      return <Cpu size={size} className="text-violet-400" />
    case 'pcb':
      return <Cpu size={size} className="text-emerald-400" />
    case 'code':
      return <FileCode size={size} className="text-sky-400" />
    case 'text':
      return <FileText size={size} className="text-plm-fg-muted" />
    default:
      return <File size={size} className="text-plm-fg-muted" />
  }
}

export function DetailsPanel() {
  const { 
    selectedFiles, 
    getSelectedFileObjects, 
    detailsPanelHeight,
    detailsPanelTab,
    setDetailsPanelTab,
    rightPanelTabs,
    moveTabToRight,
    moveTabToBottom,
    reorderTabsInPanel,
    bottomPanelTabOrder,
    user,
    addToast,
    cadPreviewMode,
    lowercaseExtensions,
    files,
    organization,
    updatePendingMetadata
  } = usePDMStore()

  const selectedFileObjects = getSelectedFileObjects()
  const file = selectedFileObjects.length === 1 ? selectedFileObjects[0] : null
  const isFolder = file?.isDirectory || false
  
  // Editable property state
  const [editingField, setEditingField] = useState<'itemNumber' | 'description' | 'revision' | 'state' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isSavingEdit] = useState(false)
  const [isGeneratingSerial, setIsGeneratingSerial] = useState(false)
  
  // Folder-specific state
  const [folderStats, setFolderStats] = useState<{ size: number; fileCount: number; folderCount: number } | null>(null)
  
  // eDrawings state
  const [eDrawingsStatus, setEDrawingsStatus] = useState<{
    checked: boolean
    installed: boolean
    path: string | null
  }>({ checked: false, installed: false, path: null })
  
  // CAD thumbnail preview state
  const [cadThumbnail, setCadThumbnail] = useState<string | null>(null)
  const [cadThumbnailLoading, setCadThumbnailLoading] = useState(false)
  const [cadZoom, setCadZoom] = useState(100) // Zoom percentage (100 = fit to pane)
  
  // Handle tab drop from either panel
  const handleTabDrop = useCallback((tabId: string, fromLocation: PanelLocation, toLocation: PanelLocation) => {
    if (fromLocation === toLocation) return // No change needed
    
    if (toLocation === 'bottom' && fromLocation === 'right') {
      // Moving from right panel to bottom
      moveTabToBottom(tabId as DetailsPanelTab)
    } else if (toLocation === 'right' && fromLocation === 'bottom') {
      // Moving from bottom panel to right  
      moveTabToRight(tabId as DetailsPanelTab)
    }
  }, [moveTabToBottom, moveTabToRight])
  
  // Reset zoom when file changes
  useEffect(() => {
    setCadZoom(100)
  }, [file?.path])

  // Check if eDrawings is installed (once on mount)
  useEffect(() => {
    const checkEDrawings = async () => {
      if (!window.electronAPI?.checkEDrawingsInstalled) {
        setEDrawingsStatus({ checked: true, installed: false, path: null })
        return
      }
      
      try {
        const result = await window.electronAPI.checkEDrawingsInstalled()
        setEDrawingsStatus({
          checked: true,
          installed: result.installed,
          path: result.path
        })
      } catch (err) {
        log.error('[DetailsPanel]', 'Failed to check eDrawings', { error: err })
        setEDrawingsStatus({ checked: true, installed: false, path: null })
      }
    }
    
    checkEDrawings()
  }, [])
  
  // NOTE: PDF loading is now handled internally by PdfAnnotationViewer.
  // The old useEffect that created a data URL for the iframe has been removed.

  // Load CAD preview when file changes (only if in thumbnail mode)
  // Priority: 1) OLE preview extraction, 2) DM API preview, 3) OS thumbnail
  useEffect(() => {
    const loadPreview = async () => {
      const ext = file?.extension?.toLowerCase() || ''
      const isSolidWorks = ['.sldprt', '.sldasm', '.slddrw'].includes(ext)
      
      // Don't load preview if we're in eDrawings mode
      if (cadPreviewMode === 'edrawings' || !isSolidWorks || detailsPanelTab !== 'preview' || !file?.path) {
        setCadThumbnail(null)
        return
      }
      
      setCadThumbnailLoading(true)
      try {
        // First, try direct OLE preview extraction (most reliable, high quality)
        const oleResult = await window.electronAPI?.extractSolidWorksPreview?.(file.path)
        if (oleResult?.success && oleResult.data) {
          log.debug('[Preview]', 'Using OLE-extracted preview')
          setCadThumbnail(oleResult.data)
          setCadThumbnailLoading(false)
          return
        }
        
        // Second, try SolidWorks Document Manager API
        const previewResult = await window.electronAPI?.solidworks?.getPreview(file.path)
        if (previewResult?.success && previewResult.data?.imageData) {
          const mimeType = previewResult.data.mimeType || 'image/png'
          log.debug('[Preview]', 'Using DM API preview')
          setCadThumbnail(`data:${mimeType};base64,${previewResult.data.imageData}`)
          setCadThumbnailLoading(false)
          return
        }
        
        // Fall back to OS thumbnail extraction (uses cache)
        const thumbData = await thumbnailCache.get(file.path)
        if (thumbData) {
          log.debug('[Preview]', 'Using OS thumbnail fallback')
          setCadThumbnail(thumbData)
        } else {
          setCadThumbnail(null)
        }
      } catch (err) {
        log.error('[Preview]', 'Failed to extract preview', { error: err })
        setCadThumbnail(null)
      } finally {
        setCadThumbnailLoading(false)
      }
    }
    
    loadPreview()
  }, [file?.path, file?.extension, detailsPanelTab, cadPreviewMode])

  // Calculate folder stats when a folder is selected
  useEffect(() => {
    if (!file || !isFolder) {
      setFolderStats(null)
      return
    }
    
    const folderPath = file.relativePath
    const filesInFolder = files.filter(f => 
      !f.isDirectory && f.relativePath.startsWith(folderPath + '/')
    )
    const foldersInFolder = files.filter(f => 
      f.isDirectory && f.relativePath.startsWith(folderPath + '/') && f.relativePath !== folderPath
    )
    
    let totalSize = 0
    for (const f of filesInFolder) {
      totalSize += f.size || 0
    }
    
    setFolderStats({
      size: totalSize,
      fileCount: filesInFolder.length,
      folderCount: foldersInFolder.length
    })
  }, [file, isFolder, files])

  // Check if file is editable
  // - Unsynced files (no pdmData.id): always editable (local-only files)
  // - Synced files (has pdmData.id): must be checked out by current user
  const isFileEditable = file && (!file.pdmData?.id || file.pdmData?.checked_out_by === user?.id)

  // Org-wide: parts/assemblies file-level revision lockout
  const fileExt = file?.extension?.toLowerCase()
  const isModelFile = fileExt === '.sldprt' || fileExt === '.sldasm'
  const allowModelRevision = organization?.settings?.allow_file_level_revision_for_models
  const isRevisionEditable = !!isFileEditable && !(isModelFile && !allowModelRevision)

  // Handle starting edit of a property field
  const handleStartEdit = (field: 'itemNumber' | 'description' | 'revision' | 'state') => {
    if (!file) return
    
    // For synced files, require checkout (except state changes)
    if (file.pdmData?.id && file.pdmData.checked_out_by !== user?.id) {
      addToast('info', 'Check out file to edit metadata')
      return
    }
    // Unsynced files (no pdmData.id) are always editable - allows setting metadata before first sync
    
    // Get the current value (check pendingMetadata first, then pdmData)
    let currentValue = ''
    switch (field) {
      case 'itemNumber':
        currentValue = file.pendingMetadata?.part_number ?? file.pdmData?.part_number ?? ''
        break
      case 'description':
        currentValue = file.pendingMetadata?.description ?? file.pdmData?.description ?? ''
        break
      case 'revision':
        currentValue = file.pendingMetadata?.revision ?? file.pdmData?.revision ?? ''
        break
    }
    
    setEditingField(field)
    setEditValue(currentValue)
  }
  
  // Save metadata to SolidWorks file
  // Writes to BOTH file-level AND default configuration so PRP references in drawings work
  // Uses live SW API if file is open (keeps file open), otherwise Document Manager (faster)
  const saveMetadataToSWFile = useCallback(async (targetFile: LocalFile, updates: { part_number?: string | null; description?: string | null; revision?: string }) => {
    const ext = targetFile.extension?.toLowerCase() || ''
    if (!['.sldprt', '.sldasm', '.slddrw'].includes(ext)) return
    
    try {
      const props: Record<string, string> = {}
      
      // Get final values (pending or existing)
      const partNumber = updates.part_number ?? targetFile.pendingMetadata?.part_number ?? targetFile.pdmData?.part_number ?? ''
      const description = updates.description ?? targetFile.pendingMetadata?.description ?? targetFile.pdmData?.description ?? ''
      const revision = updates.revision ?? targetFile.pendingMetadata?.revision ?? targetFile.pdmData?.revision ?? ''
      
      if (partNumber) props['Number'] = partNumber
      if (description) props['Description'] = description
      if (revision) props['Revision'] = revision
      
      if (Object.keys(props).length === 0) return
      
      // Check if file is open in SolidWorks
      const isOpenResult = await window.electronAPI?.solidworks?.isDocumentOpen?.(targetFile.path)
      const isOpenInSW = isOpenResult?.success && isOpenResult.data?.isOpen
      
      let result: { success: boolean; error?: string } | undefined
      
      if (isOpenInSW) {
        // Use live SolidWorks API - keeps file open in SW
        result = await window.electronAPI?.solidworks?.setDocumentProperties?.(targetFile.path, props)
        
        // Also write to config-level if needed (for PRP in drawings)
        if (result?.success && ext !== '.slddrw') {
          const propsResult = await window.electronAPI?.solidworks?.getProperties?.(targetFile.path)
          if (propsResult?.success && propsResult.data) {
            const data = propsResult.data as {
              configurationProperties?: Record<string, Record<string, string>>
              configurations?: string[]
            }
            const configProps = data.configurationProperties
            const configs = data.configurations || []
            const activeConfig = configs.find(c => c.toLowerCase() === 'default') 
              || configs.find(c => c.toLowerCase() === 'standard')
              || configs[0]
            
            if (activeConfig && configProps) {
              const existingConfigProps = configProps[activeConfig] || {}
              const missingProps: Record<string, string> = {}
              for (const [key, value] of Object.entries(props)) {
                if (!existingConfigProps[key] || existingConfigProps[key].trim() === '' || existingConfigProps[key].startsWith('$')) {
                  missingProps[key] = value
                }
              }
              if (Object.keys(missingProps).length > 0) {
                await window.electronAPI?.solidworks?.setDocumentProperties?.(targetFile.path, missingProps, activeConfig)
              }
            }
          }
        }
      } else {
        // Use Document Manager (faster, but requires file not open)
        result = await window.electronAPI?.solidworks?.setProperties(targetFile.path, props)
        
        // ALSO write to default configuration for PRP resolution in drawings
        if (result?.success && ext !== '.slddrw') {
          const propsResult = await window.electronAPI?.solidworks?.getProperties?.(targetFile.path)
          if (propsResult?.success && propsResult.data) {
            const data = propsResult.data as {
              configurationProperties?: Record<string, Record<string, string>>
              configurations?: string[]
            }
            const configProps = data.configurationProperties
            const configs = data.configurations || []
            const activeConfig = configs.find(c => c.toLowerCase() === 'default') 
              || configs.find(c => c.toLowerCase() === 'standard')
              || configs[0]
            
            if (activeConfig && configProps) {
              const existingConfigProps = configProps[activeConfig] || {}
              const missingProps: Record<string, string> = {}
              for (const [key, value] of Object.entries(props)) {
                if (!existingConfigProps[key] || existingConfigProps[key].trim() === '' || existingConfigProps[key].startsWith('$')) {
                  missingProps[key] = value
                }
              }
              if (Object.keys(missingProps).length > 0) {
                await window.electronAPI?.solidworks?.setProperties(targetFile.path, missingProps, activeConfig)
              }
            }
          }
        }
      }
      
      if (result?.success) {
        addToast('success', 'Saved metadata to file')
        // Mark as recently modified to protect from LoadFiles overwrite
        if (targetFile.pdmData?.id) {
          usePDMStore.getState().markFileAsRecentlyModified(targetFile.pdmData.id)
        }
        // NOTE: We do NOT clear pendingMetadata here - it must persist until check-in
        // so the server gets updated with the new values.
        // Invalidate localHash since file content changed
        usePDMStore.getState().updateFileInStore(targetFile.path, { localHash: undefined })
      } else {
        addToast('error', 'Failed to save metadata to file')
      }
    } catch (err) {
      addToast('error', `Failed to save: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [addToast])

  // Handle saving an edited property
  const handleSaveEdit = async () => {
    if (!editingField || !file || !user) {
      setEditingField(null)
      setEditValue('')
      return
    }
    // Allow saving for both synced and unsynced files
    // Unsynced files store metadata in pendingMetadata which gets synced on first upload
    
    const trimmedValue = editValue.trim()
    
    // Get current value to check if changed (consider pending metadata too)
    let currentValue = ''
    switch (editingField) {
      case 'itemNumber':
        currentValue = file.pendingMetadata?.part_number !== undefined 
          ? (file.pendingMetadata.part_number || '') 
          : (file.pdmData?.part_number || '')
        break
      case 'description':
        currentValue = file.pendingMetadata?.description !== undefined 
          ? (file.pendingMetadata.description || '') 
          : (file.pdmData?.description || '')
        break
      case 'revision':
        currentValue = file.pendingMetadata?.revision !== undefined 
          ? file.pendingMetadata.revision 
          : (file.pdmData?.revision || '')
        break
    }
    
    if (trimmedValue === currentValue) {
      setEditingField(null)
      setEditValue('')
      return
    }
    
    // For item number, description, revision - save locally only (syncs on check-in)
    const pendingUpdates: { part_number?: string | null; description?: string | null; revision?: string } = {}
    switch (editingField) {
      case 'itemNumber':
        pendingUpdates.part_number = trimmedValue || null
        break
      case 'description':
        pendingUpdates.description = trimmedValue || null
        break
      case 'revision':
        pendingUpdates.revision = trimmedValue.toUpperCase()
        break
    }
    
    // Update pending metadata in store
    updatePendingMetadata(file.path, pendingUpdates)
    
    // Clear edit state first so UI is responsive  
    setEditingField(null)
    setEditValue('')
    
    // Auto-save to SolidWorks file
    await saveMetadataToSWFile(file, pendingUpdates)
  }
  
  // Handle generating a serial number for item number - auto-saves immediately
  // Works for both synced files (checked out) and unsynced local files
  const handleGenerateSerial = async () => {
    if (!organization?.id) {
      addToast('error', 'No organization connected')
      return
    }
    
    if (!file) return
    
    // No longer require file to be synced - BR numbers can be generated for local files
    // The org counter increments atomically, so there won't be conflicts when multiple users
    // generate numbers for their local files before syncing
    
    try {
      // Generate the serial number first (no spinner yet - this is fast)
      const serial = await getNextSerialNumber(organization.id)
      if (!serial) {
        addToast('error', 'Serialization is disabled or failed')
        return
      }
      
      // Show the generated number immediately in the input
      setEditValue(serial)
      
      // Update pending metadata
      const pendingUpdates = { part_number: serial }
      updatePendingMetadata(file.path, pendingUpdates)
      
      // Now start the save operation (this is what takes time)
      setIsGeneratingSerial(true)
      
      // Auto-save to SolidWorks file
      await saveMetadataToSWFile(file, pendingUpdates)
      
      // Exit edit mode after successful save
      setEditingField(null)
      setEditValue('')
    } catch (err) {
      addToast('error', `Failed to generate serial: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsGeneratingSerial(false)
    }
  }
  
  // Handle canceling an edit
  const handleCancelEdit = () => {
    setEditingField(null)
    setEditValue('')
  }

  const getFileIcon = () => {
    if (!file) return <File size={32} className="text-plm-fg-muted" />
    
    // Keep React icons for folders
    if (file.isDirectory) {
      return <FolderOpen size={32} className="text-plm-warning" />
    }
    
    // Use OS icons for files
    return <DetailsPanelIcon file={file} size={32} />
  }

  // Check if file is SolidWorks
  const isSolidWorksFile = file && ['.sldprt', '.sldasm', '.slddrw'].includes(file.extension?.toLowerCase() || '')

  // For SolidWorks files, use Preview tab (metadata is edited inline in the file tree)
  const allTabs = isSolidWorksFile && !isFolder ? [
    { id: 'preview', label: 'Preview' },
    { id: 'whereused', label: 'Where Used' },
    { id: 'contains', label: 'Contains' },
    { id: 'vendors', label: 'Vendors' },
  ] as const : [
    { id: 'preview', label: 'Preview' },
    { id: 'properties', label: 'Properties' },
    { id: 'whereused', label: 'Where Used' },
    { id: 'contains', label: 'Contains' },
    { id: 'vendors', label: 'Vendors' },
  ] as const
  
  // Filter out tabs that are in the right panel, then sort by custom order
  const filteredTabs = allTabs.filter(tab => !rightPanelTabs.includes(tab.id))
  const tabs = bottomPanelTabOrder.length > 0
    ? [...filteredTabs].sort((a, b) => {
        const aIndex = bottomPanelTabOrder.indexOf(a.id as DetailsPanelTab)
        const bIndex = bottomPanelTabOrder.indexOf(b.id as DetailsPanelTab)
        // Tabs not in custom order go to end, maintaining their relative order
        if (aIndex === -1 && bIndex === -1) return 0
        if (aIndex === -1) return 1
        if (bIndex === -1) return -1
        return aIndex - bIndex
      })
    : filteredTabs
  
  // Handle tab reorder within bottom panel
  const handleTabReorder = useCallback((tabId: string, newIndex: number) => {
    reorderTabsInPanel('bottom', tabId as DetailsPanelTab, newIndex)
  }, [reorderTabsInPanel])
  
  // Auto-switch to preview tab when selecting a SolidWorks file (properties tab not available for SW files)
  useEffect(() => {
    if (isSolidWorksFile && !isFolder && detailsPanelTab === 'properties') {
      setDetailsPanelTab('preview')
    }
  }, [isSolidWorksFile, isFolder, detailsPanelTab, setDetailsPanelTab])
  
  // Check file types for preview
  const ext = file?.extension?.toLowerCase() || ''
  const isCADFile = ['.sldprt', '.sldasm', '.slddrw', '.step', '.stp', '.stl', '.iges', '.igs'].includes(ext)
  const isImageFile = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'].includes(ext)
  const isPDFFile = ext === '.pdf'
  
  // Open file in eDrawings
  const handleOpenInEDrawings = async () => {
    if (!file?.path) return
    
    try {
      await window.electronAPI?.openInEDrawings(file.path)
    } catch (err) {
      log.error('[DetailsPanel]', 'Failed to open in eDrawings', { error: err })
      addToast('error', 'Failed to open in eDrawings')
    }
  }

  return (
    <div 
      className="details-panel bg-plm-panel border-t border-plm-border flex flex-col"
      style={{ height: detailsPanelHeight }}
    >
      {/* Tabs - Droppable zone */}
      <TabDropZone
        location="bottom"
        onDrop={handleTabDrop}
        className="tabs flex-shrink-0 relative min-h-[32px]"
        tabCount={tabs.length}
      >
        {tabs.map((tab, index) => (
          <DraggableTab
            key={tab.id}
            id={tab.id}
            label={tab.label}
            active={detailsPanelTab === tab.id}
            location="bottom"
            index={index}
            onClick={() => setDetailsPanelTab(tab.id)}
            onDoubleClick={() => moveTabToRight(tab.id)}
            onDragStart={() => {}}
            onDragEnd={() => {}}
            onReorder={handleTabReorder}
            tooltip="Drag to reorder or move to right panel"
          />
        ))}
      </TabDropZone>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {selectedFiles.length === 0 ? (
          <div className="text-sm text-plm-fg-muted text-center py-8">
            Select a file to view details
          </div>
        ) : selectedFiles.length > 1 ? (
          <div className="text-sm text-plm-fg-muted text-center py-8">
            {selectedFiles.length} files selected
          </div>
        ) : file && (
          <>
            {/* Preview tab for SolidWorks files */}
            {detailsPanelTab === 'preview' && isSolidWorksFile && !isFolder && (
              <SWDatacardPanel file={file} />
            )}

            {detailsPanelTab === 'properties' && (
              isSolidWorksFile && !isFolder ? (
                // SolidWorks files get the full SW Properties view with export options
                <SWPropertiesTab file={file} />
              ) : (
                // Standard properties view for non-SW files and folders
                <div className="flex gap-6">
                  {/* File/Folder icon and name */}
                  <div className="flex items-start gap-4 flex-shrink-0">
                    {getFileIcon()}
                    <div>
                      <div className="font-semibold text-lg">{file.name}</div>
                      <div className="text-sm text-plm-fg-muted">{file.relativePath}</div>
                      {!isFolder && file.pdmData?.workflow_state && (
                        <span 
                          className="px-2 py-0.5 rounded text-xs font-medium mt-2 inline-block"
                          style={{ 
                            backgroundColor: file.pdmData.workflow_state.color + '30',
                            color: file.pdmData.workflow_state.color
                          }}
                        >
                          {file.pdmData.workflow_state.label || file.pdmData.workflow_state.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Properties grid */}
                  <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    {isFolder ? (
                      // Folder properties
                      <>
                        <PropertyItem 
                          icon={<Info size={14} />}
                          label="Type"
                          value="Folder"
                        />
                        <PropertyItem 
                          icon={<Info size={14} />}
                          label="Size"
                          value={folderStats ? formatFileSize(folderStats.size) : 'Calculating...'}
                        />
                        <PropertyItem 
                          icon={<File size={14} />}
                          label="Files"
                          value={folderStats ? String(folderStats.fileCount) : '...'}
                        />
                        <PropertyItem 
                          icon={<FolderOpen size={14} />}
                          label="Folders"
                          value={folderStats ? String(folderStats.folderCount) : '...'}
                        />
                        <PropertyItem 
                          icon={<Clock size={14} />}
                          label="Modified"
                          value={file.modifiedTime ? (() => {
                            try {
                              const date = new Date(file.modifiedTime)
                              return isNaN(date.getTime()) ? '-' : format(date, 'MMM d, yyyy HH:mm')
                            } catch { return '-' }
                          })() : '-'}
                        />
                        <PropertyItem 
                          icon={<Cloud size={14} />}
                          label="Location"
                          value={file.relativePath.includes('/') 
                            ? file.relativePath.substring(0, file.relativePath.lastIndexOf('/'))
                            : '/'}
                        />
                      </>
                    ) : (
                      // File properties (non-SW files)
                      <>
                        <EditablePropertyItem 
                          icon={<Tag size={14} />}
                          label="Item Number"
                          value={file.pdmData?.part_number || '-'}
                          isEditing={editingField === 'itemNumber'}
                          editValue={editValue}
                          isSaving={isSavingEdit}
                          editable={!!isFileEditable}
                          onStartEdit={() => handleStartEdit('itemNumber')}
                          onSave={handleSaveEdit}
                          onCancel={handleCancelEdit}
                          onEditValueChange={setEditValue}
                          placeholder="-"
                          onGenerate={handleGenerateSerial}
                          isGenerating={isGeneratingSerial}
                        />
                        <EditablePropertyItem 
                          icon={<FileText size={14} />}
                          label="Description"
                          value={file.pdmData?.description || '-'}
                          isEditing={editingField === 'description'}
                          editValue={editValue}
                          isSaving={isSavingEdit}
                          editable={!!isFileEditable}
                          onStartEdit={() => handleStartEdit('description')}
                          onSave={handleSaveEdit}
                          onCancel={handleCancelEdit}
                          onEditValueChange={setEditValue}
                          placeholder="-"
                        />
                        <EditablePropertyItem 
                          icon={<Hash size={14} />}
                          label="Revision"
                          value={file.pdmData?.revision || '-'}
                          isEditing={editingField === 'revision'}
                          editValue={editValue}
                          isSaving={isSavingEdit}
                          editable={isRevisionEditable}
                          onStartEdit={() => handleStartEdit('revision')}
                          onSave={handleSaveEdit}
                          onCancel={handleCancelEdit}
                          onEditValueChange={setEditValue}
                          placeholder="-"
                          tooltip={isModelFile && !allowModelRevision ? 'Revision is controlled from drawings (org policy)' : undefined}
                        />
                        {/* State - display only, changes via workflow transitions */}
                        <div className="flex items-center gap-2">
                          <span className="text-plm-fg-muted"><RefreshCw size={14} /></span>
                          <span className="text-plm-fg-muted">State:</span>
                          {file.pdmData?.workflow_state ? (
                            <span 
                              className="px-2 py-0.5 rounded text-xs font-medium"
                              style={{ 
                                backgroundColor: file.pdmData.workflow_state.color + '30',
                                color: file.pdmData.workflow_state.color
                              }}
                              title={file.pdmData.workflow_state.is_editable ? 'Editable' : 'Locked'}
                            >
                              {file.pdmData.workflow_state.label || file.pdmData.workflow_state.name}
                            </span>
                          ) : (
                            <span className="text-plm-fg-muted">—</span>
                          )}
                        </div>
                        <PropertyItem 
                          icon={<Hash size={14} />}
                          label="Version"
                          value={String(file.pdmData?.version || 1)}
                        />
                        <PropertyItem 
                          icon={<Info size={14} />}
                          label="Type"
                          value={file.extension 
                            ? lowercaseExtensions !== false
                              ? file.extension.replace('.', '').toLowerCase() 
                              : file.extension.replace('.', '').toUpperCase() 
                            : 'File'}
                        />
                        <PropertyItem 
                          icon={<Clock size={14} />}
                          label="Modified"
                          value={file.modifiedTime ? (() => {
                            try {
                              const date = new Date(file.modifiedTime)
                              return isNaN(date.getTime()) ? '-' : format(date, 'MMM d, yyyy HH:mm')
                            } catch { return '-' }
                          })() : '-'}
                        />
                        <PropertyItem 
                          icon={<Info size={14} />}
                          label="Size"
                          value={formatFileSize(file.size)}
                        />
                        <PropertyItem 
                          icon={<User size={14} />}
                          label="Checked Out"
                          value={file.pdmData?.checked_out_by ? 
                            ((file.pdmData as any).checked_out_user?.full_name || 
                             (file.pdmData as any).checked_out_user?.email || 
                             'Someone') 
                            : 'Not checked out'}
                        />
                        <PropertyItem 
                          icon={<Cloud size={14} />}
                          label="Sync Status"
                          value={file.pdmData ? 'Synced' : (file.diffStatus === 'ignored' ? 'Local only (ignored)' : 'Local only')}
                        />
                      </>
                    )}
                  </div>
                </div>
              )
            )}

            {detailsPanelTab === 'preview' && !(isSolidWorksFile && !isFolder) && (
              <div className="flex flex-col items-center justify-center h-full py-4">
                {!file ? (
                  <div className="text-sm text-plm-fg-muted">Select a file to preview</div>
                ) : isPDFFile ? (
                  // PDF preview with annotation support + comment sidebar
                  <PdfWithComments file={file} />
                ) : isImageFile ? (
                  // Image preview
                  <div className="w-full h-full flex items-center justify-center overflow-hidden">
                    <img 
                      src={`file://${file.path}`} 
                      alt={file.name}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </div>
                ) : isCADFile ? (
                  // CAD file - show thumbnail or eDrawings based on setting
                  <div className="w-full h-full flex flex-col">
                    {cadPreviewMode === 'edrawings' ? (
                      // eDrawings mode - just show button to open externally
                      eDrawingsStatus.installed ? (
                        <div className="flex-1 flex flex-col items-center justify-center">
                          <FileBox size={48} className="mb-4 text-plm-accent" />
                          <div className="text-sm font-medium mb-2">{file.name}</div>
                          <button
                            onClick={handleOpenInEDrawings}
                            className="btn btn-primary gap-2"
                          >
                            <ExternalLink size={16} />
                            Open in eDrawings
                          </button>
                          <div className="text-xs text-plm-fg-muted mt-4">
                            Using external viewer (change in Settings → Preferences)
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                          <Eye size={48} className="mb-4 text-plm-fg-muted opacity-50" />
                          <div className="text-lg font-medium mb-2">eDrawings Not Found</div>
                          <div className="text-sm text-plm-fg-muted mb-4 max-w-xs">
                            Install the free eDrawings viewer to preview SolidWorks files.
                          </div>
                          <a
                            href="https://www.solidworks.com/support/free-downloads"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary gap-2"
                            onClick={(e) => {
                              e.preventDefault()
                              window.electronAPI?.openFile('https://www.solidworks.com/support/free-downloads')
                            }}
                          >
                            <Download size={16} />
                            Download eDrawings (Free)
                          </a>
                        </div>
                      )
                    ) : cadThumbnailLoading ? (
                      <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="animate-spin text-plm-accent" size={32} />
                      </div>
                    ) : cadThumbnail ? (
                      // Show extracted thumbnail with zoom controls
                      <div className="flex-1 flex flex-col min-h-0">
                        <div 
                          className="flex-1 flex items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900 rounded overflow-auto relative"
                          style={{ minHeight: 0 }}
                          onWheel={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              e.preventDefault()
                              const delta = e.deltaY > 0 ? -10 : 10
                              setCadZoom(prev => Math.max(25, Math.min(400, prev + delta)))
                            }
                          }}
                        >
                          <img 
                            src={cadThumbnail} 
                            alt={file.name}
                            className="object-contain transition-transform duration-150"
                            style={{ 
                              width: cadZoom === 100 ? '100%' : 'auto',
                              height: cadZoom === 100 ? '100%' : 'auto',
                              maxWidth: cadZoom === 100 ? '100%' : 'none',
                              maxHeight: cadZoom === 100 ? '100%' : 'none',
                              transform: cadZoom !== 100 ? `scale(${cadZoom / 100})` : undefined,
                              transformOrigin: 'center center'
                            }}
                          />
                        </div>
                        {/* Zoom controls */}
                        <div className="flex items-center justify-center gap-2 py-2 border-t border-plm-border">
                          <button
                            onClick={() => setCadZoom(prev => Math.max(25, prev - 25))}
                            className="btn btn-sm btn-ghost p-1"
                            title="Zoom out"
                            disabled={cadZoom <= 25}
                          >
                            <ZoomOut size={16} />
                          </button>
                          <span className="text-xs text-plm-fg-muted w-12 text-center">{cadZoom}%</span>
                          <button
                            onClick={() => setCadZoom(prev => Math.min(400, prev + 25))}
                            className="btn btn-sm btn-ghost p-1"
                            title="Zoom in"
                            disabled={cadZoom >= 400}
                          >
                            <ZoomIn size={16} />
                          </button>
                          <button
                            onClick={() => setCadZoom(100)}
                            className="btn btn-sm btn-ghost p-1 ml-2"
                            title="Reset to fit"
                            disabled={cadZoom === 100}
                          >
                            <RotateCw size={14} />
                          </button>
                          {eDrawingsStatus.installed && (
                            <button
                              onClick={handleOpenInEDrawings}
                              className="btn btn-sm btn-secondary gap-1 ml-2"
                              title="Open in full eDrawings for 3D interaction"
                            >
                              <ExternalLink size={12} />
                              eDrawings
                            </button>
                          )}
                        </div>
                      </div>
                    ) : eDrawingsStatus.installed ? (
                      // No thumbnail but eDrawings available
                      <div className="flex-1 flex flex-col items-center justify-center">
                        <FileBox size={48} className="mb-4 text-plm-accent" />
                        <div className="text-sm font-medium mb-2">{file.name}</div>
                        <div className="text-xs text-plm-fg-muted mb-4">No embedded preview available</div>
                        <button
                          onClick={handleOpenInEDrawings}
                          className="btn btn-primary gap-2"
                        >
                          <ExternalLink size={16} />
                          Open in eDrawings
                        </button>
                      </div>
                    ) : (
                      // No thumbnail, no eDrawings
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <Eye size={48} className="mb-4 text-plm-fg-muted opacity-50" />
                        <div className="text-lg font-medium mb-2">No Preview Available</div>
                        <div className="text-sm text-plm-fg-muted mb-4 max-w-xs">
                          Install the free eDrawings viewer to preview SolidWorks files.
                        </div>
                        <a
                          href="https://www.solidworks.com/support/free-downloads"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary gap-2"
                          onClick={(e) => {
                            e.preventDefault()
                            window.electronAPI?.openFile('https://www.solidworks.com/support/free-downloads')
                          }}
                        >
                          <Download size={16} />
                          Download eDrawings (Free)
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  // Other files - no preview
                  <div className="text-sm text-plm-fg-muted text-center">
                    <Eye size={48} className="mx-auto mb-4 opacity-30" />
                    <div>No preview available</div>
                    <div className="text-xs mt-2 opacity-70">
                      {file.extension 
                        ? lowercaseExtensions !== false
                          ? file.extension.toLowerCase() 
                          : file.extension.toUpperCase()
                        : 'Unknown'} files cannot be previewed
                    </div>
                    <button
                      onClick={() => window.electronAPI?.openFile(file.path)}
                      className="btn btn-secondary gap-2 mt-4"
                    >
                      <ExternalLink size={14} />
                      Open with Default App
                    </button>
                  </div>
                )}
              </div>
            )}

            {detailsPanelTab === 'whereused' && (
              <WhereUsedTab file={file} />
            )}

            {detailsPanelTab === 'contains' && (
              <ContainsTab file={file} />
            )}

            {detailsPanelTab === 'vendors' && (
              <VendorsTab file={file} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// PdfWithComments - PDF viewer + comment sidebar layout
// ============================================================================

/**
 * Renders PdfAnnotationViewer (~70%) alongside CommentSidebar (~30%).
 * Wires annotation creation events to the store so CommentSidebar can
 * display the input and persist the comment.
 */
function PdfWithComments({ file }: { file: LocalFile }) {
  const annotations = usePDMStore((s) => s.annotations)
  const setActiveAnnotationId = usePDMStore((s) => s.setActiveAnnotationId)
  const setShowCommentInput = usePDMStore((s) => s.setShowCommentInput)
  const setPendingAnnotation = usePDMStore((s) => s.setPendingAnnotation)
  const clearAnnotations = usePDMStore((s) => s.clearAnnotations)

  const fileId = file.pdmData?.id

  // Clear annotations when the file changes
  useEffect(() => {
    return () => {
      clearAnnotations()
    }
  }, [file.path, clearAnnotations])

  // Map store annotations to AnnotationOverlay[] for the PDF viewer
  const overlays = useMemo<AnnotationOverlay[]>(() => {
    const result: AnnotationOverlay[] = []
    for (const ann of annotations) {
      if (ann.position && ann.page_number != null) {
        result.push({
          id: ann.id,
          pageNumber: ann.page_number,
          position: ann.position,
          resolved: ann.resolved,
        })
      }
      // Also include reply-level annotations that have positions (unlikely but safe)
      for (const reply of ann.replies ?? []) {
        if (reply.position && reply.page_number != null) {
          result.push({
            id: reply.id,
            pageNumber: reply.page_number,
            position: reply.position,
            resolved: reply.resolved,
          })
        }
      }
    }
    return result
  }, [annotations])

  // When user selects an area on the PDF, open the comment input
  const handleAnnotationCreate = useCallback(
    (data: import('./components/PdfAnnotationViewer').NewAnnotationData) => {
      setPendingAnnotation(data)
      setShowCommentInput(true)
    },
    [setPendingAnnotation, setShowCommentInput],
  )

  // When user clicks an existing annotation overlay, highlight it in the sidebar
  const handleAnnotationClick = useCallback(
    (annotationId: string) => {
      setActiveAnnotationId(annotationId)
    },
    [setActiveAnnotationId],
  )

  return (
    <div className="w-full h-full flex">
      {/* PDF Viewer - takes ~70% width (or 100% if no file ID for commenting) */}
      <div className={fileId ? 'flex-[7] min-w-0' : 'w-full'}>
        <PdfAnnotationViewer
          filePath={file.path}
          fileName={file.name}
          fileVersion={file.pdmData?.version}
          annotations={overlays}
          onAnnotationCreate={fileId ? handleAnnotationCreate : undefined}
          onAnnotationClick={fileId ? handleAnnotationClick : undefined}
        />
      </div>

      {/* Comment Sidebar - ~30% width, only shown when file has a database ID */}
      {fileId && (
        <div className="flex-[3] min-w-[220px] max-w-[400px]">
          <CommentSidebar
            fileId={fileId}
            fileName={file.name}
            fileVersion={file.pdmData?.version}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Property display components
// ============================================================================

interface PropertyItemProps {
  icon: React.ReactNode
  label: string
  value: string
}

function PropertyItem({ icon, label, value }: PropertyItemProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-plm-fg-muted">{icon}</span>
      <span className="text-plm-fg-muted">{label}:</span>
      <span className="text-plm-fg">{value}</span>
    </div>
  )
}

interface EditablePropertyItemProps {
  icon: React.ReactNode
  label: string
  value: string
  isEditing: boolean
  editValue: string
  isSaving: boolean
  editable: boolean
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
  onEditValueChange: (value: string) => void
  placeholder?: string
  onGenerate?: () => void
  isGenerating?: boolean
  /** Override tooltip when not editable (e.g. org policy lockout) */
  tooltip?: string
}

function EditablePropertyItem({ 
  icon, 
  label, 
  value, 
  isEditing, 
  editValue, 
  isSaving,
  editable,
  onStartEdit, 
  onSave, 
  onCancel, 
  onEditValueChange,
  placeholder = '-',
  onGenerate,
  isGenerating,
  tooltip
}: EditablePropertyItemProps) {
  if (isEditing && editable) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-plm-fg-muted">{icon}</span>
        <span className="text-plm-fg-muted">{label}:</span>
        <div className="relative flex-1">
          <input
            type="text"
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSave()
              } else if (e.key === 'Escape') {
                onCancel()
              }
            }}
            onBlur={(e) => {
              // Don't save on blur if clicking the generate button
              const relatedTarget = e.relatedTarget as HTMLElement | null
              if (relatedTarget?.dataset?.generateBtn) return
              onSave()
            }}
            autoFocus
            disabled={isSaving || isGenerating}
            className="w-full bg-plm-bg border border-plm-accent rounded pl-2 pr-7 py-0.5 text-sm text-plm-fg focus:outline-none focus:ring-1 focus:ring-plm-accent disabled:opacity-50"
          />
          {onGenerate && (
            <button
              data-generate-btn="true"
              onClick={onGenerate}
              disabled={isSaving || isGenerating}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-plm-fg-muted hover:text-plm-accent hover:bg-plm-accent/20 disabled:opacity-50 transition-colors"
              title="Generate next serial number"
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            </button>
          )}
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex items-center gap-2 group">
      <span className={editable ? "text-plm-fg-muted" : "text-plm-fg-muted/50"}>{icon}</span>
      <span className={editable ? "text-plm-fg-muted" : "text-plm-fg-muted/50"}>{label}:</span>
      <span 
        className={`px-1 rounded ${editable ? 'cursor-text hover:bg-plm-bg-light' : ''} ${!value || value === '-' || !editable ? 'text-plm-fg-muted' : 'text-plm-fg'}`}
        onClick={editable ? onStartEdit : undefined}
        title={editable ? 'Click to edit' : (tooltip || 'Check out file to edit')}
      >
        {value || placeholder}
      </span>
      {editable && (
        <button
          onClick={onStartEdit}
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-plm-accent/20 text-plm-fg-muted hover:text-plm-accent transition-opacity"
          title="Edit"
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  )
}

// StatePropertyItem removed - state changes now use workflow transitions
