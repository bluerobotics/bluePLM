import { useEffect, useState } from 'react'
import { Activity, Boxes, ExternalLink, Gauge, MemoryStick, Trash2 } from 'lucide-react'

import { Button } from '@/components/core/ui'
import { TelemetryDashboard } from '@/features/dev-tools/telemetry'
import { telemetry, TelemetryConfig, TelemetrySnapshot } from '@/lib/telemetry'
import { formatBytes } from '@/lib/utils/format'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'
import { StatCard, StatGrid } from './StatCard'

const RANGE_CLASS =
  'h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-plm-border accent-plm-accent'

export function PerformanceSettings() {
  const [config, setConfig] = useState<TelemetryConfig>(telemetry.getConfig())
  const [latestSnapshot, setLatestSnapshot] = useState<TelemetrySnapshot | null>(null)

  // Load config and subscribe to updates
  useEffect(() => {
    telemetry.loadConfig()
    setConfig(telemetry.getConfig())

    // Subscribe to telemetry for live stats (only updates when telemetry is enabled)
    const unsubscribe = telemetry.subscribe((snapshot) => {
      setLatestSnapshot(snapshot)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handlePopOut = () => {
    window.electronAPI?.openPerformanceWindow?.()
  }

  const modules = latestSnapshot ? Object.values(latestSnapshot.modules) : []
  const moduleHeap = modules.reduce((sum, m) => sum + m.heapUsed, 0)
  const bufferSamples = config.sampleRateHz * config.retentionSeconds

  return (
    <SettingsPage>
      <SettingsSection
        title="Live metrics"
        actions={
          <Button
            size="sm"
            onClick={handlePopOut}
            title="Open in new window"
            icon={<ExternalLink size={14} />}
          >
            Pop Out
          </Button>
        }
      >
        <StatGrid>
          <StatCard icon={<Gauge size={13} />} label="FPS" value={latestSnapshot?.fps ?? 0} />
          <StatCard icon={<Boxes size={13} />} label="Tracked modules" value={modules.length} />
          <StatCard
            icon={<MemoryStick size={13} />}
            label="Module heap"
            value={formatBytes(moduleHeap)}
          />
          <StatCard
            icon={<Activity size={13} />}
            label="Buffer size"
            value={bufferSamples.toLocaleString()}
            detail="samples"
          />
        </StatGrid>
        <SettingsGroup>
          <div className="p-4">
            <TelemetryDashboard />
          </div>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Settings">
        <SettingsGroup>
          <SettingRow
            label="Sample Rate"
            htmlFor="perf-sample-rate"
            description="How often to collect telemetry data"
          >
            <input
              id="perf-sample-rate"
              type="range"
              min="1"
              max="60"
              value={config.sampleRateHz}
              onChange={(e) => {
                const newConfig = { ...config, sampleRateHz: parseInt(e.target.value) }
                telemetry.configure(newConfig)
                setConfig(newConfig)
              }}
              className={RANGE_CLASS}
            />
            <span className="w-12 text-right text-[12px] tabular-nums text-plm-fg-muted">
              {config.sampleRateHz}Hz
            </span>
          </SettingRow>
          <SettingRow
            label="Retention Time"
            htmlFor="perf-retention"
            description="How long to keep telemetry history"
          >
            <input
              id="perf-retention"
              type="range"
              min="10"
              max="300"
              step="10"
              value={config.retentionSeconds}
              onChange={(e) => {
                const newConfig = { ...config, retentionSeconds: parseInt(e.target.value) }
                telemetry.configure(newConfig)
                setConfig(newConfig)
              }}
              className={RANGE_CLASS}
            />
            <span className="w-12 text-right text-[12px] tabular-nums text-plm-fg-muted">
              {config.retentionSeconds}s
            </span>
          </SettingRow>
          <SettingRow label="Telemetry data" description={`Buffer size: ${bufferSamples} samples`}>
            <Button
              variant="danger-subtle"
              size="sm"
              icon={<Trash2 size={12} />}
              onClick={() => {
                telemetry.clear()
                setLatestSnapshot(null)
              }}
            >
              Clear Data
            </Button>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}
