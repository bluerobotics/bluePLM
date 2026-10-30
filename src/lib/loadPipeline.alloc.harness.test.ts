/**
 * Allocation harness for the vault load pipeline. No app, no browser: it renders the REAL
 * `useLoadFiles`, `useVaultTree` and `useSorting` hooks through react-dom/server and drives the
 * real store, the real vault file cache and the real merge/reconciliation code over ~29,000
 * synthetic rows. Only the edges are faked: the local scan (electronAPI), the Supabase queries,
 * the sync-index IndexedDB (maps of the same size) and the vault-cache IndexedDB (the shared fake
 * in loadPipelineFakes.ts, which structured-clones on put/get like the real one).
 *
 * The budgeted version of this pipeline, which runs in every `npm test`, is
 * src/perf/loadPipeline.perf.test.ts: it counts round trips and rows written instead of sampling
 * allocation, because the sampling profiler slows the run too much for CI.
 *
 * Skipped by default. Run it with:
 *
 *   $env:BLUEPLM_ALLOC_HARNESS = '1'
 *   $env:NODE_OPTIONS = '--expose-gc --max-old-space-size=8192'
 *   npx vitest run src/lib/loadPipeline.alloc.harness.test.ts
 *
 * Output goes to stdout. Allocation is attributed with V8's sampling heap profiler, including
 * objects already collected by minor and major GC, so a stage that allocates 1 GB of short-lived
 * garbage shows up even though the heap never holds it at once.
 *
 * BLUEPLM_ALLOC_ROWS overrides the row count (default 29000).
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import inspector from 'node:inspector/promises'
import v8 from 'node:v8'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { buildSyntheticVault, FIXTURE_USER_ID, FIXTURE_VAULT_ROOT } from './loadPipelineFixtures'
import { installFakeIndexedDB } from './loadPipelineFakes'
import type { CachedServerFile } from '@/lib/cache/vaultFileCache'

const ENABLED = process.env.BLUEPLM_ALLOC_HARNESS === '1'
const ROW_COUNT = Number(process.env.BLUEPLM_ALLOC_ROWS ?? 29_000)
/** BLUEPLM_ALLOC_PROFILE=0 skips the sampling profiler, which slows allocation-heavy code a lot. */
const PROFILE = process.env.BLUEPLM_ALLOC_PROFILE !== '0'
const BYTES_PER_MB = 1024 * 1024
const SAMPLING_INTERVAL_BYTES = 16_384
const TOP_OWNERS = 14
const BACKGROUND_TASK_SETTLE_MS = 3000

const ORG_ID = 'org-harness'
const VAULT_ID = 'vault-harness'

const state = vi.hoisted(() => ({
  serverRows: [] as unknown[],
  deltaRows: [] as unknown[],
  localEntries: [] as unknown[],
  logs: [] as Array<{ level: string; message: string; data: unknown; heapUsed: number; at: number }>,
}))

vi.mock('@/lib/supabase/files/queries', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/supabase/files/queries')>()
  return {
    ...original,
    getFilesLightweight: vi.fn(async () => ({ files: structuredClone(state.serverRows), error: null })),
    getFilesDelta: vi.fn(async () => ({ files: state.deltaRows, error: null })),
    getVaultFilesCount: vi.fn(async () => ({ count: state.serverRows.length, error: null })),
    getCheckedOutUsers: vi.fn(async () => ({ users: {}, error: null })),
  }
})

vi.mock('@/lib/supabase/files/folders', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/supabase/files/folders')>()
  return { ...original, getVaultFolders: vi.fn(async () => ({ folders: [] })) }
})

// Same-size maps instead of three IndexedDB getAll() calls over 27k entries.
vi.mock('@/lib/cache/localSyncIndex', () => {
  const entryCount = () => state.serverRows.length
  const rowAt = (index: number) => state.serverRows[index] as CachedServerFile
  return {
    getSyncIndex: vi.fn(async () => {
      const map = new Map<string, Record<string, never>>()
      for (let i = 0; i < entryCount(); i++) map.set(rowAt(i).file_path.toLowerCase(), {})
      return map
    }),
    getInodeMap: vi.fn(async () => {
      const map = new Map<number, string[]>()
      for (let i = 0; i < entryCount(); i++) map.set(1_000_000 + i, [rowAt(i).file_path.toLowerCase()])
      return map
    }),
    getVersionMap: vi.fn(async () => {
      const map = new Map<string, { localVersion?: number; localHash?: string }>()
      for (let i = 0; i < entryCount(); i++) {
        const row = rowAt(i)
        map.set(row.file_path.toLowerCase(), { localVersion: row.version, localHash: row.content_hash ?? undefined })
      }
      return map
    }),
    updateSyncIndexFromServer: vi.fn(async () => undefined),
    updateInodes: vi.fn(async () => undefined),
    updateInodesWhenIdle: vi.fn(async () => undefined),
  }
})

function mb(bytes: number): number {
  return Math.round((bytes / BYTES_PER_MB) * 10) / 10
}

function heapUsed(): number {
  return process.memoryUsage().heapUsed
}

function collect(): void {
  const gc = (globalThis as { gc?: () => void }).gc
  gc?.()
}

function out(line: string): void {
  process.stdout.write(`[alloc-harness] ${line}\n`)
}

interface HeapSamplingNode {
  callFrame: { functionName: string; url: string; lineNumber: number }
  selfSize: number
  children: HeapSamplingNode[]
}

/** Total bytes allocated per owning app function (nearest `src/` or `electron/` frame). */
function summariseAllocation(head: HeapSamplingNode): { totalBytes: number; top: Array<[string, number]> } {
  const byOwner = new Map<string, number>()
  let totalBytes = 0

  const visit = (node: HeapSamplingNode, owner: string | null) => {
    const { functionName, url, lineNumber } = node.callFrame
    const isApp = /[\\/]src[\\/]/.test(url) && !url.includes('node_modules')
    const nextOwner = isApp
      ? `${functionName || '(anonymous)'} ${url.split(/[\\/]/).pop()}:${lineNumber + 1}`
      : owner
    if (node.selfSize > 0) {
      totalBytes += node.selfSize
      const key = nextOwner ?? `(non-app) ${functionName || '(anonymous)'}`
      byOwner.set(key, (byOwner.get(key) ?? 0) + node.selfSize)
    }
    for (const child of node.children) visit(child, nextOwner)
  }
  visit(head, null)

  return { totalBytes, top: [...byOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_OWNERS) }
}

/**
 * react-dom/server renders hooks against zustand's *initial* state (its server snapshot), not the
 * current one. Copy the current state into that object so a rendered hook sees the loaded store.
 */
function syncInitialState(store: typeof import('@/stores/pdmStore').usePDMStore): void {
  Object.assign(store.getInitialState(), store.getState())
}

async function profileAllocation<T>(label: string, run: () => Promise<T>): Promise<T> {
  collect()
  if (!PROFILE) {
    const startedAt = performance.now()
    const heapBefore = heapUsed()
    try {
      return await run()
    } finally {
      out(
        `${label}: ${Math.round(performance.now() - startedAt)} ms wall (unprofiled), heapUsed ${mb(heapBefore)} -> ${mb(heapUsed())} MB`,
      )
    }
  }
  const session = new inspector.Session()
  session.connect()
  await session.post('HeapProfiler.enable')
  await session.post('HeapProfiler.startSampling', {
    samplingInterval: SAMPLING_INTERVAL_BYTES,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  })
  const startedAt = performance.now()
  const heapBefore = heapUsed()
  let result: T
  try {
    result = await run()
  } finally {
    const elapsedMs = performance.now() - startedAt
    const { profile } = await session.post('HeapProfiler.stopSampling')
    session.disconnect()
    const summary = summariseAllocation(profile.head as unknown as HeapSamplingNode)
    out(
      `${label}: ${Math.round(elapsedMs)} ms wall, sampled allocation ${mb(summary.totalBytes)} MB, heapUsed ${mb(heapBefore)} -> ${mb(heapUsed())} MB`,
    )
    for (const [owner, bytes] of summary.top) out(`    ${String(mb(bytes)).padStart(8)} MB  ${owner}`)
  }
  return result
}

function installWindow(): void {
  const log = (level: string, message: string, data?: unknown) => {
    state.logs.push({ level, message, data, heapUsed: heapUsed(), at: performance.now() })
  }
  vi.stubGlobal('window', {
    electronAPI: {
      log,
      listWorkingFiles: async () => ({ success: true, files: state.localEntries }),
      listWorkingFilesDelta: async () => ({ success: true, files: state.localEntries, wasFullScan: false }),
      computeFileHashes: async () => ({ success: true, results: [] }),
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })
}

describe.skipIf(!ENABLED)('load pipeline allocation harness', () => {
  let store: typeof import('@/stores/pdmStore').usePDMStore
  let loadFiles: (silent?: boolean, force?: boolean, changed?: string[]) => Promise<void>

  beforeAll(async () => {
    const vault = buildSyntheticVault(ROW_COUNT)
    state.serverRows = vault.serverRows
    state.localEntries = vault.localEntries
    out(
      `fixture: ${vault.serverRows.length} server rows, ${vault.localEntries.length} local entries (${vault.folderPaths.length} folders)`,
    )

    installFakeIndexedDB()
    installWindow()

    store = (await import('@/stores/pdmStore')).usePDMStore
    store.setState({
      organization: { id: ORG_ID } as never,
      user: { id: FIXTURE_USER_ID, email: 'h@example.test', full_name: 'Harness' } as never,
      vaultPath: FIXTURE_VAULT_ROOT,
      activeVaultId: VAULT_ID,
      connectedVaults: [{ id: VAULT_ID, name: 'Harness', localPath: FIXTURE_VAULT_ROOT } as never],
      isOfflineMode: false,
    })

    syncInitialState(store)
    const { useLoadFiles } = await import('@/hooks/useLoadFiles')
    function Probe() {
      loadFiles = useLoadFiles().loadFiles
      return null
    }
    renderToStaticMarkup(createElement(Probe))
  })

  afterAll(async () => {
    // The load schedules background tasks with setTimeout; let them finish before the window
    // they read is removed.
    await new Promise((resolve) => setTimeout(resolve, BACKGROUND_TASK_SETTLE_MS))
    vi.unstubAllGlobals()
  })

  it('stage 1: cache entry cost (sanitize map, structuredClone, IndexedDB put/get)', async () => {
    const cache = await import('@/lib/cache/vaultFileCache')
    const rows = state.serverRows as CachedServerFile[]

    await profileAllocation('setCachedVaultFiles (sanitize map + clone + put)', async () => {
      await cache.setCachedVaultFiles(ORG_ID, VAULT_ID, rows)
    })
    await profileAllocation('getCachedVaultFiles (get + clone + sanitize map + filter)', async () => {
      await cache.getCachedVaultFiles(ORG_ID, VAULT_ID)
    })
    await profileAllocation('applyDeltaToCache, 1-row delta', async () => {
      cache.applyDeltaToCache(rows, [{ ...rows[5], version: 99, deleted_at: null, is_deleted: false }])
    })
    await profileAllocation('structuredClone of the 29k-row entry alone', async () => {
      structuredClone({ files: rows })
    })
    expect(rows.length).toBeGreaterThan(0)
  })

  it('stage 2: full load pipeline, cold then warm cache-hit loads', async () => {
    // Cold: empty store, cache holds the rows, delta is empty.
    state.deltaRows = []
    state.logs.length = 0
    await profileAllocation('LOAD #1 (first load of the session, cache hit, 0-row delta)', () => loadFiles(false, false))
    reportStageLogs()

    // Warm: the reported case, a watcher refresh for one changed path with a 1-row delta.
    const changed = (state.serverRows[7] as CachedServerFile).file_path
    state.deltaRows = [{ ...(state.serverRows[7] as CachedServerFile), version: 50, deleted_at: null, is_deleted: false }]
    state.logs.length = 0
    await profileAllocation('LOAD #2 (silent watcher refresh, 1 changed path, 1-row delta)', () =>
      loadFiles(true, false, [changed]),
    )
    reportStageLogs()

    state.deltaRows = []
    state.logs.length = 0
    await profileAllocation('LOAD #3 (silent watcher refresh, 1 changed path, 0-row delta)', () =>
      loadFiles(true, false, [changed]),
    )
    reportStageLogs()

    expect(store.getState().files.length).toBeGreaterThan(0)
  })

  it('stage 3: store, explorer hooks and realtime deletes over the loaded rows', async () => {
    const { useVaultTree } = await import('@/features/source/explorer/file-tree/hooks/useVaultTree')
    const { useSorting } = await import('@/features/source/browser/hooks/useSorting')
    const { getFilesInFolder } = await import('@/features/source/browser/utils/filtering')
    const { getFolderChildren } = await import('@/features/source/browser/utils/folderIndex')

    const files = store.getState().files
    out(`store holds ${files.length} rows`)

    // setFiles again over a fresh copy: the dedupe + restore maps in the real slice.
    await profileAllocation('setFiles(29k rows) real slice', async () => {
      store.getState().setFiles(files.map((file) => ({ ...file })))
    })

    // Tree + folderMetrics through the real hook (fresh files identity so the memo misses).
    await profileAllocation('useVaultTree: tree + folderMetrics (real hook, SSR render)', async () => {
      store.setState({ files: [...store.getState().files] })
      syncInitialState(store)
      function Probe() {
        useVaultTree()
        return null
      }
      renderToStaticMarkup(createElement(Probe))
    })

    const current = store.getState().files
    const folder = 'P03/Assy-04/Sub-05'
    const time = (label: string, run: () => unknown, repeat = 5): number => {
      collect()
      const startedAt = performance.now()
      for (let i = 0; i < repeat; i++) run()
      const perCallMs = (performance.now() - startedAt) / repeat
      out(`${label}: ${perCallMs.toFixed(2)} ms/call`)
      return perCallMs
    }

    time('getFilesInFolder (old scan), one folder', () => getFilesInFolder(current, folder))
    // Each array identity is looked up three times: plain scan, index build, index read.
    const freshArrays = Array.from({ length: 5 }, () => [...current])
    let firstIndex = 0
    time(
      'getFolderChildren, 1st lookup on a new files array (plain scan)',
      () => getFolderChildren(freshArrays[firstIndex++], folder),
      freshArrays.length,
    )
    let secondIndex = 0
    time(
      'getFolderChildren, 2nd lookup on the same array (builds the index)',
      () => getFolderChildren(freshArrays[secondIndex++], 'P04/Assy-01/Sub-02'),
      freshArrays.length,
    )
    const sameArray = freshArrays[0]
    time('getFolderChildren, 3rd+ lookup on the same array (index read)', () =>
      getFolderChildren(sameArray, 'P05/Assy-02/Sub-03'),
    )

    const oldRows = getFilesInFolder(current, folder)
    const newRows = getFolderChildren(current, folder)
    expect(newRows).toEqual(oldRows)

    await profileAllocation('useSorting (real hook, SSR render), new files array', async () => {
      const files2 = [...store.getState().files]
      function Probe() {
        useSorting({
          files: files2,
          currentPath: folder,
          sortColumn: 'name',
          sortDirection: 'asc',
          toggleSort: () => undefined,
          setSortColumn: () => undefined,
          setSortDirection: () => undefined,
        })
        return null
      }
      renderToStaticMarkup(createElement(Probe))
    })

    // 15 realtime soft deletes: one store update each (old) vs one for the batch (new).
    const ids = current.filter((f) => f.pdmData?.id).slice(100, 115).map((f) => f.pdmData!.id)
    const before = store.getState().files
    await profileAllocation('15 x removeCloudFile (one set each, old behaviour)', async () => {
      for (const id of ids) store.getState().removeCloudFile(id)
    })
    store.setState({ files: before })
    await profileAllocation('1 x removeCloudFiles (15 ids, batched)', async () => {
      store.getState().removeCloudFiles(ids)
    })
    store.setState({ files: before })

    // 753 hydration statuses: 753 sets (old) vs 1 (new).
    const entries: Array<[string, { ownerId: string; state: 'pending'; attempt: number; lastError: null; requestId: string; updatedAt: number }]> =
      Array.from({ length: 753 }, (_, i) => [
        `file-${i}`,
        { ownerId: 'o', state: 'pending', attempt: 0, lastError: null, requestId: 'r', updatedAt: Date.now() },
      ])
    await profileAllocation('753 x setCheckoutHydrationStatus (old)', async () => {
      for (const [id, status] of entries) store.getState().setCheckoutHydrationStatus(id, status)
    })
    store.getState().clearCheckoutHydration()
    await profileAllocation('1 x setCheckoutHydrationStatuses (753, batched)', async () => {
      store.getState().setCheckoutHydrationStatuses(entries)
    })
    store.getState().clearCheckoutHydration()

    // 8,000 auto-download exclusions: 8,000 sets (old) vs 1.
    const paths = Array.from({ length: 8000 }, (_, i) => `Old/Folder-${i % 50}/file-${i}.sldprt`)
    await profileAllocation('8000 x addAutoDownloadExclusion (old)', async () => {
      for (const path of paths) store.getState().addAutoDownloadExclusion(VAULT_ID, path)
    })
    store.getState().clearAutoDownloadExclusions(VAULT_ID)
    await profileAllocation('1 x addAutoDownloadExclusions (8000, batched)', async () => {
      store.getState().addAutoDownloadExclusions(VAULT_ID, paths)
    })

    const heap = v8.getHeapStatistics()
    out(`final heap: used ${mb(heap.used_heap_size)} MB, total ${mb(heap.total_heap_size)} MB`)
  })
})

function reportStageLogs(): void {
  const interesting = [
    '[LoadFiles] Called with',
    '[LoadFiles] Scanned local items',
    '[LoadFiles] Server query params',
    '[LoadFiles] Post-merge folder status',
    '[LoadFiles] Post-merge exclusion pass',
    '[LoadFiles] Calling setFiles',
    '[LoadFiles] setFiles returned',
    '[LoadFiles] Load stage timings',
  ]
  const start = state.logs[0]?.at ?? 0
  const baseHeap = state.logs[0]?.heapUsed ?? 0
  for (const entry of state.logs) {
    if (!interesting.includes(entry.message)) continue
    const data = entry.data as Record<string, unknown> | undefined
    const detail =
      entry.message === '[LoadFiles] Load stage timings' || data?.durationMs !== undefined
        ? ` ${JSON.stringify(data)}`
        : ''
    out(
      `    t+${String(Math.round(entry.at - start)).padStart(6)} ms  heapUsed ${String(mb(entry.heapUsed - baseHeap)).padStart(8)} MB  ${entry.message}${detail}`,
    )
  }
}