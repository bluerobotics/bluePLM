import { memo, useState, useRef, useEffect } from 'react'
import { Settings2, Eye, EyeOff, RotateCcw, GripVertical } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useTranslation } from '@/lib/i18n'
import { COLUMN_TRANSLATION_KEYS } from '../../types'

/**
 * Popover for configuring which metadata fields appear on cards in icon/grid view
 */
export const CardViewFieldsPopover = memo(function CardViewFieldsPopover() {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  
  const cardViewFields = usePDMStore(state => state.cardViewFields)
  const toggleCardViewFieldVisibility = usePDMStore(state => state.toggleCardViewFieldVisibility)
  const reorderCardViewFields = usePDMStore(state => state.reorderCardViewFields)
  const resetCardViewFieldsToDefaults = usePDMStore(state => state.resetCardViewFieldsToDefaults)
  
  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  
  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return
    
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])
  
  // Get translated label for a field
  const getFieldLabel = (fieldId: string): string => {
    const translationKey = COLUMN_TRANSLATION_KEYS[fieldId]
    if (translationKey) {
      return t(translationKey)
    }
    // Fallback to the field's stored label
    const field = cardViewFields.find(f => f.id === fieldId)
    return field?.label || fieldId
  }
  
  // Handle drag start
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }
  
  // Handle drag over
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }
  
  // Handle drop
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      const newFields = [...cardViewFields]
      const [removed] = newFields.splice(draggedIndex, 1)
      newFields.splice(dropIndex, 0, removed)
      reorderCardViewFields(newFields)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }
  
  // Handle drag end
  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }
  
  const visibleCount = cardViewFields.filter(f => f.visible).length
  
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`btn btn-ghost btn-sm p-1 ${isOpen ? 'bg-plm-accent/20 text-plm-accent' : ''}`}
        title="Configure card fields"
      >
        <Settings2 size={14} />
      </button>
      
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full right-0 mt-1 z-50 bg-plm-bg-lighter border border-plm-border rounded-lg shadow-xl min-w-[240px] overflow-hidden"
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-plm-border bg-plm-bg-light/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-plm-fg">Card Fields</span>
              <span className="text-xs text-plm-fg-muted">{visibleCount} visible</span>
            </div>
            <p className="text-xs text-plm-fg-muted mt-0.5">
              Drag to reorder, click to toggle
            </p>
          </div>
          
          {/* Field list */}
          <div className="max-h-72 overflow-y-auto py-1">
            {cardViewFields.map((field, index) => (
              <div
                key={field.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => toggleCardViewFieldVisibility(field.id)}
                className={`
                  flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none
                  transition-colors duration-100
                  ${dragOverIndex === index ? 'bg-plm-accent/20' : 'hover:bg-plm-bg-light'}
                  ${draggedIndex === index ? 'opacity-50' : ''}
                `}
              >
                <GripVertical 
                  size={12} 
                  className="text-plm-fg-muted cursor-grab flex-shrink-0" 
                />
                {field.visible ? (
                  <Eye size={14} className="text-plm-success flex-shrink-0" />
                ) : (
                  <EyeOff size={14} className="text-plm-fg-muted flex-shrink-0" />
                )}
                <span className={`text-sm ${field.visible ? 'text-plm-fg' : 'text-plm-fg-muted'}`}>
                  {getFieldLabel(field.id)}
                </span>
              </div>
            ))}
          </div>
          
          {/* Footer with reset button */}
          <div className="px-3 py-2 border-t border-plm-border bg-plm-bg-light/50">
            <button
              onClick={(e) => {
                e.stopPropagation()
                resetCardViewFieldsToDefaults()
              }}
              className="flex items-center gap-1.5 text-xs text-plm-fg-muted hover:text-plm-fg transition-colors"
            >
              <RotateCcw size={12} />
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
