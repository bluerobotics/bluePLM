import React, { useMemo, useCallback, forwardRef, useImperativeHandle, useRef } from 'react'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import { FolderOpen } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import type { ConfigWithDepth } from '../../types'
import type { ConfigBomItem } from '@/stores/types'
import { FileRow } from './FileRow'
import { ConfigRow } from './ConfigRow'
import { ConfigBomRow } from './ConfigBomRow'
import { useFilePaneContext } from '../../context'
import { usePDMStore } from '@/stores/pdmStore'

// ============================================================================
// Types
// ============================================================================

/** File row data */
interface FileVirtualRow {
  type: 'file'
  file: LocalFile
  index: number
  isSelected: boolean
  isProcessing: boolean
  diffClass: string
  isDragTarget: boolean
  isCut: boolean
  isEditable: boolean
  basePartNumber: string
}

/** Config row data (SolidWorks configuration under a file) */
interface ConfigVirtualRow {
  type: 'config'
  file: LocalFile
  config: ConfigWithDepth
  isSelected: boolean
  isEditable: boolean
  basePartNumber: string
  /** Configuration-specific revision (from drawing propagation) */
  configRevision?: string
  /** Whether this config can be expanded to show BOM (only for assemblies) */
  isExpandable: boolean
  /** Whether the BOM section is currently expanded */
  isBomExpanded: boolean
  /** Whether the BOM is currently loading */
  isBomLoading: boolean
}

/** Config BOM row data (part/assembly under a configuration) */
interface ConfigBomVirtualRow {
  type: 'config-bom'
  file: LocalFile
  configName: string
  configDepth: number
  item: ConfigBomItem
}

/** New folder input row */
interface NewFolderVirtualRow {
  type: 'new-folder'
}

type VirtualRow = FileVirtualRow | ConfigVirtualRow | ConfigBomVirtualRow | NewFolderVirtualRow

// ============================================================================
// Props Interface
// ============================================================================

// Slim props interface - state comes from context
export interface FileListBodyProps {
  // Sorted/filtered files to display (computed in parent)
  displayFiles: LocalFile[]
  
  // Computed values (not in context)
  visibleColumns: { id: string; width: number }[]
  
  // Drag state (from useDragState, not context)
  dragOverFolder: string | null
  
  // Processing state helper
  isBeingProcessed: (path: string) => boolean
  
  // New folder handler
  handleCreateFolder: () => void
  
  // Row event handlers
  onRowClick: (e: React.MouseEvent, file: LocalFile, index: number) => void
  onRowDoubleClick: (file: LocalFile) => void
  onContextMenu: (e: React.MouseEvent, file: LocalFile) => void
  onDragStart: (e: React.DragEvent, file: LocalFile) => void
  onDragEnd: () => void
  onFolderDragOver: (e: React.DragEvent, folder: LocalFile) => void
  onFolderDragLeave: (e: React.DragEvent) => void
  onDropOnFolder: (e: React.DragEvent, folder: LocalFile) => void
  
  // Config row event handlers
  onConfigRowClick: (e: React.MouseEvent, filePath: string, configName: string, configs: ConfigWithDepth[]) => void
  onConfigContextMenu: (e: React.MouseEvent, filePath: string, configName: string) => void
  onConfigDescriptionChange: (filePath: string, configName: string, value: string) => void
  onConfigTabChange: (filePath: string, configName: string, value: string) => void
  onConfigBomToggle: (e: React.MouseEvent, file: LocalFile, configName: string) => void
  
  // Config BOM row event handlers
  onConfigBomRowClick: (e: React.MouseEvent, file: LocalFile, item: ConfigBomItem) => void
  
  // Cell rendering
  renderCellContent: (file: LocalFile, columnId: string) => React.ReactNode
}

// ============================================================================
// Component
// ============================================================================

export const FileListBody = forwardRef<HTMLTableSectionElement, FileListBodyProps>(function FileListBody({
  displayFiles,
  visibleColumns,
  dragOverFolder,
  isBeingProcessed,
  handleCreateFolder,
  onRowClick,
  onRowDoubleClick,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onFolderDragOver,
  onFolderDragLeave,
  onDropOnFolder,
  onConfigRowClick,
  onConfigContextMenu,
  onConfigDescriptionChange,
  onConfigTabChange,
  onConfigBomToggle,
  onConfigBomRowClick,
  renderCellContent,
}, ref) {
  // Get state from context
  const {
    selectedFiles,
    clipboard,
    listRowSize,
    user,
    expandedConfigFiles,
    fileConfigurations,
    selectedConfigs,
    expandedConfigBoms,
    configBomData,
    loadingConfigBoms,
    isCreatingFolder,
    newFolderName,
    newFolderInputRef,
    setNewFolderName,
    setIsCreatingFolder,
    tableRef,
  } = useFilePaneContext()

  // Get tab padding digits from organization serialization settings
  const tabPaddingDigits = usePDMStore(s => s.organization?.serialization_settings?.padding_digits) ?? 3

  // Local ref for the tbody element
  const tbodyRef = useRef<HTMLTableSectionElement>(null)
  
  // Expose tbody ref to parent if needed
  useImperativeHandle(ref, () => tbodyRef.current!, [])

  // Row heights
  const fileRowHeight = listRowSize + 8
  const configRowHeight = listRowSize + 4
  const configBomRowHeight = listRowSize // Slightly smaller for BOM items
  const newFolderRowHeight = 40 // Fixed height for new folder input

  // ============================================================================
  // Build virtual rows array
  // ============================================================================
  
  const virtualRows = useMemo<VirtualRow[]>(() => {
    const rows: VirtualRow[] = []
    
    // Add new folder input row at the top if creating
    if (isCreatingFolder) {
      rows.push({ type: 'new-folder' })
    }
    
    // Build rows from display files
    displayFiles.forEach((file, index) => {
      // Compute derived state for this file
      const diffClass = file.diffStatus === 'added' ? 'diff-added' 
        : file.diffStatus === 'modified' ? 'diff-modified'
        : file.diffStatus === 'moved' ? 'diff-moved'
        : file.diffStatus === 'deleted' ? 'diff-deleted'
        : file.diffStatus === 'deleted_remote' ? 'diff-deleted-remote'
        : file.diffStatus === 'outdated' ? 'diff-outdated'
        : file.diffStatus === 'cloud' ? 'diff-cloud' : ''
      
      const isProcessing = isBeingProcessed(file.relativePath)
      const isDragTarget = file.isDirectory && dragOverFolder === file.relativePath
      const isCut = clipboard?.operation === 'cut' && clipboard.files.some(f => f.path === file.path)
      const isEditable = !!file.pdmData?.id && file.pdmData?.checked_out_by === user?.id
      const basePartNumber = file.pendingMetadata?.part_number || file.pdmData?.part_number || ''
      
      // Add file row
      rows.push({
        type: 'file',
        file,
        index,
        isSelected: selectedFiles.includes(file.path),
        isProcessing,
        diffClass,
        isDragTarget,
        isCut,
        isEditable,
        basePartNumber,
      })
      
      // Add config rows if expanded
      if (expandedConfigFiles.has(file.path)) {
        const configs = fileConfigurations.get(file.path) || []
        // Get configuration revisions from file's pdmData (propagated from drawings)
        const configRevisions = (file.pdmData?.configuration_revisions || {}) as Record<string, string>
        
        // Check if file is an assembly (can show BOM)
        const isAssemblyFile = file.extension?.toLowerCase() === '.sldasm'
        
        configs.forEach((config) => {
          const configKey = `${file.path}::${config.name}`
          const isBomExpanded = expandedConfigBoms.has(configKey)
          const isBomLoading = loadingConfigBoms.has(configKey)
          
          rows.push({
            type: 'config',
            file,
            config,
            isSelected: selectedConfigs.has(configKey),
            isEditable,
            basePartNumber,
            configRevision: configRevisions[config.name],
            isExpandable: isAssemblyFile,
            isBomExpanded,
            isBomLoading,
          })
          
          // Add BOM rows if config BOM is expanded
          if (isBomExpanded) {
            const bomItems = configBomData.get(configKey) || []
            bomItems.forEach((item) => {
              rows.push({
                type: 'config-bom',
                file,
                configName: config.name,
                configDepth: config.depth,
                item,
              })
            })
          }
        })
      }
    })
    
    return rows
  }, [
    displayFiles,
    isCreatingFolder,
    selectedFiles,
    clipboard,
    dragOverFolder,
    user?.id,
    expandedConfigFiles,
    fileConfigurations,
    selectedConfigs,
    expandedConfigBoms,
    configBomData,
    loadingConfigBoms,
    isBeingProcessed,
  ])

  // ============================================================================
  // Virtualizer setup
  // ============================================================================
  
  const getRowHeight = useCallback((index: number): number => {
    const row = virtualRows[index]
    if (!row) return fileRowHeight
    
    switch (row.type) {
      case 'new-folder':
        return newFolderRowHeight
      case 'config':
        return configRowHeight
      case 'config-bom':
        return configBomRowHeight
      case 'file':
      default:
        return fileRowHeight
    }
  }, [virtualRows, fileRowHeight, configRowHeight, configBomRowHeight, newFolderRowHeight])

  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => tableRef.current,
    estimateSize: getRowHeight,
    overscan: 10,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Calculate padding for spacer rows to maintain scroll position
  // This technique renders only visible rows with spacer rows above/below
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom = virtualItems.length > 0 
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end 
    : 0

  // ============================================================================
  // Row renderers
  // ============================================================================

  const renderNewFolderRow = useCallback(() => (
    <tr className="new-folder-row" style={{ height: newFolderRowHeight }}>
      <td colSpan={visibleColumns.length}>
        <div className="flex items-center gap-2 py-1">
          <FolderOpen size={16} className="text-plm-accent" />
          <input
            ref={newFolderInputRef}
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateFolder()
              } else if (e.key === 'Escape') {
                setIsCreatingFolder(false)
                setNewFolderName('')
              }
            }}
            onBlur={handleCreateFolder}
            className="bg-plm-bg border border-plm-accent rounded px-2 py-1 text-sm text-plm-fg focus:outline-none focus:ring-1 focus:ring-plm-accent"
            placeholder="Folder name"
          />
        </div>
      </td>
    </tr>
  ), [visibleColumns.length, newFolderName, newFolderRowHeight, handleCreateFolder, setNewFolderName, setIsCreatingFolder, newFolderInputRef])

  const renderFileRow = useCallback((row: FileVirtualRow) => {
    const { file, index, isSelected, isProcessing, diffClass, isDragTarget, isCut } = row
    
    return (
      <FileRow
        key={file.path}
        file={file}
        index={index}
        isSelected={isSelected}
        isProcessing={isProcessing}
        diffClass={diffClass}
        isDragTarget={isDragTarget}
        isCut={isCut}
        rowHeight={fileRowHeight}
        visibleColumns={visibleColumns}
        draggable={file.diffStatus !== 'cloud'}
        onClick={(e) => onRowClick(e, file, index)}
        onDoubleClick={() => onRowDoubleClick(file)}
        onContextMenu={(e) => onContextMenu(e, file)}
        onDragStart={(e) => onDragStart(e, file)}
        onDragEnd={onDragEnd}
        onDragOver={file.isDirectory ? (e) => onFolderDragOver(e, file) : undefined}
        onDragLeave={file.isDirectory ? onFolderDragLeave : undefined}
        onDrop={file.isDirectory ? (e) => onDropOnFolder(e, file) : undefined}
        renderCell={renderCellContent}
      />
    )
  }, [
    fileRowHeight,
    visibleColumns,
    onRowClick,
    onRowDoubleClick,
    onContextMenu,
    onDragStart,
    onDragEnd,
    onFolderDragOver,
    onFolderDragLeave,
    onDropOnFolder,
    renderCellContent,
  ])

  const renderConfigRow = useCallback((row: ConfigVirtualRow) => {
    const { file, config, isSelected, isEditable, basePartNumber, configRevision, isExpandable, isBomExpanded, isBomLoading } = row
    const configs = fileConfigurations.get(file.path) || []
    
    return (
      <ConfigRow
        key={`${file.path}::config::${config.name}`}
        config={config}
        isSelected={isSelected}
        isEditable={isEditable}
        rowHeight={configRowHeight}
        visibleColumns={visibleColumns}
        basePartNumber={basePartNumber}
        configRevision={configRevision}
        isExpandable={isExpandable}
        isBomExpanded={isBomExpanded}
        isBomLoading={isBomLoading}
        tabPaddingDigits={tabPaddingDigits}
        onClick={(e) => onConfigRowClick(e, file.path, config.name, configs)}
        onContextMenu={(e) => onConfigContextMenu(e, file.path, config.name)}
        onDescriptionChange={(value) => onConfigDescriptionChange(file.path, config.name, value)}
        onTabChange={(value) => onConfigTabChange(file.path, config.name, value)}
        onToggleBom={(e) => onConfigBomToggle(e, file, config.name)}
      />
    )
  }, [
    configRowHeight,
    visibleColumns,
    fileConfigurations,
    tabPaddingDigits,
    onConfigRowClick,
    onConfigContextMenu,
    onConfigDescriptionChange,
    onConfigTabChange,
    onConfigBomToggle,
  ])

  const renderConfigBomRow = useCallback((row: ConfigBomVirtualRow) => {
    const { file, configDepth, item } = row
    
    return (
      <ConfigBomRow
        key={`${file.path}::bom::${row.configName}::${item.id}`}
        item={item}
        depth={0}
        configDepth={configDepth}
        rowHeight={configBomRowHeight}
        visibleColumns={visibleColumns}
        onClick={(e) => onConfigBomRowClick(e, file, item)}
      />
    )
  }, [
    configBomRowHeight,
    visibleColumns,
    onConfigBomRowClick,
  ])

  // ============================================================================
  // Render
  // ============================================================================

  // If no rows, render empty tbody to maintain table structure
  if (virtualRows.length === 0) {
    return <tbody ref={tbodyRef} />
  }

  return (
    <tbody ref={tbodyRef}>
      {/* Top spacer row for virtual scroll positioning */}
      {paddingTop > 0 && (
        <tr aria-hidden="true" style={{ height: paddingTop }}>
          <td colSpan={visibleColumns.length} style={{ padding: 0, border: 0 }} />
        </tr>
      )}
      
      {/* Render only visible virtual rows */}
      {virtualItems.map((virtualRow: VirtualItem) => {
        const row = virtualRows[virtualRow.index]
        if (!row) return null
        
        switch (row.type) {
          case 'new-folder':
            return (
              <React.Fragment key="__new-folder__">
                {renderNewFolderRow()}
              </React.Fragment>
            )
          case 'file':
            return (
              <React.Fragment key={`file::${row.file.path}`}>
                {renderFileRow(row)}
              </React.Fragment>
            )
          case 'config':
            return (
              <React.Fragment key={`config::${row.file.path}::${row.config.name}`}>
                {renderConfigRow(row)}
              </React.Fragment>
            )
          case 'config-bom':
            return (
              <React.Fragment key={`config-bom::${row.file.path}::${row.configName}::${row.item.id}`}>
                {renderConfigBomRow(row)}
              </React.Fragment>
            )
          default:
            return null
        }
      })}
      
      {/* Bottom spacer row for virtual scroll positioning */}
      {paddingBottom > 0 && (
        <tr aria-hidden="true" style={{ height: paddingBottom }}>
          <td colSpan={visibleColumns.length} style={{ padding: 0, border: 0 }} />
        </tr>
      )}
    </tbody>
  )
})
