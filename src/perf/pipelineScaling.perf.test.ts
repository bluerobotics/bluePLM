/**
 * Performance gate for the pure stages of the load (rename detection, merge and classification,
 * cloud reconciliation, the hash selection), Re-align (`analyzeAlignment`, `applyAlignment`) and
 * the first check-in (`syncFile`), at 1k, 10k and 30k files.
 *
 * The pure stages are measured by property reads: every input row is a Proxy that counts reads,
 * which is deterministic and grows exactly as the algorithm does. A linear pass reads each row a
 * fixed number of times; a scan per row would read n times more and fails the growth check.
 * Round trips (IndexedDB, commands, Supabase) are counted by the fakes in
 * src/lib/loadPipelineFakes.ts.
 *
 * Baseline numbers: .cursor/plans/test-audit-C-report.md.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  growthOver,
  installFakeIndexedDB,
  recordingSupabase,
  type FakeIndexedDb,
} from '@/lib/loadPipelineFakes'
import {
  buildSyntheticVault,
  FIXTURE_USER_ID,
  FIXTURE_VAULT_ROOT,
  type FixtureLocalEntry,
} from '@/lib/loadPipelineFixtures'
import type { CachedServerFile } from '@/lib/cache/vaultFileCache'
import type { SavedVersionData, SyncIndexPathInfo } from '@/lib/cache/localSyncIndex'
import type { CommandResult } from '@/lib/commands/types'
import type { LocalFile } from '@/stores/types'
import type { PDMFile } from '@/types/pdm'

const SIZES = [1_000, 10_000, 30_000] as const
const SYNC_INDEX_DB = 'blueplm-sync-index'
const NO_YIELD = async () => undefined

const h = vi.hoisted(() => ({
  commands: [] as Array<{ name: string; count: number }>,
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

vi.mock('@/lib/commands/executor', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/commands/executor')>()
  return {
    ...original,
    executeCommand: async (name: string, params: { files?: unknown[]; fileIds?: unknown[] }) => {
      const count = params?.files?.length ?? params?.fileIds?.length ?? 0
      h.commands.push({ name, count })
      const result: CommandResult = { success: true, message: '', total: count, succeeded: count, failed: 0 }
      return result
    },
  }
})

// The 30k cases take a few seconds on the cloud runner, more on Windows and under coverage.
vi.setConfig({ testTimeout: 60_000 })

function out(line: string): void {
  process.stdout.write(`[perf:scaling] ${line}\n`)
}

/** Wraps rows so every property read is counted. */
function countReads<T extends object>(rows: T[]): { rows: T[]; reads: () => number } {
  let reads = 0
  const wrapped = rows.map(
    (row) =>
      new Proxy(row, {
        get(target, prop, receiver) {
          reads += 1
          return Reflect.get(target, prop, receiver)
        },
      }),
  )
  return { rows: wrapped, reads: () => reads }
}

interface Scenario {
  serverRows: CachedServerFile[]
  scanned: Array<FixtureLocalEntry & { localHash?: string }>
  savedInodeMap: Map<number, string[]>
  savedVersionMap: Map<string, SavedVersionData>
  syncedPaths: Map<string, SyncIndexPathInfo>
}

/**
 * A vault that has drifted the way real ones do: 2% of files renamed on disk (same inode), 1%
 * deleted on the server while still on disk (orphans), every 160th file checked out by me and
 * deleted locally (ghosts), the rest in sync, with saved versions and hashes from a prior load.
 */
function buildDriftedScenario(size: number): Scenario {
  const vault = buildSyntheticVault(size)
  const serverRows: CachedServerFile[] = []
  const savedInodeMap = new Map<number, string[]>()
  const savedVersionMap = new Map<string, SavedVersionData>()
  const syncedPaths = new Map<string, SyncIndexPathInfo>()
  const localByPath = new Map(vault.localEntries.map((entry) => [entry.relativePath, entry]))
  const scanned: Scenario['scanned'] = vault.localEntries.filter((entry) => entry.isDirectory)

  vault.serverRows.forEach((row, i) => {
    const lower = row.file_path.toLowerCase()
    const local = localByPath.get(row.file_path)
    syncedPaths.set(lower, {})
    const orphan = i % 100 === 3
    if (!orphan) serverRows.push(row)
    if (!local) return
    savedInodeMap.set(local.ino, [lower])
    savedVersionMap.set(lower, {
      localVersion: row.version,
      localHash: row.content_hash ?? undefined,
      hashStamp: { size: local.size, mtimeMs: Date.parse(local.modifiedTime) },
    })
    if (i % 160 === 0 && row.checked_out_by === FIXTURE_USER_ID) return
    if (i % 50 === 7) {
      const folder = row.file_path.slice(0, row.file_path.lastIndexOf('/'))
      const name = `RENAMED-${local.name}`
      scanned.push({
        ...local,
        name,
        relativePath: `${folder}/${name}`,
        path: `${FIXTURE_VAULT_ROOT}\\${folder.replace(/\//g, '\\')}\\${name}`,
      })
      return
    }
    scanned.push({ ...local, localHash: row.content_hash ?? undefined })
  })
  return { serverRows, scanned, savedInodeMap, savedVersionMap, syncedPaths }
}

describe('pipeline scaling performance gate', () => {
  let idb: FakeIndexedDb
  const merged: Record<number, LocalFile[]> = {}

  beforeAll(() => {
    idb = installFakeIndexedDB()
    vi.stubGlobal('window', {
      electronAPI: new Proxy({}, { get: () => () => Promise.resolve({ success: true }) }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })
  })

  it('merges, reconciles and classifies in a fixed number of reads per row', async () => {
    const { detectInodeRenames } = await import('@/hooks/useLoadFiles/renameDetection')
    const { buildMergeLookups, buildSyncIndexEntries, mergeLocalFileWithServer } = await import(
      '@/hooks/useLoadFiles/mergeLocalFile'
    )
    const { reconcileCloudFiles } = await import('@/hooks/useLoadFiles/cloudFileReconciliation')
    const { selectFilesNeedingHash } = await import('@/hooks/useLoadFiles/fileClassification')

    const readsPerRow: Record<number, number> = {}
    for (const size of SIZES) {
      const scenario = buildDriftedScenario(size)
      const server = countReads(scenario.serverRows)
      const local = countReads(scenario.scanned)
      const pdmMap = new Map(server.rows.map((row) => [row.file_path.toLowerCase(), row as unknown as PDMFile]))
      const localPathSet = new Set(local.rows.map((row) => row.relativePath.toLowerCase()))
      const checkedOutByMeByHash = new Map<string, PDMFile>()
      for (const row of server.rows) {
        if (row.content_hash && row.checked_out_by === FIXTURE_USER_ID) {
          checkedOutByMeByHash.set(row.content_hash, row as unknown as PDMFile)
        }
      }

      const renames = detectInodeRenames(local.rows, pdmMap, localPathSet, scenario.savedInodeMap)
      const rehashPaths = new Set<string>()
      const context = {
        lookups: buildMergeLookups([], scenario.savedVersionMap, () => false),
        pdmMap,
        serverFoldersMap: new Map(),
        inodeRenameMap: renames.inodeRenameMap,
        checkedOutByMeByHash,
        localPathSet,
        localSyncIndex: scenario.syncedPaths,
        isIgnoredPath: () => false,
        persistedPendingMetadata: {},
        userId: FIXTURE_USER_ID,
        vaultPath: FIXTURE_VAULT_ROOT,
        rehashPaths,
        orphansEditedSinceServerRowLost: new Set<string>(),
        stats: { matched: 0, unmatched: 0, unmatchedSamples: [] as string[] },
      }
      const mergedRows = local.rows.map((row) => mergeLocalFileWithServer(row, context))
      const reconciled = await reconcileCloudFiles({
        pdmFiles: server.rows,
        localFiles: mergedRows,
        localPathSet,
        inodeMatchedServerPaths: renames.inodeMatchedServerPaths,
        inodeMatchedServerPathToLocalPath: renames.inodeMatchedServerPathToLocalPath,
        existingCheckedOutUsers: context.lookups.checkedOutUsers,
        userId: FIXTURE_USER_ID,
        vaultPath: FIXTURE_VAULT_ROOT,
        yieldIfSlow: NO_YIELD,
        yieldCheckStride: 256,
      })
      buildSyncIndexEntries(reconciled.localFiles, rehashPaths)
      const needingHash = selectFilesNeedingHash(reconciled.localFiles, rehashPaths, false)
      merged[size] = reconciled.localFiles

      const statuses: Record<string, number> = {}
      for (const file of reconciled.localFiles) {
        if (file.isDirectory) continue
        const key = file.diffStatus ?? 'synced'
        statuses[key] = (statuses[key] ?? 0) + 1
      }
      const rows = server.rows.length + local.rows.length
      readsPerRow[size] = (server.reads() + local.reads()) / rows
      out(
        `merge ${size}: ${server.reads() + local.reads()} reads over ${rows} rows (${readsPerRow[size].toFixed(1)}/row), ${needingHash.length} to hash, ${JSON.stringify(statuses)}`,
      )

      // The drift is detected, not just survived.
      expect(statuses.moved).toBeGreaterThan(0)
      expect(statuses.moved_away).toBeGreaterThan(0)
      expect(statuses.deleted_remote).toBeGreaterThan(0)
      // Saved hashes with valid stamps are reused: nothing synced is re-hashed.
      expect(needingHash.length).toBeLessThanOrEqual(Math.ceil(size / 50) + 10)
      expect(readsPerRow[size]).toBeLessThanOrEqual(60)
    }
    expect(readsPerRow[30_000] / readsPerRow[10_000]).toBeLessThanOrEqual(1.1)
  })

  it('analyzes alignment in a fixed number of reads per row', async () => {
    const { analyzeAlignment } = await import('@/lib/realign/analyzeAlignment')
    const readsBySize: Record<number, number> = {}
    for (const size of SIZES) {
      const { rows, reads } = countReads(merged[size])
      const report = analyzeAlignment({
        files: rows,
        serverFileCount: size,
        vaultId: `vault-perf-${size}`,
        currentUserId: FIXTURE_USER_ID,
      })
      readsBySize[size] = reads()
      out(`analyzeAlignment ${size}: ${readsBySize[size]} reads, ${report.buckets.length} buckets`)
    }
    expect(growthOver(readsBySize[10_000], readsBySize[30_000], 10_000, 30_000)).toBeLessThanOrEqual(1.1)
  })

  it('applies alignment with one command per step and a linear sync index repair', async () => {
    const { applyAlignment } = await import('@/lib/realign/applyAlignment')
    const { getVersionMap, updateInodes } = await import('@/lib/cache/localSyncIndex')
    const opsBySize: Record<number, number> = {}

    for (const size of SIZES) {
      const vaultId = `vault-realign-${size}`
      const files = merged[size]
      // A prior load left every synced file with a verified hash.
      const stamped = files
        .filter((file) => !file.isDirectory && file.pdmData && file.ino && file.localHash && file.diffStatus === undefined)
        .map((file) => ({
          path: file.relativePath,
          ino: file.ino!,
          localVersion: file.localVersion,
          localHash: file.localHash,
          hashStamp: { size: file.size, mtimeMs: Date.parse(file.modifiedTime) },
        }))
      await updateInodes(vaultId, stamped)

      idb.reset()
      h.commands.length = 0
      const outcome = await applyAlignment(
        { resolvePendingMoves: true, recycleOrphans: true, pullOutdated: true, rebuildSyncIndex: true },
        {
          vaultId,
          files,
          serverFileCount: size,
          isOperationRunning: false,
          operationQueueLength: 0,
          onRefresh: () => undefined,
        },
      )
      const counters = idb.counter(SYNC_INDEX_DB)
      opsBySize[size] = counters.gets + counters.puts + counters.deletes + counters.getAlls
      out(
        `applyAlignment ${size}: commands ${JSON.stringify(h.commands)}, sync index ${JSON.stringify(counters)}, steps ${JSON.stringify(outcome.steps.map((s) => [s.step, s.outcome]))}`,
      )

      expect(outcome.aborted).toBe(false)
      expect(h.commands.length).toBeLessThanOrEqual(4)
      expect(opsBySize[size]).toBeLessThanOrEqual(files.length * 3)

      // The repair does not throw away the hash stamps a restart relies on.
      const saved = await getVersionMap(vaultId)
      const withStamp = [...saved.values()].filter((entry) => entry.localHash && entry.hashStamp).length
      expect(withStamp).toBeGreaterThanOrEqual(stamped.length)
    }
    expect(growthOver(opsBySize[10_000], opsBySize[30_000], 10_000, 30_000)).toBeLessThanOrEqual(1.1)
  })

  it('checks a file in for the first time in a fixed number of queries, whatever the batch size', async () => {
    const { syncFile } = await import('@/lib/supabase/files/mutations')
    recordingSupabase.setResponder((query) => {
      if (query.kind === 'storage' && query.op === 'list') return { data: [] }
      if (query.kind === 'storage') return { data: { path: 'x' } }
      if (query.kind === 'table' && query.name === 'file' && query.op === 'select') {
        return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      }
      if (query.kind === 'table' && query.name === 'file' && query.op === 'insert') {
        const payload = query.payload as Record<string, unknown>
        return {
          data: { id: `id-${String(payload.file_path)}`, version: 1, revision: 'A', state: null, ...payload },
        }
      }
      return { data: [] }
    })

    const perFile: Record<number, number> = {}
    for (const batch of [100, 1_000] as const) {
      recordingSupabase.reset()
      for (let i = 0; i < batch; i++) {
        const { error } = await syncFile(
          'org-perf',
          'vault-perf',
          FIXTURE_USER_ID,
          `P00/Assy-00/Sub-00/NEW-${batch}-${i}.sldprt`,
          `NEW-${batch}-${i}.sldprt`,
          '.sldprt',
          4,
          `${String(i).padStart(4, '0')}${'a'.repeat(60)}`,
          btoa('data'),
        )
        expect(error).toBeNull()
      }
      perFile[batch] = recordingSupabase.calls.length / batch
      out(`syncFile x${batch}: ${perFile[batch]} queries per file ${JSON.stringify(recordingSupabase.summary())}`)
      // The case-insensitive lookup is only for a collision, never on the hot path.
      expect(recordingSupabase.summary()['rpc:file_get_active_by_path'] ?? 0).toBe(0)
    }
    expect(perFile[100]).toBeLessThanOrEqual(6)
    expect(perFile[1_000]).toBe(perFile[100])
  })
})
