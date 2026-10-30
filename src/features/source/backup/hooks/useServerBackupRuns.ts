import { useCallback, useEffect, useState } from 'react'
import { getBackupRuns, type BackupRun } from '@/lib/backup'

/**
 * The organization's recent server backups and tests (backup_history), newest first.
 * Polls every 15 s while a backup or test is pending or running, every 60 s otherwise, and
 * only while `enabled` (server-run backups); stops when unmounted.
 */
export function useServerBackupRuns(orgId: string | undefined, enabled: boolean, pending: boolean) {
  const [runs, setRuns] = useState<BackupRun[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (!orgId) return
    setRuns(await getBackupRuns(orgId, 10))
    setLoaded(true)
  }, [orgId])

  useEffect(() => {
    if (!enabled) return
    void reload()
    const timer = setInterval(() => void reload(), pending ? 15_000 : 60_000)
    return () => clearInterval(timer)
  }, [enabled, pending, reload])

  const lastGood = runs.find((r) => r.kind === 'backup' && (r.status === 'completed' || r.status === 'warning'))
  const lastTest = runs.find((r) => r.kind === 'verify' && r.status !== 'running')
  return { runs, loaded, reload, lastGood: lastGood ?? null, lastTest: lastTest ?? null }
}
