/**
 * A whole vault rendered headless, for user-journey tests.
 *
 * `openVault()` builds on the integration harness (real store, real commands, fake Supabase,
 * fake disk and SolidWorks service), seeds a small vault, and renders what the user works in:
 * the explorer tree, the file pane, and the app-level dialogs the commands open (confirm, upload
 * size warning, Copy/Move to Vault), plus the toasts. A test then drives the UI the way a user
 * does and checks all four places state lives:
 *
 *   ui      what is rendered in the file pane
 *   store   `usePDMStore`
 *   disk    the fake disk
 *   server  the fake Supabase rows (files, versions, activity)
 *
 * `expectStableAcrossReload()` is the point of the suite: it reloads the vault the way a fresh
 * start does (store emptied, files listed from disk and server and merged) and asserts nothing
 * changed. That is where the regressions this suite exists for show up: phantom modified files,
 * ghost folders, duplicate rows, reverted moves, blanked metadata.
 *
 * Use with `// @vitest-environment jsdom` and the client mock line from supabaseClientMock.ts.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { expect, vi } from 'vitest'

import { CommandConfirmContainer, UploadSizeWarningContainer, VaultTransferContainer } from '@/components/shared/Dialogs'
import { Toast } from '@/components/core'
import { FilePane } from '@/features/source/browser/FilePane'
import { FileTree } from '@/features/source/explorer/FileTree'
import { TrashView } from '@/features/source/trash/TrashView'
import { useRealtimeSubscriptions } from '@/hooks/useRealtimeSubscriptions'
import { usePDMStore } from '@/stores/pdmStore'
import type { LocalFile } from '@/stores/types'

import { hashText, type SwDocument } from '../fakeElectron'
import type { RowOf } from '../fakeSupabase'
import { createHarness, ORG_ID, OTHER_USER_ID, USER_ID, VAULT_ID, VAULT_PATH, type Harness } from '../harness'
import { installLayout } from './dom'

export { ORG_ID, OTHER_USER_ID, USER_ID, VAULT_ID, VAULT_PATH }

export const OTHER_VAULT_ID = 'vault-2'
export const OTHER_VAULT_PATH = 'C:\\vault2'

type FileType = RowOf<'file'>['file_type']

export interface SeedFile {
  /** Vault-relative, forward slashes. */
  path: string
  /** Synced (row on the server, read-only on disk) unless `local` is set. */
  local?: boolean
  /** Only on the server: not downloaded. */
  cloud?: boolean
  checkedOutBy?: string | null
  partNumber?: string | null
  description?: string | null
  revision?: string
  version?: number
  document?: SwDocument
}

export interface VaultSpec {
  files: SeedFile[]
  /** Empty folders on disk. */
  folders?: string[]
  /** A second connected vault, for Copy/Move to Vault. */
  secondVault?: boolean
  /** Folders with a `folders` row on the server (the rest exist only as paths). */
  serverFolders?: string[]
}

const extensionOf = (path: string) => {
  const name = path.split('/').pop()!
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

function fileTypeOf(path: string): FileType {
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

/** A one-configuration SolidWorks document with the given properties. */
export function swDocument(props: Record<string, string> = {}): SwDocument {
  return {
    fileProperties: { ...props },
    configurations: [{ name: 'Default', isActive: true, properties: {} }],
  }
}

export interface DiskState {
  path: string
  hash: string
  readonly: boolean
}

export interface ServerState {
  path: string
  version: number
  hash: string | null
  checkedOutBy: string | null
  partNumber: string | null
  description: string | null
  revision: string | null
}

export interface StoreState {
  path: string
  status: string
  checkedOutBy: string | null
  version: number | null
}

export interface VaultState {
  disk: DiskState[]
  diskFolders: string[]
  server: ServerState[]
  store: StoreState[]
  storeFolders: string[]
}

export interface Vault extends Harness {
  user: UserEvent
  /** Seed one more file (disk and/or server) after the vault is open; call `reload()` after. */
  seed(file: SeedFile, vault?: { id: string; root: string }): RowOf<'file'> | null
  /**
   * Another user checks in new content for a synced file: new bytes in storage, the row's hash
   * and version move, a version row is added. My disk copy is now outdated.
   */
  otherUserChecksIn(relativePath: string, body: string): RowOf<'file'>
  /** Another user changes a file row on the server; the change reaches me over realtime. */
  otherUserUpdates(relativePath: string, patch: Partial<RowOf<'file'>>): RowOf<'file'>
  /** The four places, normalized and sorted, for comparison. */
  state(): VaultState
  /** Reload from disk and server as a fresh start does, and assert nothing changed. */
  expectStableAcrossReload(): Promise<void>
  /** Invariants that hold after any completed operation. */
  expectConsistent(): void
  /** Show a folder in the file pane, as clicking it in the tree does. */
  openFolder(relativePath: string): Promise<void>
  /** The file-pane row for an item in the current folder, by vault-relative path. */
  row(relativePath: string): HTMLElement
  queryRow(relativePath: string): HTMLElement | null
  /** The explorer tree row for an item, by vault-relative path. */
  treeRow(relativePath: string): HTMLElement
  /** Click a row (Ctrl adds to the selection). */
  select(target: HTMLElement, options?: { ctrlKey?: boolean; shiftKey?: boolean }): Promise<void>
  /** Press a key with the focus on the page, e.g. `F2`, `{Control>}c{/Control}`. */
  keyboard(keys: string): Promise<void>
  /** Rename the selected row inline: F2, type, Enter. */
  renameInline(target: HTMLElement, newName: string): Promise<void>
  /** A file-pane cell by column id (`description`, `itemNumber`, `revision`, ...). */
  cell(row: HTMLElement, columnId: string): HTMLElement
  /** Edit a metadata cell inline: click it, type, Enter. */
  editCell(row: HTMLElement, columnId: string, value: string): Promise<void>
  /** Click a button in whatever dialog is open, by its visible text. */
  confirm(buttonText: string | RegExp): Promise<void>
  /** Right-click a row and pick a menu item by its visible label. */
  contextMenu(target: HTMLElement, label: string | RegExp): Promise<void>
  /** Let background server writes (rename, move) and toasts settle. */
  settle(): Promise<void>
  /** Open the Trash view (it loads deleted files when it mounts). */
  openTrash(): Promise<HTMLElement>
  /** Toast messages shown so far, in order. */
  toasts(): string[]
  unmount(): void
}

/** The app's realtime subscriptions, as App.tsx mounts them. */
function RealtimeHost({ onRefresh }: { onRefresh: () => void }) {
  const organization = usePDMStore((s) => s.organization)
  useRealtimeSubscriptions(organization, false, 'journey', onRefresh)
  return null
}

export async function openVault(spec: VaultSpec): Promise<Vault> {
  installLayout()
  const h = await createHarness()
  const { db, electron } = h

  db.seed('app_user', {
    id: USER_ID,
    email: 'me@example.com',
    full_name: 'Test User',
    org_id: ORG_ID,
    role: 'engineer',
  } as RowOf<'app_user'>)
  db.seed('app_user', {
    id: OTHER_USER_ID,
    email: 'other@example.com',
    full_name: 'Other User',
    org_id: ORG_ID,
    role: 'engineer',
  } as RowOf<'app_user'>)
  db.seed('vault', { id: VAULT_ID, org_id: ORG_ID, name: 'Main', slug: 'main' } as RowOf<'vault'>)
  // Vault access is opt-in: the user is granted every vault in the org.
  db.defineRpc('user_vault_access_list', (_args, fake) => fake.rows('vault').map((v) => ({ vault_id: v.id })))

  const connectedVaults = [{ id: VAULT_ID, name: 'Main', localPath: VAULT_PATH, isExpanded: true, hasCompletedSetup: true }]
  if (spec.secondVault) {
    db.seed('vault', { id: OTHER_VAULT_ID, org_id: ORG_ID, name: 'Second', slug: 'second' } as RowOf<'vault'>)
    connectedVaults.push({
      id: OTHER_VAULT_ID,
      name: 'Second',
      localPath: OTHER_VAULT_PATH,
      isExpanded: false,
      hasCompletedSetup: true,
    })
    electron.disk.mkdir(OTHER_VAULT_PATH)
  }
  // An engineer who may view, create, edit and delete everywhere, but is not an admin.
  const userPermissions = new Proxy({} as Record<string, string[]>, {
    get: (_target, resource) => (resource === '__admin__' ? undefined : ['view', 'create', 'edit', 'delete']),
  })
  usePDMStore.setState({
    connectedVaults,
    currentFolder: '',
    isLoading: false,
    filesLoaded: true,
    isVaultConnected: true,
    userPermissions,
  } as never)

  const seed = (file: SeedFile, vault = { id: VAULT_ID, root: VAULT_PATH }): RowOf<'file'> | null => {
    const absolute = `${vault.root}\\${file.path.replace(/\//g, '\\')}`
    const body = `bytes of ${file.path}`
    const document = file.document ?? (fileTypeOf(file.path) === 'other' ? undefined : swDocument())
    let bytes: string
    if (!file.cloud) {
      electron.disk.write(absolute, body, document)
      bytes = electron.disk.bytes(absolute)
    } else {
      // The bytes the server holds for a file nobody here has downloaded.
      electron.disk.write(absolute, body, document)
      bytes = electron.disk.bytes(absolute)
      electron.disk.remove(absolute)
    }
    if (file.local) return null
    const entry = electron.disk.get(absolute)
    if (entry) entry.readonly = file.checkedOutBy !== USER_ID
    const hash = hashText(bytes)
    db.storeObject(`vault/${ORG_ID}/${hash.slice(0, 2)}/${hash}`, new TextEncoder().encode(bytes))
    const version = file.version ?? 1
    const row = db.seed('file', {
      org_id: ORG_ID,
      vault_id: vault.id,
      file_path: file.path,
      file_name: file.path.split('/').pop()!,
      extension: extensionOf(file.path),
      file_type: fileTypeOf(file.path),
      content_hash: hash,
      file_size: bytes.length,
      version,
      revision: file.revision ?? 'A',
      part_number: file.partNumber ?? null,
      description: file.description ?? null,
      custom_properties: {} as RowOf<'file'>['custom_properties'],
      checked_out_by: file.checkedOutBy ?? null,
      checked_out_at: file.checkedOutBy ? db.isoNow() : null,
      created_by: OTHER_USER_ID,
      updated_by: OTHER_USER_ID,
    })
    for (let v = 1; v <= version; v++) {
      db.seed('file_version', {
        file_id: row.id,
        version: v,
        revision: row.revision,
        content_hash: hash,
        created_by: OTHER_USER_ID,
      })
    }
    return row
  }

  for (const folder of spec.folders ?? []) electron.disk.mkdir(h.absolute(folder))
  for (const folder of spec.serverFolders ?? []) {
    db.seed('folder', { org_id: ORG_ID, vault_id: VAULT_ID, folder_path: folder, created_by: OTHER_USER_ID })
  }
  for (const file of spec.files) seed(file)
  await h.reload()

  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 })
  const reloadFromUi = () => void h.reload()

  render(
    <>
      <div data-testid="tree">
        <FileTree onRefresh={reloadFromUi} />
      </div>
      <div data-testid="pane">
        <FilePane onRefresh={reloadFromUi} />
      </div>
      <RealtimeHost onRefresh={reloadFromUi} />
      <Toast />
      <UploadSizeWarningContainer />
      <CommandConfirmContainer />
      <VaultTransferContainer onRefresh={reloadFromUi} />
    </>,
  )

  const relOf = (root: string, path: string) => path.slice(root.length + 1).replace(/\\/g, '/')

  const state = (): VaultState => {
    const prefix = `${VAULT_PATH.toLowerCase()}\\`
    const inVault = (p: string) => p.toLowerCase().startsWith(prefix)
    const disk = electron.disk
      .all()
      .filter((e) => inVault(e.path))
      .map((e) => ({ path: relOf(VAULT_PATH, e.path), hash: electron.disk.hash(e.path), readonly: e.readonly }))
      .sort((a, b) => a.path.localeCompare(b.path))
    const diskFolders = new Set<string>()
    for (const e of disk) {
      const parts = e.path.split('/')
      for (let i = 1; i < parts.length; i++) diskFolders.add(parts.slice(0, i).join('/'))
    }
    for (const dir of electron.disk.dirs()) {
      if (inVault(dir)) {
        const parts = relOf(VAULT_PATH, dir).split('/')
        for (let i = 1; i <= parts.length; i++) diskFolders.add(parts.slice(0, i).join('/'))
      }
    }
    const server = db
      .rows('file')
      .filter((r) => r.vault_id === VAULT_ID && r.deleted_at == null)
      .map((r) => ({
        path: String(r.file_path),
        version: Number(r.version),
        hash: (r.content_hash as string | null) ?? null,
        checkedOutBy: (r.checked_out_by as string | null) ?? null,
        partNumber: (r.part_number as string | null) ?? null,
        description: (r.description as string | null) ?? null,
        revision: (r.revision as string | null) ?? null,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
    const files = usePDMStore.getState().files
    const store = files
      .filter((f) => !f.isDirectory)
      .map((f) => ({
        path: f.relativePath,
        status: f.diffStatus ?? 'synced',
        checkedOutBy: f.pdmData?.checked_out_by ?? null,
        version: f.pdmData?.version ?? null,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
    const storeFolders = files
      .filter((f) => f.isDirectory)
      .map((f) => f.relativePath)
      .sort((a, b) => a.localeCompare(b))
    return { disk, diskFolders: [...diskFolders].sort((a, b) => a.localeCompare(b)), server, store, storeFolders }
  }

  const expectConsistent = () => {
    const s = state()
    const serverByPath = new Map(s.server.map((r) => [r.path.toLowerCase(), r]))
    const diskByPath = new Map(s.disk.map((d) => [d.path.toLowerCase(), d]))
    // No duplicate live rows at one path (the partial unique index), nor duplicate store rows.
    expect(new Set(s.server.map((r) => r.path.toLowerCase())).size, 'duplicate server rows').toBe(s.server.length)
    const storePaths = s.store.map((f) => f.path.toLowerCase())
    expect(new Set(storePaths).size, `duplicate store rows: ${storePaths.join(', ')}`).toBe(storePaths.length)
    for (const f of s.store) {
      const server = serverByPath.get(f.path.toLowerCase())
      const disk = diskByPath.get(f.path.toLowerCase())
      // Nothing left half-done: no pending moves, nothing deleted locally but still listed.
      expect(['moved', 'moved_away', 'deleted'], `${f.path} is ${f.status}`).not.toContain(f.status)
      // A phantom modified file is one whose bytes match the server.
      if (f.status === 'modified') {
        expect(disk && server && disk.hash !== server.hash, `${f.path}: modified but the bytes match the server`).toBe(true)
      }
      if (f.status === 'cloud') expect(disk, `${f.path}: cloud but on disk`).toBeUndefined()
      else expect(disk, `${f.path}: in the store but not on disk`).toBeDefined()
      if (server && f.status !== 'added') {
        expect(f.checkedOutBy, `${f.path}: checkout differs from the server`).toBe(server.checkedOutBy)
      }
    }
    // Every file on disk and every live server row is shown.
    const shown = new Set(storePaths)
    for (const d of s.disk) expect(shown.has(d.path.toLowerCase()), `${d.path} on disk, not in the store`).toBe(true)
    for (const r of s.server) expect(shown.has(r.path.toLowerCase()), `${r.path} on the server, not in the store`).toBe(true)
    // No ghost folders: every folder shown exists on disk or holds a server row.
    for (const folder of s.storeFolders) {
      const lower = folder.toLowerCase()
      const onDisk = s.diskFolders.some((d) => d.toLowerCase() === lower)
      const onServer = s.server.some((r) => r.path.toLowerCase().startsWith(`${lower}/`))
      expect(onDisk || onServer, `ghost folder ${folder}`).toBe(true)
    }
    // A synced file on disk is read-only unless I hold it.
    for (const d of s.disk) {
      const server = serverByPath.get(d.path.toLowerCase())
      if (server && server.hash === d.hash) {
        expect(d.readonly, `${d.path}: writable but not checked out to me`).toBe(server.checkedOutBy !== USER_ID)
      }
    }
  }

  const expectStableAcrossReload = async () => {
    const before = state()
    await act(async () => {
      usePDMStore.setState({ files: [] } as never)
      await h.reload()
    })
    const after = state()
    expect(after.store, 'store changed across a fresh reload').toEqual(before.store)
    expect(after.storeFolders, 'folders changed across a fresh reload').toEqual(before.storeFolders)
    expect(after.server).toEqual(before.server)
    expect(after.disk).toEqual(before.disk)
    expectConsistent()
  }

  const byPath = (scope: string, selector: string, relativePath: string): HTMLElement | null => {
    const root = screen.getByTestId(scope)
    const wanted = h.absolute(relativePath).toLowerCase()
    return (
      [...root.querySelectorAll<HTMLElement>(selector)].find(
        (el) => el.getAttribute('data-path')?.toLowerCase() === wanted,
      ) ?? null
    )
  }
  const queryRow = (relativePath: string) => byPath('pane', 'tr[data-path]', relativePath)

  const otherUserChecksIn = (relativePath: string, body: string): RowOf<'file'> => {
    const row = h.serverRow(relativePath)
    const bytes = body
    const hash = hashText(bytes)
    db.storeObject(`vault/${ORG_ID}/${hash.slice(0, 2)}/${hash}`, new TextEncoder().encode(bytes))
    db.tick()
    const version = Number(row.version) + 1
    db.updateAndEmit('file', row.id, {
      content_hash: hash,
      file_size: bytes.length,
      version,
      updated_by: OTHER_USER_ID,
      updated_at: db.isoNow(),
    })
    db.seed('file_version', {
      file_id: row.id,
      version,
      revision: row.revision,
      content_hash: hash,
      created_by: OTHER_USER_ID,
    })
    return db.row('file', row.id)
  }

  const otherUserUpdates = (relativePath: string, patch: Partial<RowOf<'file'>>): RowOf<'file'> => {
    const row = h.serverRow(relativePath)
    db.tick()
    return db.updateAndEmit('file', row.id, { ...patch, updated_by: OTHER_USER_ID, updated_at: db.isoNow() })
  }

  const vault: Vault = {
    ...h,
    user,
    seed,
    otherUserChecksIn,
    otherUserUpdates,
    state,
    expectConsistent,
    expectStableAcrossReload,
    async openFolder(relativePath) {
      await act(async () => {
        usePDMStore.getState().setCurrentFolder(relativePath)
      })
    },
    queryRow,
    row(relativePath) {
      const found = queryRow(relativePath)
      if (!found) {
        const shown = [...screen.getByTestId('pane').querySelectorAll('tr[data-path]')].map((el) =>
          el.getAttribute('data-path'),
        )
        throw new Error(`no file-pane row ${relativePath}; pane shows: ${shown.join(' | ')}`)
      }
      return found
    },
    treeRow(relativePath) {
      const found = byPath('tree', '.tree-item[data-path]', relativePath)
      if (!found) throw new Error(`no tree row ${relativePath}`)
      return found
    },
    async select(target, options = {}) {
      await act(async () => {
        fireEvent.click(target, { ctrlKey: !!options.ctrlKey, shiftKey: !!options.shiftKey })
      })
    },
    async keyboard(keys) {
      // user-event wraps its own dispatches in act().
      await user.keyboard(keys)
      await vault.settle()
    },
    async renameInline(target, newName) {
      await vault.select(target)
      await vault.keyboard('{F2}')
      const input = await waitFor(() => {
        const el = screen.getByTestId('pane').querySelector<HTMLInputElement>('input[type="text"], input:not([type])')
        if (!el) throw new Error('no rename input after F2')
        return el
      })
      await user.clear(input)
      await user.type(input, `${newName}{Enter}`)
      await vault.settle()
    },
    cell(row, columnId) {
      const headers = [...screen.getByTestId('pane').querySelectorAll('th[data-column-id]')]
      const index = headers.findIndex((th) => th.getAttribute('data-column-id') === columnId)
      if (index < 0) throw new Error(`no column ${columnId}`)
      return row.querySelectorAll('td')[index] as HTMLElement
    },
    async editCell(row, columnId, value) {
      const target = vault.cell(row, columnId).querySelector<HTMLElement>('[data-no-drag]') ?? vault.cell(row, columnId)
      await user.click(target)
      const input = await waitFor(() => {
        const el = vault.cell(row, columnId).querySelector<HTMLInputElement>('input')
        if (!el) throw new Error(`no editor in ${columnId} after a click`)
        return el
      })
      await user.clear(input)
      await user.type(input, `${value}{Enter}`)
      await vault.settle()
    },
    async confirm(buttonText) {
      const button = await screen.findByRole('button', { name: buttonText })
      await user.click(button)
      await vault.settle()
    },
    async contextMenu(target, label) {
      await act(async () => {
        fireEvent.contextMenu(target, { clientX: 5, clientY: 5 })
      })
      const item = await screen.findByText(label)
      await user.click(item)
      await vault.settle()
    },
    async settle() {
      await act(async () => {
        for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
      })
    },
    async openTrash() {
      render(
        <div data-testid="trash">
          <TrashView />
        </div>,
      )
      await vault.settle()
      return screen.getByTestId('trash')
    },
    toasts() {
      return toastLog.map((t) => t.message)
    },
    unmount() {
      cleanup()
      unsubscribe()
    },
  }

  const toastLog: Array<{ type: string; message: string }> = []
  const seen = new Set<string>()
  const unsubscribe = usePDMStore.subscribe((s) => {
    for (const t of s.toasts) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      toastLog.push({ type: t.type, message: t.message })
    }
  })

  return vault
}

export { act, screen, waitFor, within, vi }
export type { LocalFile }
