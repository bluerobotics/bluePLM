import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

import { usePDMStore } from '@/stores/pdmStore'
import { useTranslation } from '@/lib/i18n'
import { logSettings } from '@/lib/userActionLogger'

import { SettingsContent } from './SettingsContent'
import { SettingsNavigation } from './SettingsNavigation'
import { hasLayerAboveSettings, SETTINGS_MODAL_LAYER_ATTR } from './settingsModalLayers'

const LAYER = { [SETTINGS_MODAL_LAYER_ATTR]: '' }

/**
 * Settings, as a modal over whatever the user was doing: navigation and search on the left, the
 * page on the right. Mounted once in the app shell and opened through `openSettings(tab)`. Styled
 * after Claude's settings (`.cursor/plans/settings-claude-aesthetic.md`): the `ui-*` tokens and the
 * system UI font.
 *
 * It sits at z-[45], under every dialog (z-50 and up), so confirmations and editors opened from
 * a settings page appear above it. Escape closes it unless such a layer is open. The shortcut that
 * opens and closes it (Ctrl+, by default) is the registry's `global.openSettings`.
 */
export function SettingsModal() {
  const { t } = useTranslation()
  const open = usePDMStore((s) => s.settingsOpen)
  const activeTab = usePDMStore((s) => s.settingsTab)
  const setSettingsTab = usePDMStore((s) => s.setSettingsTab)
  const closeSettings = usePDMStore((s) => s.closeSettings)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    logSettings('Opened settings')
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus({ preventScroll: true })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (hasLayerAboveSettings()) return
      e.preventDefault()
      usePDMStore.getState().closeSettings()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      returnFocus?.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return (
    <div
      {...LAYER}
      data-native-preview-overlay="modal"
      className="fixed inset-0 z-[45] flex items-center justify-center font-ui antialiased"
    >
      <div
        {...LAYER}
        aria-hidden
        className="absolute inset-0 bg-[var(--ui-scrim)] animate-fade-in"
        onMouseDown={closeSettings}
      />

      <div
        {...LAYER}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        className="relative flex h-[min(880px,calc(100vh-32px))] w-[min(1200px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-ui-border bg-ui-bg text-ui-fg shadow-[0_24px_64px_rgb(0_0_0/0.45)] outline-none animate-dialog-in"
      >
        <header className="flex h-[46px] flex-shrink-0 items-center justify-between border-b border-ui-border pl-[18px] pr-2">
          <h2 id="settings-modal-title" className="text-[16px] font-semibold text-ui-fg">
            {t('settings.title')}
          </h2>
          <button
            type="button"
            onClick={closeSettings}
            title={t('settings.close')}
            aria-label={t('settings.close')}
            className="rounded-lg p-1.5 text-ui-fg outline-none transition-colors hover:bg-ui-hover focus-visible:ring-2 focus-visible:ring-ui-accent/50"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-[256px] flex-shrink-0 border-r border-ui-border bg-ui-nav">
            <SettingsNavigation activeTab={activeTab} onTabChange={setSettingsTab} />
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <SettingsContent activeTab={activeTab} />
          </main>
        </div>
      </div>
    </div>
  )
}
