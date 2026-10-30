import { describe, expect, it } from 'vitest'
import {
  RELEASES_PAGE_URL,
  detectDesktopOs,
  pickInstallerAsset,
  resolveDesktopDownloadUrl,
} from './desktopDownload'

const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'

const base = 'https://github.com/bluerobotics/bluePLM/releases/download/v4.10.0'
const release = {
  assets: [
    { name: 'BluePLM-4.10.0-mac.dmg', browser_download_url: `${base}/BluePLM-4.10.0-mac.dmg` },
    { name: 'BluePLM-4.10.0-mac.zip', browser_download_url: `${base}/BluePLM-4.10.0-mac.zip` },
    { name: 'BluePLM-4.10.0-win.exe', browser_download_url: `${base}/BluePLM-4.10.0-win.exe` },
    { name: 'latest.yml', browser_download_url: `${base}/latest.yml` },
  ],
}

describe('desktop download', () => {
  it('reads the desktop OS from the user agent, and none for phones', () => {
    expect(detectDesktopOs(WINDOWS)).toBe('windows')
    expect(detectDesktopOs(MAC)).toBe('mac')
    expect(detectDesktopOs(LINUX)).toBe('linux')
    expect(detectDesktopOs(IPHONE)).toBeNull()
  })

  it('picks the installer for each OS, not the zip or the update manifests', () => {
    expect(pickInstallerAsset(release.assets, 'windows')?.name).toBe('BluePLM-4.10.0-win.exe')
    expect(pickInstallerAsset(release.assets, 'mac')?.name).toBe('BluePLM-4.10.0-mac.dmg')
    expect(pickInstallerAsset(release.assets, 'linux')).toBeNull()
  })

  it('downloads the installer, or opens the releases page when there is none or GitHub fails', async () => {
    expect(await resolveDesktopDownloadUrl(WINDOWS, async () => release)).toBe(`${base}/BluePLM-4.10.0-win.exe`)
    expect(await resolveDesktopDownloadUrl(LINUX, async () => release)).toBe(RELEASES_PAGE_URL)
    expect(await resolveDesktopDownloadUrl(IPHONE, async () => release)).toBe(RELEASES_PAGE_URL)
    expect(
      await resolveDesktopDownloadUrl(WINDOWS, async () => {
        throw new Error('offline')
      }),
    ).toBe(RELEASES_PAGE_URL)
  })

  it('never follows a download URL outside the BluePLM repository', async () => {
    const tampered = { assets: [{ name: 'BluePLM-9-win.exe', browser_download_url: 'https://evil.example/x.exe' }] }
    expect(await resolveDesktopDownloadUrl(WINDOWS, async () => tampered)).toBe(RELEASES_PAGE_URL)
  })
})
