// Change Control for BluePLM Web: ECOs (with their files, phase-gate checklist and history) and
// deviations. Everything here is plain database work under RLS; the UI hides what the user's team
// grants (module:eco, module:deviations) would refuse, and the database refuses it anyway.
import { useMemo } from 'react'
import type { SectionProps } from '@web/shell/ui'
import { Loading, NotFound } from '@web/shell/ui'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { loadPermissionGrants } from './api'
import { PermissionsContext, useLoad } from './hooks'
import { NO_PERMISSIONS, resolvePermissions } from './model'
import { parseChangeControlRoute } from './routes'
import { EcoList } from './EcoList'
import { EcoDetailPage } from './EcoDetail'
import { EcoCreatePage, EcoEditPage } from './EcoForm'
import { DeviationList } from './DeviationList'
import { DeviationDetailPage } from './DeviationDetail'
import { DeviationCreatePage, DeviationEditPage } from './DeviationForm'

export function ChangeControlSection({ segments, query }: SectionProps) {
  const auth = useReadyAuth()
  const userId = auth.profile.id
  // A failed permission load leaves every write control hidden; reading still works.
  const grants = useLoad(() => loadPermissionGrants(userId), userId)
  const permissions = useMemo(
    () => (grants.data || auth.isAdmin ? resolvePermissions(grants.data ?? [], auth.isAdmin) : NO_PERMISSIONS),
    [grants.data, auth.isAdmin],
  )
  const route = parseChangeControlRoute(segments)
  if (grants.loading && !grants.data && !auth.isAdmin) return <Loading />

  let page
  switch (route.page) {
    case 'ecoList':
      page = <EcoList query={query} />
      break
    case 'ecoNew':
      page = <EcoCreatePage />
      break
    case 'ecoDetail':
      page = <EcoDetailPage key={route.id} id={route.id} />
      break
    case 'ecoEdit':
      page = <EcoEditPage key={route.id} id={route.id} />
      break
    case 'deviationList':
      page = <DeviationList query={query} />
      break
    case 'deviationNew':
      page = <DeviationCreatePage />
      break
    case 'deviationDetail':
      page = <DeviationDetailPage key={route.id} id={route.id} />
      break
    case 'deviationEdit':
      page = <DeviationEditPage key={route.id} id={route.id} />
      break
    default:
      page = <NotFound />
  }

  return <PermissionsContext.Provider value={permissions}>{page}</PermissionsContext.Provider>
}
