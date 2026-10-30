import { comboKeycaps, type ShortcutPlatform } from '@/lib/keybindings'

const CAP =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-ui-field-border bg-ui-field px-1.5 font-ui text-[12px] font-medium leading-none text-ui-fg shadow-[inset_0_-1px_0_var(--ui-field-border)]'

/** One combo drawn as keycaps: Ctrl, Shift, P (⇧ ⌘ P on macOS). */
export function Keycaps({ combo, platform }: { combo: string; platform: ShortcutPlatform }) {
  return (
    <span className="inline-flex items-center gap-1">
      {comboKeycaps(combo, platform).map((cap, i) => (
        <kbd key={i} className={CAP}>
          {cap}
        </kbd>
      ))}
    </span>
  )
}

/** Modifier keys held so far while capturing, before the main key arrives. */
export function HeldModifiers({ held, platform }: { held: string[]; platform: ShortcutPlatform }) {
  if (held.length === 0) return null
  // Draw "Mod+Shift+…" without a key: reuse the keycap look for each modifier.
  const caps = comboKeycaps(`${held.join('+')}+X`, platform).slice(0, -1)
  return (
    <span className="inline-flex items-center gap-1">
      {caps.map((cap, i) => (
        <kbd key={i} className={CAP}>
          {cap}
        </kbd>
      ))}
    </span>
  )
}
