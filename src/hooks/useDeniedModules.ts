import { useMemo } from 'react'
import { fileWorkflowsEnabled } from '@/lib/fileWorkflows'
import { usePDMStore } from '@/stores/pdmStore'
import type { ModuleId } from '@/types/modules'

const NO_DENIED_MODULES: ReadonlySet<ModuleId> = new Set()

/**
 * Modules the current user is restricted out of, as a set suitable for passing
 * to isModuleVisible().
 *
 * The store keeps the denied list as an array so the reference stays stable
 * between loads; this memoises the Set on top of it. Admins and users with no
 * restrictions share one frozen empty Set, which keeps the common case free of
 * allocations and keeps useMemo dependencies downstream stable.
 *
 * File workflows switched off for the organization (Settings > File Workflows)
 * deny the Workflows view to everyone, admins included, so every surface that
 * honours module access hides it too.
 */
export function useDeniedModules(): ReadonlySet<ModuleId> {
  const deniedModules = usePDMStore((s) => s.deniedModules)
  const workflowsOn = usePDMStore((s) => fileWorkflowsEnabled(s.organization))

  return useMemo(() => {
    if (workflowsOn) return deniedModules.length === 0 ? NO_DENIED_MODULES : new Set(deniedModules)
    return new Set<ModuleId>([...deniedModules, 'workflows'])
  }, [deniedModules, workflowsOn])
}
