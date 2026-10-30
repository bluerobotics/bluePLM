// Dark / light theme for BluePLM Web. The tokens for both live in web/src/index.css under
// [data-theme]; this file only picks one, applies it to <html> and remembers it per browser.
// Storage can be blocked (private windows, site data off), so every access is guarded and the
// page still works with the default.

export type WebTheme = 'dark' | 'light'
export const WEB_THEMES: readonly WebTheme[] = ['dark', 'light']
export const DEFAULT_THEME: WebTheme = 'dark'
export const THEME_STORAGE_KEY = 'blueplm-web-theme'

export function parseTheme(value: string | null | undefined): WebTheme | null {
  return value === 'dark' || value === 'light' ? value : null
}

export function getSavedTheme(): WebTheme {
  try {
    return parseTheme(globalThis.localStorage?.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: WebTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

/** Apply and remember a theme. */
export function setTheme(theme: WebTheme): void {
  applyTheme(theme)
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Not remembered; it still applies to this tab.
  }
}

/** Apply the remembered theme (or the default). Called once at boot, before the first render. */
export function applySavedTheme(): WebTheme {
  const theme = getSavedTheme()
  applyTheme(theme)
  return theme
}
