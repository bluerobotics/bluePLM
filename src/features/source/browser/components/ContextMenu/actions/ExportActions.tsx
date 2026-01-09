/**
 * Export actions for SolidWorks files in context menu
 * Uses the same export logic as configuration exports
 */
import { useState } from 'react'
import { Loader2, Package, FileOutput, Download, Settings } from 'lucide-react'
import type { ActionComponentProps } from './types'
import { usePDMStore } from '@/stores/pdmStore'
import { useSolidWorksStatus } from '@/hooks/useSolidWorksStatus'
import { getEffectiveExportSettings } from '@/features/settings/system'
import { getSerializationSettings, combineBaseAndTab } from '@/lib/serialization'
import { log } from '@/lib/logger'

export function ExportActions({
  contextFiles,
  multiSelect,
  firstFile,
  onClose,
}: ActionComponentProps) {
  const { status } = useSolidWorksStatus()
  const swServiceRunning = status.running
  const [isExporting, setIsExporting] = useState<string | null>(null)
  const { addToast, organization } = usePDMStore()

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

  const handleExport = async (format: 'step' | 'iges' | 'stl' | 'pdf' | 'dxf') => {
    setIsExporting(format)
    onClose()

    const filesToExport = multiSelect ? contextFiles : [firstFile]
    const fileCount = filesToExport.length
    const formatUpper = format.toUpperCase()

    addToast('info', `Exporting ${formatUpper}${fileCount > 1 ? ` for ${fileCount} files` : ''}...`)

    try {
      let successCount = 0
      let failCount = 0

      for (const file of filesToExport) {
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
              result = await window.electronAPI?.solidworks?.exportPdf(file.path)
              break
            case 'step':
              result = await window.electronAPI?.solidworks?.exportStep(file.path, {
                exportAllConfigs: true,
                filenamePattern,
                pdmMetadata
              })
              break
            case 'iges':
              result = await window.electronAPI?.solidworks?.exportIges(file.path, {
                exportAllConfigs: true
              })
              break
            case 'stl':
              result = await window.electronAPI?.solidworks?.exportStl?.(file.path, {
                exportAllConfigs: true
              })
              break
            case 'dxf':
              result = await window.electronAPI?.solidworks?.exportDxf(file.path)
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

      // Show result toast
      if (successCount > 0 && failCount === 0) {
        addToast('success', `Exported ${successCount} ${formatUpper} file${successCount > 1 ? 's' : ''}`)
      } else if (successCount > 0 && failCount > 0) {
        addToast('warning', `Exported ${successCount}, failed ${failCount}`)
      } else {
        addToast('error', `Failed to export ${formatUpper}`)
      }
    } catch (err) {
      addToast('error', `Export failed: ${err}`)
    } finally {
      setIsExporting(null)
    }
  }

  const fileCount = multiSelect ? contextFiles.length : 1
  const countLabel = fileCount > 1 ? ` (${fileCount})` : ''

  return (
    <>
      <div className="context-menu-separator" />
      
      {isPartOrAsm && (
        <>
          <div 
            className={`context-menu-item ${isExporting ? 'opacity-50' : ''}`}
            onClick={() => !isExporting && handleExport('step')}
          >
            {isExporting === 'step' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Package size={14} className="text-emerald-400" />
            )}
            Export STEP{countLabel}
          </div>
          <div 
            className={`context-menu-item ${isExporting ? 'opacity-50' : ''}`}
            onClick={() => !isExporting && handleExport('iges')}
          >
            {isExporting === 'iges' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Package size={14} className="text-amber-400" />
            )}
            Export IGES{countLabel}
          </div>
          <div 
            className={`context-menu-item ${isExporting ? 'opacity-50' : ''}`}
            onClick={() => !isExporting && handleExport('stl')}
          >
            {isExporting === 'stl' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Package size={14} className="text-violet-400" />
            )}
            Export STL{countLabel}
          </div>
        </>
      )}
      
      {isDrawing && (
        <>
          <div 
            className={`context-menu-item ${isExporting ? 'opacity-50' : ''}`}
            onClick={() => !isExporting && handleExport('pdf')}
          >
            {isExporting === 'pdf' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileOutput size={14} className="text-red-400" />
            )}
            Export PDF{countLabel}
          </div>
          <div 
            className={`context-menu-item ${isExporting ? 'opacity-50' : ''}`}
            onClick={() => !isExporting && handleExport('dxf')}
          >
            {isExporting === 'dxf' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} className="text-cyan-400" />
            )}
            Export DXF{countLabel}
          </div>
        </>
      )}
      
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
