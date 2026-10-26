/** Baseline shim for the soak's "before" run: no health monitor exists yet. */

export function getAppHealthMonitor(): { counts(): Record<string, number>; recoveries(): unknown[] } | null {
  return null
}
