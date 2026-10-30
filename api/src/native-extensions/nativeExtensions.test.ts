/**
 * Native extension runtime: package verification, loading and /ext dispatch.
 *
 * The fixture extension is built here with JSZip (a tiny extension.json and
 * server/index.js), so nothing outside the repository is involved.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import JSZip from 'jszip'
import pino from 'pino'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'

type NativeModule = typeof import('./index.js')
type PackageModule = typeof import('./package.js')

let native: NativeModule
let pkg: PackageModule

beforeAll(async () => {
  // The modules reach the API env schema, which exits the process when the
  // Supabase settings are missing, so they cannot be imported at the top.
  process.env.SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.SUPABASE_KEY ||= 'test-anon-key'
  native = await import('./index.js')
  pkg = await import('./package.js')
})

const ORG_ID = '00000000-0000-0000-0000-0000000000c1'
const ORG_B = '00000000-0000-0000-0000-0000000000c2'
const ORG_OUTSIDE = '00000000-0000-0000-0000-0000000000c9'
const USER_ID = '00000000-0000-0000-0000-0000000000d1'
const EXT_ID = 'test.fixture'

const silent = pino({ level: 'silent' })
const roots: string[] = []

function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-native-test-'))
  roots.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true })
})

const SERVER_SOURCE = `
export function register(app) {
  app.route({
    method: 'GET',
    url: '/hello/:name',
    handler: (req) => ({ hello: req.params.name, org: req.user.org_id }),
  })
}
`

async function buildPackage(
  options: { id?: string; server?: string; extraEntries?: Record<string, string> } = {},
): Promise<{ bytes: Buffer; sha: string }> {
  const zip = new JSZip()
  zip.file(
    'extension.json',
    JSON.stringify({
      id: options.id ?? EXT_ID,
      version: '1.0.0',
      category: 'native',
      serverMain: 'server/index.js',
    }),
  )
  zip.file('server/index.js', options.server ?? SERVER_SOURCE)
  for (const [name, content] of Object.entries(options.extraEntries ?? {})) zip.file(name, content)
  const bytes = await zip.generateAsync({ type: 'nodebuffer' })
  return { bytes, sha: createHash('sha256').update(bytes).digest('hex') }
}

interface StubStore {
  rows: Array<{
    org_id: string
    extension_id: string
    package_sha256: string | null
    package_path: string | null
    installed_at: string | null
    manifest: unknown
  }>
  packages: Map<string, Buffer>
  orgInstalls: Map<string, { enabled: boolean; package_sha256: string | null }>
  downloads: string[]
  listedOrgs: string[][]
}

function createStubStore(): StubStore & import('./store.js').NativeExtensionStore {
  const state: StubStore = {
    rows: [],
    packages: new Map(),
    orgInstalls: new Map(),
    downloads: [],
    listedOrgs: [],
  }
  return Object.assign(state, {
    async listNativeInstalls(orgIds: readonly string[]) {
      state.listedOrgs.push([...orgIds])
      // Deliberately unfiltered: the runtime must not trust the store to filter.
      return state.rows
    },
    async downloadPackage(packagePath: string) {
      state.downloads.push(packagePath)
      const bytes = state.packages.get(packagePath)
      if (!bytes) throw new Error(`no package at ${packagePath}`)
      return bytes
    },
    async getOrgInstall(orgId: string, extensionId: string) {
      return state.orgInstalls.get(`${orgId}/${extensionId}`) ?? null
    },
  })
}

// ─── Package verification and extraction ─────────────────────────────────────

describe('package verification', () => {
  it('refuses bytes whose sha256 differs from the installed one, before extracting', async () => {
    const { bytes } = await buildPackage()
    const root = tempRoot()
    const wrongSha = 'a'.repeat(64)

    expect(() => pkg.verifyPackageBytes(bytes, wrongSha)).toThrow(pkg.PackageHashMismatchError)
    await expect(pkg.verifyAndExtractPackage(bytes, wrongSha, EXT_ID, root)).rejects.toBeInstanceOf(
      pkg.PackageHashMismatchError,
    )
    expect(fs.existsSync(path.join(root, wrongSha))).toBe(false)
  })

  it('extracts a verified package to <root>/<sha256> through the shared extractor', async () => {
    const { bytes, sha } = await buildPackage()
    const root = tempRoot()

    const extracted = await pkg.verifyAndExtractPackage(bytes, sha.toUpperCase(), EXT_ID, root)

    expect(extracted.dir).toBe(path.join(path.resolve(root), sha))
    expect(extracted.serverEntry).toBe(path.join(extracted.dir, 'server', 'index.js'))
    expect(fs.readFileSync(extracted.serverEntry, 'utf-8')).toBe(SERVER_SOURCE)
    // The module root that makes the .js entry load as ESM.
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).type).toBe('module')
  })

  it('refuses an entry that escapes the package folder (shared safeExtract)', async () => {
    const { bytes, sha } = await buildPackage({ extraEntries: { '../escape.js': 'x' } })
    const root = tempRoot()

    await expect(pkg.verifyAndExtractPackage(bytes, sha, EXT_ID, root)).rejects.toMatchObject({
      name: 'UnsafePackageError',
    })
    expect(fs.existsSync(path.join(root, sha))).toBe(false)
    expect(fs.existsSync(path.join(path.dirname(root), 'escape.js'))).toBe(false)
  })

  it('refuses a package whose manifest id is not the installed extension id', async () => {
    const { bytes, sha } = await buildPackage({ id: 'someone.else' })
    await expect(pkg.verifyAndExtractPackage(bytes, sha, EXT_ID, tempRoot())).rejects.toBeInstanceOf(
      pkg.InvalidPackageError,
    )
  })
})

// ─── Loader ──────────────────────────────────────────────────────────────────

describe('loader', () => {
  it('loads the latest install per extension, imports server/index.js and registers its routes', async () => {
    const store = createStubStore()
    const current = await buildPackage()
    store.packages.set('org/new.bpx', current.bytes)
    store.rows = [
      // An org outside NATIVE_EXTENSIONS_ORG_IDS: never loaded, whatever the store returns.
      {
        org_id: ORG_OUTSIDE,
        extension_id: EXT_ID,
        package_sha256: 'b'.repeat(64),
        package_path: 'org/old.bpx',
        installed_at: '2026-01-01T00:00:00Z',
        manifest: { serverMain: 'server/index.js' },
      },
      {
        org_id: ORG_ID,
        extension_id: EXT_ID,
        package_sha256: current.sha,
        package_path: 'org/new.bpx',
        installed_at: '2026-06-01T00:00:00Z',
        manifest: { serverMain: 'server/index.js' },
      },
    ]
    const runtime = new native.NativeExtensionRuntime({
      store,
      supabaseAdmin: {} as never,
      logger: silent,
      allowedOrgIds: [ORG_ID, ORG_B],
      extractRoot: tempRoot(),
    })

    const report = await runtime.reload()

    expect(report.failed).toEqual([])
    expect(report.loaded).toEqual([
      { orgId: ORG_ID, extensionId: EXT_ID, sha256: current.sha, version: '1.0.0', routes: 1, reused: false },
    ])
    expect(store.downloads).toEqual(['org/new.bpx'])
    expect(store.listedOrgs).toEqual([[ORG_ID, ORG_B]])
    expect(runtime.get(ORG_OUTSIDE, EXT_ID)).toBeUndefined()
    expect(runtime.get(ORG_ID, EXT_ID)?.routes.match('GET', '/hello/world')?.params).toEqual({ name: 'world' })

    // Same sha again: reused, not downloaded or imported again.
    const second = await runtime.reload()
    expect(second.loaded[0]).toMatchObject({ extensionId: EXT_ID, reused: true })
    expect(store.downloads).toEqual(['org/new.bpx'])

    // Disabled everywhere: dropped.
    store.rows = []
    const third = await runtime.reload()
    expect(third.unloaded).toEqual([`${ORG_ID}/${EXT_ID}`])
    expect(runtime.get(ORG_ID, EXT_ID)).toBeUndefined()
  })

  it('skips a package whose bytes do not match the recorded sha256, and keeps loading others', async () => {
    const store = createStubStore()
    const good = await buildPackage({ id: 'test.good' })
    const tampered = await buildPackage({ id: 'test.tampered' })
    store.packages.set('good.bpx', good.bytes)
    store.packages.set('tampered.bpx', tampered.bytes)
    store.rows = [
      {
        org_id: ORG_ID,
        extension_id: 'test.tampered',
        package_sha256: 'c'.repeat(64),
        package_path: 'tampered.bpx',
        installed_at: '2026-06-01T00:00:00Z',
        manifest: {},
      },
      {
        org_id: ORG_ID,
        extension_id: 'test.good',
        package_sha256: good.sha,
        package_path: 'good.bpx',
        installed_at: '2026-06-01T00:00:00Z',
        manifest: {},
      },
    ]
    const imported: string[] = []
    const runtime = new native.NativeExtensionRuntime({
      store,
      supabaseAdmin: {} as never,
      logger: silent,
      allowedOrgIds: [ORG_ID, ORG_B],
      extractRoot: tempRoot(),
      importModule: async (url) => {
        imported.push(url)
        return { register: () => {} }
      },
    })

    const report = await runtime.reload()

    expect(report.loaded.map((l) => l.extensionId)).toEqual(['test.good'])
    expect(report.failed).toHaveLength(1)
    expect(report.failed[0]).toMatchObject({ extensionId: 'test.tampered' })
    expect(report.failed[0].error).toMatch(/does not match/)
    expect(imported).toHaveLength(1)
    expect(imported[0]).toContain(good.sha)
    expect(runtime.get(ORG_ID, 'test.tampered')).toBeUndefined()
  })

  it('skips an extension whose register throws or which has no register export', async () => {
    const store = createStubStore()
    const a = await buildPackage({ id: 'test.throws' })
    const b = await buildPackage({ id: 'test.noexport' })
    store.packages.set('a.bpx', a.bytes)
    store.packages.set('b.bpx', b.bytes)
    store.rows = [
      { org_id: ORG_ID, extension_id: 'test.throws', package_sha256: a.sha, package_path: 'a.bpx', installed_at: null, manifest: {} },
      { org_id: ORG_ID, extension_id: 'test.noexport', package_sha256: b.sha, package_path: 'b.bpx', installed_at: null, manifest: {} },
    ]
    const runtime = new native.NativeExtensionRuntime({
      store,
      supabaseAdmin: {} as never,
      logger: silent,
      allowedOrgIds: [ORG_ID, ORG_B],
      extractRoot: tempRoot(),
      importModule: async (url) =>
        url.includes(a.sha)
          ? {
              register: () => {
                throw new Error('boom')
              },
            }
          : {},
    })

    const report = await runtime.reload()

    expect(report.loaded).toEqual([])
    expect(report.failed.map((f) => f.extensionId).sort()).toEqual(['test.noexport', 'test.throws'])
  })

  it('keeps the loaded set when the install list cannot be read', async () => {
    const store = createStubStore()
    const runtime = new native.NativeExtensionRuntime({
      store: {
        ...store,
        listNativeInstalls: async () => {
          throw new Error('db down')
        },
      },
      supabaseAdmin: {} as never,
      logger: silent,
      allowedOrgIds: [ORG_ID, ORG_B],
      extractRoot: tempRoot(),
    })
    const report = await runtime.reload()
    expect(report.error).toBe('db down')
  })

  it('the default store reads enabled native installs with a serverMain, with the service-role client', async () => {
    const calls: Array<[string, ...unknown[]]> = []
    const builder = {
      select: (...args: unknown[]) => (calls.push(['select', ...args]), builder),
      eq: (...args: unknown[]) => (calls.push(['eq', ...args]), builder),
      in: (...args: unknown[]) => (calls.push(['in', ...args]), builder),
      not: (...args: unknown[]) => (calls.push(['not', ...args]), builder),
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
    }
    const admin = {
      from: (table: string) => (calls.push(['from', table]), builder),
    }
    const store = native.createSupabaseNativeExtensionStore(admin as never)
    expect(await store.listNativeInstalls([])).toEqual([])
    expect(calls).toEqual([])
    await store.listNativeInstalls([ORG_ID])
    expect(calls).toEqual([
      ['from', 'org_installed_extension'],
      ['select', 'org_id, extension_id, package_sha256, package_path, installed_at, manifest'],
      ['in', 'org_id', [ORG_ID]],
      ['eq', 'is_enabled', true],
      ['eq', 'category', 'native'],
      ['not', 'manifest->>serverMain', 'is', null],
    ])
  })
})

// ─── Operator allowlist and per-org isolation ────────────────────────────────

describe('NATIVE_EXTENSIONS_ORG_IDS', () => {
  it('parses comma-separated UUIDs, lowercases and de-duplicates them', () => {
    expect(native.parseNativeExtensionOrgIds(undefined)).toEqual([])
    expect(native.parseNativeExtensionOrgIds('  ')).toEqual([])
    expect(native.parseNativeExtensionOrgIds(` ${ORG_ID.toUpperCase()}, ${ORG_B},${ORG_ID} `)).toEqual([
      ORG_ID,
      ORG_B,
    ])
  })

  it('refuses anything that is not a UUID', () => {
    expect(() => native.parseNativeExtensionOrgIds(`${ORG_ID},*`)).toThrow(/UUID/)
    expect(() => native.parseNativeExtensionOrgIds('all')).toThrow(/UUID/)
  })

  it('loads nothing, and reads nothing, when the list is empty', async () => {
    const store = createStubStore()
    const built = await buildPackage()
    store.packages.set('p.bpx', built.bytes)
    store.rows = [
      { org_id: ORG_ID, extension_id: EXT_ID, package_sha256: built.sha, package_path: 'p.bpx', installed_at: null, manifest: {} },
    ]
    const runtime = new native.NativeExtensionRuntime({
      store,
      supabaseAdmin: {} as never,
      logger: silent,
      allowedOrgIds: [],
      extractRoot: tempRoot(),
      importModule: async () => ({ register: () => {} }),
    })
    const report = await runtime.reload()
    expect(runtime.enabled).toBe(false)
    expect(report.loaded).toEqual([])
    expect(store.listedOrgs).toEqual([])
    expect(store.downloads).toEqual([])
  })

  it('keeps two allowed orgs apart: own module instance, own sha, reload of one leaves the other', async () => {
    const store = createStubStore()
    const v1 = await buildPackage()
    const v2 = await buildPackage({ server: SERVER_SOURCE + '\n// v2\n' })
    store.packages.set('a.bpx', v1.bytes)
    store.packages.set('b.bpx', v2.bytes)
    store.rows = [
      { org_id: ORG_ID, extension_id: EXT_ID, package_sha256: v1.sha, package_path: 'a.bpx', installed_at: null, manifest: {} },
      { org_id: ORG_B, extension_id: EXT_ID, package_sha256: v2.sha, package_path: 'b.bpx', installed_at: null, manifest: {} },
    ]
    const imported: string[] = []
    const runtime = new native.NativeExtensionRuntime({
      store,
      supabaseAdmin: {} as never,
      logger: silent,
      allowedOrgIds: [ORG_ID, ORG_B],
      extractRoot: tempRoot(),
      importModule: async (url) => {
        imported.push(url)
        return { register: () => {} }
      },
    })
    await runtime.reload()
    expect(runtime.get(ORG_ID, EXT_ID)?.sha256).toBe(v1.sha)
    expect(runtime.get(ORG_B, EXT_ID)?.sha256).toBe(v2.sha)
    expect(imported.some((u) => u.includes(ORG_ID) && u.includes(v1.sha))).toBe(true)
    expect(imported.some((u) => u.includes(ORG_B) && u.includes(v2.sha))).toBe(true)

    // Reloading org B with B's install gone drops only B.
    store.rows = store.rows.filter((r) => r.org_id === ORG_ID)
    const report = await runtime.reload(ORG_B)
    expect(store.listedOrgs.at(-1)).toEqual([ORG_B])
    expect(report.unloaded).toEqual([`${ORG_B}/${EXT_ID}`])
    expect(runtime.get(ORG_ID, EXT_ID)?.sha256).toBe(v1.sha)

    // An org outside the list cannot be reloaded into.
    const refused = await runtime.reload(ORG_OUTSIDE)
    expect(refused.error).toMatch(/not enabled/)
  })

  it('creates a private 0700 extraction directory', () => {
    const base = tempRoot()
    const dir = native.createPrivateExtractRoot(base)
    expect(path.dirname(dir)).toBe(base)
    if (process.platform !== 'win32') {
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700)
    }
  })
})

// ─── /ext dispatch ───────────────────────────────────────────────────────────

describe('/ext dispatch', () => {
  let store: ReturnType<typeof createStubStore>
  let sha: string
  let permissionAnswer: boolean
  let permissionCalls: Array<Record<string, unknown>>
  let app: FastifyInstance
  let callerOrg: string
  let callerIsAdmin: boolean
  let reloads: Array<string | undefined>

  const fixtureModule = {
    register(extensionApp: import('./types.js').ExtensionServerApp) {
      extensionApp.route({
        method: 'GET',
        url: '/hello/:name',
        handler: (req: FastifyRequest) => ({ params: req.params, org: req.user?.org_id }),
      })
      extensionApp.route({
        method: 'POST',
        url: '/guarded',
        permission: ['module:test', 'edit'],
        handler: () => ({ ok: true }),
      })
      extensionApp.route({
        method: 'GET',
        url: '/boom',
        handler: () => {
          throw new Error('handler exploded')
        },
      })
      extensionApp.route({
        method: 'GET',
        url: '/slow',
        timeoutMs: 50,
        handler: () => new Promise((resolve) => setTimeout(() => resolve({ late: true }), 500)),
      })
      extensionApp.route({
        method: 'GET',
        url: '/created',
        handler: (_req: FastifyRequest, reply: FastifyReply) => reply.code(201).send({ created: true }),
      })
    },
  }

  beforeEach(async () => {
    store = createStubStore()
    const built = await buildPackage()
    sha = built.sha
    store.packages.set('fixture.bpx', built.bytes)
    store.rows = [
      { org_id: ORG_ID, extension_id: EXT_ID, package_sha256: sha, package_path: 'fixture.bpx', installed_at: null, manifest: {} },
    ]
    store.orgInstalls.set(`${ORG_ID}/${EXT_ID}`, { enabled: true, package_sha256: sha })
    permissionAnswer = true
    permissionCalls = []
    callerOrg = ORG_ID
    callerIsAdmin = false
    reloads = []

    const runtime = new native.NativeExtensionRuntime({
      store,
      supabaseAdmin: {} as never,
      logger: silent,
      allowedOrgIds: [ORG_ID, ORG_B],
      extractRoot: tempRoot(),
      importModule: async () => fixtureModule,
    })

    app = Fastify({ logger: false })
    app.decorateRequest('user', null)
    app.decorateRequest('supabase', null)
    app.decorateRequest('accessToken', null)
    // Stands in for core's auth: same 401 shape, then user + RLS client.
    app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.headers.authorization !== 'Bearer ok') {
        reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' })
        throw new Error('Auth: Missing header')
      }
      request.user = {
        id: USER_ID,
        email: 'someone@example.com',
        full_name: null,
        role: 'engineer',
        org_id: callerOrg,
        isAdmin: callerIsAdmin,
      }
      request.supabase = {
        rpc: async (fn: string, args: Record<string, unknown>) => {
          permissionCalls.push({ fn, ...args })
          return { data: permissionAnswer, error: null }
        },
      } as unknown as NonNullable<FastifyRequest['supabase']>
    })
    const originalReload = runtime.reload.bind(runtime)
    runtime.reload = (orgId?: string) => {
      reloads.push(orgId)
      return originalReload(orgId)
    }
    await app.register(native.nativeExtensionRoutes, { runtime, autoLoad: false })
    await app.ready()
    await runtime.start()
    reloads = []
  })

  const get = (url: string, auth = true) =>
    app.inject({ method: 'GET', url, headers: auth ? { authorization: 'Bearer ok' } : {} })

  it('answers a registered route with the sub-route params and the caller', async () => {
    const res = await get(`/ext/${EXT_ID}/hello/world`)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ params: { name: 'world' }, org: ORG_ID })
  })

  it('passes through a status the handler set on the reply', async () => {
    const res = await get(`/ext/${EXT_ID}/created`)
    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ created: true })
  })

  it('refuses an unauthenticated request with 401', async () => {
    const res = await get(`/ext/${EXT_ID}/hello/world`, false)
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: 'UNAUTHORIZED' })
  })

  it('answers 403 in core shape when the route permission is denied', async () => {
    permissionAnswer = false
    const res = await app.inject({ method: 'POST', url: `/ext/${EXT_ID}/guarded`, headers: { authorization: 'Bearer ok' } })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: 'FORBIDDEN', message: "Requires 'edit' permission on 'module:test'" })
    expect(permissionCalls).toEqual([{ fn: 'has_team_permission', p_resource: 'module:test', p_action: 'edit' }])

    permissionAnswer = true
    const allowed = await app.inject({ method: 'POST', url: `/ext/${EXT_ID}/guarded`, headers: { authorization: 'Bearer ok' } })
    expect(allowed.statusCode).toBe(200)
  })

  it('answers 404 for an extension that is not loaded', async () => {
    const res = await get('/ext/not.loaded/hello/world')
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ error: 'NOT_FOUND' })
  })

  it("answers 404 when the caller's org has no enabled install", async () => {
    store.orgInstalls.set(`${ORG_ID}/${EXT_ID}`, { enabled: false, package_sha256: sha })
    expect((await get(`/ext/${EXT_ID}/hello/world`)).statusCode).toBe(404)
    store.orgInstalls.delete(`${ORG_ID}/${EXT_ID}`)
    expect((await get(`/ext/${EXT_ID}/hello/world`)).statusCode).toBe(404)
  })

  it("answers an unknown sub-route exactly like core's not-found handler", async () => {
    const res = await get(`/ext/${EXT_ID}/no/such/route`)
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'NOT_FOUND', message: 'Endpoint not found' })
    const root = await get(`/ext/${EXT_ID}`)
    expect(root.json()).toEqual({ error: 'NOT_FOUND', message: 'Endpoint not found' })
  })

  it("answers 409 EXTENSION_VERSION_MISMATCH when the org's sha256 differs from the loaded one", async () => {
    store.orgInstalls.set(`${ORG_ID}/${EXT_ID}`, { enabled: true, package_sha256: 'd'.repeat(64) })
    const res = await get(`/ext/${EXT_ID}/hello/world`)
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: 'EXTENSION_VERSION_MISMATCH' })
  })

  it('answers a thrown handler error with 500 INTERNAL_ERROR', async () => {
    const res = await get(`/ext/${EXT_ID}/boom`)
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'INTERNAL_ERROR', message: 'Internal server error' })
  })

  it('answers 504 when a handler runs past its timeoutMs', async () => {
    const res = await get(`/ext/${EXT_ID}/slow`)
    expect(res.statusCode).toBe(504)
    expect(res.json()).toMatchObject({ error: 'EXTENSION_TIMEOUT' })
  })

  it('reload is admin only', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/extensions/reload', headers: { authorization: 'Bearer ok' } })
    expect(res.statusCode).toBe(403)
    expect(reloads).toEqual([])
  })

  it("reload acts only on the admin's own org, and only when that org is allowed", async () => {
    callerIsAdmin = true
    const res = await app.inject({ method: 'POST', url: '/admin/extensions/reload', headers: { authorization: 'Bearer ok' } })
    expect(res.statusCode).toBe(200)
    expect(reloads).toEqual([ORG_ID])

    callerOrg = ORG_OUTSIDE
    const refused = await app.inject({ method: 'POST', url: '/admin/extensions/reload', headers: { authorization: 'Bearer ok' } })
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toMatchObject({ error: 'NATIVE_EXTENSIONS_DISABLED' })
    expect(reloads).toEqual([ORG_ID])
  })

  it('answers 403 NATIVE_EXTENSIONS_DISABLED for an org outside the allowlist', async () => {
    callerOrg = ORG_OUTSIDE
    store.orgInstalls.set(`${ORG_OUTSIDE}/${EXT_ID}`, { enabled: true, package_sha256: sha })
    const res = await get(`/ext/${EXT_ID}/hello/world`)
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: 'NATIVE_EXTENSIONS_DISABLED' })
  })

  it("does not serve one allowed org another org's loaded extension", async () => {
    callerOrg = ORG_B
    store.orgInstalls.set(`${ORG_B}/${EXT_ID}`, { enabled: true, package_sha256: sha })
    const res = await get(`/ext/${EXT_ID}/hello/world`)
    expect(res.statusCode).toBe(404)
  })

  it('answers 503 NATIVE_EXTENSIONS_DISABLED when the server allows no org', async () => {
    const disabled = Fastify({ logger: false })
    disabled.decorateRequest('user', null)
    disabled.decorate('authenticate', async (request: FastifyRequest) => {
      request.user = {
        id: USER_ID,
        email: 'someone@example.com',
        full_name: null,
        role: 'admin',
        org_id: ORG_ID,
        isAdmin: true,
      }
    })
    const runtime = new native.NativeExtensionRuntime({
      store: createStubStore(),
      supabaseAdmin: {} as never,
      logger: silent,
      allowedOrgIds: [],
      extractRoot: tempRoot(),
    })
    await disabled.register(native.nativeExtensionRoutes, { runtime, autoLoad: false })
    await disabled.ready()
    const res = await disabled.inject({ method: 'GET', url: `/ext/${EXT_ID}/hello/world` })
    expect(res.statusCode).toBe(503)
    expect(res.json().message).toMatch(/NATIVE_EXTENSIONS_ORG_IDS/)
    const reload = await disabled.inject({ method: 'POST', url: '/admin/extensions/reload' })
    expect(reload.statusCode).toBe(503)
    await disabled.close()
  })
})
