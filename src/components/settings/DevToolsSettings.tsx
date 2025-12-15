import { useState, useEffect } from 'react'
import { Monitor, RotateCcw, ChevronDown } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'

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
      addToast({ type: 'error', message: result.error || 'Failed to resize' })
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
    </div>
  )
}

