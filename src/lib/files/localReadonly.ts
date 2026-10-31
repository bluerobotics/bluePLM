/**
 * The Windows read-only attribute on a vault working copy.
 *
 * Checkout is what clears it. A metadata write must not invent a clearance of its own, and it
 * must not ask SolidWorks to save a file the attribute still protects.
 */

import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { listWriteAddresses } from '@/lib/metadata/writeState'
import { usePDMStore } from '@/stores/pdmStore'
import type { PendingMetadataEdit } from '@/stores/types'

/** `missing` means nothing exists at the path - a rename or move, not a permissions problem. */
export type DiskWriteAccess = 'writable' | 'readonly' | 'missing' | 'unknown'

const READONLY_RETRY_COUNT = 1
const FILE_NOT_FOUND_CODE = 'ENOENT'

export async function readDiskWriteAccess(filePath: string): Promise<DiskWriteAccess> {
  try {
    const result = await window.electronAPI?.isReadonly(filePath)
    if (result && result.success === false && result.code === FILE_NOT_FOUND_CODE) {
      return 'missing'
    }
    if (!result || result.success === false || typeof result.readonly !== 'boolean') {
      return 'unknown'
    }
    return result.readonly ? 'readonly' : 'writable'
  } catch (error) {
    log.warn('[Readonly]', 'Could not read the read-only attribute', {
      path: filePath,
      error: error instanceof Error ? error.message : String(error),
    })
    return 'unknown'
  }
}

async function clearReadOnly(paths: readonly string[]): Promise<void> {
  const batch = await window.electronAPI?.setReadonlyBatch(
    paths.map((path) => ({ path, readonly: false })),
  )
  if (!batch) {
    log.warn('[Readonly]', 'setReadonlyBatch is unavailable', { count: paths.length })
  }
}

/**
 * Clear the read-only attribute, then read it back. One retry for anything still not writable.
 * Returns the paths that stayed read-only or whose attribute could not be read.
 */
export async function makeFilesWritable(paths: readonly string[]): Promise<string[]> {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return []

  let pending = unique
  for (let attempt = 0; attempt <= READONLY_RETRY_COUNT; attempt++) {
    await clearReadOnly(pending)
    const still: string[] = []
    for (const path of pending) {
      if ((await readDiskWriteAccess(path)) !== 'writable') still.push(path)
    }
    if (still.length === 0) return []
    pending = still
  }
  return pending
}

/**
 * Stop a SolidWorks write when the working copy is not writable.
 *
 * Returns true when the caller must not write. The toast is the only notice; when an edit is
 * passed, its addresses are marked failed so check-in does not treat the value as confirmed
 * in the file.
 */
export async function stopIfFileNotWritable(
  filePath: string,
  edit?: PendingMetadataEdit,
): Promise<boolean> {
  const access = await readDiskWriteAccess(filePath)
  if (access === 'writable') return false

  const reason =
    access === 'readonly'
      ? t('fileReadonly.blocked')
      : access === 'missing'
        ? t('fileReadonly.missing')
        : t('fileReadonly.unknown')
  const { addToast, recordMetadataWriteStates } = usePDMStore.getState()
  addToast('error', reason)

  if (edit) {
    const addresses = listWriteAddresses(edit.pending)
    if (addresses.length > 0) {
      recordMetadataWriteStates(
        edit.path,
        addresses.map((address) => ({ address, state: 'failed' as const, reason })),
      )
    }
  }
  return true
}
