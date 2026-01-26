/**
 * Assembly actions for context menu
 * Provides "Insert into Assembly" option for SolidWorks parts/subassemblies
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Boxes } from 'lucide-react'
import type { ActionComponentProps } from './types'
import { ContextSubmenu } from '../components'
import { usePDMStore } from '@/stores/pdmStore'
import { log } from '@/lib/logger'

interface OpenAssembly {
  filePath: string
  fileName: string
  fileType: string
  isReadOnly: boolean
  isDirty: boolean
  activeConfiguration: string
}

export function AssemblyActions({
  multiSelect,
  firstFile,
  onClose,
}: ActionComponentProps) {
  const [showSubmenu, setShowSubmenu] = useState(false)
  const [openAssemblies, setOpenAssemblies] = useState<OpenAssembly[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isInserting, setIsInserting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasFetchedRef = useRef(false)
  
  const { addToast } = usePDMStore()
  const solidworksEnabled = usePDMStore(s => s.solidworksIntegrationEnabled)
  
  // Check if the file(s) are SolidWorks parts or assemblies that can be inserted
  const isSolidWorksInsertable = useCallback((ext: string | undefined) => {
    const lowerExt = ext?.toLowerCase()
    return lowerExt === '.sldprt' || lowerExt === '.sldasm'
  }, [])
  
  // Only show for single SolidWorks parts/assemblies (multi-insert not yet supported)
  const canInsert = !multiSelect && 
    isSolidWorksInsertable(firstFile.extension) && 
    firstFile.diffStatus !== 'cloud' &&
    solidworksEnabled
  
  // Reset state when submenu closes so re-opening can fetch fresh data
  useEffect(() => {
    if (!showSubmenu) {
      hasFetchedRef.current = false
      setOpenAssemblies([])
      setError(null)
    }
  }, [showSubmenu])
  
  // Fetch open assemblies when submenu is shown (only once per open)
  useEffect(() => {
    if (showSubmenu && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      setIsLoading(true)
      setError(null)
      
      window.electronAPI?.solidworks.getOpenDocuments()
        .then(result => {
          if (result?.success && result.data?.documents) {
            // Filter to only assemblies
            const assemblies = result.data.documents.filter(
              doc => doc.fileType === 'Assembly' || doc.filePath.toLowerCase().endsWith('.sldasm')
            )
            setOpenAssemblies(assemblies)
          } else if (!result?.success) {
            setError(result?.error || 'Failed to check SolidWorks')
            log.error('[AssemblyActions]', 'getOpenDocuments returned failure', { error: result?.error })
          }
        })
        .catch(err => {
          const errorMsg = err instanceof Error ? err.message : String(err)
          setError('Failed to connect to SolidWorks')
          log.error('[AssemblyActions]', 'Failed to fetch open documents', { error: errorMsg })
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [showSubmenu])
  
  // Handle insert into assembly
  const handleInsert = async (assembly: OpenAssembly) => {
    if (isInserting) return
    
    setIsInserting(true)
    const partName = firstFile.name
    const assemblyName = assembly.fileName
    
    addToast('info', `Adding ${partName} to ${assemblyName}...`)
    
    try {
      const result = await window.electronAPI?.solidworks.addComponent(
        assembly.filePath,
        firstFile.path
      )
      
      if (result?.success) {
        addToast('success', `Added ${partName} to ${assemblyName}`)
        log.info('[AssemblyActions]', 'Successfully added component', { data: result.data })
      } else {
        addToast('error', result?.error || 'Failed to add component')
        log.error('[AssemblyActions]', 'Failed to add component', { error: result?.error })
      }
    } catch (err) {
      addToast('error', 'Failed to add component to assembly')
      log.error('[AssemblyActions]', 'Exception adding component', { error: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsInserting(false)
      onClose()
    }
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
  
  // Don't render if not applicable
  if (!canInsert) {
    return null
  }
  
  return (
    <>
      <div className="context-menu-separator" />
      <div 
        className="context-menu-item relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => {
          e.stopPropagation()
          setShowSubmenu(!showSubmenu)
        }}
      >
        <Boxes size={14} className="text-plm-accent-primary" />
        Insert into Assembly
        <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
        
        {showSubmenu && (
          <ContextSubmenu
            minWidth={200}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {isLoading ? (
              <div className="context-menu-item disabled">
                <span className="animate-pulse">Checking SolidWorks...</span>
              </div>
            ) : error ? (
              <div className="context-menu-item disabled text-plm-error">
                {error}
              </div>
            ) : openAssemblies.length > 0 ? (
              openAssemblies.map((assembly) => (
                <div
                  key={assembly.filePath}
                  className="context-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleInsert(assembly)
                  }}
                  title={assembly.filePath}
                >
                  <Boxes size={14} className="text-plm-fg-muted" />
                  <span className="truncate">{assembly.fileName}</span>
                  {assembly.isDirty && (
                    <span className="text-xs text-plm-warning ml-auto">*</span>
                  )}
                </div>
              ))
            ) : (
              <div className="context-menu-item disabled">
                No assemblies open in SolidWorks
              </div>
            )}
          </ContextSubmenu>
        )}
      </div>
    </>
  )
}
