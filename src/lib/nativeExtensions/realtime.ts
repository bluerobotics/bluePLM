/**
 * Realtime notice of changes to the organization's installed extensions, so a
 * disable, uninstall or new version reaches running desktops without a restart.
 * Bursts (an install writes the row, then the admin toggles it) are debounced.
 */

import { getSupabaseClient } from '@/lib/supabase/client'

export const EXTENSION_CHANGE_DEBOUNCE_MS = 1000

/** Call `onChange` once per quiet period after any number of `notify()` calls. */
export function createDebouncer(onChange: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    notify() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        onChange()
      }, delayMs)
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

/**
 * Subscribe to INSERT/UPDATE/DELETE on org_installed_extensions for one org.
 * Returns the unsubscribe function (it also cancels a pending notice).
 */
export function subscribeToOrgExtensionChanges(
  orgId: string,
  onChange: () => void,
  delayMs: number = EXTENSION_CHANGE_DEBOUNCE_MS,
): () => void {
  const debouncer = createDebouncer(onChange, delayMs)
  const client = getSupabaseClient()
  const channel = client
    .channel(`org-extensions:${orgId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'org_installed_extension',
        filter: `org_id=eq.${orgId}`,
      },
      () => debouncer.notify(),
    )
    .subscribe()

  return () => {
    debouncer.cancel()
    void client.removeChannel(channel)
  }
}
