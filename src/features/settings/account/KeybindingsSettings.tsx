import { useState, useCallback, useEffect, useRef } from 'react'
import { Edit3, Check, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/core/ui'
import { SettingsGroup, SettingsPage, SettingsSection } from '@/features/settings/components/ui'
import { hasDesktop } from '@/lib/platform'
import { usePDMStore } from '@/stores/pdmStore'
import { QuickExportFolderRow } from '@/features/settings/system'
import type { KeybindingAction, Keybinding } from '@/types/settings'

// Keybinding action definitions with labels and descriptions
const keybindingDefinitions: {
  action: KeybindingAction
  label: string
  description: string
  category: string
}[] = [
  // Navigation
  {
    action: 'navigateUp',
    label: 'Navigate Up',
    description: 'Move selection to previous file/folder',
    category: 'Navigation',
  },
  {
    action: 'navigateDown',
    label: 'Navigate Down',
    description: 'Move selection to next file/folder',
    category: 'Navigation',
  },
  {
    action: 'expandFolder',
    label: 'Expand Folder',
    description: 'Expand selected folder or navigate into it',
    category: 'Navigation',
  },
  {
    action: 'collapseFolder',
    label: 'Collapse Folder',
    description: 'Collapse selected folder or navigate to parent',
    category: 'Navigation',
  },
  {
    action: 'openFile',
    label: 'Open File',
    description: 'Open the selected file or expand folder',
    category: 'Navigation',
  },

  // Editing
  {
    action: 'selectAll',
    label: 'Select All',
    description: 'Select all files in the current folder',
    category: 'Editing',
  },
  {
    action: 'copy',
    label: 'Copy',
    description: 'Copy selected files to clipboard',
    category: 'Editing',
  },
  {
    action: 'cut',
    label: 'Cut',
    description: 'Cut selected files to clipboard',
    category: 'Editing',
  },
  {
    action: 'paste',
    label: 'Paste',
    description: 'Paste files from clipboard',
    category: 'Editing',
  },
  { action: 'delete', label: 'Delete', description: 'Delete selected files', category: 'Editing' },

  // General
  {
    action: 'escape',
    label: 'Escape',
    description: 'Clear selection and cancel operations',
    category: 'General',
  },
  {
    action: 'toggleDetailsPanel',
    label: 'Toggle Details',
    description: 'Show/hide the details panel',
    category: 'General',
  },
  {
    action: 'refresh',
    label: 'Refresh',
    description: 'Refresh the file list',
    category: 'General',
  },

  // Export (desktop only: needs SOLIDWORKS)
  {
    action: 'exportPdf',
    label: 'Export PDF',
    description: 'Queue the selected drawings for PDF export to the quick export folder',
    category: 'Export',
  },
  {
    action: 'exportStep',
    label: 'Export STEP',
    description:
      'Queue the selected parts and assemblies, or the models of selected drawings, for STEP export',
    category: 'Export',
  },
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
    case 'ArrowUp':
      keyDisplay = '↑'
      break
    case 'ArrowDown':
      keyDisplay = '↓'
      break
    case 'ArrowLeft':
      keyDisplay = '←'
      break
    case 'ArrowRight':
      keyDisplay = '→'
      break
    case 'Escape':
      keyDisplay = 'Esc'
      break
    case 'Delete':
      keyDisplay = 'Del'
      break
    case 'Backspace':
      keyDisplay = '⌫'
      break
    case 'Enter':
      keyDisplay = '↵'
      break
    case 'Tab':
      keyDisplay = 'Tab'
      break
    case ' ':
      keyDisplay = 'Space'
      break
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

function KeybindingRow({
  action,
  label,
  description,
  keybinding,
  onEdit,
  isEditing,
  onSave,
  onCancel,
}: KeybindingRowProps) {
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
    <div className="group flex items-center justify-between gap-12 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[14px] text-ui-fg">{label}</div>
        <div className="mt-0.5 truncate text-[14px] text-ui-fg-secondary">{description}</div>
      </div>

      <div className="flex items-center gap-1.5">
        {isEditing ? (
          <>
            <button
              ref={inputRef}
              type="button"
              className="h-7 min-w-[120px] rounded-lg border border-ui-accent bg-ui-field px-3 text-center text-[13px] text-ui-fg outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/50"
            >
              {pendingKeybinding ? formatKeybinding(pendingKeybinding) : 'Press keys...'}
            </button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Check size={14} />}
              onClick={handleSave}
              disabled={!pendingKeybinding}
              title="Save"
              aria-label="Save"
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={14} />}
              onClick={handleCancel}
              title="Cancel"
              aria-label="Cancel"
            />
          </>
        ) : (
          <>
            <kbd className="flex h-7 min-w-[120px] items-center justify-center rounded-lg border border-ui-field-border bg-ui-field px-3 font-sans text-[13px] text-ui-fg">
              {formatKeybinding(keybinding)}
            </kbd>
            <Button
              variant="ghost"
              size="sm"
              icon={<Edit3 size={14} />}
              onClick={() => onEdit(action)}
              title="Edit keybinding"
              aria-label={`Edit ${label}`}
              className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
            />
          </>
        )}
      </div>
    </div>
  )
}

export function KeybindingsSettings() {
  const { keybindings, setKeybinding, resetKeybindings, addToast } = usePDMStore(
    useShallow((s) => ({
      keybindings: s.keybindings,
      setKeybinding: s.setKeybinding,
      resetKeybindings: s.resetKeybindings,
      addToast: s.addToast,
    })),
  )
  const [editingAction, setEditingAction] = useState<KeybindingAction | null>(null)

  const handleEdit = useCallback((action: KeybindingAction) => {
    setEditingAction(action)
  }, [])

  const handleSave = useCallback(
    (action: KeybindingAction, keybinding: Keybinding) => {
      setKeybinding(action, keybinding)
      setEditingAction(null)
      addToast('success', 'Keybinding updated')
    },
    [setKeybinding, addToast],
  )

  const handleCancel = useCallback(() => {
    setEditingAction(null)
  }, [])

  const handleResetAll = useCallback(() => {
    resetKeybindings()
    addToast('info', 'Keybindings reset to defaults')
  }, [resetKeybindings, addToast])

  // Group keybindings by category
  const categories = hasDesktop()
    ? ['Navigation', 'Editing', 'General', 'Export']
    : ['Navigation', 'Editing', 'General']
  const keybindingsByCategory = categories.map((category) => ({
    category,
    items: keybindingDefinitions.filter((k) => k.category === category),
  }))

  return (
    <SettingsPage>
      <SettingsSection
        title="Keyboard Shortcuts"
        description="Click the edit button next to any shortcut to change it. Press the new key combination and click the checkmark to save. Shortcuts work when the file browser is focused."
        actions={
          <Button size="sm" onClick={handleResetAll}>
            Reset to Defaults
          </Button>
        }
      >
        {null}
      </SettingsSection>

      {keybindingsByCategory.map(({ category, items }) => (
        <SettingsSection key={category} title={category}>
          <SettingsGroup>
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
            {category === 'Export' && <QuickExportFolderRow />}
          </SettingsGroup>
        </SettingsSection>
      ))}
    </SettingsPage>
  )
}
