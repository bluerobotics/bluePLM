/**
 * One simulated BluePLM machine: its own module graph (store, commands, realtime, load
 * coordination), its own fake disk and SolidWorks service, localStorage, sessionStorage and
 * IndexedDB (the sync index, inode map and server-file cache live there), and a link on the
 * realtime network.
 *
 * It runs the app's own code, mounted the way App.tsx mounts it (through hookHost.ts, not React's
 * scheduler): `useLoadFiles` (the real load
 * pipeline, IndexedDB caches included), `useRealtimeSubscriptions` with App's silent-refresh
 * callback, and `useVaultWatchers` (the file, resync and directory watchers moved out of App.tsx
 * for this). Commands go through the real `executeCommand`.
 *
 * Isolation choice: `vi.resetModules()` and a fresh `import('./machineGraph')` per machine. A
 * store factory does not exist, and the store is only one of many module singletons (realtime
 * channel slots, the load queue, the file-mutation epoch, caches), so a module graph per machine
 * is the cheapest way to separate all of them at once. Globals the app reads directly, and the
 * Supabase client (whose mock vitest keeps across resets), are routed by the machine context
 * (context.ts). Known gap: a lazy `import()` inside app code resolves in the newest graph. The
 * lazy imports on these paths (`@/lib/backup`, `@/lib/supabase`, `useUploadSizeWarning`) read
 * only `window.electronAPI`, `localStorage` and the client, which are context-routed, so they
 * behave the same from any graph.
 *
 * The disk emits watcher events like electron/handlers/fsWatcher.ts: changed file paths
 * (vault-relative, forward slashes) after a 1 s debounce, and directory added / removed.
 */
import { vi } from 'vitest'

import type { Command, CommandId, CommandMap, CommandResult } from '@/lib/commands/types'
import type { LocalFile } from '@/stores/types'
import type { Organization, User } from '@/types/pdm'

import { createFakeElectron, FakeDisk, type FakeElectron } from '../fakeElectron'
import { MemoryStorage, newIndexedDB, runOn, type MachineContext } from './context'
import { hostHook } from './hookHost'
import type { MachineLink } from './network'
import { ORG_ID, VAULT_ID, type SharedServer, type SimUser } from './server'

type Graph = typeof import('./machineGraph')
type LoadFiles = (silent?: boolean, forceHashComputation?: boolean, changedRelativePaths?: string[]) => Promise<void>

export const VAULT_PATH = 'C:\\vault'
const WATCH_DEBOUNCE_MS = 1000

export interface MachineSpec {
  name: string
  user: SimUser
}

interface WatcherListeners {
  files: Set<(paths: string[]) => void>
  dirAdded: Set<(path: string) => void>
  dirRemoved: Set<(path: string) => void>
}

const MUTATORS = ['write', 'writeBytes', 'rename', 'remove', 'move', 'copy', 'removeTree', 'mkdir', 'touch'] as const

export class Machine {
  readonly name: string
  readonly user: SimUser
  readonly disk = new FakeDisk()
  readonly ctx: MachineContext
  electron!: FakeElectron
  graph!: Graph
  link!: MachineLink
  /** Times the app was started on this machine. */
  boots = 0
  /** Loads running now, whoever started them (F5, a command, realtime, the watcher). */
  loadsInFlight = 0
  private loadFiles!: LoadFiles
  private unmount: (() => void) | null = null
  private readonly listeners: WatcherListeners = { files: new Set(), dirAdded: new Set(), dirRemoved: new Set() }
  private watchSnapshot = new Map<string, string>()
  private watchDirs = new Set<string>()
  private watchTimer: ReturnType<typeof setTimeout> | null = null
  /** When false the disk changes silently, as with a watcher that has not started yet. */
  watching = true
  /** The answer this machine's user gives every confirmation dialog a command opens. */
  confirmAnswer = true
  /** Confirmation dialogs shown so far, by title. */
  readonly confirms: string[] = []
  /** What the app wrote through `electronAPI.log`, newest last (the main-process log). */
  readonly logs: string[] = []

  constructor(
    private readonly server: SharedServer,
    spec: MachineSpec,
  ) {
    this.name = spec.name
    this.user = spec.user
    server.addUser(spec.user)
    this.ctx = {
      name: spec.name,
      electronAPI: undefined as unknown as NonNullable<Window['electronAPI']>,
      client: undefined as unknown as MachineContext['client'],
      localStorage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      indexedDB: newIndexedDB(),
    }
    this.instrumentDisk()
  }

  /** Run `fn` as this machine. */
  on<T>(fn: () => T): T {
    return runOn(this.ctx, fn)
  }

  get store(): Graph['usePDMStore'] {
    return this.graph.usePDMStore
  }

  state(): ReturnType<Graph['usePDMStore']['getState']> {
    return this.graph.usePDMStore.getState()
  }

  absolute(relativePath: string): string {
    return `${VAULT_PATH}\\${relativePath.replace(/\//g, '\\')}`
  }

  relative(absolutePath: string): string {
    return absolutePath.slice(VAULT_PATH.length + 1).replace(/\\/g, '/')
  }

  /** Start the app: a fresh module graph, the user signed in, the vault opened and loaded. */
  async boot(): Promise<void> {
    this.boots += 1
    this.link = this.server.network.attach(this.name, this.ctx)
    this.ctx.client = this.server.connect(this.user, this.link)
    this.electron = this.buildElectron()
    this.ctx.electronAPI = this.electron.api

    vi.resetModules()
    this.graph = await this.on(() => import('./machineGraph'))
    const g = this.graph

    await this.on(async () => {
      const user = {
        id: this.user.id,
        email: this.user.email,
        full_name: this.user.full_name,
        role: 'engineer',
        org_id: ORG_ID,
      } as User
      const organization = { id: ORG_ID, name: 'Test Org', slug: 'test-org', serialization_settings: {} } as unknown as Organization
      const state = g.usePDMStore.getState()
      state.setUser(user)
      state.setOrganization(organization)
      // An engineer who may view, create, edit and delete everywhere, but is not an admin.
      const userPermissions = new Proxy({} as Record<string, string[]>, {
        get: (_target, resource) => (resource === '__admin__' ? undefined : ['view', 'create', 'edit', 'delete']),
      })
      g.usePDMStore.setState({
        vaultPath: VAULT_PATH,
        activeVaultId: VAULT_ID,
        connectedVaults: [{ id: VAULT_ID, name: 'Main', localPath: VAULT_PATH, isExpanded: true, hasCompletedSetup: true }],
        isVaultConnected: true,
        isOfflineMode: false,
        userPermissions,
        integrations: { ...state.integrations, solidworks: { ...state.integrations.solidworks, status: 'online' } },
        solidworksServiceStatus: { ...state.solidworksServiceStatus, running: true, dmApiAvailable: true },
      } as never)
      g.setLoadFilesSessionContext({ authenticatedUserId: user.id, sessionGeneration: 0 })

      // One stable function, as App's `loadFiles` is, that also counts loads in flight.
      let latest: LoadFiles = async () => {}
      const loadFiles: LoadFiles = (...args) => {
        this.loadsInFlight += 1
        return latest(...args).finally(() => {
          this.loadsInFlight -= 1
        })
      }
      const rendered = hostHook(this.ctx, g.React as unknown as Record<string, unknown>, () => {
        const organization = g.usePDMStore((s) => s.organization)
        const vaultPath = g.usePDMStore((s) => s.vaultPath)
        latest = g.useLoadFiles({ authenticatedUserId: user.id, sessionGeneration: 0 }).loadFiles
        // App.tsx: a realtime deletion asks for a silent load.
        g.useRealtimeSubscriptions(organization, false, `${user.id}:0`, () => void loadFiles(true))
        g.useVaultWatchers(vaultPath, loadFiles)
        return loadFiles
      })
      this.loadFiles = rendered.current
      // The user answers every command confirmation (CommandConfirmContainer) with `confirmAnswer`.
      const unsubscribeConfirm = g.usePDMStore.subscribe((s, prev) => {
        if (!s.pendingCommandConfirm || s.pendingCommandConfirm === prev.pendingCommandConfirm) return
        this.confirms.push(String(s.pendingCommandConfirm.title ?? ''))
        queueMicrotask(() => g.resolveCommandConfirm(this.confirmAnswer))
      })
      // MainContent: `requestFilesReload` is a silent full load.
      const unsubscribeReload = g.usePDMStore.subscribe((s, prev) => {
        if (s.filesReloadRequestId !== prev.filesReloadRequestId) void loadFiles(true)
      })
      this.unmount = () => {
        unsubscribeConfirm()
        unsubscribeReload()
        rendered.unmount()
      }
    })
    this.resetWatchSnapshot()
  }

  /** Quit the app. Disk, localStorage and IndexedDB stay, as on a real machine. */
  shutdown(): void {
    if (this.watchTimer) clearTimeout(this.watchTimer)
    this.watchTimer = null
    this.on(() => {
      this.unmount?.()
      this.graph.unsubscribeAll()
    })
    this.unmount = null
    this.listeners.files.clear()
    this.listeners.dirAdded.clear()
    this.listeners.dirRemoved.clear()
    this.server.network.detach(this.name)
  }

  /** `loadFiles` as the app calls it: F5 (`silent` false) or a background refresh. */
  load(silent = false): Promise<void> {
    return this.on(() => this.loadFiles(silent))
  }

  files(): LocalFile[] {
    return this.state().files
  }

  /** The store row at a path, file or folder, or undefined. */
  find(relativePath: string): LocalFile | undefined {
    const lower = relativePath.toLowerCase()
    return this.files().find((f) => f.relativePath.toLowerCase() === lower)
  }

  file(relativePath: string): LocalFile {
    const found = this.find(relativePath)
    if (!found) {
      throw new Error(`${this.name}: no store row ${relativePath}; has ${this.files().map((f) => f.relativePath).join(', ')}`)
    }
    return found
  }

  /**
   * Run a command through the real executor, as the UI does, and wait for it. File operations
   * are queued (operationsSlice) and `executeCommand` returns once they are queued, so this waits
   * for the queue to drain and answers with the command's own result from the history.
   */
  command<K extends CommandId>(
    id: K,
    params: CommandMap[K] extends Command<infer P> ? P : never,
  ): Promise<CommandResult> {
    return this.on(async () => {
      const immediate = await (
        this.graph.executeCommand as (k: K, p: unknown, o: unknown) => Promise<CommandResult>
      )(id, params, {
        onRefresh: (silent?: boolean) => void this.loadFiles(silent ?? true),
        silent: true,
      })
      for (;;) {
        const entry = this.graph.getCommandHistory().find((h) => h.params === params)
        if (entry) return entry.result
        const s = this.state()
        if (!s.isOperationRunning && s.operationQueue.length === 0) return immediate
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    })
  }

  /** Re-align with Server, as RealignDialog runs it with its default plan. */
  realign(): Promise<unknown> {
    return this.on(async () => {
      const g = this.graph
      const s = this.state()
      const report = g.analyzeAlignment({
        files: s.files,
        serverFileCount: s.serverFiles.length,
        vaultId: VAULT_ID,
        currentUserId: this.user.id,
      })
      return g.applyAlignment(
        { ...g.defaultAlignmentPlan(), pendingMoveActions: g.defaultPendingMoveActions(report.pendingMoveItems) },
        {
          vaultId: VAULT_ID,
          files: s.files,
          serverFileCount: s.serverFiles.length,
          isOperationRunning: s.isOperationRunning,
          operationQueueLength: s.operationQueue.length,
          onRefresh: () => this.state().requestFilesReload(),
        },
      )
    })
  }

  // ── Disk and watcher ─────────────────────────────────────────────────────

  private buildElectron(): FakeElectron {
    const fake = createFakeElectron(this.disk, {
      workingDir: () => VAULT_PATH,
      resolveDownload: (url) => this.server.db.objectAtSignedUrl(url),
    })
    const listeners = this.listeners
    const subscribe =
      <T>(set: Set<T>) =>
      (callback: T) => {
        set.add(callback)
        return () => set.delete(callback)
      }
    const overrides: Record<string, unknown> = {
      getMachineId: async () => `machine-${this.name}`,
      getMachineName: async () => this.name.toUpperCase(),
      onFilesChanged: subscribe(listeners.files),
      onDirectoryAdded: subscribe(listeners.dirAdded),
      onDirectoryRemoved: subscribe(listeners.dirRemoved),
      onVaultResyncRequired: () => () => {},
      // The main process re-stats the changed paths into its last full scan and still returns
      // the complete list; over a fake disk that is the full list.
      listWorkingFilesDelta: async () => ({ ...(await fake.api.listWorkingFiles()), wasFullScan: false }),
      log: (level: string, message: string, data?: unknown) => {
        this.logs.push(`${level} ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`)
        if (this.logs.length > 2000) this.logs.splice(0, this.logs.length - 2000)
      },
    }
    const api = fake.api
    fake.api = new Proxy(api, {
      get: (target, prop, receiver) => (typeof prop === 'string' && prop in overrides ? overrides[prop] : Reflect.get(target, prop, receiver)),
    })
    return fake
  }

  private instrumentDisk(): void {
    const disk = this.disk as unknown as Record<string, (...args: unknown[]) => unknown>
    for (const name of MUTATORS) {
      const original = disk[name].bind(this.disk)
      disk[name] = (...args: unknown[]) => {
        const result = original(...args)
        this.scheduleWatch()
        return result
      }
    }
  }

  private diskView(): { files: Map<string, string>; dirs: Set<string> } {
    const prefix = `${VAULT_PATH.toLowerCase()}\\`
    const files = new Map<string, string>()
    const dirs = new Set<string>()
    const addDirs = (relative: string, includeSelf: boolean) => {
      const parts = relative.split('/')
      for (let i = 1; i < parts.length + (includeSelf ? 1 : 0); i++) dirs.add(parts.slice(0, i).join('/'))
    }
    for (const entry of this.disk.all()) {
      if (!entry.path.toLowerCase().startsWith(prefix)) continue
      const relative = this.relative(entry.path)
      files.set(relative, `${entry.mtimeMs}:${entry.ino}`)
      addDirs(relative, false)
    }
    for (const dir of this.disk.dirs()) {
      if (dir.toLowerCase().startsWith(prefix)) addDirs(this.relative(dir), true)
    }
    return { files, dirs }
  }

  private resetWatchSnapshot(): void {
    const view = this.diskView()
    this.watchSnapshot = view.files
    this.watchDirs = view.dirs
  }

  private scheduleWatch(): void {
    if (!this.watching) return
    if (this.watchTimer) clearTimeout(this.watchTimer)
    this.watchTimer = this.on(() => setTimeout(() => this.flushWatch(), WATCH_DEBOUNCE_MS))
  }

  /** What fsWatcher.ts sends after its debounce: directories first, then the changed files. */
  private flushWatch(): void {
    this.watchTimer = null
    const view = this.diskView()
    const changed: string[] = []
    for (const [path, stamp] of view.files) if (this.watchSnapshot.get(path) !== stamp) changed.push(path)
    for (const path of this.watchSnapshot.keys()) if (!view.files.has(path)) changed.push(path)
    const added = [...view.dirs].filter((d) => !this.watchDirs.has(d))
    const removed = [...this.watchDirs].filter((d) => !view.dirs.has(d))
    this.watchSnapshot = view.files
    this.watchDirs = view.dirs
    for (const dir of added) for (const cb of this.listeners.dirAdded) cb(dir)
    for (const dir of removed) for (const cb of this.listeners.dirRemoved) cb(dir)
    if (changed.length > 0) for (const cb of this.listeners.files) cb(changed)
  }

  /** Watcher events not yet sent. */
  watchPending(): boolean {
    return this.watchTimer !== null
  }

  /** Watcher subscriptions the app holds (files changed, directory added and removed). */
  watcherListenerCount(): number {
    return this.listeners.files.size + this.listeners.dirAdded.size + this.listeners.dirRemoved.size
  }
}
