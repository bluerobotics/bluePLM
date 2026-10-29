/** Lowercased, whitespace-collapsed, without the trailing ":" or "*" some field labels carry. */
export function normalizeSettingText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s:*]+$/, '')
    .toLowerCase()
}

/**
 * The element in `root` that renders the setting named `label`: the deepest element whose text
 * is exactly the label, else the deepest whose text starts with it and is not much longer (a
 * label followed by a badge or a value). Null when the panel does not show it (yet).
 */
export function findSettingElement(root: HTMLElement, label: string): HTMLElement | null {
  const wanted = normalizeSettingText(label)
  if (!wanted) return null

  let exact: HTMLElement | null = null
  let prefix: HTMLElement | null = null
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (el.closest('svg, script, style')) continue
    const text = normalizeSettingText(el.textContent ?? '')
    if (!text.startsWith(wanted)) continue
    // querySelectorAll is in document order, so a later hit inside an earlier one is deeper.
    if (text === wanted) exact = el
    else if (text.length <= wanted.length + 40) prefix = el
  }
  return exact ?? prefix
}

/** Scroll `el` into the middle of its scroller and flash the row that holds it. */
export function flashSettingElement(el: HTMLElement, root: HTMLElement): void {
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const target = el.parentElement && el.parentElement !== root ? el.parentElement : el
  target.classList.remove('settings-search-flash')
  // Restart the animation when the same setting is opened twice in a row.
  void target.offsetWidth
  target.classList.add('settings-search-flash')
  window.setTimeout(() => target.classList.remove('settings-search-flash'), 2400)
}
