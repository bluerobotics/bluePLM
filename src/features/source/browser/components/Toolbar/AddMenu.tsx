import { memo, useState, useRef, useEffect } from 'react'
import { Upload, FolderPlus, ChevronDown } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { checkOperationPermission, getPermissionRequirement } from '@/lib/permissions'

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
  const { hasPermission, addToast } = usePDMStore()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Permission checks
  const canAddFiles = checkOperationPermission('add-files', hasPermission)
  const canAddFolder = checkOperationPermission('add-folder', hasPermission)
  const canAdd = canAddFiles.allowed || canAddFolder.allowed

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
        onClick={() => {
          if (!canAdd) {
            addToast('error', `You need ${getPermissionRequirement('add-files')} to add files`)
            return
          }
          setIsOpen(!isOpen)
        }}
        className={`btn btn-sm gap-1 ${canAdd ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'}`}
        title={canAdd ? 'Add files or folder to vault' : `Requires ${getPermissionRequirement('add-files')}`}
      >
        <Upload size={14} />
        Add
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && canAdd && (
        <div className="context-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4 }}>
          <div
            className={`context-menu-item ${!canAddFiles.allowed ? 'disabled' : ''}`}
            onClick={() => {
              if (!canAddFiles.allowed) {
                addToast('error', canAddFiles.reason || getPermissionRequirement('add-files'))
                return
              }
              onAddFiles()
              setIsOpen(false)
            }}
            title={!canAddFiles.allowed ? `Requires ${getPermissionRequirement('add-files')}` : ''}
          >
            <Upload size={14} />
            Add Files...
            {!canAddFiles.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
          </div>
          <div
            className={`context-menu-item ${!canAddFolder.allowed ? 'disabled' : ''}`}
            onClick={() => {
              if (!canAddFolder.allowed) {
                addToast('error', canAddFolder.reason || getPermissionRequirement('add-folder'))
                return
              }
              onAddFolder()
              setIsOpen(false)
            }}
            title={!canAddFolder.allowed ? `Requires ${getPermissionRequirement('add-folder')}` : ''}
          >
            <FolderPlus size={14} />
            Add Folder...
            {!canAddFolder.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
          </div>
        </div>
      )}
    </div>
  )
})
