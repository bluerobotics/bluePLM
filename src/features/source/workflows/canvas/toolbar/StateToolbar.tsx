/**
 * StateToolbar - Toolbar controls for workflow states
 */
import { useState } from 'react'
import { Edit3, Trash2, Copy } from 'lucide-react'
import { ColorPicker, DEFAULT_PRESET_COLORS } from '@/components/shared/ColorPicker'
import { TickSlider } from '../TickSlider'
import type { WorkflowState } from '@/types/workflow'

// Additional preset colors for workflow toolbar
const WORKFLOW_ADDITIONAL_COLORS = [
  '#10b981', // emerald
  '#0ea5e9', // sky
  '#d946ef', // fuchsia
  '#f5f5f4', // white
  '#a8a29e', // stone
  '#1f2937', // slate-dark
]

interface StateToolbarProps {
  targetState: WorkflowState
  isAdmin: boolean
  onColorChange: (color: string) => void
  onFillOpacityChange?: (opacity: number) => void
  onBorderColorChange?: (color: string | null) => void
  onBorderOpacityChange?: (opacity: number) => void
  onBorderThicknessChange?: (thickness: number) => void
  onCornerRadiusChange?: (radius: number) => void
  onShapeChange?: (shape: 'rectangle' | 'diamond' | 'hexagon' | 'ellipse') => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  closeAllDropdowns: () => void
}

export function StateToolbar({
  targetState,
  isAdmin,
  onColorChange,
  onFillOpacityChange,
  onBorderColorChange,
  onBorderOpacityChange,
  onBorderThicknessChange,
  onCornerRadiusChange,
  onShapeChange,
  onEdit,
  onDuplicate,
  onDelete,
  closeAllDropdowns
}: StateToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showBoxStyles, setShowBoxStyles] = useState(false)
  const [_showBorderColorPicker, _setShowBorderColorPicker] = useState(false)
  
  const currentColor = targetState.color || '#6b7280'
  const currentFillOpacity = targetState.fill_opacity ?? 1
  const currentBorderColor = targetState.border_color || null
  const currentBorderOpacity = targetState.border_opacity ?? 1
  const currentStateBorderThickness = targetState.border_thickness ?? 2
  const currentCornerRadius = targetState.corner_radius ?? 8
  
  const handleCloseDropdowns = () => {
    setShowColorPicker(false)
    setShowBoxStyles(false)
    _setShowBorderColorPicker(false)
    closeAllDropdowns()
  }
  
  return (
    <>
      {/* Color button */}
      <div className="relative">
        <button
          onClick={() => {
            handleCloseDropdowns()
            setShowColorPicker(!showColorPicker)
          }}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-plm-highlight transition-colors"
          title="Fill color"
        >
          <div 
            className="w-5 h-5 rounded border-2 border-plm-fg/30"
            style={{ backgroundColor: currentColor }}
          />
        </button>
        
        {showColorPicker && (
          <ColorPicker
            color={currentColor}
            onChange={(color) => {
              if (color) onColorChange(color)
            }}
            onClose={handleCloseDropdowns}
            showReset={false}
            title="Fill Color"
            additionalPresets={WORKFLOW_ADDITIONAL_COLORS}
            position="left"
          />
        )}
      </div>
      
      {/* Divider */}
      <div className="w-px h-5 bg-plm-border mx-0.5" />
      
      {/* Box styling button */}
      <div className="relative">
        <button
          onClick={() => {
            handleCloseDropdowns()
            setShowBoxStyles(!showBoxStyles)
          }}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-plm-highlight transition-colors"
          title="Box styling"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" className="text-plm-fg-muted">
            <rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        
        {/* Box styling dropdown */}
        {showBoxStyles && (
          <div 
            className="absolute top-full left-0 mt-1 p-3 bg-plm-sidebar rounded-lg shadow-xl border border-plm-border z-50 w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fill Color */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wide text-plm-fg-muted mb-2">Fill Color</div>
              <div className="grid grid-cols-7 gap-1">
                {/* No fill button */}
                <button
                  onClick={() => onFillOpacityChange?.(0)}
                  className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${
                    currentFillOpacity === 0 
                      ? 'border-plm-fg bg-plm-bg' 
                      : 'border-plm-border bg-plm-bg hover:bg-plm-highlight'
                  }`}
                  title="No fill"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" className="text-plm-fg-muted">
                    <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
                  </svg>
                </button>
                {/* Color presets */}
                {DEFAULT_PRESET_COLORS.slice(0, 13).map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      onColorChange(color)
                      if (currentFillOpacity === 0) onFillOpacityChange?.(1)
                    }}
                    className={`w-5 h-5 rounded transition-transform hover:scale-105 ${
                      currentColor === color && currentFillOpacity > 0 ? 'ring-2 ring-plm-fg ring-offset-1 ring-offset-plm-sidebar' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            
            {/* Fill Opacity */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wide text-plm-fg-muted mb-2 flex items-center justify-between">
                <span>Fill Opacity</span>
                <span className="text-plm-fg-muted">{Math.round(currentFillOpacity * 100)}%</span>
              </div>
              <TickSlider
                value={currentFillOpacity * 100}
                min={0}
                max={100}
                step={1}
                snapPoints={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                onChange={(val) => onFillOpacityChange?.(val / 100)}
              />
            </div>
            
            {/* Border Color */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wide text-plm-fg-muted mb-2">Border Color</div>
              <div className="grid grid-cols-7 gap-1">
                {/* No border / same as fill button */}
                <button
                  onClick={() => {
                    onBorderColorChange?.(null)
                    _setShowBorderColorPicker(false)
                  }}
                  className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${
                    currentBorderColor === null 
                      ? 'border-plm-fg bg-plm-bg' 
                      : 'border-plm-border bg-plm-bg hover:bg-plm-highlight'
                  }`}
                  title="Same as fill"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" className="text-plm-fg-muted">
                    <rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
                  </svg>
                </button>
                {/* Color presets */}
                {DEFAULT_PRESET_COLORS.slice(0, 13).map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      onBorderColorChange?.(color)
                    }}
                    className={`w-5 h-5 rounded transition-transform hover:scale-105 ${
                      currentBorderColor === color ? 'ring-2 ring-plm-fg ring-offset-1 ring-offset-plm-sidebar' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            
            {/* Border Opacity */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wide text-plm-fg-muted mb-2 flex items-center justify-between">
                <span>Border Opacity</span>
                <span className="text-plm-fg-muted">{Math.round(currentBorderOpacity * 100)}%</span>
              </div>
              <TickSlider
                value={currentBorderOpacity * 100}
                min={0}
                max={100}
                step={1}
                snapPoints={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                onChange={(val) => onBorderOpacityChange?.(val / 100)}
              />
            </div>
            
            {/* Border Thickness */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wide text-plm-fg-muted mb-2 flex items-center justify-between">
                <span>Border Thickness</span>
                <span className="text-plm-fg-muted">{currentStateBorderThickness}px</span>
              </div>
              <TickSlider
                value={currentStateBorderThickness}
                min={1}
                max={6}
                step={1}
                snapPoints={[1, 2, 3, 4, 5, 6]}
                onChange={(val) => onBorderThicknessChange?.(val)}
              />
            </div>
            
            {/* Corner Radius - only for rectangle */}
            {(targetState.shape === 'rectangle' || !targetState.shape) && (
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-wide text-plm-fg-muted mb-2 flex items-center justify-between">
                  <span>Corner Radius</span>
                  <span className="text-plm-fg-muted">{currentCornerRadius}px</span>
                </div>
                <TickSlider
                  value={currentCornerRadius}
                  min={0}
                  max={24}
                  step={1}
                  snapPoints={[0, 4, 8, 12, 16, 20, 24]}
                  onChange={(val) => onCornerRadiusChange?.(val)}
                />
              </div>
            )}
            
            {/* Shape */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-plm-fg-muted mb-2">Shape</div>
              <div className="flex gap-1">
                {/* Rectangle */}
                <button
                  onClick={() => onShapeChange?.('rectangle')}
                  className={`w-8 h-8 rounded flex items-center justify-center transition-colors border ${
                    (targetState.shape || 'rectangle') === 'rectangle'
                      ? 'border-plm-fg bg-plm-highlight'
                      : 'border-plm-border bg-plm-bg hover:bg-plm-highlight'
                  }`}
                  title="Rectangle"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" className="text-plm-fg">
                    <rect x="2" y="4" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
                {/* Diamond */}
                <button
                  onClick={() => onShapeChange?.('diamond')}
                  className={`w-8 h-8 rounded flex items-center justify-center transition-colors border ${
                    targetState.shape === 'diamond'
                      ? 'border-plm-fg bg-plm-highlight'
                      : 'border-plm-border bg-plm-bg hover:bg-plm-highlight'
                  }`}
                  title="Diamond (for approval gates)"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" className="text-plm-fg">
                    <polygon points="8,2 14,8 8,14 2,8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </button>
                {/* Hexagon */}
                <button
                  onClick={() => onShapeChange?.('hexagon')}
                  className={`w-8 h-8 rounded flex items-center justify-center transition-colors border ${
                    targetState.shape === 'hexagon'
                      ? 'border-plm-fg bg-plm-highlight'
                      : 'border-plm-border bg-plm-bg hover:bg-plm-highlight'
                  }`}
                  title="Hexagon"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" className="text-plm-fg">
                    <polygon points="4,2 12,2 15,8 12,14 4,14 1,8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </button>
                {/* Ellipse */}
                <button
                  onClick={() => onShapeChange?.('ellipse')}
                  className={`w-8 h-8 rounded flex items-center justify-center transition-colors border ${
                    targetState.shape === 'ellipse'
                      ? 'border-plm-fg bg-plm-highlight'
                      : 'border-plm-border bg-plm-bg hover:bg-plm-highlight'
                  }`}
                  title="Ellipse"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" className="text-plm-fg">
                    <ellipse cx="8" cy="8" rx="6" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Edit button */}
      <button
        onClick={onEdit}
        className="flex items-center justify-center w-8 h-8 rounded hover:bg-plm-highlight transition-colors text-plm-fg-muted hover:text-plm-fg"
        title="Edit state"
      >
        <Edit3 size={16} />
      </button>
      
      {/* Duplicate button */}
      {isAdmin && (
        <button
          onClick={onDuplicate}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-plm-highlight transition-colors text-plm-fg-muted hover:text-plm-fg"
          title="Duplicate"
        >
          <Copy size={16} />
        </button>
      )}
      
      {/* Divider */}
      <div className="w-px h-5 bg-plm-border mx-0.5" />
      
      {/* Delete */}
      {isAdmin && (
        <button
          onClick={onDelete}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-plm-error/20 transition-colors text-plm-fg-muted hover:text-plm-error"
          title="Delete state"
        >
          <Trash2 size={16} />
        </button>
      )}
    </>
  )
}
