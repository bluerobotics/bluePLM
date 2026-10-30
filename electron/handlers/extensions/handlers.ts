/**
 * Extension IPC handlers (main process).
 *
 * Only org-installed native extensions remain (full trust, SHA-256 pinned): native.ts prepares and
 * serves them, and this module registers it. 5.0 removed the per-machine Extension Store (store
 * browsing, install into userData/extensions, sideload, uninstall): nothing ever ran those
 * packages once the sandbox runtime was gone. See .cursor/plans/extensions-native-runtime.plan.md.
 */

import type { BrowserWindow } from 'electron'

import { registerNativeExtensionHandlers, unregisterNativeExtensionHandlers } from './native'

export interface ExtensionHandlerDependencies {
  log: (message: string, data?: unknown) => void
  logError: (message: string, data?: unknown) => void
}

export function registerExtensionHandlers(
  window: BrowserWindow,
  dependencies: ExtensionHandlerDependencies,
): void {
  registerNativeExtensionHandlers(window, dependencies)
  dependencies.log('Extension handlers registered')
}

export function unregisterExtensionHandlers(): void {
  unregisterNativeExtensionHandlers()
}
