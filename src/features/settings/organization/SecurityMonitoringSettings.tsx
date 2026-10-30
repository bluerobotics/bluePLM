/**
 * Settings > Security Monitoring (schema 502): the organization's thresholds for the security
 * monitor. The monitor itself runs in the database (`security_monitor_run()`, every 10 minutes
 * through pg_cron) and writes `security_alert` / `security_summary` notifications to the
 * organization's admins. Only admins read or change this row (RLS on `org_security_setting`); a
 * missing row means the defaults below, which are the column defaults in the migration.
 */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import { Callout, Select, Switch, TextInput } from '@/components/core/ui'

import { SettingRow, SettingsGroup, SettingsPage, SettingsSection } from '../components/ui'

export interface SecuritySettings {
  is_enabled: boolean
  file_delete_threshold: number
  storage_delete_threshold: number
  auth_event_threshold: number
  is_domain_join_alert_enabled: boolean
  is_daily_summary_enabled: boolean
  is_backup_alert_enabled: boolean
  backup_overdue_hours: number
  summary_hour_utc: number
}

/** The column defaults of org_security_setting (0502_security_hardening.sql). */
export const SECURITY_SETTING_DEFAULTS: SecuritySettings = {
  is_enabled: true,
  file_delete_threshold: 200,
  storage_delete_threshold: 500,
  auth_event_threshold: 20,
  is_domain_join_alert_enabled: true,
  is_daily_summary_enabled: true,
  is_backup_alert_enabled: true,
  backup_overdue_hours: 36,
  summary_hour_utc: 14,
}

const THRESHOLD_LIMITS: Record<
  'file_delete_threshold' | 'storage_delete_threshold' | 'auth_event_threshold' | 'backup_overdue_hours',
  number
> = {
  file_delete_threshold: 1_000_000,
  storage_delete_threshold: 10_000_000,
  auth_event_threshold: 100_000,
  backup_overdue_hours: 720,
}

/** A threshold the database will accept: a whole number from 1 to the column's CHECK limit. */
export function clampThreshold(key: keyof typeof THRESHOLD_LIMITS, value: number): number {
  if (!Number.isFinite(value)) return SECURITY_SETTING_DEFAULTS[key]
  return Math.min(THRESHOLD_LIMITS[key], Math.max(1, Math.round(value)))
}

const db = supabase as unknown as {
  from: (table: 'org_security_setting') => {
    select: (columns: string) => {
      eq: (column: 'org_id', value: string) => {
        maybeSingle: () => Promise<{ data: SecuritySettings | null; error: Error | null }>
      }
    }
    upsert: (row: SecuritySettings & { org_id: string; updated_by: string; updated_at: string }) => Promise<{ error: Error | null }>
  }
}

export function SecurityMonitoringSettings() {
  const { organization, user, addToast, getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      user: s.user,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )
  const isAdmin = getEffectiveRole() === 'admin'
  const [settings, setSettings] = useState<SecuritySettings>(SECURITY_SETTING_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!organization || !isAdmin) {
      setLoading(false)
      return
    }
    let cancelled = false
    void db
      .from('org_security_setting')
      .select(Object.keys(SECURITY_SETTING_DEFAULTS).join(', '))
      .eq('org_id', organization.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) log.warn('[Security]', 'Loading the security monitoring settings failed', { error })
        setSettings({ ...SECURITY_SETTING_DEFAULTS, ...(data ?? {}) })
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [organization, isAdmin])

  const save = async (patch: Partial<SecuritySettings>) => {
    if (!organization || !user) return
    const next = { ...settings, ...patch }
    setSettings(next)
    setSaving(true)
    try {
      const { error } = await db.from('org_security_setting').upsert({
        ...next,
        org_id: organization.id,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      addToast('success', t('securityMonitoring.saved'))
    } catch (error) {
      log.error('[Security]', 'Saving the security monitoring settings failed', { error })
      addToast('error', t('securityMonitoring.saveFailed', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      setSaving(false)
    }
  }

  const disabled = !isAdmin || saving || loading

  const threshold = (key: keyof typeof THRESHOLD_LIMITS, label: string, hint: string) => (
    <SettingRow label={label} description={hint} htmlFor={`security-${key}`}>
      <TextInput
        id={`security-${key}`}
        type="number"
        min={1}
        max={THRESHOLD_LIMITS[key]}
        defaultValue={settings[key]}
        key={`${key}:${settings[key]}`}
        disabled={disabled || !settings.is_enabled}
        onBlur={(e) => {
          const value = clampThreshold(key, Number(e.target.value))
          if (value !== settings[key]) void save({ [key]: value })
        }}
        className="w-28 text-right tabular-nums"
      />
    </SettingRow>
  )

  const toggle = (
    key: 'is_enabled' | 'is_domain_join_alert_enabled' | 'is_daily_summary_enabled' | 'is_backup_alert_enabled',
    label: string,
    hint: string,
  ) => (
    <SettingRow label={label} description={hint}>
      <Switch
        checked={settings[key]}
        disabled={disabled || (key !== 'is_enabled' && !settings.is_enabled)}
        onChange={(checked) => void save({ [key]: checked })}
        aria-label={label}
      />
    </SettingRow>
  )

  if (!isAdmin) {
    return <Callout tone="warning">{t('securityMonitoring.adminOnly')}</Callout>
  }

  return (
    <SettingsPage>
      <SettingsSection
        title={t('securityMonitoring.generalTitle')}
        description={t('securityMonitoring.intro')}
        actions={
          (saving || loading) && <Loader2 size={14} className="animate-spin text-ui-fg-secondary" />
        }
      >
        <SettingsGroup>
          {toggle('is_enabled', t('securityMonitoring.enable'), t('securityMonitoring.enableHint'))}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t('securityMonitoring.thresholdsTitle')}>
        <SettingsGroup>
          {threshold('file_delete_threshold', t('securityMonitoring.fileDeletes'), t('securityMonitoring.fileDeletesHint'))}
          {threshold('storage_delete_threshold', t('securityMonitoring.storageDeletes'), t('securityMonitoring.storageDeletesHint'))}
          {threshold('auth_event_threshold', t('securityMonitoring.authEvents'), t('securityMonitoring.authEventsHint'))}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title={t('securityMonitoring.alertsTitle')}
        description={t('securityMonitoring.alwaysAlerted')}
      >
        <SettingsGroup>
          {toggle('is_domain_join_alert_enabled', t('securityMonitoring.domainJoins'), t('securityMonitoring.domainJoinsHint'))}
          {toggle('is_backup_alert_enabled', t('securityMonitoring.backupAlerts'), t('securityMonitoring.backupAlertsHint'))}
          {settings.is_backup_alert_enabled &&
            threshold('backup_overdue_hours', t('securityMonitoring.backupOverdue'), t('securityMonitoring.backupOverdueHint'))}
          {toggle('is_daily_summary_enabled', t('securityMonitoring.dailySummary'), t('securityMonitoring.dailySummaryHint'))}
          <SettingRow
            label={t('securityMonitoring.summaryHour')}
            htmlFor="security-summary-hour"
            disabled={!settings.is_enabled || !settings.is_daily_summary_enabled}
          >
            <Select
              id="security-summary-hour"
              value={settings.summary_hour_utc}
              disabled={disabled || !settings.is_enabled || !settings.is_daily_summary_enabled}
              onChange={(e) => void save({ summary_hour_utc: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {`${String(h).padStart(2, '0')}:00 UTC`}
                </option>
              ))}
            </Select>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}
