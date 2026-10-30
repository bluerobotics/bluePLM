import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Upload,
} from 'lucide-react'

import { Badge, Button, Callout, Select, Switch, TextInput } from '@/components/core/ui'
import { SettingRow, SettingsGroup, SettingsSection } from '@/features/settings/components/ui'

import { TIME_SLOTS } from './constants'

const FIELD_WIDTH = 'w-64'

interface BackupConfigFormProps {
  showConfig: boolean
  onToggleConfig: () => void
  // Provider settings
  provider: 'backblaze_b2' | 'aws_s3' | 'google_cloud'
  onProviderChange: (provider: 'backblaze_b2' | 'aws_s3' | 'google_cloud') => void
  bucket: string
  onBucketChange: (bucket: string) => void
  region: string
  onRegionChange: (region: string) => void
  endpoint: string
  onEndpointChange: (endpoint: string) => void
  // Credentials
  accessKey: string
  onAccessKeyChange: (key: string) => void
  secretKey: string
  onSecretKeyChange: (key: string) => void
  resticPassword: string
  onResticPasswordChange: (password: string) => void
  showSecretKey: boolean
  onShowSecretKeyChange: (show: boolean) => void
  showResticPassword: boolean
  onShowResticPasswordChange: (show: boolean) => void
  // Retention settings
  retentionDaily: number
  onRetentionDailyChange: (days: number) => void
  retentionWeekly: number
  onRetentionWeeklyChange: (weeks: number) => void
  retentionMonthly: number
  onRetentionMonthlyChange: (months: number) => void
  retentionYearly: number
  onRetentionYearlyChange: (years: number) => void
  totalRetentionPoints: number
  // Schedule settings
  scheduleEnabled: boolean
  onScheduleEnabledChange: (enabled: boolean) => void
  scheduleHour: number
  scheduleMinute: number
  onScheduleTimeChange: (hour: number, minute: number) => void
  scheduleTimezone: string
  onScheduleTimezoneChange: (timezone: string) => void
  // Actions
  isSaving: boolean
  onSave: () => void
  onExport: () => void
  onImport: () => void
}

/**
 * Admin-only backup configuration form.
 */
export function BackupConfigForm({
  showConfig,
  onToggleConfig,
  provider,
  onProviderChange,
  bucket,
  onBucketChange,
  region,
  onRegionChange,
  endpoint,
  onEndpointChange,
  accessKey,
  onAccessKeyChange,
  secretKey,
  onSecretKeyChange,
  resticPassword,
  onResticPasswordChange,
  showSecretKey,
  onShowSecretKeyChange,
  showResticPassword,
  onShowResticPasswordChange,
  retentionDaily,
  onRetentionDailyChange,
  retentionWeekly,
  onRetentionWeeklyChange,
  retentionMonthly,
  onRetentionMonthlyChange,
  retentionYearly,
  onRetentionYearlyChange,
  totalRetentionPoints,
  scheduleEnabled,
  onScheduleEnabledChange,
  scheduleHour,
  scheduleMinute,
  onScheduleTimeChange,
  scheduleTimezone,
  onScheduleTimezoneChange,
  isSaving,
  onSave,
  onExport,
  onImport,
}: BackupConfigFormProps) {
  const retentionFields = [
    {
      id: 'backup-retention-daily',
      label: 'Keep daily for',
      unit: 'days',
      max: 30,
      value: retentionDaily,
      onChange: (v: string) => onRetentionDailyChange(parseInt(v) || 14),
    },
    {
      id: 'backup-retention-weekly',
      label: 'Keep weekly for',
      unit: 'weeks',
      max: 52,
      value: retentionWeekly,
      onChange: (v: string) => onRetentionWeeklyChange(parseInt(v) || 10),
    },
    {
      id: 'backup-retention-monthly',
      label: 'Keep monthly for',
      unit: 'months',
      max: 24,
      value: retentionMonthly,
      onChange: (v: string) => onRetentionMonthlyChange(parseInt(v) || 12),
    },
    {
      id: 'backup-retention-yearly',
      label: 'Keep yearly for',
      unit: 'years',
      max: 10,
      value: retentionYearly,
      onChange: (v: string) => onRetentionYearlyChange(parseInt(v) || 5),
    },
  ]

  return (
    <SettingsSection
      title="Backup Configuration"
      description="Where backups are stored, how they are encrypted, and when they run."
      actions={
        <>
          <Badge tone="accent">Admin</Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleConfig}
            aria-expanded={showConfig}
            icon={showConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          >
            {showConfig ? 'Hide' : 'Show'}
          </Button>
        </>
      }
    >
      {showConfig && (
        <>
          <SettingsGroup>
            {/* Provider Selection */}
            <SettingRow label="Provider" htmlFor="backup-provider">
              <Select
                id="backup-provider"
                value={provider}
                onChange={(e) => onProviderChange(e.target.value as typeof provider)}
                className={FIELD_WIDTH}
              >
                <option value="backblaze_b2">Backblaze B2</option>
                <option value="aws_s3">Amazon S3</option>
                <option value="google_cloud">Google Cloud Storage</option>
              </Select>
            </SettingRow>

            {/* Bucket */}
            <SettingRow label="Bucket Name" htmlFor="backup-bucket">
              <TextInput
                id="backup-bucket"
                value={bucket}
                onChange={(e) => onBucketChange(e.target.value)}
                placeholder="my-backup-bucket"
                className={FIELD_WIDTH}
              />
            </SettingRow>

            {/* Endpoint (for S3-compatible) */}
            {provider === 'backblaze_b2' && (
              <SettingRow
                label="S3 Endpoint"
                htmlFor="backup-endpoint"
                description="Find this in your B2 bucket settings"
              >
                <TextInput
                  id="backup-endpoint"
                  value={endpoint}
                  onChange={(e) => onEndpointChange(e.target.value)}
                  placeholder="s3.us-west-004.backblazeb2.com"
                  className={FIELD_WIDTH}
                />
              </SettingRow>
            )}

            {/* Region (for AWS) */}
            {provider === 'aws_s3' && (
              <SettingRow label="Region" htmlFor="backup-region">
                <TextInput
                  id="backup-region"
                  value={region}
                  onChange={(e) => onRegionChange(e.target.value)}
                  placeholder="us-east-1"
                  className={FIELD_WIDTH}
                />
              </SettingRow>
            )}

            {/* Access Key */}
            <SettingRow
              label={provider === 'backblaze_b2' ? 'Application Key ID' : 'Access Key ID'}
              htmlFor="backup-access-key"
            >
              <TextInput
                id="backup-access-key"
                value={accessKey}
                onChange={(e) => onAccessKeyChange(e.target.value)}
                placeholder="004..."
                className={`${FIELD_WIDTH} font-mono`}
              />
            </SettingRow>

            {/* Secret Key */}
            <SettingRow
              label={provider === 'backblaze_b2' ? 'Application Key' : 'Secret Access Key'}
              htmlFor="backup-secret-key"
            >
              <SecretInput
                id="backup-secret-key"
                value={secretKey}
                onChange={onSecretKeyChange}
                placeholder="K004..."
                shown={showSecretKey}
                onShownChange={onShowSecretKeyChange}
                mono
              />
            </SettingRow>

            {/* Restic Password */}
            <SettingRow
              label="Encryption Password"
              htmlFor="backup-restic-password"
              description={
                <>
                  This password encrypts your backups.{' '}
                  <strong className="font-medium text-plm-fg">Store it safely!</strong>
                </>
              }
            >
              <SecretInput
                id="backup-restic-password"
                value={resticPassword}
                onChange={onResticPasswordChange}
                placeholder="Strong password for encrypting backups"
                shown={showResticPassword}
                onShownChange={onShowResticPasswordChange}
              />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup>
            {/* Retention Policy */}
            <SettingRow
              label="Retention Policy"
              description={`How long to keep backups on the server. ≈ ${totalRetentionPoints} restore points total`}
              stacked
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {retentionFields.map((field) => (
                  <div key={field.id}>
                    <label htmlFor={field.id} className="mb-1 block text-[12px] text-plm-fg-muted">
                      {field.label}
                    </label>
                    <div className="flex items-center gap-2">
                      <TextInput
                        id={field.id}
                        type="number"
                        min="1"
                        max={field.max}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                      <span className="whitespace-nowrap text-[12px] text-plm-fg-muted">
                        {field.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </SettingRow>

            {/* Schedule */}
            <SettingRow label="Enable scheduled backups" htmlFor="backup-schedule-enabled">
              <Switch
                id="backup-schedule-enabled"
                checked={scheduleEnabled}
                onChange={onScheduleEnabledChange}
              />
            </SettingRow>

            {scheduleEnabled && (
              <SettingRow label="Backup time" htmlFor="backup-schedule-time">
                <Select
                  id="backup-schedule-time"
                  value={`${scheduleHour}:${scheduleMinute}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number)
                    onScheduleTimeChange(h, m)
                  }}
                  className="w-24"
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Time zone"
                  value={scheduleTimezone}
                  onChange={(e) => onScheduleTimezoneChange(e.target.value)}
                  className="w-48"
                >
                  <optgroup label="Americas">
                    <option value="America/Los_Angeles">Pacific (LA)</option>
                    <option value="America/Denver">Mountain (Denver)</option>
                    <option value="America/Chicago">Central (Chicago)</option>
                    <option value="America/New_York">Eastern (NY)</option>
                    <option value="America/Sao_Paulo">São Paulo</option>
                  </optgroup>
                  <optgroup label="Europe">
                    <option value="Europe/London">London</option>
                    <option value="Europe/Paris">Paris / Berlin</option>
                    <option value="Europe/Moscow">Moscow</option>
                  </optgroup>
                  <optgroup label="Asia/Pacific">
                    <option value="Asia/Dubai">Dubai</option>
                    <option value="Asia/Kolkata">India</option>
                    <option value="Asia/Shanghai">China</option>
                    <option value="Asia/Tokyo">Tokyo</option>
                    <option value="Australia/Sydney">Sydney</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="UTC">UTC</option>
                  </optgroup>
                </Select>
              </SettingRow>
            )}
          </SettingsGroup>

          <Callout tone="info">
            Backups use <strong className="font-medium text-plm-fg">restic</strong> with
            deduplication, so storage usage is much lower than raw file size.{' '}
            <a
              href="https://www.backblaze.com/b2/cloud-storage.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-plm-accent hover:underline"
            >
              Backblaze B2 Pricing
              <ExternalLink size={12} />
            </a>
          </Callout>

          <Callout tone="warning" title="Export your config as disaster recovery!">
            If Supabase goes down, the exported config file is your key to access backups. Store it
            in a password manager or secure location.
          </Callout>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={onExport} icon={<Download size={14} />}>
              Export Config
            </Button>
            <Button onClick={onImport} icon={<Upload size={14} />}>
              Import Config
            </Button>
            <Button
              variant="primary"
              onClick={onSave}
              loading={isSaving}
              icon={<CheckCircle2 size={14} />}
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </>
      )}
    </SettingsSection>
  )
}

/** A password field with a show/hide toggle. */
function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  shown,
  onShownChange,
  mono = false,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  shown: boolean
  onShownChange: (shown: boolean) => void
  mono?: boolean
}) {
  return (
    <div className={`relative ${FIELD_WIDTH}`}>
      <TextInput
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`pr-9 ${mono ? 'font-mono' : ''}`}
      />
      <button
        type="button"
        onClick={() => onShownChange(!shown)}
        aria-label={shown ? 'Hide' : 'Show'}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-plm-fg-muted hover:text-plm-fg"
      >
        {shown ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}
