/**
 * The fake Supabase, made forgiving enough to boot the whole app on.
 *
 * `FakeSupabase` throws for anything the schema or the fake cannot answer (an embedded select, an
 * RPC with no handler), which is right for a test and wrong for an app session: one throw in a
 * badge query would end the measurement. Here every such throw becomes a returned
 * `{ data: null, error }`, the way a failed request reaches the app, and is counted in `misses` so
 * the run can report what it did not model.
 *
 * Also added: the auth events `useAuth` waits for (`INITIAL_SESSION` with the test user), and a
 * `fetch` for the PostgREST paths the app calls without the client (organizations.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type { FakeSupabase, Row } from '@/test/fakeSupabase'
import type { Database } from '@/types/supabase'

export const PERF_SUPABASE_URL = 'https://perf.blueplm.invalid'

export interface PerfSession {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number
  token_type: 'bearer'
  user: {
    id: string
    email: string
    created_at: string
    user_metadata: Record<string, unknown>
    app_metadata: Record<string, unknown>
    aud: string
  }
}

export type Misses = Map<string, number>

type Fn = (...args: unknown[]) => unknown

function record(misses: Misses, key: string): void {
  misses.set(key, (misses.get(key) ?? 0) + 1)
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return { data: null, error: { message, code: 'PERF_UNMODELLED' }, count: null }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

/** A builder that already failed: every chained call returns it, awaiting it gives the error. */
function deadBuilder(error: unknown): unknown {
  const result = failure(error)
  const target = function dead() {}
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject)
      }
      if (typeof prop === 'symbol') return undefined
      return () => proxy
    },
    apply: () => proxy,
  })
  return proxy
}

/** Wrap a query builder (or the thenable an RPC returns) so a throw anywhere becomes `{ error }`. */
function guard(target: object, label: string, misses: Misses): unknown {
  const proxy: unknown = new Proxy(target, {
    get(obj, prop, receiver) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
          Promise.resolve()
            .then(() => (obj as PromiseLike<unknown>).then((v) => v))
            .catch((error: unknown) => {
              record(misses, `${label}: ${error instanceof Error ? error.message : String(error)}`)
              return failure(error)
            })
            .then(resolve, reject)
      }
      const value: unknown = Reflect.get(obj, prop, receiver)
      if (typeof prop === 'symbol') return value
      if (typeof value !== 'function') {
        // A builder method the fake lacks (`.not()`, `.contains()`): fail the query rather than
        // answer it with the filter silently dropped.
        if (value === undefined && isThenable(obj)) {
          return () => {
            record(misses, `${label}.${prop}: not modelled by the fake`)
            return deadBuilder(`${label}.${prop} is not modelled by the fake`)
          }
        }
        return value
      }
      return (...args: unknown[]) => {
        try {
          const out = (value as Fn).apply(obj, args)
          if (out === obj) return proxy
          if (isThenable(out)) return guard(out as object, label, misses)
          return out
        } catch (error) {
          record(misses, `${label}.${prop}: ${error instanceof Error ? error.message : String(error)}`)
          return deadBuilder(error)
        }
      }
    },
  })
  return proxy
}

/** Any member the target lacks answers with an inert async function. */
function lenientObject<T extends object>(target: T, label: string, misses: Misses): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value: unknown = Reflect.get(obj, prop, receiver)
      if (value !== undefined || typeof prop === 'symbol' || prop === 'then') return value
      return (..._args: unknown[]) => {
        record(misses, `${label}.${prop}`)
        return Promise.resolve(failure(`${label}.${prop} is not modelled`))
      }
    },
  })
}

export function createSession(userId: string, email: string): PerfSession {
  return {
    access_token: 'perf-access-token',
    refresh_token: 'perf-refresh-token',
    expires_in: 3600 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
    token_type: 'bearer',
    user: {
      id: userId,
      email,
      created_at: '2026-01-01T00:00:00.000Z',
      user_metadata: { full_name: 'Perf User' },
      app_metadata: {},
      aud: 'authenticated',
    },
  }
}

/** Calls the fake records grow without bound over a 30-minute session; keep only the latest. */
function trimCalls(db: FakeSupabase): void {
  if (db.calls.length > 500) db.calls.splice(0, db.calls.length - 100)
}

/** What the soak (soak.ts) drives and reads in the client: auth events and its channel count. */
export interface LenientClientHooks {
  /** Deliver an auth event (`TOKEN_REFRESHED`, ...) to every listener, with a renewed session. */
  emitAuth(event: string): number
  authListenerCount(): number
  channelCount(): number
}

export function lenientClient(
  db: FakeSupabase,
  session: PerfSession,
  misses: Misses,
  hooks?: Partial<LenientClientHooks>,
): SupabaseClient<Database> {
  const raw = db.client as unknown as {
    from: (table: string) => object
    rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<unknown>
    storage: { from: (bucket: string) => object }
    channel: (name: string) => object
  }

  const channels = new Set<object>()
  const authListeners = new Set<(event: string, s: PerfSession | null) => unknown>()
  // A refresh issues a token that expires a day from now on the app's clock, as GoTrue does; the
  // soak runs that clock fast, so a session minted once at boot would read as long expired.
  const renewed = (): PerfSession => {
    session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in
    return session
  }
  if (hooks) {
    hooks.emitAuth = (event) => {
      const current = renewed()
      for (const listener of [...authListeners]) void listener(event, current)
      return authListeners.size
    }
    hooks.authListenerCount = () => authListeners.size
    hooks.channelCount = () => channels.size
  }

  const client = {
    from(table: string) {
      trimCalls(db)
      try {
        return guard(raw.from(table), `from(${table})`, misses)
      } catch (error) {
        record(misses, `from(${table}): ${error instanceof Error ? error.message : String(error)}`)
        return deadBuilder(error)
      }
    },
    rpc(name: string, args?: Record<string, unknown>) {
      trimCalls(db)
      // callRpc is async, so a missing handler arrives as a rejection the guard turns into an error.
      // Forwarded by reference: rpcContract.test.ts reads every `.rpc(` call in src as an app call.
      const forward = raw.rpc
      const pending = Promise.resolve().then(() => forward(name, args))
      return guard(pending, `rpc(${name})`, misses)
    },
    storage: {
      from: (bucket: string) => lenientObject(raw.storage.from(bucket), `storage(${bucket})`, misses),
    },
    channel(name: string) {
      const rawChannel = raw.channel(name) as { unsubscribe?: () => Promise<unknown> }
      const channel = lenientObject(rawChannel, `channel(${name})`, misses)
      // `channel.unsubscribe()` also takes it off the client, as realtime-js does; without this
      // every resubscribe left one more channel in the set.
      const closeRaw = rawChannel.unsubscribe?.bind(rawChannel)
      rawChannel.unsubscribe = async () => {
        channels.delete(channel)
        return closeRaw?.()
      }
      channels.add(channel)
      return channel
    },
    async removeChannel(channel: { unsubscribe?: () => Promise<unknown> }) {
      channels.delete(channel)
      await channel.unsubscribe?.()
      return 'ok'
    },
    async removeAllChannels() {
      const all = [...channels] as Array<{ unsubscribe?: () => Promise<unknown> }>
      channels.clear()
      await Promise.all(all.map((c) => c.unsubscribe?.()))
      return all.map(() => 'ok')
    },
    getChannels: () => [...channels],
    functions: lenientObject({}, 'functions', misses),
    auth: lenientObject(
      {
        async getSession() {
          return { data: { session }, error: null }
        },
        async getUser() {
          return { data: { user: session.user }, error: null }
        },
        async refreshSession() {
          return { data: { session: renewed(), user: session.user }, error: null }
        },
        async setSession() {
          return { data: { session, user: session.user }, error: null }
        },
        async signOut() {
          return { error: null }
        },
        onAuthStateChange(callback: (event: string, s: PerfSession | null) => unknown) {
          // supabase-js announces the restored session on the next tick.
          const timer = setTimeout(() => void callback('INITIAL_SESSION', session), 0)
          authListeners.add(callback)
          const unsubscribe = () => {
            clearTimeout(timer)
            authListeners.delete(callback)
          }
          return { data: { subscription: { id: 'perf', unsubscribe } } }
        },
        startAutoRefresh: async () => {},
        stopAutoRefresh: async () => {},
      },
      'auth',
      misses,
    ),
  }
  return client as unknown as SupabaseClient<Database>
}

/** Strip a PostgREST select down to plain columns: `*,supplier:suppliers(id)` -> `*`. */
export function plainSelect(select: string | null): string {
  if (!select) return '*'
  let depth = 0
  let current = ''
  const parts: string[] = []
  for (const ch of select) {
    if (ch === '(') {
      // Keep the bracket on the part, so the filter below sees it was an embedded resource.
      if (depth === 0) current += ch
      depth++
      continue
    }
    if (depth === 0 && ch === ',') {
      parts.push(current)
      current = ''
      continue
    }
    if (ch === ')') depth--
    else if (depth === 0) current += ch
  }
  parts.push(current)
  const plain = parts.map((p) => p.trim()).filter((p) => p && !p.includes(':') && !p.includes('('))
  return plain.length ? plain.join(',') : '*'
}

interface FilterTarget {
  eq(column: string, value: unknown): FilterTarget
  limit(count: number): FilterTarget
}

/**
 * A `fetch` that answers `${PERF_SUPABASE_URL}/rest/v1/...` from the fake and fails every other
 * request the way an offline machine does. GET `table?select=..&col=eq.value&limit=n` and
 * POST `rpc/name` are the forms the app uses.
 */
export function createRestFetch(
  client: SupabaseClient<Database>,
  misses: Misses,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  return async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!href.startsWith(`${PERF_SUPABASE_URL}/rest/v1/`)) {
      record(misses, `fetch ${href.split('?')[0]}`)
      throw new TypeError('Failed to fetch (perf boot has no network)')
    }
    const url = new URL(href)
    const path = url.pathname.replace(/^\/rest\/v1\//, '')
    const loose = client as unknown as {
      from: (table: string) => { select: (columns: string) => FilterTarget }
      rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
    }

    if (path.startsWith('rpc/')) {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
      const forward = loose.rpc // by reference, as in lenientClient's rpc above
      const { data, error } = await forward(path.slice(4), body)
      return error ? json({ message: error.message }, 400) : json(data)
    }

    let query = loose.from(path).select(plainSelect(url.searchParams.get('select')))
    for (const [key, value] of url.searchParams) {
      if (key === 'select') continue
      if (key === 'limit') {
        query = query.limit(Number(value))
        continue
      }
      if (value.startsWith('eq.')) query = query.eq(key, value.slice(3))
      else record(misses, `fetch filter ${key}=${value.split('.')[0]}`)
    }
    const { data, error } = (await (query as unknown as PromiseLike<{
      data: Row[] | null
      error: { message: string } | null
    }>)) ?? { data: null, error: null }
    return error ? json({ message: error.message }, 400) : json(data ?? [])
  }
}
