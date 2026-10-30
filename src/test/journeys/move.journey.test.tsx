// @vitest-environment jsdom
/**
 * Move journeys by drag and drop and by cut/copy/paste: within the file pane, from the pane to
 * the explorer tree, from the tree to the pane, multi-select, folders (nested, holding my
 * checkouts), and the refusals (someone else's checkout, a target that already exists).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', async (importOriginal) =>
  (await import('@/test/supabaseClientMock')).mockClientModule(await importOriginal()),
)

import { dragAndDrop, FakeDataTransfer } from './dom'
import { OTHER_USER_ID, USER_ID, openVault, screen, waitFor, type Vault } from './journeyVault'

let vault: Vault | null = null
afterEach(() => {
  vault?.unmount()
  vault = null
})

const livePaths = (v: Vault) => v.state().server.map((r) => r.path)
const diskPaths = (v: Vault) => v.state().disk.map((d) => d.path)

const spec = {
  files: [
    { path: 'a.sldprt' },
    { path: 'b.sldprt' },
    { path: 'mine.sldasm', checkedOutBy: USER_ID },
    { path: 'Parts/existing.sldprt' },
    { path: 'Proj/Sub/c.sldprt' },
    { path: 'Proj/d.slddrw' },
    { path: 'local.txt', local: true },
  ],
  folders: ['Empty'],
}

/** A folder move waits 2 s for Windows to release file handles before it renames. */
const waitForFolderMove = (assertion: () => void) => waitFor(assertion, { timeout: 5000 })

const moveActivity = (v: Vault) =>
  v.db
    .rows('activity')
    .filter((r) => r.action === 'move')
    .map((r) => (r.details as { new_path: string }).new_path)

describe('drag and drop in the file pane', () => {
  it('moves a file onto a folder row', async () => {
    vault = await openVault(spec)
    const id = vault.serverRow('a.sldprt').id

    await dragAndDrop(vault.row('a.sldprt'), vault.row('Parts'))

    expect(diskPaths(vault)).toContain('Parts/a.sldprt')
    expect(diskPaths(vault)).not.toContain('a.sldprt')
    expect(vault.db.row('file', id).file_path).toBe('Parts/a.sldprt')
    expect(moveActivity(vault)).toEqual(['Parts/a.sldprt'])
    expect(vault.queryRow('a.sldprt')).toBeNull()
    await vault.openFolder('Parts')
    expect(vault.row('Parts/a.sldprt')).toBeTruthy()
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('moves a multi-selection (files, a local file, my checkout) onto a folder', async () => {
    vault = await openVault(spec)
    await vault.select(vault.row('a.sldprt'))
    await vault.select(vault.row('b.sldprt'), { ctrlKey: true })
    await vault.select(vault.row('mine.sldasm'), { ctrlKey: true })
    await vault.select(vault.row('local.txt'), { ctrlKey: true })

    await dragAndDrop(vault.row('b.sldprt'), vault.row('Empty'))

    expect(diskPaths(vault)).toEqual([
      'Empty/a.sldprt',
      'Empty/b.sldprt',
      'Empty/local.txt',
      'Empty/mine.sldasm',
      'Parts/existing.sldprt',
      'Proj/d.slddrw',
      'Proj/Sub/c.sldprt',
    ])
    expect(livePaths(vault)).toEqual([
      'Empty/a.sldprt',
      'Empty/b.sldprt',
      'Empty/mine.sldasm',
      'Parts/existing.sldprt',
      'Proj/d.slddrw',
      'Proj/Sub/c.sldprt',
    ])
    expect(vault.serverRow('Empty/mine.sldasm').checked_out_by).toBe(USER_ID)
    expect(vault.electron.disk.require(vault.absolute('Empty/mine.sldasm')).readonly).toBe(false)
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('moves a folder with nested folders into another folder', async () => {
    vault = await openVault(spec)

    await dragAndDrop(vault.row('Proj'), vault.row('Parts'))

    await waitForFolderMove(() =>
      expect(diskPaths(vault!)).toEqual(
        expect.arrayContaining(['Parts/Proj/Sub/c.sldprt', 'Parts/Proj/d.slddrw', 'Parts/existing.sldprt']),
      ),
    )
    expect(livePaths(vault)).toEqual(
      expect.arrayContaining(['Parts/Proj/Sub/c.sldprt', 'Parts/Proj/d.slddrw']),
    )
    expect(livePaths(vault).filter((p) => p.startsWith('Proj/'))).toEqual([])
    expect(vault.state().storeFolders).toEqual(['Empty', 'Parts', 'Parts/Proj', 'Parts/Proj/Sub'])
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('refuses to move a file someone else has checked out', async () => {
    vault = await openVault({ files: [{ path: 'theirs.sldprt', checkedOutBy: OTHER_USER_ID }, { path: 'Parts/x.sldprt' }] })

    await dragAndDrop(vault.row('theirs.sldprt'), vault.row('Parts'))

    expect(diskPaths(vault)).toEqual(['Parts/x.sldprt', 'theirs.sldprt'])
    expect(livePaths(vault)).toEqual(['Parts/x.sldprt', 'theirs.sldprt'])
    expect(vault.toasts().join('\n')).toMatch(/checked out by others/i)
    await vault.expectStableAcrossReload()
  })

  it('refuses to move a folder holding a file someone else has checked out', async () => {
    vault = await openVault({
      files: [{ path: 'Proj/theirs.sldprt', checkedOutBy: OTHER_USER_ID }, { path: 'Parts/x.sldprt' }],
    })

    await dragAndDrop(vault.row('Proj'), vault.row('Parts'))

    expect(diskPaths(vault)).toEqual(['Parts/x.sldprt', 'Proj/theirs.sldprt'])
    expect(livePaths(vault)).toEqual(['Parts/x.sldprt', 'Proj/theirs.sldprt'])
  })

  it('does not overwrite a file of the same name already in the target folder', async () => {
    vault = await openVault({ files: [{ path: 'existing.sldprt' }, { path: 'Parts/existing.sldprt' }] })
    const before = vault.state()

    await dragAndDrop(vault.row('existing.sldprt'), vault.row('Parts'))

    // Both files keep their bytes and rows: the move is refused, not resolved by replacing.
    expect(vault.state().disk).toEqual(before.disk)
    expect(vault.state().server).toEqual(before.server)
    expect(vault.toasts().join('\n')).toMatch(/already exists/i)
    await vault.expectStableAcrossReload()
  })
})

describe('drag and drop between the tree and the pane', () => {
  it('moves a file from the pane onto a folder in the explorer tree', async () => {
    vault = await openVault(spec)

    await dragAndDrop(vault.row('a.sldprt'), vault.treeRow('Parts'))

    expect(diskPaths(vault)).toContain('Parts/a.sldprt')
    expect(livePaths(vault)).toContain('Parts/a.sldprt')
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('moves a folder from the tree onto a folder row in the pane', async () => {
    vault = await openVault(spec)

    await dragAndDrop(vault.treeRow('Proj'), vault.row('Empty'))

    await waitForFolderMove(() => expect(diskPaths(vault!)).toContain('Empty/Proj/d.slddrw'))
    expect(livePaths(vault)).toEqual(expect.arrayContaining(['Empty/Proj/d.slddrw', 'Empty/Proj/Sub/c.sldprt']))
    expect(diskPaths(vault)).toEqual(expect.arrayContaining(['Empty/Proj/d.slddrw', 'Empty/Proj/Sub/c.sldprt']))
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('moves a folder onto another folder within the tree', async () => {
    vault = await openVault(spec)

    await dragAndDrop(vault.treeRow('Proj'), vault.treeRow('Parts'))

    await waitForFolderMove(() => expect(diskPaths(vault!)).toContain('Parts/Proj/d.slddrw'))
    expect(livePaths(vault)).toEqual(expect.arrayContaining(['Parts/Proj/d.slddrw', 'Parts/Proj/Sub/c.sldprt']))
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('moves a file dragged from the tree into the folder the pane shows (drop on the background)', async () => {
    vault = await openVault(spec)
    await vault.openFolder('Parts')
    const transfer = new FakeDataTransfer()
    transfer.setData('application/x-plm-files', JSON.stringify(['b.sldprt']))

    const background = screen.getByTestId('pane').querySelector('[data-testid="pane"] > *') as HTMLElement
    await dragAndDrop(null, background, { dataTransfer: transfer, skipDragStart: true })

    expect(livePaths(vault)).toContain('Parts/b.sldprt')
    expect(diskPaths(vault)).toContain('Parts/b.sldprt')
    await vault.expectStableAcrossReload()
  })
})

describe('cut, copy and paste', () => {
  it('cuts a file and pastes it into a folder', async () => {
    vault = await openVault(spec)
    const id = vault.serverRow('a.sldprt').id
    await vault.select(vault.row('a.sldprt'))
    await vault.keyboard('{Control>}x{/Control}')
    await vault.openFolder('Parts')
    await vault.select(vault.row('Parts/existing.sldprt'))
    await vault.keyboard('{Control>}v{/Control}')

    await waitFor(() => expect(vault!.db.row('file', id).file_path).toBe('Parts/a.sldprt'))
    expect(diskPaths(vault)).not.toContain('a.sldprt')
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('copies a synced file: the copy is a new local file, the original is untouched', async () => {
    vault = await openVault(spec)
    await vault.select(vault.row('a.sldprt'))
    await vault.keyboard('{Control>}c{/Control}')
    await vault.openFolder('Parts')
    await vault.select(vault.row('Parts/existing.sldprt'))
    await vault.keyboard('{Control>}v{/Control}')

    await waitFor(() => expect(diskPaths(vault!)).toContain('Parts/a.sldprt'))
    expect(diskPaths(vault)).toContain('a.sldprt')
    // The copy is not on the server until it is checked in, and it is writable.
    expect(livePaths(vault)).not.toContain('Parts/a.sldprt')
    expect(vault.electron.disk.require(vault.absolute('Parts/a.sldprt')).readonly).toBe(false)
    expect(vault.state().store.find((f) => f.path === 'Parts/a.sldprt')?.status).toBe('added')
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('copies a folder into another folder', async () => {
    vault = await openVault(spec)
    await vault.select(vault.row('Proj'))
    await vault.keyboard('{Control>}c{/Control}')
    await vault.openFolder('Parts')
    await vault.select(vault.row('Parts/existing.sldprt'))
    await vault.keyboard('{Control>}v{/Control}')

    await waitFor(() => expect(diskPaths(vault!)).toContain('Parts/Proj/Sub/c.sldprt'))
    expect(diskPaths(vault)).toContain('Proj/Sub/c.sldprt')
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })
})

describe('folders: create and merge', () => {
  it('creates a folder from the empty-area menu, on disk and in the store', async () => {
    vault = await openVault(spec)
    const area = screen.getByTestId('pane').querySelector('table')!.closest('.overflow-auto') as HTMLElement

    await vault.contextMenu(area, 'New Folder')
    const input = await waitFor(() => {
      const el = [...screen.getByTestId('pane').querySelectorAll<HTMLInputElement>('input')].find(
        (i) => i.type === 'text' || !i.type,
      )
      if (!el) throw new Error('no new-folder input')
      return el
    })
    await vault.user.clear(input)
    await vault.user.type(input, 'Fixtures{Enter}')
    await vault.settle()

    await waitFor(() => expect(vault!.state().diskFolders).toContain('Fixtures'))
    expect(vault.state().storeFolders).toContain('Fixtures')
    expect(vault.row('Fixtures')).toBeTruthy()
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('merges a folder dropped onto a folder that already has one of the same name', async () => {
    vault = await openVault({
      files: [{ path: 'Proj/a.sldprt' }, { path: 'Proj/Sub/b.sldprt' }, { path: 'Parts/Proj/c.sldprt' }],
    })

    await dragAndDrop(vault.row('Proj'), vault.row('Parts'))
    await vault.confirm(/^Merge Folders/)

    await waitFor(
      () =>
        expect(livePaths(vault!)).toEqual(['Parts/Proj/a.sldprt', 'Parts/Proj/c.sldprt', 'Parts/Proj/Sub/b.sldprt']),
      { timeout: 5000 },
    )
    expect(diskPaths(vault)).toEqual(['Parts/Proj/a.sldprt', 'Parts/Proj/c.sldprt', 'Parts/Proj/Sub/b.sldprt'])
    await waitFor(() => expect(vault!.state().storeFolders).toEqual(['Parts', 'Parts/Proj', 'Parts/Proj/Sub']))
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })

  it('keeps both copies when the folders being merged hold a file of the same name', async () => {
    vault = await openVault({
      files: [{ path: 'Proj/a.sldprt' }, { path: 'Proj/b.sldprt' }, { path: 'Parts/Proj/a.sldprt' }],
    })
    const before = new Map(vault.state().disk.map((d) => [d.path, d.hash]))

    await dragAndDrop(vault.row('Proj'), vault.row('Parts'))
    await vault.confirm(/^Merge Folders/)

    await waitFor(() => expect(livePaths(vault!)).toContain('Parts/Proj/b.sldprt'), { timeout: 5000 })
    // The file both folders held is still in both, with its own bytes; nothing was replaced.
    const after = new Map(vault.state().disk.map((d) => [d.path, d.hash]))
    expect(after.get('Parts/Proj/a.sldprt')).toBe(before.get('Parts/Proj/a.sldprt'))
    expect(after.get('Proj/a.sldprt')).toBe(before.get('Proj/a.sldprt'))
    expect(livePaths(vault)).toEqual(['Parts/Proj/a.sldprt', 'Parts/Proj/b.sldprt', 'Proj/a.sldprt'])
    expect(vault.electron.disk.recycleBin).toEqual([])
    await waitFor(() => expect(vault!.toasts().join(' | ')).toMatch(/exist in both folders/))
    vault.expectConsistent()
    await vault.expectStableAcrossReload()
  })
})
