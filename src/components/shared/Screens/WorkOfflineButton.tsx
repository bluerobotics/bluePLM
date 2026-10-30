import { WifiOff } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { hasDesktop } from '@/lib/platform'

interface WorkOfflineButtonProps {
  onClick: () => void
  className: string
  /** Draw the "or" divider above the button. */
  withDivider?: boolean
}

/**
 * "Work offline" on the welcome screens. Offline mode works on the vault folder alone, so BluePLM
 * Web, which has none, shows nothing.
 */
export function WorkOfflineButton({ onClick, className, withDivider }: WorkOfflineButtonProps) {
  const { t } = useTranslation()
  if (!hasDesktop()) return null

  return (
    <>
      {withDivider && (
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-plm-border"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-plm-bg text-plm-fg-muted">{t('common.or')}</span>
          </div>
        </div>
      )}
      <button onClick={onClick} className={className}>
        <WifiOff size={18} />
        {t('welcome.workOffline')}
      </button>
    </>
  )
}
