import type { LocalFile } from '@/stores/pdmStore'
import type { Clipboard } from './types'
import { executeCommand } from '@/lib/commands'

/**
 * Check if files can be cut (must be directories, local-only, or checked out by user)
 */
export function canCutFiles(files: LocalFile[], userId?: string): boolean {
  return files.every(f => 
    f.isDirectory || 
    !f.pdmData || 
    f.pdmData.checked_out_by === userId
  )
}

/**
 * Get files that block cut operation
 */
export function getCutBlockers(files: LocalFile[], userId?: string): LocalFile[] {
  return files.filter(f => 
    !f.isDirectory && 
    f.pdmData && 
    f.pdmData.checked_out_by !== userId
  )
}

/**
 * Execute paste operation
 */
export async function executePaste(
  clipboard: Clipboard,
  targetFolder: string,
  onRefresh?: (silent?: boolean) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    const command = clipboard.operation === 'cut' ? 'move' : 'copy'
    await executeCommand(command, {
      files: clipboard.files,
      targetFolder
    }, { onRefresh, silent: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}
