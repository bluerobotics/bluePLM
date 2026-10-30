import { useEffect, useMemo, useRef } from 'react'

import { usePDMStore } from '@/stores/pdmStore'
import { hasDesktop } from '@/lib/platform'
import { logKeyboard } from '@/lib/userActionLogger'

import { resolveBindingsCached, type ResolvedBindings } from './bindings'
import { detectShortcutPlatform, formatCombo, type ShortcutPlatform } from './combo'
import {
  configureShortcutDispatcher,
  registerShortcuts,
  type ShortcutHandlers,
  type ShortcutRegistration,
} from './dispatcher'
import { getShortcutAction, type ShortcutActionId, type ShortcutScope } from './registry'

/** Whether a modal dialog is open over the app (the core `Dialog` and settings mark their overlay). */
function isModalOpen(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('[data-native-preview-overlay="modal"]')
}

configureShortcutDispatcher({
  getBindings: () => resolveBindingsCached(usePDMStore.getState().shortcutOverrides),
  isDesktop: hasDesktop,
  isModalOpen,
  // App-wide commands were always logged; navigation keys would only flood the log.
  onHandled: (combo, actionId) => {
    if (getShortcutAction(actionId)?.scope === 'global') logKeyboard(combo, actionId)
  },
})

export interface UseShortcutsOptions {
  /** Register only while true (default true). */
  enabled?: boolean
  isActive?: ShortcutRegistration['isActive']
  blockedByModal?: boolean
}

/**
 * Attaches handlers to the registry's actions of one scope while the component is mounted. The
 * handlers object may change on every render: the latest one runs.
 */
export function useShortcuts(
  scope: ShortcutScope,
  handlers: ShortcutHandlers,
  { enabled = true, isActive, blockedByModal = false }: UseShortcutsOptions = {},
): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  useEffect(() => {
    if (!enabled) return
    return registerShortcuts({
      scope,
      getHandlers: () => handlersRef.current,
      isActive: (event, actionId) => isActiveRef.current?.(event, actionId) ?? true,
      blockedByModal,
    })
  }, [scope, enabled, blockedByModal])
}

/** Every action's keys right now, re-rendering when the user changes one. */
export function useResolvedBindings(): ResolvedBindings {
  const overrides = usePDMStore((s) => s.shortcutOverrides)
  return useMemo(() => resolveBindingsCached(overrides), [overrides])
}

let platform: ShortcutPlatform | null = null

export function getShortcutPlatform(): ShortcutPlatform {
  platform ??= detectShortcutPlatform()
  return platform
}

/** An action's primary key as text ("Ctrl+K", "⌘K"), or null when it has none. For tooltips. */
export function useShortcutLabel(actionId: ShortcutActionId): string | null {
  const bindings = useResolvedBindings()
  const primary = bindings.get(actionId)?.[0]
  return primary ? formatCombo(primary, getShortcutPlatform()) : null
}
