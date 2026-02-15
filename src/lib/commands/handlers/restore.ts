/**
 * Restore Command Handler
 * 
 * Commands: restore, undelete
 * 
 * Restores a file from trash (soft-deleted state) back to its original location.
 * Searches the supabase `files` table for deleted files matching the given name
 * or path pattern.
 */

import { usePDMStore } from '../../../stores/pdmStore'
import { getDeletedFiles, restoreFile } from '../../supabase'
import { registerTerminalCommand } from '../registry'
import type { ParsedCommand, TerminalOutput } from '../parser'

type OutputFn = (type: TerminalOutput['type'], content: string) => void

/**
 * Search for a deleted file by name or path pattern.
 * Unlike resolvePathPattern (which works on local files), this queries
 * the supabase database for soft-deleted files matching the search term.
 * 
 * @param searchTerm - File name or path fragment to search for
 * @param orgId - Organization ID to scope the search
 * @param vaultId - Optional vault ID to narrow results
 * @returns Array of matching deleted file records
 */
async function findDeletedFile(
  searchTerm: string,
  orgId: string,
  vaultId?: string
): Promise<Array<{ id: string; file_name: string; file_path: string; deleted_at: string }>> {
  const { files: deletedFiles, error } = await getDeletedFiles(orgId, {
    vaultId: vaultId || undefined
  })

  if (error || !deletedFiles || deletedFiles.length === 0) {
    return []
  }

  const normalizedSearch = searchTerm
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase()

  // Strategy 1: Exact path match
  const exactMatch = deletedFiles.find(
    f => f.file_path.replace(/\\/g, '/').toLowerCase() === normalizedSearch
  )
  if (exactMatch) {
    return [exactMatch]
  }

  // Strategy 2: Exact filename match
  const nameMatches = deletedFiles.filter(
    f => f.file_name.toLowerCase() === normalizedSearch
  )
  if (nameMatches.length > 0) {
    return nameMatches
  }

  // Strategy 3: Path suffix match (e.g., "folder/file.sldprt")
  const suffixMatches = deletedFiles.filter(f => {
    const normalizedPath = f.file_path.replace(/\\/g, '/').toLowerCase()
    return normalizedPath.endsWith('/' + normalizedSearch) || normalizedPath === normalizedSearch
  })
  if (suffixMatches.length > 0) {
    return suffixMatches
  }

  // Strategy 4: Partial name match (contains search term)
  const partialMatches = deletedFiles.filter(
    f => f.file_name.toLowerCase().includes(normalizedSearch)
  )

  return partialMatches
}

/**
 * Handle restore command - restore a file from trash.
 * 
 * Searches for deleted files matching the given name/path,
 * then restores the most recently deleted match.
 */
export async function handleRestore(
  parsed: ParsedCommand,
  addOutput: OutputFn,
  onRefresh?: (silent?: boolean) => void
): Promise<void> {
  const searchTerm = parsed.args[0]
  if (!searchTerm) {
    addOutput('error', 'Usage: restore <filename-or-path>')
    addOutput('info', 'Searches trash for a deleted file by name and restores it.')
    return
  }

  const { user, organization, activeVaultId } = usePDMStore.getState()
  if (!user) {
    addOutput('error', 'Not signed in')
    return
  }

  if (!organization) {
    addOutput('error', 'No organization selected')
    return
  }

  // Search for the deleted file in the database
  addOutput('info', `Searching trash for: ${searchTerm}...`)

  const matches = await findDeletedFile(
    searchTerm,
    organization.id,
    activeVaultId || undefined
  )

  if (matches.length === 0) {
    addOutput('error', `No deleted files found matching: ${searchTerm}`)
    addOutput('info', 'Tip: Use the exact filename (e.g., "part.sldprt") or a partial name.')
    return
  }

  if (matches.length > 1) {
    // Multiple matches - show list and ask user to be more specific
    const lines = [`Found ${matches.length} deleted files matching "${searchTerm}":`]
    const displayLimit = 10
    matches.slice(0, displayLimit).forEach((f, i) => {
      const deletedDate = new Date(f.deleted_at).toLocaleDateString()
      lines.push(`  ${i + 1}. ${f.file_path} (deleted ${deletedDate})`)
    })
    if (matches.length > displayLimit) {
      lines.push(`  ... and ${matches.length - displayLimit} more`)
    }
    lines.push('Please use a more specific path to select one file.')
    addOutput('info', lines.join('\n'))
    return
  }

  // Single match - restore it
  const fileToRestore = matches[0]

  try {
    const result = await restoreFile(fileToRestore.id, user.id)

    if (result.success) {
      addOutput('success', `Restored: ${fileToRestore.file_path}`)
      // Trigger a silent refresh so the file appears in the browser
      onRefresh?.(true)
    } else {
      addOutput('error', result.error || `Failed to restore: ${fileToRestore.file_name}`)
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    addOutput('error', `Failed to restore file: ${errMsg}`)
  }
}

// ============================================
// Self-registration
// ============================================

registerTerminalCommand({
  aliases: ['restore', 'undelete'],
  description: 'Restore a file from trash',
  usage: 'restore <filename-or-path>',
  examples: ['restore part.sldprt', 'restore folder/assembly.sldasm'],
  category: 'pdm'
}, async (parsed, _files, addOutput, onRefresh) => {
  await handleRestore(parsed, addOutput, onRefresh)
})
