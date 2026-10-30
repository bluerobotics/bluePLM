/**
 * The integration harness: real store, real commands and real Supabase query code, over a typed
 * in-memory Supabase (fakeSupabase.ts), a fake disk and SolidWorks service (fakeElectron.ts).
 *
 * A test file mocks the client module once (see supabaseClientMock.ts), then:
 *
 *   const h = await createHarness()
 *   const part = h.seedSolidWorksFile('Parts/bracket.sldprt', { ... })
 *   await h.checkOut(part.file_path)
 *   ... run a command ...
 *   await h.reload()
 *
 * `reload()` is the vault load: `getFilesLightweight` (the real RPC call) and the scan feed the
 * same merge stages useLoadFiles runs, and the result goes through the store's real `setFiles`,
 * which restores or drops persisted pending metadata.
 */
import { vi } from 'vitest'

import { reconcileCloudFiles } from '@/hooks/useLoadFiles/cloudFileReconciliation'
import {
  buildMergeLookups,
  mergeLocalFileWithServer,
  type ScannedLocalFile,
} from '@/hooks/useLoadFiles/mergeLocalFile'
import { detectInodeRenames } from '@/hooks/useLoadFiles/renameDetection'
import type { CachedServerFile } from '@/lib/cache/vaultFileCache'
import type { SerializationSettings } from '@/lib/serialization'
import { checkoutFile } from '@/lib/supabase/files/checkout'
import { getVaultFolders } from '@/lib/supabase/files/folders'
import { getFilesLightweight } from '@/lib/supabase/files/queries'
import { usePDMStore } from '@/stores/pdmStore'
import type { LocalFile } from '@/stores/types'
import type { Organization, PDMFile, User } from '@/types/pdm'

import { createFakeElectron, type FakeElectron, type SwDocument } from './fakeElectron'
import { FakeSupabase, type RowOf } from './fakeSupabase'
import { defineFileRpcs } from './fakeSupabaseRpcs'
import { resetPDMStore } from './pdmStoreReset'
import { setActiveFakeSupabase } from './supabaseClientMock'

export const ORG_ID = 'org-1'
export const VAULT_ID = 'vault-1'
export const USER_ID = 'user-me'
export const OTHER_USER_ID = 'user-other'
export const VAULT_PATH = 'C:\\vault'

/** Tab numbers on, `-` separator: `BR-100` with tab `01` is `BR-100-01`. */
export const SERIALIZATION: Partial<SerializationSettings> = {
  tab_enabled: true,
  tab_separator: '-',
  tab_padding_digits: 2,
  tab_required: false,
  tab_allow_numbers: true,
}

export interface SeedOptions {
  document?: SwDocument
  body?: string
  part_number?: string | null
  description?: string | null
  revision?: string
  custom_properties?: Record<string, unknown>
  checked_out_by?: string | null
}

export interface Harness {
  db: FakeSupabase
  electron: FakeElectron
  absolute(relativePath: string): string
  /** A file on disk and its row on the server, in sync: the row's hash is the disk's. */
  seedSolidWorksFile(relativePath: string, options?: SeedOptions): RowOf<'file'>
  /** Check the file out through the real `checkoutFile`, make it writable, and reload. */
  checkOut(relativePath: string): Promise<void>
  reload(): Promise<LocalFile[]>
  file(relativePath: string): LocalFile
  serverRow(relativePath: string): RowOf<'file'>
}

function installWindow(electron: FakeElectron): void {
  if (typeof window === 'undefined') vi.stubGlobal('window', {})
  // Progress toasts batch through requestAnimationFrame, which node does not have.
  if (typeof requestAnimationFrame === 'undefined') {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 0),
    )
  }
  Object.defineProperty(window, 'electronAPI', {
    value: electron.api,
    configurable: true,
    writable: true,
  })
}

const extensionOf = (path: string) => {
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot).toLowerCase()
}

export async function createHarness(): Promise<Harness> {
  resetPDMStore()

  const db = new FakeSupabase()
  defineFileRpcs(db)
  db.actorId = USER_ID
  db.actorEmail = 'me@example.com'
  setActiveFakeSupabase(db)
  db.seed('organization', {
    id: ORG_ID,
    name: 'Test Org',
    slug: 'test-org',
    serialization_settings: SERIALIZATION as unknown as RowOf<'organization'>['serialization_settings'],
  })

  const electron = createFakeElectron(undefined, {
    workingDir: () => usePDMStore.getState().vaultPath,
    resolveDownload: (url) => db.objectAtSignedUrl(url),
  })
  installWindow(electron)

  const user = {
    id: USER_ID,
    email: 'me@example.com',
    full_name: 'Test User',
    role: 'engineer',
    org_id: ORG_ID,
  } as User
  const organization = {
    id: ORG_ID,
    name: 'Test Org',
    slug: 'test-org',
    serialization_settings: SERIALIZATION,
  } as unknown as Organization

  const state = usePDMStore.getState()
  state.setUser(user)
  state.setOrganization(organization)
  usePDMStore.setState({
    vaultPath: VAULT_PATH,
    activeVaultId: VAULT_ID,
    isOfflineMode: false,
    integrations: {
      ...state.integrations,
      solidworks: { ...state.integrations.solidworks, status: 'online' },
    },
    solidworksServiceStatus: {
      ...state.solidworksServiceStatus,
      running: true,
      dmApiAvailable: true,
    },
  })

  const absolute = (relativePath: string) => `${VAULT_PATH}\\${relativePath.replace(/\//g, '\\')}`

  const scan = (): ScannedLocalFile[] => {
    const prefix = `${VAULT_PATH.toLowerCase()}\\`
    const files: ScannedLocalFile[] = []
    const folders = new Set<string>()
    for (const entry of electron.disk.all()) {
      if (!entry.path.toLowerCase().startsWith(prefix)) continue
      const relativePath = entry.path.slice(prefix.length).replace(/\\/g, '/')
      const parts = relativePath.split('/')
      for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
      files.push({
        name: parts[parts.length - 1],
        path: entry.path,
        relativePath,
        isDirectory: false,
        extension: extensionOf(relativePath),
        size: electron.disk.bytes(entry.path).length,
        modifiedTime: new Date(entry.mtimeMs).toISOString(),
        ino: entry.ino,
        // The main process hash cache holds a hash while size and mtime are unchanged.
        localHash: electron.disk.hash(entry.path),
      })
    }
    // Empty folders exist only as directories.
    for (const dir of electron.disk.dirs()) {
      if (!dir.toLowerCase().startsWith(prefix)) continue
      const relativePath = dir.slice(prefix.length).replace(/\\/g, '/')
      const parts = relativePath.split('/')
      for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'))
    }
    for (const folder of folders) {
      files.push({
        name: folder.split('/').pop()!,
        path: absolute(folder),
        relativePath: folder,
        isDirectory: true,
        extension: '',
        size: 0,
        modifiedTime: new Date(electron.disk.clock).toISOString(),
      })
    }
    return files
  }

  // The local sync index's inode record (`getInodeMap`): each file this machine has seen in sync
  // with its server row, by inode. A later load that finds the inode at another path reads it as a
  // move, as the app does. A file whose path disagrees with its row keeps its old entry.
  const syncedInodes = new Map<number, string[]>()

  const reload = async (): Promise<LocalFile[]> => {
    const { files: rows, error } = await getFilesLightweight(ORG_ID, VAULT_ID)
    if (error || !rows) throw new Error(`reload: ${String(error?.message ?? error)}`)
    const pdmFiles = rows as unknown as PDMFile[]
    const pdmMap = new Map(pdmFiles.map((f) => [f.file_path.toLowerCase(), f]))
    const { folders: serverFolders } = await getVaultFolders(VAULT_ID)
    const serverFoldersMap = new Map(serverFolders.map((f) => [f.folder_path.toLowerCase(), f]))

    let localFiles = scan()
    const localPathSet = new Set(localFiles.map((f) => f.relativePath.toLowerCase()))
    const store = usePDMStore.getState()
    const checkedOutByMeByHash = new Map<string, PDMFile>()
    for (const f of pdmFiles) {
      if (f.content_hash && f.checked_out_by === USER_ID) checkedOutByMeByHash.set(f.content_hash, f)
    }
    const renames = detectInodeRenames(localFiles, pdmMap, localPathSet, syncedInodes)
    const lookups = buildMergeLookups(store.files, new Map(), store.isFileRecentlyModified)
    const ctx = {
      lookups,
      pdmMap,
      serverFoldersMap,
      inodeRenameMap: renames.inodeRenameMap,
      checkedOutByMeByHash,
      localPathSet,
      localSyncIndex: new Map(pdmFiles.map((f) => [f.file_path.toLowerCase(), {}])),
      isIgnoredPath: () => false,
      persistedPendingMetadata: store.persistedPendingMetadata,
      userId: USER_ID,
      vaultPath: VAULT_PATH,
      rehashPaths: new Set<string>(),
      orphansEditedSinceServerRowLost: new Set<string>(),
      stats: { matched: 0, unmatched: 0, unmatchedSamples: [] },
    }
    localFiles = localFiles.map((f) => mergeLocalFileWithServer(f, ctx))
    const reconciled = await reconcileCloudFiles({
      pdmFiles: pdmFiles as unknown as CachedServerFile[],
      localFiles,
      localPathSet,
      inodeMatchedServerPaths: renames.inodeMatchedServerPaths,
      inodeMatchedServerPathToLocalPath: renames.inodeMatchedServerPathToLocalPath,
      existingCheckedOutUsers: lookups.checkedOutUsers,
      userId: USER_ID,
      vaultPath: VAULT_PATH,
      yieldIfSlow: async () => {},
      yieldCheckStride: 256,
    })
    for (const f of reconciled.localFiles) {
      if (f.isDirectory || !f.ino || !f.pdmData) continue
      if (f.pdmData.file_path.toLowerCase() !== f.relativePath.toLowerCase()) continue
      syncedInodes.set(f.ino, [f.relativePath.toLowerCase()])
    }
    // What useLoadFiles commits beside the files: the server list (deletion targets, folder
    // expansion) and every folder the server implies or records.
    const serverFolderPaths = new Set<string>(serverFolders.map((f) => f.folder_path))
    for (const f of pdmFiles) {
      const parts = f.file_path.split('/')
      for (let i = 1; i < parts.length; i++) serverFolderPaths.add(parts.slice(0, i).join('/'))
    }
    const state = usePDMStore.getState()
    state.setServerFiles(
      pdmFiles.map((f) => ({
        id: f.id,
        file_path: f.file_path,
        name: f.file_name,
        extension: f.extension ?? '',
        content_hash: f.content_hash || '',
      })),
    )
    state.setServerFolderPaths(serverFolderPaths)
    state.setFiles(reconciled.localFiles)
    return usePDMStore.getState().files
  }

  const serverRow = (relativePath: string): RowOf<'file'> => {
    const row = db
      .rows('file')
      .find((r) => String(r.file_path).toLowerCase() === relativePath.toLowerCase() && r.deleted_at == null)
    if (!row) throw new Error(`no server row for ${relativePath}`)
    return row as unknown as RowOf<'file'>
  }

  return {
    db,
    electron,
    absolute,
    seedSolidWorksFile(relativePath, options = {}) {
      const path = absolute(relativePath)
      electron.disk.write(path, options.body ?? `bytes of ${relativePath}`, options.document)
      electron.disk.require(path).readonly = options.checked_out_by !== USER_ID
      const hash = electron.disk.hash(path)
      db.storeObject(`vault/${ORG_ID}/${hash.slice(0, 2)}/${hash}`, new TextEncoder().encode(electron.disk.bytes(path)))
      const row = db.seed('file', {
        org_id: ORG_ID,
        vault_id: VAULT_ID,
        file_path: relativePath,
        file_name: relativePath.split('/').pop()!,
        extension: extensionOf(relativePath),
        file_type: 'part',
        content_hash: hash,
        file_size: electron.disk.bytes(path).length,
        version: 1,
        revision: options.revision ?? 'A',
        part_number: options.part_number ?? null,
        description: options.description ?? null,
        custom_properties: (options.custom_properties ?? {}) as RowOf<'file'>['custom_properties'],
        checked_out_by: options.checked_out_by ?? null,
        created_by: OTHER_USER_ID,
        updated_by: OTHER_USER_ID,
      })
      db.seed('file_version', {
        file_id: row.id,
        version: 1,
        revision: row.revision,
        content_hash: hash,
        created_by: OTHER_USER_ID,
      })
      return row
    },
    async checkOut(relativePath) {
      const row = serverRow(relativePath)
      const result = await checkoutFile(row.id, USER_ID, 'me@example.com', {
        machineId: 'machine-test',
        machineName: 'TEST-PC',
      })
      if (!result.success) throw new Error(`checkOut ${relativePath}: ${result.error}`)
      electron.disk.require(absolute(relativePath)).readonly = false
      await reload()
    },
    reload,
    file(relativePath) {
      const file = usePDMStore
        .getState()
        .files.find((f) => f.relativePath.toLowerCase() === relativePath.toLowerCase() && !f.isDirectory)
      if (!file) throw new Error(`no store row for ${relativePath}`)
      return file
    },
    serverRow,
  }
}
