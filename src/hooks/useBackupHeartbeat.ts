import { useEffect } from 'react'
import { getBackupStatus, isThisDesignatedMachine, updateHeartbeat } from '@/lib/backup'
import { log } from '@/lib/logger'

/**
 * Backup machine heartbeat - keeps designated_machine_last_seen updated
 * This runs at App level so it doesn't require BackupPanel to be open
 */
export function useBackupHeartbeat(organizationId: string | undefined) {
  useEffect(() => {
    if (!organizationId) return
    
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null
    
    const checkAndStartHeartbeat = async () => {
      try {
        // Get backup config to check if this is the designated machine
        const status = await getBackupStatus(organizationId)
        if (!status.config?.designated_machine_id) return
        
        const isDesignated = await isThisDesignatedMachine(status.config)
        if (!isDesignated) return
        
        log.info('[Backup]', 'This is the designated machine, starting heartbeat')
        
        // Send immediate heartbeat
        await updateHeartbeat(organizationId)
        
        // Send heartbeat every minute
        heartbeatInterval = setInterval(() => {
          updateHeartbeat(organizationId)
        }, 60 * 1000)
      } catch (err) {
        log.error('[Backup]', 'Failed to start heartbeat', { error: err })
      }
    }
    
    checkAndStartHeartbeat()
    
    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
    }
  }, [organizationId])
}
