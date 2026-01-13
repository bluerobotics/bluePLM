/**
 * Export actions for SolidWorks files in context menu
 * Uses the same export logic as configuration exports
 */
import { useState, useRef } from 'react'
import { Loader2, Package, FileOutput, Download, Settings, FolderOpen, FolderDown } from 'lucide-react'
import type { ActionComponentProps } from './types'
import { usePDMStore } from '@/stores/pdmStore'
import { useSolidWorksStatus } from '@/hooks/useSolidWorksStatus'
import { getEffectiveExportSettings } from '@/features/settings/system'
import { getSerializationSettings, combineBaseAndTab } from '@/lib/serialization'
import { log } from '@/lib/logger'
import { ContextSubmenu } from '../components'

type ExportFormat = 'step' | 'iges' | 'stl' | 'pdf' | 'dxf'

export function ExportActions({
  contextFiles,
  multiSelect,
  firstFile,
  onClose,
}: ActionComponentProps) {
  const { status } = useSolidWorksStatus()
  const swServiceRunning = status.running
  const [isExporting, setIsExporting] = useState<string | null>(null)
  const [exportSubmenu, setExportSubmenu] = useState<ExportFormat | null>(null)
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { addToast, addProgressToast, updateProgressToast, removeToast, organization } = usePDMStore()

  const ext = firstFile.extension?.toLowerCase() || ''
  const isPartOrAsm = ['.sldprt', '.sldasm'].includes(ext)
  const isDrawing = ext === '.slddrw'
  const isSolidWorksFile = isPartOrAsm || isDrawing

  // Only show for SolidWorks files when service is running
  if (!isSolidWorksFile || !swServiceRunning) {
    return null
  }

  // For multi-select, only show if all files are the same type
  if (multiSelect) {
    const allSameType = contextFiles.every(f => {
      const fExt = f.extension?.toLowerCase() || ''
      return isPartOrAsm 
        ? ['.sldprt', '.sldasm'].includes(fExt)
        : fExt === '.slddrw'
    })
    if (!allSameType) return null
  }

  const handleMouseEnterExport = (format: ExportFormat) => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current)
    }
    setExportSubmenu(format)
  }

  const handleMouseLeaveExport = () => {
    submenuTimeoutRef.current = setTimeout(() => {
      setExportSubmenu(null)
    }, 150)
  }

  const handleExport = async (format: ExportFormat, outputFolder?: string) => {
    setIsExporting(format)
    onClose()

    const filesToExport = multiSelect ? contextFiles : [firstFile]
    const fileCount = filesToExport.length
    const formatUpper = format.toUpperCase()

    // Create a unique toast ID for this export operation
    const toastId = `export-${format}-${Date.now()}`
    addProgressToast(toastId, `Exporting ${formatUpper}${fileCount > 1 ? ` (${fileCount} files)` : ''}...`, fileCount)

    try {
      let successCount = 0
      let failCount = 0

      for (let i = 0; i < filesToExport.length; i++) {
        const file = filesToExport[i]
        
        // Update progress
        updateProgressToast(toastId, i, Math.round((i / fileCount) * 100), undefined, `${i}/${fileCount}`)
        
        // Build PDM metadata for export filename pattern
        const baseNumber = file.pdmData?.part_number || file.pendingMetadata?.part_number || ''
        const description = file.pdmData?.description || file.pendingMetadata?.description || ''
        const revision = file.pdmData?.revision || ''

        // Get tab number from pending config tabs (default config)
        let tabNumber = ''
        const configTabs = file.pendingMetadata?.config_tabs || 
          (file.pdmData?.custom_properties as Record<string, unknown> | undefined)?._config_tabs as Record<string, string> | undefined
        if (configTabs) {
          // Try to get tab for default config
          tabNumber = configTabs['Default'] || configTabs['default'] || Object.values(configTabs)[0] || ''
        }

        // Build full item number with serialization settings
        let fullItemNumber = baseNumber
        if (tabNumber && organization?.id) {
          try {
            const serSettings = await getSerializationSettings(organization.id)
            if (serSettings?.tab_enabled) {
              fullItemNumber = combineBaseAndTab(baseNumber, tabNumber, serSettings)
            } else if (baseNumber && tabNumber) {
              fullItemNumber = `${baseNumber}-${tabNumber}`
            }
          } catch (err) {
            log.debug('[Export]', 'Failed to get serialization settings', { error: err })
            if (baseNumber && tabNumber) {
              fullItemNumber = `${baseNumber}-${tabNumber}`
            }
          }
        }

        const pdmMetadata = {
          partNumber: fullItemNumber,
          tabNumber,
          revision,
          description
        }

        // Get filename pattern from effective export settings
        const exportSettings = getEffectiveExportSettings(organization)
        const filenamePattern = exportSettings.filename_pattern

        try {
          let result
          switch (format) {
            case 'pdf':
              result = await window.electronAPI?.solidworks?.exportPdf(file.path, outputFolder)
              break
            case 'step':
              result = await window.electronAPI?.solidworks?.exportStep(file.path, {
                exportAllConfigs: true,
                filenamePattern,
                pdmMetadata,
                outputPath: outputFolder
              })
              break
            case 'iges':
              result = await window.electronAPI?.solidworks?.exportIges(file.path, {
                exportAllConfigs: true,
                outputPath: outputFolder
              })
              break
            case 'stl':
              result = await window.electronAPI?.solidworks?.exportStl?.(file.path, {
                exportAllConfigs: true,
                filenamePattern,
                pdmMetadata,
                resolution: exportSettings.stl_resolution,
                binaryFormat: exportSettings.stl_binary_format,
                customDeviation: exportSettings.stl_custom_deviation,
                customAngle: exportSettings.stl_custom_angle,
                outputPath: outputFolder
              })
              break
            case 'dxf':
              result = await window.electronAPI?.solidworks?.exportDxf(file.path, outputFolder)
              break
          }

          if (result?.success) {
            successCount++
            // Copy metadata to exported files
            const exportedFiles = result.data && 'exportedFiles' in result.data ? result.data.exportedFiles : []
            if (exportedFiles && exportedFiles.length > 0) {
              for (const exportedPath of exportedFiles) {
                usePDMStore.getState().updatePendingMetadata(exportedPath, {
                  part_number: fullItemNumber,
                  description,
                  revision: revision || 'A'
                })
              }
            }
          } else {
            failCount++
            log.error('[Export]', `Failed to export ${file.name}`, { error: result?.error })
          }
        } catch (err) {
          failCount++
          log.error('[Export]', `Exception exporting ${file.name}`, { error: err })
        }
      }

      // Remove progress toast and show result
      removeToast(toastId)
      
      if (successCount > 0 && failCount === 0) {
        addToast('success', `Exported ${successCount} ${formatUpper} file${successCount > 1 ? 's' : ''}`)
      } else if (successCount > 0 && failCount > 0) {
        addToast('warning', `Exported ${successCount}, failed ${failCount}`)
      } else {
        addToast('error', `Failed to export ${formatUpper}`)
      }
    } catch (err) {
      removeToast(toastId)
      addToast('error', `Export failed: ${err}`)
    } finally {
      setIsExporting(null)
    }
  }

  const handleExportTo = async (format: ExportFormat) => {
    if (isExporting) return
    
    // Open folder picker dialog
    const result = await window.electronAPI?.selectFolder()
    if (result?.success && result.folderPath) {
      handleExport(format, result.folderPath)
    }
  }

  const fileCount = multiSelect ? contextFiles.length : 1
  const countLabel = fileCount > 1 ? ` (${fileCount})` : ''

  // Format configurations for each export type
  const partFormats: Array<{ format: ExportFormat; label: string; colorClass: string; Icon: typeof Package }> = [
    { format: 'step', label: 'STEP', colorClass: 'text-emerald-400', Icon: Package },
    { format: 'iges', label: 'IGES', colorClass: 'text-amber-400', Icon: Package },
    { format: 'stl', label: 'STL', colorClass: 'text-violet-400', Icon: Package },
  ]

  const drawingFormats: Array<{ format: ExportFormat; label: string; colorClass: string; Icon: typeof Package }> = [
    { format: 'pdf', label: 'PDF', colorClass: 'text-red-400', Icon: FileOutput },
    { format: 'dxf', label: 'DXF', colorClass: 'text-cyan-400', Icon: Download },
  ]

  const renderExportSubmenu = (config: { format: ExportFormat; label: string; colorClass: string; Icon: typeof Package }) => {
    const { format, label, colorClass, Icon } = config
    
    return (
      <div 
        key={format}
        className={`context-menu-item relative ${isExporting ? 'opacity-50' : ''}`}
        onMouseEnter={() => handleMouseEnterExport(format)}
        onMouseLeave={handleMouseLeaveExport}
        onClick={(e) => {
          e.stopPropagation()
          setExportSubmenu(exportSubmenu === format ? null : format)
        }}
      >
        {isExporting === format ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Icon size={14} className={colorClass} />
        )}
        Export {label}{countLabel}
        <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
        
        {/* Export destination submenu */}
        {exportSubmenu === format && (
          <ContextSubmenu
            minWidth={140}
            onMouseEnter={() => {
              if (submenuTimeoutRef.current) {
                clearTimeout(submenuTimeoutRef.current)
              }
              setExportSubmenu(format)
            }}
            onMouseLeave={handleMouseLeaveExport}
          >
            <div 
              className="context-menu-item"
              onClick={(e) => {
                e.stopPropagation()
                if (!isExporting) handleExport(format)
              }}
            >
              <FolderDown size={14} className={colorClass} />
              Export Here
            </div>
            <div 
              className="context-menu-item"
              onClick={(e) => {
                e.stopPropagation()
                handleExportTo(format)
              }}
            >
              <FolderOpen size={14} className="text-plm-fg-muted" />
              Export To...
            </div>
          </ContextSubmenu>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="context-menu-separator" />
      
      {isPartOrAsm && partFormats.map(renderExportSubmenu)}
      
      {isDrawing && drawingFormats.map(renderExportSubmenu)}
      
      {/* Export Options link */}
      <div 
        className="context-menu-item text-plm-fg-muted"
        onClick={() => {
          onClose()
          window.dispatchEvent(new CustomEvent('navigate-settings-tab', { detail: 'export' }))
        }}
      >
        <Settings size={14} />
        Export Options...
      </div>
    </>
  )
}
