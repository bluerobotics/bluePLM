/**
 * Performance gate for the vault load pipeline: operation counts, not wall clock.
 *
 * Renders the REAL `useLoadFiles` through react-dom/server and drives the real store, the real
 * vault file cache and the real sync index over a synthetic vault at 1k, 10k and 30k files. Only
 * the edges are faked, and every fake counts (src/lib/loadPipelineFakes.ts): the Supabase client,
 * `window.electronAPI`, IndexedDB and localStorage.
 *
 * Per size it runs the three loads users report as slow:
 * 1. cold: first start, empty caches, full fetch, every file hashed once;
 * 2. warm: an app restart with a 5-row server delta, caches and saved hash stamps in place;
 * 3. watcher: a silent refresh after 5 files changed on disk.
 *
 * The budgets are what the code does today plus headroom, and the growth checks compare 10k to 30k
 * so an O(n²) step or a per-file query fails here instead of on a user's machine. The baseline
 * numbers are in .cursor/plans/test-audit-C-report.md.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createCountingElectronApi,
  createCountingStorage,
  growthOver,
  installFakeIndexedDB,
  recordingSupabase,
  type FakeIndexedDb,
  type IndexedDbCounters,
} from '@/lib/loadPipelineFakes'
import { buildSyntheticVault, FIXTURE_USER_ID, FIXTURE_VAULT_ROOT, type FixtureLocalEntry } from '@/lib/loadPipelineFixtures'
import type { CachedServerFile } from '@/lib/cache/vaultFileCache'
import { finishIdleSyncIndexWrites } from '@/lib/cache/localSyncIndex'

const SIZES = [1_000, 10_000, 30_000] as const
const ORG_ID = 'org-perf'
const DELTA_ROWS = 5
const CHANGED_ON_DISK = 5
const SYNC_INDEX_DB = 'blueplm-sync-index'
const VAULT_CACHE_DB = 'blueplm-vault-cache'
/** The persist middleware's debounce is 500 ms; wait past it so its write is counted. */
const PERSIST_SETTLE_MS = 650
/** Three loads plus the persist waits; the 30k run takes about 5 s on the cloud runner. */
const LOAD_TEST_TIMEOUT_MS = 60_000
/**
 * Backstop only, at least 10x the measured time (the 30k cold load took about 2.5 s): it catches
 * something quadratic, not a slow runner. Windows and coverage runs are slower.
 */
const COLD_LOAD_30K_CEILING_MS = 30_000

const h = vi.hoisted(() => ({
  logCalls: 0,
  backgroundRuns: [] as Promise<void>[],
}))

vi.mock('@/lib/logger', () => {
  const count = () => {
    h.logCalls += 1
  }
  return { log: { debug: count, info: count, warn: count, error: count } }
})

vi.mock('@/lib/supabase/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/supabase/client')>()
  const { recordingSupabase: fake } = await import('@/lib/loadPipelineFakes')
  return { ...original, getSupabaseClient: () => fake.client, supabase: fake.client }
})

// The background pass (profiles, hashing) is started from a setTimeout; keep its promise so a
// test can wait for it instead of sleeping.
vi.mock('@/hooks/useLoadFiles/backgroundTasks', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/useLoadFiles/backgroundTasks')>()
  return {
    ...original,
    runPostLoadBackgroundTasks: (ctx: Parameters<typeof original.runPostLoadBackgroundTasks>[0]) => {
      const run = original.runPostLoadBackgroundTasks(ctx)
      h.backgroundRuns.push(run)
      return run
    },
  }
})

interface LoadCounts {
  supabase: Record<string, number>
  supabaseCalls: number
  ipc: Record<string, number>
  ipcFunctional: number
  hashItems: number
  syncIndex: IndexedDbCounters
  vaultCache: IndexedDbCounters
  storeSets: number
  persistWrites: number
  persistBytes: number
  logCalls: number
  wallMs: number
}

type Results = Record<number, { cold: LoadCounts; warm: LoadCounts; watcher: LoadCounts }>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function settleMacrotasks(turns = 20): Promise<void> {
  for (let i = 0; i < turns; i++) await sleep(0)
}

function out(line: string): void {
  process.stdout.write(`[perf:load] ${line}\n`)
}

describe('load pipeline performance gate', () => {
  const results: Results = {}
  let idb: FakeIndexedDb
  let store: typeof import('@/stores/pdmStore').usePDMStore
  const storage = createCountingStorage()
  let storeSets = 0

  // What the disk and server look like for the size under test.
  let serverRows: CachedServerFile[] = []
  let deltaRows: CachedServerFile[] = []
  let localEntries: FixtureLocalEntry[] = []
  const diskHash = new Map<string, string>()

  const electron = createCountingElectronApi({
    listWorkingFiles: async () => ({ success: true, files: localEntries.map((entry) => ({ ...entry })) }),
    listWorkingFilesDelta: async () => ({
      success: true,
      files: localEntries.map((entry) => ({ ...entry })),
      wasFullScan: false,
    }),
    computeFileHashes: async (requests: unknown) => ({
      success: true,
      results: (requests as Array<{ relativePath: string }>).map((request) => ({
        relativePath: request.relativePath,
        hash: diskHash.get(request.relativePath) ?? 'unknown',
      })),
    }),
    log: () => undefined,
  })

  beforeAll(async () => {
    idb = installFakeIndexedDB()
    vi.stubGlobal('localStorage', storage.storage)
    vi.stubGlobal('window', {
      electronAPI: electron.api,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })

    recordingSupabase.setResponder((query) => {
      if (query.kind === 'rpc' && query.name === 'vault_file_list') {
        return { data: structuredClone(serverRows) }
      }
      if (query.kind === 'rpc' && query.name === 'vault_file_list_delta') {
        return { data: structuredClone(deltaRows).map((row) => ({ ...row, is_deleted: false, deleted_at: null })) }
      }
      if (query.kind === 'rpc' && query.name === 'vault_file_count') return { data: serverRows.length }
      if (query.kind === 'table' && query.name === 'app_user') {
        const ids = (query.filters.find(([method]) => method === 'in')?.[1][1] as string[] | undefined) ?? []
        return { data: ids.map((id) => ({ id, email: `${id}@example.test`, full_name: id, avatar_url: null })) }
      }
      return { data: [] }
    })

    store = (await import('@/stores/pdmStore')).usePDMStore
    store.subscribe(() => {
      storeSets += 1
    })
  })

  afterAll(async () => {
    await settleMacrotasks()
    vi.unstubAllGlobals()
  })

  /** react-dom/server renders against zustand's initial state; copy the live state into it. */
  function syncInitialState(): void {
    Object.assign(store.getInitialState(), store.getState())
  }

  async function mountLoadFiles(): Promise<(silent?: boolean, force?: boolean, changed?: string[]) => Promise<void>> {
    syncInitialState()
    const { useLoadFiles } = await import('@/hooks/useLoadFiles')
    let loadFiles: ((silent?: boolean, force?: boolean, changed?: string[]) => Promise<void>) | null = null
    function Probe() {
      loadFiles = useLoadFiles().loadFiles
      return null
    }
    renderToStaticMarkup(createElement(Probe))
    if (!loadFiles) throw new Error('useLoadFiles did not render')
    return loadFiles
  }

  async function measure(run: () => Promise<void>): Promise<LoadCounts> {
    recordingSupabase.reset()
    electron.reset()
    idb.reset()
    storage.reset()
    storeSets = 0
    h.logCalls = 0
    const backgroundBefore = h.backgroundRuns.length

    const startedAt = performance.now()
    await run()
    // The background pass starts 50 ms after the merge commits.
    for (let i = 0; i < 100 && h.backgroundRuns.length === backgroundBefore; i++) await sleep(10)
    await Promise.all(h.backgroundRuns.slice(backgroundBefore))
    // The background hash pass persists its hashes when the main thread is idle; that write is
    // still this load's work, so it is finished and counted here.
    await finishIdleSyncIndexWrites()
    const wallMs = Math.round(performance.now() - startedAt)
    // Fire-and-forget IndexedDB writes, then the persist debounce.
    await settleMacrotasks()
    await sleep(PERSIST_SETTLE_MS)

    const supabase = recordingSupabase.summary()
    return {
      supabase,
      supabaseCalls: recordingSupabase.calls.length,
      ipc: Object.fromEntries(electron.calls),
      ipcFunctional: electron.functionalCalls(),
      hashItems: electron.hashRequestItems(),
      syncIndex: { ...idb.counter(SYNC_INDEX_DB) },
      vaultCache: { ...idb.counter(VAULT_CACHE_DB) },
      storeSets,
      persistWrites: storage.setItemCalls(),
      persistBytes: storage.lastBytes(),
      logCalls: h.logCalls,
      wallMs,
    }
  }

  for (const size of SIZES) {
    it(`loads a ${size}-file vault within its operation budget`, async () => {
      const vault = buildSyntheticVault(size)
      const vaultId = `vault-perf-${size}`
      serverRows = vault.serverRows
      localEntries = vault.localEntries
      deltaRows = []
      diskHash.clear()
      for (const row of serverRows) diskHash.set(row.file_path, row.content_hash ?? '')

      store.setState({
        organization: { id: ORG_ID } as never,
        user: { id: FIXTURE_USER_ID, email: 'perf@example.test', full_name: 'Perf' } as never,
        vaultPath: FIXTURE_VAULT_ROOT,
        activeVaultId: vaultId,
        connectedVaults: [{ id: vaultId, name: 'Perf', localPath: FIXTURE_VAULT_ROOT } as never],
        isOfflineMode: false,
        files: [],
        serverFiles: [],
        filesLoaded: false,
      })

      // 1. Cold start.
      let loadFiles = await mountLoadFiles()
      const cold = await measure(() => loadFiles(false, false))
      const fileRows = store.getState().files.filter((file) => !file.isDirectory).length
      expect(fileRows).toBe(size)

      // 2. Restart: the in-memory store is gone, IndexedDB is not; the server has 5 newer rows.
      const updatedAt = '2026-10-11T12:00:00.000Z'
      deltaRows = serverRows.slice(0, DELTA_ROWS).map((row) => ({
        ...row,
        version: row.version + 1,
        content_hash: `${row.content_hash}-v2`,
        updated_at: updatedAt,
      }))
      const deltaById = new Map(deltaRows.map((row) => [row.id, row]))
      serverRows = serverRows.map((row) => deltaById.get(row.id) ?? row)
      store.setState({ files: [], serverFiles: [], filesLoaded: false })
      loadFiles = await mountLoadFiles()
      const warm = await measure(() => loadFiles(false, false))

      // 3. Watcher: five files saved on disk, a silent refresh for exactly those paths.
      const changed = localEntries
        .filter((entry) => !entry.isDirectory)
        .slice(100, 100 + CHANGED_ON_DISK)
      for (const entry of changed) {
        entry.size += 1
        entry.modifiedTime = '2026-10-20T08:00:00.000Z'
        diskHash.set(entry.relativePath, `edited-${entry.relativePath}`)
      }
      deltaRows = []
      const watcher = await measure(() =>
        loadFiles(
          true,
          false,
          changed.map((entry) => entry.relativePath),
        ),
      )
      const modified = store
        .getState()
        .files.filter((file) => changed.some((entry) => entry.relativePath === file.relativePath))
      expect(modified.every((file) => file.diffStatus === 'modified')).toBe(true)

      results[size] = { cold, warm, watcher }
      for (const [phase, counts] of Object.entries(results[size])) out(`${size} ${phase} ${JSON.stringify(counts)}`)

      // Round trips are fixed per load, whatever the vault size.
      for (const counts of [cold, warm, watcher]) {
        expect(counts.supabaseCalls).toBeLessThanOrEqual(6)
        expect(counts.ipcFunctional).toBeLessThanOrEqual(4)
        expect(counts.storeSets).toBeLessThanOrEqual(30)
        expect(counts.persistWrites).toBeLessThanOrEqual(2)
      }
      expect(cold.supabase['rpc:vault_file_list']).toBe(1)
      expect(warm.supabase['rpc:vault_file_list'] ?? 0).toBe(0)
      expect(warm.supabase['rpc:vault_file_list_delta']).toBe(1)

      // Hashing: everything once when nothing is known, nothing on a restart with valid stamps,
      // and only the changed files after a save.
      expect(cold.hashItems).toBe(serverRows.length - Math.ceil((serverRows.length - 1) / 33))
      expect(warm.hashItems).toBe(0)
      expect(watcher.hashItems).toBe(CHANGED_ON_DISK)
      expect(cold.ipc.computeFileHashes).toBe(1)

      // The vault cache entry is written by the full fetch and once more when the checkout
      // profiles first arrive. A small delta, and profiles the cache already holds, rewrite
      // nothing and read nothing beyond the one cache read.
      expect(cold.vaultCache.puts).toBeLessThanOrEqual(2)
      for (const counts of [warm, watcher]) {
        expect(counts.vaultCache.putRows).toBe(0)
        expect(counts.vaultCache.gets).toBe(1)
      }

      // The sync index is built on the first load; afterwards only what changed is written,
      // and the vault's entries are read in one shared pass, not once per consumer.
      expect(warm.syncIndex.puts).toBeLessThanOrEqual(DELTA_ROWS * 2)
      expect(watcher.syncIndex.puts).toBeLessThanOrEqual(CHANGED_ON_DISK * 2)
      for (const counts of [warm, watcher]) {
        expect(counts.syncIndex.gets).toBeLessThanOrEqual(CHANGED_ON_DISK * 2)
        expect(counts.syncIndex.getAlls).toBeLessThanOrEqual(3)
      }
       }, LOAD_TEST_TIMEOUT_MS)
  }

  it('grows linearly from 10k to 30k files', () => {
    const small = results[10_000]
    const large = results[30_000]
    expect(small && large).toBeTruthy()

    const linear = (pick: (counts: { cold: LoadCounts; warm: LoadCounts; watcher: LoadCounts }) => number) =>
      growthOver(pick(small), pick(large), 10_000, 30_000)

    // Counts that scale with the vault scale with it, never faster.
    expect(linear((r) => r.cold.hashItems)).toBeLessThanOrEqual(1.05)
    expect(linear((r) => r.cold.syncIndex.puts + r.cold.syncIndex.gets)).toBeLessThanOrEqual(1.05)
    expect(linear((r) => r.cold.logCalls)).toBeLessThanOrEqual(1.05)
    // The persisted blob does not carry the file list: it does not grow with the vault.
    expect(large.cold.persistBytes).toBeLessThanOrEqual(small.cold.persistBytes * 1.1 + 1024)
    expect(large.cold.wallMs).toBeLessThanOrEqual(COLD_LOAD_30K_CEILING_MS)
  })
})
