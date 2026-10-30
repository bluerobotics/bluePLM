import { useEffect } from 'react'
import {
  getBackupConfig,
  isBackupServiceRunning,
  isServerRun,
  isThisDesignatedMachine,
  startBackupService,
  stopBackupService,
} from '@/lib/backup'
import { runDesktopBackup } from '@/lib/desktopBackupRunner'
import { log } from '@/lib/logger'
import { hasDesktop } from '@/lib/platform'
import { usePDMStore } from '@/stores/pdmStore'

/** How often this computer re-checks whether it is the designated backup machine. */
const DESIGNATION_CHECK_MS = 60_000

/**
 * The designated backup machine's service, at app level: heartbeat, requested backups and the
 * schedule, whether or not the Backup settings page is open. (The service used to start inside
 * that page, so the designated computer only backed up while the page was showing.)
 *
 * Re-checks the designation every minute, so designating or releasing this computer from any
 * machine starts or stops the service here without a restart. When the server runs backups
 * (run_location 'server') the service keeps its heartbeat and leaves the work to the server.
 */
export function useBackupHeartbeat(organizationId: string | undefined) {
  useEffect(() => {
    if (!organizationId || !hasDesktop()) return
    let disposed = false

    const check = async () => {
      try {
        const config = await getBackupConfig(organizationId)
        if (disposed) return
        const designated = !!config && (await isThisDesignatedMachine(config))
        if (disposed) return
        if (designated && !isBackupServiceRunning()) {
          log.info('[Backup]', 'This is the designated machine, starting the backup service', {
            serverRun: isServerRun(config),
          })
          startBackupService(
            organizationId,
            '',
            async (requestConfig) => {
              const { connectedVaults, addToast } = usePDMStore.getState()
              await runDesktopBackup(
                requestConfig,
                connectedVaults.map((v) => ({ id: v.id, name: v.name, localPath: v.localPath })),
                addToast,
              )
            },
            () => getBackupConfig(organizationId),
          )
        } else if (!designated && isBackupServiceRunning()) {
          stopBackupService()
        }
      } catch (error) {
        log.error('[Backup]', 'Failed to check the backup designation', { error })
      }
    }

    void check()
    const timer = setInterval(() => void check(), DESIGNATION_CHECK_MS)
    return () => {
      disposed = true
      clearInterval(timer)
      stopBackupService()
    }
  }, [organizationId])
}
