import { useState, useEffect } from 'react'
import { Gauge, Trash2, ExternalLink } from 'lucide-react'
import { telemetry, TelemetrySnapshot, TelemetryConfig } from '@/lib/telemetry'
import { TelemetryDashboard } from '@/features/dev-tools/telemetry'
import { t } from '@/lib/i18n'

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-plm-fg mb-1">
            {t('performanceTelemetry.title')}
          </h2>
          <p className="text-sm text-plm-fg-muted">{t('performanceTelemetry.description')}</p>
        </div>
        <button
          onClick={handlePopOut}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-plm-fg-muted hover:text-plm-fg bg-plm-bg-lighter hover:bg-plm-bg-light border border-plm-border rounded-md transition-colors"
          title={t('performanceTelemetry.openWindow')}
        >
          <ExternalLink size={14} />
          {t('performanceTelemetry.popOut')}
        </button>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-1 gap-3">
        <QuickStatCard
          icon={<Gauge size={16} />}
          label={t('performanceTelemetry.fps')}
          value={latestSnapshot?.fps ?? 0}
          format={(v) => `${v}`}
          color="text-emerald-400"
        />
      </div>

      {/* Telemetry Dashboard */}
      <TelemetryDashboard />

      {/* Configuration Section */}
      <div className="pt-4 border-t border-plm-border">
        <h3 className="text-sm font-medium text-plm-fg mb-3">
          {t('performanceTelemetry.settings')}
        </h3>

        <div className="space-y-4">
          {/* Sample Rate */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-plm-fg">{t('performanceTelemetry.sampleRate')}</label>
              <p className="text-xs text-plm-fg-muted">
                {t('performanceTelemetry.sampleRateHint')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="1"
                max="60"
                value={config.sampleRateHz}
                onChange={(e) => {
                  const newConfig = { ...config, sampleRateHz: parseInt(e.target.value) }
                  telemetry.configure(newConfig)
                  setConfig(newConfig)
                }}
                className="w-24 h-1.5 bg-plm-border rounded-full appearance-none cursor-pointer accent-plm-accent"
              />
              <span className="text-xs text-plm-fg-muted w-12 text-right">
                {config.sampleRateHz}Hz
              </span>
            </div>
          </div>

          {/* Retention Time */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-plm-fg">{t('performanceTelemetry.retention')}</label>
              <p className="text-xs text-plm-fg-muted">{t('performanceTelemetry.retentionHint')}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
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
                className="w-24 h-1.5 bg-plm-border rounded-full appearance-none cursor-pointer accent-plm-accent"
              />
              <span className="text-xs text-plm-fg-muted w-12 text-right">
                {config.retentionSeconds}s
              </span>
            </div>
          </div>

          {/* Buffer Info */}
          <div className="flex items-center justify-between text-xs text-plm-fg-muted">
            <span>
              {t('performanceTelemetry.bufferSize', {
                count: config.sampleRateHz * config.retentionSeconds,
              })}
            </span>
            <button
              onClick={() => {
                telemetry.clear()
                setLatestSnapshot(null)
              }}
              className="flex items-center gap-1 px-2 py-1 text-plm-fg-muted hover:text-plm-error rounded hover:bg-plm-bg-lighter transition-colors"
            >
              <Trash2 size={12} />
              {t('performanceTelemetry.clearData')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Quick stat card component
function QuickStatCard({
  icon,
  label,
  value,
  format,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  format: (v: number) => string
  color: string
}) {
  return (
    <div className="bg-plm-bg-lighter rounded-lg p-3 border border-plm-border">
      <div className="flex items-center gap-2 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wide text-plm-fg-muted">{label}</span>
      </div>
      <div className={`text-lg font-mono tabular-nums ${color}`}>{format(value)}</div>
    </div>
  )
}
