import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'

import { useTranslation } from '@/lib/i18n'
import { signOut } from '@/lib/supabase'
import { log } from '@/lib/logger'

interface BlockingScreenProps {
  icon: ReactNode
  title: string
  children: ReactNode
  /** Sign out is offered on every blocking screen, so nobody is stuck on one. */
  showSignOut?: boolean
}

export function BlockingScreen({ icon, title, children, showSignOut = true }: BlockingScreenProps) {
  const { t } = useTranslation()
  const handleSignOut = () => {
    signOut().catch((error: unknown) => {
      log.warn('[DbUpgrade]', 'Sign out failed', { error: String(error) })
    })
  }

  return (
    <div className="h-screen w-screen overflow-y-auto bg-plm-bg text-plm-fg">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6 py-10">
        <div className="rounded-lg border border-plm-border bg-plm-panel p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-3">
            <div className="text-plm-accent">{icon}</div>
            <h1 className="text-xl font-semibold">{title}</h1>
          </div>
          <div className="space-y-4 text-sm">{children}</div>
          {showSignOut && (
            <div className="mt-6 flex justify-end border-t border-plm-border pt-4">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-2 text-xs text-plm-fg-muted hover:text-plm-fg"
              >
                <LogOut size={14} />
                {t('dbUpgrade.signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
