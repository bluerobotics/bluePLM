import { useEffect, useState, useMemo } from 'react'
import { log } from '@/lib/logger'
import { 
  FileWarning, 
  Plus, 
  Search, 
  X, 
  File, 
  ChevronRight, 
  ChevronDown,
  Tag,
  Calendar,
  Check,
  Clock,
  XCircle,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Ban,
  FileX,
  Timer,
  Upload
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { getSupabaseClient, getFileVersions } from '@/lib/supabase'
import { formatDistanceToNow, format } from 'date-fns'

// Deviation status types
type DeviationStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'closed' | 'expired'

interface Deviation {
  id: string
  deviation_number: string
  title: string
  description: string | null
  status: DeviationStatus | null
  deviation_type: string | null
  effective_date: string | null
  expiration_date: string | null
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  affected_part_numbers: string[] | null
  created_at: string | null
  created_by: string
  file_count?: number
  created_by_name?: string | null
  created_by_email?: string
  approved_by_name?: string | null
}

interface FileDeviation {
  id: string
  file_id: string
  deviation_id: string
  file_version: number | null
  file_revision: string | null
  created_at: string | null
  notes: string | null
  file?: {
    id: string
    file_name: string
    file_path: string
    part_number: string | null
    revision: string
    version: number
  }
}

interface FileVersion {
  id: string
  version: number
  revision: string
  created_at: string | null
  comment: string | null
}

interface DroppedFile {
  id: string
  name: string
  path: string
  partNumber: string | null
  currentVersion: number
  currentRevision: string
}

const STATUS_CONFIG: Record<DeviationStatus, { icon: React.ReactNode; label: string; color: string; bgColor: string }> = {
  draft: { 
    icon: <FileX size={12} />, 
    label: 'Draft', 
    color: 'text-plm-fg-muted',
    bgColor: 'bg-plm-fg-muted/10'
  },
  pending_approval: { 
    icon: <Clock size={12} />, 
    label: 'Pending Approval', 
    color: 'text-plm-warning',
    bgColor: 'bg-plm-warning/10'
  },
  approved: { 
    icon: <CheckCircle2 size={12} />, 
    label: 'Approved', 
    color: 'text-plm-success',
    bgColor: 'bg-plm-success/10'
  },
  rejected: { 
    icon: <XCircle size={12} />, 
    label: 'Rejected', 
    color: 'text-plm-error',
    bgColor: 'bg-plm-error/10'
  },
  closed: { 
    icon: <Ban size={12} />, 
    label: 'Closed', 
    color: 'text-plm-fg-dim',
    bgColor: 'bg-plm-fg-dim/10'
  },
  expired: { 
    icon: <Timer size={12} />, 
    label: 'Expired', 
    color: 'text-plm-fg-muted',
    bgColor: 'bg-plm-fg-muted/10'
  },
}

const DEVIATION_TYPES = [
  'Material',
  'Dimension',
  'Process',
  'Documentation',
  'Finish',
  'Tolerance',
  'Other'
]

export function DeviationsView() {
  const { 
    organization, 
    user,
    isVaultConnected, 
    files,
    selectedFiles,
    addToast
  } = usePDMStore()
  
  const [deviations, setDeviations] = useState<Deviation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<DeviationStatus | 'all'>('all')
  const [expandedDeviation, setExpandedDeviation] = useState<string | null>(null)
  const [deviationFiles, setDeviationFiles] = useState<Record<string, FileDeviation[]>>({})
  const [loadingFiles, setLoadingFiles] = useState<string | null>(null)
  
  // Create deviation modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newDeviationNumber, setNewDeviationNumber] = useState('')
  const [newDeviationTitle, setNewDeviationTitle] = useState('')
  const [newDeviationDescription, setNewDeviationDescription] = useState('')
  const [newDeviationType, setNewDeviationType] = useState('')
  const [newExpirationDate, setNewExpirationDate] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  
  // Tag files modal state
  const [showTagModal, setShowTagModal] = useState(false)
  const [tagDeviationId, setTagDeviationId] = useState<string | null>(null)
  const [tagNotes, setTagNotes] = useState('')
  const [tagSpecificVersion, setTagSpecificVersion] = useState(false)
  const [isTagging, setIsTagging] = useState(false)
  
  // Drag and drop state
  const [dragOverDeviationId, setDragOverDeviationId] = useState<string | null>(null)
  
  // Drop modal state (for selecting revision)
  const [showDropModal, setShowDropModal] = useState(false)
  const [dropDeviationId, setDropDeviationId] = useState<string | null>(null)
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([])
  const [fileVersions, setFileVersions] = useState<Record<string, FileVersion[]>>({})
  const [selectedVersions, setSelectedVersions] = useState<Record<string, { version: number; revision: string } | 'all'>>({})
  const [dropNotes, setDropNotes] = useState('')
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [isAddingDroppedFiles, setIsAddingDroppedFiles] = useState(false)

  // Load Deviations
  useEffect(() => {
    const loadDeviations = async () => {
      if (!isVaultConnected || !organization) {
        setDeviations([])
        return
      }
      
      setIsLoading(true)
      
      try {
        const client = getSupabaseClient()
        
        // Fetch deviations
        const { data, error } = await client
          .from('deviations')
          .select(`
            id,
            deviation_number,
            title,
            description,
            status,
            deviation_type,
            effective_date,
            expiration_date,
            approved_by,
            approved_at,
            rejection_reason,
            affected_part_numbers,
            created_at,
            created_by,
            created_by_user:users!created_by(full_name, email),
            approved_by_user:users!approved_by(full_name)
          `)
          .eq('org_id', organization.id)
          .order('created_at', { ascending: false })
        
        if (error) {
          log.error('[Deviations]', 'Failed to load deviations', { error })
          // Don't show error if table doesn't exist yet
          if (!error.message?.includes('deviations')) {
            addToast('error', 'Failed to load deviations')
          }
          return
        }
        
        // Get file counts for each deviation
        const deviationIds = data?.map(d => d.id) || []
        let fileCounts: Record<string, number> = {}
        
        if (deviationIds.length > 0) {
          const { data: countData } = await client
            .from('file_deviations')
            .select('deviation_id')
            .in('deviation_id', deviationIds)
          
          if (countData) {
            fileCounts = countData.reduce((acc, item) => {
              acc[item.deviation_id] = (acc[item.deviation_id] || 0) + 1
              return acc
            }, {} as Record<string, number>)
          }
        }
        
        const deviationsWithCounts = (data || []).map(dev => ({
          ...dev,
          file_count: fileCounts[dev.id] || 0,
          created_by_name: (dev.created_by_user as any)?.full_name,
          created_by_email: (dev.created_by_user as any)?.email,
          approved_by_name: (dev.approved_by_user as any)?.full_name,
        }))
        
        setDeviations(deviationsWithCounts)
      } catch (err) {
        log.error('[Deviations]', 'Failed to load deviations', { error: err })
      } finally {
        setIsLoading(false)
      }
    }

    loadDeviations()
    
    // Refresh every 60 seconds
    const interval = setInterval(loadDeviations, 60000)
    return () => clearInterval(interval)
  }, [isVaultConnected, organization])
  
  // Load files for a deviation when expanded
  const loadDeviationFiles = async (deviationId: string) => {
    if (deviationFiles[deviationId]) return // Already loaded
    
    setLoadingFiles(deviationId)
    
    try {
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('file_deviations')
        .select(`
          id,
          file_id,
          deviation_id,
          file_version,
          file_revision,
          created_at,
          notes,
          file:files!file_id(
            id,
            file_name,
            file_path,
            part_number,
            revision,
            version
          )
        `)
        .eq('deviation_id', deviationId)
        .order('created_at', { ascending: false })
      
      if (error) {
        log.error('[Deviations]', 'Failed to load deviation files', { error })
        return
      }
      
      setDeviationFiles(prev => ({
        ...prev,
        [deviationId]: data || []
      }))
    } catch (err) {
      log.error('[Deviations]', 'Failed to load deviation files', { error: err })
    } finally {
      setLoadingFiles(null)
    }
  }
  
  // Filter deviations based on search and status
  const filteredDeviations = useMemo(() => {
    return deviations.filter(dev => {
      // Status filter
      if (statusFilter !== 'all' && dev.status !== statusFilter) {
        return false
      }
      
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        return (
          dev.deviation_number.toLowerCase().includes(query) ||
          dev.title?.toLowerCase().includes(query) ||
          dev.description?.toLowerCase().includes(query) ||
          dev.deviation_type?.toLowerCase().includes(query) ||
          dev.affected_part_numbers?.some(pn => pn.toLowerCase().includes(query))
        )
      }
      
      return true
    })
  }, [deviations, searchQuery, statusFilter])
  
  // Toggle deviation expansion
  const toggleDeviation = (deviationId: string) => {
    if (expandedDeviation === deviationId) {
      setExpandedDeviation(null)
    } else {
      setExpandedDeviation(deviationId)
      loadDeviationFiles(deviationId)
    }
  }
  
  // Create new deviation
  const handleCreateDeviation = async () => {
    if (!newDeviationNumber.trim() || !newDeviationTitle.trim() || !organization || !user) return
    
    setIsCreating(true)
    
    try {
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('deviations')
        .insert({
          org_id: organization.id,
          deviation_number: newDeviationNumber.trim().toUpperCase(),
          title: newDeviationTitle.trim(),
          description: newDeviationDescription.trim() || null,
          deviation_type: newDeviationType || null,
          expiration_date: newExpirationDate || null,
          status: 'draft',
          created_by: user.id
        })
        .select()
        .single()
      
      if (error) {
        if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
          addToast('error', 'Deviation number already exists')
        } else {
          addToast('error', 'Failed to create deviation')
        }
        log.error('[Deviations]', 'Failed to create deviation', { error })
        return
      }
      
      // Add to list
      setDeviations(prev => [{
        ...data,
        file_count: 0,
        created_by_name: user.full_name,
        created_by_email: user.email
      }, ...prev])
      
      // Reset form
      setNewDeviationNumber('')
      setNewDeviationTitle('')
      setNewDeviationDescription('')
      setNewDeviationType('')
      setNewExpirationDate('')
      setShowCreateModal(false)
      
      addToast('success', `Deviation ${data.deviation_number} created`)
    } catch (err) {
      log.error('[Deviations]', 'Failed to create deviation', { error: err })
      addToast('error', 'Failed to create deviation')
    } finally {
      setIsCreating(false)
    }
  }
  
  // Tag selected files with a deviation
  const handleTagFiles = async () => {
    if (!tagDeviationId || selectedFiles.length === 0 || !user) return
    
    setIsTagging(true)
    
    try {
      const client = getSupabaseClient()
      
      // Get file data for selected paths
      const fileData: { id: string; version: number; revision: string; partNumber: string | null }[] = []
      const partNumbers: string[] = []
      
      for (const path of selectedFiles) {
        const file = files.find(f => f.path === path)
        if (file?.pdmData?.id) {
          fileData.push({
            id: file.pdmData.id,
            version: file.pdmData.version || 1,
            revision: file.pdmData.revision || 'A',
            partNumber: file.pdmData.part_number || null
          })
          if (file.pdmData.part_number) {
            partNumbers.push(file.pdmData.part_number)
          }
        }
      }
      
      if (fileData.length === 0) {
        addToast('warning', 'No synced files selected. Only synced files can be tagged.')
        setShowTagModal(false)
        return
      }
      
      // Insert file-deviation associations
      const insertData = fileData.map(file => ({
        file_id: file.id,
        deviation_id: tagDeviationId,
        file_version: tagSpecificVersion ? file.version : null,
        file_revision: tagSpecificVersion ? file.revision : null,
        notes: tagNotes.trim() || null,
        created_by: user.id
      }))
      
      const { error } = await client
        .from('file_deviations')
        .upsert(insertData, { onConflict: 'file_id,deviation_id' })
      
      if (error) {
        log.error('[Deviations]', 'Failed to tag files', { error })
        addToast('error', 'Failed to tag files with deviation')
        return
      }
      
      // Update affected_part_numbers on the deviation if we have new part numbers
      if (partNumbers.length > 0) {
        const deviation = deviations.find(d => d.id === tagDeviationId)
        const existingParts = deviation?.affected_part_numbers || []
        const allParts = [...new Set([...existingParts, ...partNumbers])]
        
        await client
          .from('deviations')
          .update({ affected_part_numbers: allParts })
          .eq('id', tagDeviationId)
      }
      
      // Update file count in local state
      const dev = deviations.find(d => d.id === tagDeviationId)
      if (dev) {
        setDeviations(prev => prev.map(d => 
          d.id === tagDeviationId 
            ? { 
                ...d, 
                file_count: (d.file_count || 0) + fileData.length,
                affected_part_numbers: [...new Set([...(d.affected_part_numbers || []), ...partNumbers])]
              }
            : d
        ))
      }
      
      // Clear cached files for this deviation
      setDeviationFiles(prev => {
        const { [tagDeviationId]: _, ...rest } = prev
        return rest
      })
      
      setShowTagModal(false)
      setTagDeviationId(null)
      setTagNotes('')
      setTagSpecificVersion(false)
      
      addToast('success', `Tagged ${fileData.length} file(s) with deviation`)
    } catch (err) {
      log.error('[Deviations]', 'Failed to tag files', { error: err })
      addToast('error', 'Failed to tag files with deviation')
    } finally {
      setIsTagging(false)
    }
  }
  
  // Remove file from deviation
  const handleRemoveFileFromDeviation = async (fileDeviationId: string, deviationId: string) => {
    try {
      const client = getSupabaseClient()
      const { error } = await client
        .from('file_deviations')
        .delete()
        .eq('id', fileDeviationId)
      
      if (error) {
        log.error('[Deviations]', 'Failed to remove file from deviation', { error })
        addToast('error', 'Failed to remove file from deviation')
        return
      }
      
      // Update local state
      setDeviationFiles(prev => ({
        ...prev,
        [deviationId]: prev[deviationId]?.filter(fd => fd.id !== fileDeviationId) || []
      }))
      
      setDeviations(prev => prev.map(d => 
        d.id === deviationId 
          ? { ...d, file_count: Math.max(0, (d.file_count || 0) - 1) }
          : d
      ))
      
      addToast('success', 'File removed from deviation')
    } catch (err) {
      log.error('[Deviations]', 'Failed to remove file from deviation', { error: err })
    }
  }
  
  // Handle drag over a deviation
  const handleDragOver = (e: React.DragEvent, deviationId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Check if we have PDM files being dragged
    if (e.dataTransfer.types.includes('application/x-plm-files')) {
      e.dataTransfer.dropEffect = 'copy'
      setDragOverDeviationId(deviationId)
    }
  }
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverDeviationId(null)
  }
  
  // Handle drop of files onto a deviation
  const handleDrop = async (e: React.DragEvent, deviationId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverDeviationId(null)
    
    const pdmFilesData = e.dataTransfer.getData('application/x-plm-files')
    if (!pdmFilesData) return
    
    try {
      const relativePaths: string[] = JSON.parse(pdmFilesData)
      
      // Find matching files in the store
      const matchedFiles: DroppedFile[] = []
      for (const relPath of relativePaths) {
        const file = files.find(f => 
          f.relativePath.toLowerCase() === relPath.toLowerCase() && 
          f.pdmData?.id
        )
        
        if (file?.pdmData?.id) {
          matchedFiles.push({
            id: file.pdmData.id,
            name: file.name,
            path: file.relativePath,
            partNumber: file.pdmData.part_number || null,
            currentVersion: file.pdmData.version || 1,
            currentRevision: file.pdmData.revision || 'A'
          })
        }
      }
      
      if (matchedFiles.length === 0) {
        addToast('warning', 'Only synced files can be added to deviations')
        return
      }
      
      // Set up drop modal
      setDroppedFiles(matchedFiles)
      setDropDeviationId(deviationId)
      
      // Initialize all files to "all versions" by default
      const initialVersions: Record<string, 'all'> = {}
      matchedFiles.forEach(f => {
        initialVersions[f.id] = 'all'
      })
      setSelectedVersions(initialVersions)
      
      setShowDropModal(true)
      
      // Load version history for each file
      setIsLoadingVersions(true)
      const versions: Record<string, FileVersion[]> = {}
      
      for (const file of matchedFiles) {
        const { versions: fileVers } = await getFileVersions(file.id)
        if (fileVers) {
          versions[file.id] = fileVers.map(v => ({
            id: v.id,
            version: v.version,
            revision: v.revision,
            created_at: v.created_at,
            comment: v.comment
          }))
        }
      }
      
      setFileVersions(versions)
      setIsLoadingVersions(false)
      
    } catch (err) {
      log.error('[Deviations]', 'Failed to handle drop', { error: err })
      addToast('error', 'Failed to process dropped files')
    }
  }
  
  // Handle adding dropped files to deviation
  const handleAddDroppedFiles = async () => {
    if (!dropDeviationId || droppedFiles.length === 0 || !user) return
    
    setIsAddingDroppedFiles(true)
    
    try {
      const client = getSupabaseClient()
      const partNumbers: string[] = []
      
      // Build insert data based on selected versions
      const insertData = droppedFiles.map(file => {
        const selected = selectedVersions[file.id]
        const isAllVersions = selected === 'all'
        
        if (file.partNumber) {
          partNumbers.push(file.partNumber)
        }
        
        return {
          file_id: file.id,
          deviation_id: dropDeviationId,
          file_version: isAllVersions ? null : selected.version,
          file_revision: isAllVersions ? null : selected.revision,
          notes: dropNotes.trim() || null,
          created_by: user.id
        }
      })
      
      const { error } = await client
        .from('file_deviations')
        .upsert(insertData, { onConflict: 'file_id,deviation_id' })
      
      if (error) {
        log.error('[Deviations]', 'Failed to add files to deviation', { error })
        addToast('error', 'Failed to add files to deviation')
        return
      }
      
      // Update affected_part_numbers on the deviation if we have new part numbers
      if (partNumbers.length > 0) {
        const deviation = deviations.find(d => d.id === dropDeviationId)
        const existingParts = deviation?.affected_part_numbers || []
        const allParts = [...new Set([...existingParts, ...partNumbers])]
        
        await client
          .from('deviations')
          .update({ affected_part_numbers: allParts })
          .eq('id', dropDeviationId)
      }
      
      // Update file count in local state
      setDeviations(prev => prev.map(d => 
        d.id === dropDeviationId 
          ? { 
              ...d, 
              file_count: (d.file_count || 0) + droppedFiles.length,
              affected_part_numbers: [...new Set([...(d.affected_part_numbers || []), ...partNumbers])]
            }
          : d
      ))
      
      // Clear cached files for this deviation
      setDeviationFiles(prev => {
        const { [dropDeviationId]: _, ...rest } = prev
        return rest
      })
      
      // Close modal and reset state
      setShowDropModal(false)
      setDropDeviationId(null)
      setDroppedFiles([])
      setFileVersions({})
      setSelectedVersions({})
      setDropNotes('')
      
      addToast('success', `Added ${droppedFiles.length} file(s) to deviation`)
    } catch (err) {
      log.error('[Deviations]', 'Failed to add files to deviation', { error: err })
      addToast('error', 'Failed to add files to deviation')
    } finally {
      setIsAddingDroppedFiles(false)
    }
  }
  
  // Update deviation status
  const handleUpdateStatus = async (deviationId: string, newStatus: DeviationStatus) => {
    if (!user) return
    
    try {
      const client = getSupabaseClient()
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }
      
      // Set approval info if approving
      if (newStatus === 'approved') {
        updateData.approved_by = user.id
        updateData.approved_at = new Date().toISOString()
      }
      
      const { error } = await client
        .from('deviations')
        .update(updateData)
        .eq('id', deviationId)
      
      if (error) {
        log.error('[Deviations]', 'Failed to update deviation status', { error })
        addToast('error', 'Failed to update deviation status')
        return
      }
      
      setDeviations(prev => prev.map(d => 
        d.id === deviationId 
          ? { 
              ...d, 
              status: newStatus,
              ...(newStatus === 'approved' ? { 
                approved_by: user.id, 
                approved_at: new Date().toISOString(),
                approved_by_name: user.full_name 
              } : {})
            } 
          : d
      ))
      
      addToast('success', `Deviation status updated to ${STATUS_CONFIG[newStatus].label}`)
    } catch (err) {
      log.error('[Deviations]', 'Failed to update deviation status', { error: err })
    }
  }

  if (!isVaultConnected) {
    return (
      <div className="p-4 text-sm text-plm-fg-muted text-center">
        Open a vault to manage deviations
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="p-4 text-sm text-plm-fg-muted text-center">
        Sign in to manage deviations
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with search and create button */}
      <div className="p-3 border-b border-plm-border space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search deviations..."
            className="w-full pl-8 pr-8 py-1.5 text-sm"
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
        
        {/* Status filter and create button */}
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DeviationStatus | 'all')}
            className="flex-1 text-sm py-1"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="closed">Closed</option>
            <option value="expired">Expired</option>
          </select>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 px-2 py-1 text-sm bg-plm-accent text-white rounded hover:bg-plm-accent-hover transition-colors"
          >
            <Plus size={14} />
            New
          </button>
        </div>
        
        {/* Tag files button (shown when files are selected) */}
        {selectedFiles.length > 0 && (
          <button
            onClick={() => setShowTagModal(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-plm-bg-light border border-plm-border rounded hover:bg-plm-highlight transition-colors"
          >
            <Tag size={14} />
            Tag {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} with deviation
          </button>
        )}
        
        {/* Drag hint */}
        {filteredDeviations.length > 0 && selectedFiles.length === 0 && (
          <div className="text-xs text-plm-fg-muted text-center flex items-center justify-center gap-1">
            <Upload size={10} />
            Drag files from browser onto a deviation
          </div>
        )}
      </div>
      
      {/* Deviations List */}
      <div className="flex-1 overflow-auto">
        {isLoading && deviations.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="spinner" />
          </div>
        ) : filteredDeviations.length === 0 ? (
          <div className="p-4 text-sm text-plm-fg-muted text-center">
            {searchQuery || statusFilter !== 'all' 
              ? 'No deviations match your filters'
              : 'No deviations yet. Create one to get started.'}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredDeviations.map((dev) => {
              const statusConfig = STATUS_CONFIG[dev.status ?? 'draft']
              const isExpanded = expandedDeviation === dev.id
              const filesForDev = deviationFiles[dev.id] || []
              const isLoadingDevFiles = loadingFiles === dev.id
              const isExpiringSoon = dev.expiration_date && 
                new Date(dev.expiration_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
                new Date(dev.expiration_date) > new Date()
              
              const isDragOver = dragOverDeviationId === dev.id
              
              return (
                <div
                  key={dev.id}
                  className={`bg-plm-bg-light rounded border transition-colors ${
                    isDragOver 
                      ? 'border-plm-accent border-2 bg-plm-accent/10' 
                      : 'border-plm-border'
                  }`}
                  onDragOver={(e) => handleDragOver(e, dev.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, dev.id)}
                >
                  {/* Drop indicator */}
                  {isDragOver && (
                    <div className="px-2 py-1.5 bg-plm-accent/20 text-plm-accent text-xs flex items-center gap-2">
                      <Upload size={12} />
                      Drop to add files to this deviation
                    </div>
                  )}
                  
                  {/* Deviation Header */}
                  <div
                    onClick={() => toggleDeviation(dev.id)}
                    className="flex items-start gap-2 p-2 cursor-pointer hover:bg-plm-highlight transition-colors rounded"
                  >
                    <span className="mt-1 text-plm-fg-muted">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-plm-fg">
                          {dev.deviation_number}
                        </span>
                        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${statusConfig.color} ${statusConfig.bgColor}`}>
                          {statusConfig.icon}
                          {statusConfig.label}
                        </span>
                        {isExpiringSoon && dev.status === 'approved' && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-plm-warning bg-plm-warning/10">
                            <AlertTriangle size={10} />
                            Expiring soon
                          </span>
                        )}
                      </div>
                      
                      <div className="text-sm text-plm-fg-dim truncate mt-0.5">
                        {dev.title}
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-plm-fg-muted mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <File size={10} />
                          {dev.file_count || 0} files
                        </span>
                        {dev.deviation_type && (
                          <span className="px-1.5 py-0.5 bg-plm-bg rounded">
                            {dev.deviation_type}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          {dev.created_at ? formatDistanceToNow(new Date(dev.created_at), { addSuffix: true }) : 'Unknown'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-plm-border">
                      {/* Description */}
                      {dev.description && (
                        <div className="p-2 text-xs text-plm-fg-dim border-b border-plm-border">
                          {dev.description}
                        </div>
                      )}
                      
                      {/* Metadata */}
                      <div className="p-2 border-b border-plm-border text-xs space-y-1">
                        {dev.effective_date && (
                          <div className="flex items-center gap-2">
                            <span className="text-plm-fg-muted">Effective:</span>
                            <span>{format(new Date(dev.effective_date), 'MMM d, yyyy')}</span>
                          </div>
                        )}
                        {dev.expiration_date && (
                          <div className="flex items-center gap-2">
                            <span className="text-plm-fg-muted">Expires:</span>
                            <span className={isExpiringSoon ? 'text-plm-warning' : ''}>
                              {format(new Date(dev.expiration_date), 'MMM d, yyyy')}
                            </span>
                          </div>
                        )}
                        {dev.approved_by_name && (
                          <div className="flex items-center gap-2">
                            <span className="text-plm-fg-muted">Approved by:</span>
                            <span>{dev.approved_by_name}</span>
                          </div>
                        )}
                        {dev.rejection_reason && (
                          <div className="flex items-center gap-2">
                            <span className="text-plm-fg-muted">Rejection reason:</span>
                            <span className="text-plm-error">{dev.rejection_reason}</span>
                          </div>
                        )}
                        {dev.affected_part_numbers && dev.affected_part_numbers.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-plm-fg-muted">Parts:</span>
                            <span className="flex flex-wrap gap-1">
                              {dev.affected_part_numbers.map((pn, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-plm-bg rounded">
                                  {pn}
                                </span>
                              ))}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Status change buttons */}
                      <div className="p-2 border-b border-plm-border">
                        <div className="text-xs text-plm-fg-muted mb-1.5">Change Status:</div>
                        <div className="flex flex-wrap gap-1">
                          {(['draft', 'pending_approval', 'approved', 'rejected', 'closed'] as DeviationStatus[]).map(status => {
                            const config = STATUS_CONFIG[status]
                            const isActive = dev.status === status
                            return (
                              <button
                                key={status}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (!isActive) handleUpdateStatus(dev.id, status)
                                }}
                                disabled={isActive}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                                  isActive 
                                    ? `${config.color} ${config.bgColor} cursor-default`
                                    : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight'
                                }`}
                              >
                                {config.icon}
                                {config.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      
                      {/* Files list */}
                      <div className="p-2">
                        <div className="text-xs text-plm-fg-muted mb-1.5">Tagged Files:</div>
                        
                        {isLoadingDevFiles ? (
                          <div className="flex items-center justify-center py-2">
                            <Loader2 size={14} className="animate-spin text-plm-fg-muted" />
                          </div>
                        ) : filesForDev.length === 0 ? (
                          <div className="text-xs text-plm-fg-muted py-2 text-center">
                            No files tagged with this deviation
                          </div>
                        ) : (
                          <div className="space-y-1 max-h-48 overflow-auto">
                            {filesForDev.map(fileDev => (
                              <div
                                key={fileDev.id}
                                className="flex items-center gap-2 p-1.5 rounded bg-plm-bg hover:bg-plm-highlight group"
                              >
                                <File size={12} className="text-plm-fg-muted flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs truncate">
                                    {(fileDev.file as any)?.file_name || 'Unknown file'}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-plm-fg-muted">
                                    {(fileDev.file as any)?.part_number && (
                                      <span>{(fileDev.file as any).part_number}</span>
                                    )}
                                    {fileDev.file_version && (
                                      <span className="px-1 bg-plm-bg-light rounded">
                                        v{fileDev.file_version} / {fileDev.file_revision}
                                      </span>
                                    )}
                                  </div>
                                  {fileDev.notes && (
                                    <div className="text-xs text-plm-fg-dim truncate italic">
                                      {fileDev.notes}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRemoveFileFromDeviation(fileDev.id, dev.id)
                                  }}
                                  className="p-1 opacity-0 group-hover:opacity-100 text-plm-fg-muted hover:text-plm-error transition-opacity"
                                  title="Remove from deviation"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      
      {/* Create Deviation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-plm-bg border border-plm-border rounded-lg shadow-xl w-[450px] max-w-[90vw] max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-3 border-b border-plm-border">
              <h3 className="font-medium">Create New Deviation</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-plm-highlight rounded"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-plm-fg-muted mb-1">
                  Deviation Number *
                </label>
                <input
                  type="text"
                  value={newDeviationNumber}
                  onChange={(e) => setNewDeviationNumber(e.target.value)}
                  placeholder="e.g., DEV-001"
                  className="w-full"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-xs text-plm-fg-muted mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={newDeviationTitle}
                  onChange={(e) => setNewDeviationTitle(e.target.value)}
                  placeholder="Brief title/reason"
                  className="w-full"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-plm-fg-muted mb-1">
                    Type
                  </label>
                  <select
                    value={newDeviationType}
                    onChange={(e) => setNewDeviationType(e.target.value)}
                    className="w-full"
                  >
                    <option value="">Select type...</option>
                    {DEVIATION_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs text-plm-fg-muted mb-1">
                    Expiration Date
                  </label>
                  <input
                    type="date"
                    value={newExpirationDate}
                    onChange={(e) => setNewExpirationDate(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-plm-fg-muted mb-1">
                  Description / Justification
                </label>
                <textarea
                  value={newDeviationDescription}
                  onChange={(e) => setNewDeviationDescription(e.target.value)}
                  placeholder="Detailed justification for the deviation..."
                  className="w-full h-24 resize-none"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 p-3 border-t border-plm-border">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 text-sm hover:bg-plm-highlight rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDeviation}
                disabled={!newDeviationNumber.trim() || !newDeviationTitle.trim() || isCreating}
                className="px-3 py-1.5 text-sm bg-plm-accent text-white rounded hover:bg-plm-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCreating && <Loader2 size={14} className="animate-spin" />}
                Create Deviation
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Tag Files Modal */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-plm-bg border border-plm-border rounded-lg shadow-xl w-[450px] max-w-[90vw] max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-3 border-b border-plm-border">
              <h3 className="font-medium">Tag Files with Deviation</h3>
              <button
                onClick={() => {
                  setShowTagModal(false)
                  setTagDeviationId(null)
                  setTagNotes('')
                  setTagSpecificVersion(false)
                }}
                className="p-1 hover:bg-plm-highlight rounded"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4">
              <div className="text-sm text-plm-fg-dim mb-3">
                Select a deviation to tag {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}:
              </div>
              
              <div className="space-y-1 max-h-48 overflow-auto mb-4">
                {deviations.filter(d => d.status !== 'closed' && d.status !== 'expired' && d.status !== 'rejected').map(dev => (
                  <div
                    key={dev.id}
                    onClick={() => setTagDeviationId(dev.id)}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                      tagDeviationId === dev.id 
                        ? 'bg-plm-accent/20 border border-plm-accent'
                        : 'bg-plm-bg-light hover:bg-plm-highlight border border-transparent'
                    }`}
                  >
                    <FileWarning size={14} className="text-plm-warning flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{dev.deviation_number}</div>
                      <div className="text-xs text-plm-fg-muted truncate">{dev.title}</div>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_CONFIG[dev.status ?? 'draft'].color} ${STATUS_CONFIG[dev.status ?? 'draft'].bgColor}`}>
                      {STATUS_CONFIG[dev.status ?? 'draft'].label}
                    </span>
                    {tagDeviationId === dev.id && (
                      <Check size={14} className="text-plm-accent flex-shrink-0" />
                    )}
                  </div>
                ))}
                
                {deviations.filter(d => d.status !== 'closed' && d.status !== 'expired' && d.status !== 'rejected').length === 0 && (
                  <div className="text-sm text-plm-fg-muted text-center py-4">
                    No active deviations. Create one first.
                  </div>
                )}
              </div>
              
              {tagDeviationId && (
                <>
                  <div className="mb-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tagSpecificVersion}
                        onChange={(e) => setTagSpecificVersion(e.target.checked)}
                        className="rounded"
                      />
                      <span>Apply to current version/revision only</span>
                    </label>
                    <p className="text-xs text-plm-fg-muted mt-1 ml-6">
                      If unchecked, deviation applies to all versions
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-xs text-plm-fg-muted mb-1">
                      Notes (optional)
                    </label>
                    <textarea
                      value={tagNotes}
                      onChange={(e) => setTagNotes(e.target.value)}
                      placeholder="How these files are affected..."
                      className="w-full h-16 resize-none text-sm"
                    />
                  </div>
                </>
              )}
            </div>
            
            <div className="flex justify-end gap-2 p-3 border-t border-plm-border">
              <button
                onClick={() => {
                  setShowTagModal(false)
                  setTagDeviationId(null)
                  setTagNotes('')
                  setTagSpecificVersion(false)
                }}
                className="px-3 py-1.5 text-sm hover:bg-plm-highlight rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleTagFiles}
                disabled={!tagDeviationId || isTagging}
                className="px-3 py-1.5 text-sm bg-plm-accent text-white rounded hover:bg-plm-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isTagging && <Loader2 size={14} className="animate-spin" />}
                Tag Files
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Drop Files Modal - Select Revision */}
      {showDropModal && dropDeviationId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-plm-bg border border-plm-border rounded-lg shadow-xl w-[500px] max-w-[90vw] max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-3 border-b border-plm-border">
              <h3 className="font-medium">Add Files to Deviation</h3>
              <button
                onClick={() => {
                  setShowDropModal(false)
                  setDropDeviationId(null)
                  setDroppedFiles([])
                  setFileVersions({})
                  setSelectedVersions({})
                  setDropNotes('')
                }}
                className="p-1 hover:bg-plm-highlight rounded"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4">
              {/* Deviation info */}
              {(() => {
                const dev = deviations.find(d => d.id === dropDeviationId)
                if (!dev) return null
                return (
                  <div className="flex items-center gap-2 p-2 bg-plm-bg-light rounded mb-4">
                    <FileWarning size={14} className="text-plm-warning flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{dev.deviation_number}</div>
                      <div className="text-xs text-plm-fg-muted truncate">{dev.title}</div>
                    </div>
                  </div>
                )
              })()}
              
              <div className="text-sm text-plm-fg-dim mb-3">
                Select which revision the deviation applies to for each file:
              </div>
              
              {/* Files list with version selection */}
              <div className="space-y-3 max-h-[300px] overflow-auto mb-4">
                {droppedFiles.map(file => {
                  const versions = fileVersions[file.id] || []
                  const selected = selectedVersions[file.id]
                  
                  return (
                    <div key={file.id} className="bg-plm-bg-light rounded p-3">
                      <div className="flex items-start gap-2 mb-2">
                        <File size={14} className="text-plm-fg-muted mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{file.name}</div>
                          {file.partNumber && (
                            <div className="text-xs text-plm-fg-muted">{file.partNumber}</div>
                          )}
                          <div className="text-xs text-plm-fg-muted">
                            Current: v{file.currentVersion} / Rev {file.currentRevision}
                          </div>
                        </div>
                      </div>
                      
                      {isLoadingVersions ? (
                        <div className="flex items-center gap-2 text-xs text-plm-fg-muted py-2">
                          <Loader2 size={12} className="animate-spin" />
                          Loading versions...
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs text-plm-fg-muted mb-1">
                            Apply to revision:
                          </label>
                          <select
                            value={selected === 'all' ? 'all' : `${selected?.version}-${selected?.revision}`}
                            onChange={(e) => {
                              const value = e.target.value
                              if (value === 'all') {
                                setSelectedVersions(prev => ({ ...prev, [file.id]: 'all' }))
                              } else {
                                const [ver, rev] = value.split('-')
                                setSelectedVersions(prev => ({ 
                                  ...prev, 
                                  [file.id]: { version: parseInt(ver), revision: rev } 
                                }))
                              }
                            }}
                            className="w-full text-sm"
                          >
                            <option value="all">All versions (any revision)</option>
                            {versions.map(v => (
                              <option key={v.id} value={`${v.version}-${v.revision}`}>
                                v{v.version} / Rev {v.revision}
                                {v.comment ? ` - ${v.comment}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              
              <div>
                <label className="block text-xs text-plm-fg-muted mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={dropNotes}
                  onChange={(e) => setDropNotes(e.target.value)}
                  placeholder="How these files are affected by the deviation..."
                  className="w-full h-16 resize-none text-sm"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 p-3 border-t border-plm-border">
              <button
                onClick={() => {
                  setShowDropModal(false)
                  setDropDeviationId(null)
                  setDroppedFiles([])
                  setFileVersions({})
                  setSelectedVersions({})
                  setDropNotes('')
                }}
                className="px-3 py-1.5 text-sm hover:bg-plm-highlight rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDroppedFiles}
                disabled={isAddingDroppedFiles || isLoadingVersions}
                className="px-3 py-1.5 text-sm bg-plm-accent text-white rounded hover:bg-plm-accent-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isAddingDroppedFiles && <Loader2 size={14} className="animate-spin" />}
                Add {droppedFiles.length} File{droppedFiles.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

