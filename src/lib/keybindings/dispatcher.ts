/**
 * The one keydown listener behind every registered shortcut. Components register handlers for the
 * actions of a scope while they are mounted (`registerShortcuts`, or the `useShortcuts` hook); a
 * key press runs the first matching handler, trying scopes in precedence order (`SHORTCUT_SCOPES`)
 * and, within a scope, the latest registration first.
 *
 * An action does not fire:
 * - while focus is in a text field, select or editable area, unless the action allows it;
 * - for a held-down key when the action is `noRepeat`;
 * - on BluePLM Web when it is desktop-only;
 * - when its registration is inactive for this event (`isActive`), or is `blockedByModal` and a
 *   modal dialog is open;
 * - when the press was already handled (`defaultPrevented`) by the element that has focus.
 *
 * A handler that returns `false` declines (nothing to act on), and the search carries on. A
 * handled press has its default prevented. The listener is on `window` in the bubble phase, so a
 * field or dialog that claims a key in its own handler still wins.
 */

import { comboMatches, eventToCombo } from './combo'
import { resolveBindings, type ResolvedBindings } from './bindings'
import { getShortcutAction, scopeRank, type ShortcutActionId, type ShortcutScope } from './registry'

/** Returns false when there was nothing to act on, so another action may take the key. */
export type ShortcutHandler = (event: KeyboardEvent) => void | boolean

export type ShortcutHandlers = Partial<Record<ShortcutActionId, ShortcutHandler>>

export interface ShortcutRegistration {
  scope: ShortcutScope
  /** Read at key time, so handlers can close over fresh state without re-registering. */
  getHandlers: () => ShortcutHandlers
  /** Whether this registration takes this press (focus inside a container, a mode, ...). */
  isActive?: (event: KeyboardEvent, actionId: ShortcutActionId) => boolean
  /** Ignore presses while a modal dialog is open over the app. */
  blockedByModal?: boolean
}

interface DispatcherConfig {
  getBindings: () => ResolvedBindings
  isDesktop: () => boolean
  isModalOpen: () => boolean
  onHandled?: (combo: string, actionId: ShortcutActionId) => void
}

const DEFAULT_BINDINGS = resolveBindings({})

let config: DispatcherConfig = {
  getBindings: () => DEFAULT_BINDINGS,
  isDesktop: () => true,
  isModalOpen: () => false,
}

/** Wires the dispatcher to the store and the platform (done once by `useShortcuts.ts`). */
export function configureShortcutDispatcher(next: Partial<DispatcherConfig>): void {
  config = { ...config, ...next }
}

interface Entry {
  registration: ShortcutRegistration
  order: number
}

const entries: Entry[] = []
let nextOrder = 0
let listening = false
const handledEvents = new WeakSet<Event>()

function onKeyDown(event: KeyboardEvent): void {
  dispatchShortcut(event)
}

/** Adds a registration; returns the function that removes it. */
export function registerShortcuts(registration: ShortcutRegistration): () => void {
  const entry: Entry = { registration, order: nextOrder++ }
  entries.push(entry)
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown)
    listening = true
  }
  return () => {
    const index = entries.indexOf(entry)
    if (index >= 0) entries.splice(index, 1)
  }
}

/** Whether a press was taken by a shortcut (for listeners that run after, such as type-ahead). */
export function wasHandledByShortcut(event: Event): boolean {
  return handledEvents.has(event)
}

/** Whether a DOM target takes typing. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function sortedEntries(): Entry[] {
  return [...entries].sort(
    (a, b) =>
      scopeRank(a.registration.scope) - scopeRank(b.registration.scope) || b.order - a.order,
  )
}

/**
 * Runs the shortcut a key press triggers, if any. Returns the action id that handled it. Exported
 * for tests; the window listener calls it for every keydown.
 */
export function dispatchShortcut(event: KeyboardEvent): ShortcutActionId | null {
  if (event.defaultPrevented || event.isComposing) return null
  const combo = eventToCombo(event)
  if (!combo) return null

  const bindings = config.getBindings()
  const editable = isEditableTarget(event.target)
  let modalOpen: boolean | null = null

  for (const { registration } of sortedEntries()) {
    const handlers = registration.getHandlers()
    for (const [id, handler] of Object.entries(handlers) as [ShortcutActionId, ShortcutHandler][]) {
      if (!handler) continue
      const action = getShortcutAction(id)
      if (!action || action.scope !== registration.scope) continue
      const keys = bindings.get(id) ?? []
      if (!keys.some((key) => comboMatches(combo, key, action.allowExtraShift))) continue
      if (editable && !action.allowInInputs) continue
      if (event.repeat && action.noRepeat) continue
      if (action.desktopOnly && !config.isDesktop()) continue
      if (registration.blockedByModal) {
        modalOpen ??= config.isModalOpen()
        if (modalOpen) continue
      }
      if (registration.isActive && !registration.isActive(event, id)) continue
      if (handler(event) === false) continue
      event.preventDefault()
      handledEvents.add(event)
      config.onHandled?.(combo, id)
      return id
    }
  }
  return null
}

/** Removes every registration (tests). */
export function resetShortcutRegistrations(): void {
  entries.length = 0
}
