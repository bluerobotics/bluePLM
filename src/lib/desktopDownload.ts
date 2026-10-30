/**
 * Picks the BluePLM desktop installer for the visitor's OS from the latest GitHub release, for the
 * "Download the desktop app" button on the web sign-in page. Release assets are named by
 * electron-builder's `${productName}-${version}-${os}.${ext}` (package.json `build.artifactName`).
 */

export const RELEASES_PAGE_URL = 'https://github.com/bluerobotics/bluePLM/releases/latest'
export const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/bluerobotics/bluePLM/releases/latest'

export type DesktopOs = 'windows' | 'mac' | 'linux'

/** Product names, shown as-is in every language. */
export const DESKTOP_OS_NAMES: Record<DesktopOs, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux' }

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

/** The visitor's desktop OS from the user agent, or null for phones, tablets and unknowns. */
export function detectDesktopOs(userAgent: string): DesktopOs | null {
  const ua = userAgent.toLowerCase()
  if (/android|iphone|ipad|ipod|mobile/.test(ua)) return null
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'mac'
  if (ua.includes('linux') || ua.includes('x11')) return 'linux'
  return null
}

const SUFFIX: Record<DesktopOs, RegExp> = {
  windows: /-win\.exe$/i,
  mac: /-mac\.dmg$/i,
  linux: /\.appimage$/i,
}

/** The installer for an OS among a release's assets, or null when that OS has none. */
export function pickInstallerAsset(assets: ReadonlyArray<ReleaseAsset>, os: DesktopOs): ReleaseAsset | null {
  return assets.find((asset) => SUFFIX[os].test(asset.name)) ?? null
}

/**
 * The URL to download for this visitor: the installer from the latest release, or the releases page
 * when the OS is unknown, has no installer, or GitHub cannot be reached.
 */
export async function resolveDesktopDownloadUrl(
  userAgent: string,
  fetchJson: (url: string) => Promise<unknown> = defaultFetchJson,
): Promise<string> {
  const os = detectDesktopOs(userAgent)
  if (!os) return RELEASES_PAGE_URL
  try {
    const release = await fetchJson(LATEST_RELEASE_API_URL)
    const assets =
      release && typeof release === 'object' && Array.isArray((release as { assets?: unknown }).assets)
        ? ((release as { assets: ReleaseAsset[] }).assets)
        : []
    const asset = pickInstallerAsset(assets, os)
    // Only ever hand the browser a GitHub download, whatever the response says.
    if (asset && asset.browser_download_url.startsWith('https://github.com/bluerobotics/bluePLM/')) {
      return asset.browser_download_url
    }
  } catch {
    // Fall through to the releases page.
  }
  return RELEASES_PAGE_URL
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  return response.json()
}
