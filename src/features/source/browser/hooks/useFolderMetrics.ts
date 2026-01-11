import type { FolderMetricsMap } from '../types'
import { useVaultTree } from '@/features/source/explorer/file-tree/hooks/useVaultTree'

/**
 * Options for useFolderMetrics hook.
 * 
 * @deprecated These options are no longer used. The hook now delegates to useVaultTree
 * which reads directly from the store for consistent, single-source metrics computation.
 * Kept for backward compatibility with existing callers.
 */
export interface UseFolderMetricsOptions {
  files: unknown[]
  userId: string | undefined
  userFullName: string | undefined
  userEmail: string | undefined
  userAvatarUrl: string | undefined
  hideSolidworksTempFiles: boolean
}

/**
 * Hook to get pre-computed folder metrics for O(1) lookups.
 * 
 * **ARCHITECTURE NOTE:**
 * This hook is now a thin wrapper around `useVaultTree().folderMetrics`.
 * Previously, folder metrics were computed independently in two places:
 * - `useVaultTree.ts` (full computation with 20+ fields)
 * - `useFolderMetrics.ts` (duplicate computation with subset of fields)
 * 
 * Both were running on every state change (~17-20ms each), causing:
 * - Wasted CPU cycles (duplicate O(N) iterations)
 * - Potential inconsistency between the two computations
 * - Double logging in performance metrics
 * 
 * Now there's a single source of truth: `useVaultTree.folderMetrics`.
 * This hook delegates to it, ensuring consistent metrics across the app.
 * 
 * **PERFORMANCE:**
 * - Single O(N) pass through files (in useVaultTree)
 * - O(1) lookups for any folder path
 * - No duplicate computation
 * 
 * @param _options - Deprecated. Options are ignored; hook reads from store via useVaultTree.
 * @returns Map of folder path to pre-computed FolderMetrics
 */
export function useFolderMetrics(_options: UseFolderMetricsOptions): FolderMetricsMap {
  // Delegate to useVaultTree which computes comprehensive folder metrics
  // in a single O(N) pass. The options are ignored since useVaultTree
  // reads directly from the PDM store (same source the callers use).
  const { folderMetrics } = useVaultTree()
  
  // The returned FolderMetrics from useVaultTree is a superset of what
  // browser/types.ts defines, so it's fully compatible with consumers.
  return folderMetrics
}
