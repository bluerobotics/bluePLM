// Workflow Context Menu Component - Right-click menu for states, transitions, and canvas
import { useState, useRef, useEffect } from 'react'
import { Plus, Edit3, Trash2, X, ArrowRight } from 'lucide-react'
import type { WorkflowState, WorkflowTransition, WorkflowGate } from '@/types/workflow'

interface WorkflowContextMenuProps {
  x: number
  y: number
  type: 'state' | 'transition' | 'canvas'
  isAdmin: boolean
  targetState?: WorkflowState
  targetTransition?: WorkflowTransition
  gates: WorkflowGate[]
  allStates: WorkflowState[]
  hasWaypoints?: boolean
  onEdit: () => void
  onDelete: () => void
  onAddGate: () => void
  onResetWaypoints?: () => void
  onAddState?: () => void
  onClose: () => void
}

export function WorkflowContextMenu({ 
  x, 
  y, 
  type, 
  isAdmin, 
  targetState, 
  targetTransition,
  gates,
  allStates,
  hasWaypoints,
  onEdit, 
  onDelete, 
  onAddGate: _onAddGate,
  onResetWaypoints,
  onAddState,
  onClose 
}: WorkflowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    
    // Close on escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])
  
  // Adjust position to keep menu on screen
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null)
  
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      let newX = x
      let newY = y
      
      if (x + rect.width > window.innerWidth) {
        newX = window.innerWidth - rect.width - 8
      }
      if (y + rect.height > window.innerHeight) {
        newY = window.innerHeight - rect.height - 8
      }
      
      setAdjustedPos({ x: newX, y: newY })
    }
  }, [x, y])
  
  const fromState = targetTransition ? allStates.find(s => s.id === targetTransition.from_state_id) : null
  const toState = targetTransition ? allStates.find(s => s.id === targetTransition.to_state_id) : null
  
  return (
    <div
      ref={menuRef}
      className={`fixed bg-plm-sidebar border border-plm-border rounded-lg shadow-xl py-1 min-w-[200px] z-50 transition-opacity duration-75 ${
        adjustedPos ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ left: adjustedPos?.x ?? x, top: adjustedPos?.y ?? y }}
    >
      {/* Header showing what's selected (hidden for canvas) */}
      {type !== 'canvas' && (
        <div className="px-3 py-2 border-b border-plm-border">
          {type === 'state' && targetState && (
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded flex items-center justify-center"
                style={{ backgroundColor: targetState.color }}
              />
              <span className="text-sm font-medium">{targetState.label || targetState.name}</span>
              <span className="text-xs text-plm-fg-muted">({targetState.is_editable ? 'Editable' : 'Locked'})</span>
            </div>
          )}
          {type === 'transition' && targetTransition && (
            <div>
              <div className="text-sm font-medium mb-1">{targetTransition.name || 'Unnamed transition'}</div>
              <div className="flex items-center gap-1.5 text-xs text-plm-fg-muted">
                <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: (fromState?.color || '#666') + '40' }}>
                  {fromState?.name || '?'}
                </span>
                <ArrowRight size={10} />
                <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: (toState?.color || '#666') + '40' }}>
                  {toState?.name || '?'}
                </span>
              </div>
              {gates.length > 0 && (
                <div className="mt-1 text-xs text-amber-400">
                  {gates.length} gate{gates.length > 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Menu items */}
      <div className="py-1">
        {type === 'canvas' && isAdmin && onAddState && (
          <button
            onClick={onAddState}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-plm-highlight transition-colors"
          >
            <Plus size={14} />
            New State
          </button>
        )}
        
        {type !== 'canvas' && (
          <button
            onClick={onEdit}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-plm-highlight transition-colors"
          >
            <Edit3 size={14} />
            Edit {type === 'state' ? 'State' : 'Transition'}...
          </button>
        )}
        
        {type === 'transition' && isAdmin && hasWaypoints && onResetWaypoints && (
          <button
            onClick={onResetWaypoints}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-plm-highlight transition-colors text-plm-fg-muted"
          >
            <X size={14} />
            Reset Control Points
          </button>
        )}
        
        {isAdmin && type !== 'canvas' && (
          <>
            <div className="my-1 border-t border-plm-border" />
            <button
              onClick={onDelete}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-plm-error/20 text-plm-error transition-colors"
            >
              <Trash2 size={14} />
              Delete {type === 'state' ? 'State' : 'Transition'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
