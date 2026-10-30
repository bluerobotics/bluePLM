/**
 * Key combinations as canonical strings: modifiers in a fixed order (`Mod`, `Alt`, `Shift`), then
 * one key, joined by `+`. `Mod` is Ctrl on Windows and Linux and Cmd on macOS; either key matches
 * it on every platform, as BluePLM's shortcuts always have. Letters are upper case, the `+` key is
 * `Plus` and the space bar is `Space`, so `Mod+Shift+P`, `F2`, `ArrowUp` and `Mod+Plus` are combos.
 */

export interface ParsedCombo {
  mod: boolean
  alt: boolean
  shift: boolean
  key: string
}

/** The fields of a KeyboardEvent a combo is read from (a plain object in tests). */
export interface ComboEventLike {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'OS', 'Hyper', 'Super'])

/** Old browser names for keys, mapped to the standard `KeyboardEvent.key` values. */
const KEY_ALIASES: Record<string, string> = {
  Esc: 'Escape',
  Del: 'Delete',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Spacebar: 'Space',
  ' ': 'Space',
  '+': 'Plus',
  Return: 'Enter',
}

/** The canonical name of a key: aliases resolved, single letters upper case. */
export function normalizeKey(key: string): string {
  const aliased = KEY_ALIASES[key] ?? key
  if (aliased.length === 1) return aliased.toUpperCase()
  // Function keys and named keys keep their standard spelling, whatever case was typed.
  if (/^f\d{1,2}$/i.test(aliased)) return aliased.toUpperCase()
  return aliased
}

/**
 * The key an event names. With Alt held, macOS types a symbol (Alt+P gives "π"), so the physical
 * letter or digit is read from `code` instead.
 */
function eventKey(e: ComboEventLike): string {
  if (e.altKey && e.code) {
    const letter = /^Key([A-Z])$/.exec(e.code)
    if (letter) return letter[1]
    const digit = /^Digit(\d)$/.exec(e.code)
    if (digit) return digit[1]
  }
  return normalizeKey(e.key)
}

export function isModifierOnly(e: Pick<ComboEventLike, 'key'>): boolean {
  return MODIFIER_KEYS.has(e.key)
}

export function formatParsedCombo(parsed: ParsedCombo): string {
  const parts: string[] = []
  if (parsed.mod) parts.push('Mod')
  if (parsed.alt) parts.push('Alt')
  if (parsed.shift) parts.push('Shift')
  parts.push(parsed.key)
  return parts.join('+')
}

/** The combo a key press makes, or null for a lone modifier or an unnamed key. */
export function eventToCombo(e: ComboEventLike): string | null {
  if (!e.key || isModifierOnly(e) || e.key === 'Unidentified' || e.key === 'Dead') return null
  return formatParsedCombo({
    mod: e.ctrlKey || e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
    key: eventKey(e),
  })
}

/**
 * Reads a combo written by hand or by an older version ("ctrl+shift+p", "Cmd+K", "Mod+Plus").
 * Returns null when it names no key or a modifier twice.
 */
export function parseCombo(text: string): ParsedCombo | null {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed) return null
  // A trailing "++" means the plus key itself ("Ctrl++").
  const tokens = trimmed.endsWith('++')
    ? [...trimmed.slice(0, -2).split('+').filter(Boolean), 'Plus']
    : trimmed.split('+').map((token) => token.trim())
  if (tokens.some((token) => token === '')) return null

  const parsed: ParsedCombo = { mod: false, alt: false, shift: false, key: '' }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const lower = token.toLowerCase()
    const isLast = i === tokens.length - 1
    const modifier =
      lower === 'mod' || lower === 'ctrl' || lower === 'control' || lower === 'cmd' ||
      lower === 'command' || lower === 'meta' || lower === '⌘'
        ? 'mod'
        : lower === 'alt' || lower === 'option' || lower === 'opt' || lower === '⌥'
          ? 'alt'
          : lower === 'shift' || lower === '⇧'
            ? 'shift'
            : null
    if (modifier && !isLast) {
      if (parsed[modifier]) return null
      parsed[modifier] = true
      continue
    }
    if (!isLast) return null
    if (MODIFIER_KEYS.has(token)) return null
    parsed.key = normalizeKey(token)
  }
  return parsed.key ? parsed : null
}

/** The canonical spelling of a combo, or null when it cannot be read. */
export function canonicalCombo(text: string): string | null {
  const parsed = parseCombo(text)
  return parsed ? formatParsedCombo(parsed) : null
}

/**
 * Whether a pressed combo triggers a binding. With `allowExtraShift`, Shift may be held on top of
 * a binding that has none (Shift+Arrow extends a selection).
 */
export function comboMatches(pressed: string, binding: string, allowExtraShift = false): boolean {
  if (pressed === binding) return true
  if (!allowExtraShift) return false
  const parsed = parseCombo(pressed)
  if (!parsed?.shift) return false
  return formatParsedCombo({ ...parsed, shift: false }) === binding
}

export type ShortcutPlatform = 'mac' | 'other'

/** Whether this machine is a Mac, where Mod reads ⌘ and modifiers are shown as symbols. */
export function detectShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === 'undefined') return 'other'
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform || nav.platform || ''
  return /mac|iphone|ipad/i.test(platform) ? 'mac' : 'other'
}

const KEY_LABELS: Record<string, { mac?: string; other?: string; all?: string }> = {
  ArrowUp: { all: '↑' },
  ArrowDown: { all: '↓' },
  ArrowLeft: { all: '←' },
  ArrowRight: { all: '→' },
  Escape: { all: 'Esc' },
  Delete: { mac: '⌦', other: 'Del' },
  Backspace: { mac: '⌫', other: 'Backspace' },
  Enter: { mac: '↩', other: 'Enter' },
  Tab: { mac: '⇥', other: 'Tab' },
  Space: { all: 'Space' },
  Plus: { all: '+' },
  PageUp: { other: 'PgUp', mac: 'Page Up' },
  PageDown: { other: 'PgDn', mac: 'Page Down' },
  Home: { all: 'Home' },
  End: { all: 'End' },
  Insert: { all: 'Ins' },
}

/** The keycaps a combo is drawn as: Ctrl / Alt / Shift, or ⌘ / ⌥ / ⇧ on macOS. */
export function comboKeycaps(combo: string, platform: ShortcutPlatform): string[] {
  const parsed = parseCombo(combo)
  if (!parsed) return [combo]
  const caps: string[] = []
  if (platform === 'mac') {
    // macOS order: Option, Shift, Command.
    if (parsed.alt) caps.push('⌥')
    if (parsed.shift) caps.push('⇧')
    if (parsed.mod) caps.push('⌘')
  } else {
    if (parsed.mod) caps.push('Ctrl')
    if (parsed.alt) caps.push('Alt')
    if (parsed.shift) caps.push('Shift')
  }
  const label = KEY_LABELS[parsed.key]
  caps.push(label?.all ?? (platform === 'mac' ? label?.mac : label?.other) ?? parsed.key)
  return caps
}

/** A combo as one line of text ("Ctrl+Shift+P", "⇧⌘P"), for tooltips and toasts. */
export function formatCombo(combo: string, platform: ShortcutPlatform): string {
  const caps = comboKeycaps(combo, platform)
  return platform === 'mac' ? caps.join('') : caps.join('+')
}
