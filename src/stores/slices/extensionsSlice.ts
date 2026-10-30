/**
 * Extensions Slice - org-installed native extensions: their runtime state, the workspaces they
 * register and the organization install rows. (5.0 removed the per-machine Extension Store.)
 */
import { StateCreator } from 'zustand'
import type { PDMStoreState, ExtensionsSlice } from '../types'
import { validateWorkspaceRegistration } from '@/lib/nativeExtensions/registry'

export const createExtensionsSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  ExtensionsSlice
> = (set, get) => ({
  // ═══════════════════════════════════════════════════════════════════════════
  // Native extensions
  // ═══════════════════════════════════════════════════════════════════════════

  nativeExtensions: {},
  extensionWorkspaces: [],
  extensionRightPanel: null,
  orgNativeExtensionRows: [],

  setOrgNativeExtensionRows: (rows) => {
    set({ orgNativeExtensionRows: rows })
  },

  setNativeExtensionState: (state) => {
    set((current) => ({
      nativeExtensions: { ...current.nativeExtensions, [state.extensionId]: state },
    }))
  },

  removeNativeExtensionState: (extensionId) => {
    set((current) => {
      if (!(extensionId in current.nativeExtensions)) return current
      const { [extensionId]: _removed, ...rest } = current.nativeExtensions
      return { nativeExtensions: rest }
    })
  },

  registerExtensionWorkspace: (extensionId, registration) => {
    const workspace = validateWorkspaceRegistration(
      extensionId,
      registration,
      get().extensionWorkspaces,
    )
    set((current) => ({ extensionWorkspaces: [...current.extensionWorkspaces, workspace] }))
    return workspace
  },

  unregisterExtensionWorkspace: (extensionId, workspaceId) => {
    set((current) => {
      const removed = current.extensionWorkspaces.filter(
        (w) => w.extensionId === extensionId && (workspaceId === undefined || w.id === workspaceId),
      )
      if (removed.length === 0) return current
      const removedIds = new Set(removed.map((w) => w.id))
      const patch: Partial<PDMStoreState> = {
        extensionWorkspaces: current.extensionWorkspaces.filter((w) => !removed.includes(w)),
      }
      if (current.extensionRightPanel && removedIds.has(current.extensionRightPanel)) {
        patch.extensionRightPanel = null
      }
      // A view that no longer exists falls back to the explorer.
      if (removedIds.has(current.activeView as string)) {
        patch.activeView = 'explorer'
      }
      return patch
    })
  },

  setExtensionRightPanel: (workspaceId) => {
    if (get().extensionRightPanel === workspaceId) return
    set({ extensionRightPanel: workspaceId })
  },
})
