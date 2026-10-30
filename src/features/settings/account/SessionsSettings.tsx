import { useEffect, useState } from 'react'
import { Laptop, Loader2, LogOut, Monitor } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button } from '@/components/core/ui'
import { SettingsGroup, SettingsPage, SettingsSection } from '@/features/settings/components/ui'
import { getMachineId } from '@/lib/backup'
import { getBackend } from '@/lib/backend'
import { log } from '@/lib/logger'
import { endRemoteSession, getSupabaseClient } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'

interface UserSession {
  id: string
  machine_id: string
  machine_name: string | null
  os_version: string | null
  app_version: string | null
  platform: string | null
  last_active_at: string | null
  last_seen_at: string | null
  is_active: boolean | null
  created_at: string | null
}

const formatLastSeen = (lastSeen: string | null) => {
  if (!lastSeen) return 'unknown'
  const date = new Date(lastSeen)
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** The devices where this user is signed in, each with its own sign out. */
export function SessionsSettings() {
  const { user, setUser, setOrganization } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      setUser: s.setUser,
      setOrganization: s.setOrganization,
    })),
  )

  const [sessions, setSessions] = useState<UserSession[]>([])
  const [currentMachineId, setCurrentMachineId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [signingOutSessionId, setSigningOutSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    const loadSessions = async () => {
      setIsLoading(true)
      try {
        const machineId = await getMachineId()
        setCurrentMachineId(machineId)

        // Sessions active within the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { data, error } = await getSupabaseClient()
          .from('user_session')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .gte('last_seen_at', fiveMinutesAgo)
          .order('last_seen_at', { ascending: false })

        if (!error && data) {
          // Cast to UserSession[] - Supabase types may be out of sync with actual schema
          setSessions(data as unknown as UserSession[])
        }
      } catch (error) {
        log.error('[Sessions]', 'Error loading sessions', { error: error })
      } finally {
        setIsLoading(false)
      }
    }

    loadSessions()

    // Refresh every 30 seconds
    const interval = setInterval(loadSessions, 30000)
    return () => clearInterval(interval)
  }, [user])

  const handleSignOut = async () => {
    await getBackend().auth.signOut()
    setUser(null)
    setOrganization(null)
  }

  const handleRemoteSignOut = async (sessionId: string) => {
    setSigningOutSessionId(sessionId)
    try {
      const { success, error } = await endRemoteSession(sessionId)
      if (success) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      } else {
        log.error('[Sessions]', 'Failed to sign out session', { error })
      }
    } catch (error) {
      log.error('[Sessions]', 'Error signing out session', { error: error })
    } finally {
      setSigningOutSessionId(null)
    }
  }

  if (!user) {
    return <div className="py-12 text-center text-[13px] text-plm-fg-muted">Not signed in</div>
  }

  // Current device first
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.machine_id === currentMachineId) return -1
    if (b.machine_id === currentMachineId) return 1
    return 0
  })

  return (
    <SettingsPage>
      <SettingsSection title="Signed-in devices">
        <SettingsGroup>
          {isLoading && sortedSessions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3.5 text-[13px] text-plm-fg-muted">
              <Loader2 size={14} className="animate-spin" />
              Loading sessions...
            </div>
          ) : sortedSessions.length === 0 ? (
            <div className="px-4 py-3.5 text-[13px] text-plm-fg-muted">No active sessions</div>
          ) : (
            sortedSessions.map((session) => {
              const isCurrentDevice = session.machine_id === currentMachineId
              const PlatformIcon = session.platform === 'darwin' ? Laptop : Monitor
              return (
                <div key={session.id} className="flex items-center gap-3 px-4 py-3">
                  <PlatformIcon size={16} className="flex-shrink-0 text-plm-fg-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-plm-fg">
                        {session.machine_name}
                      </span>
                      {isCurrentDevice && <Badge tone="accent">This device</Badge>}
                    </div>
                    <div className="text-[12px] text-plm-fg-muted">
                      <span className="capitalize">{session.platform || 'Unknown'}</span>
                      {session.app_version && <> · v{session.app_version}</>}
                      {' · '}
                      {formatLastSeen(session.last_seen_at)}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<LogOut size={12} />}
                    loading={signingOutSessionId === session.id}
                    onClick={() =>
                      isCurrentDevice ? handleSignOut() : handleRemoteSignOut(session.id)
                    }
                    title={isCurrentDevice ? 'Sign out' : 'Sign out this device'}
                  >
                    Sign out
                  </Button>
                </div>
              )
            })
          )}
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}
