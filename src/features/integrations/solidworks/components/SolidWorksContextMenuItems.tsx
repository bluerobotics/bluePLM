/**
 * SolidWorksContextMenuItems - Context menu items for creating SOLIDWORKS files
 * 
 * Renders menu items with submenus for creating new SOLIDWORKS Part, Assembly, 
 * and Drawing files. Each file type shows available templates plus a "Default" option.
 * 
 * Designed for future extraction to a SOLIDWORKS extension.
 */
import { memo, useState, useRef } from 'react'
import { FileBox, Boxes, FileText, Loader2 } from 'lucide-react'
import { useSolidWorksFileCreation, type SolidWorksFileType, type TemplateFile } from '../hooks'
import { ContextSubmenu } from '@/features/source/browser/components/ContextMenu/components'
import { usePDMStore } from '@/stores/pdmStore'

export interface SolidWorksContextMenuItemsProps {
  /** Target folder path where new files will be created */
  targetFolder: string
  /** Callback to close the context menu after action */
  onClose: () => void
  /** Optional callback when a file is successfully created */
  onFileCreated?: (filePath: string) => void
}

interface FileTypeMenuItemProps {
  label: string
  icon: React.ReactNode
  fileType: SolidWorksFileType
  templates: TemplateFile[]
  targetFolder: string
  onClose: () => void
  onFileCreated?: (filePath: string) => void
  createFromTemplate: (templatePath: string, targetFolder: string, fileType: SolidWorksFileType) => Promise<string | null>
  /** Whether any file creation is currently in progress */
  isCreating: boolean
  /** Set creating state */
  setIsCreating: (creating: boolean) => void
}

/**
 * Menu item with submenu for a single file type
 */
const FileTypeMenuItem = memo(function FileTypeMenuItem({
  label,
  icon,
  fileType,
  templates,
  targetFolder,
  onClose,
  onFileCreated,
  createFromTemplate,
  isCreating,
  setIsCreating
}: FileTypeMenuItemProps) {
  const [showSubmenu, setShowSubmenu] = useState(false)
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const addToast = usePDMStore(s => s.addToast)
  
  const handleCreateFromTemplate = async (e: React.MouseEvent, template: TemplateFile) => {
    e.stopPropagation()
    
    // Prevent duplicate clicks while creating
    if (isCreating) return
    
    setIsCreating(true)
    
    // Show immediate feedback toast
    addToast('info', `Creating ${fileType}...`, 2000)
    
    // Close menu immediately so user knows action was received
    onClose()
    
    const filePath = await createFromTemplate(template.path, targetFolder, fileType)
    if (filePath) {
      onFileCreated?.(filePath)
    }
    
    setIsCreating(false)
  }
  
  const handleMouseEnter = () => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current)
    }
    setShowSubmenu(true)
  }
  
  const handleMouseLeave = () => {
    submenuTimeoutRef.current = setTimeout(() => {
      setShowSubmenu(false)
    }, 150)
  }
  
  return (
    <div 
      className={`context-menu-item relative ${isCreating ? 'disabled' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => {
        e.stopPropagation()
        if (!isCreating) setShowSubmenu(!showSubmenu)
      }}
    >
      {isCreating ? <Loader2 size={14} className="animate-spin" /> : icon}
      {label}
      <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
      
      {showSubmenu && !isCreating && (
        <ContextSubmenu
          minWidth={180}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {templates.length > 0 ? (
            templates.map((template) => (
              <div
                key={template.path}
                className="context-menu-item"
                onClick={(e) => handleCreateFromTemplate(e, template)}
                title={template.path}
              >
                {template.name}
              </div>
            ))
          ) : (
            <div className="context-menu-item disabled">
              No templates configured
            </div>
          )}
        </ContextSubmenu>
      )}
    </div>
  )
})

/**
 * Context menu items for creating new SOLIDWORKS files.
 * 
 * Shows "New .sldprt", "New .sldasm", "New .slddrw" options,
 * each with a submenu showing available templates.
 * 
 * Returns null if SOLIDWORKS integration is disabled.
 */
export const SolidWorksContextMenuItems = memo(function SolidWorksContextMenuItems({
  targetFolder,
  onClose,
  onFileCreated
}: SolidWorksContextMenuItemsProps) {
  const [isCreating, setIsCreating] = useState(false)
  
  const {
    canCreateSolidWorksFiles,
    isIntegrationEnabled,
    availableTemplates,
    isLoadingTemplates,
    createFromTemplate
  } = useSolidWorksFileCreation()
  
  // Don't render anything if integration is disabled
  if (!isIntegrationEnabled) {
    return null
  }
  
  // Don't render if we can't create files (no vault path)
  if (!canCreateSolidWorksFiles) {
    return null
  }
  
  // Show loading state
  if (isLoadingTemplates) {
    return (
      <>
        <div className="context-menu-separator" />
        <div className="context-menu-item disabled">
          <FileBox size={14} />
          Loading templates...
        </div>
      </>
    )
  }
  
  return (
    <>
      <div className="context-menu-separator" />
      
      {/* Part */}
      <FileTypeMenuItem
        label="New .sldprt"
        icon={<FileBox size={14} />}
        fileType="part"
        templates={availableTemplates.parts}
        targetFolder={targetFolder}
        onClose={onClose}
        onFileCreated={onFileCreated}
        createFromTemplate={createFromTemplate}
        isCreating={isCreating}
        setIsCreating={setIsCreating}
      />
      
      {/* Assembly */}
      <FileTypeMenuItem
        label="New .sldasm"
        icon={<Boxes size={14} />}
        fileType="assembly"
        templates={availableTemplates.assemblies}
        targetFolder={targetFolder}
        onClose={onClose}
        onFileCreated={onFileCreated}
        createFromTemplate={createFromTemplate}
        isCreating={isCreating}
        setIsCreating={setIsCreating}
      />
      
      {/* Drawing */}
      <FileTypeMenuItem
        label="New .slddrw"
        icon={<FileText size={14} />}
        fileType="drawing"
        templates={availableTemplates.drawings}
        targetFolder={targetFolder}
        onClose={onClose}
        onFileCreated={onFileCreated}
        createFromTemplate={createFromTemplate}
        isCreating={isCreating}
        setIsCreating={setIsCreating}
      />
    </>
  )
})
