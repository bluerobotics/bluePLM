import { SettingRow } from '@/features/settings/components/ui'

import type { BackupStatus } from './types'
import { formatRelativeTime, formatTimeUntil, getNextScheduledBackup } from './utils'

interface BackupScheduleInfoProps {
  status: BackupStatus
}

/**
 * The last backup time and the next scheduled backup time, as two rows of a SettingsGroup.
 */
export function BackupScheduleInfo({ status }: BackupScheduleInfoProps) {
  const config = status.config
  const scheduled =
    config?.schedule_enabled &&
    config?.designated_machine_id &&
    config.schedule_hour != null &&
    config.schedule_minute != null

  return (
    <>
      <SettingRow
        label="Last Backup"
        description={status.lastSnapshot ? status.lastSnapshot.hostname : undefined}
      >
        <span className="text-[13px] text-plm-fg">
          {status.lastSnapshot ? formatRelativeTime(status.lastSnapshot.time) : 'None yet'}
        </span>
      </SettingRow>
      <SettingRow
        label="Next Backup"
        description={
          scheduled && config
            ? `${String(config.schedule_hour).padStart(2, '0')}:${String(config.schedule_minute).padStart(2, '0')} ${
                config.schedule_timezone?.replace(/_/g, ' ').split('/').pop() || 'UTC'
              }`
            : undefined
        }
      >
        <span className="text-[13px] text-plm-fg">
          {scheduled && config && config.schedule_hour != null && config.schedule_minute != null
            ? formatTimeUntil(
                getNextScheduledBackup(
                  config.schedule_hour,
                  config.schedule_minute,
                  config.schedule_timezone,
                ),
              )
            : !config?.designated_machine_id
              ? 'No machine set'
              : 'Not scheduled'}
        </span>
      </SettingRow>
    </>
  )
}
