/**
 * request.user.isAdmin: admin means users.role = 'admin' OR membership of the
 * Administrators team.
 *
 * Every admin-only route used to test `role !== 'admin'`, so a member of the
 * Administrators team whose role column said engineer or viewer was refused.
 * The middleware now asks is_org_admin() - the function the RLS policies use -
 * and the routes gate on the answer. These tests pin that the middleware passes
 * the database's answer through unchanged, and fails closed when it cannot get
 * one.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

const USER_ID = '00000000-0000-0000-0000-0000000000d1'
const ORG_ID = '00000000-0000-0000-0000-0000000000c1'

interface RpcAnswer {
  data: unknown
  error: { message: string } | null
}

/** Role column of the signed-in user. */
let profileRole: 'admin' | 'engineer' | 'viewer' = 'engineer'
/** What is_org_admin() answers. */
let adminAnswer: RpcAnswer = { data: false, error: null }
/** RPC names the middleware called. */
let rpcCalls: string[] = []

vi.mock('../src/infrastructure/supabase.js', () => ({
  createSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: USER_ID,
              email: 'user@example.com',
              role: profileRole,
              org_id: ORG_ID,
              full_name: 'Test User',
            },
            error: null,
          }),
        }),
      }),
    }),
    rpc: async (name: string) => {
      rpcCalls.push(name)
      return adminAnswer
    },
  }),
}))

let authPlugin: typeof import('./auth.js').default

beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.SUPABASE_KEY ||= 'test-anon-key'
  authPlugin = (await import('./auth.js')).default
})

beforeEach(() => {
  profileRole = 'engineer'
  adminAnswer = { data: false, error: null }
  rpcCalls = []
})

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(authPlugin)
  app.get('/whoami', { preHandler: app.authenticate }, async (request) => ({
    role: request.user?.role,
    isAdmin: request.user?.isAdmin,
  }))
  await app.ready()
  return app
}

async function whoami(app: FastifyInstance) {
  const response = await app.inject({
    method: 'GET',
    url: '/whoami',
    headers: { authorization: 'Bearer test-token' },
  })
  return response.json() as { role: string; isAdmin: boolean }
}

describe('auth middleware isAdmin', () => {
  it('is true for an Administrators-team member whose role column is not admin', async () => {
    profileRole = 'engineer'
    adminAnswer = { data: true, error: null }

    const app = await buildApp()
    const body = await whoami(app)

    expect(body).toEqual({ role: 'engineer', isAdmin: true })
    expect(rpcCalls).toEqual(['is_org_admin'])
  })

  it('is false for a user the database does not call an admin', async () => {
    profileRole = 'viewer'
    adminAnswer = { data: false, error: null }

    const app = await buildApp()

    expect(await whoami(app)).toEqual({ role: 'viewer', isAdmin: false })
  })

  it('fails closed when the admin check errors, even for the admin role', async () => {
    profileRole = 'admin'
    adminAnswer = { data: null, error: { message: 'boom' } }

    const app = await buildApp()

    expect(await whoami(app)).toEqual({ role: 'admin', isAdmin: false })
  })

  it('does not treat a non-boolean answer as admin', async () => {
    adminAnswer = { data: 'true', error: null }

    const app = await buildApp()

    expect((await whoami(app)).isAdmin).toBe(false)
  })
})
