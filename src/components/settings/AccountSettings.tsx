import { useState, useEffect } from 'react'
import { Mail, LogOut, Monitor, Laptop, Loader2 } from 'lucide-react'
import { usePDMStore } from '../../stores/pdmStore'
import { signOut, getSupabaseClient } from '../../lib/supabase'
import { getInitials } from '../../types/pdm'
import { getMachineId } from '../../lib/backup'

interface UserSession {
  id: string
  machine_id: string
  machine_name: string
  platform: string | null
  app_version: string | null
  last_seen: string
  is_active: boolean
}

export function AccountSettings() {
  const { user, setUser, setOrganization } = usePDMStore()
  const [sessions, setSessions] = useState<UserSession[]>([])
  const [currentMachineId, setCurrentMachineId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const loadSessions = async () => {
      setIsLoading(true)
      try {
        // Get current machine ID
        const machineId = await getMachineId()
        setCurrentMachineId(machineId)

        // Fetch all sessions for this user (active within last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const client = getSupabaseClient()
        
        const { data, error } = await client
          .from('user_sessions')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .gte('last_seen', fiveMinutesAgo)
          .order('last_seen', { ascending: false })

        if (!error && data) {
          setSessions(data)
        }
      } catch (err) {
        console.error('Error loading sessions:', err)
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
    await signOut()
    setUser(null)
    setOrganization(null)
  }

  const formatLastSeen = (lastSeen: string) => {
    const date = new Date(lastSeen)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getPlatformIcon = (platform: string | null) => {
    if (platform === 'darwin') return <Laptop size={16} className="text-pdm-fg-muted" />
    return <Monitor size={16} className="text-pdm-fg-muted" />
  }

  if (!user) {
    return (
      <div className="text-center py-12 text-pdm-fg-muted text-base">
        Not signed in
      </div>
    )
  }

  const otherSessions = sessions.filter(s => s.machine_id !== currentMachineId)

  return (
    <div className="space-y-6">
      {/* User profile card */}
      <div className="flex items-center gap-4 p-4 bg-pdm-bg rounded-lg border border-pdm-border">
        {user.avatar_url ? (
          <>
            <img 
              src={user.avatar_url} 
              alt={user.full_name || user.email}
              className="w-16 h-16 rounded-full"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                target.nextElementSibling?.classList.remove('hidden')
              }}
            />
            <div className="w-16 h-16 rounded-full bg-pdm-accent flex items-center justify-center text-xl text-white font-semibold hidden">
              {getInitials(user.full_name || user.email)}
            </div>
          </>
        ) : (
          <div className="w-16 h-16 rounded-full bg-pdm-accent flex items-center justify-center text-xl text-white font-semibold">
            {getInitials(user.full_name || user.email)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xl font-medium text-pdm-fg truncate">
            {user.full_name || 'No name'}
          </div>
          <div className="text-base text-pdm-fg-muted truncate flex items-center gap-1.5">
            <Mail size={16} />
            {user.email}
          </div>
          <div className="text-sm text-pdm-fg-dim mt-1">
            Role: <span className="capitalize">{user.role}</span>
          </div>
        </div>
      </div>

      {/* Your Other Machines */}
      <div className="bg-pdm-bg rounded-lg border border-pdm-border overflow-hidden">
        <div className="px-4 py-3 border-b border-pdm-border">
          <h3 className="text-base font-semibold text-pdm-fg">Your Other Machines</h3>
          <p className="text-sm text-pdm-fg-muted mt-0.5">
            Devices where you're currently signed in
          </p>
        </div>
        
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4 text-pdm-fg-muted">
              <Loader2 size={18} className="animate-spin mr-2" />
              <span className="text-base">Loading sessions...</span>
            </div>
          ) : otherSessions.length === 0 ? (
            <div className="text-center py-4 text-pdm-fg-muted text-base">
              No other active sessions
            </div>
          ) : (
            <div className="space-y-2">
              {otherSessions.map(session => (
                <div 
                  key={session.id}
                  className="flex items-center gap-3 p-3 bg-pdm-bg-light rounded-lg border border-pdm-border"
                >
                  <div className="w-8 h-8 rounded-full bg-pdm-highlight flex items-center justify-center">
                    {getPlatformIcon(session.platform)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium text-pdm-fg truncate">
                      {session.machine_name}
                    </div>
                    <div className="text-sm text-pdm-fg-muted flex items-center gap-2">
                      <span className="capitalize">{session.platform || 'Unknown'}</span>
                      {session.app_version && (
                        <>
                          <span className="text-pdm-border">•</span>
                          <span>v{session.app_version}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-pdm-fg-muted flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-pdm-success" />
                    {formatLastSeen(session.last_seen)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Account actions */}
      <div className="space-y-2">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-4 py-3 text-base text-pdm-error bg-pdm-error/5 hover:bg-pdm-error/10 rounded-lg border border-pdm-error/20 transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  )
}
