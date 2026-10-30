/**
 * `window.__blueplmSoak`: what the soak runner (scripts/render-perf/soak.ts) drives and samples in
 * the page. CI only: installed by the perf boot when the page is loaded with `?soak=1`, which only
 * a main process started with BLUEPLM_PERF_SOAK=1 does (electron/perfBoot.ts).
 *
 * One `hour()` is an hour of a busy office compressed: other users' check-ins, checkouts, new and
 * deleted files and activity over realtime, this user's folder browsing, metadata edits, checkouts
 * and SolidWorks service calls, and watcher bursts. The network, sleep and token events are
 * separate calls, so the runner decides their cadence. Everything goes through the app's own
 * store actions, commands and fakes' event paths, the same ones the UI and the backends use.
 *
 * `sample()` reads everything in the page that could grow over a month. The renderer heap after GC
 * and the DOM listener counts come from DevTools in the runner, which sees them better.
 */
import type { usePDMStore } from '@/stores/pdmStore'
import { fakeUuid, type Row } from '@/test/fakeSupabase'

import type { PerfBackend } from './backend'
import { PERF_ORG_ID, PERF_OTHER_USER_ID } from './backend'
import type { PerfControl } from './control'
import type { PerfElectronHooks } from './perfElectron'
import type { FakeClock, TimerProbe } from './soakProbes'

export interface SoakHourSpec {
  /** Other users' file updates (versions, checkouts, releases) over realtime. */
  realtimeUpdates: number
  /** New server files appearing; last hour's are deleted again, so the vault stays its size. */
  inserts: number
  activity: number
  folderVisits: number
  metadataEdits: number
  checkouts: number
  swCalls: number
  watcherBursts: number
}

export interface SoakHourResult {
  delivered: number
  checkouts: { ok: number; failed: number }
  swCalls: { ok: number; failed: number }
}

export interface SoakControl {
  setClockSpeed(speed: number): void
  simElapsedMs(): number
  /** Jump the app's clock to `targetMs` since boot if it is behind; never moves it back. */
  catchUpClock(targetMs: number): void
  hour(spec: SoakHourSpec): Promise<SoakHourResult>
  /** The socket drops: every channel errors and the window goes offline. */
  dropNetwork(): number
  /** The network returns: channels rejoin (missed events are not replayed) and the window is online. */
  restoreNetwork(): number
  /** Every channel errors and nothing rejoins: only the health monitor can bring them back. */
  killRealtimeSilently(): number
  /** The machine sleeps for `sleepMs` of app time: hidden, offline, the clock jumps, then wakes. */
  sleepWake(sleepMs: number): Promise<void>
  tokenRefresh(): number
  sample(): Promise<Record<string, number>>
}

declare global {
  interface Window {
    __blueplmSoak?: SoakControl
  }
}

export interface SoakProbes {
  timers: TimerProbe
  clock: FakeClock
}

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(0)))
/** Rows seeded into the fake's `files` table so checkout runs the real RPC. */
const CHECKOUT_POOL = 40

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

export function installSoak(
  backend: PerfBackend,
  store: typeof usePDMStore,
  control: PerfControl,
  probes: SoakProbes,
  electron: PerfElectronHooks,
): SoakControl {
  const { db, vault } = backend
  const total = vault.serverRows.length
  let cursor = 0
  let inserted: Row[] = []
  let insertSerial = 0

  // Checkout needs rows the RPC can find; the vault itself is served by get_vault_files_fast.
  for (let i = 0; i < CHECKOUT_POOL; i++) {
    const row = backend.fileRow((i * 997) % total)
    try {
      db.seed('file', { ...row, checked_out_by: null, checked_out_at: null })
    } catch {
      // A row the schema refuses is left out of the pool; its checkouts count as failed.
    }
  }
  void import('@/test/fakeSupabaseRpcs').then(({ checkoutFile, checkinFile }) => {
    db.defineRpc('file_checkout', checkoutFile)
    db.defineRpc('file_checkin', checkinFile)
  })

  const folderOf = (n: number) => {
    const project = `P${String(n % 20).padStart(2, '0')}`
    const assembly = `${project}/Assy-${String(n % 12).padStart(2, '0')}`
    return { project, assembly, folder: `${assembly}/Sub-${String(n % 10).padStart(2, '0')}` }
  }

  const visitFolders = async (count: number) => {
    for (let i = 0; i < count; i++) {
      const n = cursor++
      const { project, assembly, folder } = folderOf(n)
      await control.expandFolders([project, assembly, folder])
      await control.openFolder(folder)
      if (n % 3 === 0) {
        await control.search('Rev-A')
        await control.scrollFileList(4000).catch(() => undefined)
        await control.search('')
      }
      if (n % 5 === 4) await control.collapseAll()
    }
  }

  const insertAndDelete = (count: number) => {
    let delivered = 0
    for (const row of inserted) delivered += db.emitRealtime('file', 'DELETE', {}, row)
    inserted = []
    for (let i = 0; i < count; i++) {
      const base = backend.fileRow((insertSerial * 31) % total)
      const n = insertSerial++
      const row: Row = {
        ...base,
        id: fakeUuid('soak-file'),
        file_path: `P00/Soak/soak-${n}.sldprt`,
        file_name: `soak-${n}.sldprt`,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      inserted.push(row)
      delivered += db.emitRealtime('file', 'INSERT', row)
    }
    return delivered
  }

  const emitActivity = (count: number) => {
    let delivered = 0
    for (let i = 0; i < count; i++) {
      const file = vault.serverRows[(cursor * 7 + i) % total]
      delivered += db.emitRealtime('activity', 'INSERT', {
        id: fakeUuid('soak-activity'),
        org_id: PERF_ORG_ID,
        file_id: file.id,
        user_id: PERF_OTHER_USER_ID,
        user_email: 'olive@example.com',
        action: i % 2 ? 'checkin' : 'checkout',
        details: {},
        created_at: new Date().toISOString(),
      })
    }
    return delivered
  }

  const editMetadata = (count: number) => {
    const files = store.getState().files.filter((f) => !f.isDirectory)
    if (!files.length) return
    for (let i = 0; i < count; i++) {
      const file = files[(cursor * 13 + i) % files.length]
      const state = store.getState()
      state.updatePendingMetadata(file.path, { description: `soak edit ${cursor}-${i}` })
      if (file.pdmData?.id) state.markFileAsRecentlyModified(file.pdmData.id)
      // Saved or discarded later in the session: the pending edit does not stay.
      state.clearPendingMetadata(file.path)
    }
  }

  const checkoutRound = async (count: number) => {
    const result = { ok: 0, failed: 0 }
    const { executeCommand } = await import('@/lib/commands')
    for (let i = 0; i < count; i++) {
      const id = String(db.rows('file')[(cursor + i) % CHECKOUT_POOL]?.id ?? '')
      const file = store.getState().files.find((f) => f.pdmData?.id === id)
      if (!file) {
        result.failed++
        continue
      }
      const out = await executeCommand('checkout', { files: [file] }, { silent: true }).catch(() => null)
      if (out?.success) result.ok++
      else result.failed++
      // Released again from the server side, as a check-in elsewhere would.
      const row = db.rows('file').find((r) => r.id === id)
      if (row) db.updateAndEmit('file', id, { checked_out_by: null, checked_out_at: null, version: Number(row.version) + 1 })
    }
    return result
  }

  const serviceCalls = async (count: number) => {
    const result = { ok: 0, failed: 0 }
    const { getSwReferencesCached } = await import('@/lib/solidworks/referencesCache')
    const root = store.getState().vaultPath ?? ''
    for (let i = 0; i < count; i++) {
      const row = vault.serverRows[(cursor * 17 + i) % total]
      const path = `${root}\\${String(row.file_path).replace(/\//g, '\\')}`
      const references = await getSwReferencesCached(path).catch(() => undefined)
      const properties = await electron.solidworks.getProperties(path).catch(() => undefined)
      if (references !== undefined || properties?.success) result.ok++
      else result.failed++
    }
    return result
  }

  const watcherBurst = (count: number) => {
    for (let b = 0; b < count; b++) {
      const paths = Array.from({ length: 20 }, (_, i) => String(vault.serverRows[(cursor * 3 + b * 20 + i) % total].file_path))
      electron.emit('onFilesChanged', paths)
    }
  }

  const soak: SoakControl = {
    setClockSpeed: (speed) => probes.clock.setSpeed(speed),
    simElapsedMs: () => probes.clock.elapsedMs(),
    catchUpClock(targetMs) {
      const behind = targetMs - probes.clock.elapsedMs()
      if (behind > 0) probes.clock.advance(behind)
    },

    async hour(spec) {
      let delivered = 0
      await visitFolders(spec.folderVisits)
      for (let sent = 0; sent < spec.realtimeUpdates; sent += 50) {
        delivered += await control.realtimeBurst(Math.min(50, spec.realtimeUpdates - sent))
        await nextFrame()
      }
      delivered += insertAndDelete(spec.inserts)
      delivered += emitActivity(spec.activity)
      editMetadata(spec.metadataEdits)
      const checkouts = await checkoutRound(spec.checkouts)
      const swCalls = await serviceCalls(spec.swCalls)
      watcherBurst(spec.watcherBursts)
      await control.waitForQuiet(300, 20_000)
      return { delivered, checkouts, swCalls }
    },

    dropNetwork() {
      setOnline(false)
      return db.dropRealtime()
    },

    restoreNetwork() {
      setOnline(true)
      return db.rejoinRealtime()
    },

    killRealtimeSilently: () => db.dropRealtime(),

    async sleepWake(sleepMs) {
      setHidden(true)
      setOnline(false)
      const dropped = db.dropRealtime()
      probes.clock.advance(sleepMs)
      await nextFrame()
      setHidden(false)
      setOnline(true)
      if (dropped) db.rejoinRealtime()
    },

    tokenRefresh: () => backend.clientHooks.emitAuth('TOKEN_REFRESHED'),

    async sample() {
      const values: Record<string, number> = {}
      values['renderer.domNodes'] = document.getElementsByTagName('*').length
      values['renderer.timers'] = probes.timers.liveTimeouts()
      values['renderer.intervals'] = probes.timers.liveIntervals()
      values['renderer.realtimeChannels'] = backend.clientHooks.channelCount()
      values['renderer.fakeChannels'] = db.openChannelCount()
      values['renderer.authListeners'] = backend.clientHooks.authListenerCount()
      values['renderer.ipcListeners'] = electron.listenerCount()
      try {
        const estimate = await navigator.storage.estimate()
        values['renderer.idbUsageMB'] = (estimate.usage ?? 0) / (1024 * 1024)
      } catch {
        // No storage estimate: the series is left out.
      }
      const [{ rebuildableCacheSizes }, { collectionSizes }, { getAppHealthMonitor }] = await Promise.all([
        import('@/lib/health/cacheRegistry'),
        import('@/lib/health/collectionSizes'),
        import('@/lib/health/appHealthMonitor'),
      ])
      for (const [name, size] of Object.entries(rebuildableCacheSizes())) values[`renderer.caches.${name}`] = size
      for (const [name, size] of Object.entries(collectionSizes(store.getState()))) values[`store.${name}`] = size
      // Counters, not sizes: they rise with every recovery and are reported, never judged.
      for (const [kind, count] of Object.entries(getAppHealthMonitor()?.counts() ?? {})) values[`events.health.${kind}`] = count
      values['events.health.kept'] = getAppHealthMonitor()?.recoveries().length ?? 0
      values['fake.supabaseCalls'] = db.calls.length
      values['fake.misses'] = backend.misses.size
      values['events.simDays'] = probes.clock.elapsedMs() / 86_400_000
      return values
    },
  }

  window.__blueplmSoak = soak
  return soak
}
