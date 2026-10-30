/**
 * Export actions for SolidWorks files in context menu.
 * The exports themselves run in `exports/solidworksExport.ts`, through the queue the export
 * shortcuts share (`exports/quickExport.ts`).
 */
import { useState, useRef } from 'react'
import { Package, FileOutput, Download, Settings, FolderOpen, FolderDown, Zap } from 'lucide-react'
import type { ActionComponentProps } from './types'
import { usePDMStore } from '@/stores/pdmStore'
import { useSolidWorksStatus } from '@/hooks/useSolidWorksStatus'
import { useTranslation } from '@/lib/i18n'
import { isSolidWorksAlive } from '@/types/solidworks'
import { ContextSubmenu } from '../components'
import { enqueueExport } from '../../../exports/quickExport'
import type { ExportJobKind } from '../../../exports/exportQueue'
import { filesForFormat, type ExportFormat } from '../../../exports/solidworksExport'

type SubmenuKey = ExportJobKind

export function ExportActions({
  contextFiles,
  multiSelect: _multiSelect,
  firstFile: _firstFile,
  onClose,
}: ActionComponentProps) {
  const { t } = useTranslation()
  const { status, hasChecked: swStatusChecked } = useSolidWorksStatus()
  // Treat an unconfirmed status as available so the submenu doesn't disappear
  // before the first poll lands, or while the service is busy with other work.
  const swServiceRunning = !swStatusChecked || isSolidWorksAlive(status)
  const [exportSubmenu, setExportSubmenu] = useState<SubmenuKey | null>(null)
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const quickExportFolder = usePDMStore((s) => s.quickExportFolder)

  // Group by type for display
  const drawingFiles = filesForFormat('pdf', contextFiles)
  const partAsmFiles = filesForFormat('step', contextFiles)

  // Only show when service is running and we have exportable files
  if ((drawingFiles.length === 0 && partAsmFiles.length === 0) || !swServiceRunning) {
    return null
  }

  const hasDrawings = drawingFiles.length > 0
  const hasPartsOrAsm = partAsmFiles.length > 0

  const handleMouseEnterExport = (format: SubmenuKey) => {
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

  const filesFor = (kind: SubmenuKey) =>
    kind === 'pdf' || kind === 'dxf' || kind === 'step-from-drawing' ? drawingFiles : partAsmFiles

  const handleExport = (kind: SubmenuKey, outputFolder?: string) => {
    onClose()
    enqueueExport({ kind, files: filesFor(kind), outputFolder })
  }

  const handleExportTo = async (kind: SubmenuKey) => {
    // Open folder picker dialog
    const result = await window.electronAPI?.selectFolder()
    if (result?.success && result.folderPath) {
      handleExport(kind, result.folderPath)
    }
  }

  const renderDestinations = (kind: SubmenuKey, colorClass: string) => (
    <ContextSubmenu
      minWidth={140}
      onMouseEnter={() => {
        if (submenuTimeoutRef.current) {
          clearTimeout(submenuTimeoutRef.current)
        }
        setExportSubmenu(kind)
      }}
      onMouseLeave={handleMouseLeaveExport}
    >
      <div
        className="context-menu-item"
        onClick={(e) => {
          e.stopPropagation()
          handleExport(kind)
        }}
      >
        <FolderDown size={14} className={colorClass} />
        Export Here
      </div>
      <div
        className="context-menu-item"
        onClick={(e) => {
          e.stopPropagation()
          handleExportTo(kind)
        }}
      >
        <FolderOpen size={14} className="text-plm-fg-muted" />
        Export To...
      </div>
      {quickExportFolder && (
        <div
          className="context-menu-item"
          title={quickExportFolder}
          onClick={(e) => {
            e.stopPropagation()
            handleExport(kind, quickExportFolder)
          }}
        >
          <Zap size={14} className="text-plm-fg-muted" />
          {t('contextMenu.quickExport.toFolder')}
        </div>
      )}
    </ContextSubmenu>
  )

  // Format configurations for each export type with their file counts
  const partFormats: Array<{
    format: ExportFormat
    label: string
    colorClass: string
    Icon: typeof Package
    count: number
  }> = [
    {
      format: 'step',
      label: 'STEP',
      colorClass: 'text-emerald-400',
      Icon: Package,
      count: partAsmFiles.length,
    },
    {
      format: 'iges',
      label: 'IGES',
      colorClass: 'text-amber-400',
      Icon: Package,
      count: partAsmFiles.length,
    },
    {
      format: 'stl',
      label: 'STL',
      colorClass: 'text-violet-400',
      Icon: Package,
      count: partAsmFiles.length,
    },
  ]

  const drawingFormats: Array<{
    format: ExportFormat
    label: string
    colorClass: string
    Icon: typeof Package
    count: number
  }> = [
    {
      format: 'pdf',
      label: 'PDF',
      colorClass: 'text-red-400',
      Icon: FileOutput,
      count: drawingFiles.length,
    },
    {
      format: 'dxf',
      label: 'DXF',
      colorClass: 'text-cyan-400',
      Icon: Download,
      count: drawingFiles.length,
    },
  ]

  const renderExportSubmenu = (config: {
    format: ExportFormat
    label: string
    colorClass: string
    Icon: typeof Package
    count: number
  }) => {
    const { format, label, colorClass, Icon, count } = config
    const countLabel = count > 1 ? ` (${count})` : ''

    return (
      <div
        key={format}
        className="context-menu-item relative"
        onMouseEnter={() => handleMouseEnterExport(format)}
        onMouseLeave={handleMouseLeaveExport}
        onClick={(e) => {
          e.stopPropagation()
          setExportSubmenu(exportSubmenu === format ? null : format)
        }}
      >
        <Icon size={14} className={colorClass} />
        Export {label}
        {countLabel}
        <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
        {/* Export destination submenu */}
        {exportSubmenu === format && renderDestinations(format, colorClass)}
      </div>
    )
  }

  return (
    <>
      {hasPartsOrAsm && partFormats.map(renderExportSubmenu)}

      {hasDrawings && drawingFormats.map(renderExportSubmenu)}

      {/* Export STEP of the 3D model(s) referenced by selected drawings */}
      {hasDrawings && (
        <div
          key="step-from-drawing"
          className="context-menu-item relative"
          onMouseEnter={() => handleMouseEnterExport('step-from-drawing')}
          onMouseLeave={handleMouseLeaveExport}
          onClick={(e) => {
            e.stopPropagation()
            setExportSubmenu(exportSubmenu === 'step-from-drawing' ? null : 'step-from-drawing')
          }}
        >
          <Package size={14} className="text-emerald-400" />
          Export STEP (Model){drawingFiles.length > 1 ? ` (${drawingFiles.length})` : ''}
          <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
          {exportSubmenu === 'step-from-drawing' &&
            renderDestinations('step-from-drawing', 'text-emerald-400')}
        </div>
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
