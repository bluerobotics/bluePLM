/**
 * Who may call what, for every route the API registers.
 *
 * The route list comes from the app itself (an `onRoute` hook in the harness),
 * not from a hand list, so a new route joins every check below the moment it is
 * registered. What is hand-kept is the classification: which routes are public,
 * which are admin-only, which refuse viewers. Each list is checked in both
 * directions, so a new admin-only route that is not listed fails as surely as a
 * listed one that lets a non-admin through.
 *
 * Admin is `request.user.isAdmin` (CLAUDE.md), never `role`. Two personas hold
 * that line: `teamAdmin` is an admin only through the Administrators team and
 * has the viewer role, so a gate reading `role` refuses them; `adminCheckFails`
 * has `role = 'admin'` while `is_org_admin()` errors, so a gate falling back to
 * `role` lets them in where it must fail closed.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createRouteHarness,
  routeKey,
  sampleRequest,
  type PersonaName,
  type RegisteredRoute,
  type RouteHarness,
} from '../test/routeHarness.js'

/** Answer without a token. */
const PUBLIC_ROUTES = new Set(['GET /', 'GET /health'])

/** Gated inline on `request.user.isAdmin`. */
const ADMIN_ROUTES = new Set([
  'POST /auth/invite',
  'POST /admin/extensions/reload',
  'POST /webhooks',
  'GET /backup/issues/:hash/copies',
  'POST /backup/issues/:hash/restore',
  'POST /backup/issues/:hash/upload',
  'DELETE /webhooks/:id',
  'PATCH /webhooks/:id',
  'POST /integrations/odoo',
  'POST /integrations/odoo/test',
  'DELETE /integrations/odoo',
  'GET /integrations/odoo/configs/:id',
  'POST /integrations/odoo/configs',
  'PUT /integrations/odoo/configs/:id',
  'DELETE /integrations/odoo/configs/:id',
  'POST /integrations/odoo/configs/:id/activate',
])

/** Refused to a non-admin with the viewer role, on top of the admin routes. */
const VIEWER_REFUSED_ROUTES = new Set([
  'POST /integrations/odoo/sync/suppliers',
])

/** `requireTeamPermission()` routes, found by their preHandler's name. */
function isTeamPermissionRoute(route: RegisteredRoute): boolean {
  return route.preHandlers.includes('checkTeamPermission')
}

const listing = await createRouteHarness()
const ROUTES = listing.routes
await listing.close()

const AUTHENTICATED_ROUTES = ROUTES.filter((route) => !PUBLIC_ROUTES.has(routeKey(route)))

let harness: RouteHarness

beforeAll(async () => {
  harness = await createRouteHarness()
})

afterAll(async () => {
  await harness.close()
})

async function call(route: RegisteredRoute, auth: { persona?: PersonaName; authorization?: string }) {
  const writesBefore = harness.writes().length
  const { url, query, payload } = sampleRequest(route)
  const response = await harness.inject({ method: route.method as 'GET', url, query, payload, ...auth })
  return { status: response.statusCode, body: response.body, wrote: harness.writes().slice(writesBefore) }
}

describe('route listing', () => {
  it('finds the routes', () => {
    // A floor, not a count: a broken onRoute hook would otherwise pass every
    // check below vacuously.
    expect(ROUTES.length).toBeGreaterThan(15)
  })

  it('lists only routes that exist', () => {
    const registered = new Set(ROUTES.map(routeKey))
    for (const key of [...PUBLIC_ROUTES, ...ADMIN_ROUTES, ...VIEWER_REFUSED_ROUTES]) {
      expect(registered, key).toContain(key)
    }
  })
})

describe('unauthenticated', () => {
  it.each(AUTHENTICATED_ROUTES.map((route) => [routeKey(route), route] as const))(
    '%s answers 401 without a token and writes nothing',
    async (_key, route) => {
      const result = await call(route, {})
      expect(result.status, result.body).toBe(401)
      expect(result.wrote).toEqual([])
    },
  )

  it.each(AUTHENTICATED_ROUTES.map((route) => [routeKey(route), route] as const))(
    '%s answers 401 for a token that resolves to no user',
    async (_key, route) => {
      const result = await call(route, { authorization: 'Bearer not-a-real-token' })
      expect(result.status, result.body).toBe(401)
      expect(result.wrote).toEqual([])
    },
  )

  it.each([...PUBLIC_ROUTES])('%s answers without a token', async (key) => {
    const route = ROUTES.find((r) => routeKey(r) === key)!
    const result = await call(route, {})
    expect(result.status, result.body).not.toBe(401)
  })
})

describe('admin gates', () => {
  const cases = AUTHENTICATED_ROUTES.map((route) => [routeKey(route), route] as const)

  it.each(cases)('%s: an engineer is refused exactly when the route is admin-only', async (key, route) => {
    const result = await call(route, { persona: 'engineer' })
    const gated = ADMIN_ROUTES.has(key) || isTeamPermissionRoute(route)
    if (gated) {
      expect(result.status, result.body).toBe(403)
      expect(result.wrote).toEqual([])
    } else {
      expect(result.status, `${key} refused an engineer; if it is admin-only, add it to ADMIN_ROUTES`).not.toBe(403)
    }
  })

  it.each(cases)('%s: a viewer is refused exactly when the route says so', async (key, route) => {
    const result = await call(route, { persona: 'viewer' })
    const gated = ADMIN_ROUTES.has(key) || VIEWER_REFUSED_ROUTES.has(key) || isTeamPermissionRoute(route)
    if (gated) {
      expect(result.status, result.body).toBe(403)
      expect(result.wrote).toEqual([])
    } else {
      expect(result.status, `${key} refused a viewer; list it in VIEWER_REFUSED_ROUTES if that is intended`).not.toBe(
        403,
      )
    }
  })

  it.each(cases)('%s: an admin through the Administrators team with the viewer role passes', async (_key, route) => {
    const result = await call(route, { persona: 'teamAdmin' })
    expect([401, 403], result.body).not.toContain(result.status)
  })

  it.each(cases)('%s: an admin by role passes', async (_key, route) => {
    const result = await call(route, { persona: 'roleAdmin' })
    expect([401, 403], result.body).not.toContain(result.status)
  })

  it.each(cases.filter(([key, route]) => ADMIN_ROUTES.has(key) || isTeamPermissionRoute(route)))(
    '%s: role admin whose is_org_admin() check fails is refused (fails closed)',
    async (_key, route) => {
      const result = await call(route, { persona: 'adminCheckFails' })
      expect(result.status, result.body).toBe(403)
      expect(result.wrote).toEqual([])
    },
  )
})
