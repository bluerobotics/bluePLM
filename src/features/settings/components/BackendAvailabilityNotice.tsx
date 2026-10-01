import { CircleSlash2, Construction } from 'lucide-react'

import { useTranslation } from '@/lib/i18n'
import type { SettingsTabAvailability } from '@/lib/backendAdapter'

interface BackendAvailabilityNoticeProps {
  availability: Exclude<SettingsTabAvailability, 'supported'>
}

interface BackendAvailabilityDialogProps extends BackendAvailabilityNoticeProps {
  onClose: () => void
}

/** Consistent feedback for visible settings that the active backend cannot execute. */
export function BackendAvailabilityNotice({ availability }: BackendAvailabilityNoticeProps) {
  const { t } = useTranslation()
  const inDevelopment = availability === 'in-development'
  const Icon = inDevelopment ? Construction : CircleSlash2

  return (
    <div className="rounded-xl border border-plm-border bg-plm-bg p-8 text-center">
      <Icon size={32} className="mx-auto mb-4 text-plm-fg-muted" />
      <h2 className="text-lg font-semibold text-plm-fg">
        {t(
          inDevelopment
            ? 'settingsPages.availability.inDevelopmentTitle'
            : 'settingsPages.availability.incompatibleTitle',
        )}
      </h2>
      <p className="mt-2 text-sm text-plm-fg-muted">
        {t(
          inDevelopment
            ? 'settingsPages.availability.inDevelopmentDescription'
            : 'settingsPages.availability.incompatibleDescription',
        )}
      </p>
    </div>
  )
}

export function BackendAvailabilityDialog({
  availability,
  onClose,
}: BackendAvailabilityDialogProps) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md p-4" onClick={(event) => event.stopPropagation()}>
        <BackendAvailabilityNotice availability={availability} />
        <div className="-mt-4 flex justify-center pb-4">
          <button className="btn btn-primary" onClick={onClose}>
            {t('mdbSetup.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
