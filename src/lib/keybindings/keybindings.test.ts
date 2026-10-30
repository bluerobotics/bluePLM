// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { shortcutsStrings } from '@/lib/i18n/locales/shortcuts'
import { mapDecisionKey } from '@/features/source/reviews/lib/decisionKeys'

import {
  canonicalCombo,
  comboKeycaps,
  comboMatches,
  eventToCombo,
  formatCombo,
  parseCombo,
} from './combo'
import {
  SHORTCUT_ACTIONS,
  availableShortcutActions,
  getShortcutAction,
} from './registry'
import {
  actionsBoundTo,
  allConflicts,
  exportShortcuts,
  findConflicts,
  isModified,
  migrateLegacyKeybindings,
  parseShortcutsImport,
  resolveBindings,
  restorePersistedShortcuts,
  sanitizeOverrides,
  withBindings,
} from './bindings'
import {
  configureShortcutDispatcher,
  dispatchShortcut,
  registerShortcuts,
  resetShortcutRegistrations,
  wasHandledByShortcut,
} from './dispatcher'

function key(
  k: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; code: string }> = {},
) {
  return { key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }
}

describe('combos', () => {
  it('reads key presses into canonical combos', () => {
    expect(eventToCombo(key('c', { ctrlKey: true }))).toBe('Mod+C')
    expect(eventToCombo(key('c', { metaKey: true }))).toBe('Mod+C')
    expect(eventToCombo(key('P', { ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+P')
    expect(eventToCombo(key('F2'))).toBe('F2')
    expect(eventToCombo(key('ArrowUp', { shiftKey: true }))).toBe('Shift+ArrowUp')
    expect(eventToCombo(key(' '))).toBe('Space')
    expect(eventToCombo(key('+', { ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+Plus')
    // macOS types a symbol with Option held; the physical key wins.
    expect(eventToCombo(key('π', { altKey: true, code: 'KeyP' }))).toBe('Alt+P')
  })

  it('ignores a lone modifier', () => {
    expect(eventToCombo(key('Control', { ctrlKey: true }))).toBeNull()
    expect(eventToCombo(key('Shift', { shiftKey: true }))).toBeNull()
  })

  it('parses hand-written and legacy spellings', () => {
    expect(canonicalCombo('ctrl+shift+p')).toBe('Mod+Shift+P')
    expect(canonicalCombo('Cmd+K')).toBe('Mod+K')
    expect(canonicalCombo('shift+mod+a')).toBe('Mod+Shift+A')
    expect(canonicalCombo('Ctrl++')).toBe('Mod+Plus')
    expect(canonicalCombo('Esc')).toBe('Escape')
    expect(canonicalCombo('f5')).toBe('F5')
    expect(parseCombo('Ctrl+Ctrl+A')).toBeNull()
    expect(parseCombo('Ctrl+')).toBeNull()
    expect(parseCombo('')).toBeNull()
  })

  it('lets Shift ride on top only when the action allows it', () => {
    expect(comboMatches('Shift+ArrowUp', 'ArrowUp', true)).toBe(true)
    expect(comboMatches('Shift+ArrowUp', 'ArrowUp', false)).toBe(false)
    expect(comboMatches('ArrowUp', 'Shift+ArrowUp', true)).toBe(false)
  })

  it('shows Ctrl/Alt/Shift on Windows and symbols on macOS', () => {
    expect(comboKeycaps('Mod+Shift+P', 'other')).toEqual(['Ctrl', 'Shift', 'P'])
    expect(comboKeycaps('Mod+Shift+P', 'mac')).toEqual(['⇧', '⌘', 'P'])
    expect(comboKeycaps('Mod+Alt+Delete', 'mac')).toEqual(['⌥', '⌘', '⌦'])
    expect(formatCombo('Mod+K', 'other')).toBe('Ctrl+K')
    expect(formatCombo('Mod+K', 'mac')).toBe('⌘K')
    expect(formatCombo('ArrowUp', 'other')).toBe('↑')
    expect(formatCombo('Mod+Plus', 'other')).toBe('Ctrl++')
  })
})

describe('registry', () => {
  it('has unique ids, canonical defaults and labels for every action', () => {
    const ids = SHORTCUT_ACTIONS.map((action) => action.id)
    expect(new Set(ids).size).toBe(ids.length)
    const labels: Record<string, string> = shortcutsStrings.action
    const help: Record<string, string> = shortcutsStrings.help
    for (const action of SHORTCUT_ACTIONS) {
      expect(action.id.startsWith(`${action.scope}.`) || action.scope === 'global').toBe(true)
      for (const combo of action.defaults) expect(canonicalCombo(combo)).toBe(combo)
      expect(labels[action.id], action.id).toBeTruthy()
      expect(help[action.id], action.id).toBeTruthy()
    }
    const legacy = SHORTCUT_ACTIONS.flatMap((action) => (action.legacyId ? [action.legacyId] : []))
    expect(new Set(legacy).size).toBe(legacy.length)
  })

  it('ships with no conflicting defaults', () => {
    expect([...allConflicts(resolveBindings({})).keys()]).toEqual([])
  })

  it('keeps the quick export actions in the file pane, desktop only', () => {
    for (const id of ['filePane.exportPdf', 'filePane.exportStep']) {
      expect(getShortcutAction(id)).toMatchObject({ category: 'export', scope: 'filePane', desktopOnly: true })
    }
    expect(availableShortcutActions(false).some((action) => action.id === 'filePane.exportPdf')).toBe(false)
    expect(availableShortcutActions(true).some((action) => action.id === 'filePane.exportPdf')).toBe(true)
  })
})

describe('bindings and conflicts', () => {
  it('stores only what differs from the defaults', () => {
    let overrides = withBindings({}, 'filePane.copy', ['ctrl+shift+c'])
    expect(overrides).toEqual({ 'filePane.copy': ['Mod+Shift+C'] })
    expect(isModified('filePane.copy', overrides)).toBe(true)
    expect(resolveBindings(overrides).get('filePane.copy')).toEqual(['Mod+Shift+C'])
    overrides = withBindings(overrides, 'filePane.copy', ['Mod+C'])
    expect(overrides).toEqual({})
    // No keys at all is a real override.
    expect(withBindings({}, 'global.refresh', [])).toEqual({ 'global.refresh': [] })
  })

  it('finds conflicts inside a scope and against global actions only', () => {
    const bindings = resolveBindings({})
    // Same scope
    expect(findConflicts('filePane.refresh', 'Mod+C', bindings).map((c) => c.actionId)).toEqual([
      'filePane.copy',
    ])
    // A global action sees every scope
    expect(findConflicts('global.refresh', 'Mod+C', bindings).map((c) => c.actionId)).toContain(
      'workflowCanvas.copy',
    )
    // File pane and file tree may share keys: focus decides
    expect(findConflicts('fileTree.rename', 'Mod+C', bindings)).toEqual([])
    // An extra-Shift action claims the Shift variant of its keys
    expect(findConflicts('filePane.refresh', 'Shift+ArrowUp', bindings).map((c) => c.actionId)).toEqual([
      'filePane.navigateUp',
    ])
  })

  it('looks up what a combo is bound to', () => {
    const ids = actionsBoundTo('Mod+C', resolveBindings({})).map((action) => action.id)
    expect(ids).toEqual(['filePane.copy', 'workflowCanvas.copy'])
  })
})

describe('migration of the old keybindings setting', () => {
  const legacyDefaults = {
    navigateUp: { key: 'ArrowUp' },
    selectAll: { key: 'a', ctrlKey: true },
    copy: { key: 'c', ctrlKey: true },
    delete: { key: 'Delete' },
    escape: { key: 'Escape' },
    toggleDetailsPanel: { key: 'p', ctrlKey: true },
    exportPdf: { key: 'p', ctrlKey: true, shiftKey: true },
  }

  it('keeps nothing when every key is still the default', () => {
    expect(migrateLegacyKeybindings(legacyDefaults)).toEqual({})
  })

  it('keeps custom keys under the new action ids', () => {
    const migrated = migrateLegacyKeybindings({
      ...legacyDefaults,
      copy: { key: 'c', metaKey: true, altKey: true },
      escape: { key: 'q' },
      exportPdf: { key: 'e', ctrlKey: true, shiftKey: true },
      someRemovedAction: { key: 'x' },
    })
    expect(migrated).toEqual({
      'filePane.copy': ['Mod+Alt+C'],
      'filePane.clearSelection': ['Q'],
      'filePane.exportPdf': ['Mod+Shift+E'],
    })
  })

  it('prefers stored overrides and ignores junk', () => {
    expect(restorePersistedShortcuts({ 'global.refresh': ['F6'] }, { copy: { key: 'q' } })).toEqual({
      'global.refresh': ['F6'],
    })
    expect(restorePersistedShortcuts(undefined, { copy: { key: 'q' } })).toEqual({ 'filePane.copy': ['Q'] })
    expect(restorePersistedShortcuts(undefined, undefined)).toEqual({})
    expect(migrateLegacyKeybindings('nonsense')).toEqual({})
    expect(sanitizeOverrides({ nope: ['F1'], 'global.refresh': ['F6', 'Ctrl+'] })).toEqual({
      overrides: { 'global.refresh': ['F6'] },
      skipped: 2,
    })
  })
})

describe('import and export', () => {
  it('round-trips the overrides', () => {
    const overrides = { 'filePane.copy': ['Mod+Shift+C'], 'global.refresh': [] }
    expect(parseShortcutsImport(exportShortcuts(overrides))).toEqual({ ok: true, overrides, skipped: 0 })
  })

  it('accepts a bare object and reports what it skipped', () => {
    expect(parseShortcutsImport('{"global.refresh": ["f6"], "gone.action": ["F1"]}')).toEqual({
      ok: true,
      overrides: { 'global.refresh': ['F6'] },
      skipped: 1,
    })
  })

  it('refuses files that are not shortcuts', () => {
    expect(parseShortcutsImport('{nope')).toEqual({ ok: false, error: 'invalidJson' })
    expect(parseShortcutsImport('[1,2]')).toEqual({ ok: false, error: 'notShortcuts' })
    expect(parseShortcutsImport('{"theme": ["dark"]}')).toEqual({ ok: false, error: 'notShortcuts' })
  })
})

describe('dispatcher', () => {
  afterEach(() => {
    resetShortcutRegistrations()
    configureShortcutDispatcher({
      getBindings: () => resolveBindings({}),
      isDesktop: () => true,
      isModalOpen: () => false,
    })
  })

  function press(
    k: string,
    init: KeyboardEventInit = {},
    target?: EventTarget,
  ): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: k, cancelable: true, ...init })
    if (target) Object.defineProperty(event, 'target', { value: target })
    return event
  }

  it('runs the matching handler and prevents the default', () => {
    const refresh = vi.fn()
    registerShortcuts({ scope: 'global', getHandlers: () => ({ 'global.refresh': refresh }) })
    const event = press('F5')
    expect(dispatchShortcut(event)).toBe('global.refresh')
    expect(refresh).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
    expect(wasHandledByShortcut(event)).toBe(true)
    expect(dispatchShortcut(press('F6'))).toBeNull()
  })

  it('uses the user overrides', () => {
    const refresh = vi.fn()
    configureShortcutDispatcher({ getBindings: () => resolveBindings({ 'global.refresh': ['F6'] }) })
    registerShortcuts({ scope: 'global', getHandlers: () => ({ 'global.refresh': refresh }) })
    expect(dispatchShortcut(press('F5'))).toBeNull()
    expect(dispatchShortcut(press('F6'))).toBe('global.refresh')
  })

  it('tries specific scopes before global ones, and the file tree before the file pane', () => {
    const calls: string[] = []
    configureShortcutDispatcher({
      getBindings: () => resolveBindings({ 'global.refresh': ['Delete'] }),
    })
    registerShortcuts({ scope: 'global', getHandlers: () => ({ 'global.refresh': () => void calls.push('global') }) })
    registerShortcuts({ scope: 'fileTree', getHandlers: () => ({ 'fileTree.delete': () => void calls.push('tree') }) })
    registerShortcuts({ scope: 'filePane', getHandlers: () => ({ 'filePane.delete': () => void calls.push('pane') }) })
    dispatchShortcut(press('Delete'))
    expect(calls).toEqual(['tree'])
  })

  it('moves on when a handler declines or a registration is inactive', () => {
    const pane = vi.fn()
    registerShortcuts({ scope: 'filePane', getHandlers: () => ({ 'filePane.delete': pane }) })
    registerShortcuts({
      scope: 'fileTree',
      getHandlers: () => ({ 'fileTree.delete': () => false }),
    })
    expect(dispatchShortcut(press('Delete'))).toBe('filePane.delete')
    resetShortcutRegistrations()
    registerShortcuts({ scope: 'filePane', getHandlers: () => ({ 'filePane.delete': pane }), isActive: () => false })
    const event = press('Delete')
    expect(dispatchShortcut(event)).toBeNull()
    expect(event.defaultPrevented).toBe(false)
  })

  it('stays out of text fields unless the action allows it', () => {
    const input = document.createElement('input')
    const copy = vi.fn()
    const refresh = vi.fn()
    registerShortcuts({ scope: 'filePane', getHandlers: () => ({ 'filePane.copy': copy }) })
    registerShortcuts({ scope: 'global', getHandlers: () => ({ 'global.refresh': refresh }) })
    expect(dispatchShortcut(press('c', { ctrlKey: true }, input))).toBeNull()
    expect(dispatchShortcut(press('F5', {}, input))).toBe('global.refresh')
    expect(copy).not.toHaveBeenCalled()
  })

  it('skips held keys for no-repeat actions, desktop-only actions on the web, and blocked scopes under a modal', () => {
    const approve = vi.fn()
    const next = vi.fn()
    registerShortcuts({
      scope: 'reviews',
      getHandlers: () => ({ 'reviews.approve': approve, 'reviews.nextItem': next }),
      blockedByModal: true,
    })
    expect(dispatchShortcut(press('a', { repeat: true }))).toBeNull()
    expect(dispatchShortcut(press('j', { repeat: true }))).toBe('reviews.nextItem')

    configureShortcutDispatcher({ isModalOpen: () => true })
    expect(dispatchShortcut(press('a'))).toBeNull()
    configureShortcutDispatcher({ isModalOpen: () => false })
    expect(dispatchShortcut(press('a'))).toBe('reviews.approve')

    const exportPdf = vi.fn()
    registerShortcuts({ scope: 'filePane', getHandlers: () => ({ 'filePane.exportPdf': exportPdf }) })
    configureShortcutDispatcher({ isDesktop: () => false })
    expect(dispatchShortcut(press('P', { ctrlKey: true, shiftKey: true }))).toBeNull()
    expect(exportPdf).not.toHaveBeenCalled()
  })

  it('leaves a press another handler already took', () => {
    const refresh = vi.fn()
    registerShortcuts({ scope: 'global', getHandlers: () => ({ 'global.refresh': refresh }) })
    const event = press('F5')
    event.preventDefault()
    expect(dispatchShortcut(event)).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('review decision keys follow the registry', () => {
  const event = (k: string, shiftKey = false) => ({
    key: k,
    shiftKey,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    inEditable: false,
  })

  it('uses rebound keys', () => {
    const bindings = resolveBindings({ 'reviews.approve': ['Y'] })
    expect(mapDecisionKey(event('y'), bindings)).toEqual({ kind: 'decide', decision: 'approved' })
    expect(mapDecisionKey(event('a'), bindings)).toBeNull()
    expect(mapDecisionKey(event('A', true), bindings)).toEqual({
      kind: 'decide',
      decision: 'approved_with_comments',
    })
  })
})
