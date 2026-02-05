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
  multiSelect: _multiSelect,
  firstFile: _firstFile,
  onClose,
}: ActionComponentProps) {
  const { status } = useSolidWorksStatus()
  const swServiceRunning = status.running
  const [isExporting, setIsExporting] = useState<string | null>(null)
  const [exportSubmenu, setExportSubmenu] = useState<ExportFormat | null>(null)
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { addToast, addProgressToast, updateProgressToast, removeToast, organization } = usePDMStore()

  // Filter to only exportable SolidWorks files (exclude folders)
  const swExtensions = ['.sldprt', '.sldasm', '.slddrw']
  const exportableFiles = contextFiles.filter(f => {
    if (f.isDirectory) return false
    const ext = f.extension?.toLowerCase() || ''
    return swExtensions.includes(ext)
  })

  // Group by type for display
  const drawingFiles = exportableFiles.filter(f => f.extension?.toLowerCase() === '.slddrw')
  const partAsmFiles = exportableFiles.filter(f => 
    ['.sldprt', '.sldasm'].includes(f.extension?.toLowerCase() || '')
  )

  // Only show when service is running and we have exportable files
  if (exportableFiles.length === 0 || !swServiceRunning) {
    return null
  }

  const hasDrawings = drawingFiles.length > 0
  const hasPartsOrAsm = partAsmFiles.length > 0

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

    // Use appropriate filtered list based on format
    const filesToExport = format === 'pdf' || format === 'dxf' 
      ? drawingFiles 
      : partAsmFiles
    const fileCount = filesToExport.length
    const formatUpper = format.toUpperCase()

    if (fileCount === 0) {
      addToast('error', `No files to export as ${formatUpper}`)
      setIsExporting(null)
      return
    }

    // Create a unique toast ID for this export operation
    const toastId = `export-${format}-${Date.now()}`
    addProgressToast(toastId, `Exporting ${formatUpper}${fileCount > 1 ? ` (${fileCount} files)` : ''}...`, fileCount)

    // Get file paths for file watcher suppression
    const filePaths = filesToExport.map(f => f.path)
    
    // Suppress file watcher during export to prevent UI thrashing
    usePDMStore.getState().addProcessingFolders(filePaths, 'export')

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
        const revision = (file.pdmData?.revision || '').trim()

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
          // For PDF exports (drawings): don't send PDM revision - let the drawing's own Revision property be authoritative
          // The PDM revision may come from the parent part, which is incorrect for drawings
          revision: format === 'pdf' ? '' : revision,
          description
        }

        // Get filename pattern from effective export settings
        const exportSettings = getEffectiveExportSettings(organization)
        const filenamePattern = exportSettings.filename_pattern

        try {
          log.info('[Export]', `Exporting ${file.name} as ${format.toUpperCase()}`, {
            inputPath: file.path,
            outputFolder,
            filenamePattern,
            pdmMetadata
          })
          
          let result
          switch (format) {
            case 'pdf':
              result = await window.electronAPI?.solidworks?.exportPdf(file.path, {
                outputPath: outputFolder,
                filenamePattern,
                pdmMetadata
              })
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
            // Handle both response formats:
            // - STEP/IGES/STL: { exportedFiles: [...] }
            // - PDF/DXF: { outputFile: "..." }
            let exportedFiles: string[] = []
            if (result.data) {
              if ('exportedFiles' in result.data && Array.isArray(result.data.exportedFiles)) {
                exportedFiles = result.data.exportedFiles
              } else if ('outputFile' in result.data && typeof result.data.outputFile === 'string') {
                exportedFiles = [result.data.outputFile]
              }
            }
            log.info('[Export]', `SUCCESS: ${file.name} exported`, {
              inputPath: file.path,
              outputPaths: exportedFiles,
              format: format.toUpperCase()
            })
            if (exportedFiles && exportedFiles.length > 0) {
              for (const exportedPath of exportedFiles) {
                usePDMStore.getState().updatePendingMetadata(exportedPath, {
                  part_number: fullItemNumber,
                  description,
                  revision: revision || ''
                })
              }
            }
          } else {
            failCount++
            log.error('[Export]', `FAILED: ${file.name} export failed`, {
              inputPath: file.path,
              outputFolder,
              format: format.toUpperCase(),
              error: result?.error
            })
          }
        } catch (err) {
          failCount++
          log.error('[Export]', `EXCEPTION: ${file.name} export threw error`, {
            inputPath: file.path,
            outputFolder,
            format: format.toUpperCase(),
            error: err
          })
        }
        
        // Yield control between exports so React can update the progress toast
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      // Remove progress toast and show result
      removeToast(toastId)
      
      log.info('[Export]', `Export batch complete`, {
        format: formatUpper,
        total: fileCount,
        succeeded: successCount,
        failed: failCount,
        outputFolder
      })
      
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
      // Clear processing state to re-enable file watcher
      usePDMStore.getState().removeProcessingFolders(filePaths)
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

  // Format configurations for each export type with their file counts
  const partFormats: Array<{ format: ExportFormat; label: string; colorClass: string; Icon: typeof Package; count: number }> = [
    { format: 'step', label: 'STEP', colorClass: 'text-emerald-400', Icon: Package, count: partAsmFiles.length },
    { format: 'iges', label: 'IGES', colorClass: 'text-amber-400', Icon: Package, count: partAsmFiles.length },
    { format: 'stl', label: 'STL', colorClass: 'text-violet-400', Icon: Package, count: partAsmFiles.length },
  ]

  const drawingFormats: Array<{ format: ExportFormat; label: string; colorClass: string; Icon: typeof Package; count: number }> = [
    { format: 'pdf', label: 'PDF', colorClass: 'text-red-400', Icon: FileOutput, count: drawingFiles.length },
    { format: 'dxf', label: 'DXF', colorClass: 'text-cyan-400', Icon: Download, count: drawingFiles.length },
  ]

  const renderExportSubmenu = (config: { format: ExportFormat; label: string; colorClass: string; Icon: typeof Package; count: number }) => {
    const { format, label, colorClass, Icon, count } = config
    const countLabel = count > 1 ? ` (${count})` : ''
    
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
      {hasPartsOrAsm && partFormats.map(renderExportSubmenu)}
      
      {hasDrawings && drawingFormats.map(renderExportSubmenu)}
      
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
