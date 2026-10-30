/**
 * One server shared by every simulated machine: the typed in-memory Supabase (fakeSupabase.ts,
 * with the file RPCs ported from 10-source-files.sql) plus a change feed into the realtime
 * network.
 *
 * What it enforces is what the real server enforces on these paths, no more:
 * - `checkout_file` / `checkin_file` / `move_file` refuse a file someone else holds, and check-in
 *   bumps the version (the RPC ports);
 * - the partial unique index on `files (vault_id, lower(file_path))` (23505);
 * - nothing on a plain `.from('files').update()`: the RLS policy on UPDATE checks the org and
 *   the user's edit permission, not who holds the checkout. A client writing over another
 *   user's checkout through a table update is not refused, here or in production.
 *
 * Each machine gets its own client (`connect`), which acts as that machine's user: RPCs run with
 * `current_actor_id()` = that user, `auth.getUser()` answers with it, and realtime channels open
 * on that machine's link. After every query and RPC the server diffs the published tables and
 * publishes one event per changed row.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/supabase'

import { FakeSupabase, FakeSupabaseMisuse, type Row, type RowOf, type TableName } from '../fakeSupabase'
import { defineFileRpcs } from '../fakeSupabaseRpcs'
import type { MachineLink } from './network'
import { RealtimeNetwork } from './network'
import { TOMBSTONE_TABLES } from '@/lib/realtimeTombstones'
import { defineMultiMachineRpcs } from './serverRpcs'

export const ORG_ID = 'org-1'
export const VAULT_ID = 'vault-1'

/** Tables in the `supabase_realtime` publication that the app subscribes to. */
const PUBLISHED: TableName[] = ['file', 'folder', 'activity', 'organization', 'vault']

export interface SimUser {
  id: string
  email: string
  full_name: string
}

export class SharedServer {
  readonly db = new FakeSupabase()
  readonly network = new RealtimeNetwork()
  /**
   * Queries and RPCs the fake could not answer. The app catches most errors and carries on, so
   * these are collected here and fail the step (World) instead of vanishing into a log line.
   */
  readonly misuses: Error[] = []
  private snapshot = new Map<TableName, Map<string, { json: string; row: Row }>>()

  constructor() {
    // The server stamps rows with the simulation's clock (fake timers move Date).
    Object.defineProperty(this.db, 'now', { get: () => Date.now(), set: () => {}, configurable: true })
    defineFileRpcs(this.db)
    defineMultiMachineRpcs(this.db)
    this.db.defineRpc('user_vault_access_list', (_args, fake) =>
      fake.rows('vault').map((v) => ({ vault_id: v.id })),
    )
    this.db.seed('organization', {
      id: ORG_ID,
      name: 'Test Org',
      slug: 'test-org',
      serialization_settings: {} as RowOf<'organization'>['serialization_settings'],
    })
    this.db.seed('vault', { id: VAULT_ID, org_id: ORG_ID, name: 'Main', slug: 'main' } as RowOf<'vault'>)
    this.takeSnapshot()
  }

  addUser(user: SimUser): void {
    if (this.db.rows('app_user').some((u) => u.id === user.id)) return
    this.db.seed('app_user', { ...user, org_id: ORG_ID, role: 'engineer' } as RowOf<'app_user'>)
    this.takeSnapshot()
  }

  private takeSnapshot(): void {
    for (const table of PUBLISHED) {
      const rows = new Map<string, { json: string; row: Row }>()
      for (const row of this.db.rows(table)) {
        rows.set(String(row.id), { json: JSON.stringify(row), row: structuredClone(row) })
      }
      this.snapshot.set(table, rows)
    }
  }

  private tombstoneSeq = 0

  /** Publish every change since the last call: what Postgres would have sent, row by row. */
  publishChanges(): void {
    const events: Parameters<RealtimeNetwork['publish']>[0] = []
    const commit_timestamp = new Date(Date.now()).toISOString()
    for (const table of PUBLISHED) {
      const before = this.snapshot.get(table) ?? new Map()
      const seen = new Set<string>()
      for (const row of this.db.rows(table)) {
        const id = String(row.id)
        seen.add(id)
        const previous = before.get(id)
        const json = JSON.stringify(row)
        if (!previous) events.push({ table, eventType: 'INSERT', new: structuredClone(row), old: {}, commit_timestamp })
        else if (previous.json !== json) {
          events.push({ table, eventType: 'UPDATE', new: structuredClone(row), old: previous.row, commit_timestamp })
        }
      }
      for (const [id, previous] of before) {
        // Schema 502: the publication sends no DELETE; a deleted row of a tombstone table arrives
        // as a realtime_tombstone insert, as it does from Supabase.
        if (!seen.has(id) && (TOMBSTONE_TABLES as readonly string[]).includes(table)) {
          const old = previous.row
          events.push({
            table: 'realtime_tombstone',
            eventType: 'INSERT',
            new: {
              id: ++this.tombstoneSeq,
              org_id: old.org_id ?? null,
              table_name: table,
              row_id: id,
              vault_id: old.vault_id ?? null,
              subject_user_id: old.user_id ?? null,
              created_at: commit_timestamp,
            },
            old: {},
            commit_timestamp,
          })
        }
      }
    }
    this.takeSnapshot()
    if (events.length > 0) this.network.publish(events)
  }

  /**
   * Change the server directly, as another client or an admin would, and publish the result.
   * For a scenario's "someone else" when a full machine is more than the step needs.
   */
  write(fn: (db: FakeSupabase) => void, actorId?: string): void {
    const previous = this.db.actorId
    if (actorId) this.db.actorId = actorId
    try {
      fn(this.db)
    } finally {
      this.db.actorId = previous
    }
    this.publishChanges()
  }

  /** A client acting as `user`, with realtime on `link`. */
  connect(user: SimUser, link: MachineLink): SupabaseClient<Database> {
    const db = this.db
    const base = db.client as unknown as Record<string, unknown>
    const publish = () => this.publishChanges()
    const noteMisuse = (error: unknown) => {
      if (error instanceof FakeSupabaseMisuse) this.misuses.push(error)
      throw error
    }

    const wrapBuilder = (builder: object): object => {
      const proxy: object = new Proxy(builder, {
        get: (target, prop, receiver) => {
          if (prop === 'then') {
            return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              (target as PromiseLike<unknown>)
                .then((value) => {
                  publish()
                  return value
                }, noteMisuse)
                .then(onFulfilled, onRejected)
          }
          const value = Reflect.get(target, prop, receiver)
          if (typeof value !== 'function') return value
          return (...args: unknown[]) => {
            const result = Reflect.apply(value as (...a: unknown[]) => unknown, target, args)
            return result === target ? proxy : result
          }
        },
      })
      return proxy
    }

    const authUser = { id: user.id, email: user.email }
    const client = {
      from: (table: string) => {
        try {
          return wrapBuilder((base.from as (t: string) => object)(table))
        } catch (error) {
          return noteMisuse(error)
        }
      },
      rpc: (name: string, args: Record<string, unknown> = {}) => {
        // The handler runs synchronously inside `rpc()`, so the actor is this machine's user
        // for exactly that call.
        db.actorId = user.id
        db.actorEmail = user.email
        const pending = (base.rpc as (n: string, a: Record<string, unknown>) => Promise<unknown>)(name, args)
        return pending.then((value) => {
          publish()
          return value
        }, noteMisuse)
      },
      storage: base.storage,
      auth: {
        getUser: async () => ({ data: { user: authUser }, error: null }),
        getSession: async () => ({
          data: { session: { user: authUser, access_token: `token-${user.id}` } },
          error: null,
        }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      channel: (name: string) => this.network.channel(link, name),
      removeChannel: async (channel: { unsubscribe: () => Promise<unknown> }) => channel.unsubscribe(),
    }
    return client as unknown as SupabaseClient<Database>
  }

  /** Live (not soft-deleted) file rows of the vault. */
  liveFiles(): Array<RowOf<'file'>> {
    return this.db
      .rows('file')
      .filter((r) => r.vault_id === VAULT_ID && r.deleted_at == null) as unknown as Array<RowOf<'file'>>
  }

  fileAt(path: string): RowOf<'file'> | undefined {
    return this.liveFiles().find((r) => r.file_path.toLowerCase() === path.toLowerCase())
  }
}
