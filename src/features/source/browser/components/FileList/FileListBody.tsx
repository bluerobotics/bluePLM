import React from 'react'
import { FolderOpen } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import type { ConfigWithDepth } from '../../types'
import { FileRow } from './FileRow'
import { ConfigRow } from './ConfigRow'
import { useFilePaneContext } from '../../context'

// Slim props interface - state comes from context
export interface FileListBodyProps {
  // Sorted/filtered files to display (computed in parent)
  displayFiles: LocalFile[]
  
  // Computed values (not in context)
  visibleColumns: { id: string; width: number }[]
  
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
  
  // Cell rendering
  renderCellContent: (file: LocalFile, columnId: string) => React.ReactNode
}

export function FileListBody({
  displayFiles,
  visibleColumns,
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
  renderCellContent,
}: FileListBodyProps) {
  // Get state from context
  const {
    selectedFiles,
    clipboard,
    listRowSize,
    user,
    dragOverFolder,
    expandedConfigFiles,
    fileConfigurations,
    selectedConfigs,
    isCreatingFolder,
    newFolderName,
    newFolderInputRef,
    setNewFolderName,
    setIsCreatingFolder,
  } = useFilePaneContext()

  return (
    <tbody>
      {/* New folder input row */}
      {isCreatingFolder && (
        <tr className="new-folder-row">
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
      )}
      {displayFiles.flatMap((file, index) => {
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
        
        // Check if this file has expanded configurations
        const isConfigExpanded = expandedConfigFiles.has(file.path)
        const configs = fileConfigurations.get(file.path) || []
        const isEditable = !!file.pdmData?.id && file.pdmData?.checked_out_by === user?.id
        const basePartNumber = file.pendingMetadata?.part_number || file.pdmData?.part_number || ''
        
        // Build array of rows: main file row + config rows if expanded
        const rows: React.ReactNode[] = []
        
        rows.push(
          <FileRow
            key={file.path}
            file={file}
            index={index}
            isSelected={selectedFiles.includes(file.path)}
            isProcessing={isProcessing}
            diffClass={diffClass}
            isDragTarget={isDragTarget}
            isCut={isCut}
            rowHeight={listRowSize + 8}
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
        
        // Add configuration rows if expanded
        if (isConfigExpanded && configs.length > 0) {
          configs.forEach((config) => {
            const configKey = `${file.path}::${config.name}`
            const isConfigSelected = selectedConfigs.has(configKey)
            
            rows.push(
              <ConfigRow
                key={`${file.path}::config::${config.name}`}
                config={config}
                isSelected={isConfigSelected}
                isEditable={isEditable}
                rowHeight={listRowSize + 4}
                visibleColumns={visibleColumns}
                basePartNumber={basePartNumber}
                onClick={(e) => onConfigRowClick(e, file.path, config.name, configs)}
                onContextMenu={(e) => onConfigContextMenu(e, file.path, config.name)}
                onDescriptionChange={(value) => onConfigDescriptionChange(file.path, config.name, value)}
                onTabChange={(value) => onConfigTabChange(file.path, config.name, value)}
              />
            )
          })
        }
        
        return rows
      })}
    </tbody>
  )
}
