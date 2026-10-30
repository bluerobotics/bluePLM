import { useMemo } from 'react'
import { fileWorkflowsEnabled } from '@/lib/fileWorkflows'
import { hasDesktop } from '@/lib/platform'
import { usePDMStore } from '@/stores/pdmStore'
import { computeDeniedModules, type ModuleId } from '@/types/modules'

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
 *
 * On BluePLM Web (no Electron bridge, `hasDesktop()` false) the desktop-only modules
 * (Pending Changes, Google Drive, Terminal: `desktopOnly` in MODULES) are denied the same way.
 */
export function useDeniedModules(): ReadonlySet<ModuleId> {
  const deniedModules = usePDMStore((s) => s.deniedModules)
  const workflowsOn = usePDMStore((s) => fileWorkflowsEnabled(s.organization))
  const desktop = hasDesktop()

  return useMemo(
    () => computeDeniedModules(deniedModules, workflowsOn, desktop),
    [deniedModules, workflowsOn, desktop],
  )
}
