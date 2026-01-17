/**
 * Item Number column cell renderer
 * 
 * Uses both contexts:
 * - useFilePaneContext() for UI state (editing state, refs)
 * - useFilePaneHandlers() for action handlers
 * 
 * NOTE: Drawing files can have their item number locked via settings because
 * it typically comes from the referenced model, not from editable properties.
 */
import { useState, useRef, useEffect } from 'react'
import { Sparkles, Loader2, FileInput, Check } from 'lucide-react'
import { useFilePaneContext, useFilePaneHandlers } from '../../../context'
import { usePDMStore } from '@/stores/pdmStore'
import { getNextSerialNumber, previewNextSerialNumber } from '@/lib/serialization'
import type { CellRendererBaseProps } from './types'

export function ItemNumberCell({ file }: CellRendererBaseProps): React.ReactNode {
  // UI state from FilePaneContext
  const { editingCell, editValue, setEditValue, inlineEditInputRef, columns } = useFilePaneContext()
  
  // Handlers from FilePaneHandlersContext
  const { isFileEditable, handleSaveCellEdit, handleCancelCellEdit, handleStartCellEdit, saveConfigsToSWFile } = useFilePaneHandlers()
  
  // Store selectors for organization, toast, pending metadata update, and drawing lockout
  const organization = usePDMStore(s => s.organization)
  const addToast = usePDMStore(s => s.addToast)
  const updatePendingMetadata = usePDMStore(s => s.updatePendingMetadata)
  const lockDrawingItemNumber = usePDMStore(s => s.lockDrawingItemNumber)
  
  // Check if Tab column is visible
  const isTabColumnVisible = columns.some(c => c.id === 'tabNumber' && c.visible)
  const isSWFile = ['.sldprt', '.sldasm'].includes(file.extension?.toLowerCase() || '')
  // Show inline tab when: SW file, Tab column NOT visible, file is editable
  // Keep showing even when configs are expanded (file-level tab is separate from config tabs)
  const showInlineTab = isSWFile && !isTabColumnVisible && isFileEditable(file)
  
  // Local state for generation and inline tab editing
  const [isGenerating, setIsGenerating] = useState(false)
  const [localTabValue, setLocalTabValue] = useState(file.pendingMetadata?.tab_number ?? '')
  
  // Confirmation state for inline BR number generation
  const [confirmingGenerate, setConfirmingGenerate] = useState(false)
  const [previewNumber, setPreviewNumber] = useState<string | null>(null)
  const confirmContainerRef = useRef<HTMLDivElement>(null)
  
  // Click-outside handler to cancel confirmation
  useEffect(() => {
    if (!confirmingGenerate) return
    
    const handleClickOutside = (e: MouseEvent) => {
      if (confirmContainerRef.current && !confirmContainerRef.current.contains(e.target as Node)) {
        setConfirmingGenerate(false)
        setPreviewNumber(null)
      }
    }
    
    // Use timeout to avoid immediate trigger from the click that opened confirmation
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [confirmingGenerate])
  
  if (file.isDirectory) return ''
  
  // Drawing files can have their item number locked via settings
  const isDrawing = file.extension?.toLowerCase() === '.slddrw'
  const isDrawingLocked = isDrawing && lockDrawingItemNumber
  const canEditItemNumber = isFileEditable(file) && !isDrawingLocked
  const isEditingItemNumber = editingCell?.path === file.path && editingCell?.column === 'itemNumber'
  
  // Handle starting confirmation flow for BR number generation (from hover button)
  const handleStartConfirm = async () => {
    if (!organization?.id) {
      addToast('error', 'No organization connected')
      return
    }
    
    try {
      const preview = await previewNextSerialNumber(organization.id)
      if (!preview) {
        addToast('error', 'Serialization is disabled or failed')
        return
      }
      setPreviewNumber(preview)
      setConfirmingGenerate(true)
    } catch (err) {
      addToast('error', `Failed to preview serial: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  
  // Handle confirming the BR number generation
  const handleConfirmGenerate = async () => {
    setConfirmingGenerate(false)
    setPreviewNumber(null)
    await handleGenerateSerial(true)
  }
  
  // Handle inline tab number change (when Tab column is hidden)
  const handleInlineTabChange = (value: string) => {
    const upperValue = value.toUpperCase()
    setLocalTabValue(upperValue)
    updatePendingMetadata(file.path, { tab_number: upperValue || null })
  }
  
  // Handle generating a serial number for item number - auto-saves immediately
  // Works for both synced files (checked out) and unsynced local files
  const handleGenerateSerial = async (fromHover?: boolean) => {
    if (!organization?.id) {
      addToast('error', 'No organization connected')
      return
    }
    
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
      
      // Show the generated number immediately in the input (if editing)
      if (!fromHover) {
        setEditValue(serial)
      }
      
      // Update pending metadata in store
      updatePendingMetadata(file.path, { part_number: serial })
      
      // Now start the save operation (this is what takes time)
      setIsGenerating(true)
      
      // Auto-save to SolidWorks file
      const ext = file.extension?.toLowerCase() || ''
      if (['.sldprt', '.sldasm', '.slddrw'].includes(ext)) {
        const updatedFile = { ...file, pendingMetadata: { ...file.pendingMetadata, part_number: serial } }
        await saveConfigsToSWFile(updatedFile)
      } else {
        addToast('success', `Generated: ${serial}`)
      }
      
      // Exit edit mode after successful save
      handleCancelCellEdit()
    } catch (err) {
      addToast('error', `Failed to generate serial: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsGenerating(false)
    }
  }
  
  // Prioritize pendingMetadata over pdmData - pending edits should always show
  const displayValue = file.pendingMetadata?.part_number !== undefined 
    ? (file.pendingMetadata.part_number ?? '-') 
    : (file.pdmData?.part_number || '-')
  const hasValue = displayValue !== '-'
  
  if (isEditingItemNumber && canEditItemNumber) {
    return (
      <div className="flex items-center gap-1">
        {/* Base number input with generate button inside - sized to content */}
        <div className="relative inline-flex min-w-[60px]">
          <input
            ref={inlineEditInputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSaveCellEdit()
              } else if (e.key === 'Escape') {
                handleCancelCellEdit()
              }
              e.stopPropagation()
            }}
            onBlur={(e) => {
              // Don't save on blur if clicking the generate button or tab input
              const relatedTarget = e.relatedTarget as HTMLElement | null
              if (relatedTarget?.dataset?.generateBtn || relatedTarget?.dataset?.tabInput) return
              handleSaveCellEdit()
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => e.preventDefault()}
            draggable={false}
            disabled={isGenerating}
            size={Math.max(editValue.length || 6, 6)}
            className="bg-plm-bg border border-plm-accent rounded pl-1 pr-8 py-0 text-sm text-plm-fg focus:outline-none focus:ring-1 focus:ring-plm-accent disabled:opacity-50"
          />
          <button
            data-generate-btn="true"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              handleGenerateSerial()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={isGenerating}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-plm-fg-muted hover:text-plm-accent hover:bg-plm-accent/20 disabled:opacity-50 transition-colors"
            title="Generate next serial number"
          >
            {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          </button>
        </div>
        {/* Tab number input (when Tab column is hidden) */}
        {showInlineTab && (
          <>
            <span className="text-plm-fg-dim text-sm shrink-0">-</span>
            <input
              data-tab-input="true"
              type="text"
              value={localTabValue}
              onChange={(e) => handleInlineTabChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveCellEdit()
                else if (e.key === 'Escape') handleCancelCellEdit()
                e.stopPropagation()
              }}
              placeholder="Tab"
              className="w-12 shrink-0 bg-plm-bg/30 border border-plm-border/20 rounded px-1 py-0 text-sm text-plm-fg-muted text-center focus:outline-none focus:bg-plm-bg focus:border-plm-accent focus:text-plm-fg focus:ring-1 focus:ring-plm-accent"
            />
          </>
        )}
      </div>
    )
  }
  
  // Get appropriate tooltip
  const getTooltip = () => {
    if (isDrawingLocked) return 'Drawing item number is inherited from the referenced model'
    if (canEditItemNumber) return 'Click to edit'
    if (file.pdmData?.id) return 'Check out file to edit'
    return 'Sign in to edit'
  }
  
  return (
    <div 
      className="group/cell flex items-center h-full gap-1"
      onMouseDown={(e) => {
        // Stop mousedown from triggering row drag or file focus
        e.stopPropagation()
      }}
      onDragStart={(e) => {
        // Prevent row drag when user is trying to select text
        e.preventDefault()
        e.stopPropagation()
      }}
      draggable={false}
      title={getTooltip()}
    >
      {/* Base number with generate button and inline confirmation */}
      <div 
        ref={confirmContainerRef}
        className="flex items-center"
      >
        {/* Main item number box */}
        <div 
          className={`relative inline-flex items-center min-w-[60px] rounded-l pl-1 pr-8 py-0 ${canEditItemNumber ? 'cursor-text border border-transparent group-hover/cell:border-plm-border/50 group-hover/cell:bg-plm-bg' : ''} ${confirmingGenerate ? 'border-plm-accent/50 bg-plm-bg rounded-l rounded-r-none' : 'rounded'}`}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            if (canEditItemNumber && !confirmingGenerate) {
              handleStartCellEdit(file, 'itemNumber')
            }
          }}
        >
          <span className={`text-sm ${!hasValue || !canEditItemNumber ? 'text-plm-fg-muted' : ''}`}>
            {displayValue}
          </span>
          {canEditItemNumber && !confirmingGenerate && (
            <button
              data-generate-btn="true"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                handleStartConfirm()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isGenerating}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-100 p-0.5 rounded text-plm-fg-muted hover:text-plm-accent hover:bg-plm-accent/20 disabled:opacity-50 transition-all"
              title="Generate next serial number"
            >
              {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            </button>
          )}
          {isDrawingLocked && <FileInput size={12} className="ml-1 text-plm-fg-muted/50 flex-shrink-0" />}
        </div>
        
        {/* Inline confirmation expansion */}
        <div 
          className={`flex items-center gap-1.5 overflow-hidden transition-all duration-200 ease-out ${
            confirmingGenerate 
              ? 'max-w-[200px] opacity-100 pl-2 pr-1.5 py-0.5 border border-l-0 border-plm-accent/50 bg-plm-bg rounded-r' 
              : 'max-w-0 opacity-0'
          }`}
        >
          <span className="text-plm-fg-muted text-xs whitespace-nowrap">→</span>
          <span className="text-sm text-plm-accent font-medium whitespace-nowrap">{previewNumber}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              handleConfirmGenerate()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={isGenerating}
            className="p-1 rounded bg-plm-accent/20 text-plm-accent hover:bg-plm-accent/30 disabled:opacity-50 transition-colors"
            title="Confirm generation"
          >
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
        </div>
      </div>
      {/* Tab number input (when Tab column is hidden) - subtle styling to match item number */}
      {showInlineTab && (
        <>
          <span className="text-plm-fg-dim text-sm shrink-0">-</span>
          <input
            data-tab-input="true"
            type="text"
            value={localTabValue}
            onChange={(e) => handleInlineTabChange(e.target.value)}
            onClick={(e) => {
              e.stopPropagation()
              // Start edit mode when clicking tab input
              if (canEditItemNumber && !isEditingItemNumber) {
                handleStartCellEdit(file, 'itemNumber')
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Tab"
            className="w-12 shrink-0 bg-transparent border border-transparent rounded px-1 py-0 text-sm text-plm-fg-muted text-center hover:border-plm-border/30 hover:bg-plm-bg/30 focus:outline-none focus:bg-plm-bg focus:border-plm-accent focus:text-plm-fg focus:ring-1 focus:ring-plm-accent"
          />
        </>
      )}
    </div>
  )
}
