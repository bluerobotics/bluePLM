/**
 * FileBrowserHandlersContext - Provides action handlers and computed values
 * 
 * Separated from FileBrowserContext to:
 * 1. Reduce prop drilling through CellRenderer
 * 2. Allow cells to access handlers directly via context
 * 3. Keep UI state separate from action handlers
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

/**
 * Context value type for file browser handlers
 */
export interface FileBrowserHandlersContextValue {
  // Inline action handlers
  handleInlineDownload: (e: React.MouseEvent, file: LocalFile) => void
  handleInlineUpload: (e: React.MouseEvent, file: LocalFile) => void
  handleInlineCheckout: (e: React.MouseEvent, file: LocalFile) => void
  handleInlineCheckin: (e: React.MouseEvent, file: LocalFile) => void
  
  // Computed selection arrays (for multi-select operations)
  selectedDownloadableFiles: LocalFile[]
  selectedUploadableFiles: LocalFile[]
  selectedCheckoutableFiles: LocalFile[]
  selectedCheckinableFiles: LocalFile[]
  selectedUpdatableFiles: LocalFile[]
  
  // Status functions
  isBeingProcessed: (path: string) => boolean
  getFolderCheckoutStatus: (path: string) => 'mine' | 'others' | 'both' | null
  isFolderSynced: (path: string) => boolean
  isFileEditable: (file: LocalFile) => boolean
  
  // Config handlers (SolidWorks configurations)
  canHaveConfigs: (file: LocalFile) => boolean
  toggleFileConfigExpansion: (file: LocalFile) => void
  hasPendingConfigChanges: (file: LocalFile) => boolean
  savingConfigsToSW: Set<string>
  saveConfigsToSWFile: (file: LocalFile) => void
  
  // Edit handlers
  handleRename: () => void
  handleSaveCellEdit: () => void
  handleCancelCellEdit: () => void
  handleStartCellEdit: (file: LocalFile, column: string) => void
}

const FileBrowserHandlersContext = createContext<FileBrowserHandlersContextValue | null>(null)

export interface FileBrowserHandlersProviderProps {
  children: ReactNode
  handlers: FileBrowserHandlersContextValue
}

/**
 * Provider for file browser handlers context
 * Receives handlers from FileBrowser.tsx and provides them to cell components
 */
export function FileBrowserHandlersProvider({ 
  children, 
  handlers 
}: FileBrowserHandlersProviderProps) {
  // Memoize to prevent unnecessary re-renders
  const value = useMemo(() => handlers, [handlers])
  
  return (
    <FileBrowserHandlersContext.Provider value={value}>
      {children}
    </FileBrowserHandlersContext.Provider>
  )
}

/**
 * Hook to access file browser handlers context
 * Must be used within FileBrowserHandlersProvider
 */
export function useFileBrowserHandlers() {
  const context = useContext(FileBrowserHandlersContext)
  if (!context) {
    throw new Error('useFileBrowserHandlers must be used within FileBrowserHandlersProvider')
  }
  return context
}
