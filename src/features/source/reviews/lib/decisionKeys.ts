/**
 * Keyboard map for the review decision bar, and the "next item" rule behind auto-advance. The
 * keys are the shortcut registry's `reviews.*` actions (`src/lib/keybindings/registry.ts`), which
 * the user can rebind; the defaults are:
 *
 *   A        approve (no comment needed, decides at once)
 *   Shift+A  approve with comments (opens the comment box)
 *   C        request changes (opens the comment box)
 *   R        reject (opens the comment box)
 *   J / K    next / previous item
 *
 * Keys are ignored while typing in a field, while a modal dialog is open, and with Ctrl, Cmd or
 * Alt held, so they never fight text entry or the app's own shortcuts. A held-down key (auto-repeat)
 * never decides: with auto-advance it would decide item after item.
 */

import type { ReviewDecision } from '@/types/reviews'
import { comboMatches, eventToCombo } from '@/lib/keybindings/combo'
import { resolveBindings, type ResolvedBindings } from '@/lib/keybindings/bindings'
import { getShortcutAction } from '@/lib/keybindings/registry'

export type DecisionKeyAction =
  | { kind: 'decide'; decision: ReviewDecision }
  | { kind: 'next' }
  | { kind: 'previous' }

export interface DecisionKeyEvent {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  /** The event target is an input, textarea, select or contenteditable, or a modal is open. */
  inEditable: boolean
  /** The key is held down (auto-repeat). */
  repeat?: boolean
}

const DEFAULT_BINDINGS = resolveBindings({})

/** Review shortcut action -> what it does. */
export const REVIEW_KEY_ACTIONS = {
  'reviews.approve': { kind: 'decide', decision: 'approved' },
  'reviews.approveWithComments': { kind: 'decide', decision: 'approved_with_comments' },
  'reviews.requestChanges': { kind: 'decide', decision: 'changes_requested' },
  'reviews.reject': { kind: 'decide', decision: 'rejected' },
  'reviews.nextItem': { kind: 'next' },
  'reviews.previousItem': { kind: 'previous' },
} as const satisfies Record<string, DecisionKeyAction>

/**
 * What a key press does in an open review, with the given bindings (the defaults when omitted).
 * The dispatcher applies the same rules to live key presses; this pure form is for tests.
 */
export function mapDecisionKey(
  event: DecisionKeyEvent,
  bindings: ResolvedBindings = DEFAULT_BINDINGS,
): DecisionKeyAction | null {
  if (event.inEditable) return null
  const combo = eventToCombo(event)
  if (!combo) return null
  for (const [id, action] of Object.entries(REVIEW_KEY_ACTIONS)) {
    if (event.repeat && getShortcutAction(id)?.noRepeat) continue
    if ((bindings.get(id) ?? []).some((key) => comboMatches(combo, key))) return action
  }
  return null
}

/**
 * Whether a modal dialog is open anywhere (the core `Dialog` marks its overlay). The decision keys
 * listen on the window, so without this a key pressed on a dialog's button would decide the item
 * behind it.
 */
export function isModalOpen(doc: Document | null = typeof document === 'undefined' ? null : document): boolean {
  return !!doc?.querySelector('[data-native-preview-overlay="modal"]')
}

/** Whether a DOM target takes typing. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/** The item `step` places away from `currentId` (wrapping), or the first item when none is current. */
export function stepItem(
  itemIds: readonly string[],
  currentId: string | null,
  step: 1 | -1,
): string | null {
  if (itemIds.length === 0) return null
  const index = currentId ? itemIds.indexOf(currentId) : -1
  if (index < 0) return itemIds[0]
  return itemIds[(index + step + itemIds.length) % itemIds.length]
}

/**
 * Where to go after deciding `decidedId`: the next item (in list order, wrapping) the reviewer
 * still owes, or null when nothing is left.
 */
export function nextOwedItem(
  itemIds: readonly string[],
  owedIds: readonly string[],
  decidedId: string,
): string | null {
  const owed = new Set(owedIds)
  owed.delete(decidedId)
  if (owed.size === 0) return null
  const start = itemIds.indexOf(decidedId)
  for (let i = 1; i <= itemIds.length; i++) {
    const id = itemIds[(Math.max(start, 0) + i) % itemIds.length]
    if (owed.has(id)) return id
  }
  return null
}
