/**
 * Route-level test harness for the API: the real auth plugin, error handler and
 * routes, answering from an in-memory Supabase.
 *
 * `createSupabaseClient` and `createSupabaseAdminClient` are replaced with a
 * factory that hands back `FakeSupabase` (src/test/fakeSupabase.ts), so every
 * table, column and RPC a route names is checked against the generated types.
 * Nothing else is stubbed: `fastify.authenticate` runs as shipped, resolving the
 * bearer token to a user, reading the profile and asking `is_org_admin()`.
 *
 * Callers are personas, chosen by bearer token (see PERSONAS). A request with
 * no token, or a token no persona owns, is unauthenticated.
 *
 * Use:
 *   const harness = await createRouteHarness()
 *   await harness.inject({ method: 'GET', url: '/webhooks', persona: 'engineer' })
 *   harness.fake.rows('webhook')
 *   await harness.close()
 */

import type { FastifyInstance, InjectOptions, LightMyRequestResponse, RouteOptions } from 'fastify'
import { vi } from 'vitest'

import { FakeSupabase, type FakeCall } from '../../src/test/fakeSupabase.js'
import { defineFileRpcs } from '../../src/test/fakeSupabaseRpcs.js'

export const ORG_ID = '00000000-0000-4000-8000-0000000000c1'
export const OTHER_ORG_ID = '00000000-0000-4000-8000-0000000000c2'
export const VAULT_ID = '00000000-0000-4000-8000-0000000000a1'
export const ADMINISTRATORS_TEAM_ID = '00000000-0000-4000-8000-0000000000e1'

export type PersonaName = 'engineer' | 'viewer' | 'roleAdmin' | 'teamAdmin' | 'adminCheckFails'

export interface Persona {
  id: string
  email: string
  token: string
  role: 'admin' | 'engineer' | 'viewer'
  /** Member of the Administrators team. */
  inAdministratorsTeam: boolean
  /** `is_org_admin()` errors for this caller, so the API must fail closed. */
  adminCheckFails: boolean
}

/**
 * The callers the matrix needs. `teamAdmin` is an admin only through the team,
 * with the lowest role, so a gate that reads `role` instead of `isAdmin`
 * refuses them. `adminCheckFails` holds `role = 'admin'` while `is_org_admin()`
 * errors, so a gate that falls back to `role` lets them through.
 */
export const PERSONAS: Readonly<Record<PersonaName, Persona>> = {
  engineer: {
    id: '00000000-0000-4000-8000-0000000000d1',
    email: 'engineer@example.com',
    token: 'token-engineer',
    role: 'engineer',
    inAdministratorsTeam: false,
    adminCheckFails: false,
  },
  viewer: {
    id: '00000000-0000-4000-8000-0000000000d2',
    email: 'viewer@example.com',
    token: 'token-viewer',
    role: 'viewer',
    inAdministratorsTeam: false,
    adminCheckFails: false,
  },
  roleAdmin: {
    id: '00000000-0000-4000-8000-0000000000d3',
    email: 'role-admin@example.com',
    token: 'token-role-admin',
    role: 'admin',
    inAdministratorsTeam: false,
    adminCheckFails: false,
  },
  teamAdmin: {
    id: '00000000-0000-4000-8000-0000000000d4',
    email: 'team-admin@example.com',
    token: 'token-team-admin',
    role: 'viewer',
    inAdministratorsTeam: true,
    adminCheckFails: false,
  },
  adminCheckFails: {
    id: '00000000-0000-4000-8000-0000000000d5',
    email: 'check-fails@example.com',
    token: 'token-admin-check-fails',
    role: 'admin',
    inAdministratorsTeam: false,
    adminCheckFails: true,
  },
}

const personaByToken = new Map(Object.values(PERSONAS).map((p) => [p.token, p]))
const personaById = new Map(Object.values(PERSONAS).map((p) => [p.id, p]))

/** The fake the mocked client factories hand out; swapped per harness. */
let activeFake: FakeSupabase | null = null

function requireActiveFake(): FakeSupabase {
  if (!activeFake) throw new Error('routeHarness: no harness is active')
  return activeFake
}

let modulesLoaded: Promise<LoadedModules> | null = null

interface LoadedModules {
  Fastify: typeof import('fastify').default
  authPlugin: typeof import('../middleware/auth.js').default
  errorHandlerPlugin: typeof import('../src/core/plugins/index.js').errorHandlerPlugin
  requestContextPlugin: typeof import('../src/core/plugins/index.js').requestContextPlugin
  routes: typeof import('../routes/index.js').default
}

/**
 * Import the API once per test file, after the Supabase factories are mocked.
 * The env schema exits the process when the Supabase settings are missing, so
 * they are set first.
 */
function loadModules(): Promise<LoadedModules> {
  modulesLoaded ??= (async () => {
    process.env.SUPABASE_URL ||= 'https://example.supabase.co'
    process.env.SUPABASE_KEY ||= 'test-anon-key'

    // Webhooks, Odoo and extensions call out over HTTP; nothing in a route test may.
    vi.stubGlobal('fetch', async (input: unknown) => {
      throw new Error(`routeHarness: network is disabled (fetch ${String(input)})`)
    })

    // Resolved relative to this file, as the routes' own import of it is.
    vi.doMock('../src/infrastructure/supabase.js', () => ({
      createSupabaseClient: (accessToken?: string) => {
        const fake = requireActiveFake()
        fake.actorId = accessToken ? (personaByToken.get(accessToken)?.id ?? null) : null
        fake.actorEmail = fake.actorId ? (personaById.get(fake.actorId)?.email ?? '') : ''
        return fake.client
      },
      createSupabaseAdminClient: () => requireActiveFake().client,
      checkDatabaseHealth: async () => ({ status: 'healthy' as const, latencyMs: 0 }),
    }))

    const [fastify, auth, plugins, routes] = await Promise.all([
      import('fastify'),
      import('../middleware/auth.js'),
      import('../src/core/plugins/index.js'),
      import('../routes/index.js'),
    ])
    return {
      Fastify: fastify.default,
      authPlugin: auth.default,
      errorHandlerPlugin: plugins.errorHandlerPlugin,
      requestContextPlugin: plugins.requestContextPlugin,
      routes: routes.default,
    }
  })()
  return modulesLoaded
}

/** `is_org_admin()` as core.sql defines it: role 'admin' or the Administrators team. */
function isOrgAdmin(db: FakeSupabase): boolean {
  const persona = db.actorId ? personaById.get(db.actorId) : undefined
  if (persona?.adminCheckFails) throw new Error('is_org_admin: simulated failure')
  const user = db.rows('app_user').find((row) => row.id === db.actorId)
  if (!user?.org_id) return false
  if (user.role === 'admin') return true
  const adminTeams = db
    .rows('team')
    .filter((team) => team.org_id === user.org_id && team.name === 'Administrators')
    .map((team) => team.id)
  return db.rows('team_member').some((m) => m.user_id === user.id && adminTeams.includes(m.team_id))
}

export interface RegisteredRoute {
  method: string
  url: string
  schema: RouteOptions['schema']
  /** Names of the preHandler functions, e.g. `checkTeamPermission`. */
  preHandlers: string[]
}

export interface HarnessInjectOptions {
  method: InjectOptions['method']
  url: string
  persona?: PersonaName
  /** Raw Authorization header; overrides `persona`. */
  authorization?: string
  payload?: InjectOptions['payload']
  query?: InjectOptions['query']
}

export interface RouteHarness {
  app: FastifyInstance
  fake: FakeSupabase
  routes: RegisteredRoute[]
  inject(options: HarnessInjectOptions): Promise<LightMyRequestResponse>
  /** Calls that changed something: writes, uploads, and RPCs other than the permission checks. */
  writes(): FakeCall[]
  close(): Promise<void>
}

const READ_ONLY_RPCS = new Set(['is_org_admin', 'has_team_permission'])

export async function createRouteHarness(): Promise<RouteHarness> {
  const modules = await loadModules()

  const fake = new FakeSupabase()
  defineFileRpcs(fake)
  // Overloaded in the generated types (a union), which the fake's schema reader does not parse.
  fake.defineRpc('is_org_admin', (_args, db) => isOrgAdmin(db), {
    untyped: !fake.schema.functions.has('is_org_admin'),
  })
  // Admins pass, as in SQL; no team grants are seeded, so everyone else is refused.
  fake.defineRpc('has_team_permission', (_args, db) => isOrgAdmin(db))

  fake.seed('organization', { id: ORG_ID, name: 'Acme', slug: 'acme' })
  fake.seed('vault', { id: VAULT_ID, org_id: ORG_ID, name: 'Main', slug: 'main' })
  fake.seed('team', { id: ADMINISTRATORS_TEAM_ID, org_id: ORG_ID, name: 'Administrators' })
  for (const persona of Object.values(PERSONAS)) {
    fake.seed('app_user', { id: persona.id, email: persona.email, role: persona.role, org_id: ORG_ID })
    if (persona.inAdministratorsTeam) {
      fake.seed('team_member', { team_id: ADMINISTRATORS_TEAM_ID, user_id: persona.id })
    }
  }
  activeFake = fake

  const app = modules.Fastify({ logger: false })
  const routes: RegisteredRoute[] = []
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method]
    const preHandler = route.preHandler
    const preHandlers = (Array.isArray(preHandler) ? preHandler : preHandler ? [preHandler] : []).map(
      (fn) => fn.name,
    )
    for (const method of methods) {
      if (method === 'HEAD') continue
      routes.push({ method, url: route.url, schema: route.schema, preHandlers })
    }
  })
  await app.register(modules.requestContextPlugin)
  await app.register(modules.errorHandlerPlugin)
  await app.register(modules.authPlugin)
  await app.register(modules.routes)
  await app.ready()

  return {
    app,
    fake,
    routes,
    inject: (options) => {
      const authorization =
        options.authorization ?? (options.persona ? `Bearer ${PERSONAS[options.persona].token}` : undefined)
      return app.inject({
        method: options.method,
        url: options.url,
        payload: options.payload,
        query: options.query,
        headers: authorization ? { authorization } : {},
      })
    },
    writes: () =>
      fake.calls.filter(
        (call) =>
          (call.kind === 'from' && call.op !== 'select') ||
          (call.kind === 'rpc' && !READ_ONLY_RPCS.has(call.name)) ||
          (call.kind === 'storage' && call.op === 'upload'),
      ),
    close: async () => {
      await app.close()
      if (activeFake === fake) activeFake = null
    },
  }
}

// ─── Requests that pass schema validation ────────────────────────────────────
//
// Fastify validates params, query and body before the preHandler runs, so a
// request that fails validation answers 400 without reaching authentication.
// The matrix has to send valid requests to see the auth answer at all; these
// build the smallest one each route's schema accepts.

export const SAMPLE_ID = '00000000-0000-4000-8000-00000000ffff'

interface JsonSchema {
  type?: string | string[]
  format?: string
  enum?: unknown[]
  const?: unknown
  default?: unknown
  minLength?: number
  minimum?: number
  minItems?: number
  required?: string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
}

export function sampleFromSchema(schema: JsonSchema | undefined): unknown {
  if (!schema) return undefined
  if (schema.const !== undefined) return schema.const
  if (schema.enum?.length) return schema.enum[0]
  const variant = schema.anyOf?.[0] ?? schema.oneOf?.[0]
  if (variant) return sampleFromSchema(variant)
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  switch (type) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const key of schema.required ?? []) out[key] = sampleFromSchema(schema.properties?.[key])
      return out
    }
    case 'array':
      return Array.from({ length: schema.minItems ?? 0 }, () => sampleFromSchema(schema.items))
    case 'integer':
    case 'number':
      return schema.minimum ?? 1
    case 'boolean':
      return true
    case 'string':
      switch (schema.format) {
        case 'uuid':
          return SAMPLE_ID
        case 'email':
          return 'someone@example.com'
        case 'date-time':
          return '2026-10-25T00:00:00.000Z'
        case 'date':
          return '2026-10-25'
        case 'uri':
          return 'https://example.com/hook'
        default:
          return 'x'.repeat(Math.max(1, schema.minLength ?? 1))
      }
    default:
      return schema.default ?? 'x'
  }
}

/** A URL for the route with every parameter filled, plus a valid query and body. */
export function sampleRequest(route: RegisteredRoute): {
  url: string
  query: Record<string, string>
  payload: InjectOptions['payload']
} {
  const schema = (route.schema ?? {}) as { params?: JsonSchema; querystring?: JsonSchema; body?: JsonSchema }
  const url = route.url
    .replace(/:([A-Za-z_]+)/g, (_match, name: string) => {
      const value = sampleFromSchema(schema.params?.properties?.[name])
      return typeof value === 'string' && value !== 'x' ? value : SAMPLE_ID
    })
    .replace(/\*$/, 'handler')
  const query: Record<string, string> = {}
  const querySample = sampleFromSchema(schema.querystring)
  if (querySample && typeof querySample === 'object') {
    for (const [key, value] of Object.entries(querySample)) query[key] = String(value)
  }
  return { url, query, payload: schema.body ? (sampleFromSchema(schema.body) as InjectOptions['payload']) : undefined }
}

export function routeKey(route: Pick<RegisteredRoute, 'method' | 'url'>): string {
  return `${route.method} ${route.url}`
}
