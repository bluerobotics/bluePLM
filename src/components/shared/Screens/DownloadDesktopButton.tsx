import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import {
  DESKTOP_OS_NAMES,
  RELEASES_PAGE_URL,
  detectDesktopOs,
  resolveDesktopDownloadUrl,
} from '@/lib/desktopDownload'

/**
 * BluePLM Web's sign-in page: download the desktop app for this computer's OS from the latest
 * GitHub release (src/lib/desktopDownload.ts). Unknown OS or no installer opens the releases page.
 */
export function DownloadDesktopButton() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [os] = useState(() => detectDesktopOs(navigator.userAgent))

  const download = async () => {
    setBusy(true)
    try {
      const url = await resolveDesktopDownloadUrl(navigator.userAgent)
      if (url === RELEASES_PAGE_URL) {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        // A release asset answers as an attachment, so the page stays where it is.
        window.location.assign(url)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={busy}
      className="mt-4 w-full btn btn-secondary gap-2 justify-center py-3"
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
      {os ? t('welcome.downloadDesktopFor', { os: DESKTOP_OS_NAMES[os] }) : t('welcome.downloadDesktop')}
    </button>
  )
}
