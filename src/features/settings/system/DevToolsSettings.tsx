import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button, Select } from '@/components/core/ui'
import { FileOperationLog } from '@/features/dev-tools/operation-log'
import { FileOperationTiming } from '@/features/dev-tools/performance'
import { ReferenceDiagnostics } from '@/features/dev-tools/reference-diagnostics'
import { usePDMStore } from '@/stores/pdmStore'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'

const TestRunnerView = lazy(() =>
  import('@/features/dev-tools/test-runner').then((m) => ({ default: m.TestRunnerView })),
)

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

/** A tool row with a Show/Hide button; the tool renders below the row while open. */
function ToolRow({
  label,
  description,
  open,
  onToggle,
  children,
}: {
  label: string
  description: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <>
      <SettingRow label={label} description={description}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-expanded={open}
          icon={
            <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          }
        >
          {open ? 'Hide' : 'Show'}
        </Button>
      </SettingRow>
      {open && children}
    </>
  )
}

export function DevToolsSettings() {
  const { addToast } = usePDMStore(useShallow((s) => ({ addToast: s.addToast })))
  const [currentSize, setCurrentSize] = useState<{ width: number; height: number } | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [showRefDiagnostics, setShowRefDiagnostics] = useState(false)
  const [showTimingDashboard, setShowTimingDashboard] = useState(true)
  const [showOperationLog, setShowOperationLog] = useState(true)
  const [showTestRunner, setShowTestRunner] = useState(false)

  useEffect(() => {
    const fetchSize = async () => {
      const size = await window.electronAPI?.getWindowSize?.()
      if (size) setCurrentSize(size)
    }
    fetchSize()
  }, [])

  const handlePresetChange = async (presetId: string) => {
    if (!presetId) return
    const preset = devicePresets.find((p) => p.id === presetId)
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
    <SettingsPage>
      <SettingsSection title="Window Size">
        <SettingsGroup>
          <SettingRow
            label="Preset"
            htmlFor="devtools-window-preset"
            description={
              <>
                Current size:{' '}
                <span className="font-mono text-ui-fg">
                  {currentSize ? `${currentSize.width}×${currentSize.height}` : '—'}
                </span>
              </>
            }
          >
            <Select
              id="devtools-window-preset"
              size="sm"
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-56"
            >
              <option value="">Select preset...</option>
              {devicePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} ({preset.width}×{preset.height})
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={handleReset}>
              Reset
            </Button>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Diagnostics">
        <SettingsGroup>
          <ToolRow
            label="Regression Test Runner"
            description="Run .bptest regression scripts and view structured results"
            open={showTestRunner}
            onToggle={() => setShowTestRunner(!showTestRunner)}
          >
            <div className="h-[600px]">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-ui-fg-secondary">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                }
              >
                <TestRunnerView />
              </Suspense>
            </div>
          </ToolRow>
          <ToolRow
            label="Performance Timing Dashboard"
            description="Monitor folderMetrics, store updates, and file watcher events"
            open={showTimingDashboard}
            onToggle={() => setShowTimingDashboard(!showTimingDashboard)}
          >
            <div className="py-4">
              <FileOperationTiming />
            </div>
          </ToolRow>
          <ToolRow
            label="File Operation Log"
            description="Track file operations with step-by-step timing breakdown"
            open={showOperationLog}
            onToggle={() => setShowOperationLog(!showOperationLog)}
          >
            <div className="py-4">
              <FileOperationLog />
            </div>
          </ToolRow>
          <ToolRow
            label="BOM Reference Diagnostics"
            description="Debug assembly reference extraction and path matching issues"
            open={showRefDiagnostics}
            onToggle={() => setShowRefDiagnostics(!showRefDiagnostics)}
          >
            <div className="h-[600px]">
              <ReferenceDiagnostics />
            </div>
          </ToolRow>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}
