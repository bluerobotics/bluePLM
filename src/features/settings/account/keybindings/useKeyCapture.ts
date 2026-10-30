import { useEffect, useRef, useState } from 'react'

import { eventToCombo } from '@/lib/keybindings'

/**
 * While `active`, takes every key press before anything else in the app (window, capture phase):
 * shortcuts, settings' own Escape and the focused control never see it. A full combo goes to
 * `onCombo`; a bare Escape goes to `onCancel`; Tab still moves focus. Returns the modifiers held
 * right now, so the field can show "Ctrl+Shift+…" while the user is still pressing.
 */
export function useKeyCapture(
  active: boolean,
  onCombo: (combo: string) => void,
  onCancel: () => void,
): string[] {
  const [held, setHeld] = useState<string[]>([])
  const onComboRef = useRef(onCombo)
  onComboRef.current = onCombo
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!active) {
      setHeld([])
      return
    }
    const readHeld = (e: KeyboardEvent) => {
      const next: string[] = []
      if (e.ctrlKey || e.metaKey) next.push('Mod')
      if (e.altKey) next.push('Alt')
      if (e.shiftKey) next.push('Shift')
      setHeld(next)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const bare = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
      if (e.key === 'Tab' && bare) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape' && bare) {
        onCancelRef.current()
        return
      }
      const combo = eventToCombo(e)
      if (combo) onComboRef.current(combo)
      else readHeld(e)
    }
    const onKeyUp = (e: KeyboardEvent) => readHeld(e)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [active])

  return held
}
