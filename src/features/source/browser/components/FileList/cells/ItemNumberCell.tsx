/**
 * Item Number column cell renderer
 * 
 * Uses both contexts:
 * - useFilePaneContext() for UI state (editing state, refs)
 * - useFilePaneHandlers() for action handlers
 */
import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useFilePaneContext, useFilePaneHandlers } from '../../../context'
import { usePDMStore } from '@/stores/pdmStore'
import { getNextSerialNumber } from '@/lib/serialization'
import type { CellRendererBaseProps } from './types'

export function ItemNumberCell({ file }: CellRendererBaseProps): React.ReactNode {
  // UI state from FilePaneContext
  const { editingCell, editValue, setEditValue, inlineEditInputRef } = useFilePaneContext()
  
  // Handlers from FilePaneHandlersContext
  const { isFileEditable, handleSaveCellEdit, handleCancelCellEdit, handleStartCellEdit, saveConfigsToSWFile } = useFilePaneHandlers()
  
  // Store selectors for organization, toast, and pending metadata update
  const organization = usePDMStore(s => s.organization)
  const addToast = usePDMStore(s => s.addToast)
  const updatePendingMetadata = usePDMStore(s => s.updatePendingMetadata)
  
  // Local state for generation
  const [isGenerating, setIsGenerating] = useState(false)
  
  if (file.isDirectory) return ''
  
  const canEditItemNumber = isFileEditable(file)
  const isEditingItemNumber = editingCell?.path === file.path && editingCell?.column === 'itemNumber'
  
  // Handle generating a serial number for item number - auto-saves immediately
  const handleGenerateSerial = async (fromHover?: boolean) => {
    if (!organization?.id) {
      addToast('error', 'No organization connected')
      return
    }
    
    if (!file.pdmData?.id) {
      addToast('error', 'File must be synced first')
      return
    }
    
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
      <div className="relative w-full group/input">
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
            // Don't save on blur if clicking the generate button
            const relatedTarget = e.relatedTarget as HTMLElement | null
            if (relatedTarget?.dataset?.generateBtn) return
            handleSaveCellEdit()
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onDragStart={(e) => e.preventDefault()}
          draggable={false}
          disabled={isGenerating}
          className="w-full bg-plm-bg border border-plm-accent rounded pl-1 pr-6 py-0 text-sm text-plm-fg focus:outline-none focus:ring-1 focus:ring-plm-accent disabled:opacity-50"
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
          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-plm-fg-muted hover:text-plm-accent hover:bg-plm-accent/20 disabled:opacity-50 transition-colors"
          title="Generate next serial number"
        >
          {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        </button>
      </div>
    )
  }
  
  return (
    <div 
      className={`group/cell relative flex items-center w-full h-full px-1 rounded ${canEditItemNumber ? 'cursor-text hover:bg-plm-bg-light' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (canEditItemNumber) {
          handleStartCellEdit(file, 'itemNumber')
        }
      }}
      onMouseDown={(e) => {
        // Stop mousedown from triggering row drag or file focus
        e.stopPropagation()
      }}
      title={canEditItemNumber ? 'Click to edit' : 'Check out file to edit'}
    >
      <span className={`flex-1 ${!hasValue || !canEditItemNumber ? 'text-plm-fg-muted' : ''}`}>
        {displayValue}
      </span>
      {canEditItemNumber && (
        <button
          data-generate-btn="true"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            handleGenerateSerial(true)
          }}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={isGenerating}
          className="opacity-0 group-hover/cell:opacity-100 p-0.5 rounded text-plm-fg-muted hover:text-plm-accent hover:bg-plm-accent/20 disabled:opacity-50 transition-all"
          title="Generate next serial number"
        >
          {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        </button>
      )}
    </div>
  )
}
