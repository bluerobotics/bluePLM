import type { LocalFile } from '@/stores/pdmStore'
import type { Clipboard } from './types'
import { executeCommand } from '@/lib/commands'

/**
 * Check if files can be cut (always allowed - checkout not required for moving)
 */
export function canCutFiles(_files: LocalFile[], _userId?: string): boolean {
  return true
}

/**
 * Get files that block cut operation (none - moving is always allowed)
 */
export function getCutBlockers(_files: LocalFile[], _userId?: string): LocalFile[] {
  return []
}

/**
 * Execute paste operation
 */
export async function executePaste(
  clipboard: Clipboard,
  targetFolder: string,
  onRefresh?: (silent?: boolean) => void
): Promise<{ success: boolean; error?: string; succeeded?: number; total?: number }> {
  try {
    const command = clipboard.operation === 'cut' ? 'move' : 'copy'
    const result = await executeCommand(command, {
      files: clipboard.files,
      targetFolder
    }, { onRefresh, silent: true })
    return { 
      success: result.success, 
      succeeded: result.succeeded, 
      total: result.total,
      error: result.success ? undefined : result.message
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}
