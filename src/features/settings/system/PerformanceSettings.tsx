import { useEffect, useState } from 'react'

import { Button } from '@/components/core/ui'
import { TelemetryDashboard } from '@/features/dev-tools/telemetry'
import { telemetry, TelemetryConfig, TelemetrySnapshot } from '@/lib/telemetry'
import { formatBytes } from '@/lib/utils/format'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'
import { StatCard, StatGrid } from './StatCard'

const RANGE_CLASS =
  'h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-ui-field-border accent-ui-accent'

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
          <Button size="sm" onClick={handlePopOut} title="Open in new window">
            Pop Out
          </Button>
        }
      >
        <StatGrid>
          <StatCard label="FPS" value={latestSnapshot?.fps ?? 0} />
          <StatCard label="Tracked modules" value={modules.length} />
          <StatCard label="Module heap" value={formatBytes(moduleHeap)} />
          <StatCard label="Buffer size" value={bufferSamples.toLocaleString()} detail="samples" />
        </StatGrid>
        <div className="border-t border-ui-divider pt-4">
          <TelemetryDashboard />
        </div>
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
            <span className="w-12 text-right text-[13px] tabular-nums text-ui-fg-secondary">
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
            <span className="w-12 text-right text-[13px] tabular-nums text-ui-fg-secondary">
              {config.retentionSeconds}s
            </span>
          </SettingRow>
          <SettingRow label="Telemetry data" description={`Buffer size: ${bufferSamples} samples`}>
            <Button
              variant="danger-subtle"
              size="sm"
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
