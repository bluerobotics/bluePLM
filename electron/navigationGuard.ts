// Navigation and external-link rules for every window that loads the app (5.0 security baseline items 3 and 4,
// `.cursor/plans/security-baseline-report.md` I3/I4).
//
// - `shell.openExternal` gets only `https:` URLs. `file:`, UNC, `search-ms:` and `ms-*:` handlers are the usual
//   Windows chain from a renderer bug or a link in user content to running code.
// - A window that holds the full-trust preload never navigates its top-level frame away from the app itself (the
//   packaged `file://` page or the dev server). Any other page would get `window.electronAPI`.
// - The in-app Google sign-in window is chosen by parsing the URL's host, never by a substring that any URL can carry.

import { shell, type WebContents } from 'electron'

/** The Vite dev server the app loads from in development. */
export const DEV_SERVER_ORIGIN = 'http://localhost:5173'

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** True for a URL the system browser may open: `https:` only. */
export function isSafeExternalUrl(url: string): boolean {
  return parse(url)?.protocol === 'https:'
}

/** Opens `url` in the system browser if it is `https:`; refuses (and returns false) otherwise. */
export function openExternalSafely(url: string, log?: (message: string) => void): boolean {
  if (!isSafeExternalUrl(url)) {
    log?.('[Security] Refused to open a non-https URL externally: ' + url.substring(0, 80))
    return false
  }
  void shell.openExternal(url)
  return true
}

/**
 * True when a top-level navigation stays inside the app: the packaged `file://` page, or the dev server when
 * `allowDevServer` is set (development builds only).
 */
export function isAppNavigation(url: string, allowDevServer: boolean): boolean {
  const u = parse(url)
  if (!u) return false
  if (u.protocol === 'file:') return true
  return allowDevServer && u.origin === DEV_SERVER_ORIGIN
}

/** Google's sign-in pages, matched on the parsed host and path. */
export function isGoogleAuthUrl(url: string): boolean {
  const u = parse(url)
  if (!u || u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'accounts.google.com') return true
  if (host === 'google.com' || host === 'www.google.com') {
    return u.pathname.startsWith('/o/oauth2') || u.pathname.startsWith('/signin')
  }
  return false
}

/** A Google Docs/Drive document page: the sign-in window closes once it lands on one. */
export function isGoogleDocumentUrl(url: string): boolean {
  const u = parse(url)
  if (!u || u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (host === 'docs.google.com') {
    return /^\/(document|spreadsheets|presentation|forms)\/d\//.test(u.pathname)
  }
  if (host === 'drive.google.com') return u.pathname.startsWith('/file/d/')
  return false
}

/**
 * Denies every top-level navigation of `contents` that leaves the app. `intercept` runs first and may handle a
 * navigation itself (return true), e.g. the production OAuth redirect that is reloaded as the app page.
 */
export function installNavigationGuard(
  contents: WebContents,
  options: { allowDevServer: boolean; log?: (message: string) => void; intercept?: (url: string) => boolean },
): void {
  contents.on('will-navigate', (event, url) => {
    if (options.intercept?.(url)) {
      event.preventDefault()
      return
    }
    if (isAppNavigation(url, options.allowDevServer)) return
    event.preventDefault()
    options.log?.('[Security] Blocked navigation away from the app: ' + url.substring(0, 80))
  })
}
