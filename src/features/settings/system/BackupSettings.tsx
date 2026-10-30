import { useShallow } from 'zustand/react/shallow'

import { BackupPanel } from '@/features/source/backup'
import { usePDMStore } from '@/stores/pdmStore'

export function BackupSettings() {
  const { getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      getEffectiveRole: s.getEffectiveRole,
    })),
  )

  return <BackupPanel isAdmin={getEffectiveRole() === 'admin'} />
}
