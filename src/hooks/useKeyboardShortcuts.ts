import { usePDMStore } from '@/stores/pdmStore'
import { useShortcuts } from '@/lib/keybindings'

interface KeyboardShortcutsOptions {
  onOpenVault: () => void
  onRefresh: () => void
}

/**
 * The app-wide shortcuts (registry scope `global`): open vault, toggle the sidebar and the details
 * panel, switch to the terminal, focus search, refresh and open settings. Their keys come from the
 * shortcut registry (`src/lib/keybindings/registry.ts`) and the user's overrides.
 */
export function useKeyboardShortcuts({ onOpenVault, onRefresh }: KeyboardShortcutsOptions) {
  useShortcuts('global', {
    'global.openVault': () => onOpenVault(),
    'global.toggleSidebar': () => usePDMStore.getState().toggleSidebar(),
    'global.toggleDetailsPanel': () => usePDMStore.getState().toggleDetailsPanel(),
    'global.openTerminal': () => usePDMStore.getState().setActiveView('terminal'),
    // The search component listens for this event.
    'global.focusSearch': () => {
      window.dispatchEvent(new CustomEvent('focus-search'))
    },
    'global.refresh': () => onRefresh(),
    'global.openSettings': () => {
      const state = usePDMStore.getState()
      if (state.settingsOpen) state.closeSettings()
      else state.openSettings()
    },
  })
}
