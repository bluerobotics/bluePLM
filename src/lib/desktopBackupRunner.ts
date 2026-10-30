/**
 * Runs a desktop (restic) backup of this computer's vaults, and holds whether one is running.
 *
 * Before this module the run lived in the Backup settings panel's hook, and so did the service
 * that answers schedules and "Request backup": the designated computer backed up only while
 * someone had that page open, while the app-level heartbeat kept reporting it online.
 * `useDesktopBackupService` (app level) now starts the service and calls `runDesktopBackup`;
 * the panel reads the state here through `subscribeDesktopBackup` and calls the same function
 * for "Back up now".
 */
import { log } from '@/lib/logger'
import {
  markBackupComplete,
  markBackupStarted,
  runBackup,
  setBackupRunningLocally,
  type BackupConfig,
} from './backup'

export interface DesktopBackupProgress {
  phase: string
  percent: number
  message: string
}

export interface DesktopBackupState {
  running: boolean
  progress: DesktopBackupProgress | null
}

export interface DesktopBackupVault {
  id: string
  name: string
  localPath: string
}

type Notify = (type: 'success' | 'error' | 'info', message: string) => void

let state: DesktopBackupState = { running: false, progress: null }
const listeners = new Set<(state: DesktopBackupState) => void>()

function setState(next: DesktopBackupState): void {
  state = next
  setBackupRunningLocally(next.running)
  for (const listener of listeners) listener(state)
}

export function getDesktopBackupState(): DesktopBackupState {
  return state
}

export function subscribeDesktopBackup(listener: (state: DesktopBackupState) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Backs up each vault in turn and marks the organization's backup as running in the database
 * for the duration. One run at a time per process; a second call while one runs is refused.
 */
export async function runDesktopBackup(
  config: BackupConfig,
  vaults: DesktopBackupVault[],
  notify: Notify,
): Promise<{ succeeded: number; failed: number }> {
  if (state.running) {
    notify('info', 'A backup is already running on this computer.')
    return { succeeded: 0, failed: 0 }
  }
  if (vaults.length === 0) {
    notify('error', 'No vaults to back up on this computer.')
    return { succeeded: 0, failed: 0 }
  }

  setState({ running: true, progress: { phase: 'Starting', percent: 0, message: 'Starting backup...' } })
  await markBackupStarted(config.org_id)
  const stopProgress = window.electronAPI?.onBackupProgress?.((progress) => {
    setState({ running: true, progress })
  })

  let succeeded = 0
  let failed = 0
  try {
    for (let i = 0; i < vaults.length; i++) {
      const vault = vaults[i]
      setState({
        running: true,
        progress: {
          phase: `Vault ${i + 1}/${vaults.length}`,
          percent: Math.round((i / vaults.length) * 100),
          message: `Backing up ${vault.name}...`,
        },
      })
      try {
        const result = await runBackup(config, {
          vaultId: vault.id,
          vaultName: vault.name,
          vaultPath: vault.localPath,
        })
        if (result.success) {
          succeeded++
          notify('success', `Backed up ${vault.name}: ${result.snapshotId?.substring(0, 8)}`)
        } else {
          failed++
          notify('error', `Failed to back up ${vault.name}: ${result.error}`)
        }
      } catch (error) {
        failed++
        log.error('[Backup]', `Backup failed for ${vault.name}`, { error })
        notify('error', `Failed to back up ${vault.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    stopProgress?.()
    await markBackupComplete(config.org_id)
    setState({ running: false, progress: null })
    if (vaults.length > 1) notify('info', `Backup complete: ${succeeded} succeeded, ${failed} failed`)
  }
  return { succeeded, failed }
}
