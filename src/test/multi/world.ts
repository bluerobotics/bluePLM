/**
 * The simulation: one shared server, N machines, one fake clock.
 *
 *   const world = await World.create(['A', 'B'])
 *   world.seed({ path: 'Parts/x.sldprt' })          // on the server and on every disk
 *   await world.boot()                              // start the app on every machine
 *   await world.run(world.A.command('checkout', { files: [world.A.file('Parts/x.sldprt')] }))
 *   await world.settle()                            // realtime, watchers, debounced loads
 *   world.expectAgreement()
 *
 * Time is fake (context.ts): `run` advances it until the operation finishes, so debounces,
 * realtime latency and watcher batches happen while the operation is in flight, as they would.
 * `settle` advances it until nothing is in flight for a quiet period.
 */
import { expect, vi } from 'vitest'

import type { LocalFile } from '@/stores/types'

import type { RowOf } from '../fakeSupabase'
import { hashText, type SwDocument } from '../fakeElectron'
import { installMachineGlobals, installMachineTimers } from './context'
import { Machine, VAULT_PATH } from './machine'
import { ORG_ID, SharedServer, VAULT_ID, type SimUser } from './server'

export { VAULT_PATH, VAULT_ID, ORG_ID }

const QUIET_MS = 3000
const STEP_MS = 25

/**
 * Wall-clock budget for one simulator test. Simulated time runs on fake timers, so this measures
 * nothing about the app: the real cost is evaluating a fresh app module graph for every machine
 * boot (machine.ts), which takes a few seconds alone and many times that while the full suite
 * fills every core. Vitest's 5 s default timed these tests out under a full parallel run while
 * each passed alone.
 */
export const MULTI_TEST_TIMEOUT_MS = 60_000

export const USERS: Record<string, SimUser> = {
  A: { id: 'user-a', email: 'a@example.com', full_name: 'Alice A' },
  B: { id: 'user-b', email: 'b@example.com', full_name: 'Bob B' },
  C: { id: 'user-c', email: 'c@example.com', full_name: 'Cara C' },
}

export interface SeedSpec {
  path: string
  /** Machines with the file on disk (default: all). The rest see it as cloud-only. */
  on?: string[]
  checkedOutBy?: string | null
  partNumber?: string | null
  description?: string | null
  body?: string
}

export interface ServerView {
  id: string
  path: string
  version: number
  hash: string | null
  checkedOutBy: string | null
  partNumber: string | null
  description: string | null
}

export interface MachineView {
  /** Store file rows: path, status and what the row says about the server. */
  store: Array<{
    path: string
    status: string
    fileId: string | null
    serverPath: string | null
    version: number | null
    checkedOutBy: string | null
    /**
     * An unsaved metadata edit (a pending value that differs from the committed one), which marks
     * a file modified with its bytes untouched. A detected move mirrors the committed part number
     * into pending metadata on purpose (mergeLocalFile.ts); that is not an edit.
     */
    pendingMetadata: boolean
  }>
  folders: string[]
  disk: Array<{ path: string; hash: string; readonly: boolean }>
  diskFolders: string[]
}

const extensionOf = (path: string) => {
  const name = path.split('/').pop()!
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

function fileTypeOf(path: string): RowOf<'file'>['file_type'] {
  switch (extensionOf(path)) {
    case '.sldprt':
      return 'part'
    case '.sldasm':
      return 'assembly'
    case '.slddrw':
      return 'drawing'
    default:
      return 'other'
  }
}

function hasRealPendingEdit(f: LocalFile): boolean {
  if (!f.pendingMetadata) return false
  const committed = (f.pdmData ?? {}) as unknown as Record<string, unknown>
  return Object.entries(f.pendingMetadata).some(([key, value]) => value !== undefined && value !== committed[key])
}

export function swDocument(props: Record<string, string> = {}): SwDocument {
  return { fileProperties: { ...props }, configurations: [{ name: 'Default', isActive: true, properties: {} }] }
}

export class World {
  readonly server = new SharedServer()
  readonly machines: Machine[] = []
  /** Every non-empty part number / description a file row has had, by file id. */
  private readonly everFilled = new Map<string, { partNumber: boolean; description: boolean }>()

  private constructor() {}

  static async create(names: string[]): Promise<World> {
    installMachineGlobals()
    installMachineTimers()
    // The app logs every step of every load; across two machines and a random sequence that
    // buries a failure. Warnings and errors still print. SIM_LOGS=1 keeps everything.
    if (!process.env.SIM_LOGS) {
      for (const level of ['log', 'info', 'debug'] as const) vi.spyOn(console, level).mockImplementation(() => {})
    }
    ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false
    const world = new World()
    for (const name of names) world.machines.push(new Machine(world.server, { name, user: USERS[name] }))
    return world
  }

  machine(name: string): Machine {
    const m = this.machines.find((x) => x.name === name)
    if (!m) throw new Error(`no machine ${name}`)
    return m
  }

  get A(): Machine {
    return this.machine('A')
  }
  get B(): Machine {
    return this.machine('B')
  }

  dispose(): void {
    for (const m of this.machines) if (m.boots > 0) m.shutdown()
    vi.clearAllTimers()
  }

  /** A synced file: a server row and storage object, and the same bytes on each listed disk. */
  seed(spec: SeedSpec): RowOf<'file'> {
    const db = this.server.db
    const body = spec.body ?? `bytes of ${spec.path}`
    const document = fileTypeOf(spec.path) === 'other' ? undefined : swDocument()
    let bytes = ''
    const holders = spec.on ?? this.machines.map((m) => m.name)
    for (const m of this.machines) {
      m.watching = false
      const absolute = m.absolute(spec.path)
      m.disk.write(absolute, body, document)
      bytes = m.disk.bytes(absolute)
      if (!holders.includes(m.name)) m.disk.remove(absolute)
      else m.disk.require(absolute).readonly = spec.checkedOutBy !== m.user.id
      m.watching = true
    }
    const hash = hashText(bytes)
    db.storeObject(`vault/${ORG_ID}/${hash.slice(0, 2)}/${hash}`, new TextEncoder().encode(bytes))
    let row!: RowOf<'file'>
    this.server.write((fake) => {
      row = fake.seed('file', {
        org_id: ORG_ID,
        vault_id: VAULT_ID,
        file_path: spec.path,
        file_name: spec.path.split('/').pop()!,
        extension: extensionOf(spec.path),
        file_type: fileTypeOf(spec.path),
        content_hash: hash,
        file_size: bytes.length,
        version: 1,
        revision: 'A',
        part_number: spec.partNumber ?? null,
        description: spec.description ?? null,
        custom_properties: {} as RowOf<'file'>['custom_properties'],
        checked_out_by: spec.checkedOutBy ?? null,
        checked_out_at: spec.checkedOutBy ? fake.isoNow() : null,
        created_by: USERS.A.id,
        updated_by: USERS.A.id,
      })
      fake.seed('file_version', { file_id: row.id, version: 1, revision: 'A', content_hash: hash, created_by: USERS.A.id })
    })
    return row
  }

  async boot(names = this.machines.map((m) => m.name)): Promise<void> {
    for (const name of names) {
      const m = this.machine(name)
      await m.boot()
      await this.run(m.load(false))
    }
    await this.settle()
  }

  /** Restart one machine's app: quit, then start again on the same disk and local storage. */
  async restart(name: string): Promise<void> {
    const m = this.machine(name)
    m.shutdown()
    await m.boot()
    await this.run(m.load(false))
  }

  /** Advance the clock until `operation` finishes. Everything else keeps running meanwhile. */
  async run<T>(operation: Promise<T>, maxMs = 120_000): Promise<T> {
    let done = false
    let value: T | undefined
    let failure: unknown
    let failed = false
    operation.then(
      (v) => {
        done = true
        value = v
      },
      (e) => {
        done = true
        failed = true
        failure = e
      },
    )
    let elapsed = 0
    while (!done) {
      await new Promise((resolve) => setImmediate(resolve))
      if (done) break
      await vi.advanceTimersByTimeAsync(STEP_MS)
      elapsed += STEP_MS
      if (elapsed > maxMs) throw new Error(`run: operation still pending after ${maxMs} ms of simulated time`)
    }
    this.throwHandlerErrors()
    if (failed) throw failure
    this.recordFilled()
    return value as T
  }

  /** Advance the clock until no realtime event, watcher batch or load has been in flight for a while. */
  async settle(maxMs = 120_000): Promise<void> {
    let quietFor = 0
    let elapsed = 0
    while (quietFor < QUIET_MS) {
      await new Promise((resolve) => setImmediate(resolve))
      await vi.advanceTimersByTimeAsync(STEP_MS)
      elapsed += STEP_MS
      const busy =
        !this.server.network.idle() ||
        this.machines.some((m) => m.boots > 0 && (m.watchPending() || m.loadsInFlight > 0))
      quietFor = busy ? 0 : quietFor + STEP_MS
      if (elapsed > maxMs) throw new Error('settle: the simulation never went quiet')
    }
    this.throwHandlerErrors()
    this.recordFilled()
  }

  /**
   * Fail the step on what the app would swallow: a realtime handler that threw, a query the fake
   * cannot answer, or a load that ended in its own catch ("Error loading files").
   */
  private throwHandlerErrors(): void {
    const errors = this.server.network.takeErrors()
    if (errors.length > 0) throw errors[0]
    const misuse = this.server.misuses.shift()
    if (misuse) throw misuse
    for (const m of this.machines) {
      const failed = m.logs.find((line) => line.startsWith('error [LoadFiles] Error loading files'))
      if (failed) throw new Error(`${m.name}: ${failed}`)
    }
  }

  private recordFilled(): void {
    for (const row of this.server.db.rows('file')) {
      const seen = this.everFilled.get(String(row.id)) ?? { partNumber: false, description: false }
      if (typeof row.part_number === 'string' && row.part_number.trim()) seen.partNumber = true
      if (typeof row.description === 'string' && row.description.trim()) seen.description = true
      this.everFilled.set(String(row.id), seen)
    }
  }

  serverView(): ServerView[] {
    return this.server
      .liveFiles()
      .map((r) => ({
        id: r.id,
        path: r.file_path,
        version: Number(r.version),
        hash: r.content_hash ?? null,
        checkedOutBy: r.checked_out_by ?? null,
        partNumber: r.part_number ?? null,
        description: r.description ?? null,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  view(m: Machine): MachineView {
    const prefix = `${VAULT_PATH.toLowerCase()}\\`
    const inVault = (p: string) => p.toLowerCase().startsWith(prefix)
    const disk = m.disk
      .all()
      .filter((e) => inVault(e.path))
      .map((e) => ({ path: m.relative(e.path), hash: m.disk.hash(e.path), readonly: e.readonly }))
      .sort((a, b) => a.path.localeCompare(b.path))
    const diskFolders = new Set<string>()
    const addParents = (path: string, self: boolean) => {
      const parts = path.split('/')
      for (let i = 1; i < parts.length + (self ? 1 : 0); i++) diskFolders.add(parts.slice(0, i).join('/'))
    }
    for (const d of disk) addParents(d.path, false)
    for (const dir of m.disk.dirs()) if (inVault(dir)) addParents(m.relative(dir), true)
    const files = m.files()
    return {
      store: files
        .filter((f) => !f.isDirectory)
        .map((f) => ({
          path: f.relativePath,
          status: f.diffStatus ?? 'synced',
          fileId: f.pdmData?.id ?? null,
          serverPath: f.pdmData?.file_path ?? null,
          version: f.pdmData?.version ?? null,
          checkedOutBy: f.pdmData?.checked_out_by ?? null,
          pendingMetadata: hasRealPendingEdit(f),
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      folders: files
        .filter((f) => f.isDirectory)
        .map((f) => f.relativePath)
        .sort((a, b) => a.localeCompare(b)),
      disk,
      diskFolders: [...diskFolders].sort((a, b) => a.localeCompare(b)),
    }
  }

  /**
   * What must hold on the server after any sequence: one live row per path (the index), no two
   * live rows for one file's content (a move that duplicated instead of moving), and no part
   * number or description that was ever filled now blank.
   */
  expectServerSound(): void {
    const live = this.serverView()
    const byHash = new Map<string, string[]>()
    for (const r of live) if (r.hash) byHash.set(r.hash, [...(byHash.get(r.hash) ?? []), r.path])
    for (const [, paths] of byHash) expect(paths, `duplicate live rows for one file's bytes: ${paths.join(', ')}`).toHaveLength(1)
    for (const r of live) {
      const filled = this.everFilled.get(r.id)
      if (filled?.partNumber) expect(r.partNumber?.trim(), `${r.path}: part number went blank`).toBeTruthy()
      if (filled?.description) expect(r.description?.trim(), `${r.path}: description went blank`).toBeTruthy()
    }
  }

  /**
   * What must hold on a machine once realtime has settled with nothing lost: the store says what
   * the server and the disk say. Pending local moves (`moved`, `moved_away`) are allowed only when
   * `allowPendingMoves` is set, for a scenario that moved files outside the app.
   */
  expectAgreement(m: Machine, options: { allowPendingMoves?: boolean } = {}): void {
    const v = this.view(m)
    const label = (s: string) => `${m.name}: ${s}`
    const server = this.serverView()
    const serverById = new Map(server.map((r) => [r.id, r]))
    const serverByPath = new Map(server.map((r) => [r.path.toLowerCase(), r]))
    const diskByPath = new Map(v.disk.map((d) => [d.path.toLowerCase(), d]))
    const storePaths = v.store.map((f) => f.path.toLowerCase())
    expect(new Set(storePaths).size, label(`duplicate store rows: ${storePaths.join(', ')}`)).toBe(storePaths.length)

    for (const f of v.store) {
      const disk = diskByPath.get(f.path.toLowerCase())
      if (!options.allowPendingMoves) {
        expect(['moved', 'moved_away'], label(`${f.path} is ${f.status}`)).not.toContain(f.status)
      }
      if (f.status === 'cloud' || f.status === 'moved_away') expect(disk, label(`${f.path} is ${f.status} but on disk`)).toBeUndefined()
      else if (f.status !== 'deleted') expect(disk, label(`${f.path} in the store, not on disk`)).toBeDefined()
      if (f.fileId && f.status !== 'deleted_remote') {
        const row = serverById.get(f.fileId)
        expect(row, label(`${f.path} points at file ${f.fileId}, which is not live on the server`)).toBeDefined()
        if (!row) continue
        expect(f.checkedOutBy, label(`${f.path}: checkout differs from the server`)).toBe(row.checkedOutBy)
        expect(f.version, label(`${f.path}: version differs from the server`)).toBe(row.version)
        if (f.status !== 'moved' && f.status !== 'moved_away') {
          expect(f.serverPath, label(`${f.path}: the row's path differs from the server`)).toBe(row.path)
        }
      }
      if (f.status === 'modified' && !f.pendingMetadata) {
        const row = serverByPath.get(f.path.toLowerCase())
        expect(!!disk && !!row && disk.hash !== row.hash, label(`${f.path}: modified but the bytes match the server`)).toBe(true)
      }
    }
    const shown = new Set(storePaths)
    for (const d of v.disk) expect(shown.has(d.path.toLowerCase()), label(`${d.path} on disk, not in the store`)).toBe(true)
    for (const r of server) {
      const listed = shown.has(r.path.toLowerCase()) || v.store.some((f) => f.fileId === r.id)
      expect(listed, label(`${r.path} on the server, not in the store`)).toBe(true)
    }
    for (const folder of v.folders) {
      const lower = folder.toLowerCase()
      const onDisk = v.diskFolders.some((d) => d.toLowerCase() === lower)
      const onServer =
        server.some((r) => r.path.toLowerCase().startsWith(`${lower}/`)) ||
        this.server.db
          .rows('folder')
          .some((f) => f.deleted_at == null && String(f.folder_path).toLowerCase() === lower)
      expect(onDisk || onServer, label(`ghost folder ${folder}`)).toBe(true)
    }
    for (const d of v.disk) {
      const row = serverByPath.get(d.path.toLowerCase())
      if (row && row.hash === d.hash) {
        expect(d.readonly, label(`${d.path}: writable but not checked out to me`)).toBe(row.checkedOutBy !== m.user.id)
      }
    }
  }

  /** A reload changes nothing: the store after F5 is the store before it. */
  async expectStableAcrossReload(m: Machine): Promise<void> {
    const before = this.view(m)
    await this.run(m.load(false))
    await this.settle()
    const after = this.view(m)
    expect(after.store, `${m.name}: store changed across a reload`).toEqual(before.store)
    expect(after.folders, `${m.name}: folders changed across a reload`).toEqual(before.folders)
    expect(after.disk, `${m.name}: disk changed across a reload`).toEqual(before.disk)
  }

  /** The server and every machine's store, compact, for a failure message or a debug print. */
  dump(): string {
    const lines = ['server:']
    for (const r of this.serverView()) {
      lines.push(`  ${r.path} v${r.version} out=${r.checkedOutBy ?? '-'} pn=${r.partNumber ?? '-'} d=${r.description ?? '-'} id=${r.id}`)
    }
    for (const m of this.machines) {
      if (m.boots === 0) continue
      const v = this.view(m)
      lines.push(`${m.name} store:`)
      for (const f of v.store) {
        lines.push(`  ${f.path} [${f.status}] id=${f.fileId ?? '-'} srv=${f.serverPath ?? '-'} v${f.version ?? '-'} out=${f.checkedOutBy ?? '-'}`)
      }
      lines.push(`  folders: ${v.folders.join(', ')}`)
      lines.push(`${m.name} disk: ${v.disk.map((d) => `${d.path}${d.readonly ? '' : ' (rw)'}`).join(', ')}`)
    }
    return lines.join('\n')
  }

  /** Every machine agrees, the server is sound, and a reload on each changes nothing. */
  async expectConverged(options: { allowPendingMoves?: boolean } = {}): Promise<void> {
    await this.settle()
    this.expectServerSound()
    for (const m of this.machines) if (m.boots > 0) this.expectAgreement(m, options)
    for (const m of this.machines) if (m.boots > 0) await this.expectStableAcrossReload(m)
  }
}
