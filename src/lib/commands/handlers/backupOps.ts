/**
 * Backup Operations Command Handlers
 *
 * Commands: backup, backup-status, backup-history, snapshots, trash, empty-trash, versions, rollback, activity
 */

import { usePDMStore, LocalFile } from '../../../stores/pdmStore'
import { getBackupConfig, getBackupStatus, requestBackup, listSnapshots } from '../../backup'
import {
  getFileVersions,
  getDeletedFiles,
  emptyTrash,
  getRecentActivity,
  rollbackToVersion,
} from '../../supabase'
import { registerTerminalCommand } from '../registry'
import type { ParsedCommand, TerminalOutput } from '../parser'

type OutputFn = (type: TerminalOutput['type'], content: string) => void

/**
 * Resolve a path pattern to matching files
 */
function resolvePathPattern(pattern: string, files: LocalFile[]): LocalFile[] {
  let normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')

  if (normalizedPattern.includes('*')) {
    const regexPattern = normalizedPattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<DOUBLESTAR>>>/g, '.*')
    const regex = new RegExp(`^${regexPattern}$`)

    return files.filter((f) => {
      const normalizedPath = f.relativePath.replace(/\\/g, '/')
      return regex.test(normalizedPath)
    })
  }

  const exactMatch = files.find(
    (f) => f.relativePath.replace(/\\/g, '/').toLowerCase() === normalizedPattern.toLowerCase(),
  )

  if (exactMatch) {
    return [exactMatch]
  }

  return files.filter((f) => {
    const normalizedPath = f.relativePath.replace(/\\/g, '/').toLowerCase()
    return normalizedPath.startsWith(normalizedPattern.toLowerCase() + '/')
  })
}

/**
 * Handle backup command - request backup
 */
export async function handleBackup(addOutput: OutputFn): Promise<void> {
  const { organization, user } = usePDMStore.getState()
  if (!organization || !user) {
    addOutput('error', 'Not signed in')
    return
  }

  addOutput('info', 'Requesting backup...')
  try {
    const result = await requestBackup(organization.id, user.email)
    if (result.success) {
      addOutput('success', 'Backup requested. The designated machine will run the backup shortly.')
    } else {
      addOutput('error', result.error || 'Failed to request backup')
    }
  } catch (error) {
    addOutput('error', `Backup failed: ${error}`)
  }
}

/**
 * Handle backup-status command - show backup status
 */
export async function handleBackupStatus(addOutput: OutputFn): Promise<void> {
  const { organization } = usePDMStore.getState()
  if (!organization) {
    addOutput('error', 'Not signed in')
    return
  }

  try {
    const status = await getBackupStatus(organization.id)
    const lines = ['📦 Backup Status']

    if (!status.isConfigured) {
      lines.push('   Status: Not configured')
    } else {
      lines.push(`   Provider: ${status.config?.provider || 'Unknown'}`)
      lines.push(`   Bucket: ${status.config?.bucket || 'Unknown'}`)
      lines.push(`   Designated Machine: ${status.config?.designated_machine_name || 'None'}`)

      if (status.config?.backup_running_since) {
        lines.push(
          `   🔄 Backup in progress since ${new Date(status.config.backup_running_since).toLocaleString()}`,
        )
      } else if (status.config?.backup_requested_at) {
        lines.push(
          `   ⏳ Backup pending (requested ${new Date(status.config.backup_requested_at).toLocaleString()})`,
        )
      }

      if (status.lastSnapshot) {
        lines.push(`   Latest: ${new Date(status.lastSnapshot.time).toLocaleString()}`)
      }

      lines.push(`   Total Snapshots: ${status.totalSnapshots}`)
    }

    addOutput('info', lines.join('\n'))
  } catch (error) {
    addOutput('error', `Failed to get backup status: ${error}`)
  }
}

/**
 * Handle backup-history/snapshots command - list backup snapshots
 */
export async function handleBackupHistory(addOutput: OutputFn): Promise<void> {
  const { organization } = usePDMStore.getState()
  if (!organization) {
    addOutput('error', 'Not signed in')
    return
  }

  try {
    const config = await getBackupConfig(organization.id)
    if (!config) {
      addOutput('error', 'Backup not configured')
      return
    }

    const snapshots = await listSnapshots(config)

    if (snapshots.length === 0) {
      addOutput('info', 'No backups found')
      return
    }

    const lines = ['📦 Backup Snapshots:']
    for (const snap of snapshots.slice(0, 10)) {
      const date = new Date(snap.time).toLocaleString()
      const snapId = snap.short_id || snap.id?.substring(0, 8) || 'unknown'
      lines.push(`  ${snapId} - ${date} (${snap.tags?.join(', ') || 'no tags'})`)
    }
    if (snapshots.length > 10) {
      lines.push(`  ... and ${snapshots.length - 10} more`)
    }
    addOutput('info', lines.join('\n'))
  } catch (error) {
    addOutput('error', `Failed to list snapshots: ${error}`)
  }
}

/**
 * Handle trash command - list deleted files
 */
export async function handleTrash(addOutput: OutputFn): Promise<void> {
  const { organization, activeVaultId } = usePDMStore.getState()
  if (!organization) {
    addOutput('error', 'Not signed in')
    return
  }

  try {
    const result = await getDeletedFiles(organization.id, { vaultId: activeVaultId || undefined })
    if (result.error) {
      addOutput('error', result.error)
      return
    }

    if (result.files.length === 0) {
      addOutput('info', '🗑️ Trash is empty')
      return
    }

    const lines = [`🗑️ Trash (${result.files.length} files):`]
    for (const file of result.files.slice(0, 20)) {
      const deletedDate = file.deleted_at ? new Date(file.deleted_at).toLocaleDateString() : ''
      const deletedBy = file.deleted_by_user?.full_name || file.deleted_by_user?.email || ''
      lines.push(
        `  ${file.file_path} (deleted ${deletedDate}${deletedBy ? ` by ${deletedBy}` : ''})`,
      )
    }
    if (result.files.length > 20) {
      lines.push(`  ... and ${result.files.length - 20} more`)
    }
    addOutput('info', lines.join('\n'))
  } catch (error) {
    addOutput('error', `Failed to get trash: ${error}`)
  }
}

/**
 * Handle empty-trash command - permanently delete all trash
 */
export async function handleEmptyTrash(
  addOutput: OutputFn,
  onRefresh?: (silent?: boolean) => void,
): Promise<void> {
  const { organization, user, activeVaultId } = usePDMStore.getState()
  if (!organization || !user) {
    addOutput('error', 'Not signed in')
    return
  }

  if (user.role !== 'admin') {
    addOutput('error', 'Admin access required')
    return
  }

  try {
    const result = await emptyTrash(organization.id, user.id, activeVaultId || undefined)
    if (result.success) {
      addOutput('success', `Permanently deleted ${result.deleted} files from trash`)
      onRefresh?.(true)
    } else {
      addOutput('error', result.error || 'Failed to empty trash')
    }
  } catch (error) {
    addOutput('error', `Failed to empty trash: ${error}`)
  }
}

/**
 * Handle versions command - show version history
 */
export async function handleVersions(
  parsed: ParsedCommand,
  files: LocalFile[],
  addOutput: OutputFn,
): Promise<void> {
  const path = parsed.args[0]
  if (!path) {
    addOutput('error', 'Usage: versions <file-path>')
    return
  }

  const matches = resolvePathPattern(path, files)
  if (matches.length === 0 || !matches[0].pdmData?.id) {
    addOutput('error', `Synced file not found: ${path}`)
    return
  }

  try {
    const result = await getFileVersions(matches[0].pdmData.id)
    if (result.error || !result.versions) {
      addOutput('error', result.error?.message || 'Failed to get versions')
      return
    }

    if (result.versions.length === 0) {
      addOutput('info', 'No version history')
      return
    }

    const lines = [`📜 Version History for ${matches[0].name}:`]
    for (const ver of result.versions.slice(0, 15)) {
      const date = ver.created_at ? new Date(ver.created_at).toLocaleString() : 'Unknown'
      const user = ver.created_by_user?.full_name || ver.created_by_user?.email || ''
      const current = ver.version === matches[0].pdmData?.version ? ' (current)' : ''
      lines.push(`  v${ver.version} - ${date} by ${user}${current}`)
      if (ver.comment) lines.push(`       "${ver.comment}"`)
    }
    addOutput('info', lines.join('\n'))
  } catch (error) {
    addOutput('error', `Failed to get versions: ${error}`)
  }
}

/**
 * Handle rollback command - roll back to version
 */
export async function handleRollback(
  parsed: ParsedCommand,
  files: LocalFile[],
  addOutput: OutputFn,
  onRefresh?: (silent?: boolean) => void,
): Promise<void> {
  const path = parsed.args[0]
  const versionStr = parsed.args[1]

  if (!path || !versionStr) {
    addOutput('error', 'Usage: rollback <file-path> <version>')
    return
  }

  const version = parseInt(versionStr)
  if (isNaN(version)) {
    addOutput('error', 'Version must be a number')
    return
  }

  const { user } = usePDMStore.getState()
  if (!user) {
    addOutput('error', 'Not signed in')
    return
  }

  const matches = resolvePathPattern(path, files)
  if (matches.length === 0 || !matches[0].pdmData?.id) {
    addOutput('error', `Synced file not found: ${path}`)
    return
  }

  const file = matches[0]
  if (file.pdmData?.checked_out_by !== user.id) {
    addOutput('error', 'File must be checked out to you to rollback')
    return
  }

  try {
    addOutput('info', `Rolling back to version ${version}...`)
    const result = await rollbackToVersion(file.pdmData.id, user.id, version)

    if (result.success) {
      addOutput('success', `Rolled back to version ${version}. Check in to save.`)
      onRefresh?.(true)
    } else {
      addOutput('error', result.error || 'Rollback failed')
    }
  } catch (error) {
    addOutput('error', `Rollback failed: ${error}`)
  }
}

/**
 * Handle activity command - show recent activity
 */
export async function handleActivity(parsed: ParsedCommand, addOutput: OutputFn): Promise<void> {
  const { organization } = usePDMStore.getState()
  if (!organization) {
    addOutput('error', 'Not signed in')
    return
  }

  const count = parseInt(parsed.flags['n'] as string) || 20

  try {
    const result = await getRecentActivity(organization.id, count)
    if (result.error || !result.activity) {
      addOutput('error', result.error?.message || 'Failed to get activity')
      return
    }

    if (result.activity.length === 0) {
      addOutput('info', 'No recent activity')
      return
    }

    const lines = ['📋 Recent Activity:']
    for (const act of result.activity) {
      const time = act.created_at ? new Date(act.created_at).toLocaleString() : 'Unknown'
      const details = act.details as { file_name?: string } | null
      const fileName = act.file?.file_name || details?.file_name || ''
      lines.push(`  ${time} - ${act.action}${fileName ? `: ${fileName}` : ''}`)
    }
    addOutput('info', lines.join('\n'))
  } catch (error) {
    addOutput('error', `Failed to get activity: ${error}`)
  }
}

// ============================================
// Self-registration
// ============================================

registerTerminalCommand(
  {
    aliases: ['backup'],
    description: 'Request backup',
    category: 'backup',
  },
  async (_parsed, _files, addOutput) => {
    await handleBackup(addOutput)
  },
)

registerTerminalCommand(
  {
    aliases: ['backup-status'],
    description: 'Show backup status',
    category: 'backup',
  },
  async (_parsed, _files, addOutput) => {
    await handleBackupStatus(addOutput)
  },
)

registerTerminalCommand(
  {
    aliases: ['backup-history', 'snapshots'],
    description: 'List backup snapshots',
    category: 'backup',
  },
  async (_parsed, _files, addOutput) => {
    await handleBackupHistory(addOutput)
  },
)

registerTerminalCommand(
  {
    aliases: ['trash'],
    description: 'List deleted files',
    category: 'backup',
  },
  async (_parsed, _files, addOutput) => {
    await handleTrash(addOutput)
  },
)

registerTerminalCommand(
  {
    aliases: ['empty-trash'],
    description: 'Permanently delete all trash (admin)',
    category: 'backup',
  },
  async (_parsed, _files, addOutput, onRefresh) => {
    await handleEmptyTrash(addOutput, onRefresh)
  },
)

registerTerminalCommand(
  {
    aliases: ['versions'],
    description: 'Show version history',
    usage: 'versions <file-path>',
    category: 'backup',
  },
  async (parsed, files, addOutput) => {
    await handleVersions(parsed, files, addOutput)
  },
)

registerTerminalCommand(
  {
    aliases: ['rollback'],
    description: 'Roll back to a version',
    usage: 'rollback <file-path> <version>',
    category: 'backup',
  },
  async (parsed, files, addOutput, onRefresh) => {
    await handleRollback(parsed, files, addOutput, onRefresh)
  },
)

registerTerminalCommand(
  {
    aliases: ['activity'],
    description: 'Show recent activity',
    usage: 'activity [-n N]',
    category: 'backup',
  },
  async (parsed, _files, addOutput) => {
    await handleActivity(parsed, addOutput)
  },
)
