/**
 * Performance gate for what runs over a loaded store: persist bursts, folder lookups and realtime
 * event bursts. Operation counts at 1k, 10k and 30k files (src/lib/loadPipelineFakes.ts).
 *
 * Realtime runs the REAL `useRealtimeSubscriptions` effect: `react`'s `useEffect` is replaced by
 * one that runs its effect at once, so rendering the hook through react-dom/server subscribes it,
 * and `@/lib/realtime` hands the file callback to the test, which then plays a burst of events.
 * Every store update is counted, because each one rebuilds the explorer tree and re-sorts the
 * folder (about half a second at 25k files, see the removal batcher in useRealtimeSubscriptions).
 *
 * Baseline numbers: .cursor/plans/test-audit-C-report.md.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createCountingStorage,
  growthOver,
  recordingSupabase,
} from '@/lib/loadPipelineFakes'
import {
  buildLoadedStoreFiles,
  buildSyntheticVault,
  FIXTURE_USER_ID,
  FIXTURE_VAULT_ROOT,
} from '@/lib/loadPipelineFixtures'
import type { LocalFile } from '@/stores/types'
import type { PDMFile } from '@/types/pdm'

const SIZES = [1_000, 10_000, 30_000] as const
const BURST = 200
const ORG_ID = 'org-perf'
const OTHER_USER = 'user-other-0002'

type FileCallback = (eventType: 'INSERT' | 'UPDATE' | 'DELETE', newFile?: PDMFile, oldFile?: PDMFile) => void

const h = vi.hoisted(() => ({
  fileCallback: null as null | ((eventType: 'INSERT' | 'UPDATE' | 'DELETE', newFile?: unknown, oldFile?: unknown) => void),
}))

vi.mock('@/lib/logger', () => {
  const noop = () => undefined
  return { log: { debug: noop, info: noop, warn: noop, error: noop } }
})

vi.mock('@/lib/supabase/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/supabase/client')>()
  const { recordingSupabase: fake } = await import('@/lib/loadPipelineFakes')
  return { ...original, getSupabaseClient: () => fake.client, supabase: fake.client }
})

vi.mock('@/lib/realtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/realtime')>()
  const none = () => () => undefined
  return {
    ...original,
    subscribeToFiles: (_orgId: string, callback: FileCallback) => {
      h.fileCallback = callback as typeof h.fileCallback
      return () => undefined
    },
    subscribeToFolders: none,
    subscribeToActivity: none,
    subscribeToOrganization: none,
    subscribeToColorSwatches: none,
    subscribeToPermissions: none,
    subscribeToVaults: none,
    unsubscribeAll: () => undefined,
  }
})

// Effects run during the server render, so the hook subscribes.
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>()
  const useEffect = (effect: () => void | (() => void)) => {
    effect()
  }
  return { ...original, default: { ...original, useEffect }, useEffect }
})

// The 30k cases take a few seconds on the cloud runner, more on Windows and under coverage.
vi.setConfig({ testTimeout: 60_000 })

function out(line: string): void {
  process.stdout.write(`[perf:store] ${line}\n`)
}

/** Wraps rows so every property read is counted: the deterministic cost of a pass over them. */
function countReads(files: LocalFile[]): { rows: LocalFile[]; reads: () => number } {
  let reads = 0
  const rows = files.map(
    (file) =>
      new Proxy(file, {
        get(target, prop, receiver) {
          reads += 1
          return Reflect.get(target, prop, receiver)
        },
      }),
  )
  return { rows, reads: () => reads }
}

describe('store, folder index and realtime performance gate', () => {
  const storage = createCountingStorage()
  let store: typeof import('@/stores/pdmStore').usePDMStore
  let storeSets = 0

  beforeAll(async () => {
    vi.stubGlobal('localStorage', storage.storage)
    vi.stubGlobal('window', {
      electronAPI: new Proxy({}, { get: () => () => Promise.resolve({ success: true }) }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })
    recordingSupabase.setResponder((query) => {
      if (query.kind === 'table' && query.name === 'app_user') {
        return { data: { id: OTHER_USER, email: 'other@example.test', full_name: 'Other', avatar_url: null } }
      }
      if (query.kind === 'table' && query.name === 'file') return { data: { checked_out_by: OTHER_USER } }
      return { data: null }
    })
    store = (await import('@/stores/pdmStore')).usePDMStore
    // Loaded up front: the hook imports it lazily, and fake timers should not wait on a module load.
    await import('@/lib/supabase')
    store.subscribe(() => {
      storeSets += 1
    })
  })

  afterAll(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('coalesces a burst of store writes into one persist write', () => {
    vi.useFakeTimers()
    try {
      const files = buildLoadedStoreFiles(buildSyntheticVault(30_000))
      store.setState({ files })
      vi.advanceTimersByTime(1_000)
      const blobWithFiles = storage.lastBytes()

      // State that is not persisted never reaches storage.
      storage.reset()
      for (let i = 0; i < 5_000; i++) store.setState({ isLoading: i % 2 === 0 })
      vi.advanceTimersByTime(1_000)
      expect(storage.setItemCalls()).toBe(0)

      // A burst of persisted changes is one write.
      for (let i = 0; i < 5_000; i++) store.setState({ expandedFolders: new Set([`P00/Assy-${i % 12}`]) })
      vi.advanceTimersByTime(1_000)
      expect(storage.setItemCalls()).toBe(1)

      // Separate bursts are separate writes, and each is the size of the blob, not of the vault.
      storage.reset()
      for (let burst = 0; burst < 20; burst++) {
        for (let i = 0; i < 50; i++) store.setState({ expandedFolders: new Set([`P01/Assy-${burst}-${i}`]) })
        vi.advanceTimersByTime(600)
      }
      expect(storage.setItemCalls()).toBe(20)
      out(`persist blob ${blobWithFiles} bytes with 30k files; 20 bursts wrote ${storage.setItemBytes()} bytes`)
      expect(blobWithFiles).toBeLessThan(64 * 1024)
      expect(storage.setItemBytes()).toBeLessThan(20 * 64 * 1024)
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers folder lookups from an index, not a scan per lookup', async () => {
    const { getFolderChildren } = await import('@/features/source/browser/utils/folderIndex')
    const readsBySize: Record<number, number> = {}
    for (const size of SIZES) {
      const vault = buildSyntheticVault(size)
      const { rows, reads } = countReads(buildLoadedStoreFiles(vault))
      const folders = vault.folderPaths.slice(0, 200)
      for (const folder of folders) getFolderChildren(rows, folder)
      readsBySize[size] = reads()
      out(`folder index ${size}: ${readsBySize[size]} row reads for ${folders.length} lookups`)
      // Two passes to build the index, then lookups that read nothing per row.
      expect(readsBySize[size]).toBeLessThanOrEqual(rows.length * 12)
    }
    expect(growthOver(readsBySize[10_000], readsBySize[30_000], 10_000, 30_000)).toBeLessThanOrEqual(1.1)
  })

  describe('realtime bursts', () => {
    const results: Record<number, Record<string, { sets: number; supabase: number }>> = {}

    async function mountRealtime(): Promise<void> {
      Object.assign(store.getInitialState(), store.getState())
      const { useRealtimeSubscriptions } = await import('@/hooks/useRealtimeSubscriptions')
      function Probe() {
        useRealtimeSubscriptions({ id: ORG_ID } as never, false)
        return null
      }
      renderToStaticMarkup(createElement(Probe))
      if (!h.fileCallback) throw new Error('useRealtimeSubscriptions did not subscribe')
    }

    async function playBurst(
      label: string,
      size: number,
      events: Array<[eventType: 'INSERT' | 'UPDATE', newFile: PDMFile, oldFile?: PDMFile]>,
    ) {
      storeSets = 0
      recordingSupabase.reset()
      for (const [eventType, newFile, oldFile] of events) h.fileCallback!(eventType, newFile, oldFile)
      // Every batching window the hook uses has passed, and the lookups it started have answered.
      await vi.advanceTimersByTimeAsync(5_000)
      results[size] ??= {}
      results[size][label] = { sets: storeSets, supabase: recordingSupabase.calls.length }
      return results[size][label]
    }

    for (const size of SIZES) {
      it(`applies ${BURST}-event bursts over a ${size}-file store in a bounded number of store updates`, async () => {
        vi.useFakeTimers()
        try {
          const vaultId = `vault-perf-${size}`
          const vault = buildSyntheticVault(size)
          // Rows count their property reads, so a scan per event shows up as reads x events.
          const { rows: files, reads } = countReads(buildLoadedStoreFiles(vault))
          store.setState({
            organization: { id: ORG_ID } as never,
            user: { id: FIXTURE_USER_ID, email: 'perf@example.test', full_name: 'Perf' } as never,
            vaultPath: FIXTURE_VAULT_ROOT,
            activeVaultId: vaultId,
            connectedVaults: [{ id: vaultId, name: 'Perf', localPath: FIXTURE_VAULT_ROOT } as never],
            files,
          })
          await mountRealtime()

          const synced = files.filter((file) => !file.isDirectory && file.pdmData && !file.pdmData.checked_out_by)
          const rowOf = (file: LocalFile) => ({ ...(file.pdmData as PDMFile), vault_id: vaultId }) as PDMFile

          // Another user checks in a new version of a batch of files.
          const readsBefore = reads()
          const versions = await playBurst(
            'version',
            size,
            synced.slice(0, BURST).map((file) => {
              const before = rowOf(file)
              return ['UPDATE', { ...before, version: before.version + 1, updated_by: OTHER_USER } as PDMFile, before]
            }),
          )

          // Each event used to look its row up with a scan of the store (two or three of them):
          // 200 events over 30k rows were ~18M row reads. Now an index per files array.
          const versionReads = reads() - readsBefore
          out(`realtime ${size}: version burst read ${versionReads} row properties`)
          expect(versionReads).toBeLessThanOrEqual(files.length * 60)

          // Another user trashes a batch of files (a soft delete arrives as an UPDATE).
          const deletes = await playBurst(
            'delete',
            size,
            synced.slice(BURST, BURST * 2).map((file) => {
              const before = rowOf(file)
              return [
                'UPDATE',
                { ...before, deleted_at: '2026-10-25T10:00:00.000Z', updated_by: OTHER_USER } as PDMFile,
                { ...before, deleted_at: null } as PDMFile,
              ]
            }),
          )

          // Another user adds a batch of files.
          const inserts = await playBurst(
            'insert',
            size,
            Array.from({ length: BURST }, (_, i) => [
              'INSERT',
              {
                ...rowOf(synced[0]),
                id: `inserted-${size}-${i}`,
                file_path: `P00/Assy-00/Sub-00/NEW-${i}.sldprt`,
                file_name: `NEW-${i}.sldprt`,
                created_by: OTHER_USER,
              } as PDMFile,
            ]),
          )

          // Another user checks out a batch of files.
          const checkouts = await playBurst(
            'checkout',
            size,
            synced.slice(BURST * 2, BURST * 3).map((file) => {
              const before = rowOf(file)
              return [
                'UPDATE',
                { ...before, checked_out_by: OTHER_USER, updated_by: OTHER_USER } as PDMFile,
                before,
              ]
            }),
          )

          out(`realtime ${size}: ${JSON.stringify(results[size])}`)
          for (const burst of [versions, deletes, inserts, checkouts]) {
            expect(burst.sets).toBeLessThanOrEqual(4)
            // No query per event: profiles and names are looked up per user, not per file.
            expect(burst.supabase).toBeLessThanOrEqual(3)
          }
          const checkedOut = store
            .getState()
            .files.filter((file) => file.pdmData?.checked_out_by === OTHER_USER && file.pdmData.checked_out_user)
          expect(checkedOut.length).toBeGreaterThanOrEqual(BURST)
        } finally {
          vi.useRealTimers()
        }
      })
    }
  })
})
