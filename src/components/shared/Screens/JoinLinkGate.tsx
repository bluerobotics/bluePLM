import { useState, type ReactNode } from 'react'
import { hasDesktop } from '@/lib/platform'
import { readJoinCode } from '@/lib/joinLink'
import { SetupScreen } from './SetupScreen'

/**
 * BluePLM Web join link (`blueplm.io/join#<org code>`, src/lib/joinLink.ts): before the app, the
 * setup screen with the code filled in and the destination shown. Connecting saves the org's
 * backend; going back keeps the current one. Either way the link leaves the address bar. On the
 * desktop, and on any other web address, this renders `children` straight away.
 */
export function JoinLinkGate({ onConfigured, children }: { onConfigured: () => void; children: ReactNode }) {
  const [code, setCode] = useState(() =>
    hasDesktop() ? null : readJoinCode(window.location.pathname, window.location.hash),
  )
  if (!code) return <>{children}</>

  const leave = () => {
    window.history.replaceState(null, '', '/')
    setCode(null)
  }

  return (
    <div className="h-screen flex flex-col bg-plm-bg overflow-hidden">
      <SetupScreen
        initialOrgCode={code}
        onCancel={leave}
        onConfigured={() => {
          leave()
          onConfigured()
        }}
      />
    </div>
  )
}
