import type { MouseEvent } from 'react'

interface NativePreviewContextMenuBackdropProps {
  onClose: () => void
}

/** A visible DOM latch that keeps replacement native-preview sessions hidden. */
export function NativePreviewContextMenuBackdrop({
  onClose,
}: NativePreviewContextMenuBackdropProps) {
  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    onClose()
  }

  return (
    <div
      data-native-preview-overlay="context-menu"
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={handleContextMenu}
    />
  )
}
