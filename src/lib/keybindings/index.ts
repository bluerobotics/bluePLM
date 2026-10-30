// Keyboard shortcuts: the registry of actions, the user's overrides, and the one dispatcher.
export * from './combo'
export * from './registry'
export * from './bindings'
export {
  dispatchShortcut,
  isEditableTarget,
  registerShortcuts,
  wasHandledByShortcut,
} from './dispatcher'
export type { ShortcutHandler, ShortcutHandlers, ShortcutRegistration } from './dispatcher'
export {
  getShortcutPlatform,
  useResolvedBindings,
  useShortcutLabel,
  useShortcuts,
} from './useShortcuts'
export type { UseShortcutsOptions } from './useShortcuts'
