import { useState, useMemo, useRef, useEffect } from 'react'
import {
  GripVertical,
  Lock,
  RotateCcw,
  Save,
  Download,
  Loader2,
  FolderTree,
  ArrowDownUp,
  Search,
  GitBranch,
  History,
  Trash2,
  Terminal,
  ClipboardList,
  Telescope,
  AlertCircle,
  ClipboardCheck,
  Package,
  Network,
  Calendar,
  Building2,
  Globe,
  Minus,
  Plus,
  X,
  ChevronRight,
  Palette,
  Pipette
} from 'lucide-react'
import { usePDMStore } from '../../stores/pdmStore'
import {
  MODULE_GROUPS,
  MODULES,
  canToggleModule,
  isModuleVisible,
  buildCombinedOrderList,
  getChildModules,
  type ModuleId,
  type OrderListItem
} from '../../types/modules'

// Custom Google Drive icon to match ActivityBar
function GoogleDriveIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8.24 2L1 14.19L4.24 19.83L11.47 7.64L8.24 2Z" fill="currentColor"/>
      <path d="M15.76 2H8.24L15.47 14.19H22.99L15.76 2Z" fill="currentColor" fillOpacity="0.7"/>
      <path d="M1 14.19L4.24 19.83H19.76L22.99 14.19H1Z" fill="currentColor" fillOpacity="0.4"/>
    </svg>
  )
}

// Icon mapping for modules
const moduleIcons: Record<string, React.ReactNode> = {
  FolderTree: <FolderTree size={16} />,
  ArrowDownUp: <ArrowDownUp size={16} />,
  Search: <Search size={16} />,
  GitBranch: <GitBranch size={16} />,
  History: <History size={16} />,
  Trash2: <Trash2 size={16} />,
  Terminal: <Terminal size={16} />,
  ClipboardList: <ClipboardList size={16} />,
  Telescope: <Telescope size={16} />,
  AlertCircle: <AlertCircle size={16} />,
  ClipboardCheck: <ClipboardCheck size={16} />,
  Package: <Package size={16} />,
  Network: <Network size={16} />,
  Calendar: <Calendar size={16} />,
  Building2: <Building2 size={16} />,
  Globe: <Globe size={16} />,
  GoogleDrive: <GoogleDriveIcon size={16} />,
}

// Preset colors for quick selection
const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#14b8a6', // teal
  '#84cc16', // lime
  '#a855f7', // purple
]

// Color picker component
function IconColorPicker({ 
  color, 
  onChange,
  onClose 
}: { 
  color: string | null
  onChange: (color: string | null) => void
  onClose: () => void
}) {
  const [customColor, setCustomColor] = useState(color || '#3b82f6')
  const inputRef = useRef<HTMLInputElement>(null)
  
  return (
    <div 
      className="absolute right-0 top-full mt-1 w-56 bg-plm-bg border border-plm-border rounded-lg shadow-xl z-50 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] uppercase tracking-wide text-plm-fg-muted mb-2">
        Icon Color
      </div>
      
      {/* Preset colors grid */}
      <div className="grid grid-cols-6 gap-1.5 mb-3">
        {PRESET_COLORS.map(presetColor => (
          <button
            key={presetColor}
            onClick={() => {
              onChange(presetColor)
              onClose()
            }}
            className={`w-7 h-7 rounded-md border-2 transition-all hover:scale-110 ${
              color === presetColor ? 'border-plm-fg ring-2 ring-plm-accent' : 'border-transparent'
            }`}
            style={{ backgroundColor: presetColor }}
            title={presetColor}
          />
        ))}
      </div>
      
      {/* Custom color picker */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <input
            ref={inputRef}
            type="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-plm-border"
          />
        </div>
        <input
          type="text"
          value={customColor}
          onChange={(e) => {
            const val = e.target.value
            if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
              setCustomColor(val)
            }
          }}
          placeholder="#000000"
          className="flex-1 px-2 py-1.5 text-xs bg-plm-bg-secondary border border-plm-border rounded font-mono"
        />
        <button
          onClick={() => {
            onChange(customColor)
            onClose()
          }}
          className="px-2 py-1.5 text-xs bg-plm-accent text-white rounded hover:bg-plm-accent/80 transition-colors"
        >
          Apply
        </button>
      </div>
      
      {/* Reset to default */}
      <button
        onClick={() => {
          onChange(null)
          onClose()
        }}
        className={`w-full px-3 py-2 text-xs text-left rounded transition-colors flex items-center gap-2 ${
          !color ? 'bg-plm-accent/20 text-plm-accent' : 'hover:bg-plm-highlight text-plm-fg-muted'
        }`}
      >
        <RotateCcw size={12} />
        Use default color
      </button>
    </div>
  )
}

// Combined order list item (module or divider)
function OrderListItemComponent({
  item,
  index,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isDropTarget,
  onSetParent,
  onSetIconColor
}: {
  item: OrderListItem
  index: number
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (index: number) => void
  isDragging: boolean
  isDropTarget: boolean
  onSetParent?: (moduleId: ModuleId, parentId: ModuleId | null) => void
  onSetIconColor?: (moduleId: ModuleId, color: string | null) => void
}) {
  const { moduleConfig, setModuleEnabled, removeDivider } = usePDMStore()
  const [showParentSelect, setShowParentSelect] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!showParentSelect && !showColorPicker) return
    
    const handleClickOutside = () => {
      setShowParentSelect(false)
      setShowColorPicker(false)
    }
    
    // Delay to prevent immediate close
    const timeout = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)
    
    return () => {
      clearTimeout(timeout)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [showParentSelect, showColorPicker])
  
  if (item.type === 'divider') {
    return (
      <div
        draggable
        onDragStart={() => onDragStart(index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={() => onDrop(index)}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all cursor-move ${
          isDragging 
            ? 'opacity-50 border-plm-accent bg-plm-accent/10' 
            : isDropTarget
            ? 'border-plm-accent border-dashed bg-plm-accent/5'
            : 'border-plm-border bg-plm-bg-secondary'
        }`}
      >
        <GripVertical size={14} className="text-plm-fg-muted flex-shrink-0" />
        <div className="flex items-center gap-2 flex-1">
          <Minus size={16} className="text-plm-fg-muted" />
          <span className="text-xs text-plm-fg-muted font-medium uppercase tracking-wide">
            Divider
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeDivider(item.id)
          }}
          className="p-1 text-plm-fg-muted hover:text-plm-error rounded transition-colors"
          title="Remove divider"
        >
          <X size={14} />
        </button>
      </div>
    )
  }
  
  // Module item
  const moduleId = item.id as ModuleId
  const module = MODULES.find(m => m.id === moduleId)
  if (!module) return null
  
  const isVisible = isModuleVisible(moduleId, moduleConfig)
  const canToggle = canToggleModule(moduleId, moduleConfig)
  const isGroupEnabled = moduleConfig.enabledGroups[module.group]
  const group = MODULE_GROUPS.find(g => g.id === module.group)
  const isDisabledByGroup = group?.isMasterToggle && !isGroupEnabled
  
  const isEnabled = moduleConfig.enabledModules[moduleId]
  
  // Get current parent and children count
  const currentParentId = moduleConfig.moduleParents?.[moduleId] || null
  const currentParent = currentParentId ? MODULES.find(m => m.id === currentParentId) : null
  const childCount = getChildModules(moduleId, moduleConfig).length
  
  // Get custom icon color
  const customIconColor = moduleConfig.moduleIconColors?.[moduleId] || null
  
  // Get available parents (all modules except self and descendants)
  const getDescendants = (id: ModuleId): ModuleId[] => {
    const children = getChildModules(id, moduleConfig)
    return [id, ...children.flatMap(c => getDescendants(c.id))]
  }
  const descendants = getDescendants(moduleId)
  const availableParents = MODULES.filter(m => !descendants.includes(m.id))
  
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-move ${
        isDragging 
          ? 'opacity-50 border-plm-accent bg-plm-accent/10' 
          : isDropTarget
          ? 'border-plm-accent border-dashed bg-plm-accent/5'
          : isEnabled && isVisible
          ? 'border-plm-success/30 bg-gradient-to-r from-plm-success/5 to-transparent hover:from-plm-success/10 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.1)]'
          : isVisible
          ? 'border-plm-border bg-plm-bg hover:bg-plm-highlight/50'
          : 'border-plm-border/50 bg-plm-bg-secondary'
      } ${currentParentId ? 'ml-6 border-l-2 border-l-plm-accent/30' : ''}`}
    >
      <GripVertical size={14} className="text-plm-fg-muted flex-shrink-0" />
      
      {/* Icon with custom color support */}
      <div 
        className={`p-1.5 rounded-md transition-all ${
          !customIconColor && (isEnabled && isVisible 
            ? 'text-plm-success bg-plm-success/10' 
            : isVisible 
            ? 'text-plm-accent' 
            : 'text-plm-fg-muted')
        }`}
        style={customIconColor ? { 
          color: customIconColor,
          backgroundColor: `${customIconColor}15`
        } : undefined}
      >
        {moduleIcons[module.icon] || <Package size={16} />}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${isVisible ? 'text-plm-fg' : 'text-plm-fg-muted'}`}>
            {module.name}
          </span>
          {module.required && (
            <span title="Required when group enabled">
              <Lock size={10} className="text-plm-fg-dim" />
            </span>
          )}
          {childCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-plm-accent/20 text-plm-accent" title={`Has ${childCount} sub-item${childCount > 1 ? 's' : ''}`}>
              <ChevronRight size={10} />
              {childCount}
            </span>
          )}
        </div>
        {currentParent && (
          <div className="text-[10px] text-plm-fg-dim mt-0.5">
            Sub-item of: {currentParent.name}
          </div>
        )}
      </div>
      
      {/* Color picker button */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowColorPicker(!showColorPicker)
            setShowParentSelect(false)
          }}
          className={`p-1.5 rounded transition-colors ${
            customIconColor 
              ? 'hover:bg-plm-highlight' 
              : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight'
          }`}
          title="Set icon color"
        >
          {customIconColor ? (
            <div 
              className="w-3.5 h-3.5 rounded-full border border-white/30"
              style={{ backgroundColor: customIconColor }}
            />
          ) : (
            <Palette size={14} />
          )}
        </button>
        
        {/* Color picker dropdown */}
        {showColorPicker && (
          <IconColorPicker
            color={customIconColor}
            onChange={(color) => onSetIconColor?.(moduleId, color)}
            onClose={() => setShowColorPicker(false)}
          />
        )}
      </div>
      
      {/* Parent selector button */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowParentSelect(!showParentSelect)
            setShowColorPicker(false)
          }}
          className={`p-1.5 rounded transition-colors ${
            currentParentId 
              ? 'text-plm-accent bg-plm-accent/10 hover:bg-plm-accent/20' 
              : 'text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight'
          }`}
          title="Set parent module (create sub-group)"
        >
          <ChevronRight size={14} className={currentParentId ? 'rotate-90' : ''} />
        </button>
        
        {/* Parent selection dropdown */}
        {showParentSelect && (
          <div 
            className="absolute right-0 top-full mt-1 w-48 bg-plm-bg border border-plm-border rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-plm-fg-muted border-b border-plm-border">
              Set Parent
            </div>
            <button
              onClick={() => {
                onSetParent?.(moduleId, null)
                setShowParentSelect(false)
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-plm-highlight transition-colors flex items-center gap-2 ${
                !currentParentId ? 'text-plm-accent' : 'text-plm-fg'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${!currentParentId ? 'bg-plm-accent' : 'bg-transparent border border-plm-border'}`} />
              None (Top-level)
            </button>
            {availableParents.map(parent => (
              <button
                key={parent.id}
                onClick={() => {
                  onSetParent?.(moduleId, parent.id)
                  setShowParentSelect(false)
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-plm-highlight transition-colors flex items-center gap-2 ${
                  currentParentId === parent.id ? 'text-plm-accent' : 'text-plm-fg'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${currentParentId === parent.id ? 'bg-plm-accent' : 'bg-transparent border border-plm-border'}`} />
                <span className="text-plm-fg-muted mr-1">
                  {moduleIcons[parent.icon] || <Package size={12} />}
                </span>
                {parent.name}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Status badges */}
      <div className="flex items-center gap-2">
        {isDisabledByGroup && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-plm-bg-lighter text-plm-fg-dim">
            GROUP OFF
          </span>
        )}
      </div>
      
      {/* Toggle - Enhanced visual state */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (canToggle && !isDisabledByGroup) {
            setModuleEnabled(moduleId, !moduleConfig.enabledModules[moduleId])
          }
        }}
        disabled={!canToggle || isDisabledByGroup}
        className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
          (!canToggle || isDisabledByGroup) ? 'opacity-40 cursor-not-allowed' : ''
        } ${
          moduleConfig.enabledModules[moduleId]
            ? 'bg-plm-success/20 border border-plm-success/40 hover:bg-plm-success/30'
            : 'bg-plm-bg-secondary border border-plm-border hover:bg-plm-highlight/50'
        }`}
        title={!canToggle ? 'This module cannot be disabled' : isDisabledByGroup ? 'Enable the group first' : undefined}
      >
        {/* Status indicator dot */}
        <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
          moduleConfig.enabledModules[moduleId]
            ? 'bg-plm-success shadow-[0_0_8px_2px_rgba(34,197,94,0.4)] animate-pulse'
            : 'bg-plm-fg-dim'
        }`} />
        
        {/* Status text */}
        <span className={`text-xs font-medium uppercase tracking-wide transition-colors ${
          moduleConfig.enabledModules[moduleId]
            ? 'text-plm-success'
            : 'text-plm-fg-muted'
        }`}>
          {moduleConfig.enabledModules[moduleId] ? 'On' : 'Off'}
        </span>
      </button>
    </div>
  )
}

export function ModulesSettings() {
  const { 
    moduleConfig, 
    setCombinedOrder,
    addDivider,
    setModuleParent,
    setModuleIconColor,
    resetModulesToDefaults,
    loadOrgModuleDefaults,
    saveOrgModuleDefaults,
    getEffectiveRole
  } = usePDMStore()
  
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null)
  
  const isAdmin = getEffectiveRole() === 'admin'
  
  // Build combined list for display
  const combinedList = useMemo(() => {
    return buildCombinedOrderList(moduleConfig.moduleOrder, moduleConfig.dividers)
  }, [moduleConfig.moduleOrder, moduleConfig.dividers])
  
  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDropTargetIndex(index)
  }
  
  const handleDrop = (toIndex: number) => {
    if (dragIndex !== null && dragIndex !== toIndex) {
      const newList = [...combinedList]
      const [removed] = newList.splice(dragIndex, 1)
      newList.splice(toIndex, 0, removed)
      setCombinedOrder(newList)
    }
    setDragIndex(null)
    setDropTargetIndex(null)
  }
  
  const handleDragEnd = () => {
    setDragIndex(null)
    setDropTargetIndex(null)
  }
  
  const handleAddDivider = () => {
    // Add divider at the end
    addDivider(moduleConfig.moduleOrder.length - 1)
  }
  
  const handleSaveOrgDefaults = async () => {
    setIsSaving(true)
    setSaveResult(null)
    try {
      const result = await saveOrgModuleDefaults()
      setSaveResult(result.success ? 'success' : 'error')
      setTimeout(() => setSaveResult(null), 3000)
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleLoadOrgDefaults = async () => {
    setIsLoading(true)
    try {
      await loadOrgModuleDefaults()
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-plm-fg">Modules</h1>
          <p className="text-sm text-plm-fg-muted mt-1">
            Enable, disable, and reorder sidebar modules
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleSaveOrgDefaults}
              disabled={isSaving}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                saveResult === 'success'
                  ? 'bg-plm-success/20 text-plm-success border border-plm-success/30'
                  : saveResult === 'error'
                  ? 'bg-plm-error/20 text-plm-error border border-plm-error/30'
                  : 'bg-plm-accent text-white hover:bg-plm-accent/80'
              }`}
              title="Save as organization defaults for new members"
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {saveResult === 'success' ? 'Saved!' : saveResult === 'error' ? 'Failed' : 'Save Defaults'}
            </button>
          )}
          <button
            onClick={handleLoadOrgDefaults}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-plm-border text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors disabled:opacity-50"
            title="Load organization defaults"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Load Defaults
          </button>
          <button
            onClick={resetModulesToDefaults}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-plm-border text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors"
            title="Reset to factory defaults"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>
      
      {/* Combined Order List */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
            Sidebar Order
          </h2>
          <button
            onClick={handleAddDivider}
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-plm-border text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors"
            title="Add a section divider"
          >
            <Plus size={12} />
            Add Divider
          </button>
        </div>
        
        <div className="p-4 bg-plm-bg rounded-lg border border-plm-border">
          <p className="text-sm text-plm-fg-muted mb-4">
            Drag to reorder. Toggle to enable/disable. Disabling a module hides its dependents.
          </p>
          <div className="space-y-2" onDragEnd={handleDragEnd}>
            {combinedList.map((item, index) => (
              <OrderListItemComponent
                key={item.type === 'module' ? item.id : `divider-${item.id}`}
                item={item}
                index={index}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragging={dragIndex === index}
                isDropTarget={dropTargetIndex === index && dragIndex !== index}
                onSetParent={setModuleParent}
              />
            ))}
          </div>
        </div>
      </section>
      
      {/* Legend */}
      <section className="pt-2">
        <div className="flex flex-wrap gap-4 text-xs text-plm-fg-dim">
          <div className="flex items-center gap-1.5">
            <Lock size={10} />
            <span>Required module</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Minus size={10} />
            <span>Section divider</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ChevronRight size={10} />
            <span>Has sub-items / Set parent</span>
          </div>
        </div>
      </section>
      
      {/* Submenu Info */}
      <section className="pt-2 pb-4">
        <div className="p-3 bg-plm-accent/5 border border-plm-accent/20 rounded-lg">
          <div className="text-sm text-plm-fg font-medium mb-1">Creating Sub-menus</div>
          <p className="text-xs text-plm-fg-muted">
            Click the <ChevronRight size={10} className="inline" /> button on any module to set its parent. 
            Child modules will appear as a fly-out submenu when hovering their parent in the sidebar.
            You can nest up to 10 levels deep!
          </p>
        </div>
      </section>
    </div>
  )
}
