import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'

import { usePDMStore } from '@/stores/pdmStore'
import { useTranslation } from '@/lib/i18n'
import { logSettings } from '@/lib/userActionLogger'

import { SettingsContent } from './SettingsContent'
import { SettingsNavigation } from './SettingsNavigation'
import { hasLayerAboveSettings, SETTINGS_MODAL_LAYER_ATTR } from './settingsModalLayers'

const LAYER = { [SETTINGS_MODAL_LAYER_ATTR]: '' }

/** Ctrl+, (Cmd+, on macOS) opens and closes settings, as in most desktop apps. */
function isSettingsShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === ','
}

/**
 * Settings, as a modal over whatever the user was doing: navigation and search on the left,
 * the page on the right. Mounted once in the app shell and opened through `openSettings(tab)`.
 *
 * It sits at z-[45], under every dialog (z-50 and up), so confirmations and editors opened from
 * a settings page appear above it. Escape closes it unless such a layer is open.
 */
export function SettingsModal() {
  const { t } = useTranslation()
  const open = usePDMStore((s) => s.settingsOpen)
  const activeTab = usePDMStore((s) => s.settingsTab)
  const setSettingsTab = usePDMStore((s) => s.setSettingsTab)
  const closeSettings = usePDMStore((s) => s.closeSettings)
  const [maximized, setMaximized] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSettingsShortcut(e)) return
      e.preventDefault()
      const state = usePDMStore.getState()
      if (state.settingsOpen) state.closeSettings()
      else state.openSettings()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
      className="fixed inset-0 z-[45] flex items-center justify-center"
    >
      <div
        {...LAYER}
        aria-hidden
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fade-in"
        onMouseDown={closeSettings}
      />

      <div
        {...LAYER}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        className={`relative flex flex-col overflow-hidden border border-plm-border bg-plm-bg shadow-2xl shadow-black/40 outline-none animate-dialog-in ${
          maximized
            ? 'h-[calc(100vh-24px)] w-[calc(100vw-24px)] rounded-lg'
            : 'h-[min(860px,calc(100vh-48px))] w-[min(1200px,calc(100vw-48px))] rounded-xl'
        }`}
      >
        <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-plm-border pl-5 pr-2.5">
          <h2 id="settings-modal-title" className="text-[15px] font-semibold text-plm-fg">
            {t('settings.title')}
          </h2>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setMaximized((m) => !m)}
              title={maximized ? t('settings.restoreSize') : t('settings.maximize')}
              aria-label={maximized ? t('settings.restoreSize') : t('settings.maximize')}
              className="rounded-md p-2 text-plm-fg-muted outline-none transition-colors hover:bg-plm-highlight hover:text-plm-fg focus-visible:ring-2 focus-visible:ring-plm-accent/60"
            >
              {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              type="button"
              onClick={closeSettings}
              title={t('settings.close')}
              aria-label={t('settings.close')}
              className="rounded-md p-2 text-plm-fg-muted outline-none transition-colors hover:bg-plm-highlight hover:text-plm-fg focus-visible:ring-2 focus-visible:ring-plm-accent/60"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-[240px] flex-shrink-0 border-r border-plm-border bg-plm-sidebar">
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
