import { useState } from 'react'
import {
  Check,
  Clock,
  Copy,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react'

import { Badge, Button, Callout, SegmentedControl, type BadgeTone } from '@/components/core/ui'
import { copyToClipboard } from '@/lib/clipboard'
import { log } from '@/lib/logger'
import { EXPECTED_SCHEMA_VERSION } from '@/lib/schemaVersion'
import { supabase } from '@/lib/supabase'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'
import { StatCard, StatGrid } from './StatCard'
import { SupabaseActivityChart } from './SupabaseActivityChart'
import {
  extractRegion,
  formatExpiryTime,
  maskKey,
  type ActivityTimeRange,
} from './supabaseActivity'
import { useSupabaseConnection, type ConnectionStatus } from './useSupabaseConnection'

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  online: 'Connected to Supabase',
  offline: 'Connection Failed',
  checking: 'Checking connection...',
  unknown: 'Status Unknown',
}

const STATUS_BADGE: Record<ConnectionStatus, { tone: BadgeTone; text: string }> = {
  online: { tone: 'success', text: 'Online' },
  offline: { tone: 'error', text: 'Offline' },
  checking: { tone: 'warning', text: 'Checking' },
  unknown: { tone: 'neutral', text: 'Unknown' },
}

const TIME_RANGES = [
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: 'all', label: 'All' },
] as const

const CHANNEL_DOT: Record<string, string> = {
  joined: 'bg-ui-success',
  joining: 'bg-ui-warning animate-pulse',
  leaving: 'bg-ui-warning',
}

function CopyButton({
  copied,
  onClick,
  title,
}: {
  copied: boolean
  onClick: () => void
  title: string
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={title}
      aria-label={title}
      icon={copied ? <Check size={14} className="text-ui-success" /> : <Copy size={14} />}
    />
  )
}

function ValueField({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <code
      className={`min-w-0 flex-1 truncate rounded-md border border-ui-divider bg-ui-field px-2.5 py-1.5 font-mono text-[13px] ${
        muted ? 'text-ui-fg-secondary' : 'text-ui-fg'
      }`}
    >
      {children}
    </code>
  )
}

export function SupabaseSettings() {
  const c = useSupabaseConnection()
  const { config, isAdmin, status, schemaVersion } = c

  const [showKey, setShowKey] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)

  const handleCopyKey = async () => {
    if (!config?.anonKey || !isAdmin) return
    const result = await copyToClipboard(config.anonKey)
    if (result.success) {
      setKeyCopied(true)
      setTimeout(() => setKeyCopied(false), 2000)
    } else {
      log.error('[Supabase]', 'Failed to copy key', { error: result.error })
    }
  }

  const handleCopyUrl = async () => {
    if (!config?.url) return
    const result = await copyToClipboard(config.url)
    if (result.success) {
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    } else {
      log.error('[Supabase]', 'Failed to copy URL', { error: result.error })
    }
  }

  const online = status === 'online'
  const showOrgSections = !!c.organization && online
  const channels = supabase.getChannels()
  const statusBadge = STATUS_BADGE[status]

  return (
    <SettingsPage>
      {!c.isConfigured && (
        <Callout tone="warning" title="Supabase Not Configured">
          Connect to a Supabase project to enable cloud features. Use the organization code from
          your administrator or configure environment variables during development.
        </Callout>
      )}

      <SettingsSection
        title="Connection Status"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={c.checkConnectionStatus}
            disabled={status === 'checking'}
            icon={<RefreshCw size={14} className={status === 'checking' ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
        }
      >
        <SettingsGroup>
          <SettingRow
            label={STATUS_TEXT[status]}
            description={
              c.latency !== null || c.lastChecked ? (
                <>
                  {c.latency !== null && <span>{c.latency}ms latency</span>}
                  {c.latency !== null && c.lastChecked && <span> · </span>}
                  {c.lastChecked && <span>Checked {c.lastChecked.toLocaleTimeString()}</span>}
                </>
              ) : undefined
            }
          >
            {status === 'checking' ? (
              <Loader2 size={14} className="animate-spin text-ui-fg-secondary" />
            ) : (
              <Badge tone={statusBadge.tone}>{statusBadge.text}</Badge>
            )}
          </SettingRow>
          <SettingRow
            label={
              c.authStatus === 'authenticated'
                ? 'Authenticated'
                : c.authStatus === 'unauthenticated'
                  ? 'Not authenticated'
                  : 'Checking...'
            }
            description={
              c.sessionInfo.expiresAt && c.authStatus === 'authenticated'
                ? `Provider: ${c.sessionInfo.provider} · Session expires in ${formatExpiryTime(c.sessionInfo.expiresAt)}`
                : undefined
            }
          >
            {c.authStatus === 'checking' ? (
              <Loader2 size={14} className="animate-spin text-ui-fg-secondary" />
            ) : (
              <Badge tone={c.authStatus === 'authenticated' ? 'info' : 'warning'}>
                {c.authStatus === 'authenticated' ? 'Signed in' : 'Signed out'}
              </Badge>
            )}
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      {online && (
        <SettingsSection title="Schema Version">
          <SettingsGroup>
            {c.loadingSchema ? (
              <div className="flex items-center gap-2 px-4 py-3.5 text-[14px] text-ui-fg-secondary">
                <Loader2 size={14} className="animate-spin" />
                Checking schema version...
              </div>
            ) : schemaVersion ? (
              <SettingRow
                label={`Database: v${schemaVersion.version}`}
                description={
                  <>
                    <div>App expects: v{EXPECTED_SCHEMA_VERSION}</div>
                    {schemaVersion.description && <div>{schemaVersion.description}</div>}
                    {schemaVersion.appliedAt && (
                      <div>
                        Last updated: {schemaVersion.appliedAt.toLocaleDateString()} at{' '}
                        {schemaVersion.appliedAt.toLocaleTimeString()}
                      </div>
                    )}
                  </>
                }
              >
                {schemaVersion.version === EXPECTED_SCHEMA_VERSION && (
                  <Badge tone="success">Up to date</Badge>
                )}
                {schemaVersion.version > EXPECTED_SCHEMA_VERSION && (
                  <Badge tone="info">Newer than app</Badge>
                )}
                {schemaVersion.version < EXPECTED_SCHEMA_VERSION && (
                  <Badge tone="warning">Update available</Badge>
                )}
              </SettingRow>
            ) : (
              <SettingRow
                label="Version tracking not found"
                description={`App expects: v${EXPECTED_SCHEMA_VERSION}`}
              >
                <Badge tone="warning">Unknown</Badge>
              </SettingRow>
            )}
          </SettingsGroup>
          {!c.loadingSchema &&
            schemaVersion &&
            schemaVersion.version < EXPECTED_SCHEMA_VERSION &&
            isAdmin && (
              <Callout tone="warning">
                <strong className="font-medium text-ui-fg">Admin action needed:</strong> Run the
                latest <code className="rounded bg-ui-bg px-1">schema.sql</code> in your Supabase
                SQL editor to enable new features.
              </Callout>
            )}
          {!c.loadingSchema && schemaVersion && schemaVersion.version > EXPECTED_SCHEMA_VERSION && (
            <Callout tone="info">
              Your database is newer than this app version. Consider updating BluePLM for the best
              experience.
            </Callout>
          )}
          {!c.loadingSchema && !schemaVersion && isAdmin && (
            <Callout tone="warning">
              <strong className="font-medium text-ui-fg">Admin action needed:</strong> Run the
              latest <code className="rounded bg-ui-bg px-1">schema.sql</code> in your Supabase SQL
              editor to enable schema version tracking.
            </Callout>
          )}
        </SettingsSection>
      )}

      <SettingsSection title="Credentials">
        <SettingsGroup>
          <SettingRow label="Supabase URL" stacked>
            {config?.url ? (
              <div className="flex items-center gap-2">
                <ValueField>{config.url}</ValueField>
                <CopyButton copied={urlCopied} onClick={handleCopyUrl} title="Copy URL" />
              </div>
            ) : (
              <span className="text-[14px] text-ui-fg-secondary">Not configured</span>
            )}
          </SettingRow>
          <SettingRow
            label="Anon Key"
            badge={!isAdmin ? <Badge>Admin only</Badge> : undefined}
            description={
              isAdmin && config?.anonKey
                ? 'This is the public anon key. Keep your service role key secure and never expose it.'
                : !isAdmin
                  ? 'Contact your administrator to view API credentials'
                  : undefined
            }
            stacked={isAdmin}
          >
            {isAdmin &&
              (config?.anonKey ? (
                <div className="flex items-center gap-2">
                  <ValueField muted>
                    {showKey ? config.anonKey : maskKey(config.anonKey)}
                  </ValueField>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? 'Hide key' : 'Show key'}
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                    icon={showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  />
                  <CopyButton copied={keyCopied} onClick={handleCopyKey} title="Copy key" />
                </div>
              ) : (
                <span className="text-[14px] text-ui-fg-secondary">Not configured</span>
              ))}
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      {isAdmin && config?.url && (
        <SettingsSection title="Server Information">
          <SettingsGroup>
            <SettingRow label="Project URL">
              <code className="font-mono text-[13px] text-ui-fg">
                {new URL(config.url).hostname}
              </code>
            </SettingRow>
            <SettingRow label="Region">
              <span className="text-[14px] text-ui-fg">{extractRegion(config.url)}</span>
            </SettingRow>
            {config.orgSlug && (
              <SettingRow label="Organization Slug">
                <code className="font-mono text-[13px] text-ui-fg">{config.orgSlug}</code>
              </SettingRow>
            )}
          </SettingsGroup>
        </SettingsSection>
      )}

      {showOrgSections && (
        <SettingsSection
          title="Database Statistics"
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={c.loadStats}
              disabled={c.loadingStats}
              icon={<RefreshCw size={14} className={c.loadingStats ? 'animate-spin' : ''} />}
            >
              Refresh
            </Button>
          }
        >
          <StatGrid>
            <StatCard
              icon={<FileText size={13} />}
              label="Files"
              value={c.stats.totalFiles.toLocaleString()}
              loading={c.loadingStats}
            />
            <StatCard
              icon={<HardDrive size={13} />}
              label="Vaults"
              value={c.stats.totalVaults.toLocaleString()}
              loading={c.loadingStats}
            />
            <StatCard
              icon={<Users size={13} />}
              label="Members"
              value={c.stats.totalUsers.toLocaleString()}
              loading={c.loadingStats}
            />
            <StatCard
              icon={<Clock size={13} />}
              label="Checked Out"
              value={c.stats.totalCheckouts.toLocaleString()}
              loading={c.loadingStats}
            />
          </StatGrid>
        </SettingsSection>
      )}

      {showOrgSections && (
        <SettingsSection
          title="Network Activity"
          actions={
            <>
              <SegmentedControl<ActivityTimeRange>
                size="sm"
                aria-label="Time range"
                value={c.timeRange}
                options={TIME_RANGES}
                onChange={c.setTimeRange}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={c.loadActivityData}
                disabled={c.loadingActivity}
                title="Refresh"
                aria-label="Refresh"
                icon={<RefreshCw size={14} className={c.loadingActivity ? 'animate-spin' : ''} />}
              />
            </>
          }
        >
          <SettingsGroup>
            <SupabaseActivityChart
              timeRange={c.timeRange}
              dailyActivity={c.dailyActivity}
              networkStats={c.networkStats}
              loading={c.loadingActivity}
            />
          </SettingsGroup>
        </SettingsSection>
      )}

      {online && (
        <SettingsSection title="Realtime">
          <SettingsGroup>
            <SettingRow
              label={
                c.stats.realtimeConnected
                  ? 'Realtime subscriptions active'
                  : 'No active subscriptions'
              }
              description={
                c.stats.realtimeConnected
                  ? `${channels.length} active channel(s)`
                  : 'Subscribe to database changes for live updates'
              }
            >
              <Badge tone={c.stats.realtimeConnected ? 'success' : 'neutral'}>
                {c.stats.realtimeConnected ? 'Live' : 'Idle'}
              </Badge>
            </SettingRow>
            {c.stats.realtimeConnected &&
              channels.map((channel, idx) => (
                <div key={idx} className="flex items-center gap-2.5 px-4 py-2 text-[13px]">
                  <span
                    className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                      CHANNEL_DOT[channel.state] ?? 'bg-ui-fg-secondary'
                    }`}
                  />
                  <code className="min-w-0 flex-1 truncate font-mono text-ui-fg">
                    {channel.topic || 'unknown'}
                  </code>
                  <span className="capitalize text-ui-fg-secondary">{channel.state}</span>
                </div>
              ))}
          </SettingsGroup>
        </SettingsSection>
      )}
    </SettingsPage>
  )
}
