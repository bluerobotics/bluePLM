import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadAdminSnapshot, type AdminSnapshot } from './adminData'
import { buildAdminTeams, buildOrgUsers, type AdminTeam, type OrgUser } from './adminLogic'

export interface AdminData {
  snapshot: AdminSnapshot
  users: OrgUser[]
  teams: AdminTeam[]
}

/** What every tab receives besides the data. */
export interface TabProps {
  data: AdminData
  orgId: string
  currentUserId: string
  reload: () => void
}

export function useAdminData(orgId: string) {
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true
    setError(null)
    loadAdminSnapshot(orgId).then(
      (loaded) => {
        if (active) setSnapshot(loaded)
      },
      (reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      },
    )
    return () => {
      active = false
    }
  }, [orgId, count])

  const reload = useCallback(() => setCount((value) => value + 1), [])

  const data = useMemo<AdminData | null>(() => {
    if (!snapshot) return null
    return {
      snapshot,
      users: buildOrgUsers(
        snapshot.users,
        snapshot.memberships,
        snapshot.teams,
        snapshot.invites.map((invite) => invite.email),
      ),
      teams: buildAdminTeams(snapshot.teams, snapshot.memberships),
    }
  }, [snapshot])

  return { data, error, reload }
}
