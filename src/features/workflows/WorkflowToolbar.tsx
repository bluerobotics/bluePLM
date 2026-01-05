// Workflow editor toolbar component
import { 
  Plus, 
  Edit3,
  X,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Move,
  MousePointer,
  ChevronDown,
  Grid,
  Settings2,
  Magnet,
  AlignVerticalJustifyCenter,
  Download,
  Upload,
  BadgeCheck
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import type { WorkflowTemplate, WorkflowState, CanvasMode } from '@/types/workflow'
import type { SnapSettings } from './types'

interface WorkflowToolbarProps {
  // Workflow data
  workflows: WorkflowTemplate[]
  selectedWorkflow: WorkflowTemplate | null
  states: WorkflowState[]
  isAdmin: boolean
  
  // Canvas state
  canvasMode: CanvasMode
  zoom: number
  isCreatingTransition: boolean
  
  // Snap settings
  snapSettings: SnapSettings
  showSnapSettings: boolean
  
  // Canvas ref for centering
  canvasRef: React.RefObject<HTMLDivElement | null>
  
  // Import ref
  importInputRef: React.RefObject<HTMLInputElement | null>
  
  // Actions
  selectWorkflow: (workflow: WorkflowTemplate) => void
  setShowCreateWorkflow: (show: boolean) => void
  setShowEditWorkflow: (show: boolean) => void
  setCanvasMode: (mode: CanvasMode) => void
  cancelConnectMode: () => void
  setZoom: (zoom: number) => void
  setPan: (pan: { x: number; y: number }) => void
  setSnapSettings: React.Dispatch<React.SetStateAction<SnapSettings>>
  setShowSnapSettings: (show: boolean) => void
  exportWorkflow: () => void
  importWorkflow: (file: File) => void
  addState: () => void
}

export function WorkflowToolbar({
  workflows,
  selectedWorkflow,
  states,
  isAdmin,
  canvasMode,
  zoom,
  isCreatingTransition,
  snapSettings,
  showSnapSettings,
  canvasRef,
  importInputRef,
  selectWorkflow,
  setShowCreateWorkflow,
  setShowEditWorkflow,
  setCanvasMode,
  cancelConnectMode,
  setZoom,
  setPan,
  setSnapSettings,
  setShowSnapSettings,
  exportWorkflow,
  importWorkflow,
  addState
}: WorkflowToolbarProps) {
  
  const handleResetZoom = () => {
    setZoom(1)
    // Center on content instead of origin
    if (states.length > 0) {
      const minX = Math.min(...states.map(s => s.position_x))
      const maxX = Math.max(...states.map(s => s.position_x))
      const minY = Math.min(...states.map(s => s.position_y))
      const maxY = Math.max(...states.map(s => s.position_y))
      const contentCenterX = (minX + maxX) / 2
      const contentCenterY = (minY + maxY) / 2
      const canvasWidth = canvasRef.current?.clientWidth || 800
      const canvasHeight = canvasRef.current?.clientHeight || 600
      setPan({ 
        x: (canvasWidth / 2) - contentCenterX, 
        y: (canvasHeight / 2) - contentCenterY 
      })
    } else {
      setPan({ x: 0, y: 0 })
    }
  }

  const navigateToRoles = () => {
    const { setActiveView } = usePDMStore.getState()
    setActiveView('settings')
    window.dispatchEvent(new CustomEvent('navigate-settings-tab', { detail: 'team-members' }))
    // Switch to users tab after a brief delay to ensure component mounts
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('navigate-team-members-tab', { detail: 'users' }))
    }, 50)
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-plm-border bg-plm-bg-light overflow-visible relative z-20">
      {/* Workflow selector */}
      <select
        value={selectedWorkflow?.id || ''}
        onChange={(e) => {
          const workflow = workflows.find(w => w.id === e.target.value)
          if (workflow) selectWorkflow(workflow)
        }}
        className="bg-plm-input border border-plm-border rounded px-2 py-1 text-sm min-w-[140px]"
        title={selectedWorkflow?.description || 'Select workflow'}
      >
        <option value="">Select workflow...</option>
        {workflows.map(w => (
          <option key={w.id} value={w.id}>
            {w.name} {w.is_default ? '(default)' : ''}
          </option>
        ))}
      </select>
      
      {isAdmin && (
        <button
          onClick={() => setShowCreateWorkflow(true)}
          className="p-1 hover:bg-plm-bg rounded text-plm-accent"
          title="Create new workflow"
        >
          <Plus size={14} />
        </button>
      )}
      
      {isAdmin && selectedWorkflow && (
        <button
          onClick={() => setShowEditWorkflow(true)}
          className="p-1 hover:bg-plm-bg rounded text-plm-fg-muted hover:text-plm-fg"
          title="Edit workflow name & description"
        >
          <Edit3 size={14} />
        </button>
      )}
      
      {selectedWorkflow && (
        <>
          <div className="w-px h-4 bg-plm-border mx-1" />
          <button
            onClick={() => {
              setCanvasMode('select')
              cancelConnectMode()
            }}
            className={`p-1.5 rounded ${canvasMode === 'select' && !isCreatingTransition ? 'bg-plm-accent text-white' : 'hover:bg-plm-bg'}`}
            title="Select mode (Esc)"
          >
            <MousePointer size={14} />
          </button>
          <button
            onClick={() => {
              setCanvasMode('pan')
              cancelConnectMode()
            }}
            className={`p-1.5 rounded ${canvasMode === 'pan' ? 'bg-plm-accent text-white' : 'hover:bg-plm-bg'}`}
            title="Pan mode"
          >
            <Move size={14} />
          </button>
          {isAdmin && (
            <button
              onClick={() => setCanvasMode('connect')}
              className={`p-1.5 rounded ${canvasMode === 'connect' || isCreatingTransition ? 'bg-green-600 text-white' : 'hover:bg-plm-bg'}`}
              title="Connect mode - draw transitions"
            >
              <ArrowRight size={14} />
            </button>
          )}
          
          {/* Cancel button when connecting */}
          {isCreatingTransition && (
            <button
              onClick={cancelConnectMode}
              className="p-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400"
              title="Cancel (Esc)"
            >
              <X size={14} />
            </button>
          )}
          
          <div className="w-px h-4 bg-plm-border mx-1" />
          
          <button
            onClick={() => setZoom(Math.min(2, zoom * 1.2))}
            className="p-1.5 hover:bg-plm-bg rounded"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <span className="text-xs text-plm-fg-muted min-w-[40px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(Math.max(0.25, zoom * 0.8))}
            className="p-1.5 hover:bg-plm-bg rounded"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 hover:bg-plm-bg rounded text-xs"
            title="Center on content"
          >
            1:1
          </button>
          
          <div className="w-px h-4 bg-plm-border mx-1" />
          
          {/* Snap settings button */}
          <div className="relative overflow-visible">
            <button
              onClick={() => setShowSnapSettings(!showSnapSettings)}
              className={`p-1.5 rounded flex items-center gap-1 ${
                (snapSettings.snapToGrid || snapSettings.snapToAlignment) 
                  ? 'bg-plm-accent/20 text-plm-accent' 
                  : 'hover:bg-plm-bg'
              }`}
              title="Snap settings"
            >
              <Magnet size={14} />
              <ChevronDown size={10} className={showSnapSettings ? 'rotate-180' : ''} />
            </button>
            
            {/* Snap settings dropdown */}
            {showSnapSettings && (
              <div className="absolute top-full left-0 mt-1 w-52 bg-plm-bg-light border border-plm-border rounded-lg shadow-lg z-[100] p-2.5">
                <div className="text-xs font-medium text-plm-fg mb-2 flex items-center gap-1.5">
                  <Settings2 size={11} />
                  Snap Settings
                </div>
                
                {/* Snap to Grid */}
                <label className="flex items-center gap-1.5 mb-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={snapSettings.snapToGrid}
                    onChange={(e) => setSnapSettings(prev => ({ ...prev, snapToGrid: e.target.checked }))}
                    className="rounded border-plm-border bg-plm-bg text-plm-accent focus:ring-plm-accent w-3 h-3"
                  />
                  <Grid size={11} className="text-plm-fg-muted group-hover:text-plm-fg shrink-0" />
                  <span className="text-[11px] text-plm-fg">Snap to Grid</span>
                </label>
                
                {/* Grid Size */}
                <div className="mb-1.5 pl-4">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="10"
                      value={snapSettings.gridSize}
                      onChange={(e) => setSnapSettings(prev => ({ ...prev, gridSize: parseInt(e.target.value) }))}
                      className="flex-1 h-1 bg-plm-border rounded appearance-none cursor-pointer min-w-0"
                    />
                    <span className="text-[10px] text-plm-fg-muted w-9 text-right shrink-0">{snapSettings.gridSize}px</span>
                  </div>
                </div>
                
                <div className="w-full h-px bg-plm-border my-1.5" />
                
                {/* Snap to Alignment */}
                <label className="flex items-center gap-1.5 mb-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={snapSettings.snapToAlignment}
                    onChange={(e) => setSnapSettings(prev => ({ ...prev, snapToAlignment: e.target.checked }))}
                    className="rounded border-plm-border bg-plm-bg text-plm-accent focus:ring-plm-accent w-3 h-3"
                  />
                  <AlignVerticalJustifyCenter size={11} className="text-plm-fg-muted group-hover:text-plm-fg shrink-0" />
                  <span className="text-[11px] text-plm-fg">Snap to Alignment</span>
                </label>
                
                {/* Alignment Threshold */}
                <div className="pl-4">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min="5"
                      max="30"
                      step="5"
                      value={snapSettings.alignmentThreshold}
                      onChange={(e) => setSnapSettings(prev => ({ ...prev, alignmentThreshold: parseInt(e.target.value) }))}
                      className="flex-1 h-1 bg-plm-border rounded appearance-none cursor-pointer min-w-0"
                    />
                    <span className="text-[10px] text-plm-fg-muted w-9 text-right shrink-0">{snapSettings.alignmentThreshold}px</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex-1" />
          
          {/* Export/Import buttons */}
          <button
            onClick={exportWorkflow}
            className="p-1.5 hover:bg-plm-bg rounded"
            title="Export workflow to JSON"
          >
            <Download size={14} />
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => importInputRef.current?.click()}
                className="p-1.5 hover:bg-plm-bg rounded"
                title="Import workflow from JSON"
              >
                <Upload size={14} />
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    importWorkflow(file)
                    e.target.value = '' // Reset input
                  }
                }}
              />
            </>
          )}
          
          <div className="w-px h-4 bg-plm-border mx-1" />
          
          {/* Workflow Roles link */}
          {isAdmin && (
            <button
              onClick={navigateToRoles}
              className="flex items-center gap-1 px-2 py-1 hover:bg-plm-bg rounded text-xs text-plm-fg-muted hover:text-plm-fg"
              title="Manage workflow roles (approval authorities)"
            >
              <BadgeCheck size={12} />
              Roles
            </button>
          )}
          
          <div className="w-px h-4 bg-plm-border mx-1" />
          
          {isAdmin && (
            <button
              onClick={addState}
              className="flex items-center gap-1 px-2 py-1 bg-plm-accent hover:bg-plm-accent-hover rounded text-white text-xs"
            >
              <Plus size={12} />
              Add State
            </button>
          )}
        </>
      )}
    </div>
  )
}
