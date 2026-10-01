import { useEffect, useRef } from 'react'

export interface UseMouseNavButtonsOptions {
  navigateBack: () => void
  navigateForward: () => void
  canGoBack: boolean
  canGoForward: boolean
  /** When false, the listener is inert (e.g. the explorer is not the active view). */
  enabled?: boolean
}

// The mouse's extra side buttons: X1 (back) and X2 (forward). The browser/Electron report them
// as MouseEvent.button 3 and 4 respectively.
const MOUSE_BUTTON_BACK = 3
const MOUSE_BUTTON_FORWARD = 4

/**
 * Wire the mouse's back/forward (X1/X2) buttons to explorer folder history, mirroring the toolbar
 * arrows. The actions are read through a ref so the window listener is attached once and always
 * calls the latest `navigateBack` / `navigateForward` with the latest `canGoBack` / `canGoForward`
 * guards.
 *
 * `preventDefault` on both `mousedown` and `mouseup` stops Electron from also running its own
 * built-in history navigation for the same press, which would otherwise double-navigate.
 */
export function useMouseNavButtons({
  navigateBack,
  navigateForward,
  canGoBack,
  canGoForward,
  enabled = true,
}: UseMouseNavButtonsOptions): void {
  const latest = useRef({ navigateBack, navigateForward, canGoBack, canGoForward })
  latest.current = { navigateBack, navigateForward, canGoBack, canGoForward }

  useEffect(() => {
    if (!enabled) return

    const isNavButton = (button: number) =>
      button === MOUSE_BUTTON_BACK || button === MOUSE_BUTTON_FORWARD

    // Swallow the press itself so Electron's own back/forward does not also fire.
    const handleMouseDown = (event: MouseEvent) => {
      if (isNavButton(event.button)) event.preventDefault()
    }

    const handleMouseUp = (event: MouseEvent) => {
      const { navigateBack, navigateForward, canGoBack, canGoForward } = latest.current
      if (event.button === MOUSE_BUTTON_BACK && canGoBack) {
        event.preventDefault()
        navigateBack()
      } else if (event.button === MOUSE_BUTTON_FORWARD && canGoForward) {
        event.preventDefault()
        navigateForward()
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [enabled])
}
