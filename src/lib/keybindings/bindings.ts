/**
 * The keys each shortcut action has right now: the registry's defaults, with the user's overrides
 * on top. Only overrides are stored (`shortcutOverrides` in the settings slice), so a new default
 * reaches everyone who never changed that action. An override is the action's whole key list; an
 * empty list means the user removed every key.
 */

import { canonicalCombo, comboMatches } from './combo'
import {
  SHORTCUT_ACTIONS,
  actionForLegacyId,
  getShortcutAction,
  type ShortcutAction,
  type ShortcutScope,
} from './registry'

/** Action id -> its keys, for the actions the user changed. */
export type ShortcutOverrides = Record<string, string[]>

/** Action id -> the keys it has now, for every action. */
export type ResolvedBindings = ReadonlyMap<string, readonly string[]>

export function resolveBindings(overrides: ShortcutOverrides): ResolvedBindings {
  const resolved = new Map<string, readonly string[]>()
  for (const action of SHORTCUT_ACTIONS) {
    resolved.set(action.id, overrides[action.id] ?? action.defaults)
  }
  return resolved
}

let lastOverrides: ShortcutOverrides | null = null
let lastResolved: ResolvedBindings | null = null

/** `resolveBindings`, cached on the overrides object (the store replaces it on every change). */
export function resolveBindingsCached(overrides: ShortcutOverrides): ResolvedBindings {
  if (overrides !== lastOverrides || !lastResolved) {
    lastOverrides = overrides
    lastResolved = resolveBindings(overrides)
  }
  return lastResolved
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/** Whether an action's keys differ from its defaults. */
export function isModified(actionId: string, overrides: ShortcutOverrides): boolean {
  const action = getShortcutAction(actionId)
  const override = overrides[actionId]
  return !!action && !!override && !sameList(override, action.defaults)
}

/**
 * The overrides after setting an action's keys. Keys are canonicalised and de-duplicated; keys
 * equal to the defaults drop the override, so "modified" means what it says.
 */
export function withBindings(
  overrides: ShortcutOverrides,
  actionId: string,
  combos: readonly string[],
): ShortcutOverrides {
  const action = getShortcutAction(actionId)
  if (!action) return overrides
  const clean = [...new Set(combos.map(canonicalCombo).filter((c): c is string => !!c))]
  const next = { ...overrides }
  if (sameList(clean, action.defaults)) delete next[actionId]
  else next[actionId] = clean
  return next
}

export function withoutOverride(overrides: ShortcutOverrides, actionId: string): ShortcutOverrides {
  if (!(actionId in overrides)) return overrides
  const next = { ...overrides }
  delete next[actionId]
  return next
}

/**
 * Whether two scopes can see the same key press. A scope only competes with itself and with
 * `global`, which is active everywhere. Two different specific scopes (the file pane and the file
 * tree) may share keys: focus decides between them.
 */
export function scopesOverlap(a: ShortcutScope, b: ShortcutScope): boolean {
  return a === b || a === 'global' || b === 'global'
}

export interface ShortcutConflict {
  actionId: string
  combo: string
}

/** The other actions that already use `combo` where `actionId` works. */
export function findConflicts(
  actionId: string,
  combo: string,
  bindings: ResolvedBindings,
  available: readonly ShortcutAction[] = SHORTCUT_ACTIONS,
): ShortcutConflict[] {
  const action = getShortcutAction(actionId)
  if (!action) return []
  const conflicts: ShortcutConflict[] = []
  for (const other of available) {
    if (other.id === actionId || !scopesOverlap(action.scope, other.scope)) continue
    for (const otherCombo of bindings.get(other.id) ?? []) {
      // An extra-Shift action also claims the Shift variant of its keys.
      if (
        otherCombo === combo ||
        comboMatches(combo, otherCombo, other.allowExtraShift) ||
        comboMatches(otherCombo, combo, action.allowExtraShift)
      ) {
        conflicts.push({ actionId: other.id, combo: otherCombo })
      }
    }
  }
  return conflicts
}

/** Every action that currently shares a key with another, keyed by action id. */
export function allConflicts(
  bindings: ResolvedBindings,
  available: readonly ShortcutAction[] = SHORTCUT_ACTIONS,
): Map<string, ShortcutConflict[]> {
  const result = new Map<string, ShortcutConflict[]>()
  for (const action of available) {
    const found = (bindings.get(action.id) ?? []).flatMap((combo) =>
      findConflicts(action.id, combo, bindings, available),
    )
    if (found.length > 0) result.set(action.id, found)
  }
  return result
}

/** The actions bound to a pressed combo, for search by keys. */
export function actionsBoundTo(
  combo: string,
  bindings: ResolvedBindings,
  available: readonly ShortcutAction[] = SHORTCUT_ACTIONS,
): ShortcutAction[] {
  return available.filter((action) =>
    (bindings.get(action.id) ?? []).some((bound) => comboMatches(combo, bound, action.allowExtraShift)),
  )
}

// ── Migration from the pre-registry `keybindings` setting ────────────────

/** One entry of the old persisted `keybindings` record. */
interface LegacyKeybinding {
  key?: unknown
  ctrlKey?: unknown
  metaKey?: unknown
  altKey?: unknown
  shiftKey?: unknown
}

function legacyToCombo(binding: LegacyKeybinding): string | null {
  if (typeof binding.key !== 'string' || !binding.key) return null
  const parts: string[] = []
  if (binding.ctrlKey || binding.metaKey) parts.push('Mod')
  if (binding.altKey) parts.push('Alt')
  if (binding.shiftKey) parts.push('Shift')
  parts.push(binding.key === '+' ? 'Plus' : binding.key)
  return canonicalCombo(parts.join('+'))
}

/**
 * Turns the old `keybindings` record (one key per file-pane action, every action stored) into
 * overrides: only actions whose key differs from today's default are kept, so nobody loses a
 * custom key and nobody is pinned to an old default.
 */
export function migrateLegacyKeybindings(legacy: unknown): ShortcutOverrides {
  const overrides: ShortcutOverrides = {}
  if (!legacy || typeof legacy !== 'object') return overrides
  for (const [legacyId, value] of Object.entries(legacy as Record<string, unknown>)) {
    const action = actionForLegacyId(legacyId)
    if (!action || !value || typeof value !== 'object') continue
    const combo = legacyToCombo(value as LegacyKeybinding)
    if (!combo || action.defaults[0] === combo) continue
    // The old setting held one key; keep the default alternates behind it.
    overrides[action.id] = [combo, ...action.defaults.slice(1).filter((c) => c !== combo)]
  }
  return overrides
}

/** Drops unknown actions and unreadable keys from persisted or imported overrides. */
export function sanitizeOverrides(raw: unknown): { overrides: ShortcutOverrides; skipped: number } {
  const overrides: ShortcutOverrides = {}
  let skipped = 0
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { overrides, skipped }
  for (const [actionId, value] of Object.entries(raw as Record<string, unknown>)) {
    const action = getShortcutAction(actionId)
    if (!action || !Array.isArray(value)) {
      skipped++
      continue
    }
    const combos: string[] = []
    for (const item of value) {
      const combo = typeof item === 'string' ? canonicalCombo(item) : null
      if (combo) {
        if (!combos.includes(combo)) combos.push(combo)
      } else skipped++
    }
    if (!sameList(combos, action.defaults)) overrides[actionId] = combos
  }
  return { overrides, skipped }
}

/**
 * The overrides to start with from persisted settings: the stored overrides when there are any,
 * else the migrated pre-registry `keybindings` record.
 */
export function restorePersistedShortcuts(
  persistedOverrides: unknown,
  legacyKeybindings: unknown,
): ShortcutOverrides {
  if (persistedOverrides && typeof persistedOverrides === 'object') {
    return sanitizeOverrides(persistedOverrides).overrides
  }
  return migrateLegacyKeybindings(legacyKeybindings)
}

// ── Import / export ──────────────────────────────────────────────────────

export const SHORTCUTS_FILE_FORMAT = 'blueplm-shortcuts'

export interface ShortcutsFile {
  format: typeof SHORTCUTS_FILE_FORMAT
  version: 1
  /** Only the changed actions; everything else keeps its default. */
  shortcuts: ShortcutOverrides
}

export function exportShortcuts(overrides: ShortcutOverrides): string {
  const file: ShortcutsFile = { format: SHORTCUTS_FILE_FORMAT, version: 1, shortcuts: overrides }
  return JSON.stringify(file, null, 2)
}

export type ShortcutsImport =
  | { ok: true; overrides: ShortcutOverrides; skipped: number }
  | { ok: false; error: 'invalidJson' | 'notShortcuts' }

/**
 * Reads an exported shortcuts file. A bare `{ actionId: [keys] }` object is accepted too.
 * Unknown actions and unreadable keys are skipped and counted, not fatal.
 */
export function parseShortcutsImport(text: string): ShortcutsImport {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'invalidJson' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'notShortcuts' }
  }
  const record = data as Record<string, unknown>
  const body = record.format === SHORTCUTS_FILE_FORMAT ? record.shortcuts : record
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'notShortcuts' }
  }
  const { overrides, skipped } = sanitizeOverrides(body)
  if (Object.keys(overrides).length === 0 && skipped > 0 && record.format !== SHORTCUTS_FILE_FORMAT) {
    return { ok: false, error: 'notShortcuts' }
  }
  return { ok: true, overrides, skipped }
}
