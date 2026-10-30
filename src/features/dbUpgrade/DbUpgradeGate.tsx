import type { ReactNode } from 'react'

import { usePDMStore } from '@/stores/pdmStore'

import { AdminUpgradeScreen } from './AdminUpgradeScreen'
import { UpdateRequiredScreen } from './UpdateRequiredScreen'
import { useDbGateCheck } from './useDbGateCheck'
import { WaitForAdminScreen } from './WaitForAdminScreen'

/**
 * Wraps the application shell. While the gate is unknown or checking, or clear, the app renders as
 * usual; once a check finds the app too old for the database, or the database too old for the
 * app, the shell is replaced by a blocking screen, so nothing reads or writes the database.
 */
export function DbUpgradeGate({ children }: { children: ReactNode }) {
  useDbGateCheck()
  const status = usePDMStore((s) => s.dbGate.status)

  switch (status) {
    case 'update-required':
      return <UpdateRequiredScreen />
    case 'db-upgrade-admin':
      return <AdminUpgradeScreen />
    case 'db-upgrade-wait':
      return <WaitForAdminScreen />
    default:
      return <>{children}</>
  }
}
