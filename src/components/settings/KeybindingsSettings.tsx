import { useState, useCallback, useEffect, useRef } from 'react'
import { Keyboard, RotateCcw, Edit3, Check, X, Info } from 'lucide-react'
import { usePDMStore } from '../../stores/pdmStore'
import type { KeybindingAction, Keybinding } from '../../types/settings'

// Keybinding action definitions with labels and descriptions
const keybindingDefinitions: { action: KeybindingAction; label: string; description: string; category: string }[] = [
  // Navigation
  { action: 'navigateUp', label: 'Navigate Up', description: 'Move selection to previous file/folder', category: 'Navigation' },
  { action: 'navigateDown', label: 'Navigate Down', description: 'Move selection to next file/folder', category: 'Navigation' },
  { action: 'expandFolder', label: 'Expand Folder', description: 'Expand selected folder or navigate into it', category: 'Navigation' },
  { action: 'collapseFolder', label: 'Collapse Folder', description: 'Collapse selected folder or navigate to parent', category: 'Navigation' },
  { action: 'openFile', label: 'Open File', description: 'Open the selected file or expand folder', category: 'Navigation' },
  
  // Editing
  { action: 'selectAll', label: 'Select All', description: 'Select all files in the current folder', category: 'Editing' },
  { action: 'copy', label: 'Copy', description: 'Copy selected files to clipboard', category: 'Editing' },
  { action: 'cut', label: 'Cut', description: 'Cut selected files to clipboard', category: 'Editing' },
  { action: 'paste', label: 'Paste', description: 'Paste files from clipboard', category: 'Editing' },
  { action: 'delete', label: 'Delete', description: 'Delete selected files', category: 'Editing' },
  
  // General
  { action: 'escape', label: 'Escape', description: 'Clear selection and cancel operations', category: 'General' },
  { action: 'toggleDetailsPanel', label: 'Toggle Details', description: 'Show/hide the details panel', category: 'General' },
  { action: 'refresh', label: 'Refresh', description: 'Refresh the file list', category: 'General' },
]

// Helper to format a keybinding for display
function formatKeybinding(keybinding: Keybinding): string {
  const parts: string[] = []
  if (keybinding.ctrlKey) parts.push('Ctrl')
  if (keybinding.altKey) parts.push('Alt')
  if (keybinding.shiftKey) parts.push('Shift')
  if (keybinding.metaKey) parts.push('⌘')
  
  // Format the key nicely
  let keyDisplay = keybinding.key
  switch (keybinding.key) {
    case 'ArrowUp': keyDisplay = '↑'; break
    case 'ArrowDown': keyDisplay = '↓'; break
    case 'ArrowLeft': keyDisplay = '←'; break
    case 'ArrowRight': keyDisplay = '→'; break
    case 'Escape': keyDisplay = 'Esc'; break
    case 'Delete': keyDisplay = 'Del'; break
    case 'Backspace': keyDisplay = '⌫'; break
    case 'Enter': keyDisplay = '↵'; break
    case 'Tab': keyDisplay = 'Tab'; break
    case ' ': keyDisplay = 'Space'; break
    default:
      if (keybinding.key.length === 1) {
        keyDisplay = keybinding.key.toUpperCase()
      }
  }
  
  parts.push(keyDisplay)
  return parts.join(' + ')
}

// Parse a keyboard event into a Keybinding
function eventToKeybinding(e: KeyboardEvent): Keybinding {
  return {
    key: e.key,
    ctrlKey: e.ctrlKey || undefined,
    altKey: e.altKey || undefined,
    shiftKey: e.shiftKey || undefined,
    metaKey: e.metaKey || undefined,
  }
}

interface KeybindingRowProps {
  action: KeybindingAction
  label: string
  description: string
  keybinding: Keybinding
  onEdit: (action: KeybindingAction) => void
  isEditing: boolean
  onSave: (keybinding: Keybinding) => void
  onCancel: () => void
}

function KeybindingRow({ action, label, description, keybinding, onEdit, isEditing, onSave, onCancel }: KeybindingRowProps) {
  const inputRef = useRef<HTMLButtonElement>(null)
  const [pendingKeybinding, setPendingKeybinding] = useState<Keybinding | null>(null)
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])
  
  useEffect(() => {
    if (!isEditing) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      // Ignore modifier-only keys
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        return
      }
      
      const newKeybinding = eventToKeybinding(e)
      setPendingKeybinding(newKeybinding)
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isEditing])
  
  const handleSave = () => {
    if (pendingKeybinding) {
      onSave(pendingKeybinding)
      setPendingKeybinding(null)
    }
  }
  
  const handleCancel = () => {
    setPendingKeybinding(null)
    onCancel()
  }
  
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-plm-bg-light transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-plm-fg">{label}</div>
        <div className="text-xs text-plm-fg-muted truncate">{description}</div>
      </div>
      
      <div className="flex items-center gap-2 ml-4">
        {isEditing ? (
          <>
            <button
              ref={inputRef}
              className="px-3 py-1.5 bg-plm-accent/20 border border-plm-accent rounded text-sm font-mono text-plm-accent min-w-[120px] text-center focus:outline-none focus:ring-2 focus:ring-plm-accent"
            >
              {pendingKeybinding ? formatKeybinding(pendingKeybinding) : 'Press keys...'}
            </button>
            <button
              onClick={handleSave}
              disabled={!pendingKeybinding}
              className="p-1.5 rounded hover:bg-plm-success/20 text-plm-success disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Save"
            >
              <Check size={16} />
            </button>
            <button
              onClick={handleCancel}
              className="p-1.5 rounded hover:bg-plm-error/20 text-plm-error transition-colors"
              title="Cancel"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <div className="px-3 py-1.5 bg-plm-bg border border-plm-border rounded text-sm font-mono text-plm-fg-muted min-w-[120px] text-center">
              {formatKeybinding(keybinding)}
            </div>
            <button
              onClick={() => onEdit(action)}
              className="p-1.5 rounded hover:bg-plm-bg text-plm-fg-muted hover:text-plm-fg transition-colors opacity-0 group-hover:opacity-100"
              title="Edit keybinding"
            >
              <Edit3 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function KeybindingsSettings() {
  const { keybindings, setKeybinding, resetKeybindings, addToast } = usePDMStore()
  const [editingAction, setEditingAction] = useState<KeybindingAction | null>(null)
  
  const handleEdit = useCallback((action: KeybindingAction) => {
    setEditingAction(action)
  }, [])
  
  const handleSave = useCallback((action: KeybindingAction, keybinding: Keybinding) => {
    setKeybinding(action, keybinding)
    setEditingAction(null)
    addToast('success', 'Keybinding updated')
  }, [setKeybinding, addToast])
  
  const handleCancel = useCallback(() => {
    setEditingAction(null)
  }, [])
  
  const handleResetAll = useCallback(() => {
    resetKeybindings()
    addToast('info', 'Keybindings reset to defaults')
  }, [resetKeybindings, addToast])
  
  // Group keybindings by category
  const categories = ['Navigation', 'Editing', 'General']
  const keybindingsByCategory = categories.map(category => ({
    category,
    items: keybindingDefinitions.filter(k => k.category === category),
  }))
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-plm-accent/10 rounded-lg">
            <Keyboard size={20} className="text-plm-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-plm-fg">Keyboard Shortcuts</h2>
            <p className="text-sm text-plm-fg-muted">Customize keyboard shortcuts for file navigation and actions</p>
          </div>
        </div>
        
        <button
          onClick={handleResetAll}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light transition-colors"
        >
          <RotateCcw size={14} />
          Reset to Defaults
        </button>
      </div>
      
      {/* Info box */}
      <div className="flex items-start gap-3 p-3 bg-plm-info/10 border border-plm-info/20 rounded-lg">
        <Info size={16} className="text-plm-info flex-shrink-0 mt-0.5" />
        <div className="text-sm text-plm-fg-muted">
          <p>Click the edit button next to any shortcut to change it. Press the new key combination and click the checkmark to save.</p>
          <p className="mt-1">Shortcuts work when the file browser is focused.</p>
        </div>
      </div>
      
      {/* Keybinding sections */}
      <div className="space-y-6">
        {keybindingsByCategory.map(({ category, items }) => (
          <div key={category} className="space-y-1">
            <h3 className="text-xs font-mono uppercase text-plm-fg-muted/60 px-3 mb-2">{category}</h3>
            <div className="bg-plm-bg-light rounded-lg border border-plm-border divide-y divide-plm-border/50">
              {items.map(({ action, label, description }) => (
                <KeybindingRow
                  key={action}
                  action={action}
                  label={label}
                  description={description}
                  keybinding={keybindings[action]}
                  onEdit={handleEdit}
                  isEditing={editingAction === action}
                  onSave={(kb) => handleSave(action, kb)}
                  onCancel={handleCancel}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

