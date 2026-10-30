/**
 * Every keyboard shortcut BluePLM has, in one list. An action names where it works (its scope),
 * the keys it has by default, and how it behaves around text fields and held keys. Components
 * attach the code that runs through `useShortcuts` (`./useShortcuts.ts`), and the one dispatcher
 * (`./dispatcher.ts`) decides which action a key press triggers. The user's own keys are stored as
 * overrides of these defaults (`./bindings.ts`).
 *
 * Labels and descriptions are i18n keys: `shortcuts.action.<id>` and `shortcuts.help.<id>`.
 * Plain text editing keys inside fields, the terminal's own keys and hold-to-pan in the workflow
 * editor are not shortcuts and stay where they are.
 */

export const SHORTCUT_SCOPES = [
  'settings',
  'reviews',
  'pdfViewer',
  'workflowCanvas',
  'fileTree',
  'filePane',
  'global',
] as const

/**
 * Where an action works. The order above is precedence: when two active scopes both bind the
 * pressed keys, the earlier (more specific) scope wins and `global` comes last.
 */
export type ShortcutScope = (typeof SHORTCUT_SCOPES)[number]

export const SHORTCUT_CATEGORIES = [
  'general',
  'navigation',
  'files',
  'export',
  'fileTree',
  'reviews',
  'pdfViewer',
  'workflowCanvas',
] as const

export type ShortcutCategory = (typeof SHORTCUT_CATEGORIES)[number]

export interface ShortcutAction {
  id: string
  category: ShortcutCategory
  scope: ShortcutScope
  /** The default keys: the first is the primary, the rest are alternates. */
  defaults: readonly string[]
  /** Only in the desktop app: hidden in settings and never fired on BluePLM Web. */
  desktopOnly?: boolean
  /** Fires while focus is in a text field. Off by default: nothing fires while typing. */
  allowInInputs?: boolean
  /** Shift may be held on top of the binding (Shift+Arrow extends the selection). */
  allowExtraShift?: boolean
  /** A held-down key (auto-repeat) does not fire it again. */
  noRepeat?: boolean
  /** The id this action had in the persisted `keybindings` before the registry (pre 4.11). */
  legacyId?: string
}

const actions = [
  // ── General: work anywhere in the app ──────────────────────────────────
  { id: 'global.openSettings', category: 'general', scope: 'global', defaults: ['Mod+,'], allowInInputs: true },
  { id: 'global.focusSearch', category: 'general', scope: 'global', defaults: ['Mod+K'], allowInInputs: true },
  { id: 'global.toggleSidebar', category: 'general', scope: 'global', defaults: ['Mod+B'], allowInInputs: true },
  { id: 'global.toggleDetailsPanel', category: 'general', scope: 'global', defaults: ['Mod+D'], allowInInputs: true },
  { id: 'global.openTerminal', category: 'general', scope: 'global', defaults: ['Mod+`'], allowInInputs: true },
  { id: 'global.refresh', category: 'general', scope: 'global', defaults: ['F5'], allowInInputs: true },
  { id: 'global.openVault', category: 'general', scope: 'global', defaults: ['Mod+Shift+O'], allowInInputs: true },
  { id: 'settings.focusSearch', category: 'general', scope: 'settings', defaults: ['Mod+F'], allowInInputs: true },

  // ── Navigation in the file pane ────────────────────────────────────────
  { id: 'filePane.navigateUp', category: 'navigation', scope: 'filePane', defaults: ['ArrowUp'], allowExtraShift: true, legacyId: 'navigateUp' },
  { id: 'filePane.navigateDown', category: 'navigation', scope: 'filePane', defaults: ['ArrowDown'], allowExtraShift: true, legacyId: 'navigateDown' },
  { id: 'filePane.expandFolder', category: 'navigation', scope: 'filePane', defaults: ['ArrowRight'], legacyId: 'expandFolder' },
  { id: 'filePane.collapseFolder', category: 'navigation', scope: 'filePane', defaults: ['ArrowLeft'], legacyId: 'collapseFolder' },
  { id: 'filePane.openFile', category: 'navigation', scope: 'filePane', defaults: ['Enter'], legacyId: 'openFile' },

  // ── Acting on files in the file pane ───────────────────────────────────
  { id: 'filePane.selectAll', category: 'files', scope: 'filePane', defaults: ['Mod+A'], legacyId: 'selectAll' },
  { id: 'filePane.copy', category: 'files', scope: 'filePane', defaults: ['Mod+C'], desktopOnly: true, legacyId: 'copy' },
  { id: 'filePane.cut', category: 'files', scope: 'filePane', defaults: ['Mod+X'], desktopOnly: true, legacyId: 'cut' },
  { id: 'filePane.paste', category: 'files', scope: 'filePane', defaults: ['Mod+V'], desktopOnly: true, legacyId: 'paste' },
  { id: 'filePane.undo', category: 'files', scope: 'filePane', defaults: ['Mod+Z'] },
  { id: 'filePane.rename', category: 'files', scope: 'filePane', defaults: ['F2'] },
  { id: 'filePane.delete', category: 'files', scope: 'filePane', defaults: ['Delete'], desktopOnly: true, legacyId: 'delete' },
  { id: 'filePane.clearSelection', category: 'files', scope: 'filePane', defaults: ['Escape'], legacyId: 'escape' },
  { id: 'filePane.toggleDetailsPanel', category: 'files', scope: 'filePane', defaults: ['Mod+P'], legacyId: 'toggleDetailsPanel' },
  { id: 'filePane.refresh', category: 'files', scope: 'filePane', defaults: ['Mod+R'], legacyId: 'refresh' },

  // ── Export (needs SOLIDWORKS) ──────────────────────────────────────────
  { id: 'filePane.exportPdf', category: 'export', scope: 'filePane', defaults: ['Mod+Shift+P'], desktopOnly: true, legacyId: 'exportPdf' },
  { id: 'filePane.exportStep', category: 'export', scope: 'filePane', defaults: ['Mod+Shift+S'], desktopOnly: true, legacyId: 'exportStep' },

  // ── File tree (while focus is in the tree) ─────────────────────────────
  { id: 'fileTree.navigateUp', category: 'fileTree', scope: 'fileTree', defaults: ['ArrowUp'], allowExtraShift: true },
  { id: 'fileTree.navigateDown', category: 'fileTree', scope: 'fileTree', defaults: ['ArrowDown'], allowExtraShift: true },
  { id: 'fileTree.expandFolder', category: 'fileTree', scope: 'fileTree', defaults: ['ArrowRight'] },
  { id: 'fileTree.collapseFolder', category: 'fileTree', scope: 'fileTree', defaults: ['ArrowLeft'] },
  { id: 'fileTree.open', category: 'fileTree', scope: 'fileTree', defaults: ['Enter'] },
  { id: 'fileTree.rename', category: 'fileTree', scope: 'fileTree', defaults: ['F2'] },
  { id: 'fileTree.delete', category: 'fileTree', scope: 'fileTree', defaults: ['Delete'], desktopOnly: true },

  // ── Reviews (an open review) ───────────────────────────────────────────
  { id: 'reviews.approve', category: 'reviews', scope: 'reviews', defaults: ['A'], noRepeat: true },
  { id: 'reviews.approveWithComments', category: 'reviews', scope: 'reviews', defaults: ['Shift+A'], noRepeat: true },
  { id: 'reviews.requestChanges', category: 'reviews', scope: 'reviews', defaults: ['C'], noRepeat: true },
  { id: 'reviews.reject', category: 'reviews', scope: 'reviews', defaults: ['R'], noRepeat: true },
  { id: 'reviews.nextItem', category: 'reviews', scope: 'reviews', defaults: ['J'] },
  { id: 'reviews.previousItem', category: 'reviews', scope: 'reviews', defaults: ['K'] },

  // ── PDF viewer ─────────────────────────────────────────────────────────
  { id: 'pdfViewer.zoomIn', category: 'pdfViewer', scope: 'pdfViewer', defaults: ['Mod+=', 'Mod+Plus', 'Mod+Shift+Plus'] },
  { id: 'pdfViewer.zoomOut', category: 'pdfViewer', scope: 'pdfViewer', defaults: ['Mod+-'] },
  { id: 'pdfViewer.fitPage', category: 'pdfViewer', scope: 'pdfViewer', defaults: ['Mod+0'] },

  // ── Workflow editor canvas ─────────────────────────────────────────────
  { id: 'workflowCanvas.copy', category: 'workflowCanvas', scope: 'workflowCanvas', defaults: ['Mod+C'] },
  { id: 'workflowCanvas.cut', category: 'workflowCanvas', scope: 'workflowCanvas', defaults: ['Mod+X'] },
  { id: 'workflowCanvas.paste', category: 'workflowCanvas', scope: 'workflowCanvas', defaults: ['Mod+V'] },
  { id: 'workflowCanvas.undo', category: 'workflowCanvas', scope: 'workflowCanvas', defaults: ['Mod+Z'] },
  { id: 'workflowCanvas.redo', category: 'workflowCanvas', scope: 'workflowCanvas', defaults: ['Mod+Shift+Z', 'Mod+Y'] },
  { id: 'workflowCanvas.delete', category: 'workflowCanvas', scope: 'workflowCanvas', defaults: ['Delete', 'Backspace'] },
  { id: 'workflowCanvas.cancel', category: 'workflowCanvas', scope: 'workflowCanvas', defaults: ['Escape'] },
] as const satisfies readonly ShortcutAction[]

export type ShortcutActionId = (typeof actions)[number]['id']

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = actions

const BY_ID = new Map<string, ShortcutAction>(SHORTCUT_ACTIONS.map((action) => [action.id, action]))

export function getShortcutAction(id: string): ShortcutAction | undefined {
  return BY_ID.get(id)
}

export function isShortcutActionId(id: string): id is ShortcutActionId {
  return BY_ID.has(id)
}

/** The actions this build offers: desktop-only ones are left out on BluePLM Web. */
export function availableShortcutActions(isDesktop: boolean): readonly ShortcutAction[] {
  return isDesktop ? SHORTCUT_ACTIONS : SHORTCUT_ACTIONS.filter((action) => !action.desktopOnly)
}

/** The registry action an old persisted `keybindings` id became. */
export function actionForLegacyId(legacyId: string): ShortcutAction | undefined {
  return SHORTCUT_ACTIONS.find((action) => action.legacyId === legacyId)
}

/** Scope precedence: lower wins. */
export function scopeRank(scope: ShortcutScope): number {
  return SHORTCUT_SCOPES.indexOf(scope)
}
