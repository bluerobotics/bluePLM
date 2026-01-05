import { memo, useState, useRef, useEffect } from 'react'
import { Upload, FolderPlus, ChevronDown } from 'lucide-react'

export interface AddMenuProps {
  onAddFiles: () => void
  onAddFolder: () => void
}

/**
 * Dropdown menu for adding files or folders
 */
export const AddMenu = memo(function AddMenu({
  onAddFiles,
  onAddFolder
}: AddMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-primary btn-sm gap-1"
        title="Add files or folder to vault"
      >
        <Upload size={14} />
        Add
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="context-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4 }}>
          <div
            className="context-menu-item"
            onClick={() => {
              onAddFiles()
              setIsOpen(false)
            }}
          >
            <Upload size={14} />
            Add Files...
          </div>
          <div
            className="context-menu-item"
            onClick={() => {
              onAddFolder()
              setIsOpen(false)
            }}
          >
            <FolderPlus size={14} />
            Add Folder...
          </div>
        </div>
      )}
    </div>
  )
})
