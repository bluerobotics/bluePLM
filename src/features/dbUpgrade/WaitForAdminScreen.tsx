import { useEffect, useState } from 'react'
import { Database, RefreshCw } from 'lucide-react'

import { useTranslation } from '@/lib/i18n'
import { hasDesktop } from '@/lib/platform'
import { usePDMStore } from '@/stores/pdmStore'

import { BlockingScreen } from './BlockingScreen'
import { runDbGateCheck } from './dbUpgradeActions'
import { readIsOrgAdmin } from './readDbState'

/** While waiting, ask once a minute whether the admin has finished. */
const POLL_MS = 60 * 1000

/** Non-admins, and everyone on BluePLM Web: the database needs an admin's upgrade first. */
export function WaitForAdminScreen() {
  const { t } = useTranslation()
  const userId = usePDMStore((s) => s.dbGate.userId)
  const userEmail = usePDMStore((s) => s.dbGate.userEmail)
  const [webAdmin, setWebAdmin] = useState(false)

  useEffect(() => {
    if (hasDesktop()) return
    let cancelled = false
    void readIsOrgAdmin().then((isAdmin) => {
      if (!cancelled) setWebAdmin(isAdmin)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    const timer = setInterval(() => void runDbGateCheck(userId, userEmail), POLL_MS)
    return () => clearInterval(timer)
  }, [userId, userEmail])

  return (
    <BlockingScreen icon={<Database size={28} />} title={t('dbUpgrade.waitTitle')}>
      <p>{t('dbUpgrade.waitBody')}</p>
      {webAdmin && <p className="text-plm-warning">{t('dbUpgrade.waitBodyWebAdmin')}</p>}
      <button
        type="button"
        disabled={!userId}
        onClick={() => userId && void runDbGateCheck(userId, userEmail)}
        className="btn btn-secondary flex items-center gap-2"
      >
        <RefreshCw size={14} />
        {t('dbUpgrade.recheck')}
      </button>
    </BlockingScreen>
  )
}
