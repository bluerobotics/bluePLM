import { useState, useEffect } from 'react'
import { Monitor, RotateCcw, ChevronDown, Layers, ChevronRight, Timer, Activity } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { ReferenceDiagnostics } from '@/features/dev-tools/reference-diagnostics'
import { FileOperationTiming } from '@/features/dev-tools/performance'
import { FileOperationLog } from '@/features/dev-tools/operation-log'

interface DevicePreset {
  id: string
  name: string
  width: number
  height: number
}

const devicePresets: DevicePreset[] = [
  { id: 'iphone', name: 'iPhone 14', width: 390, height: 844 },
  { id: 'android', name: 'Android', width: 412, height: 915 },
  { id: 'ipad', name: 'iPad', width: 820, height: 1180 },
  { id: 'ipad-pro', name: 'iPad Pro', width: 1024, height: 1366 },
  { id: 'laptop', name: 'Laptop', width: 1366, height: 768 },
  { id: 'desktop', name: 'Desktop', width: 1920, height: 1080 },
]

export function DevToolsSettings() {
  const { addToast } = usePDMStore()
  const [currentSize, setCurrentSize] = useState<{ width: number; height: number } | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [showRefDiagnostics, setShowRefDiagnostics] = useState(false)
  const [showTimingDashboard, setShowTimingDashboard] = useState(true)
  const [showOperationLog, setShowOperationLog] = useState(true)

  useEffect(() => {
    const fetchSize = async () => {
      const size = await window.electronAPI?.getWindowSize?.()
      if (size) setCurrentSize(size)
    }
    fetchSize()
  }, [])

  const handlePresetChange = async (presetId: string) => {
    if (!presetId) return
    const preset = devicePresets.find(p => p.id === presetId)
    if (!preset || !window.electronAPI?.setWindowSize) return

    const result = await window.electronAPI.setWindowSize(preset.width, preset.height)
    if (result.success) {
      setCurrentSize({ width: preset.width, height: preset.height })
      setSelectedPreset(presetId)
    } else {
      addToast('error', result.error || 'Failed to resize')
    }
  }

  const handleReset = async () => {
    const result = await window.electronAPI?.resetWindowSize?.()
    if (result?.success) {
      setCurrentSize(result.size || null)
      setSelectedPreset('')
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold text-plm-fg mb-1">Developer Tools</h1>
        <p className="text-sm text-plm-fg-muted">Testing and development utilities</p>
      </section>

      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
          Window Size
        </h2>
        <div className="bg-plm-bg rounded-lg border border-plm-border p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-plm-fg-muted">
              <Monitor size={16} />
              <span className="font-mono text-sm text-plm-fg">
                {currentSize ? `${currentSize.width}×${currentSize.height}` : '—'}
              </span>
            </div>
            
            <div className="relative flex-1 max-w-[200px]">
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full appearance-none bg-plm-input border border-plm-border rounded px-3 py-1.5 pr-8 text-sm text-plm-fg focus:outline-none focus:border-plm-accent cursor-pointer"
              >
                <option value="">Select preset...</option>
                {devicePresets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} ({preset.width}×{preset.height})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted pointer-events-none" />
            </div>

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-plm-highlight hover:bg-plm-highlight/80 text-plm-fg rounded transition-colors"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
          File Operation Timing
        </h2>
        <div className="bg-plm-bg rounded-lg border border-plm-border overflow-hidden">
          <button
            onClick={() => setShowTimingDashboard(!showTimingDashboard)}
            className="w-full flex items-center gap-3 p-4 hover:bg-plm-highlight transition-colors"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Timer size={16} className="text-emerald-400" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium text-plm-fg">Performance Timing Dashboard</div>
              <div className="text-xs text-plm-fg-muted">
                Monitor folderMetrics, store updates, and file watcher events
              </div>
            </div>
            <ChevronRight 
              size={16} 
              className={`text-plm-fg-muted transition-transform ${showTimingDashboard ? 'rotate-90' : ''}`} 
            />
          </button>
          
          {showTimingDashboard && (
            <div className="p-4 border-t border-plm-border">
              <FileOperationTiming />
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
          Operation Log
        </h2>
        <div className="bg-plm-bg rounded-lg border border-plm-border overflow-hidden">
          <button
            onClick={() => setShowOperationLog(!showOperationLog)}
            className="w-full flex items-center gap-3 p-4 hover:bg-plm-highlight transition-colors"
          >
            <div className="p-2 rounded-lg bg-plm-accent/10">
              <Activity size={16} className="text-plm-accent" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium text-plm-fg">File Operation Log</div>
              <div className="text-xs text-plm-fg-muted">
                Track file operations with step-by-step timing breakdown
              </div>
            </div>
            <ChevronRight 
              size={16} 
              className={`text-plm-fg-muted transition-transform ${showOperationLog ? 'rotate-90' : ''}`} 
            />
          </button>
          
          {showOperationLog && (
            <div className="p-4 border-t border-plm-border">
              <FileOperationLog />
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
          Reference Diagnostics
        </h2>
        <div className="bg-plm-bg rounded-lg border border-plm-border overflow-hidden">
          <button
            onClick={() => setShowRefDiagnostics(!showRefDiagnostics)}
            className="w-full flex items-center gap-3 p-4 hover:bg-plm-highlight transition-colors"
          >
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Layers size={16} className="text-amber-400" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium text-plm-fg">BOM Reference Diagnostics</div>
              <div className="text-xs text-plm-fg-muted">
                Debug assembly reference extraction and path matching issues
              </div>
            </div>
            <ChevronRight 
              size={16} 
              className={`text-plm-fg-muted transition-transform ${showRefDiagnostics ? 'rotate-90' : ''}`} 
            />
          </button>
          
          {showRefDiagnostics && (
            <div className="h-[600px] border-t border-plm-border">
              <ReferenceDiagnostics />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

