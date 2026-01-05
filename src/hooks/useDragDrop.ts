import { useState, useRef, useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { PDM_FILES_DATA_TYPE, type DragDropMode } from '@/lib/fileOperations'
import { executeCommand } from '@/lib/commands'

interface UseDragDropOptions {
  mode: DragDropMode
  files: LocalFile[]
  selectedFiles: string[]
  onRefresh?: (silent?: boolean) => void
  currentFolder?: string
}

export function useDragDrop(options: UseDragDropOptions) {
  const { onRefresh } = options
  // files and selectedFiles available from options if needed for future enhancements

  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isExternalDrag, setIsExternalDrag] = useState(false)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const draggedFilesRef = useRef<LocalFile[]>([])

  const handleDragStart = useCallback((
    e: React.DragEvent,
    filesToDrag: LocalFile[],
    primaryFile: LocalFile
  ) => {
    const draggable = filesToDrag.filter(f => f.diffStatus !== 'cloud')
    if (draggable.length === 0) {
      e.preventDefault()
      return
    }

    draggedFilesRef.current = draggable
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(PDM_FILES_DATA_TYPE, JSON.stringify(draggable.map(f => f.path)))
    
    // Create a custom drag image
    const dragPreview = document.createElement('div')
    dragPreview.style.cssText = 'position:absolute;left:-1000px;padding:8px 12px;background:#1e293b;border:1px solid #3b82f6;border-radius:6px;color:white;font-size:13px;display:flex;align-items:center;gap:6px;'
    const iconSvg = primaryFile.isDirectory 
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
    const label = draggable.length > 1 ? `${draggable.length} items` : primaryFile.name
    dragPreview.innerHTML = `${iconSvg}${label}`
    document.body.appendChild(dragPreview)
    e.dataTransfer.setDragImage(dragPreview, 20, 20)
    setTimeout(() => dragPreview.remove(), 0)
  }, [])

  const handleDragEnd = useCallback(() => {
    draggedFilesRef.current = []
    setDragOverFolder(null)
    setIsDraggingOver(false)
    setIsExternalDrag(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const hasPdm = e.dataTransfer.types.includes(PDM_FILES_DATA_TYPE)
    const hasFiles = e.dataTransfer.types.includes('Files') && !hasPdm

    if (hasPdm || draggedFilesRef.current.length > 0) {
      e.dataTransfer.dropEffect = 'move'
      setIsDraggingOver(true)
      setIsExternalDrag(false)
    } else if (hasFiles) {
      e.dataTransfer.dropEffect = 'copy'
      setIsDraggingOver(true)
      setIsExternalDrag(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement
    if (!related || !e.currentTarget.contains(related)) {
      setIsDraggingOver(false)
      setIsExternalDrag(false)
      setDragOverFolder(null)
    }
  }, [])

  const handleFolderDragOver = useCallback((e: React.DragEvent, folder: LocalFile) => {
    e.preventDefault()
    e.stopPropagation()

    const dragged = draggedFilesRef.current
    const isDroppingOnSelf = dragged.some(f =>
      f.relativePath === folder.relativePath ||
      folder.relativePath.startsWith(f.relativePath + '/')
    )

    if (isDroppingOnSelf) {
      e.dataTransfer.dropEffect = 'none'
      return
    }

    e.dataTransfer.dropEffect = 'move'
    setDragOverFolder(folder.relativePath)
  }, [])

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement
    if (!related || !e.currentTarget.contains(related)) {
      setDragOverFolder(null)
    }
  }, [])

  const handleDropOnFolder = useCallback(async (e: React.DragEvent, folder: LocalFile) => {
    e.preventDefault()
    e.stopPropagation()

    setDragOverFolder(null)
    setIsDraggingOver(false)
    setIsExternalDrag(false)

    const filesToMove = draggedFilesRef.current
    if (filesToMove.length > 0) {
      await executeCommand('move', {
        files: filesToMove,
        targetFolder: folder.relativePath
      }, { onRefresh })
    }

    draggedFilesRef.current = []
  }, [onRefresh])

  return {
    isDraggingOver,
    isExternalDrag,
    dragOverFolder,
    draggedFilesRef,
    setDragOverFolder,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleFolderDragOver,
    handleFolderDragLeave,
    handleDropOnFolder
  }
}
