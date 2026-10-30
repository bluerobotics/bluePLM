/**
 * useKeyboardNav - the file pane's keyboard shortcuts and type-ahead.
 *
 * The shortcuts are the registry's `filePane.*` actions (`src/lib/keybindings/registry.ts`), with
 * the user's keys: arrows move the selection (Shift extends it) and step into or out of folders,
 * Enter opens, Ctrl+A/C/X/V select, copy, cut and paste, Ctrl+Z undoes, F2 renames, Delete deletes,
 * Escape clears the selection, Ctrl+P toggles details, Ctrl+R refreshes and Ctrl+Shift+P/S export.
 * They are ignored while typing in a field and while a modal dialog is open. Clipboard keys pass
 * through to the browser in the details panel or when text is selected.
 *
 * Type-ahead (jump to an item by typing its name) is not a shortcut and keeps its own listener.
 */
import { useEffect, useCallback, useRef } from 'react'
import { usePDMStore, type LocalFile } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'
import { useShortcuts, wasHandledByShortcut, type ShortcutActionId } from '@/lib/keybindings'
import { quickExport } from '../exports/quickExport'
import type { SelectableRow } from '../components/FileList/rowTypes'

/** How long a typed character stays in the type-ahead buffer before the next key starts fresh */
const TYPEAHEAD_RESET_MS = 600

/** Actions whose keys belong to the browser in the details panel or over selected text. */
const CLIPBOARD_ACTIONS: ReadonlySet<ShortcutActionId> = new Set<ShortcutActionId>([
  'filePane.copy',
  'filePane.cut',
  'filePane.paste',
  'filePane.undo',
  'filePane.selectAll',
])

/** Lets native copy, paste, cut, undo and select all work in the details panel or on selected text. */
function allowsFilePaneShortcut(e: KeyboardEvent, actionId: ShortcutActionId): boolean {
  if (!CLIPBOARD_ACTIONS.has(actionId)) return true
  const inDetailsPanel = (e.target as HTMLElement | null)?.closest?.(
    '.details-panel, .sw-preview-panel, [data-allow-clipboard]',
  )
  return !inDetailsPanel && !window.getSelection()?.toString()
}

export interface UseKeyboardNavOptions {
  files: LocalFile[]
  /** Every selectable row in visual order, including resolved configuration drawings */
  selectableRows: SelectableRow[]
  /** The sorted/filtered top-level files used by Select All */
  topLevelFiles: LocalFile[]
  selectedFiles: string[]
  setSelectedFiles: (paths: string[]) => void
  lastClickedIndex: number | null
  setLastClickedIndex: (index: number | null) => void
  /** Scrolls a row into view after type-ahead jumps to a distant match */
  setPendingScrollToFile: (path: string | null) => void
  currentPath: string
  vaultPath: string | null
  clipboard: { files: LocalFile[]; operation: 'copy' | 'cut' } | null
  setClipboard: (clipboard: { files: LocalFile[]; operation: 'copy' | 'cut' } | null) => void
  navigateToFolder: (path: string) => void
  navigateUp: () => void
  handleCopy: () => void
  handleCut: () => void
  handlePaste: () => void
  handleUndo: () => void
  clearSelection: () => void
  toggleDetailsPanel: () => void
  startRenaming?: (file: LocalFile) => void
  onRefresh?: (silent?: boolean) => void
}

export function useKeyboardNav({
  files,
  selectableRows,
  topLevelFiles,
  selectedFiles,
  setSelectedFiles,
  lastClickedIndex,
  setLastClickedIndex,
  setPendingScrollToFile,
  currentPath,
  clipboard: _clipboard,
  setClipboard,
  navigateToFolder,
  navigateUp,
  handleCopy,
  handleCut,
  handlePaste,
  handleUndo,
  clearSelection,
  toggleDetailsPanel,
  startRenaming,
  onRefresh,
}: UseKeyboardNavOptions): void {
  const selectedRow = (): LocalFile | null =>
    selectedFiles.length === 1
      ? (selectableRows.find((row) => row.path === selectedFiles[0])?.file ?? null)
      : null

  const moveSelection = (e: KeyboardEvent, isUp: boolean) => {
    if (selectableRows.length === 0) return

    // The keyboard cursor: the last item in the selection when extending, or the only one
    const focusIndex =
      selectedFiles.length > 0
        ? lastClickedIndex !== null &&
          selectableRows[lastClickedIndex]?.path === selectedFiles[selectedFiles.length - 1]
          ? lastClickedIndex
          : selectableRows.findIndex((row) => row.path === selectedFiles[selectedFiles.length - 1])
        : -1

    // Selection not in view: select the first or last row by direction
    if (focusIndex === -1) {
      const newIndex = isUp ? selectableRows.length - 1 : 0
      setSelectedFiles([selectableRows[newIndex].path])
      setLastClickedIndex(newIndex)
      return
    }

    const newIndex = isUp
      ? Math.max(0, focusIndex - 1)
      : Math.min(selectableRows.length - 1, focusIndex + 1)
    if (newIndex === focusIndex) return

    if (e.shiftKey) {
      // Shift held: extend the selection from the anchor (lastClickedIndex) to the new row
      const anchorIndex = lastClickedIndex ?? focusIndex
      const start = Math.min(anchorIndex, newIndex)
      const end = Math.max(anchorIndex, newIndex)
      setSelectedFiles([...new Set(selectableRows.slice(start, end + 1).map((row) => row.path))])
      // lastClickedIndex stays: it is the anchor
    } else {
      setSelectedFiles([selectableRows[newIndex].path])
      setLastClickedIndex(newIndex)
    }
  }

  const quickExportSelection = (kind: 'pdf' | 'step') => {
    const selected = new Set(selectedFiles)
    quickExport(
      kind,
      selectableRows.filter((row) => selected.has(row.path)).map((row) => row.file),
    )
  }

  useShortcuts(
    'filePane',
    {
      'filePane.navigateUp': (e) => moveSelection(e, true),
      'filePane.navigateDown': (e) => moveSelection(e, false),

      // Step into the selected folder
      'filePane.expandFolder': () => {
        const selectedFile = selectedRow()
        if (!selectedFile?.isDirectory) return false
        navigateToFolder(selectedFile.relativePath)
        return true
      },

      // Step up to the parent folder. Search results are not a folder, so there is no parent to
      // go up to: going up would leave search for the folder above the one searched in.
      'filePane.collapseFolder': () => {
        if (!currentPath || usePDMStore.getState().searchQuery.trim()) return false
        navigateUp()
        return true
      },

      // Open the selected file, or step into the selected folder
      'filePane.openFile': () => {
        const selectedFile = selectedRow()
        if (!selectedFile) return

        if (selectedFile.isDirectory) {
          navigateToFolder(selectedFile.relativePath)
        } else if (selectedFile.diffStatus === 'cloud') {
          // Cloud-only file: download first, then open
          executeCommand('download', { files: [selectedFile] }, { onRefresh, silent: true }).then(
            (result) => {
              if (result.success && window.electronAPI) {
                window.electronAPI.openFile(selectedFile.path)
              }
            },
          )
        } else if (window.electronAPI) {
          window.electronAPI.openFile(selectedFile.path)
        }
      },

      'filePane.selectAll': () => setSelectedFiles(topLevelFiles.map((file) => file.path)),
      'filePane.copy': () => handleCopy(),
      'filePane.cut': () => handleCut(),
      'filePane.paste': () => handlePaste(),
      // File operations only, never text editing (fields are skipped by the dispatcher)
      'filePane.undo': () => handleUndo(),

      'filePane.rename': () => {
        const selectedFile = selectedRow()
        // A 'moved_away' stub has no local file behind it at its own path - nothing to rename.
        if (!startRenaming || !selectedFile || selectedFile.diffStatus === 'moved_away') return false
        startRenaming(selectedFile)
        return true
      },

      // The delete-local command handles confirmation internally if needed
      'filePane.delete': () => {
        if (selectedFiles.length === 0) return false
        const selectedItems = files.filter((file) => selectedFiles.includes(file.path))
        executeCommand('delete-local', { files: selectedItems }, { onRefresh })
        return true
      },

      'filePane.clearSelection': () => {
        clearSelection()
        setClipboard(null)
      },
      'filePane.toggleDetailsPanel': () => toggleDetailsPanel(),
      'filePane.refresh': () => {
        onRefresh?.()
      },
      // Queue the selection for PDF or STEP export to the quick export folder
      'filePane.exportPdf': () => quickExportSelection('pdf'),
      'filePane.exportStep': () => quickExportSelection('step'),
    },
    { isActive: allowsFilePaneShortcut, blockedByModal: true },
  )

  // Type-ahead ("jump to item by typing") buffer, Windows Explorer style. Typing letters in
  // quick succession builds a prefix ("re" -> first item starting with "re"); repeating the same
  // letter cycles through items that start with it.
  const typeAheadBufferRef = useRef('')
  const typeAheadTimeRef = useRef(0)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // A shortcut bound to the letter wins
      if (e.defaultPrevented || wasHandledByShortcut(e)) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // Scope it to the file pane. The listener is on window, so without this a letter typed
      // while focus is on a <select>, an editable area, the tree, the details panel or behind a
      // modal would move the file selection (and cancel the key's normal action, breaking letter
      // navigation inside a <select>). The pane container is focusable (tabIndex=-1), so clicking
      // anywhere in it lands focus inside; we require focus to be inside the pane rather than
      // allowing document.body, because our modals are plain overlay <div>s (no [role="dialog"])
      // and clicking a non-focusable element in one leaves focus on the body.
      const typeAheadTarget = e.target as HTMLElement | null
      const isTypeAheadContext =
        !!typeAheadTarget?.closest?.('[data-file-pane]') &&
        !(typeAheadTarget instanceof HTMLSelectElement) &&
        !typeAheadTarget.isContentEditable

      if (
        !isTypeAheadContext ||
        e.key.length !== 1 ||
        e.key === ' ' ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        selectableRows.length === 0
      ) {
        return
      }

      const char = e.key.toLowerCase()
      const now = Date.now()
      const withinWindow = now - typeAheadTimeRef.current < TYPEAHEAD_RESET_MS
      typeAheadTimeRef.current = now

      const buffer = withinWindow ? typeAheadBufferRef.current + char : char
      typeAheadBufferRef.current = buffer

      // Repeating one letter ("c", "cc", ...) cycles through items starting with it; a real
      // multi-character prefix ("ca") jumps to the first match from the top.
      const isSingleLetterCycle = buffer.split('').every((c) => c === buffer[0])
      const prefix = isSingleLetterCycle ? buffer[0] : buffer

      const currentIndex =
        selectedFiles.length > 0
          ? selectableRows.findIndex((row) => row.path === selectedFiles[selectedFiles.length - 1])
          : -1
      const startIndex = isSingleLetterCycle ? currentIndex + 1 : 0

      let matchIndex = -1
      for (let i = 0; i < selectableRows.length; i++) {
        const idx = (startIndex + i) % selectableRows.length
        if (selectableRows[idx].file.name.toLowerCase().startsWith(prefix)) {
          matchIndex = idx
          break
        }
      }

      if (matchIndex >= 0) {
        e.preventDefault()
        e.stopPropagation()
        setSelectedFiles([selectableRows[matchIndex].path])
        setLastClickedIndex(matchIndex)
        setPendingScrollToFile(selectableRows[matchIndex].path)
      }
    },
    [selectableRows, selectedFiles, setSelectedFiles, setLastClickedIndex, setPendingScrollToFile],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
