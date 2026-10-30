/**
 * A typed in-memory Supabase for integration tests: real query code in, rows out.
 *
 * Every `.from()` table, every column a query names (select list, filter, order, insert, update)
 * and every `.rpc()` argument is checked against `src/types/supabase.ts` (see supabaseSchema.ts),
 * and anything the schema does not have throws. RPCs exist only when a handler is registered;
 * `fakeSupabaseRpcs.ts` ports the file and metadata RPCs from the SQL. A query the fake does not
 * understand throws too, rather than answering something plausible.
 *
 * Realtime is explicit: `emitRealtime()` delivers a `postgres_changes` payload to every channel
 * subscribed to that table, which is how a test plays the echo of a write at the moment it wants.
 *
 * What it does not model: row-level security, triggers, embedded relation selects.
 * Install it with `installFakeSupabase()` from `src/test/harness.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/supabase'

import { loadSchemaShape, type SchemaShape } from './supabaseSchema'

type PublicTables = Database['public']['Tables']

/**
 * An embedded to-one select: `alias:table!fk_column(col, col)`. Without `!fk_column` the foreign
 * key is `<alias>_id`, as for `workflow_state:workflow_states(...)`.
 */
const EMBED = /^(\w+):(\w+)(?:!(\w+))?\s*\(([^)]*)\)$/

/** A Blob's bytes. jsdom's Blob has no `arrayBuffer()`, so fall back to FileReader there. */
async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  // Typed here rather than from the DOM lib: api/'s typecheck reads this file without it.
  type Reader = {
    result: unknown
    error: unknown
    onload: (() => void) | null
    onerror: (() => void) | null
    readAsArrayBuffer(blob: Blob): void
  }
  const FileReaderCtor = (globalThis as unknown as { FileReader: new () => Reader }).FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReaderCtor()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

/** Signed URLs from the fake storage: `fake-storage://<bucket>/<path>`. */
export const FAKE_SIGNED_URL_PREFIX = 'fake-storage://'
export type TableName = keyof PublicTables & string
export type RowOf<T extends TableName> = PublicTables[T]['Row']

export type Row = Record<string, unknown>

export interface FakeError {
  message: string
  code: string
  details?: string
}

export interface FakeResult<T> {
  data: T
  error: FakeError | null
  count?: number | null
}

export type RpcHandler = (args: Record<string, unknown>, db: FakeSupabase) => unknown

export interface FakeCall {
  kind: 'from' | 'rpc' | 'storage'
  name: string
  op: string
}

/** Thrown for a query the schema or the fake cannot answer. Never swallowed into `{ error }`. */
export class FakeSupabaseMisuse extends Error {}

const NO_ROWS: FakeError = {
  message: 'JSON object requested, multiple (or no) rows returned',
  code: 'PGRST116',
  details: 'The result contains 0 rows',
}

let idCounter = 0
export function fakeUuid(prefix = 'id'): string {
  idCounter += 1
  return `${prefix}-${String(idCounter).padStart(8, '0')}`
}

type Filter = (row: Row) => boolean

function likeToRegExp(pattern: string, caseInsensitive: boolean): RegExp {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\' && i + 1 < pattern.length) {
      source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (ch === '%') source += '.*'
    else if (ch === '_') source += '.'
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`, caseInsensitive ? 'is' : 's')
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  return String(a) < String(b) ? -1 : 1
}

/** Unique indexes the app relies on. Partial on `deleted_at IS NULL`, like the real ones. */
const UNIQUE_INDEXES: Partial<Record<TableName, Array<(row: Row) => string | null>>> = {
  file: [
    (row) =>
      row.deleted_at == null
        ? `${String(row.vault_id)}|${String(row.file_path).toLowerCase()}`
        : null,
  ],
  // backup_locks.org_id UNIQUE: the backup worker's claim relies on it.
  backup_locks: [(row) => String(row.org_id)],
}

/** Column defaults the real tables apply, for the columns tests read back. */
const DEFAULTS: Partial<Record<TableName, Row>> = {
  file: {
    version: 1,
    revision: 'A',
    state: 'not_tracked',
    custom_properties: {},
    checked_out_by: null,
    deleted_at: null,
  },
}

class QueryBuilder implements PromiseLike<FakeResult<unknown>> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private filters: Filter[] = []
  private selectColumns: string[] | null = null
  private wantsReturn = false
  private orderings: Array<{ column: string; ascending: boolean }> = []
  private limitCount: number | null = null
  private rangeFrom: number | null = null
  private rangeTo: number | null = null
  private payload: Row | Row[] | null = null
  private onConflict: string | null = null
  private countMode: string | null = null
  private head = false
  private singleMode: 'single' | 'maybe' | null = null

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: TableName,
  ) {}

  private column(name: string): string {
    this.db.assertColumn(this.table, name)
    return name
  }

  select(columns = '*', options?: { count?: string; head?: boolean }): this {
    if (this.op === 'select') this.selectColumns = this.db.parseSelect(this.table, columns)
    else {
      this.wantsReturn = true
      this.selectColumns = this.db.parseSelect(this.table, columns)
    }
    this.countMode = options?.count ?? null
    this.head = !!options?.head
    return this
  }

  insert(rows: Row | Row[]): this {
    this.op = 'insert'
    this.payload = rows
    return this
  }

  upsert(rows: Row | Row[], options?: { onConflict?: string }): this {
    this.op = 'upsert'
    this.payload = rows
    this.onConflict = options?.onConflict ?? null
    return this
  }

  update(patch: Row): this {
    this.op = 'update'
    this.payload = patch
    return this
  }

  delete(): this {
    this.op = 'delete'
    return this
  }

  eq(column: string, value: unknown): this {
    this.column(column)
    this.filters.push((row) => row[column] === value)
    return this
  }

  neq(column: string, value: unknown): this {
    this.column(column)
    this.filters.push((row) => row[column] !== value)
    return this
  }

  /** `.not(column, 'is', null)` and `.not(column, 'eq', value)`: the negations the app uses. */
  not(column: string, operator: string, value: unknown): this {
    this.column(column)
    if (operator === 'is') {
      this.filters.push((row) => (value === null ? row[column] != null : row[column] !== value))
    } else if (operator === 'eq') {
      this.filters.push((row) => row[column] !== value)
    } else {
      throw new FakeSupabaseMisuse(`not('${column}', '${operator}'): operator not modelled`)
    }
    return this
  }

  is(column: string, value: null | boolean): this {
    this.column(column)
    this.filters.push((row) => (value === null ? row[column] == null : row[column] === value))
    return this
  }

  in(column: string, values: readonly unknown[]): this {
    this.column(column)
    this.filters.push((row) => values.includes(row[column]))
    return this
  }

  gt(column: string, value: unknown): this {
    this.column(column)
    this.filters.push((row) => compare(row[column], value) > 0 && row[column] != null)
    return this
  }

  gte(column: string, value: unknown): this {
    this.column(column)
    this.filters.push((row) => compare(row[column], value) >= 0 && row[column] != null)
    return this
  }

  lt(column: string, value: unknown): this {
    this.column(column)
    this.filters.push((row) => compare(row[column], value) < 0 && row[column] != null)
    return this
  }

  lte(column: string, value: unknown): this {
    this.column(column)
    this.filters.push((row) => compare(row[column], value) <= 0 && row[column] != null)
    return this
  }

  like(column: string, pattern: string): this {
    this.column(column)
    const re = likeToRegExp(pattern, false)
    this.filters.push((row) => typeof row[column] === 'string' && re.test(row[column] as string))
    return this
  }

  ilike(column: string, pattern: string): this {
    this.column(column)
    const re = likeToRegExp(pattern, true)
    this.filters.push((row) => typeof row[column] === 'string' && re.test(row[column] as string))
    return this
  }

  /** PostgREST `or=(a.is.null,a.eq.)`: the subset of operators the app sends. */
  or(expression: string): this {
    const terms = expression.split(',').map((term) => {
      const [column, operator, ...rest] = term.split('.')
      const value = rest.join('.')
      this.column(column)
      if (operator === 'is' && value === 'null') return (row: Row) => row[column] == null
      if (operator === 'eq') return (row: Row) => row[column] != null && String(row[column]) === value
      if (operator === 'neq') return (row: Row) => String(row[column]) !== value
      throw new FakeSupabaseMisuse(`or(): operator '${operator}' is not modelled (${term})`)
    })
    this.filters.push((row) => terms.some((test) => test(row)))
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.column(column)
    this.orderings.push({ column, ascending: options?.ascending !== false })
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  range(from: number, to: number): this {
    this.rangeFrom = from
    this.rangeTo = to
    return this
  }

  single(): PromiseLike<FakeResult<unknown>> {
    this.singleMode = 'single'
    return this
  }

  maybeSingle(): PromiseLike<FakeResult<unknown>> {
    this.singleMode = 'maybe'
    return this
  }

  then<R1 = FakeResult<unknown>, R2 = never>(
    onFulfilled?: ((value: FakeResult<unknown>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onFulfilled, onRejected)
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((row) => this.filters.every((f) => f(row)))
  }

  private shape(rows: Row[]): FakeResult<unknown> {
    let out = [...rows]
    for (const { column, ascending } of [...this.orderings].reverse()) {
      out.sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]))
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) {
      out = out.slice(this.rangeFrom, this.rangeTo + 1)
    }
    if (this.limitCount !== null) out = out.slice(0, this.limitCount)
    const projected = out.map((row) => this.db.project(row, this.selectColumns))
    const count = this.countMode ? rows.length : null

    if (this.singleMode) {
      if (projected.length === 1) return { data: projected[0], error: null, count }
      if (projected.length === 0 && this.singleMode === 'maybe') return { data: null, error: null, count }
      return { data: null, error: { ...NO_ROWS, details: `The result contains ${projected.length} rows` }, count }
    }
    if (this.head) return { data: null, error: null, count }
    return { data: projected, error: null, count }
  }

  private run(): FakeResult<unknown> {
    this.db.recordCall({ kind: 'from', name: this.table, op: this.op })
    const failure = this.db.takeInjectedFailure(this.table, this.op)
    if (failure) return { data: null, error: failure }

    if (this.op === 'select') return this.shape(this.matching())

    if (this.op === 'delete') {
      const doomed = this.matching()
      this.db.removeRows(this.table, doomed)
      return this.wantsReturn ? this.shape(doomed) : { data: null, error: null }
    }

    if (this.op === 'update') {
      const patch = this.payload as Row
      for (const key of Object.keys(patch)) this.column(key)
      const updated: Row[] = []
      for (const row of this.matching()) {
        const error = this.db.applyUpdate(this.table, row, patch)
        if (error) return { data: null, error }
        updated.push(row)
      }
      return this.wantsReturn ? this.shape(updated) : { data: null, error: null }
    }

    const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
    const written: Row[] = []
    for (const incoming of rows) {
      if (this.op === 'upsert' && this.onConflict) {
        const keys = this.onConflict.split(',').map((k) => this.column(k.trim()))
        const existing = this.db
          .rows(this.table)
          .find((row) => keys.every((key) => row[key] === incoming[key]))
        if (existing) {
          const error = this.db.applyUpdate(this.table, existing, incoming)
          if (error) return { data: null, error }
          written.push(existing)
          continue
        }
      }
      const result = this.db.insertRow(this.table, incoming)
      if ('error' in result) return { data: null, error: result.error }
      written.push(result.row)
    }
    return this.wantsReturn ? this.shape(written) : { data: null, error: null }
  }
}

type ChangeHandler = (payload: Row) => void

/** A realtime channel: `.on('postgres_changes', { table }, cb)` handlers and `.subscribe()`. */
class FakeChannel {
  subscribed = false
  /** realtime-js's channel state, which the health monitor reads. */
  state: 'closed' | 'joined' | 'errored' = 'closed'
  private status: ((status: string) => void) | null = null
  private readonly handlers: Array<{ table: string | null; event: string; handler: ChangeHandler }> =
    []

  constructor(
    readonly name: string,
    private readonly onClose: (channel: FakeChannel) => void,
  ) {}

  on(type: string, filter: { event?: string; table?: string }, handler: ChangeHandler): this {
    if (type === 'postgres_changes') {
      this.handlers.push({ table: filter.table ?? null, event: filter.event ?? '*', handler })
    }
    return this
  }

  subscribe(callback?: (status: string) => void): this {
    this.subscribed = true
    this.state = 'joined'
    this.status = callback ?? null
    callback?.('SUBSCRIBED')
    return this
  }

  async unsubscribe(): Promise<'ok'> {
    this.subscribed = false
    this.state = 'closed'
    this.onClose(this)
    return 'ok'
  }

  /** The socket dropped: realtime-js reports CHANNEL_ERROR, and nothing arrives until a rejoin. */
  fail(): boolean {
    if (!this.subscribed) return false
    this.subscribed = false
    this.state = 'errored'
    this.status?.('CHANNEL_ERROR')
    return true
  }

  /** realtime-js rejoined after a drop: SUBSCRIBED again. What it missed is not replayed. */
  rejoin(): boolean {
    if (this.state !== 'errored') return false
    this.subscribed = true
    this.state = 'joined'
    this.status?.('SUBSCRIBED')
    return true
  }

  deliver(payload: Row): number {
    let count = 0
    for (const { table, event, handler } of this.handlers) {
      if (table && table !== payload.table) continue
      if (event !== '*' && event !== payload.eventType) continue
      handler(payload)
      count += 1
    }
    return count
  }
}

interface StoredObject {
  bytes: Uint8Array
}

export class FakeSupabase {
  readonly schema: SchemaShape = loadSchemaShape()
  readonly calls: FakeCall[] = []
  /** The user `current_actor_id()` answers with; check-in and checkout act as this user. */
  actorId: string | null = null
  actorEmail = ''
  /** The clock the fake stamps rows with. Tests move it with `tick()`. */
  now = Date.parse('2026-10-20T09:00:00.000Z')

  private readonly tables = new Map<TableName, Row[]>()
  private readonly rpcs = new Map<string, { handler: RpcHandler; untyped: boolean }>()
  private readonly storageObjects = new Map<string, StoredObject>()
  private readonly channels: FakeChannel[] = []
  private readonly injectedFailures: Array<{ table: string; op: string; error: FakeError }> = []

  readonly client: SupabaseClient<Database>

  constructor() {
    const storageBucket = (bucket: string) => ({
      list: async (prefix: string, options?: { search?: string }) => {
        this.recordCall({ kind: 'storage', name: bucket, op: 'list' })
        const names = [...this.storageObjects.keys()]
          .filter((key) => key.startsWith(`${bucket}/${prefix}/`))
          .map((key) => key.slice(bucket.length + prefix.length + 2))
          .filter((name) => !options?.search || name.includes(options.search))
        return { data: names.map((name) => ({ name })), error: null }
      },
      upload: async (path: string, body: Blob | Uint8Array) => {
        this.recordCall({ kind: 'storage', name: bucket, op: 'upload' })
        const key = `${bucket}/${path}`
        if (this.storageObjects.has(key)) {
          return { data: null, error: { message: 'The resource already exists' } }
        }
        const bytes = body instanceof Uint8Array ? body : await blobBytes(body)
        this.storageObjects.set(key, { bytes })
        return { data: { path }, error: null }
      },
      createSignedUrl: async (path: string) => {
        this.recordCall({ kind: 'storage', name: bucket, op: 'createSignedUrl' })
        if (!this.storageObjects.has(`${bucket}/${path}`)) {
          return { data: null, error: { message: 'Object not found' } }
        }
        return { data: { signedUrl: `${FAKE_SIGNED_URL_PREFIX}${bucket}/${path}` }, error: null }
      },
      remove: async (paths: string[]) => {
        this.recordCall({ kind: 'storage', name: bucket, op: 'remove' })
        for (const path of paths) this.storageObjects.delete(`${bucket}/${path}`)
        return { data: paths.map((name) => ({ name })), error: null }
      },
      download: async (path: string) => {
        this.recordCall({ kind: 'storage', name: bucket, op: 'download' })
        const stored = this.storageObjects.get(`${bucket}/${path}`)
        if (!stored) return { data: null, error: { message: 'Object not found' } }
        return { data: new Blob([new Uint8Array(stored.bytes)]), error: null }
      },
    })

    const client = {
      from: (table: string) => new QueryBuilder(this, this.assertTable(table)),
      rpc: (name: string, args: Record<string, unknown> = {}) => this.callRpc(name, args),
      storage: { from: storageBucket },
      auth: {
        getUser: async () => ({
          data: { user: this.actorId ? { id: this.actorId, email: this.actorEmail } : null },
          error: null,
        }),
        getSession: async () => ({
          data: {
            session: this.actorId
              ? { user: { id: this.actorId, email: this.actorEmail }, access_token: 'fake' }
              : null,
          },
          error: null,
        }),
      },
      channel: (name: string) => this.openChannel(name),
      removeChannel: async () => 'ok',
    }
    this.client = client as unknown as SupabaseClient<Database>
  }

  private openChannel(name: string): FakeChannel {
    const channel = new FakeChannel(name, (c) => {
      const index = this.channels.indexOf(c)
      if (index >= 0) this.channels.splice(index, 1)
    })
    this.channels.push(channel)
    return channel
  }

  /** Drop every channel's socket (a network loss). Returns how many channels it reached. */
  dropRealtime(): number {
    return [...this.channels].filter((c) => c.fail()).length
  }

  /** Rejoin every dropped channel, as supabase-js does when the network returns. */
  rejoinRealtime(): number {
    return [...this.channels].filter((c) => c.rejoin()).length
  }

  /** Channels open (joined or errored, not yet unsubscribed). */
  openChannelCount(): number {
    return this.channels.length
  }

  /** Channels currently subscribed, by name. */
  subscribedChannels(): string[] {
    return this.channels.filter((c) => c.subscribed).map((c) => c.name)
  }

  /**
   * Deliver a realtime change. `old` is what Postgres sends with REPLICA IDENTITY FULL; pass the
   * row as it was before the write.
   */
  emitRealtime(
    table: TableName,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    row: Row,
    old: Row = {},
  ): number {
    let delivered = 0
    for (const channel of this.channels) {
      if (!channel.subscribed) continue
      delivered += channel.deliver({
        schema: 'public',
        table,
        eventType,
        new: structuredClone(row),
        old: structuredClone(old),
        commit_timestamp: this.isoNow(),
        errors: null,
      })
    }
    return delivered
  }

  /** Change a row and deliver the UPDATE its write would echo. Returns the updated row. */
  updateAndEmit<T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>): RowOf<T> {
    const row = this.rows(table).find((r) => r.id === id)
    if (!row) throw new Error(`${table}: no row ${id}`)
    const old = structuredClone(row)
    const error = this.applyUpdate(table, row, patch as Row)
    if (error) throw new Error(error.message)
    this.emitRealtime(table, 'UPDATE', row, old)
    return row as unknown as RowOf<T>
  }

  tick(ms = 1000): string {
    this.now += ms
    return new Date(this.now).toISOString()
  }

  isoNow(): string {
    return new Date(this.now).toISOString()
  }

  recordCall(call: FakeCall): void {
    this.calls.push(call)
  }

  /** Make the next `op` on `table` answer with `error` instead of running. */
  failNext(table: TableName, op: string, error: FakeError): void {
    this.injectedFailures.push({ table, op, error })
  }

  takeInjectedFailure(table: string, op: string): FakeError | null {
    const index = this.injectedFailures.findIndex((f) => f.table === table && f.op === op)
    if (index < 0) return null
    return this.injectedFailures.splice(index, 1)[0].error
  }

  assertTable(table: string): TableName {
    if (!this.schema.tables.has(table)) {
      throw new FakeSupabaseMisuse(`from('${table}'): no such table in src/types/supabase.ts`)
    }
    return table as TableName
  }

  assertColumn(table: TableName, column: string): void {
    if (!this.schema.tables.get(table)!.columns.has(column)) {
      throw new FakeSupabaseMisuse(`${table}.${column}: no such column in src/types/supabase.ts`)
    }
  }

  parseSelect(table: TableName, columns: string): string[] | null {
    // Split on top-level commas only: an embedded select has its own column list.
    const raw: string[] = []
    let depth = 0
    let current = ''
    for (const ch of columns) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) {
        raw.push(current.trim())
        current = ''
      } else current += ch
    }
    raw.push(current.trim())
    const parts = raw.map((p) => p.replace(/\s+/g, ' ')).filter(Boolean)
    if (parts.length === 1 && parts[0] === '*') return null
    for (const part of parts) {
      if (part === '*') continue
      const embed = EMBED.exec(part)
      if (embed) {
        // `alias:table!fk_column(cols)`: a to-one join through a foreign key on this row.
        const [, alias, other, named, inner] = embed
        const otherTable = this.assertTable(other)
        this.assertColumn(table, named ?? `${alias}_id`)
        for (const column of inner.split(',').map((c) => c.trim()).filter(Boolean)) {
          this.assertColumn(otherTable, column)
        }
        continue
      }
      if (part.includes('(') || part.includes(':') || part.includes('!')) {
        throw new FakeSupabaseMisuse(`select('${columns}'): this embedded select shape is not modelled`)
      }
      this.assertColumn(table, part)
    }
    // `*, org_id` is every column: naming one again adds nothing.
    return parts.includes('*') ? null : parts
  }

  project(row: Row, columns: string[] | null): Row {
    const copy = structuredClone(row)
    if (!columns) return copy
    const out: Row = {}
    for (const column of columns) {
      const embed = EMBED.exec(column)
      if (!embed) {
        out[column] = copy[column]
        continue
      }
      const [, alias, other, named, inner] = embed
      const fk = named ?? `${alias}_id`
      const target = this.rows(other as TableName).find((r) => r.id === copy[fk])
      out[alias] = target
        ? Object.fromEntries(inner.split(',').map((c) => [c.trim(), structuredClone(target[c.trim()])]))
        : null
    }
    return out
  }

  rows(table: TableName): Row[] {
    let rows = this.tables.get(table)
    if (!rows) {
      rows = []
      this.tables.set(table, rows)
    }
    return rows
  }

  removeRows(table: TableName, doomed: readonly Row[]): void {
    this.tables.set(
      table,
      this.rows(table).filter((row) => !doomed.includes(row)),
    )
  }

  private uniqueViolation(table: TableName, candidate: Row, except: Row | null): FakeError | null {
    for (const keyOf of UNIQUE_INDEXES[table] ?? []) {
      const key = keyOf(candidate)
      if (key === null) continue
      const clash = this.rows(table).some((row) => row !== except && keyOf(row) === key)
      if (clash) {
        return {
          message: `duplicate key value violates unique constraint on ${table}`,
          code: '23505',
        }
      }
    }
    return null
  }

  insertRow(table: TableName, incoming: Row): { row: Row } | { error: FakeError } {
    const shape = this.schema.tables.get(table)!
    for (const key of Object.keys(incoming)) this.assertColumn(table, key)
    for (const required of shape.requiredOnInsert) {
      if (!(required in incoming)) {
        throw new FakeSupabaseMisuse(`insert into ${table}: required column '${required}' missing`)
      }
    }
    const row: Row = {}
    for (const column of shape.columns) row[column] = null
    Object.assign(row, structuredClone(DEFAULTS[table] ?? {}))
    if (shape.columns.has('id')) row.id = fakeUuid(table)
    if (shape.columns.has('created_at')) row.created_at = this.isoNow()
    if (shape.columns.has('updated_at')) row.updated_at = this.isoNow()
    for (const [key, value] of Object.entries(incoming)) {
      if (value !== undefined) row[key] = structuredClone(value)
    }
    const violation = this.uniqueViolation(table, row, null)
    if (violation) return { error: violation }
    this.rows(table).push(row)
    return { row }
  }

  applyUpdate(table: TableName, row: Row, patch: Row): FakeError | null {
    const next = { ...row }
    for (const [key, value] of Object.entries(patch)) {
      this.assertColumn(table, key)
      if (value !== undefined) next[key] = structuredClone(value)
    }
    const violation = this.uniqueViolation(table, next, row)
    if (violation) return violation
    Object.assign(row, next)
    return null
  }

  /** Seed a row directly, bypassing the query layer. Returns the stored row. */
  seed<T extends TableName>(table: T, row: Partial<RowOf<T>> & Row): RowOf<T> {
    const result = this.insertRow(table, row)
    if ('error' in result) throw new Error(`seed ${table}: ${result.error.message}`)
    return result.row as unknown as RowOf<T>
  }

  /** The live row (not a copy) with this id. Throws when there is none. */
  row<T extends TableName>(table: T, id: string): RowOf<T> {
    const row = this.rows(table).find((r) => r.id === id)
    if (!row) throw new Error(`${table}: no row ${id}`)
    return row as unknown as RowOf<T>
  }

  storeObject(path: string, bytes: Uint8Array): void {
    this.storageObjects.set(path, { bytes })
  }

  hasObject(path: string): boolean {
    return this.storageObjects.has(path)
  }

  /** The bytes behind a URL from `createSignedUrl`, as text; null when there is no object. */
  objectAtSignedUrl(url: string): string | null {
    if (!url.startsWith(FAKE_SIGNED_URL_PREFIX)) return null
    const stored = this.storageObjects.get(url.slice(FAKE_SIGNED_URL_PREFIX.length))
    return stored ? new TextDecoder().decode(stored.bytes) : null
  }

  /**
   * Register an RPC. `untyped` is for a function the app calls through `(client.rpc as any)`
   * because it is missing from the generated types; contract tests (workstream A) own that gap,
   * this only stops the fake from hiding it.
   */
  defineRpc(name: string, handler: RpcHandler, options?: { untyped?: boolean }): void {
    if (!options?.untyped && !this.schema.functions.has(name)) {
      throw new FakeSupabaseMisuse(`rpc '${name}' is not in src/types/supabase.ts`)
    }
    this.rpcs.set(name, { handler, untyped: !!options?.untyped })
  }

  private async callRpc(name: string, args: Record<string, unknown>): Promise<FakeResult<unknown>> {
    this.recordCall({ kind: 'rpc', name, op: 'call' })
    const rpc = this.rpcs.get(name)
    if (!rpc) throw new FakeSupabaseMisuse(`rpc '${name}' called but no handler is registered`)

    const shape = this.schema.functions.get(name)
    if (shape) {
      for (const [key, value] of Object.entries(args)) {
        if (value !== undefined && !shape.args.has(key)) {
          throw new FakeSupabaseMisuse(`rpc '${name}': no argument '${key}' in the generated types`)
        }
      }
      for (const required of shape.required) {
        if (args[required] === undefined) {
          throw new FakeSupabaseMisuse(`rpc '${name}': required argument '${required}' missing`)
        }
      }
    }

    // JSON-RPC drops undefined, which is how "omitted" reaches the SQL as DEFAULT NULL.
    const sent = JSON.parse(JSON.stringify(args)) as Record<string, unknown>
    try {
      const data = rpc.handler(sent, this)
      return { data: data === undefined ? null : structuredClone(data), error: null }
    } catch (error) {
      if (error instanceof FakeSupabaseMisuse) throw error
      return { data: null, error: { message: (error as Error).message, code: 'P0001' } }
    }
  }
}
